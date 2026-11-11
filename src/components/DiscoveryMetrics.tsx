import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";

type Metrics = {
  events: Record<string, number>;
  applications_prepared: number;
  applications_with_receipt: number;
};
export function DiscoveryMetrics() {
  const { session } = useAuth();
  const query = useQuery({
    queryKey: ["discovery-metrics"],
    enabled: Boolean(session?.access_token),
    queryFn: async () => {
      const base = import.meta.env.DEV
        ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/api`
        : "/api";
      const response = await fetch(`${base}/funnel`, {
        headers: { Authorization: `Bearer ${session!.access_token}` },
      });
      if (!response.ok)
        throw new Error("Statistieken konden niet worden geladen");
      return ((await response.json()) as { data: Metrics }).data;
    },
  });
  const data = query.data;
  return (
    <section className="mb-8 rounded-2xl border bg-card p-5">
      <h2 className="text-xl font-semibold">
        Van zoeken naar solliciteren · 30 dagen
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Anonieme actieaantallen. Voorbereidingen en bevestigde inzendingen
        betreffen FairApply-sollicitaties bij vacatures uit de
        FairJobs-database; ze zijn niet aan individuele sitebezoekers gekoppeld.
      </p>
      {data && (
        <dl className="mt-5 grid grid-cols-2 gap-5 md:grid-cols-4">
          {[
            ["Zoekopdrachten", data.events.search || 0],
            ["Vacatures geopend", data.events.job_open || 0],
            ["Vacatures bewaard", data.events.job_saved || 0],
            ["Zoekmeldingen ingesteld", data.events.search_saved || 0],
            ["FairApply geopend", data.events.fairapply_open || 0],
            ["Bron geopend", data.events.source_open || 0],
            ["Sollicitaties voorbereid", data.applications_prepared],
            ["Inzendingen met ontvangstbewijs", data.applications_with_receipt],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-sm text-muted-foreground">{label}</dt>
              <dd className="mt-1 text-2xl font-semibold">
                {Number(value).toLocaleString("nl-NL")}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {query.isLoading && <p className="mt-4 text-sm">Statistieken laden…</p>}
      {query.isError && (
        <button
          className="mt-3 text-sm text-primary underline"
          onClick={() => query.refetch()}
        >
          Statistieken opnieuw laden
        </button>
      )}
    </section>
  );
}
