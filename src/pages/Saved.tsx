import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";
import { Bell, Loader2, Trash2 } from "lucide-react";
import Header from "@/components/Header";
import PublicJobCard from "@/components/PublicJobCard";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { fetchJob } from "@/lib/api/publicJobs";
import { toast } from "sonner";

type SavedSearch = { id: string; name: string; criteria: Record<string, unknown>; email_enabled: boolean; created_at: string };

export default function Saved() {
  const { user, loading } = useAuth();
  const queryClient = useQueryClient();
  const itemsQuery = useQuery({
    queryKey: ["saved-items", user?.id], enabled: Boolean(user),
    queryFn: async () => { const { data, error } = await (supabase as any).from("job_saved_items").select("job_id,created_at").eq("user_id", user!.id).order("created_at", { ascending: false }); if (error) throw error; return data as { job_id: string }[]; },
  });
  const searchesQuery = useQuery({
    queryKey: ["saved-searches", user?.id], enabled: Boolean(user),
    queryFn: async () => { const { data, error } = await (supabase as any).from("job_saved_searches").select("*").eq("user_id", user!.id).order("created_at", { ascending: false }); if (error) throw error; return data as SavedSearch[]; },
  });
  const jobQueries = useQueries({ queries: (itemsQuery.data || []).map((item) => ({ queryKey: ["job-detail", item.job_id], queryFn: () => fetchJob(item.job_id), retry: false })) });

  if (loading) return <div className="min-h-screen grid place-items-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (!user) return <Navigate to="/inloggen" replace state={{ from: "/bewaard" }} />;

  const removeJob = async (id: string) => { const { error } = await (supabase as any).from("job_saved_items").delete().eq("user_id", user.id).eq("job_id", id); if (error) toast.error("Verwijderen is niet gelukt"); else { await queryClient.invalidateQueries({ queryKey: ["saved-items", user.id] }); toast.success("Vacature verwijderd"); } };
  const removeSearch = async (id: string) => { const { error } = await (supabase as any).from("job_saved_searches").delete().eq("user_id", user.id).eq("id", id); if (!error) queryClient.invalidateQueries({ queryKey: ["saved-searches", user.id] }); };
  const toggleSearch = async (search: SavedSearch) => { const { error } = await (supabase as any).from("job_saved_searches").update({ email_enabled: !search.email_enabled }).eq("user_id", user.id).eq("id", search.id); if (!error) queryClient.invalidateQueries({ queryKey: ["saved-searches", user.id] }); };

  return <div className="min-h-screen bg-muted/20"><Header /><main className="container max-w-5xl py-9"><h1 className="text-3xl font-bold">Bewaard</h1><p className="mt-2 text-muted-foreground">Je favoriete vacatures en meldingen voor nieuwe matches.</p>
    <section className="mt-9"><h2 className="text-xl font-semibold">Vacatures ({itemsQuery.data?.length || 0})</h2><div className="mt-4 space-y-4">{jobQueries.filter((query) => query.data).map((query) => <PublicJobCard key={query.data!.id} job={query.data!} saved onSave={() => removeJob(query.data!.id)} />)}{itemsQuery.isLoading && <Loader2 className="h-5 w-5 animate-spin" />}{!itemsQuery.isLoading && !itemsQuery.data?.length && <p className="rounded-xl border bg-card p-6 text-muted-foreground">Je hebt nog geen vacatures bewaard.</p>}</div></section>
    <section className="mt-10"><h2 className="text-xl font-semibold">Zoekmeldingen ({searchesQuery.data?.length || 0})</h2><div className="mt-4 space-y-3">{searchesQuery.data?.map((search) => <div key={search.id} className="flex items-center justify-between gap-4 rounded-xl border bg-card p-4"><div className="min-w-0"><p className="font-medium truncate">{search.name}</p><p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground"><Bell className="h-3.5 w-3.5" />{search.email_enabled ? "Dagelijkse e-mail staat aan" : "E-mail staat uit"}</p></div><div className="flex items-center gap-2"><Switch checked={search.email_enabled} onCheckedChange={() => toggleSearch(search)} aria-label="Schakel e-mailmelding" /><Button variant="ghost" size="icon" onClick={() => removeSearch(search.id)} aria-label="Verwijder zoekmelding"><Trash2 className="h-4 w-4" /></Button></div></div>)}{!searchesQuery.isLoading && !searchesQuery.data?.length && <p className="rounded-xl border bg-card p-6 text-muted-foreground">Je hebt nog geen zoekopdrachten bewaard.</p>}</div></section>
  </main></div>;
}
