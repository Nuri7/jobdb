import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CompanyData {
  company_name: string;
  website?: string;
}

// Default patterns if settings not found (ordered by specificity for scoring)
const DEFAULT_CAREER_PATTERNS = [
  'career', 'careers', 'jobs', 'job', 'vacatures', 'vacature',
  'werken-bij', 'werkenbij', 'werken bij', 'hiring', 'openings',
  'join-us', 'join us', 'work-with-us', 'solliciteren', 'banen'
];
const DEFAULT_MAP_KEYWORDS = 'careers jobs vacatures werkenbij werken-bij solliciteren banen';

// === FILE EXTENSION FILTER (-100 points) ===
// These can never be valid career pages
const NON_PAGE_EXTENSIONS = [
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.zip', '.rar', '.tar', '.gz', '.7z',
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.ico',
  '.mp4', '.mp3', '.wav', '.avi', '.mov', '.webm'
];

// === SUBDOMAIN PENALTIES (-40 points) ===
// These subdomains rarely contain actual career pages
const NON_CAREER_SUBDOMAINS = [
  'blog', 'news', 'support', 'help', 'docs', 'wiki',
  'shop', 'store', 'mail', 'api', 'cdn', 'media',
  'static', 'assets', 'images', 'files', 'download'
];

// === GENERIC JOB BOARD DOMAINS (-80 points) ===
// These are job aggregators, not company-specific career pages
const GENERIC_JOB_BOARDS = [
  'nationalevacaturebank.nl',
  'indeed.com', 'indeed.nl',
  'linkedin.com',
  'glassdoor.com', 'glassdoor.nl',
  'monster.com', 'monster.nl',
  'werk.nl',
  'intermediair.nl',
  'jobbird.nl',
  'monsterboard.nl',
  'stepstone.nl',
  'randstad.nl',
  'tempo-team.nl',
  'uitzendbureau.nl',
  'vacatures.nl',
  'werkzoeken.nl',
  'jooble.org',
  'careerjet.nl',
  'neuvoo.nl',
  'adzuna.nl',
];

// High-value path segments that indicate a more specific career page
const SPECIFICITY_BOOSTERS = [
  'vacatures', 'openings', 'positions', 'opportunities', 'listings',
  'open-positions', 'current-openings', 'job-listings', 'alle-vacatures',
  'all-jobs', 'beschikbare-vacatures', 'available-positions'
];

// === FILTER PATH PENALTIES (-25 points each) ===
// These indicate a filtered subset of jobs, not the main listing
const FILTER_PATH_PATTERNS = [
  /EDUCATION_LEVEL/i,
  /EXPERIENCE_LEVEL/i,
  /CONTRACT_TYPE/i,
  /JOB_TYPE/i,
  /LOCATION/i,
  /DEPARTMENT/i,
  /CATEGORY/i,
  /\/type\//i,
  /\/level\//i,
  /\/region\//i,
  /\/team\//i,
  /\/PHD$/i,
  /\/WO$/i,
  /\/HBO$/i,
  /\/MBO$/i,
  /\/internship$/i,
  /\/stage$/i,
  /\/fulltime$/i,
  /\/parttime$/i,
  /\/junior$/i,
  /\/senior$/i,
  /\/medior$/i,
];

// === SEARCH PAGE PATTERNS (+10 points) ===
// Some orgs use /search for job listings (e.g., AIESEC)
const SEARCH_PAGE_PATTERNS = [
  /\/search$/i,
  /\/search\?/i,
  /\/search\//i,
  /\/find-opportunities/i,
  /\/explore/i,
  /\/opportunity\//i,
];

// Domain patterns that indicate a dedicated career site (+50 points)
const CAREER_DOMAIN_PATTERNS = [
  /werkenbij/i,
  /werken\./i,
  /careers?\./i,
  /jobs?\./i,
  /vacatures?\./i,
  /hiring\./i,
  /carriere/i,
  /join\./i,
];

