import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface JobData {
  job_title: string;
  job_url: string;
  location?: string;
  employment_type?: string;
  department?: string;
  description?: string;
  is_remote?: boolean;
  is_internship?: boolean;
  experience_level?: string;
  salary_range?: string;
}

interface ScrapeResult {
  links: string[];
  markdown: string;
  html: string;
}

// Helper to update progress in database
async function updateProgress(
  supabase: any,
  companyId: string,
  phase: string,
  pagesScraped: number,
  jobsFound: number,
  currentPage: string | null
) {
  await supabase
    .from('company_career_sites')
    .update({
      scrape_progress_phase: phase,
      scrape_progress_pages_scraped: pagesScraped,
      scrape_progress_jobs_found: jobsFound,
      scrape_progress_current_page: currentPage,
      crawl_status: phase === 'complete' ? 'completed' : 'pending',
    })
    .eq('id', companyId);
}

// Helper to update scrape history
async function updateHistory(
  supabase: any,
  historyId: string,
  updates: {
    status?: string;
    pages_scraped?: number;
    jobs_found?: number;
    jobs_inserted?: number;
    jobs_removed?: number;
    completed_at?: string;
    error_message?: string;
    skipped_urls?: Array<{ url: string; reason: string }>;
  }
) {
  await supabase
    .from('scrape_history')
    .update(updates)
    .eq('id', historyId);
}

// Helper to fetch scraper settings from database
async function getScraperSettings(supabase: any): Promise<Record<string, any>> {
  const defaultExtractionPrompt = `Extract job details from this career page content. Look for:

1. **Job Title**: The main position title, clean of company names and special characters
2. **Location**: City name (especially Dutch cities like Amsterdam, Rotterdam, Utrecht, Nijmegen, etc.). Check the URL path for city names if not in content.
3. **Employment Type**: Full-time, Part-time, or Contract
4. **Remote/Hybrid**: Is remote or hybrid work mentioned?
5. **Department**: Team or department name if mentioned
6. **Experience Level**: Junior, Medior, Senior, Principal, or years of experience
7. **Salary Range**: Any salary or compensation information (look for € amounts)
8. **Internship**: Is this an internship, traineeship, or student position?

Return structured data with these fields. For location, prioritize Dutch city names found in content or URL.`;

  const defaults: Record<string, any> = {
    max_pages: 20,
    max_jobs: 150,
    wait_time: 3000,
    extraction_prompt: defaultExtractionPrompt,
    job_url_patterns: ['job', 'vacanc', 'position', 'opening', 'vacature', 'werk'],
    excluded_domains: ['linkedin.com', 'facebook.com', 'twitter.com', 'instagram.com'],
    excluded_url_patterns: ['/locations', '/career-types', '/about', '/contact', '/teams', '/departments', '/benefits', '/culture', '/events', '/news', '/blog'],
    required_content_keywords: ['apply', 'sollicit', 'submit', 'responsibilities', 'requirements', 'qualifications', 'experience', 'skills'],
    location_keywords: ['amsterdam', 'rotterdam', 'utrecht', 'the hague', 'eindhoven', 'den haag', 'leiden', 'delft', 'groningen', 'maastricht', 'nijmegen', 'arnhem', 'breda', 'tilburg', 'almere', 'enschede', 'haarlem', 'amersfoort', 'apeldoorn', 'zwolle', 'dordrecht', 'zoetermeer', 'deventer', 'hilversum', 'alkmaar', 'venlo', 'leeuwarden', 'heerlen', 'helmond', 'oss', 'amstelveen', 'schiphol', 'hoofddorp'],
    remote_keywords: ['remote', 'thuiswerk', 'hybrid', 'work from home', 'wfh'],
    location_patterns: ['location', 'plaats', 'locatie', 'city', 'standort'],
    salary_patterns: ['salary', 'salaris', 'compensation', 'loon', 'vergoeding'],
    internship_title_keywords: ['internship', 'intern', 'stage', 'stagiair', 'werkstudent', 'traineeship'],
    experience_level_keywords: {
      internship: ['intern', 'stage', 'trainee', 'werkstudent'],
      junior: ['junior', 'entry-level', 'starter', 'graduate'],
      medior: ['medior', 'mid-level', 'regular'],
      senior: ['senior', 'experienced', 'lead'],
      principal: ['principal', 'staff', 'architect', 'expert']
    },
    employment_type_keywords: {
      fulltime: ['full-time', 'full time', 'fulltime'],
      parttime: ['part-time', 'part time', 'parttime'],
      contract: ['contract', 'freelance', 'interim', 'temporary']
    }
  };

  try {
    const { data, error } = await supabase
      .from('scraper_settings')
      .select('setting_key, setting_value');

    if (error || !data) {
      console.log('Using default scraper settings');
      return defaults;
    }

    const settings: Record<string, any> = { ...defaults };
    for (const row of data) {
      settings[row.setting_key] = row.setting_value;
    }
    
    console.log('Loaded scraper settings:', settings);
    return settings;
  } catch (err) {
    console.error('Error fetching settings:', err);
    return defaults;
  }
}

