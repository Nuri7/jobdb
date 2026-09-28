import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Bell, BriefcaseBusiness, ChevronLeft, ChevronRight, Loader2, Search, SlidersHorizontal } from "lucide-react";
import Header from "@/components/Header";
import PublicJobCard from "@/components/PublicJobCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { fetchJobs, type JobFilters, type PublicJob } from "@/lib/api/publicJobs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

const boolParam = (value: string | null) => value === "1" || value === "true";

export default function Jobs() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const routeLocation = useLocation();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [query, setQuery] = useState(searchParams.get("q") || "");
  const [location, setLocation] = useState(searchParams.get("location") || "");
  const page = Math.max(1, Number(searchParams.get("page")) || 1);

  useEffect(() => {
    setQuery(searchParams.get("q") || "");
    setLocation(searchParams.get("location") || "");
  }, [searchParams]);

  const filters = useMemo<JobFilters>(() => ({
    search: searchParams.get("q") || undefined,
    location: searchParams.get("location") || undefined,
    jobType: searchParams.get("type") || undefined,
    experienceLevel: searchParams.get("niveau") || undefined,
    remote: boolParam(searchParams.get("remote")),
    hasSalary: boolParam(searchParams.get("salaris")),
    easyApply: boolParam(searchParams.get("fairapply")),
    postedWithin: searchParams.has("dagen") ? (Number(searchParams.get("dagen")) || undefined) : 30,
    page,
    limit: 24,
  }), [page, searchParams]);

  const jobsQuery = useQuery({
    queryKey: ["public-jobs", filters],
    queryFn: () => fetchJobs(filters),
    placeholderData: (previous) => previous,
  });

  const savedQuery = useQuery({
    queryKey: ["saved-job-ids", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("job_saved_items").select("job_id").eq("user_id", user!.id);
      if (error) throw error;
      return new Set<string>((data || []).map((row: { job_id: string }) => row.job_id));
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (job: PublicJob) => {
      if (!user) throw new Error("LOGIN");
      const isSaved = savedQuery.data?.has(job.id);
      const queryBuilder = (supabase as any).from("job_saved_items");
      const { error } = isSaved
        ? await queryBuilder.delete().eq("user_id", user.id).eq("job_id", job.id)
        : await queryBuilder.insert({ user_id: user.id, job_id: job.id });
      if (error) throw error;
      return !isSaved;
    },
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ["saved-job-ids", user?.id] });
      toast.success(saved ? "Vacature bewaard" : "Vacature verwijderd uit bewaard");
    },
    onError: (error) => {
      if (error.message === "LOGIN") navigate("/inloggen", { state: { from: `${routeLocation.pathname}${routeLocation.search}` } });
      else toast.error("Bewaren is niet gelukt");
    },
  });

  const setFilter = (key: string, value?: string | boolean) => {
    const next = new URLSearchParams(searchParams);
    if (value === undefined || value === "" || value === "all" || value === false) next.delete(key);
    else next.set(key, value === true ? "1" : String(value));
    if (key !== "page") next.delete("page");
    setSearchParams(next);
  };

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    const next = new URLSearchParams(searchParams);
    if (query.trim()) next.set("q", query.trim());
    else next.delete("q");
    if (location.trim()) next.set("location", location.trim());
    else next.delete("location");
    next.delete("page");
    setSearchParams(next);
  };

  const saveSearch = async () => {
    if (!user) {
      navigate("/inloggen", { state: { from: `${window.location.pathname}${window.location.search}` } });
      return;
    }
    const name = [filters.search, filters.location].filter(Boolean).join(" in ") || "Mijn vacaturezoektocht";
    const criteria = Object.fromEntries(Object.entries(filters).filter(([key, value]) => value !== undefined && !["page", "limit"].includes(key)));
    const { error } = await (supabase as any).from("job_saved_searches").insert({ user_id: user.id, name, criteria, email_enabled: true });
    if (error) toast.error("Zoekopdracht bewaren is niet gelukt");
    else toast.success("Zoekopdracht bewaard. Je ontvangt nieuwe matches per e-mail.");
  };

  const total = jobsQuery.data?.meta.total ?? 0;
  const totalLabel = jobsQuery.data?.meta.total_is_lower_bound
    ? `Minimaal ${total.toLocaleString("nl-NL")}`
    : jobsQuery.data?.meta.total_is_estimate
      ? `Ongeveer ${total.toLocaleString("nl-NL")}`
      : total.toLocaleString("nl-NL");

  return (
    <div className="min-h-screen bg-muted/20">
      <Header />
      <main>
        <section className="border-b bg-card">
          <div className="container max-w-7xl py-8">
            <div className="max-w-3xl">
              <p className="mb-2 text-sm font-semibold text-primary">Echte vacatures, direct bij werkgevers</p>
              <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Vind werk dat bij je past</h1>
              <p className="mt-3 text-muted-foreground">Zoek in geverifieerde, openstaande vacatures in Nederland. Zonder vacatures van aggregators of verlopen pagina’s.</p>
            </div>
            <form onSubmit={submitSearch} className="mt-6 grid gap-3 rounded-2xl border bg-background p-3 shadow-sm md:grid-cols-[1fr_0.7fr_auto]">
              <div className="relative"><Search className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" /><Input value={query} onChange={(e) => setQuery(e.target.value)} className="h-11 pl-10" placeholder="Functie, vakgebied of trefwoord" /></div>
              <div className="relative"><Input value={location} onChange={(e) => setLocation(e.target.value)} className="h-11" placeholder="Plaats of regio" /></div>
              <Button type="submit" size="lg" className="h-11">Zoeken</Button>
            </form>
          </div>
        </section>

        <div className="container max-w-7xl py-8">
          <div className="grid gap-6 lg:grid-cols-[250px_1fr]">
            <aside className="h-fit rounded-2xl border bg-card p-5 lg:sticky lg:top-5">
              <h2 className="flex items-center gap-2 font-semibold"><SlidersHorizontal className="h-4 w-4" />Filters</h2>
              <div className="mt-5 space-y-5">
                <div><Label>Geplaatst</Label><Select value={searchParams.get("dagen") || "30"} onValueChange={(v) => setFilter("dagen", v)}><SelectTrigger className="mt-2"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="0">Alle datums</SelectItem><SelectItem value="1">Vandaag</SelectItem><SelectItem value="7">Afgelopen week</SelectItem><SelectItem value="30">Afgelopen maand</SelectItem></SelectContent></Select></div>
                <div><Label>Dienstverband</Label><Select value={searchParams.get("type") || "all"} onValueChange={(v) => setFilter("type", v)}><SelectTrigger className="mt-2"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Alles</SelectItem><SelectItem value="fulltime">Fulltime</SelectItem><SelectItem value="parttime">Parttime</SelectItem><SelectItem value="contract">Contract</SelectItem><SelectItem value="internship">Stage</SelectItem></SelectContent></Select></div>
                <div><Label>Niveau</Label><Select value={searchParams.get("niveau") || "all"} onValueChange={(v) => setFilter("niveau", v)}><SelectTrigger className="mt-2"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Alle niveaus</SelectItem><SelectItem value="junior">Junior</SelectItem><SelectItem value="medior">Medior</SelectItem><SelectItem value="senior">Senior</SelectItem></SelectContent></Select></div>
                {[["remote", "Thuiswerken"], ["salaris", "Salaris vermeld"], ["fairapply", "FairApply geschikt"]].map(([key, label]) => <div key={key} className="flex items-center justify-between gap-3"><Label htmlFor={key} className="cursor-pointer">{label}</Label><Switch id={key} checked={boolParam(searchParams.get(key))} onCheckedChange={(v) => setFilter(key, v)} /></div>)}
                <Button variant="outline" className="w-full" onClick={saveSearch}><Bell className="mr-2 h-4 w-4" />Bewaar zoekopdracht</Button>
              </div>
            </aside>

            <section>
              <div className="mb-5 flex items-end justify-between gap-4">
                <div><h2 className="text-xl font-semibold">{jobsQuery.isLoading ? "Vacatures laden…" : `${totalLabel} vacatures`}</h2><p className="text-sm text-muted-foreground">Alleen geverifieerde vacatures in Nederland</p></div>
                {user && <Button variant="ghost" asChild><Link to="/bewaard">Mijn bewaarde vacatures</Link></Button>}
              </div>

              {jobsQuery.isError ? (
                <div className="rounded-2xl border bg-card p-10 text-center"><BriefcaseBusiness className="mx-auto h-8 w-8 text-muted-foreground" /><h3 className="mt-3 font-semibold">Vacatures konden niet worden geladen</h3><Button variant="outline" className="mt-4" onClick={() => jobsQuery.refetch()}>Opnieuw proberen</Button></div>
              ) : jobsQuery.isLoading ? (
                <div className="grid place-items-center rounded-2xl border bg-card py-24"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>
              ) : jobsQuery.data?.data.length ? (
                <div className="space-y-4">{jobsQuery.data.data.map((job) => <PublicJobCard key={job.id} job={job} saved={savedQuery.data?.has(job.id)} onSave={(value) => saveMutation.mutateAsync(value)} />)}</div>
              ) : (
                <div className="rounded-2xl border bg-card p-12 text-center"><h3 className="font-semibold">Geen vacatures gevonden</h3><p className="mt-2 text-muted-foreground">Maak je zoekopdracht iets ruimer of wis een filter.</p></div>
              )}

              <div className="mt-7 flex items-center justify-center gap-3">
                <Button variant="outline" disabled={page <= 1 || jobsQuery.isFetching} onClick={() => setFilter("page", String(page - 1))}><ChevronLeft className="mr-2 h-4 w-4" />Vorige</Button>
                <span className="text-sm text-muted-foreground">Pagina {page}</span>
                <Button variant="outline" disabled={!jobsQuery.data?.meta.has_more || jobsQuery.isFetching} onClick={() => setFilter("page", String(page + 1))}>Volgende<ChevronRight className="ml-2 h-4 w-4" /></Button>
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
