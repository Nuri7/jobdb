import type { SupabaseClient } from "@supabase/supabase-js";
import { useState } from "react";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Navigate } from "react-router-dom";
import { Bell, Loader2, Trash2 } from "lucide-react";
import Header from "@/components/Header";
import PublicJobCard from "@/components/PublicJobCard";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { fetchJob, type JobFilters } from "@/lib/api/publicJobs";
import { criteriaSummary, searchUrl } from "@/lib/discoveryState";
import { toast } from "sonner";

type SavedSearch = {
  id: string;
  name: string;
  criteria: JobFilters;
  email_enabled: boolean;
  email_frequency: string;
};
const db = supabase as unknown as SupabaseClient;
export default function Saved() {
  const { user, loading } = useAuth();
  const queryClient = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);
  const itemsQuery = useQuery({
    queryKey: ["saved-items", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await db
        .from("job_saved_items")
        .select("job_id,created_at")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as { job_id: string }[];
    },
  });
  const searchesQuery = useQuery({
    queryKey: ["saved-searches", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await db
        .from("job_saved_searches")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as SavedSearch[];
    },
  });
  const jobQueries = useQueries({
    queries: (itemsQuery.data || []).map((item) => ({
      queryKey: ["job-detail", item.job_id],
      queryFn: () => fetchJob(item.job_id),
      retry: false,
    })),
  });
  if (loading)
    return (
      <div className="grid min-h-screen place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  if (!user)
    return <Navigate to="/inloggen" replace state={{ from: "/bewaard" }} />;
  const changeSearch = async (
    search: SavedSearch,
    values?: { email_enabled?: boolean; email_frequency?: string },
  ) => {
    setBusyId(search.id);
    const query = db.from("job_saved_searches");
    const { error } = values
      ? await query.update(values).eq("user_id", user.id).eq("id", search.id)
      : await query.delete().eq("user_id", user.id).eq("id", search.id);
    setBusyId(null);
    if (error) toast.error("Wijzigen is niet gelukt. Probeer het opnieuw.");
    else {
      await queryClient.invalidateQueries({
        queryKey: ["saved-searches", user.id],
      });
      toast.success(
        values ? "Zoekmelding bijgewerkt" : "Zoekmelding verwijderd",
      );
    }
  };
  const removeJob = async (id: string) => {
    const { error } = await db
      .from("job_saved_items")
      .delete()
      .eq("user_id", user.id)
      .eq("job_id", id);
    if (error) toast.error("Verwijderen is niet gelukt");
    else {
      await queryClient.invalidateQueries({
        queryKey: ["saved-items", user.id],
      });
      await queryClient.invalidateQueries({
        queryKey: ["saved-job-ids", user.id],
      });
    }
  };
  return (
    <div className="min-h-screen bg-muted/20">
      <Header />
      <main className="container max-w-5xl py-8">
        <h1 className="text-3xl font-bold">Bewaard</h1>
        <p className="mt-2 text-muted-foreground">
          Je favoriete vacatures en meldingen voor nieuwe matches.
        </p>
        <section className="mt-8">
          <h2 className="text-xl font-semibold">
            Vacatures ({itemsQuery.data?.length || 0})
          </h2>
          <div className="mt-4 space-y-4">
            {jobQueries.map((query, index) =>
              query.data ? (
                <PublicJobCard
                  key={query.data.id}
                  job={query.data}
                  saved
                  onSave={() => removeJob(query.data!.id)}
                />
              ) : query.isError ? (
                <div
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4"
                  key={itemsQuery.data![index].job_id}
                >
                  <p className="text-sm text-muted-foreground">
                    Deze bewaarde vacature is niet meer beschikbaar.
                  </p>
                  <Button
                    variant="ghost"
                    onClick={() => removeJob(itemsQuery.data![index].job_id)}
                  >
                    Verwijder uit bewaard
                  </Button>
                </div>
              ) : null,
            )}
            {itemsQuery.isLoading && (
              <Loader2 className="h-5 w-5 animate-spin" />
            )}
            {itemsQuery.isError && (
              <p role="alert">
                Je bewaarde vacatures konden niet worden geladen.
              </p>
            )}
            {itemsQuery.isSuccess && !itemsQuery.data.length && (
              <p className="rounded-xl border bg-card p-6 text-muted-foreground">
                Je hebt nog geen vacatures bewaard.{" "}
                <Link to="/vacatures" className="text-primary underline">
                  Zoek een vacature
                </Link>
                .
              </p>
            )}
          </div>
        </section>
        <section className="mt-10">
          <h2 className="text-xl font-semibold">
            Zoekmeldingen ({searchesQuery.data?.length || 0})
          </h2>
          <div className="mt-4 space-y-3">
            {searchesQuery.data?.map((search) => (
              <article
                key={search.id}
                className="rounded-xl border bg-card p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      to={searchUrl(search.criteria)}
                      className="font-semibold text-primary underline underline-offset-2"
                    >
                      {search.name}
                    </Link>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      {criteriaSummary(search.criteria)}
                    </p>
                    <p className="mt-3 flex items-center gap-2 text-sm">
                      <Bell className="h-4 w-4" />
                      {search.email_enabled
                        ? `${search.email_frequency === "weekly" ? "Wekelijks" : "Dagelijks"} bij nieuwe matches`
                        : "E-mailmelding staat uit"}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={busyId === search.id}
                    onClick={() => changeSearch(search)}
                    aria-label={`Verwijder zoekmelding ${search.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-4">
                  <label className="flex items-center gap-2 text-sm">
                    <Switch
                      checked={search.email_enabled}
                      disabled={busyId === search.id}
                      onCheckedChange={(value) =>
                        changeSearch(search, { email_enabled: value })
                      }
                      aria-label={`E-mailmelding voor ${search.name}`}
                    />
                    E-mail aan
                  </label>
                  <Select
                    value={search.email_frequency || "daily"}
                    disabled={busyId === search.id}
                    onValueChange={(value) =>
                      changeSearch(search, { email_frequency: value })
                    }
                  >
                    <SelectTrigger
                      className="w-[160px]"
                      aria-label={`Frequentie voor ${search.name}`}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Dagelijks</SelectItem>
                      <SelectItem value="weekly">Wekelijks</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button asChild variant="outline" size="sm">
                    <Link to={searchUrl(search.criteria)}>Bekijk matches</Link>
                  </Button>
                </div>
              </article>
            ))}
            {searchesQuery.isError && (
              <p role="alert">Je zoekmeldingen konden niet worden geladen.</p>
            )}
            {searchesQuery.isSuccess && !searchesQuery.data.length && (
              <p className="rounded-xl border bg-card p-6 text-muted-foreground">
                Je hebt nog geen zoekmeldingen. Stel je zoekcriteria in en kies
                ‘Zoekmelding instellen’.
              </p>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
