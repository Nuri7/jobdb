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
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

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
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('Starting scrape for:', careerUrl);

    // Step 1: Map the career site to find job listing URLs
    console.log('Mapping career site...');
    const mapResponse = await fetch('https://api.firecrawl.dev/v1/map', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: careerUrl,
        search: 'job career vacancy position opening',
        limit: 100,
        includeSubdomains: true,
      }),
    });

    const mapData = await mapResponse.json();
    
    if (!mapResponse.ok || !mapData.success) {
      console.error('Map failed:', mapData);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to map career site' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const jobUrls = (mapData.links || []).filter((url: string) => 
      url.includes('job') || 
      url.includes('career') || 
      url.includes('vacancy') || 
      url.includes('position') ||
      url.includes('opening') ||
      url.includes('vacature')
    ).slice(0, 20); // Limit to 20 job URLs

    console.log(`Found ${jobUrls.length} potential job URLs`);

    const jobs: JobData[] = [];

    // Step 2: Scrape each job URL for details
    for (const jobUrl of jobUrls) {
      try {
        console.log('Scraping job:', jobUrl);
        
        const scrapeResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
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

        const scrapeData = await scrapeResponse.json();
        
        if (scrapeResponse.ok && scrapeData.success && scrapeData.data) {
          const content = scrapeData.data.markdown || '';
          const metadata = scrapeData.data.metadata || {};
          
          // Extract job title from metadata or content
          let jobTitle = metadata.title || '';
          if (!jobTitle || jobTitle.length > 200) {
            const titleMatch = content.match(/^#\s+(.+?)$/m);
            jobTitle = titleMatch ? titleMatch[1] : 'Job Opening';
          }
          
          // Clean up title
          jobTitle = jobTitle
            .replace(/\s*[-|]\s*.+$/, '') // Remove company suffix
            .replace(/careers?|jobs?|vacatu?res?/gi, '')
            .trim()
            .slice(0, 200);

          if (jobTitle.length < 3) {
            jobTitle = 'Job Opening';
          }

          // Detect location
          const locationMatch = content.match(/(?:location|plaats|locatie)[:\s]+([^\n,]+)/i);
          const location = locationMatch ? locationMatch[1].trim() : 'Netherlands';

          // Detect employment type
          const isFullTime = /full[- ]?time/i.test(content);
          const isPartTime = /part[- ]?time/i.test(content);
          const isContract = /contract|freelance|interim/i.test(content);
          const employmentType = isContract ? 'Contract' : isPartTime ? 'Part-time' : 'Full-time';

          // Detect remote
          const isRemote = /remote|thuiswerk|hybrid/i.test(content);

          jobs.push({
            job_title: jobTitle,
            job_url: jobUrl,
            location,
            employment_type: employmentType,
            description: content.slice(0, 5000),
            is_remote: isRemote,
          });
        }
      } catch (err) {
        console.error('Error scraping job:', jobUrl, err);
      }
    }

    console.log(`Successfully scraped ${jobs.length} jobs`);

    // Step 3: Insert jobs into database
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
          description: job.description,
          is_remote: job.is_remote,
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

    // Step 4: Update company crawl status
    await supabase
      .from('company_career_sites')
      .update({
        crawl_status: 'completed',
        last_crawled_at: new Date().toISOString(),
        jobs_found_count: insertedCount,
      })
      .eq('id', companyId);

    console.log(`Inserted ${insertedCount} jobs for company ${companyId}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        jobsFound: jobs.length,
        jobsInserted: insertedCount,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in scrape-jobs:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
