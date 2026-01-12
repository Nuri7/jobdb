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

    // Strategy 1: Direct scrape with link extraction
    console.log('Scraping page for job links...');
    const scrapeResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: careerUrl,
        formats: ['markdown', 'links', 'html'],
        onlyMainContent: false,
        waitFor: 3000, // Wait for JS to load
      }),
    });

    const scrapeData = await scrapeResponse.json();
    
    if (!scrapeResponse.ok || !scrapeData.success) {
      console.error('Scrape failed:', scrapeData);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to scrape career site' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const pageLinks = scrapeData.data?.links || [];
    const markdown = scrapeData.data?.markdown || '';
    const html = scrapeData.data?.html || '';
    
    console.log(`Found ${pageLinks.length} total links on page`);

    // Filter for job-related URLs
    const baseUrl = new URL(careerUrl).origin;
    const jobUrls = pageLinks.filter((url: string) => {
      const lowerUrl = url.toLowerCase();
      // Include URLs that look like job detail pages
      return (
        (lowerUrl.includes('job') || 
         lowerUrl.includes('vacanc') || 
         lowerUrl.includes('position') ||
         lowerUrl.includes('career') ||
         lowerUrl.includes('opening') ||
         lowerUrl.includes('vacature') ||
         lowerUrl.includes('werk') ||
         lowerUrl.includes('apply') ||
         lowerUrl.includes('/en/') ||
         /\/\d{5,}/.test(url) || // Job IDs are often long numbers
         /id=\d+/.test(url) ||
         /job[_-]?id/i.test(url)) &&
        !lowerUrl.includes('linkedin.com') &&
        !lowerUrl.includes('facebook.com') &&
        !lowerUrl.includes('twitter.com') &&
        !lowerUrl.includes('instagram.com') &&
        !lowerUrl.includes('.pdf') &&
        !lowerUrl.includes('login') &&
        !lowerUrl.includes('signup') &&
        !lowerUrl.includes('register') &&
        url !== careerUrl
      );
    });

    console.log(`Filtered to ${jobUrls.length} potential job URLs`);

    // Strategy 2: Extract jobs from markdown content if few URLs found
    const jobs: JobData[] = [];
    
    if (jobUrls.length < 5) {
      console.log('Few URLs found, extracting jobs from page content...');
      
      // Parse job titles from markdown - look for patterns like:
      // - [Job Title](url)
      // - ## Job Title
      // - **Job Title** - Location
      const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;
      let match;
      
      while ((match = linkPattern.exec(markdown)) !== null) {
        const title = match[1].trim();
        let url = match[2].trim();
        
        // Skip navigation/footer links
        if (title.length < 5 || title.length > 150) continue;
        if (/^(home|about|contact|privacy|terms|cookie|menu|nav|skip|back|next|prev|more|all|view)/i.test(title)) continue;
        if (/^(apply|login|sign|register|search|filter)/i.test(title)) continue;
        
        // Make URL absolute
        if (url.startsWith('/')) {
          url = baseUrl + url;
        } else if (!url.startsWith('http')) {
          continue;
        }
        
        // Check if it looks like a job
        const lowerUrl = url.toLowerCase();
        const lowerTitle = title.toLowerCase();
        
        if (
          lowerUrl.includes('job') || 
          lowerUrl.includes('vacanc') ||
          lowerUrl.includes('career') ||
          lowerUrl.includes('position') ||
          /\d{4,}/.test(url) ||
          lowerTitle.includes('developer') ||
          lowerTitle.includes('engineer') ||
          lowerTitle.includes('manager') ||
          lowerTitle.includes('analyst') ||
          lowerTitle.includes('specialist') ||
          lowerTitle.includes('consultant') ||
          lowerTitle.includes('designer') ||
          lowerTitle.includes('lead') ||
          lowerTitle.includes('senior') ||
          lowerTitle.includes('junior') ||
          lowerTitle.includes('intern') ||
          lowerTitle.includes('director') ||
          lowerTitle.includes('officer') ||
          lowerTitle.includes('advisor') ||
          lowerTitle.includes('expert')
        ) {
          if (!jobs.some(j => j.job_url === url)) {
            jobs.push({
              job_title: title,
              job_url: url,
              location: 'Netherlands',
              employment_type: 'Full-time',
            });
          }
        }
      }
      
      console.log(`Extracted ${jobs.length} jobs from markdown content`);
    }

    // Strategy 3: Scrape individual job URLs for more details
    // Increase limit to 100 to capture more jobs from large career sites
    const urlsToScrape = jobUrls.slice(0, 100);
    
    for (const jobUrl of urlsToScrape) {
      // Skip if we already have this job
      if (jobs.some(j => j.job_url === jobUrl)) continue;
      
      try {
        console.log('Scraping job URL:', jobUrl);
        
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
          
          // Extract job title
          let jobTitle = metadata.title || '';
          
          // Clean up title - remove company name suffixes
          jobTitle = jobTitle
            .replace(/\s*[-|–—]\s*(ABN AMRO|Careers|Jobs|Vacancies|Career).*/gi, '')
            .replace(/\s*at\s+.+$/i, '')
            .trim();
          
          // Try to extract from content if title is bad
          if (!jobTitle || jobTitle.length > 150 || jobTitle.length < 5) {
            const h1Match = content.match(/^#\s+(.+?)$/m);
            if (h1Match) {
              jobTitle = h1Match[1].trim();
            }
          }
          
          if (!jobTitle || jobTitle.length < 3) {
            jobTitle = 'Job Opening';
          }

          // Extract location
          let location = 'Netherlands';
          const locationPatterns = [
            /(?:location|plaats|locatie|city)[:\s]+([^\n,|]+)/i,
            /(?:amsterdam|rotterdam|utrecht|the hague|eindhoven|den haag)/i,
          ];
          
          for (const pattern of locationPatterns) {
            const locMatch = content.match(pattern);
            if (locMatch) {
              location = locMatch[1] ? locMatch[1].trim() : locMatch[0];
              break;
            }
          }

          // Detect employment type
          const isFullTime = /full[- ]?time/i.test(content);
          const isPartTime = /part[- ]?time/i.test(content);
          const isContract = /contract|freelance|interim|temporary/i.test(content);
          const employmentType = isContract ? 'Contract' : isPartTime ? 'Part-time' : 'Full-time';

          // Detect remote
          const isRemote = /remote|thuiswerk|hybrid|work from home|wfh/i.test(content);

          // Detect department
          let department = null;
          const deptMatch = content.match(/(?:department|team|division|afdeling)[:\s]+([^\n,|]+)/i);
          if (deptMatch) {
            department = deptMatch[1].trim();
          }

          jobs.push({
            job_title: jobTitle.slice(0, 200),
            job_url: jobUrl,
            location: location.slice(0, 100),
            employment_type: employmentType,
            department: department?.slice(0, 100),
            description: content.slice(0, 5000),
            is_remote: isRemote,
          });
        }
      } catch (err) {
        console.error('Error scraping job URL:', jobUrl, err);
      }
    }

    console.log(`Total jobs found: ${jobs.length}`);

    // Insert jobs into database
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

    // Update company crawl status
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
        linksFound: pageLinks.length,
        jobUrlsFiltered: jobUrls.length,
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
