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

// High-value path segments that indicate a more specific career page
const SPECIFICITY_BOOSTERS = [
  'vacatures', 'openings', 'positions', 'opportunities', 'listings',
  'open-positions', 'current-openings', 'job-listings', 'alle-vacatures',
  'all-jobs', 'beschikbare-vacatures', 'available-positions'
];

// Content validation keywords - if found on page, confirms it's a job listings page
const JOB_PAGE_INDICATORS = [
  'apply', 'solliciteer', 'solliciteren', 'vacancy', 'vacature',
  'position', 'functie', 'location', 'locatie', 'department',
  'afdeling', 'full-time', 'part-time', 'fulltime', 'parttime'
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
 */
function scoreCareerUrl(url: string, careerPatterns: RegExp[]): number {
  const urlLower = url.toLowerCase();
  let score = 0;

  // Base score: does it match any career pattern?
  const matchedPatterns = careerPatterns.filter(pattern => pattern.test(url));
  if (matchedPatterns.length === 0) return 0;
  
  score += matchedPatterns.length * 10; // 10 points per pattern match

  // Bonus for specificity boosters (e.g., /vacatures, /openings)
  for (const booster of SPECIFICITY_BOOSTERS) {
    if (urlLower.includes(booster)) {
      score += 25;
    }
  }

  // Bonus for deeper paths (more specific pages)
  const pathSegments = new URL(url).pathname.split('/').filter(s => s.length > 0);
  score += Math.min(pathSegments.length * 5, 20); // Up to 20 points for depth

  // Penalty for very generic pages
  if (urlLower.endsWith('/werken-bij') || urlLower.endsWith('/careers') || urlLower.endsWith('/jobs')) {
    // These are good but might just be landing pages, slight reduction
    score -= 5;
  }

  // Bonus if URL contains "all" or "alle" suggesting a comprehensive list
  if (/\b(all|alle|overview|overzicht)\b/i.test(urlLower)) {
    score += 15;
  }

  return score;
}

/**
 * Validate that a page actually contains job listings by scraping and checking content.
 */
async function validateCareerPage(url: string, apiKey: string): Promise<boolean> {
  try {
    console.log(`Validating career page content: ${url}`);
    
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
        waitFor: 2000,
      }),
    });

    if (!scrapeResponse.ok) {
      console.log(`Scrape failed for validation: ${scrapeResponse.status}`);
      return true; // Don't block if scrape fails, assume it's valid
    }

    const scrapeData = await scrapeResponse.json();
    const content = (scrapeData.data?.markdown || scrapeData.markdown || '').toLowerCase();

    if (!content || content.length < 100) {
      console.log('Page has very little content, might not be a job page');
      return false;
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

    const isValid = indicatorCount >= 3 || hasJobListStructure;
    console.log(`Page validation: ${indicatorCount} indicators found, hasStructure: ${hasJobListStructure}, valid: ${isValid}`);
    
    return isValid;
  } catch (error) {
    console.error('Error validating career page:', error);
    return true; // Don't block on validation errors
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
  // Score all URLs
  const scoredUrls = urls
    .map(url => ({ url, score: scoreCareerUrl(url, careerPatterns) }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score);

  console.log(`Scored ${scoredUrls.length} career URLs for ${companyName}:`, 
    scoredUrls.slice(0, 5).map(s => `${s.url} (${s.score})`));

  if (scoredUrls.length === 0) return null;

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
        // If company has a website, try to find career page via map API first
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
              limit: 50, // Increased for better candidate selection
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

          // Fallback: Try "werken bij + company name" search before giving up
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

          // Fallback: English search
          const searchResponse = await fetch('https://api.firecrawl.dev/v1/search', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              query: `${company.company_name} careers jobs Netherlands`,
              limit: 10,
              lang: 'en',
              country: 'nl',
            }),
          });

          if (searchResponse.ok) {
            const searchData = await searchResponse.json();

            if (searchData.success && searchData.data?.length > 0) {
              // Find the best career URL from search results
              const urls = searchData.data.map((result: { url: string }) => result.url);
              const bestUrl = await findBestCareerUrl(urls, careerPatterns, apiKey, company.company_name);

              if (bestUrl) {
                const score = scoreCareerUrl(bestUrl, careerPatterns);
                console.log(`Found career page via search for ${company.company_name}: ${bestUrl} (score: ${score})`);
                results.push({ company_name: company.company_name, career_url: bestUrl, score });
                continue;
              }

              // Just use first result
              console.log(`Using first search result for ${company.company_name}: ${searchData.data[0].url}`);
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