// URL path penalties - these indicate non-job content (-30 points each)
const GENERIC_CONTENT_PENALTIES = [
  'tips', 'advice', 'blog', 'articles', 'news', 'magazine',
  'how-to', 'guide', 'specially-for', 'students', 'faq',
  'about-us', 'over-ons', 'contact', 'privacy', 'terms',
  'international-students', 'nieuws', 'artikel', 'verhalen'
];

// Heavy penalties for these patterns (-50 points)
const HEAVY_PENALTY_PATTERNS = [
  /how-to-find/i,
  /find-a-job/i,
  /career-tips/i,
  /career-advice/i,
  /job-hunting/i,
  /job-search-tips/i,
  /interview-tips/i,
  /wp-content\/uploads/i,
  /\/uploads\//i,
  /\/files\//i,
  /\/documents\//i,
  /annual-report/i,
];

// === GENERIC COMPANY NAME SUFFIXES ===
// These are ignored when matching company name to domain
const GENERIC_NAME_SUFFIXES = [
  'hogeschool', 'universiteit', 'university', 'college',
  'bv', 'b.v.', 'nv', 'n.v.', 'holding', 'group', 'groep',
  'nederland', 'netherlands', 'international', 'europe',
  'services', 'solutions', 'consulting', 'partners'
];

/**
 * Extract meaningful company identifiers from a company name.
 * E.g., "Avans Hogeschool" → ["avans", "avanshogeschool"]
 *       "ABN AMRO" → ["abn", "abnamro"]
 *       "a.s.r." → ["asr"]
 */
