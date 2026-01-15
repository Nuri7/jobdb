import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Default search queries (used if no setting found in database)
const DEFAULT_SEARCH_QUERIES = [
  'werkenbij Netherlands careers page',
  'Dutch company careers hiring',
  'Amsterdam tech company jobs',
  'Rotterdam company vacatures',
  'Netherlands startup hiring team',
  'Dutch software company careers',
  'Amsterdam fintech jobs page',
  'Netherlands e-commerce careers',
  'Utrecht company job openings',
  'Eindhoven tech careers page',
  'Den Haag company vacatures',
  'Groningen startup jobs',
  'Leiden biotech careers',
  'Delft engineering company jobs',
  'Breda logistics careers',
  'Tilburg company hiring',
  'Arnhem company vacatures',
  'Netherlands SaaS company careers',
  'Dutch AI company jobs',
  'Amsterdam marketing agency careers',
  'Netherlands consultancy vacatures',
  'Dutch healthcare company jobs',
  'Amsterdam creative agency careers',
  'Netherlands manufacturing company jobs',
  'Dutch renewable energy careers',
  'Amsterdam media company vacatures',
  'Netherlands insurance company jobs',
  'Dutch bank careers page',
  'Amsterdam scale-up hiring',
  'Netherlands unicorn company jobs',
];

// Excluded domains (job boards, aggregators, social media)
const EXCLUDED_DOMAINS = [
  'linkedin.com',
  'indeed.com',
  'indeed.nl',
  'glassdoor.com',
  'glassdoor.nl',
  'monster.com',
  'monster.nl',
  'werkzoeken.nl',
  'nationalevacaturebank.nl',
  'jobbird.com',
  'intermediair.nl',
  'stepstone.nl',
  'randstad.nl',
  'tempo-team.nl',
  'facebook.com',
  'twitter.com',
  'x.com',
  'instagram.com',
  'youtube.com',
  'werkenbij.com', // generic job board
  'jobs.nl',
  'vacatures.nl',
];

function isExcludedDomain(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return EXCLUDED_DOMAINS.some(domain => hostname.includes(domain));
  } catch {
    return false;
  }
}

// Known industry patterns for classification
const INDUSTRY_PATTERNS: Record<string, string[]> = {
  'Technology': ['tech', 'software', 'saas', 'cloud', 'ai', 'data', 'digital'],
  'Fintech': ['fintech', 'payment', 'banking', 'finance', 'insurance'],
  'E-commerce': ['ecommerce', 'e-commerce', 'retail', 'shop', 'marketplace'],
  'Healthcare': ['health', 'medical', 'pharma', 'biotech', 'care'],
  'Travel': ['travel', 'booking', 'hotel', 'tourism', 'airline'],
  'Food & Beverage': ['food', 'beverage', 'restaurant', 'delivery'],
  'Energy': ['energy', 'oil', 'gas', 'solar', 'renewable'],
  'Logistics': ['logistics', 'shipping', 'transport', 'delivery'],
};

function classifyIndustry(text: string): string {
  const lowerText = text.toLowerCase();
  for (const [industry, keywords] of Object.entries(INDUSTRY_PATTERNS)) {
    if (keywords.some(keyword => lowerText.includes(keyword))) {
      return industry;
    }
  }
  return 'Other';
}

function extractCompanyName(title: string, url: string): string | null {
  // Try to extract company name from the title
  // Common patterns: "Careers at Company", "Company - Careers", "Jobs at Company"
  const patterns = [
    /careers?\s+(?:at|@)\s+([^|–\-]+)/i,
    /jobs?\s+(?:at|@)\s+([^|–\-]+)/i,
    /([^|–\-]+?)\s+(?:careers?|jobs?|vacancies|openings)/i,
    /work\s+(?:at|@)\s+([^|–\-]+)/i,
    /join\s+([^|–\-]+)/i,
  ];
  
  for (const pattern of patterns) {
    const match = title.match(pattern);
    if (match && match[1]) {
      const name = match[1].trim().replace(/[|–\-].*/g, '').trim();
      if (name.length >= 2 && name.length <= 50) {
        return name;
      }
    }
  }
  
  // Fallback: try to extract from domain
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;
    // Remove common prefixes and suffixes
    const domain = hostname
      .replace(/^(www\.|careers\.|jobs\.|work\.)/i, '')
      .replace(/\.(com|nl|eu|io|co|org|net)$/i, '')
      .replace(/\./g, ' ');
    
    if (domain.length >= 2 && domain.length <= 30) {
      // Capitalize first letter of each word
      return domain.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    }
  } catch {
    // Invalid URL
  }
  
  return null;
}

