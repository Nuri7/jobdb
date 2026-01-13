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
  const defaults: Record<string, any> = {
    max_pages: 20,
    max_jobs: 150,
    wait_time: 3000,
    job_url_patterns: ['job', 'vacanc', 'position', 'opening', 'vacature', 'werk'],
    excluded_domains: ['linkedin.com', 'facebook.com', 'twitter.com', 'instagram.com'],
    excluded_url_patterns: ['/locations', '/career-types', '/about', '/contact', '/teams', '/departments', '/benefits', '/culture', '/events', '/news', '/blog'],
    required_content_keywords: ['apply', 'sollicit', 'submit', 'responsibilities', 'requirements', 'qualifications', 'experience', 'skills'],
    location_keywords: ['amsterdam', 'rotterdam', 'utrecht', 'the hague', 'eindhoven', 'den haag', 'leiden', 'delft', 'groningen', 'maastricht'],
    remote_keywords: ['remote', 'thuiswerk', 'hybrid', 'work from home', 'wfh'],
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

// Filter links to find job URLs
function filterJobUrls(links: string[], baseUrl: string, careerUrl: string, excludedUrlPatterns: string[] = []): string[] {
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
    
    // Check against excluded URL patterns from settings
    const matchesExcludedPattern = excludedUrlPatterns.some(pattern => 
      lowerUrl.includes(pattern.toLowerCase())
    );
    
    // Exclude non-job URLs
    const isExcluded = (
      matchesExcludedPattern ||
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

// Validate if scraped content is actually a job posting
function isValidJobContent(content: string, requiredKeywords: string[]): boolean {
  const lowerContent = content.toLowerCase();
  
  // Must contain at least one of the required keywords
  const hasRequiredKeyword = requiredKeywords.some(keyword => 
    lowerContent.includes(keyword.toLowerCase())
  );
  
  // Additional validation: should have reasonable content length
  const hasReasonableLength = content.length > 200;
  
  return hasRequiredKeyword && hasReasonableLength;
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

  // Detect internship
  const isInternship = /\b(?:internship|intern|stage|stagiair|werkstudent|student\s*job|traineeship)\b/i.test(content) ||
    /\b(?:internship|intern|stage|stagiair)\b/i.test(jobTitle);

  // Detect department
  let department = null;
  const deptMatch = content.match(/(?:department|team|division|afdeling)[:\s]+([^\n,|]+)/i);
  if (deptMatch) {
    department = deptMatch[1].trim();
  }

  // Extract experience level
  let experienceLevel: string | null = null;
  const lowerContent = content.toLowerCase();
  
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
  
  // If no explicit label, detect from keywords
  if (!experienceLevel) {
    if (/\b(?:intern(?:ship)?|stage|trainee|werkstudent|student)\b/i.test(content)) {
      experienceLevel = 'Internship';
    } else if (/\b(?:junior|entry[- ]?level|starter|graduate|afgestudeerd)\b/i.test(content)) {
      experienceLevel = 'Junior';
    } else if (/\b(?:medior|mid[- ]?level|regular)\b/i.test(content)) {
      experienceLevel = 'Medior';
    } else if (/\b(?:senior|experienced|ervaren|lead)\b/i.test(content)) {
      experienceLevel = 'Senior';
    } else if (/\b(?:principal|staff|architect|expert|specialist)\b/i.test(content)) {
      experienceLevel = 'Principal';
    } else if (/\b(?:manager|head of|director|lead|team lead)\b/i.test(content)) {
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

  // Extract salary range
  let salaryRange: string | null = null;
  
  // Common salary patterns (€, EUR, euro)
  const salaryPatterns = [
    // Explicit salary labels
    /(?:salary|salaris|compensation|loon|vergoeding)[:\s]+([€$]?\s*[\d.,]+\s*[-–—to]+\s*[€$]?\s*[\d.,]+(?:\s*(?:per\s+)?(?:year|yr|month|mo|jaar|maand|annually|monthly|p\.m\.|p\.a\.))?)/i,
    /(?:salary|salaris|compensation|loon|vergoeding)[:\s]+([€$]\s*[\d.,]+(?:\s*[-–—]\s*[€$]?\s*[\d.,]+)?(?:\s*(?:per\s+)?(?:year|yr|month|mo|jaar|maand|annually|monthly|p\.m\.|p\.a\.))?)/i,
    // Euro ranges: €50.000 - €70.000, €50k-€70k
    /€\s*([\d.,]+)\s*[kK]?\s*[-–—to]+\s*€?\s*([\d.,]+)\s*[kK]?(?:\s*(?:per\s+)?(?:year|yr|month|mo|jaar|maand|annually|monthly|bruto|gross|p\.m\.|p\.a\.))?/i,
    // Single euro amount with context
    /(?:earn|verdien|starting at|vanaf|tot)\s*€\s*([\d.,]+)(?:\s*[kK])?/i,
    // EUR format
    /EUR\s*([\d.,]+)\s*[-–—to]+\s*([\d.,]+)/i,
    // Salary bands like "Scale 10-12" or "Schaal 10"
    /(?:salary\s*)?(?:scale|schaal)\s*(\d+(?:\s*[-–—]\s*\d+)?)/i,
  ];
  
  for (const pattern of salaryPatterns) {
    const salaryMatch = content.match(pattern);
    if (salaryMatch) {
      // Clean up and format the salary
      let salary = salaryMatch[0];
      // Remove the label prefix
      salary = salary.replace(/^(?:salary|salaris|compensation|loon|vergoeding)[:\s]+/i, '');
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

  return {
    job_title: jobTitle.slice(0, 200),
    job_url: url,
    location: location.slice(0, 100),
    employment_type: employmentType,
    department: department?.slice(0, 100),
    description: content.slice(0, 5000),
    is_remote: isRemote,
    is_internship: isInternship,
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
          
          const job = extractJobData(jobUrl, content, metadata);
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