function extractCompanyIdentifiers(companyName: string): string[] {
  const nameLower = companyName.toLowerCase();
  
  // Remove special characters and normalize
  const normalized = nameLower.replace(/[.\-']/g, '').replace(/\s+/g, ' ').trim();
  
  // Split into words
  const words = normalized.split(' ');
  
  // Filter out generic suffixes to find meaningful words
  const meaningfulWords = words.filter(word => 
    word.length > 1 && !GENERIC_NAME_SUFFIXES.includes(word)
  );
  
  const identifiers: string[] = [];
  
  // Add the first meaningful word (primary identifier)
  if (meaningfulWords.length > 0) {
    identifiers.push(meaningfulWords[0]);
  }
  
  // Add combined form of all meaningful words
  if (meaningfulWords.length > 1) {
    identifiers.push(meaningfulWords.join(''));
  }
  
  // Add all meaningful words combined (for company names like "ABN AMRO")
  if (words.length > 1) {
    identifiers.push(words.join(''));
  }
  
  // Handle special cases like "a.s.r." → "asr"
  const compactName = nameLower.replace(/[.\-'\s]/g, '');
  if (compactName.length >= 2 && !identifiers.includes(compactName)) {
    identifiers.push(compactName);
  }
  
  console.log(`Company identifiers for "${companyName}":`, identifiers);
  return identifiers;
}

/**
 * Check if a domain contains the company name or a recognizable variation.
 * Used to validate that a career domain actually belongs to the company.
 */
function domainMatchesCompany(domain: string, companyName: string): boolean {
  const domainLower = domain.toLowerCase().replace(/[.\-]/g, '');
  const identifiers = extractCompanyIdentifiers(companyName);
  
  for (const identifier of identifiers) {
    if (domainLower.includes(identifier)) {
      console.log(`Domain "${domain}" matches company "${companyName}" via identifier "${identifier}"`);
      return true;
    }
  }
  
  console.log(`Domain "${domain}" does NOT match company "${companyName}"`);
  return false;
}

// Content validation keywords - if found on page, confirms it's a job listings page
const JOB_PAGE_INDICATORS = [
  'apply', 'solliciteer', 'solliciteren', 'vacancy', 'vacature',
  'position', 'functie', 'location', 'locatie', 'department',
  'afdeling', 'full-time', 'part-time', 'fulltime', 'parttime'
];

// Non-job page indicators - if found AND no job listings, fail validation
const NON_JOB_INDICATORS = [
  'career tips', 'job hunting advice', 'how to find a job',
  'internship guide', 'career advice', 'interview tips',
  'cv tips', 'resume tips', 'sollicitatietips', 'tips voor',
  'how to apply', 'advice for', 'guide to finding'
];

async function getCareerPageSettings(supabase: any): Promise<{ patterns: string[]; mapKeywords: string }> {
  try {
    const { data, error } = await supabase
      .from('scraper_settings')
      .select('setting_key, setting_value')
      .in('setting_key', ['career_page_url_patterns', 'career_page_map_keywords']);

    if (error) {
      console.error('Error fetching career page settings:', error);
      return { patterns: DEFAULT_CAREER_PATTERNS, mapKeywords: DEFAULT_MAP_KEYWORDS };
    }

    let patterns = DEFAULT_CAREER_PATTERNS;
    let mapKeywords = DEFAULT_MAP_KEYWORDS;

    for (const setting of data || []) {
      if (setting.setting_key === 'career_page_url_patterns' && Array.isArray(setting.setting_value)) {
        patterns = setting.setting_value;
      }
      if (setting.setting_key === 'career_page_map_keywords' && typeof setting.setting_value === 'string') {
        mapKeywords = setting.setting_value;
      }
    }

    console.log('Loaded career page settings:', { patternsCount: patterns.length, mapKeywords });
    return { patterns, mapKeywords };
  } catch (error) {
    console.error('Error in getCareerPageSettings:', error);
    return { patterns: DEFAULT_CAREER_PATTERNS, mapKeywords: DEFAULT_MAP_KEYWORDS };
  }
}

function createPatternRegexes(patterns: string[]): RegExp[] {
  return patterns.map(pattern => {
    // Escape special regex characters except for common variations
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Replace spaces and hyphens with flexible matcher
    const flexible = escaped.replace(/[\s-]/g, '.?');
    return new RegExp(flexible, 'i');
  });
}

/**
 * Score a URL based on how likely it is to be a specific job listings page.
 * Higher score = more specific career page.
 * @param companyName - Optional company name for domain validation scoring
 */
function scoreCareerUrl(url: string, careerPatterns: RegExp[], companyName?: string): number {
  const urlLower = url.toLowerCase();
  let score = 0;

  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    const pathname = urlObj.pathname.toLowerCase();

    // === FILE EXTENSION FILTER (-100 points) ===
    // Check if URL ends with a non-page extension
    for (const ext of NON_PAGE_EXTENSIONS) {
      if (urlLower.endsWith(ext)) {
        score -= 100;
        console.log(`  -100 points for non-page extension: ${ext}`);
        // Don't return early - let other penalties stack too
        break;
      }
    }

    // === SUBDOMAIN PENALTIES (-40 points) ===
    const hostParts = hostname.split('.');
    if (hostParts.length >= 2) {
      const subdomain = hostParts[0];
      if (NON_CAREER_SUBDOMAINS.includes(subdomain)) {
        score -= 40;
        console.log(`  -40 points for non-career subdomain: ${subdomain}`);
      }
    }

    // === GENERIC JOB BOARD PENALTY (-80 points) ===
    // These are aggregator sites, not company-specific career pages
    for (const jobBoard of GENERIC_JOB_BOARDS) {
      if (hostname.includes(jobBoard) || hostname.endsWith(jobBoard)) {
        score -= 80;
        console.log(`  -80 points for generic job board: ${jobBoard}`);
        break;
      }
    }

    // === DOMAIN-LEVEL CAREER DETECTION (+50 points, but -60 if doesn't match company) ===
    let hasDedicatedCareerDomain = false;
    for (const pattern of CAREER_DOMAIN_PATTERNS) {
      if (pattern.test(hostname)) {
        hasDedicatedCareerDomain = true;
        score += 50;
        console.log(`  +50 points for career domain pattern: ${hostname}`);
        break; // Only count once
      }
    }

    // === COMPANY NAME VALIDATION FOR CAREER DOMAINS (-60 points if mismatch) ===
    if (hasDedicatedCareerDomain && companyName) {
      if (!domainMatchesCompany(hostname, companyName)) {
        score -= 60;
        console.log(`  -60 points for career domain not matching company "${companyName}"`);
      }
    }

    // === DUTCH CAREER DOMAIN BONUS (+30 points) ===
    if (hostname.endsWith('.nl') && (/werkenbij|werken|vacature|carriere/i.test(hostname))) {
      score += 30;
      console.log(`  +30 points for Dutch career domain: ${hostname}`);
    }

    // === HEAVY PENALTIES (-50 points each) ===
    for (const pattern of HEAVY_PENALTY_PATTERNS) {
      if (pattern.test(pathname) || pattern.test(urlLower)) {
        score -= 50;
        console.log(`  -50 points for heavy penalty pattern: ${pattern}`);
      }
    }

    // === GENERIC CONTENT PENALTIES (-30 points each) ===
    const pathSegments = pathname.split('/').filter(s => s.length > 0);
    for (const segment of pathSegments) {
      for (const penalty of GENERIC_CONTENT_PENALTIES) {
        if (segment.includes(penalty)) {
          score -= 30;
          console.log(`  -30 points for generic content: ${penalty} in ${segment}`);
        }
      }
    }

    // === SEARCH PAGE PATTERNS (+10 points) ===
    for (const pattern of SEARCH_PAGE_PATTERNS) {
      if (pattern.test(pathname)) {
        score += 10;
        console.log(`  +10 points for search/opportunity page pattern: ${pathname}`);
        break;
      }
    }

    // === BASE CAREER PATTERN MATCHING ===
    const matchedPatterns = careerPatterns.filter(pattern => pattern.test(url));
    if (matchedPatterns.length > 0) {
      score += matchedPatterns.length * 10; // 10 points per pattern match
    }

    // === SPECIFICITY BOOSTERS (+25 points each) ===
    for (const booster of SPECIFICITY_BOOSTERS) {
      if (urlLower.includes(booster)) {
        score += 25;
      }
    }

    // === FILTER PATH PENALTIES (-25 points each) ===
    // Penalize URLs that look like filtered subsets of job listings
    for (const pattern of FILTER_PATH_PATTERNS) {
      if (pattern.test(pathname)) {
        score -= 25;
        console.log(`  -25 points for filter path pattern: ${pattern}`);
      }
    }

    // === PATH DEPTH BONUS (up to 20 points) ===
    // Filter out segments that look like filter parameters (uppercase with underscores)
    const meaningfulSegments = pathSegments.filter(segment => {
      const segmentUpper = segment.toUpperCase();
      // Skip if it looks like a filter parameter (e.g., EDUCATION_LEVEL, PHD)
      if (/^[A-Z_]+$/.test(segmentUpper) && segment.length > 2) {
        return false;
      }
      return true;
    });
    score += Math.min(meaningfulSegments.length * 5, 20);

    // === MAIN LISTING PAGE BONUS (+15 points) ===
    // Prefer URLs that end with the main career listing path (not filtered)
    if (/\/(vacatures|jobs|careers|openings|positions)\/?$/i.test(pathname)) {
      score += 15;
      console.log(`  +15 points for main listing page (ends with vacatures/jobs/careers)`);
    }

    // === GENERIC LANDING PAGE PENALTY ===
    if (urlLower.endsWith('/werken-bij') || urlLower.endsWith('/careers') || urlLower.endsWith('/jobs')) {
      score -= 5;
    }

    // === COMPREHENSIVE LIST BONUS (+15 points) ===
    if (/\b(all|alle|overview|overzicht)\b/i.test(urlLower)) {
      score += 15;
    }

  } catch (error) {
    console.error(`Error parsing URL ${url}:`, error);
    return -999; // Return very low score for unparseable URLs
  }

  return score;
}

/**
 * Validate that a page actually contains job listings by scraping and checking content.
 * @param url - URL to validate
 * @param apiKey - Firecrawl API key
 * @param isDedicatedCareerDomain - If true, use more lenient validation
 */
async function validateCareerPage(url: string, apiKey: string, isDedicatedCareerDomain: boolean = false): Promise<boolean> {
  try {
    console.log(`Validating career page content: ${url} (dedicated: ${isDedicatedCareerDomain})`);
    
    const scrapeResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url,
        formats: ['markdown'],
        onlyMainContent: true,
        waitFor: 5000, // Increased wait for JS-heavy sites
      }),
    });

    if (!scrapeResponse.ok) {
      console.log(`Scrape failed for validation: ${scrapeResponse.status}`);
      // For dedicated career domains, assume valid if scrape fails
      return isDedicatedCareerDomain;
    }

    const scrapeData = await scrapeResponse.json();
    const content = (scrapeData.data?.markdown || scrapeData.markdown || '').toLowerCase();

    if (!content || content.length < 100) {
      console.log('Page has very little content, might not be a job page');
      // For dedicated career domains with /vacatures path, assume valid
      if (isDedicatedCareerDomain && url.includes('vacatures')) {
        console.log('Assuming valid due to dedicated domain + vacatures path');
        return true;
      }
      return false;
    }

    // === CHECK FOR NON-JOB INDICATORS (advice/tips pages) ===
    let nonJobIndicatorCount = 0;
    for (const indicator of NON_JOB_INDICATORS) {
      if (content.includes(indicator.toLowerCase())) {
        nonJobIndicatorCount++;
      }
    }

    // Count job-related indicators
    let indicatorCount = 0;
    for (const indicator of JOB_PAGE_INDICATORS) {
      if (content.includes(indicator.toLowerCase())) {
        indicatorCount++;
      }
    }

    // Also check for common job listing patterns
    const hasJobListStructure = 
      /\b(vacature|job|position|functie)\s*[:|-]/i.test(content) ||
      content.includes('solliciteer') ||
      content.includes('apply now') ||
      /\d+\s*(vacatures|jobs|positions)/i.test(content);

    // Check if URL itself suggests job listings
    const urlSuggestsJobs = /vacatures|jobs|positions|openings|careers/i.test(url);

    // If many non-job indicators and few job indicators, this is likely an advice page
    if (nonJobIndicatorCount >= 2 && indicatorCount < 3 && !hasJobListStructure) {
      console.log(`Page appears to be advice/tips content (${nonJobIndicatorCount} non-job indicators, ${indicatorCount} job indicators)`);
      return false;
    }

    // More lenient for dedicated career domains
    const requiredIndicators = isDedicatedCareerDomain ? 1 : 3;
    const isValid = indicatorCount >= requiredIndicators || hasJobListStructure || (isDedicatedCareerDomain && urlSuggestsJobs);
    console.log(`Page validation: ${indicatorCount} indicators found, hasStructure: ${hasJobListStructure}, nonJobIndicators: ${nonJobIndicatorCount}, urlSuggestsJobs: ${urlSuggestsJobs}, valid: ${isValid}`);
    
    return isValid;
  } catch (error) {
    console.error('Error validating career page:', error);
    return isDedicatedCareerDomain; // For dedicated domains, assume valid on error
  }
}

