import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('Scheduled scrape started at:', new Date().toISOString());

    // Get all companies that are enabled for scraping and have a schedule
    const { data: companies, error: fetchError } = await supabase
      .from('company_career_sites')
      .select('id, company_name, career_url, scrape_schedule, last_scheduled_scrape_at')
      .eq('is_scrape_enabled', true)
      .not('scrape_schedule', 'is', null);

    if (fetchError) {
      console.error('Error fetching companies:', fetchError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch companies' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${companies?.length || 0} companies with scheduling enabled`);

    const now = new Date();
    const companiesToScrape = [];

    for (const company of companies || []) {
      const lastScrape = company.last_scheduled_scrape_at 
        ? new Date(company.last_scheduled_scrape_at) 
        : null;
      
      let shouldScrape = false;
      
      if (!lastScrape) {
        // Never scraped via schedule, scrape now
        shouldScrape = true;
      } else {
        const hoursSinceLastScrape = (now.getTime() - lastScrape.getTime()) / (1000 * 60 * 60);
        
        if (company.scrape_schedule === 'daily' && hoursSinceLastScrape >= 24) {
          shouldScrape = true;
        } else if (company.scrape_schedule === 'weekly' && hoursSinceLastScrape >= 168) {
          shouldScrape = true;
        } else if (company.scrape_schedule === '12hours' && hoursSinceLastScrape >= 12) {
          shouldScrape = true;
        }
      }
      
      if (shouldScrape) {
        companiesToScrape.push(company);
      }
    }

    console.log(`${companiesToScrape.length} companies need to be scraped`);

    // Trigger scraping for each company (sequentially to avoid overload)
    const results = [];
    
    for (const company of companiesToScrape) {
      console.log(`Triggering scrape for: ${company.company_name}`);
      
      try {
        // Update last scheduled scrape time before triggering
        await supabase
          .from('company_career_sites')
          .update({ last_scheduled_scrape_at: now.toISOString() })
          .eq('id', company.id);
        
        // Call the scrape-jobs function
        const { data, error } = await supabase.functions.invoke('scrape-jobs', {
          body: { companyId: company.id, careerUrl: company.career_url },
        });
        
        if (error) {
          console.error(`Error scraping ${company.company_name}:`, error);
          results.push({ 
            company: company.company_name, 
            success: false, 
            error: error.message 
          });
        } else {
          console.log(`Successfully triggered scrape for ${company.company_name}:`, data);
          results.push({ 
            company: company.company_name, 
            success: true, 
            ...data 
          });
        }
      } catch (err) {
        console.error(`Exception scraping ${company.company_name}:`, err);
        results.push({ 
          company: company.company_name, 
          success: false, 
          error: String(err) 
        });
      }
      
      // Small delay between companies to prevent rate limiting
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    console.log('Scheduled scrape completed:', results);

    return new Response(
      JSON.stringify({ 
        success: true, 
        companiesChecked: companies?.length || 0,
        companiesScraped: companiesToScrape.length,
        results 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in scheduled-scrape:', error);
    return new Response(
      JSON.stringify({ success: false, error: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
