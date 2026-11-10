-- Freelance metadata is public vacancy information, never candidate/account data.
ALTER TABLE public.job_opportunities
  ADD COLUMN IF NOT EXISTS freelance_eligible boolean,
  ADD COLUMN IF NOT EXISTS freelance_details jsonb;

ALTER TABLE public.job_opportunities DROP CONSTRAINT IF EXISTS job_opps_employment_normalized_chk;
ALTER TABLE public.job_opportunities ADD CONSTRAINT job_opps_employment_normalized_chk
  CHECK (employment_type_normalized IN ('fulltime','parttime','contract','freelance','internship','other')) NOT VALID;
ALTER TABLE public.job_opportunities VALIDATE CONSTRAINT job_opps_employment_normalized_chk;

CREATE OR REPLACE FUNCTION public.fairjobs_prepare_job_search()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  employment_haystack text := lower(coalesce(NEW.employment_type, '') || ' ' || coalesce(NEW.job_title, ''));
  experience_haystack text := lower(coalesce(NEW.experience_level, '') || ' ' || coalesce(NEW.job_title, ''));
  workplace_haystack text := lower(coalesce(NEW.job_title, '') || ' ' || left(coalesce(NEW.description, ''), 4000));
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('simple', unaccent(coalesce(NEW.job_title, ''))), 'A') ||
    setweight(to_tsvector('simple', unaccent(coalesce(NEW.department, ''))), 'B') ||
    setweight(to_tsvector('simple', unaccent(coalesce(NEW.freelance_details->>'client_name', ''))), 'B') ||
    setweight(to_tsvector('simple', unaccent(coalesce(NEW.requirements, ''))), 'B') ||
    setweight(to_tsvector('simple', unaccent(left(coalesce(NEW.description, ''), 12000))), 'C') ||
    setweight(to_tsvector('simple', unaccent(coalesce(NEW.location, ''))), 'D');
  NEW.employment_type_normalized := CASE
    WHEN coalesce(NEW.is_internship, false) OR employment_haystack ~ '(internship|stagiair|stage|werkstudent|afstudeer)' THEN 'internship'
    WHEN NEW.freelance_eligible IS TRUE THEN 'freelance'
    WHEN employment_haystack ~ '(part[ -]?time|deeltijd|parttime)' THEN 'parttime'
    WHEN employment_haystack ~ '(contract|temporary|tijdelijk|fixed[ -]?term|interim|freelance|zzp)' THEN 'contract'
    WHEN employment_haystack ~ '(full[ -]?time|voltijd|fulltime)' THEN 'fulltime'
    ELSE 'other'
  END;
  NEW.experience_level_normalized := CASE
    WHEN experience_haystack ~ '(senior|lead|principal|staff|director|directeur|head of|manager|expert)' THEN 'senior'
    WHEN experience_haystack ~ '(junior|entry|instap|starter|graduate|trainee|student|stagiair)' THEN 'junior'
    WHEN experience_haystack ~ '(medior|mid[ -]?level|experienced|ervaren)' THEN 'medior'
    ELSE 'unknown'
  END;
  NEW.workplace_type := CASE
    WHEN workplace_haystack ~ '(hybrid|hybride)' THEN 'hybrid'
    WHEN coalesce(NEW.is_remote, false) OR workplace_haystack ~ '(fully remote|remote first|volledig thuis)' THEN 'remote'
    WHEN workplace_haystack ~ '(on[ -]?site|op locatie|op kantoor)' THEN 'onsite'
    ELSE 'unknown'
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fairjobs_prepare_job_search_trigger ON public.job_opportunities;
CREATE TRIGGER fairjobs_prepare_job_search_trigger
BEFORE INSERT OR UPDATE OF job_title, department, requirements, description, location,
  employment_type, experience_level, is_internship, is_remote, freelance_eligible, freelance_details
ON public.job_opportunities FOR EACH ROW EXECUTE FUNCTION public.fairjobs_prepare_job_search();

INSERT INTO public.company_career_sites
  (company_name, website, career_url, career_page_status, source_type, source_config, is_active, is_scrape_enabled, check_interval_hours, next_check_at)
SELECT name, website, url, 'verified', source, jsonb_build_object('resolved_url',url,'max_details',240), true, true, 8, now()
FROM (VALUES
  ('Striive','https://striive.com','https://striive.com/nl/opdrachten','freelance:striive'),
  ('Flextender','https://www.flextender.nl','https://www.flextender.nl/opdrachten/','freelance:flextender'),
  ('Opdracht Overheid','https://www.opdrachtoverheid.nl','https://www.opdrachtoverheid.nl/','freelance:overheid')
) AS sources(name,website,url,source)
WHERE NOT EXISTS (SELECT 1 FROM public.company_career_sites c WHERE c.source_type=sources.source OR c.career_url=sources.url);

-- Do not crawl Freelance.nl: its general-crawler robots policy disallows access.
-- A supported/authorised feed can later use the existing generic API adapter.
INSERT INTO public.company_career_sites
  (company_name,website,career_url,career_page_status,source_config,is_active,is_scrape_enabled)
SELECT 'Freelance.nl','https://www.freelance.nl','https://www.freelance.nl/opdrachten','unverified',
  '{"resolved_url":"https://www.freelance.nl/opdrachten","access_status":"awaiting_authorised_feed","reason":"General crawlers disallowed by robots.txt"}'::jsonb,false,false
WHERE NOT EXISTS (SELECT 1 FROM public.company_career_sites WHERE company_name='Freelance.nl' OR career_url='https://www.freelance.nl/opdrachten');

NOTIFY pgrst, 'reload schema';
