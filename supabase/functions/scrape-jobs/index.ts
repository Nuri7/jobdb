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

interface ScrapeResult {
  links: string[];
  markdown: string;
  html: string;
}

// Helper to scrape a single page
async function scrapePage(url: string, apiKey: string): Promise<ScrapeResult | null> {
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
        waitFor: 3000,
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

// Filter links to find job URLs
function filterJobUrls(links: string[], baseUrl: string, careerUrl: string): string[] {
  return links.filter((url: string) => {
    const lowerUrl = url.toLowerCase();
    
    // Must be on same domain
    if (!url.startsWith(baseUrl)) return false;
    
    // Include URLs that look like job detail pages
    const isJobUrl = (
      lowerUrl.includes('job') || 
      lowerUrl.includes('vacanc') || 
      lowerUrl.includes('position') ||
      lowerUrl.includes('opening') ||
      lowerUrl.includes('vacature') ||
      lowerUrl.includes('werk') ||
      /\/\d{5,}/.test(url) || // Job IDs are often long numbers
      /id=\d+/.test(url) ||
      /job[_-]?id/i.test(url)
    );
    
    // Exclude non-job URLs
    const isExcluded = (
      lowerUrl.includes('linkedin.com') ||
      lowerUrl.includes('facebook.com') ||
      lowerUrl.includes('twitter.com') ||
      lowerUrl.includes('instagram.com') ||
      lowerUrl.includes('.pdf') ||
      lowerUrl.includes('login') ||
      lowerUrl.includes('signup') ||
      lowerUrl.includes('register') ||
      lowerUrl.includes('/locations') ||
      lowerUrl.includes('/career-types') ||
      lowerUrl.includes('/about') ||
      lowerUrl.includes('/contact') ||
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

// Extract job data from a job page
function extractJobData(url: string, content: string, metadata: any): JobData {
  // Extract job title
  let jobTitle = metadata?.title || '';
  
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
      jobTitle = h1Match[1].trim();
    }
  }
  
  if (!jobTitle || jobTitle.length < 3) {
    jobTitle = 'Job Opening';
  }

  // Extract location
  let location = 'Netherlands';
  const locationPatterns = [
    /(?:location|plaats|locatie|city|standort)[:\s]+([^\n,|]+)/i,
    /(?:amsterdam|rotterdam|utrecht|the hague|eindhoven|den haag|leiden|delft|groningen|maastricht)/i,
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

  return {
    job_title: jobTitle.slice(0, 200),
    job_url: url,
    location: location.slice(0, 100),
    employment_type: employmentType,
    department: department?.slice(0, 100),
    description: content.slice(0, 5000),
    is_remote: isRemote,
  };
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
    const baseUrl = new URL(careerUrl).origin;

    // Collect all job URLs from all pages
    const allJobUrls = new Set<string>();
    const scrapedPages = new Set<string>();
    const pagesToScrape: string[] = [careerUrl];
    
    // Limit pagination to prevent infinite loops
    const MAX_PAGES = 20;
    let pagesScraped = 0;

    // Phase 1: Collect all job URLs from listing pages (with pagination)
    console.log('Phase 1: Collecting job URLs from listing pages...');
    
    while (pagesToScrape.length > 0 && pagesScraped < MAX_PAGES) {
      const currentUrl = pagesToScrape.shift()!;
      
      if (scrapedPages.has(currentUrl)) continue;
      scrapedPages.add(currentUrl);
      pagesScraped++;
      
      console.log(`Scraping listing page ${pagesScraped}/${MAX_PAGES}: ${currentUrl}`);
      
      const pageData = await scrapePage(currentUrl, apiKey);
      
      if (!pageData) {
        console.log('Failed to scrape page:', currentUrl);
        continue;
      }
      
      // Extract job URLs from this page
      const jobUrls = filterJobUrls(pageData.links, baseUrl, careerUrl);
      console.log(`Found ${jobUrls.length} job URLs on this page`);
      
      for (const url of jobUrls) {
        allJobUrls.add(url);
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
    
    const jobs: JobData[] = [];
    const jobUrlArray = Array.from(allJobUrls);
    const MAX_JOBS = 150; // Limit to prevent timeout
    
    for (let i = 0; i < Math.min(jobUrlArray.length, MAX_JOBS); i++) {
      const jobUrl = jobUrlArray[i];
      
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
          
          const job = extractJobData(jobUrl, content, metadata);
          jobs.push(job);
        }
      } catch (err) {
        console.error('Error scraping job URL:', jobUrl, err);
      }
    }

    console.log(`Phase 2 complete: Scraped ${jobs.length} job details`);

    // Phase 3: Insert jobs into database
    console.log('Phase 3: Inserting jobs into database...');
    
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

    console.log(`Complete: Inserted ${insertedCount} jobs for company ${companyId}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        jobsFound: allJobUrls.size,
        jobsScraped: jobs.length,
        jobsInserted: insertedCount,
        pagesScraped: pagesScraped,
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
