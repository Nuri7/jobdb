-- Liveness writes must still enforce expiry, but need not reclassify geography.
CREATE OR REPLACE FUNCTION public.set_job_is_foreign()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $function$
DECLARE source_country text;
BEGIN
 IF TG_OP='INSERT' OR
   ROW(NEW.job_url,NEW.country_code,NEW.city,NEW.province,NEW.is_remote,NEW.location)
   IS DISTINCT FROM ROW(OLD.job_url,OLD.country_code,OLD.city,OLD.province,OLD.is_remote,OLD.location) THEN
   source_country := substring(NEW.job_url from '^https?://careers\.theheinekencompany\.com/job/[^/]+/([^/?#]+)/');
   NEW.is_foreign := (
     (NEW.country_code IS NOT NULL AND upper(NEW.country_code) NOT IN ('NL','NLD','NETHERLANDS','THE NETHERLANDS','NEDERLAND'))
     OR (source_country IS NOT NULL AND lower(source_country) NOT IN ('netherlands','the-netherlands','nederland'))
     OR (NEW.city IS NOT NULL AND coalesce(NEW.is_remote,false)=false AND NEW.province IS NULL
       AND NOT EXISTS(SELECT 1 FROM public.city_coords cc WHERE cc.city=NEW.city)
       AND (NEW.location IS NULL OR NEW.location !~* '(nederland|netherlands|landelijk)'))
   );
 END IF;
 IF NEW.closing_date < (now() AT TIME ZONE 'Europe/Amsterdam')::date
   OR (NEW.freelance_details->>'closing_at' IS NOT NULL AND (NEW.freelance_details->>'closing_at')::timestamptz < now()) THEN
   NEW.status := 'closed'; NEW.closed_at := coalesce(NEW.closed_at,now());
 END IF;
 RETURN NEW;
END;
$function$;