// Helper to scrape a single page
async function scrapePage(url: string, apiKey: string, waitTime: number): Promise<ScrapeResult | null> {
  try {
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url,
        formats: ['markdown', 'links', 'html'],
        onlyMainContent: false,
        waitFor: waitTime,
      }),
    });

    const data = await response.json();
    
    if (response.ok && data.success && data.data) {
      return {
        links: data.data.links || [],
        markdown: data.data.markdown || '',
        html: data.data.html || '',
      };
    }
  } catch (err) {
    console.error('Error scraping page:', url, err);
  }
  return null;
}

// Detect pagination links from a page
function findPaginationLinks(links: string[], baseUrl: string, currentUrl: string): string[] {
  const paginationUrls: string[] = [];
  const seenPages = new Set<string>();
  
  for (const link of links) {
    const lowerLink = link.toLowerCase();
    
    // Skip social media, external links, etc.
    if (
      lowerLink.includes('linkedin.com') ||
      lowerLink.includes('facebook.com') ||
      lowerLink.includes('twitter.com') ||
      lowerLink.includes('instagram.com') ||
      !link.startsWith(baseUrl)
    ) {
      continue;
    }
    
    // Detect pagination patterns
    const isPagination = 
      /[?&]page=\d+/i.test(link) ||
      /[?&]p=\d+/i.test(link) ||
      /[?&]offset=\d+/i.test(link) ||
      /[?&]start=\d+/i.test(link) ||
      /\/page\/\d+/i.test(link) ||
      /\/pagina\/\d+/i.test(link) ||
      /[?&]pageNumber=\d+/i.test(link) ||
      /[?&]pg=\d+/i.test(link);
    
    if (isPagination && link !== currentUrl && !seenPages.has(link)) {
      seenPages.add(link);
      paginationUrls.push(link);
    }
  }
  
  // Sort pagination URLs by page number
  paginationUrls.sort((a, b) => {
    const pageA = parseInt(a.match(/(?:page|p|offset|start|pageNumber|pg)[=\/](\d+)/i)?.[1] || '0');
    const pageB = parseInt(b.match(/(?:page|p|offset|start|pageNumber|pg)[=\/](\d+)/i)?.[1] || '0');
    return pageA - pageB;
  });
  
  return paginationUrls;
}

// Built-in exclusions for legal/policy pages (always applied)
const BUILT_IN_EXCLUSIONS = [
  'privacy',
  'cookie',
  'terms',
  'disclaimer',
  'legal',
  'policy',
  'policies',
  'gdpr',
  'imprint',
  'impressum',
  'algemene-voorwaarden',
  'privacyverklaring',
  'cookieverklaring',
  'terms-of-service',
  'terms-and-conditions',
  'terms-of-use',
  'gebruiksvoorwaarden',
  'voorwaarden',
];

// Filter links to find job URLs
function filterJobUrls(links: string[], baseUrl: string, careerUrl: string, excludedUrlPatterns: string[] = []): string[] {
  return links.filter((url: string) => {
    const lowerUrl = url.toLowerCase();
    
    // Must be on same domain
    if (!url.startsWith(baseUrl)) return false;
    
    // Extract just the path for job URL detection (not full URL to avoid domain matches)
    let urlPath: string;
    try {
      urlPath = new URL(url).pathname.toLowerCase();
    } catch {
      urlPath = lowerUrl;
    }
    
    // Include URLs that look like job detail pages (check PATH only, not full URL)
    const isJobUrl = (
      urlPath.includes('job') || 
      urlPath.includes('vacanc') || 
      urlPath.includes('position') ||
      urlPath.includes('opening') ||
      urlPath.includes('vacature') ||
      // Note: Removed 'werk' - too generic, often in domain names like werkenbij*
      /\/\d{5,}/.test(url) || // Job IDs are often long numbers
      /id=\d+/.test(url) ||
      /job[_-]?id/i.test(url)
    );
    
    // Check against excluded URL patterns from settings
    const matchesExcludedPattern = excludedUrlPatterns.some(pattern => 
      lowerUrl.includes(pattern.toLowerCase())
    );
    
    // Check against built-in legal/policy exclusions
    const matchesBuiltInExclusion = BUILT_IN_EXCLUSIONS.some(pattern => 
      lowerUrl.includes(pattern)
    );
    
    // Exclude non-job URLs
    const isExcluded = (
      matchesExcludedPattern ||
      matchesBuiltInExclusion ||
      lowerUrl.includes('linkedin.com') ||
      lowerUrl.includes('facebook.com') ||
      lowerUrl.includes('twitter.com') ||
      lowerUrl.includes('instagram.com') ||
      lowerUrl.includes('.pdf') ||
      lowerUrl.includes('login') ||
      lowerUrl.includes('signup') ||
      lowerUrl.includes('register') ||
      // Exclude pagination/list pages (we want detail pages)
      /[?&]page=\d+/i.test(url) ||
      /[?&]p=\d+/i.test(url) ||
      /\/page\/\d+/i.test(url) ||
      url === careerUrl
    );
    
    // Must look like a job detail page (has ID or specific job path)
    const isDetailPage = (
      /\/\d{4,}/.test(url) || // Contains numeric ID
      /[?&]id=\d+/.test(url) ||
      /-[a-f0-9]{8,}/.test(url) || // UUID-like pattern
      /\/[a-z]+-[a-z]+-[a-z]+/i.test(url) // slug pattern like /senior-developer-amsterdam
    );
    
    return isJobUrl && !isExcluded && isDetailPage;
  });
}

