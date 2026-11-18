-- Enforce the same quota for direct Data API inserts, not just the form's RPC.
CREATE FUNCTION public.fairjobs_source_request_quota() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $function$
BEGIN
 IF auth.uid() IS NOT NULL THEN
  PERFORM pg_advisory_xact_lock(hashtext(auth.uid()::text),hashtext('fairjobs-source-request'));
  IF (SELECT count(*) FROM public.job_source_requests WHERE user_id=auth.uid() AND created_at>now()-interval '24 hours')>=5 THEN
   RAISE EXCEPTION 'Je kunt maximaal vijf werkgevers per dag aanmelden.';
  END IF;
 END IF;
 RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.fairjobs_source_request_quota() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER source_request_quota BEFORE INSERT ON public.job_source_requests FOR EACH ROW EXECUTE FUNCTION public.fairjobs_source_request_quota();
