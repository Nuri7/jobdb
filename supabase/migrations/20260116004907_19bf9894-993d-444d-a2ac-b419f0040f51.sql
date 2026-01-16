-- Create table for configurable job title synonyms
CREATE TABLE public.job_synonyms (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_name TEXT NOT NULL,
  terms TEXT[] NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.job_synonyms ENABLE ROW LEVEL SECURITY;

-- Public read access for API
CREATE POLICY "Public read access for synonyms"
ON public.job_synonyms
FOR SELECT
USING (true);

-- Public write access for management
CREATE POLICY "Public write access for synonyms"
ON public.job_synonyms
FOR ALL
USING (true)
WITH CHECK (true);

-- Add trigger for updated_at
CREATE TRIGGER update_job_synonyms_updated_at
BEFORE UPDATE ON public.job_synonyms
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default synonym groups
INSERT INTO public.job_synonyms (group_name, terms) VALUES
('Product Management', ARRAY['product owner', 'product manager', 'po', 'pm']),
('Software Development', ARRAY['developer', 'engineer', 'programmer', 'coder', 'software developer', 'software engineer']),
('Frontend', ARRAY['frontend', 'front-end', 'front end', 'ui developer', 'ui engineer']),
('Backend', ARRAY['backend', 'back-end', 'back end', 'server-side']),
('Fullstack', ARRAY['fullstack', 'full-stack', 'full stack']),
('DevOps', ARRAY['devops', 'dev ops', 'sre', 'site reliability', 'platform engineer']),
('Data Science', ARRAY['data scientist', 'data analyst', 'ml engineer', 'machine learning engineer', 'ai engineer']),
('Agile', ARRAY['scrum master', 'agile coach', 'agile master']),
('Design', ARRAY['ux designer', 'ui designer', 'ux/ui designer', 'product designer', 'visual designer']),
('QA', ARRAY['qa engineer', 'test engineer', 'quality assurance', 'tester', 'sdet']),
('Tech Leadership', ARRAY['tech lead', 'technical lead', 'lead developer', 'lead engineer', 'engineering lead']),
('Executive', ARRAY['cto', 'chief technology officer', 'vp engineering', 'head of engineering']),
('HR', ARRAY['hr', 'human resources', 'people operations', 'talent acquisition', 'recruiter']),
('Marketing', ARRAY['marketing manager', 'growth manager', 'digital marketing', 'marketing specialist']),
('Sales', ARRAY['sales', 'account executive', 'account manager', 'business development', 'bdm']),
('Project Management', ARRAY['project manager', 'program manager', 'delivery manager']),
('Support', ARRAY['support', 'customer support', 'customer service', 'helpdesk', 'customer success']),
('Cloud', ARRAY['cloud engineer', 'cloud architect', 'aws engineer', 'azure engineer', 'gcp engineer']),
('Security', ARRAY['security engineer', 'cybersecurity', 'infosec', 'security analyst']),
('Mobile', ARRAY['mobile developer', 'ios developer', 'android developer', 'react native developer', 'flutter developer']);