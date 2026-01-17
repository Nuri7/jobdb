-- Add DELETE policy for company_career_sites
CREATE POLICY "Anyone can delete company career sites"
ON public.company_career_sites
FOR DELETE
USING (true);

-- Add DELETE policy for job_opportunities
CREATE POLICY "Anyone can delete job opportunities"
ON public.job_opportunities
FOR DELETE
USING (true);

-- Add DELETE policy for scrape_history
CREATE POLICY "Anyone can delete scrape history"
ON public.scrape_history
FOR DELETE
USING (true);

-- Also add INSERT policy for company_career_sites (needed for adding companies)
CREATE POLICY "Anyone can insert company career sites"
ON public.company_career_sites
FOR INSERT
WITH CHECK (true);