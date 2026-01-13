-- Add is_internship column to job_opportunities table
ALTER TABLE public.job_opportunities 
ADD COLUMN is_internship boolean DEFAULT false;