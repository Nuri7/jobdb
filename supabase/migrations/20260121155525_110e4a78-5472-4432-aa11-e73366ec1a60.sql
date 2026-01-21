-- Add new columns to company_career_sites for imported company data
ALTER TABLE public.company_career_sites
ADD COLUMN IF NOT EXISTS trade_name text,
ADD COLUMN IF NOT EXISTS email text,
ADD COLUMN IF NOT EXISTS phone_number text,
ADD COLUMN IF NOT EXISTS address text,
ADD COLUMN IF NOT EXISTS postal_code text,
ADD COLUMN IF NOT EXISTS state_province text,
ADD COLUMN IF NOT EXISTS country text DEFAULT 'Netherlands',
ADD COLUMN IF NOT EXISTS website text,
ADD COLUMN IF NOT EXISTS company_registration_number text,
ADD COLUMN IF NOT EXISTS ceo_name text,
ADD COLUMN IF NOT EXISTS founding_year integer,
ADD COLUMN IF NOT EXISTS yearly_revenue_usd numeric,
ADD COLUMN IF NOT EXISTS employees_on_site integer,
ADD COLUMN IF NOT EXISTS employees_total integer,
ADD COLUMN IF NOT EXISTS business_legal_type text;