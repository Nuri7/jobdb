-- Allow public update access for company career sites (admin feature)
CREATE POLICY "Anyone can update company career sites" 
ON public.company_career_sites 
FOR UPDATE 
USING (true)
WITH CHECK (true);