// Legal document signals - if these appear prominently, it's not a job
const LEGAL_DOCUMENT_SIGNALS = [
  'privacy policy',
  'privacyverklaring',
  'privacybeleid',
  'cookie policy',
  'cookiebeleid',
  'terms of service',
  'terms and conditions',
  'algemene voorwaarden',
  'personal data we collect',
  'gegevensbescherming',
  'data protection officer',
  'legal notice',
  'disclaimer',
  'your privacy rights',
  'we use cookies',
  'wij gebruiken cookies',
  'this privacy statement',
  'deze privacyverklaring',
];

// Validate if scraped content is actually a job posting
function isValidJobContent(content: string, requiredKeywords: string[]): boolean {
  const lowerContent = content.toLowerCase();
  
  // Check for legal document signals in the first 500 characters
  // If content starts with or heavily features legal language, reject it
  const contentStart = lowerContent.slice(0, 500);
  const isLegalDocument = LEGAL_DOCUMENT_SIGNALS.some(signal => 
    contentStart.includes(signal)
  );
  
  if (isLegalDocument) {
    console.log('Rejecting page: Detected as legal/policy document');
    return false;
  }
  
  // Must contain at least one of the required keywords
  const hasRequiredKeyword = requiredKeywords.some(keyword => 
    lowerContent.includes(keyword.toLowerCase())
  );
  
  // Additional validation: should have reasonable content length
  const hasReasonableLength = content.length > 200;
  
  return hasRequiredKeyword && hasReasonableLength;
}

// Decode common HTML entities
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)));
}

