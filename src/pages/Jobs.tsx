import { useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  Link,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import {
  Bell,
  BriefcaseBusiness,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import Header from "@/components/Header";
import PublicJobCard from "@/components/PublicJobCard";
import { VerificationExplanation } from "@/components/JobFacts";
import { SaveSearchDialog } from "@/components/SaveSearchDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  fetchJobs,
  fetchJobSuggestions,
  type PublicJob,
} from "@/lib/api/publicJobs";
import {
  AUTH_RETURN,
  PENDING_ALERT,
  PENDING_JOB,
  filtersFromParams,
} from "@/lib/discoveryState";
import { trackEvent } from "@/lib/productEvents";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

const labels: Record<string, string> = {
  fulltime: "Fulltime",
  parttime: "Parttime",
  contract: "Tijdelijk / contract",
  internship: "Stage",
  junior: "Junior",
  medior: "Medior",
  senior: "Senior",
  remote: "Volledig thuis",
  hybrid: "Hybride",
  onsite: "Op locatie",
};
const chipKeys = [
  "type",
  "niveau",
  "werkplek",
  "dagen",
  "salaris",
  "fairapply",
  "bedrag",
  "uren_vanaf",
  "uren_tot",
  "start_voor",
  "sluit_binnen",
  "remote",
];

export default function Jobs() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const route = useLocation();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const filters = useMemo(() => filtersFromParams(params), [params]);
  const freelance = filters.mode === "freelance";
  const page = filters.page || 1;
  const [query, setQuery] = useState(filters.search || "");
  const [location, setLocation] = useState(filters.location || "");
  const [focused, setFocused] = useState<"title" | "location" | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [alertOpen, setAlertOpen] = useState(false);
  const deferredQuery = useDeferredValue(query.trim());
  const deferredLocation = useDeferredValue(location.trim());
  useEffect(() => {
    setQuery(filters.search || "");
    setLocation(filters.location || "");
  }, [filters.search, filters.location]);
  useEffect(() => {
    if (user && sessionStorage.getItem(PENDING_ALERT)) setAlertOpen(true);
  }, [user]);
  const jobsQuery = useQuery({
    queryKey: ["public-jobs", filters],
    queryFn: () => fetchJobs(filters),
  });
  const titles = useQuery({
    queryKey: ["job-suggestions", deferredQuery],
    queryFn: () => fetchJobSuggestions(deferredQuery),
    enabled: focused === "title" && deferredQuery.length >= 2,
    staleTime: 300000,
  });
  const cities = useQuery({
    queryKey: ["location-suggestions", deferredLocation],
    queryFn: () => fetchJobSuggestions(deferredLocation),
    enabled: focused === "location" && deferredLocation.length >= 2,
    staleTime: 300000,
  });
  const savedQuery = useQuery({
    queryKey: ["saved-job-ids", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("job_saved_items")
        .select("job_id")
        .eq("user_id", user!.id);
      if (error) throw error;
      return new Set<string>(
        (data || []).map((row: { job_id: string }) => row.job_id),
      );
    },
  });
  const saveMutation = useMutation({
    mutationFn: async ({ jobId, saved }: { jobId: string; saved: boolean }) => {
      const db = (supabase as any).from("job_saved_items");
      const { error } = saved
        ? await db.delete().eq("user_id", user!.id).eq("job_id", jobId)
        : await db.upsert(
            { user_id: user!.id, job_id: jobId },
            { onConflict: "user_id,job_id" },
          );
      if (error) throw error;
      return { saved: !saved, jobId };
    },
    onSuccess: ({ saved, jobId }) => {
      queryClient.invalidateQueries({ queryKey: ["saved-job-ids", user?.id] });
      if (saved) trackEvent("job_saved", jobId);
      toast.success(
        saved ? "Vacature bewaard" : "Vacature verwijderd uit bewaard",
      );
    },
    onError: () => toast.error("Bewaren is niet gelukt. Probeer het opnieuw."),
  });
  useEffect(() => {
    const pending = sessionStorage.getItem(PENDING_JOB);
    if (user && pending && /^[0-9a-f-]{36}$/i.test(pending)) {
      sessionStorage.removeItem(PENDING_JOB);
      saveMutation.mutate({ jobId: pending, saved: false });
    }
    // Restore a single explicit save action after authentication.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);
  const saveJob = async (job: PublicJob) => {
    if (!user) {
      sessionStorage.setItem(AUTH_RETURN, `${route.pathname}${route.search}`);
      sessionStorage.setItem(PENDING_JOB, job.id);
      navigate("/inloggen", {
        state: { from: `${route.pathname}${route.search}` },
      });
    } else
      await saveMutation.mutateAsync({
        jobId: job.id,
        saved: Boolean(savedQuery.data?.has(job.id)),
      });
  };
  const setFilter = (key: string, value?: string | boolean) => {
    const next = new URLSearchParams(params);
    if (
      value === undefined ||
      value === "" ||
      value === "all" ||
      value === false
    )
      next.delete(key);
    else next.set(key, value === true ? "1" : String(value));
    if (key !== "page") next.delete("page");
    if (key === "werkplek") next.delete("remote");
    if (key === "afstand" && value === "0") next.set(key, "0");
    setParams(next);
  };
  const changeMode = (mode: "employment" | "freelance") => {
    const next = new URLSearchParams(params);
    next.set("mode", mode);
    for (const key of [
      "type",
      "bedrag",
      "uren_vanaf",
      "uren_tot",
      "start_voor",
      "sluit_binnen",
      "page",
      "sort",
    ])
      next.delete(key);
    setParams(next);
  };
  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    const next = new URLSearchParams(params);
    for (const [key, value] of [
      ["q", query],
      ["location", location],
    ]) {
      if (value.trim()) next.set(key, value.trim());
      else next.delete(key);
    }
    if (location.trim() && !next.has("afstand")) next.set("afstand", "25");
    if (!location.trim()) {
      next.delete("afstand");
      if (next.get("sort") === "distance") next.delete("sort");
    }
    next.delete("page");
    setFocused(null);
    setParams(next);
    trackEvent("search");
  };
  const chips = chipKeys
    .filter(
      (key) =>
        params.has(key) && !(key === "type" && params.get(key) === "freelance"),
    )
    .map((key) => {
      const value = params.get(key)!;
      const label = (
        {
          type: labels[value] || value,
          niveau: labels[value] || value,
          werkplek: labels[value] || value,
          dagen: value === "0" ? "Alle datums" : `Gevonden in ${value} dagen`,
          salaris: freelance ? "Tarief vermeld" : "Salaris vermeld",
          fairapply: "FairApply geschikt",
          bedrag: `Vanaf € ${value}/${freelance ? "uur" : "maand"}`,
          uren_vanaf: `Vanaf ${value} uur`,
          uren_tot: `Tot ${value} uur`,
          start_voor: `Start uiterlijk ${value}`,
          sluit_binnen: `Sluit binnen ${value} dagen`,
          remote: "Thuiswerken",
        } as Record<string, string>
      )[key];
      return { key, label };
    });
  const clearFilters = () => {
    const next = new URLSearchParams(params);
    for (const key of [...chipKeys, "sort", "page"]) next.delete(key);
    next.set("mode", filters.mode!);
    setParams(next);
  };
  const total = jobsQuery.data?.meta.total || 0;
  const alternatives = useMemo(() => {
    const options: { label: string; params: URLSearchParams }[] = [];
    if (filters.location && (filters.radiusKm || 0) < 100) {
      const wider = new URLSearchParams(params);
      wider.set("afstand", String(Math.max(50, (filters.radiusKm || 0) * 2)));
      wider.delete("page");
      options.push({
        label: `Vergroot afstand naar ${wider.get("afstand")} km`,
        params: wider,
      });
    }
    if (chips.length) {
      const less = new URLSearchParams(params);
      less.delete(chips[chips.length - 1].key);
      less.delete("page");
      options.push({
        label: `Verwijder ‘${chips[chips.length - 1].label}’`,
        params: less,
      });
    }
    if (filters.location) {
      const nationwide = new URLSearchParams(params);
      nationwide.delete("location");
      nationwide.delete("afstand");
      nationwide.delete("page");
      options.push({ label: "Zoek in heel Nederland", params: nationwide });
    }
    return options.slice(0, 3);
    // Params fully describe the alternatives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);
  const alternativeQueries = useQueries({
    queries: alternatives.map((option) => ({
      queryKey: ["alternative-jobs", option.params.toString()],
      queryFn: () =>
        fetchJobs({ ...filtersFromParams(option.params), limit: 1 }),
      enabled: jobsQuery.isSuccess && !jobsQuery.isFetching && total === 0,
      staleTime: 300000,
    })),
  });
  const fieldSelect = (
    prefix: string,
    key: string,
    label: string,
    options: [string, string][],
    defaultValue = "all",
  ) => (
    <div>
      <Label htmlFor={`${prefix}-${key}`}>{label}</Label>
      <Select
        value={params.get(key) || defaultValue}
        onValueChange={(value) => setFilter(key, value)}
      >
        <SelectTrigger id={`${prefix}-${key}`} className="mt-2">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map(([value, text]) => (
            <SelectItem key={value} value={value}>
              {text}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
  const numberField = (
    prefix: string,
    key: string,
    label: string,
    max: number,
  ) => (
    <div>
      <Label htmlFor={`${prefix}-${key}`}>{label}</Label>
      <Input
        id={`${prefix}-${key}`}
        type="number"
        inputMode="decimal"
        min="0"
        max={max}
        value={params.get(key) || ""}
        onChange={(event) => {
          const value = event.target.value;
          if (value === "" || (Number(value) >= 0 && Number(value) <= max))
            setFilter(key, value);
        }}
        placeholder={key === "uren_tot" ? "Geen maximum" : "Geen minimum"}
        className="mt-2"
      />
    </div>
  );
  const filterFields = (prefix: string) => (
    <div className="mt-5 space-y-5">
      {fieldSelect(
        prefix,
        "dagen",
        "Wanneer gevonden",
        [
          ["0", "Alle datums"],
          ["1", "Vandaag"],
          ["7", "Afgelopen week"],
          ["30", "Afgelopen maand"],
        ],
        "30",
      )}
      {!freelance &&
        fieldSelect(prefix, "type", "Dienstverband", [
          ["all", "Alle dienstverbanden"],
          ["fulltime", "Fulltime"],
          ["parttime", "Parttime"],
          ["contract", "Tijdelijk / contract"],
          ["internship", "Stage"],
        ])}
      {fieldSelect(prefix, "niveau", "Niveau", [
        ["all", "Alle niveaus"],
        ["junior", "Junior"],
        ["medior", "Medior"],
        ["senior", "Senior"],
      ])}
      {fieldSelect(prefix, "werkplek", "Werkplek", [
        ["all", "Alle werkplekken"],
        ["remote", "Volledig thuis"],
        ["hybrid", "Hybride"],
        ["onsite", "Op locatie"],
      ])}
      {numberField(
        prefix,
        "bedrag",
        freelance ? "Budget vanaf (€/uur)" : "Salarisbereik vanaf (€/maand)",
        freelance ? 1000 : 100000,
      )}
      <p className="text-xs text-muted-foreground">
        {freelance
          ? "Filter op het vermelde budget. Een maximumtarief is geen gegarandeerd aanbod."
          : "Alleen bedragen in euro per maand; het vermelde bereik moet je minimum kunnen halen."}
      </p>
      {freelance && (
        <>
          <div className="grid grid-cols-2 gap-3">
            {numberField(prefix, "uren_vanaf", "Uren vanaf", 168)}
            {numberField(prefix, "uren_tot", "Uren tot", 168)}
          </div>
          <div>
            <Label htmlFor={`${prefix}-start`}>Start uiterlijk</Label>
            <Input
              id={`${prefix}-start`}
              type="date"
              value={params.get("start_voor") || ""}
              onChange={(event) => setFilter("start_voor", event.target.value)}
              className="mt-2"
            />
          </div>
          {fieldSelect(prefix, "sluit_binnen", "Reageren binnen", [
            ["all", "Alle deadlines"],
            ["3", "3 dagen"],
            ["7", "7 dagen"],
            ["14", "14 dagen"],
          ])}
        </>
      )}
      {(
        [
          ["salaris", freelance ? "Tarief vermeld" : "Salaris vermeld"],
          ["fairapply", "FairApply geschikt"],
        ] as const
      ).map(([key, label]) => (
        <div key={key} className="flex items-center justify-between gap-3">
          <Label htmlFor={`${prefix}-${key}`}>{label}</Label>
          <Switch
            id={`${prefix}-${key}`}
            checked={params.get(key) === "1"}
            onCheckedChange={(value) => setFilter(key, value)}
          />
        </div>
      ))}
      <Button variant="ghost" className="w-full" onClick={clearFilters}>
        Wis filters
      </Button>
    </div>
  );

  return (
    <div className="min-h-screen bg-muted/20">
      <Header />
      <main>
        <section className="border-b bg-card">
          <div className="container max-w-7xl py-6 sm:py-8">
            <p className="mb-2 text-sm font-semibold text-primary">
              Vacatures en opdrachten. Met de feiten vooraf.
            </p>
            <h1 className="text-2xl font-bold tracking-tight sm:text-4xl">
              Vind werk dat bij je past
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
              Bekijk de bron, beloning en voorwaarden. Bewaar wat past en bereid
              je sollicitatie voor met FairApply.
            </p>
            <div
              className="mt-5 inline-flex gap-1 rounded-xl bg-muted p-1"
              role="group"
              aria-label="Soort werk"
            >
              <Button
                variant={!freelance ? "default" : "ghost"}
                aria-pressed={!freelance}
                onClick={() => changeMode("employment")}
              >
                Vacatures
              </Button>
              <Button
                variant={freelance ? "default" : "ghost"}
                aria-pressed={freelance}
                onClick={() => changeMode("freelance")}
              >
                Freelance & ZZP
              </Button>
            </div>
            <form
              onSubmit={submitSearch}
              className="mt-4 grid gap-2 rounded-2xl border bg-background p-3 shadow-sm sm:grid-cols-[1fr_0.7fr] lg:grid-cols-[1fr_0.65fr_0.34fr_auto]"
            >
              <div className="relative">
                <label htmlFor="job-query" className="sr-only">
                  Functie, vakgebied of trefwoord
                </label>
                <Search className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                <Input
                  id="job-query"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onFocus={() => setFocused("title")}
                  onBlur={() => setFocused(null)}
                  autoComplete="off"
                  className="h-11 pl-10"
                  placeholder="Functie, vakgebied of trefwoord"
                />
                {focused === "title" &&
                  titles.data &&
                  deferredQuery.length >= 2 && (
                    <div className="absolute left-0 right-0 top-12 z-30 max-h-64 overflow-auto rounded-xl bg-popover shadow-lg">
                      {[...titles.data.titles, ...titles.data.companies]
                        .slice(0, 8)
                        .map((text) => (
                          <button
                            type="button"
                            key={text}
                            className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => {
                              setQuery(text);
                              setFocused(null);
                            }}
                          >
                            {text}
                          </button>
                        ))}
                    </div>
                  )}
              </div>
              <div className="relative">
                <label htmlFor="job-location" className="sr-only">
                  Plaats of regio
                </label>
                <Input
                  id="job-location"
                  value={location}
                  onChange={(event) => setLocation(event.target.value)}
                  onFocus={() => setFocused("location")}
                  onBlur={() => setFocused(null)}
                  autoComplete="off"
                  className="h-11"
                  placeholder="Plaats of regio"
                />
                {focused === "location" &&
                  cities.data &&
                  deferredLocation.length >= 2 && (
                    <div className="absolute left-0 right-0 top-12 z-30 rounded-xl bg-popover shadow-lg">
                      {cities.data.cities.slice(0, 6).map((city) => (
                        <button
                          type="button"
                          key={city}
                          className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => {
                            setLocation(city);
                            setFocused(null);
                          }}
                        >
                          {city}
                        </button>
                      ))}
                    </div>
                  )}
              </div>
              <Select
                value={params.get("afstand") || "25"}
                onValueChange={(value) => setFilter("afstand", value)}
              >
                <SelectTrigger aria-label="Zoekafstand" className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[
                    ["0", "Alleen deze plaats"],
                    ["10", "10 km"],
                    ["25", "25 km"],
                    ["50", "50 km"],
                    ["100", "100 km"],
                  ].map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="submit" className="h-11">
                Zoeken
              </Button>
            </form>
          </div>
        </section>
        <div className="container max-w-7xl py-5 sm:py-7">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[250px_minmax(0,1fr)]">
            <aside className="hidden h-fit rounded-2xl border bg-card p-5 lg:block">
              <h2 className="flex items-center gap-2 font-semibold">
                <SlidersHorizontal className="h-4 w-4" />
                Filters{chips.length > 0 && ` · ${chips.length}`}
              </h2>
              {filterFields("desktop")}
            </aside>
            <section
              className="min-w-0"
              aria-label="Zoekresultaten"
              aria-busy={jobsQuery.isFetching}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div aria-live="polite">
                  <h2 className="text-xl font-semibold">
                    {jobsQuery.isLoading
                      ? "Vacatures laden…"
                      : `${total.toLocaleString("nl-NL")} ${freelance ? "opdrachten" : "vacatures"}`}
                  </h2>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setDrawerOpen(true)}
                    className="lg:hidden"
                  >
                    <SlidersHorizontal className="mr-2 h-4 w-4" />
                    Filters{chips.length ? ` · ${chips.length}` : ""}
                  </Button>
                  <Select
                    value={filters.sort}
                    onValueChange={(value) => setFilter("sort", value)}
                  >
                    <SelectTrigger
                      aria-label="Sorteer resultaten"
                      className="w-[165px]"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="relevance">Beste match</SelectItem>
                      <SelectItem value="recent">Recent gevonden</SelectItem>
                      <SelectItem value="salary">
                        {freelance
                          ? "Hoogste uurtarief"
                          : "Hoogste maandsalaris"}
                      </SelectItem>
                      {freelance && (
                        <SelectItem value="deadline">Deadline eerst</SelectItem>
                      )}
                      {filters.location && (
                        <SelectItem value="distance">
                          Dichtstbijzijnde plaats
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {chips.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {chips.map((chip) => (
                    <button
                      key={chip.key}
                      onClick={() => setFilter(chip.key)}
                      className="inline-flex items-center gap-1 rounded-full border bg-card px-3 py-1 text-xs"
                      aria-label={`Verwijder filter ${chip.label}`}
                    >
                      {chip.label}
                      <X className="h-3 w-3" />
                    </button>
                  ))}
                  <button
                    onClick={clearFilters}
                    className="px-1 text-xs text-primary underline"
                  >
                    Wis filters
                  </button>
                </div>
              )}
              <div className="mt-3">
                <VerificationExplanation />
              </div>
              {jobsQuery.data?.meta.expanded_recency && total > 0 && (
                <p className="mt-3 text-sm text-primary">
                  Ook oudere, nog openstaande vacatures worden getoond vanwege
                  het beperkte aantal recente matches.
                </p>
              )}
              {jobsQuery.isFetching && !jobsQuery.isLoading && (
                <p role="status" className="mt-3 text-sm text-muted-foreground">
                  Resultaten bijwerken…
                </p>
              )}
              <div className="mt-5">
                {jobsQuery.isError ? (
                  <div className="rounded-2xl border bg-card p-8 text-center">
                    <BriefcaseBusiness className="mx-auto h-7 w-7 text-muted-foreground" />
                    <h3 className="mt-3 font-semibold">
                      Vacatures konden niet worden geladen
                    </h3>
                    <Button
                      className="mt-4"
                      variant="outline"
                      onClick={() => jobsQuery.refetch()}
                    >
                      Opnieuw proberen
                    </Button>
                  </div>
                ) : jobsQuery.isLoading ? (
                  <div className="grid place-items-center rounded-2xl border bg-card py-20">
                    <Loader2 className="h-7 w-7 animate-spin text-primary" />
                  </div>
                ) : jobsQuery.data?.data.length ? (
                  <div className="space-y-4">
                    {jobsQuery.data.data.map((job) => (
                      <PublicJobCard
                        key={job.id}
                        job={job}
                        saved={savedQuery.data?.has(job.id)}
                        onSave={saveJob}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border bg-card p-6 text-center sm:p-10">
                    <h3 className="text-lg font-semibold">
                      Geen passende {freelance ? "opdrachten" : "vacatures"}{" "}
                      gevonden
                    </h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Probeer een van deze aanpassingen, of ontvang een melding
                      zodra er iets past.
                    </p>
                    <div className="mt-5 flex flex-col items-center gap-2">
                      {alternatives.map((option, index) => (
                        <Button
                          variant="outline"
                          key={option.label}
                          onClick={() => setParams(option.params)}
                        >
                          {option.label}
                          {alternativeQueries[index].data &&
                            ` · ${alternativeQueries[index].data!.meta.total.toLocaleString("nl-NL")}`}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              {!jobsQuery.isLoading && !jobsQuery.isError && (
                <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-primary/20 bg-primary/5 p-5">
                  <div>
                    <h3 className="font-semibold">
                      Ontvang nieuwe passende vacatures
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Jouw zoekcriteria, dagelijks of wekelijks per e-mail.
                    </p>
                  </div>
                  <Button variant="outline" onClick={() => setAlertOpen(true)}>
                    <Bell className="mr-2 h-4 w-4" />
                    Zoekmelding instellen
                  </Button>
                </div>
              )}
              {total > 0 && (
                <div className="mt-6 flex items-center justify-center gap-3">
                  <Button
                    variant="outline"
                    disabled={page <= 1 || jobsQuery.isFetching}
                    onClick={() => setFilter("page", String(page - 1))}
                  >
                    <ChevronLeft className="mr-1 h-4 w-4" />
                    Vorige
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Pagina {page}
                  </span>
                  <Button
                    variant="outline"
                    disabled={
                      !jobsQuery.data?.meta.has_more || jobsQuery.isFetching
                    }
                    onClick={() => {
                      setFilter("page", String(page + 1));
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                  >
                    Volgende
                    <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                </div>
              )}
              {user && (
                <p className="mt-5 text-center text-sm">
                  <Link to="/bewaard" className="text-primary underline">
                    Mijn bewaarde vacatures en zoekmeldingen
                  </Link>
                </p>
              )}
            </section>
          </div>
        </div>
        <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
          <SheetContent className="w-full overflow-y-auto sm:max-w-md">
            <SheetHeader>
              <SheetTitle>
                Filters{chips.length ? ` · ${chips.length} actief` : ""}
              </SheetTitle>
              <SheetDescription>
                Verfijn je zoekopdracht. Resultaten worden direct bijgewerkt.
              </SheetDescription>
            </SheetHeader>
            {filterFields("mobile")}
            <Button
              className="mt-5 w-full"
              onClick={() => setDrawerOpen(false)}
            >
              {jobsQuery.isFetching
                ? "Bekijk resultaten"
                : `Toon ${total.toLocaleString("nl-NL")} resultaten`}
            </Button>
          </SheetContent>
        </Sheet>
        <SaveSearchDialog
          open={alertOpen}
          onOpenChange={setAlertOpen}
          filters={filters}
        />
      </main>
    </div>
  );
}
