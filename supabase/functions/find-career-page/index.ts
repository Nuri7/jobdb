import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CompanyData {
  company_name: string;
  website?: string;
}

// Default patterns if settings not found
const DEFAULT_CAREER_PATTERNS = [
  'career', 'careers', 'jobs', 'job', 'vacatures', 'vacature',
  'werken-bij', 'werkenbij', 'werken bij', 'hiring', 'openings',
  'join-us', 'join us', 'work-with-us', 'solliciteren', 'banen'
];
const DEFAULT_MAP_KEYWORDS = 'careers jobs vacatures werkenbij werken-bij solliciteren banen';

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

    const results: { company_name: string; career_url: string | null; error?: string }[] = [];

    for (const company of companies) {
      try {
        // If company has a website, try to find career page via map API first
        if (company.website) {
          let websiteUrl = company.website.trim();
          if (!websiteUrl.startsWith('http://') && !websiteUrl.startsWith('https://')) {
            websiteUrl = `https://${websiteUrl}`;
          }

          console.log(`Mapping ${company.company_name} website: ${websiteUrl}`);

          // Use Firecrawl map to find career-related URLs
          const mapResponse = await fetch('https://api.firecrawl.dev/v1/map', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              url: websiteUrl,
              search: mapKeywords,
              limit: 20,
              includeSubdomains: true,
            }),
          });

          if (mapResponse.ok) {
            const mapData = await mapResponse.json();
            
            if (mapData.success && mapData.links?.length > 0) {
              // Find the best career URL from the results using configurable patterns
              const careerUrl = mapData.links.find((link: string) => 
                careerPatterns.some(pattern => pattern.test(link))
              );

              if (careerUrl) {
                console.log(`Found career page for ${company.company_name}: ${careerUrl}`);
                results.push({ company_name: company.company_name, career_url: careerUrl });
                continue;
              }
            }
          }

          // Fallback: just use the website URL
          console.log(`Using website as career URL for ${company.company_name}: ${websiteUrl}`);
          results.push({ company_name: company.company_name, career_url: websiteUrl });
        } else {
          // No website, try searching for career page
          console.log(`Searching for ${company.company_name} career page`);

          const searchResponse = await fetch('https://api.firecrawl.dev/v1/search', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              query: `${company.company_name} careers jobs vacatures Netherlands`,
              limit: 5,
              lang: 'en',
              country: 'nl',
            }),
          });

          if (searchResponse.ok) {
            const searchData = await searchResponse.json();

            if (searchData.success && searchData.data?.length > 0) {
              // Find the most relevant career URL using configurable patterns
              const careerResult = searchData.data.find((result: { url: string }) =>
                careerPatterns.some(pattern => pattern.test(result.url))
              );

              if (careerResult) {
                console.log(`Found career page via search for ${company.company_name}: ${careerResult.url}`);
                results.push({ company_name: company.company_name, career_url: careerResult.url });
                continue;
              }

              // Just use first result
              console.log(`Using first search result for ${company.company_name}: ${searchData.data[0].url}`);
              results.push({ company_name: company.company_name, career_url: searchData.data[0].url });
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