function isCareerUrl(url: string): boolean {
  const careerPatterns = [
    /career/i,
    /jobs?/i,
    /vacancies/i,
    /openings/i,
    /hiring/i,
    /werk/i, // Dutch for work
    /vacature/i, // Dutch for vacancy
  ];
  return careerPatterns.some(pattern => pattern.test(url));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { count = 10 } = await req.json();

    const apiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!apiKey) {
      console.error('FIRECRAWL_API_KEY not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'Firecrawl connector not configured. Please connect Firecrawl in Settings.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get existing company URLs to avoid duplicates
    const { data: existingCompanies } = await supabase
      .from('company_career_sites')
      .select('company_name, career_url');
    
    const existingNames = new Set(
      existingCompanies?.map(c => c.company_name.toLowerCase()) || []
    );
    const existingDomains = new Set(
      existingCompanies?.map(c => {
        try {
          return new URL(c.career_url).hostname.toLowerCase();
        } catch {
          return '';
        }
      }) || []
    );

    console.log(`Found ${existingNames.size} existing companies`);

    // Get search queries from settings
    const { data: querySetting } = await supabase
      .from('scraper_settings')
      .select('setting_value')
      .eq('setting_key', 'discovery_search_queries')
      .single();

    const searchQueries: string[] = querySetting?.setting_value || DEFAULT_SEARCH_QUERIES;

    // Get results limit from settings
    const { data: limitSetting } = await supabase
      .from('scraper_settings')
      .select('setting_value')
      .eq('setting_key', 'discovery_results_limit')
      .single();

    const resultsLimit: number = limitSetting?.setting_value || 30;

    // Get target industries from settings
    const { data: industrySetting } = await supabase
      .from('scraper_settings')
      .select('setting_value')
      .eq('setting_key', 'discovery_target_industries')
      .single();

    const targetIndustries: string[] = industrySetting?.setting_value || [];
    console.log('Target industries filter:', targetIndustries.length > 0 ? targetIndustries : 'All industries');

    // Get target country from settings
    const { data: countrySetting } = await supabase
      .from('scraper_settings')
      .select('setting_value')
      .eq('setting_key', 'discovery_country')
      .single();

    const targetCountry: string = countrySetting?.setting_value || 'nl';
    console.log('Target country:', targetCountry);
    
    // Pick a random search query
    const randomQuery = searchQueries[Math.floor(Math.random() * searchQueries.length)];
    console.log('Searching with query:', randomQuery);
    console.log('Results limit:', resultsLimit);

    // Use Firecrawl search API
    const searchResponse = await fetch('https://api.firecrawl.dev/v1/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: randomQuery,
        limit: Math.min(resultsLimit, 100), // Cap at 100
        lang: 'en',
        country: targetCountry,
      }),
    });

    if (!searchResponse.ok) {
      const errorData = await searchResponse.json();
      console.error('Firecrawl search error:', errorData);
      throw new Error(errorData.error || `Search failed with status ${searchResponse.status}`);
    }

    const searchData = await searchResponse.json();
    console.log(`Firecrawl returned ${searchData.data?.length || 0} results`);

    if (!searchData.success || !searchData.data?.length) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          companiesAdded: 0, 
          message: 'No new companies found in search results' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Process search results
    const newCompanies: { name: string; url: string; industry: string }[] = [];

    for (const result of searchData.data) {
      if (newCompanies.length >= count) break;

      const url = result.url;
      const title = result.title || '';
      const description = result.description || '';

      // Skip excluded domains (job boards, social media, etc.)
      if (isExcludedDomain(url)) {
        console.log('Skipping excluded domain:', url);
        continue;
      }

      // Skip if not a career-related URL
      if (!isCareerUrl(url) && !isCareerUrl(title)) {
        console.log('Skipping non-career URL:', url);
        continue;
      }

      // Check if domain already exists
      try {
        const domain = new URL(url).hostname.toLowerCase();
        if (existingDomains.has(domain)) {
          console.log('Skipping existing domain:', domain);
          continue;
        }
      } catch {
        continue;
      }

      // Extract company name
      const companyName = extractCompanyName(title, url);
      if (!companyName) {
        console.log('Could not extract company name from:', title);
        continue;
      }

      // Check if company name already exists
      if (existingNames.has(companyName.toLowerCase())) {
        console.log('Skipping existing company:', companyName);
        continue;
      }

      // Classify industry
      const industry = classifyIndustry(`${title} ${description}`);

      // Apply industry filter if specified
      if (targetIndustries.length > 0 && !targetIndustries.includes(industry)) {
        console.log(`Skipping company with industry "${industry}" (not in target list):`, companyName);
        continue;
      }

      newCompanies.push({
        name: companyName,
        url: url,
        industry: industry,
      });

      // Add to existing sets to avoid duplicates in this batch
      existingNames.add(companyName.toLowerCase());
      existingDomains.add(new URL(url).hostname.toLowerCase());
    }

    if (newCompanies.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          companiesAdded: 0, 
          message: 'All discovered companies already exist in the database' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Insert the companies
    const { data: inserted, error } = await supabase
      .from('company_career_sites')
      .insert(
        newCompanies.map(c => ({
          company_name: c.name,
          career_url: c.url,
          industry: c.industry,
          is_active: true,
        }))
      )
      .select();

    if (error) {
      throw error;
    }

    console.log(`Added ${inserted?.length || 0} companies:`, newCompanies.map(c => c.name));

    return new Response(
      JSON.stringify({ 
        success: true, 
        companiesAdded: inserted?.length || 0,
        companies: newCompanies.map(c => ({ name: c.name, industry: c.industry })),
        searchQuery: randomQuery
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error discovering companies:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
