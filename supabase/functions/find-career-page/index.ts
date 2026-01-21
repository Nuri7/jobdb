const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CompanyData {
  company_name: string;
  website?: string;
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

    console.log(`Finding career pages for ${companies.length} companies`);

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
              search: 'careers jobs vacatures werkenbij',
              limit: 20,
              includeSubdomains: true,
            }),
          });

          if (mapResponse.ok) {
            const mapData = await mapResponse.json();
            
            if (mapData.success && mapData.links?.length > 0) {
              // Find the best career URL from the results
              const careerPatterns = [
                /career/i,
                /jobs?/i,
                /vacatur/i,
                /werkenbij/i,
                /hiring/i,
                /openings/i,
                /join-us/i,
                /work-with-us/i,
              ];

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
              // Find the most relevant career URL
              const careerPatterns = [
                /career/i,
                /jobs?/i,
                /vacatur/i,
                /werkenbij/i,
              ];

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
