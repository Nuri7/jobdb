-- Create table for company career websites (top 1000 companies in Netherlands)
CREATE TABLE public.company_career_sites (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_name TEXT NOT NULL,
  career_url TEXT NOT NULL,
  industry TEXT,
  company_size TEXT,
  headquarters_city TEXT,
  last_crawled_at TIMESTAMP WITH TIME ZONE,
  crawl_status TEXT DEFAULT 'pending',
  jobs_found_count INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table for job opportunities
CREATE TABLE public.job_opportunities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_career_site_id UUID REFERENCES public.company_career_sites(id) ON DELETE CASCADE,
  job_title TEXT NOT NULL,
  job_url TEXT NOT NULL UNIQUE,
  location TEXT,
  employment_type TEXT,
  department TEXT,
  salary_range TEXT,
  description TEXT,
  requirements TEXT,
  posted_date DATE,
  closing_date DATE,
  is_remote BOOLEAN DEFAULT false,
  experience_level TEXT,
  scraped_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security (public read access for job board)
ALTER TABLE public.company_career_sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_opportunities ENABLE ROW LEVEL SECURITY;

-- Allow public read access for everyone
CREATE POLICY "Anyone can view company career sites" 
ON public.company_career_sites 
FOR SELECT 
USING (true);

CREATE POLICY "Anyone can view job opportunities" 
ON public.job_opportunities 
FOR SELECT 
USING (true);

-- Create indexes for better query performance
CREATE INDEX idx_job_opportunities_company ON public.job_opportunities(company_career_site_id);
CREATE INDEX idx_job_opportunities_location ON public.job_opportunities(location);
CREATE INDEX idx_job_opportunities_title ON public.job_opportunities(job_title);
CREATE INDEX idx_job_opportunities_posted ON public.job_opportunities(posted_date DESC);
CREATE INDEX idx_company_career_sites_crawl_status ON public.company_career_sites(crawl_status);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_company_career_sites_updated_at
BEFORE UPDATE ON public.company_career_sites
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_job_opportunities_updated_at
BEFORE UPDATE ON public.job_opportunities
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();