/**
 * Find the best career URL from a list of candidates using scoring and validation.
 */
async function findBestCareerUrl(
  urls: string[], 
  careerPatterns: RegExp[], 
  apiKey: string,
  companyName: string
): Promise<string | null> {
  // Pre-filter: remove URLs with non-page extensions before scoring
  const filteredUrls = urls.filter(url => {
    const urlLower = url.toLowerCase();
    return !NON_PAGE_EXTENSIONS.some(ext => urlLower.endsWith(ext));
  });

  console.log(`Pre-filtered ${urls.length - filteredUrls.length} non-page URLs, scoring ${filteredUrls.length} URLs for ${companyName}...`);

  // Score all URLs with company name for domain validation
  const scoredUrls = filteredUrls
    .map(url => {
      const score = scoreCareerUrl(url, careerPatterns, companyName);
      return { url, score };
    })
    .filter(item => item.score > -50) // Filter out heavily penalized URLs
    .sort((a, b) => b.score - a.score);

  console.log(`Scored ${scoredUrls.length} career URLs for ${companyName}:`, 
    scoredUrls.slice(0, 5).map(s => `${s.url} (${s.score})`));

  if (scoredUrls.length === 0) {
    // If all scores are very negative, check original list
    const allScored = filteredUrls
      .map(url => ({ url, score: scoreCareerUrl(url, careerPatterns, companyName) }))
      .sort((a, b) => b.score - a.score);
    
    if (allScored.length > 0 && allScored[0].score > -100) {
      console.log(`No good scores, using best available: ${allScored[0].url} (${allScored[0].score})`);
      return allScored[0].url;
    }
    return null;
  }

  // Try top candidates with validation
  for (const { url, score } of scoredUrls.slice(0, 3)) {
    console.log(`Trying candidate URL (score ${score}): ${url}`);
    
    // For high-scoring URLs, validate the content
    if (score >= 30) {
      const isValid = await validateCareerPage(url, apiKey);
      if (isValid) {
        console.log(`Validated career page: ${url}`);
        return url;
      }
      console.log(`Page failed validation, trying next candidate`);
    } else {
      // Lower scoring URLs, accept without validation
      return url;
    }
  }

  // If all top candidates failed validation, return the highest scored one anyway
  return scoredUrls[0].url;
}