// Clean job description by removing UI/UX text patterns
function cleanDescription(text: string): string {
  return text
    // Remove markdown images
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    // Remove HTML img tags
    .replace(/<img[^>]*>/gi, '')
    // Remove duplicated button text (Dutch) - handle concatenated versions
    .replace(/Bewaar vacatureBewaar vacature/gi, '')
    .replace(/Solliciteer(Solliciteer)+/gi, '')
    .replace(/\bSolliciteer\b/gi, '')
    .replace(/Opslaan(Opslaan)+/gi, '')
    .replace(/\bOpslaan\b/gi, '')
    .replace(/Verwijder(en)?(Verwijder(en)?)+/gi, '')
    .replace(/\bVerwijder(en)?\b/gi, '')
    .replace(/Bewaar(Bewaar)+/gi, '')
    .replace(/\bBewaar vacature\b/gi, '')
    .replace(/\bBewaar\b/gi, '')
    .replace(/Vacature verwijderen/gi, '')
    // Remove duplicated button text (English)
    .replace(/Apply(\s*now)?(Apply(\s*now)?)+/gi, '')
    .replace(/\bApply(\s+now)?\b/gi, '')
    .replace(/Save(\s*job)?(Save(\s*job)?)+/gi, '')
    .replace(/\bSave(\s+job)?\b/gi, '')
    // Remove "Interested?" / "Are you interested?" prompts and broken fragments
    .replace(/Are you\s+Please via the button below\.?/gi, '')
    .replace(/Interested\??/gi, '')
    .replace(/Are you interested\??/gi, '')
    .replace(/Ge[ïi]nteresseerd\??/gi, '')
    .replace(/Ben je ge[ïi]nteresseerd\??/gi, '')
    .replace(/Please via the button below\.?/gi, '')
    // Remove "Read more" / "Lees meer" prompts
    .replace(/\bLees meer\b/gi, '')
    .replace(/\bRead more\b/gi, '')
    // Remove application process steps (Dutch/English)
    .replace(/Hoe ziet je sollicitatieprocedure eruit\??\s*/gi, '')
    .replace(/\d+\s*(Reageer online op een vacature|Wij beoordelen je cv|We nodigen je uit|Daarna volgt mogelijk|Je ontvangt een aanbieding|Gefeliciteerd met je baan|Welkom bij)[^\n]*/gi, '')
    .replace(/Application process:?[^\n]*/gi, '')
    .replace(/How to apply:?[^\n]*/gi, '')
    // Remove job summary widget text
    .replace(/In het kort/gi, '')
    .replace(/At a glance/gi, '')
    .replace(/Job summary/gi, '')
    // Remove contact person blocks and names
    .replace(/Liever persoonlijk advies\??/gi, '')
    .replace(/Prefer personal advice\??/gi, '')
    .replace(/op deze functie/gi, '')
    .replace(/for this position/gi, '')
    // Remove email addresses anywhere in text
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '')
    // Remove standalone person names (common patterns: First Last on own line)
    .replace(/^[A-Z][a-z]+\s+[A-Z][a-z]+\s*$/gm, '')
    // Remove navigation text (Dutch)
    .replace(/Terug naar\s+\w+(\s+\w+)?/gi, '')
    .replace(/Ga terug/gi, '')
    // Remove navigation text (English)
    .replace(/Back to\s+\w+(\s+\w+)?/gi, '')
    .replace(/Go back/gi, '')
    // Remove status/countdown messages (Dutch)
    .replace(/Deze vacature staat nog \d+ dagen? open\.?/gi, '')
    .replace(/Nog \d+ dagen? geldig\.?/gi, '')
    .replace(/Sluitingsdatum[:\s]+[^\n]+/gi, '')
    // Remove status messages (English)
    .replace(/This (job|position|vacancy) (is|will be) (open|available|closing)[^\n]*/gi, '')
    .replace(/Closing in \d+ days?\.?/gi, '')
    // Remove social sharing prompts (Dutch)
    .replace(/Deel (deze vacature|dit|via)[^\n]*/gi, '')
    .replace(/Delen via[^\n]*/gi, '')
    // Remove social sharing prompts (English)
    .replace(/Share (this job|on|via)[^\n]*/gi, '')
    .replace(/Share with[^\n]*/gi, '')
    // Remove standalone social media names (often from share buttons)
    .replace(/^(LinkedIn|Facebook|Twitter|X|WhatsApp|Email|E-mail|Mail)\s*$/gim, '')
    // Remove print/copy prompts
    .replace(/Print( deze pagina)?/gi, '')
    .replace(/Kopieer link/gi, '')
    .replace(/Copy link/gi, '')
    // Remove favorites prompts
    .replace(/Voeg toe aan favorieten/gi, '')
    .replace(/Add to favorites/gi, '')
    .replace(/Bookmark (this )?job/gi, '')
    // Remove cookie/consent notices (basic patterns)
    .replace(/We (use|gebruiken) cookies[^\n]*/gi, '')
    .replace(/Accept (all )?cookies/gi, '')
    .replace(/Cookie (settings|instellingen)/gi, '')
    // Remove standalone job type/location labels that are just widget artifacts
    .replace(/^(Stage|Internship|Full-time|Part-time|Contract|Remote|Hybrid)\s*$/gim, '')
    .replace(/^(Verenigd Koninkrijk|United Kingdom|Nederland|Netherlands|Amsterdam|Rotterdam|Utrecht)\s*$/gim, '')
    // Clean up resulting whitespace
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\s+$/gm, '')
    .trim();
}

