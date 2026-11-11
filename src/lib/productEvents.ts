export function trackEvent(
  event_type:
    | "search"
    | "job_open"
    | "job_saved"
    | "search_saved"
    | "fairapply_open"
    | "source_open",
  job_id?: string,
) {
  if (navigator.doNotTrack === "1") return;
  const endpoint = import.meta.env.DEV
    ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/api/events`
    : "/api/events";
  // Aggregate events only: no cookies, candidate identities, search terms or CV data.
  void fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event_type, job_id }),
    keepalive: true,
  }).catch(() => undefined);
}