/**
 * Search for dedicated career domains using "werkenbij" pattern
 * Returns the best career URL, trying /vacatures path on career domains first
 */
async function searchDedicatedCareerDomain(
  companyName: string,
  apiKey: string,
  careerPatterns: RegExp[]
): Promise<{ url: string; score: number } | null> {
  // Clean company name for search - remove common suffixes
  const cleanName = companyName
    .replace(/\s*(b\.?v\.?|n\.?v\.?|holding|group|nederland)$/i, '')
    .trim();

  // Search specifically for dedicated career domains
  const searchQuery = `"werkenbij${cleanName.replace(/\s+/g, '')}" OR "werken bij ${cleanName}" site:.nl vacatures`;
  
  console.log(`Searching for dedicated career domain: ${searchQuery}`);

  try {
    const searchResponse = await fetch('https://api.firecrawl.dev/v1/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: searchQuery,
        limit: 10,
        lang: 'nl',
        country: 'nl',
      }),
    });

    if (!searchResponse.ok) {
      console.log(`Dedicated domain search failed: ${searchResponse.status}`);
      return null;
    }

    const searchData = await searchResponse.json();

    if (!searchData.success || !searchData.data?.length) {
      console.log('No results from dedicated domain search');
      return null;
    }

    // Extract unique career domains from results
    const urls = searchData.data.map((r: { url: string }) => r.url);
    const careerDomains = new Set<string>();
    
    for (const url of urls) {
      try {
        const urlObj = new URL(url);
        const hostname = urlObj.hostname.toLowerCase();
        // Check if this is a dedicated career domain AND matches the company name
        if (CAREER_DOMAIN_PATTERNS.some(p => p.test(hostname))) {
          if (domainMatchesCompany(hostname, companyName)) {
            careerDomains.add(hostname);
          } else {
            console.log(`Skipping career domain ${hostname} - doesn't match company: ${companyName}`);
          }
        }
      } catch {
        continue;
      }
    }

    console.log('Found career domains:', Array.from(careerDomains));

    // For each career domain, try to find the /vacatures page directly
    for (const domain of careerDomains) {
      const vacaturesUrl = `https://${domain}/vacatures`;
      console.log(`Trying direct vacatures URL: ${vacaturesUrl}`);
      
      // Check if this URL works and has job listings (use lenient validation for dedicated domains)
      const isValid = await validateCareerPage(vacaturesUrl, apiKey, true);
      if (isValid) {
        const score = scoreCareerUrl(vacaturesUrl, careerPatterns, companyName);
        console.log(`Found valid vacatures page: ${vacaturesUrl} (score: ${score})`);
        return { url: vacaturesUrl, score };
      }

      // Also try common variations
      const variations = [
        `https://${domain}/vacatures/`,
        `https://${domain}/jobs`,
        `https://${domain}/alle-vacatures`,
        `https://${domain}/`,
      ];

      for (const variation of variations) {
        const varIsValid = await validateCareerPage(variation, apiKey, true);
        if (varIsValid) {
          const score = scoreCareerUrl(variation, careerPatterns, companyName);
          console.log(`Found valid career page variation: ${variation} (score: ${score})`);
          return { url: variation, score };
        }
      }
    }

    // Fallback: score original results and return best (with company name validation)
    const scoredUrls = urls
      .map((url: string) => ({ url, score: scoreCareerUrl(url, careerPatterns, companyName) }))
      .sort((a: { score: number }, b: { score: number }) => b.score - a.score);

    console.log('Dedicated domain search results (fallback):', scoredUrls.slice(0, 3));

    if (scoredUrls.length > 0 && scoredUrls[0].score >= 50) {
      return scoredUrls[0];
    }

    return null;
  } catch (error) {
    console.error('Error in dedicated domain search:', error);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { companies } = await req.json() as { companies: CompanyData[] };

    if (!companies || !Array.isArray(companies)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Companies array is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!apiKey) {
      console.error('FIRECRAWL_API_KEY not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'Firecrawl connector not configured. Please connect Firecrawl in Settings.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client to fetch settings
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch configurable settings
    const { patterns, mapKeywords } = await getCareerPageSettings(supabase);
    const careerPatterns = createPatternRegexes(patterns);

    console.log(`Finding career pages for ${companies.length} companies with ${careerPatterns.length} patterns`);

    const results: { company_name: string; career_url: string | null; score?: number; error?: string }[] = [];

    for (const company of companies) {
      try {
        console.log(`\n=== Processing ${company.company_name} ===`);

        // STEP 1: Try to find a dedicated career domain first (werkenbij*.nl, careers.*, etc.)
        const dedicatedDomain = await searchDedicatedCareerDomain(
          company.company_name,
          apiKey,
          careerPatterns
        );

        if (dedicatedDomain) {
          // searchDedicatedCareerDomain already validates, so we can use the result directly
          console.log(`Found valid dedicated career domain for ${company.company_name}: ${dedicatedDomain.url} (score: ${dedicatedDomain.score})`);
          results.push({ 
            company_name: company.company_name, 
            career_url: dedicatedDomain.url, 
            score: dedicatedDomain.score 
          });
          continue;
        }

        // STEP 2: If company has a website, try to find career page via map API
        if (company.website) {
          let websiteUrl = company.website.trim();
          if (!websiteUrl.startsWith('http://') && !websiteUrl.startsWith('https://')) {
            websiteUrl = `https://${websiteUrl}`;
          }

          console.log(`Mapping ${company.company_name} website: ${websiteUrl}`);

          // Use Firecrawl map to find career-related URLs with higher limit for better candidates
          const mapResponse = await fetch('https://api.firecrawl.dev/v1/map', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              url: websiteUrl,
              search: mapKeywords,
              limit: 50,
              includeSubdomains: true,
            }),
          });

          if (mapResponse.ok) {
            const mapData = await mapResponse.json();
            
            if (mapData.success && mapData.links?.length > 0) {
              // Find the best career URL using scoring and validation
              const bestUrl = await findBestCareerUrl(
                mapData.links, 
                careerPatterns, 
                apiKey, 
                company.company_name
              );

              if (bestUrl) {
                const score = scoreCareerUrl(bestUrl, careerPatterns);
                console.log(`Found best career page for ${company.company_name}: ${bestUrl} (score: ${score})`);
                results.push({ company_name: company.company_name, career_url: bestUrl, score });
                continue;
              }
            }
          } else {
            console.error(`Map API failed for ${company.company_name}:`, await mapResponse.text());
          }

          // STEP 3: Fallback - Try "werken bij + company name" search
          console.log(`Trying "werken bij" search for ${company.company_name}`);
          
          const werkenBijSearchResponse = await fetch('https://api.firecrawl.dev/v1/search', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              query: `werken bij ${company.company_name} vacatures`,
              limit: 10,
              lang: 'nl',
              country: 'nl',
            }),
          });

          if (werkenBijSearchResponse.ok) {
            const searchData = await werkenBijSearchResponse.json();

            if (searchData.success && searchData.data?.length > 0) {
              const urls = searchData.data.map((result: { url: string }) => result.url);
              const bestUrl = await findBestCareerUrl(urls, careerPatterns, apiKey, company.company_name);

              if (bestUrl) {
                const score = scoreCareerUrl(bestUrl, careerPatterns);
                console.log(`Found career page via "werken bij" search for ${company.company_name}: ${bestUrl} (score: ${score})`);
                results.push({ company_name: company.company_name, career_url: bestUrl, score });
                continue;
              }

              // Use first search result if no pattern match
              console.log(`Using first "werken bij" result for ${company.company_name}: ${searchData.data[0].url}`);
              results.push({ company_name: company.company_name, career_url: searchData.data[0].url, score: 5 });
              continue;
            }
          }

          // Final fallback: just use the website URL
          console.log(`Using website as career URL for ${company.company_name}: ${websiteUrl}`);
          results.push({ company_name: company.company_name, career_url: websiteUrl, score: 0 });
        } else {
          // No website, try searching for career page
          console.log(`Searching for ${company.company_name} career page`);

          // Try "werken bij" search first for Dutch companies
          const werkenBijResponse = await fetch('https://api.firecrawl.dev/v1/search', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              query: `werken bij ${company.company_name} vacatures`,
              limit: 10,
              lang: 'nl',
              country: 'nl',
            }),
          });

          if (werkenBijResponse.ok) {
            const searchData = await werkenBijResponse.json();

            if (searchData.success && searchData.data?.length > 0) {
              const urls = searchData.data.map((result: { url: string }) => result.url);
              const bestUrl = await findBestCareerUrl(urls, careerPatterns, apiKey, company.company_name);

              if (bestUrl) {
                const score = scoreCareerUrl(bestUrl, careerPatterns);
                console.log(`Found career page via "werken bij" search for ${company.company_name}: ${bestUrl} (score: ${score})`);
                results.push({ company_name: company.company_name, career_url: bestUrl, score });
                continue;
              }

              // Use first result if no pattern match
              console.log(`Using first "werken bij" result for ${company.company_name}: ${searchData.data[0].url}`);
              results.push({ company_name: company.company_name, career_url: searchData.data[0].url, score: 5 });
              continue;
            }
          }

          // Fallback: International English search (for non-Dutch orgs)
          console.log(`Trying international search for ${company.company_name}`);
          const intlSearchResponse = await fetch('https://api.firecrawl.dev/v1/search', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              query: `${company.company_name} careers opportunities apply jobs`,
              limit: 15,
              lang: 'en',
            }),
          });

          if (intlSearchResponse.ok) {
            const searchData = await intlSearchResponse.json();

            if (searchData.success && searchData.data?.length > 0) {
              // Find the best career URL from search results
              const urls = searchData.data.map((result: { url: string }) => result.url);
              const bestUrl = await findBestCareerUrl(urls, careerPatterns, apiKey, company.company_name);

              if (bestUrl) {
                const score = scoreCareerUrl(bestUrl, careerPatterns);
                console.log(`Found career page via international search for ${company.company_name}: ${bestUrl} (score: ${score})`);
                results.push({ company_name: company.company_name, career_url: bestUrl, score });
                continue;
              }

              // Just use first result if no good match
              console.log(`Using first international search result for ${company.company_name}: ${searchData.data[0].url}`);
              results.push({ company_name: company.company_name, career_url: searchData.data[0].url, score: 0 });
              continue;
            }
          }

          console.log(`No career page found for ${company.company_name}`);
          results.push({ company_name: company.company_name, career_url: null, error: 'No career page found' });
        }
      } catch (error) {
        console.error(`Error finding career page for ${company.company_name}:`, error);
        results.push({ 
          company_name: company.company_name, 
          career_url: company.website || null, 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
      }
    }

    return new Response(
      JSON.stringify({ success: true, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in find-career-page:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