// Extract job data from a job page
function extractJobData(url: string, content: string, metadata: any, settings: Record<string, any>): JobData {
  // Extract job title
  let jobTitle = metadata?.title || '';
  
  // Decode HTML entities first
  jobTitle = decodeHtmlEntities(jobTitle);
  
  // Clean up title - remove company name suffixes
  jobTitle = jobTitle
    .replace(/\s*[-|–—]\s*(ABN AMRO|Adyen|ING|Careers|Jobs|Vacancies|Career|Werken bij).*/gi, '')
    .replace(/\s*at\s+.+$/i, '')
    .replace(/\s*\|\s*.+$/i, '')
    .trim();
  
  // Try to extract from content if title is bad
  if (!jobTitle || jobTitle.length > 150 || jobTitle.length < 5) {
    const h1Match = content.match(/^#\s+(.+?)$/m);
    if (h1Match) {
      jobTitle = decodeHtmlEntities(h1Match[1].trim());
    }
  }
  
  if (!jobTitle || jobTitle.length < 3) {
    jobTitle = 'Job Opening';
  }

  // Extract location using configurable patterns
  let location = 'Netherlands';
  const locationLabelPatterns = settings.location_patterns || ['location', 'plaats', 'locatie', 'city', 'standort'];
  const locationLabelRegex = new RegExp(`(?:${locationLabelPatterns.join('|')})[:\\s]+([^\\n,|]+)`, 'i');
  const locationKeywords = settings.location_keywords || ['amsterdam', 'rotterdam', 'utrecht', 'the hague', 'eindhoven', 'den haag', 'leiden', 'delft', 'groningen', 'maastricht', 'nijmegen', 'arnhem', 'breda', 'tilburg', 'almere', 'enschede', 'haarlem', 'haarlemmermeer', 'amersfoort', 'apeldoorn', 'zaanstad', 'zwolle', 'dordrecht', 'zoetermeer', 'deventer', 'hilversum', 'alkmaar', 'venlo', 'leeuwarden', 'heerlen', 'sittard', 'helmond', 'oss', 'amstelveen', 'schiphol', 'hoofddorp'];
  const locationCityRegex = new RegExp(`\\b(?:${locationKeywords.join('|')})\\b`, 'i');
  
  // First try to find location in content using label patterns
  const locLabelMatch = content.match(locationLabelRegex);
  if (locLabelMatch) {
    location = locLabelMatch[1].trim();
  } else {
    // Try to find city keyword in content
    const locCityMatch = content.match(locationCityRegex);
    if (locCityMatch) {
      location = locCityMatch[0];
    } else {
      // Fallback: extract city from URL path (e.g., /vacancy/8803/job-title-nijmegen)
      const urlPath = url.toLowerCase();
      const urlCityMatch = urlPath.match(locationCityRegex);
      if (urlCityMatch) {
        // Capitalize first letter
        location = urlCityMatch[0].charAt(0).toUpperCase() + urlCityMatch[0].slice(1);
      }
    }
  }

  // Detect employment type using configurable keywords
  const employmentKeywords = settings.employment_type_keywords || {
    fulltime: ['full-time', 'full time', 'fulltime'],
    parttime: ['part-time', 'part time', 'parttime'],
    contract: ['contract', 'freelance', 'interim', 'temporary']
  };
  
  const lowerContent = content.toLowerCase();
  const isFullTime = employmentKeywords.fulltime?.some((kw: string) => lowerContent.includes(kw.toLowerCase())) || false;
  const isPartTime = employmentKeywords.parttime?.some((kw: string) => lowerContent.includes(kw.toLowerCase())) || false;
  const isContract = employmentKeywords.contract?.some((kw: string) => lowerContent.includes(kw.toLowerCase())) || false;
  const employmentType = isContract ? 'Contract' : isPartTime ? 'Part-time' : 'Full-time';

  // Detect remote using configurable keywords
  const remoteKeywords = settings.remote_keywords || ['remote', 'thuiswerk', 'hybrid', 'work from home', 'wfh'];
  const isRemote = remoteKeywords.some((kw: string) => lowerContent.includes(kw.toLowerCase()));

  // Detect internship using configurable title keywords
  const internshipTitleKeywords = settings.internship_title_keywords || ['internship', 'intern', 'stage', 'stagiair', 'werkstudent', 'traineeship'];
  const internshipTitleRegex = new RegExp(`\\b(?:${internshipTitleKeywords.join('|')})\\b`, 'i');
  const titleHasInternship = internshipTitleRegex.test(jobTitle);
  
  // Look for contextual patterns that indicate this specific job is an internship
  const contentHasInternshipContext = 
    /\b(?:this\s+)?(?:is\s+(?:an?\s+)?)?(?:internship|traineeship)\s+(?:position|role|opportunity|program)/i.test(content) ||
    /\b(?:internship|stage)\s+(?:duration|period|length)/i.test(content) ||
    /\b(?:as\s+(?:an?\s+)?)?(?:intern|stagiair|werkstudent)\s+(?:you|je|u)\b/i.test(content) ||
    /\bstudent\s+(?:position|job|role)\b/i.test(content) ||
    /\b(?:seeking|looking for|zoeken)\s+(?:an?\s+)?(?:intern|stagiair|werkstudent)s?\b/i.test(content) ||
    /\b(?:duration|duur)[:\s]+\d+\s*(?:weeks?|weken|months?|maanden)\b/i.test(content);
  
  const isInternship = titleHasInternship || contentHasInternshipContext;

  // Detect department
  let department = null;
  const deptMatch = content.match(/(?:department|team|division|afdeling)[:\s]+([^\n,|]+)/i);
  if (deptMatch) {
    department = deptMatch[1].trim();
  }

  // Extract experience level using configurable keywords
  let experienceLevel: string | null = null;
  
  // Check for explicit experience level labels
  const experiencePatterns = [
    /(?:experience level|seniority|niveau|level)[:\s]+([^\n,|]+)/i,
    /(?:experience|ervaring)[:\s]+(\d+[\+]?\s*(?:years?|jaar|yrs?))/i,
  ];
  
  for (const pattern of experiencePatterns) {
    const expMatch = content.match(pattern);
    if (expMatch) {
      experienceLevel = expMatch[1].trim();
      break;
    }
  }
  
  // If no explicit label, detect from configurable keywords
  if (!experienceLevel) {
    const expKeywords = settings.experience_level_keywords || {
      internship: ['intern', 'stage', 'trainee', 'werkstudent'],
      junior: ['junior', 'entry-level', 'starter', 'graduate'],
      medior: ['medior', 'mid-level', 'regular'],
      senior: ['senior', 'experienced', 'lead'],
      principal: ['principal', 'staff', 'architect', 'expert']
    };
    
    if (expKeywords.internship?.some((kw: string) => lowerContent.includes(kw.toLowerCase()))) {
      experienceLevel = 'Internship';
    } else if (expKeywords.junior?.some((kw: string) => lowerContent.includes(kw.toLowerCase()))) {
      experienceLevel = 'Junior';
    } else if (expKeywords.medior?.some((kw: string) => lowerContent.includes(kw.toLowerCase()))) {
      experienceLevel = 'Medior';
    } else if (expKeywords.senior?.some((kw: string) => lowerContent.includes(kw.toLowerCase()))) {
      experienceLevel = 'Senior';
    } else if (expKeywords.principal?.some((kw: string) => lowerContent.includes(kw.toLowerCase()))) {
      experienceLevel = 'Principal';
    } else if (/\b(?:manager|head of|director|team lead)\b/i.test(content)) {
      experienceLevel = 'Management';
    }
    
    // Also check years of experience mentioned
    const yearsMatch = content.match(/(\d+)[\+]?\s*(?:years?|jaar|yrs?)\s*(?:of\s+)?(?:experience|ervaring|work)/i);
    if (yearsMatch && !experienceLevel) {
      const years = parseInt(yearsMatch[1]);
      if (years <= 1) {
        experienceLevel = 'Junior';
      } else if (years <= 3) {
        experienceLevel = 'Medior';
      } else if (years <= 7) {
        experienceLevel = 'Senior';
      } else {
        experienceLevel = 'Principal';
      }
    }
  }

  // Extract salary range using configurable patterns
  let salaryRange: string | null = null;
  const salaryLabelPatterns = settings.salary_patterns || ['salary', 'salaris', 'compensation', 'loon', 'vergoeding'];
  
  // Build salary regex patterns
  const salaryLabelRegex = new RegExp(`(?:${salaryLabelPatterns.join('|')})[:\\s]+([€$]?\\s*[\\d.,]+(?:\\s*[-–—to]+\\s*[€$]?\\s*[\\d.,]+)?(?:\\s*(?:per\\s+)?(?:year|yr|month|mo|jaar|maand|annually|monthly|p\\.m\\.|p\\.a\\.))?)`, 'i');
  
  const salaryPatternList = [
    salaryLabelRegex,
    // Euro ranges: €50.000 - €70.000, €50k-€70k
    /€\s*([\d.,]+)\s*[kK]?\s*[-–—to]+\s*€?\s*([\d.,]+)\s*[kK]?(?:\s*(?:per\s+)?(?:year|yr|month|mo|jaar|maand|annually|monthly|bruto|gross|p\.m\.|p\.a\.))?/i,
    // Single euro amount with context
    /(?:earn|verdien|starting at|vanaf|tot)\s*€\s*([\d.,]+)(?:\s*[kK])?/i,
    // EUR format
    /EUR\s*([\d.,]+)\s*[-–—to]+\s*([\d.,]+)/i,
    // Salary bands like "Scale 10-12" or "Schaal 10"
    /(?:salary\s*)?(?:scale|schaal)\s*(\d+(?:\s*[-–—]\s*\d+)?)/i,
  ];
  
  for (const pattern of salaryPatternList) {
    const salaryMatch = content.match(pattern);
    if (salaryMatch) {
      // Clean up and format the salary
      let salary = salaryMatch[0];
      // Remove the label prefix
      const salaryLabelCleanRegex = new RegExp(`^(?:${salaryLabelPatterns.join('|')})[:\\s]+`, 'i');
      salary = salary.replace(salaryLabelCleanRegex, '');
      salary = salary.replace(/^(?:earn|verdien|starting at|vanaf|tot)\s*/i, '');
      salaryRange = salary.trim().slice(0, 100);
      break;
    }
  }
  
  // Also look for competitive/market rate mentions
  if (!salaryRange) {
    if (/(?:competitive|marktconform|aantrekkelijk)\s*(?:salary|salaris|compensation)?/i.test(content)) {
      salaryRange = 'Competitive';
    }
  }

  // Override internship detection based on salary - if salary > €1000/month or significant annual, it's not an internship
  let finalIsInternship = isInternship;
  if (isInternship && salaryRange && salaryRange !== 'Competitive') {
    // Extract numeric value from salary
    const salaryNumbers = salaryRange.match(/[\d.,]+/g);
    if (salaryNumbers && salaryNumbers.length > 0) {
      // Take the first number and parse it (removing dots/commas used as thousand separators)
      const firstNumber = salaryNumbers[0].replace(/\./g, '').replace(',', '.');
      const salaryValue = parseFloat(firstNumber);
      
      // If salary is > 1000 (monthly) or > 20000 (annual), it's not an internship
      // Most salaries in €X.XXX format are annual (e.g., €50.000), monthly would be €X.XXX (e.g., €3.500)
      if (salaryValue > 1000) {
        finalIsInternship = false;
        console.log(`Overriding internship=false due to salary: ${salaryRange} (parsed: ${salaryValue})`);
      }
    }
  }

  return {
    job_title: jobTitle.slice(0, 200),
    job_url: url,
    location: location.slice(0, 100),
    employment_type: employmentType,
    department: department?.slice(0, 100),
    description: cleanDescription(content).slice(0, 15000),
    is_remote: isRemote,
    is_internship: finalIsInternship,
    experience_level: experienceLevel?.slice(0, 50) || undefined,
    salary_range: salaryRange || undefined,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let historyId: string | null = null;
  let supabase: any = null;

  try {
    const { companyId, careerUrl } = await req.json();

    const apiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!apiKey) {
      console.error('FIRECRAWL_API_KEY not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'Firecrawl not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    supabase = createClient(supabaseUrl, supabaseKey);

    // Load scraper settings from database
    const settings = await getScraperSettings(supabase);
    const MAX_PAGES = settings.max_pages || 20;
    const MAX_JOBS = settings.max_jobs || 150;
    const WAIT_TIME = settings.wait_time || 3000;
    const EXCLUDED_URL_PATTERNS = settings.excluded_url_patterns || [];
    const REQUIRED_CONTENT_KEYWORDS = settings.required_content_keywords || ['apply', 'sollicit', 'submit', 'responsibilities', 'requirements', 'qualifications'];

    console.log('Starting scrape for:', careerUrl);
    console.log(`Settings: MAX_PAGES=${MAX_PAGES}, MAX_JOBS=${MAX_JOBS}, WAIT_TIME=${WAIT_TIME}`);
    console.log(`Excluded URL patterns: ${EXCLUDED_URL_PATTERNS.length}, Required keywords: ${REQUIRED_CONTENT_KEYWORDS.length}`);
    const baseUrl = new URL(careerUrl).origin;

    // Create history entry
    const { data: historyData, error: historyError } = await supabase
      .from('scrape_history')
      .insert({
        company_career_site_id: companyId,
        career_url: careerUrl,
        status: 'running',
      })
      .select('id')
      .single();

    if (historyError) {
      console.error('Failed to create history entry:', historyError);
    } else {
      historyId = historyData.id;
    }

    // Initialize progress
    await updateProgress(supabase, companyId, 'collecting', 0, 0, careerUrl);

    // Collect all job URLs from all pages
    const allJobUrls = new Set<string>();
    const scrapedPages = new Set<string>();
    const pagesToScrape: string[] = [careerUrl];
    
    let pagesScraped = 0;

    // Phase 1: Collect all job URLs from listing pages (with pagination)
    console.log('Phase 1: Collecting job URLs from listing pages...');
    
    while (pagesToScrape.length > 0 && pagesScraped < MAX_PAGES) {
      const currentUrl = pagesToScrape.shift()!;
      
      if (scrapedPages.has(currentUrl)) continue;
      scrapedPages.add(currentUrl);
      pagesScraped++;
      
      // Update progress
      await updateProgress(supabase, companyId, 'collecting', pagesScraped, allJobUrls.size, currentUrl);
      
      console.log(`Scraping listing page ${pagesScraped}/${MAX_PAGES}: ${currentUrl}`);
      
      const pageData = await scrapePage(currentUrl, apiKey, WAIT_TIME);
      
      if (!pageData) {
        console.log('Failed to scrape page:', currentUrl);
        continue;
      }
      
      // Extract job URLs from this page
      const jobUrls = filterJobUrls(pageData.links, baseUrl, careerUrl, EXCLUDED_URL_PATTERNS);
      console.log(`Found ${jobUrls.length} job URLs on this page`);
      
      for (const url of jobUrls) {
        allJobUrls.add(url);
      }
      
      // Update progress with new job count
      await updateProgress(supabase, companyId, 'collecting', pagesScraped, allJobUrls.size, currentUrl);
      
      // Update history periodically
      if (historyId && pagesScraped % 3 === 0) {
        await updateHistory(supabase, historyId, {
          pages_scraped: pagesScraped,
          jobs_found: allJobUrls.size,
        });
      }
      
      // Find pagination links and add to queue
      const paginationLinks = findPaginationLinks(pageData.links, baseUrl, currentUrl);
      console.log(`Found ${paginationLinks.length} pagination links`);
      
      for (const link of paginationLinks) {
        if (!scrapedPages.has(link) && !pagesToScrape.includes(link)) {
          pagesToScrape.push(link);
        }
      }
    }

    console.log(`Phase 1 complete: Found ${allJobUrls.size} unique job URLs across ${pagesScraped} pages`);

    // Phase 2: Scrape individual job detail pages
    console.log('Phase 2: Scraping individual job pages...');
    await updateProgress(supabase, companyId, 'scraping', pagesScraped, allJobUrls.size, null);
    
    const jobs: JobData[] = [];
    const skippedUrls: Array<{ url: string; reason: string }> = [];
    const jobUrlArray = Array.from(allJobUrls);
    
    for (let i = 0; i < Math.min(jobUrlArray.length, MAX_JOBS); i++) {
      const jobUrl = jobUrlArray[i];
      
      // Update progress every 5 jobs to reduce DB calls
      if (i % 5 === 0) {
        await updateProgress(supabase, companyId, 'scraping', pagesScraped, jobs.length, jobUrl);
        
        // Update history
        if (historyId) {
          await updateHistory(supabase, historyId, {
            pages_scraped: pagesScraped,
            jobs_found: jobs.length,
          });
        }
      }
      
      try {
        console.log(`Scraping job ${i + 1}/${Math.min(jobUrlArray.length, MAX_JOBS)}: ${jobUrl}`);
        
        const jobResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            url: jobUrl,
            formats: ['markdown'],
            onlyMainContent: true,
          }),
        });

        const jobData = await jobResponse.json();
        
        if (jobResponse.ok && jobData.success && jobData.data) {
          const content = jobData.data.markdown || '';
          const metadata = jobData.data.metadata || {};
          
          // Validate that this is actually a job posting
          if (!isValidJobContent(content, REQUIRED_CONTENT_KEYWORDS)) {
            console.log(`Skipping non-job page: ${jobUrl} (missing required keywords)`);
            skippedUrls.push({ url: jobUrl, reason: 'Missing required keywords (apply, requirements, etc.)' });
            continue;
          }
          
          const job = extractJobData(jobUrl, content, metadata, settings);
          jobs.push(job);
        } else {
          skippedUrls.push({ url: jobUrl, reason: 'Failed to scrape page' });
        }
      } catch (err) {
        console.error('Error scraping job URL:', jobUrl, err);
        skippedUrls.push({ url: jobUrl, reason: `Error: ${err instanceof Error ? err.message : 'Unknown error'}` });
      }
    }

    console.log(`Phase 2 complete: Scraped ${jobs.length} job details, skipped ${skippedUrls.length} URLs`);

    // Phase 3: Insert jobs into database
    console.log('Phase 3: Inserting jobs into database...');
    await updateProgress(supabase, companyId, 'inserting', pagesScraped, jobs.length, null);
    
    let insertedCount = 0;
    for (const job of jobs) {
      const { error } = await supabase
        .from('job_opportunities')
        .upsert({
          company_career_site_id: companyId,
          job_title: job.job_title,
          job_url: job.job_url,
          location: job.location,
          employment_type: job.employment_type,
          department: job.department,
          description: job.description,
          is_remote: job.is_remote,
          experience_level: job.experience_level,
          salary_range: job.salary_range,
          scraped_at: new Date().toISOString(),
        }, {
          onConflict: 'job_url',
        });

      if (!error) {
        insertedCount++;
      } else {
        console.error('Insert error:', error);
      }
    }

    // Delete jobs that no longer exist on the career page
    const currentJobUrls = jobs.map(job => job.job_url);
    let jobsRemoved = 0;
    
    if (currentJobUrls.length > 0) {
      const { data: deletedJobs, error: deleteError } = await supabase
        .from('job_opportunities')
        .delete()
        .eq('company_career_site_id', companyId)
        .not('job_url', 'in', `(${currentJobUrls.map(url => `"${url}"`).join(',')})`)
        .select('id');
      
      if (deleteError) {
        console.error('Error deleting stale jobs:', deleteError);
      } else {
        jobsRemoved = deletedJobs?.length || 0;
        console.log(`Deleted ${jobsRemoved} stale jobs that no longer exist`);
      }
    }

    // Mark as complete
    await supabase
      .from('company_career_sites')
      .update({
        crawl_status: 'completed',
        last_crawled_at: new Date().toISOString(),
        jobs_found_count: insertedCount,
        scrape_progress_phase: 'complete',
        scrape_progress_pages_scraped: pagesScraped,
        scrape_progress_jobs_found: insertedCount,
        scrape_progress_current_page: null,
      })
      .eq('id', companyId);

    // Update history as completed
    if (historyId) {
      await updateHistory(supabase, historyId, {
        status: 'completed',
        pages_scraped: pagesScraped,
        jobs_found: jobs.length,
        jobs_inserted: insertedCount,
        jobs_removed: jobsRemoved,
        completed_at: new Date().toISOString(),
        skipped_urls: skippedUrls,
      });
    }

    console.log(`Complete: Inserted ${insertedCount} jobs, removed ${jobsRemoved} stale jobs for company ${companyId}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        jobsFound: allJobUrls.size,
        jobsScraped: jobs.length,
        jobsInserted: insertedCount,
        jobsRemoved: jobsRemoved,
        pagesScraped: pagesScraped,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in scrape-jobs:', error);
    
    // Update history with error
    if (historyId && supabase) {
      await updateHistory(supabase, historyId, {
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
    
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
