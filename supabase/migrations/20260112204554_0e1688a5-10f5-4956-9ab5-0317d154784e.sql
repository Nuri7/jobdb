-- Create scrape history table
CREATE TABLE public.scrape_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_career_site_id UUID NOT NULL REFERENCES public.company_career_sites(id) ON DELETE CASCADE,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE,
  status TEXT NOT NULL DEFAULT 'running',
  pages_scraped INTEGER DEFAULT 0,
  jobs_found INTEGER DEFAULT 0,
  jobs_inserted INTEGER DEFAULT 0,
  error_message TEXT,
  career_url TEXT NOT NULL
);

-- Enable RLS
ALTER TABLE public.scrape_history ENABLE ROW LEVEL SECURITY;

-- Allow public read access
CREATE POLICY "Anyone can view scrape history" 
ON public.scrape_history 
FOR SELECT 
USING (true);

-- Enable realtime for scrape history
ALTER PUBLICATION supabase_realtime ADD TABLE public.scrape_history;