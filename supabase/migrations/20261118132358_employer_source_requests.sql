CREATE TABLE public.job_source_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
 company_name text NOT NULL CHECK(length(company_name) BETWEEN 2 AND 120),
 career_url text NOT NULL CHECK(length(career_url) BETWEEN 12 AND 1000 AND career_url ~ '^https://[^/@[:space:]]+'),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','validating','imported','failed','rejected')),
 review_note text,
 company_id uuid REFERENCES public.company_career_sites(id),
 jobs_imported integer,
 attempts integer NOT NULL DEFAULT 0,
 next_check_at timestamptz NOT NULL DEFAULT now(),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,career_url)
);
CREATE INDEX job_source_requests_queue ON public.job_source_requests(next_check_at) WHERE status IN ('approved','failed','validating');
CREATE INDEX job_source_requests_owner ON public.job_source_requests(user_id,created_at DESC);
ALTER TABLE public.job_source_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.job_source_requests FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.job_source_requests TO authenticated;
GRANT INSERT(company_name,career_url) ON public.job_source_requests TO authenticated;
GRANT UPDATE(status,review_note,updated_at,next_check_at) ON public.job_source_requests TO authenticated;
GRANT ALL ON public.job_source_requests TO service_role;
CREATE POLICY source_request_read ON public.job_source_requests FOR SELECT TO authenticated
 USING(user_id=(SELECT auth.uid()) OR public.has_role((SELECT auth.uid()),'admin'));
CREATE POLICY source_request_insert ON public.job_source_requests FOR INSERT TO authenticated
 WITH CHECK(user_id=(SELECT auth.uid()) AND status='pending');
CREATE POLICY source_request_review ON public.job_source_requests FOR UPDATE TO authenticated
 USING(public.has_role((SELECT auth.uid()),'admin')) WITH CHECK(public.has_role((SELECT auth.uid()),'admin'));

CREATE FUNCTION public.fairjobs_suggest_source(p_name text,p_url text) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $function$
DECLARE request_id uuid;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext(auth.uid()::text),hashtext('fairjobs-source-request'));
 SELECT id INTO request_id FROM public.job_source_requests WHERE user_id=auth.uid() AND career_url=trim(p_url);
 IF request_id IS NOT NULL THEN RETURN request_id; END IF;
 IF (SELECT count(*) FROM public.job_source_requests WHERE user_id=auth.uid() AND created_at>now()-interval '24 hours')>=5 THEN
  RAISE EXCEPTION 'Je kunt maximaal vijf werkgevers per dag aanmelden.';
 END IF;
 INSERT INTO public.job_source_requests(company_name,career_url) VALUES(trim(p_name),trim(p_url)) RETURNING id INTO request_id;
 RETURN request_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.fairjobs_suggest_source(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fairjobs_suggest_source(text,text) TO authenticated;
