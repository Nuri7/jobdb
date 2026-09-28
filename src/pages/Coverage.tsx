import { useQuery } from "@tanstack/react-query";
import { Activity, AlertTriangle, Building2, Database, RefreshCw, Search } from "lucide-react";
import { Link } from "react-router-dom";
import Header from "@/components/Header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/hooks/useAuth";

type CoverageStats = {
  generated_at: string;
  companies: {
    total: number;
    enabled: number;
    verified: number;
    unverified: number;
    ambiguous: number;
    dead: number;
    fresh_48h: number;
    stale_7d: number;
    never_succeeded: number;
  };
  jobs: {
    open_all: number;
    closed: number;
    public_open: number;
    fresh_7d: number;
    fresh_30d: number;
    with_salary: number;
    with_location: number;
    from_ats: number;
  };
  runs_24h: { total: number; success: number; partial: number; failed: number; running: number };
  sources: Array<{ source: string; companies: number; public_open_jobs: number }>;
  candidates: Record<string, number>;
  top_errors_24h: Array<{ message: string; n: number }>;
};

const n = new Intl.NumberFormat("nl-NL");
const percent = (part: number, total: number) => total > 0 ? Math.round((part / total) * 100) : 0;

function apiBase() {
  return import.meta.env.DEV
    ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/api`
    : "/api";
}

function Metric({ label, value, detail, icon: Icon }: {
  label: string;
  value: number;
  detail: string;
  icon: typeof Database;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{label}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold">{n.format(value)}</div>
        <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}

function QualityRow({ label, value, total }: { label: string; value: number; total: number }) {
  const score = percent(value, total);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span>{label}</span>
        <span className="font-medium">{n.format(value)} · {score}%</span>
      </div>
      <Progress value={score} className="h-2" />
    </div>
  );
}

export default function Coverage() {
  const { session } = useAuth();
  const query = useQuery({
    queryKey: ["admin-coverage"],
    enabled: Boolean(session?.access_token),
    refetchInterval: 5 * 60 * 1000,
    queryFn: async () => {
      const response = await fetch(`${apiBase()}/coverage`, {
        headers: { Authorization: `Bearer ${session?.access_token}`, Accept: "application/json" },
      });
      if (!response.ok) throw new Error("Dekkingsgegevens konden niet worden geladen.");
      const body = await response.json() as { data: CoverageStats };
      return body.data;
    },
  });

  const data = query.data;
  return (
    <div className="min-h-screen bg-muted/20">
      <Header />
      <main className="container max-w-7xl py-8">
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Dekking & pipeline</h1>
            <p className="mt-2 text-muted-foreground">
              Exacte zoekdekking, bronkwaliteit en recente verwerkingsresultaten.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" asChild><Link to="/admin">Vacaturebeheer</Link></Button>
            <Button variant="outline" onClick={() => query.refetch()} disabled={query.isFetching}>
              <RefreshCw className={`mr-2 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />Vernieuwen
            </Button>
          </div>
        </div>

        {query.isError && (
          <Alert variant="destructive" className="mb-6">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Laden mislukt</AlertTitle>
            <AlertDescription>{query.error.message}</AlertDescription>
          </Alert>
        )}

        {!data ? (
          <div className="grid min-h-64 place-items-center text-muted-foreground">
            <RefreshCw className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Metric label="Publieke vacatures" value={data.jobs.public_open} detail={`${n.format(data.jobs.fresh_30d)} nieuw in 30 dagen`} icon={Search} />
              <Metric label="Actieve bronnen" value={data.companies.enabled} detail={`${n.format(data.companies.fresh_48h)} succesvol in 48 uur`} icon={Building2} />
              <Metric label="Runs in 24 uur" value={data.runs_24h.total} detail={`${n.format(data.runs_24h.success)} succesvol · ${n.format(data.runs_24h.failed)} mislukt`} icon={Activity} />
              <Metric label="Nieuwe kandidaten" value={data.candidates.new ?? 0} detail={`${n.format(data.candidates.accepted ?? 0)} geaccepteerd · ${n.format(data.candidates.retry ?? 0)} opnieuw proberen`} icon={Database} />
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader><CardTitle>Vacaturekwaliteit</CardTitle><CardDescription>Van de publiek doorzoekbare vacatures</CardDescription></CardHeader>
                <CardContent className="space-y-5">
                  <QualityRow label="Locatie beschikbaar" value={data.jobs.with_location} total={data.jobs.public_open} />
                  <QualityRow label="Gestructureerde salarisindicatie" value={data.jobs.with_salary} total={data.jobs.public_open} />
                  <QualityRow label="Directe ATS-bron" value={data.jobs.from_ats} total={data.jobs.public_open} />
                  <QualityRow label="Nieuw in 30 dagen" value={data.jobs.fresh_30d} total={data.jobs.public_open} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>Brongezondheid</CardTitle><CardDescription>Van alle ingeschakelde bedrijfsbronnen</CardDescription></CardHeader>
                <CardContent className="space-y-5">
                  <QualityRow label="Succesvol in 48 uur" value={data.companies.fresh_48h} total={data.companies.enabled} />
                  <QualityRow label="Geverifieerd" value={data.companies.verified} total={data.companies.total} />
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Badge variant="secondary">{n.format(data.companies.unverified)} niet geverifieerd</Badge>
                    <Badge variant="secondary">{n.format(data.companies.ambiguous)} onzeker</Badge>
                    <Badge variant="destructive">{n.format(data.companies.dead)} dood</Badge>
                    <Badge variant="outline">{n.format(data.companies.never_succeeded)} nooit gelukt</Badge>
                    <Badge variant="outline">{n.format(data.companies.stale_7d)} ouder dan 7 dagen</Badge>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader><CardTitle>Dekking per bron</CardTitle><CardDescription>Bedrijven en actuele publieke vacatures per adapter</CardDescription></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader><TableRow><TableHead>Bron</TableHead><TableHead className="text-right">Bedrijven</TableHead><TableHead className="text-right">Vacatures</TableHead><TableHead className="text-right">Vacatures / bedrijf</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {data.sources.map((row) => (
                      <TableRow key={row.source}>
                        <TableCell className="font-medium">{row.source}</TableCell>
                        <TableCell className="text-right">{n.format(row.companies)}</TableCell>
                        <TableCell className="text-right">{n.format(row.public_open_jobs)}</TableCell>
                        <TableCell className="text-right">{row.companies ? (row.public_open_jobs / row.companies).toFixed(1) : "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Fouten in de afgelopen 24 uur</CardTitle><CardDescription>{data.runs_24h.partial} gedeeltelijk · {data.runs_24h.failed} mislukt · {data.runs_24h.running} actief</CardDescription></CardHeader>
              <CardContent>
                {data.top_errors_24h.length === 0 ? <p className="text-sm text-muted-foreground">Geen fouten geregistreerd.</p> : (
                  <div className="space-y-3">
                    {data.top_errors_24h.map((error) => <div key={error.message} className="flex gap-3 text-sm"><Badge variant="destructive">{error.n}×</Badge><span className="break-all text-muted-foreground">{error.message}</span></div>)}
                  </div>
                )}
              </CardContent>
            </Card>

            <p className="text-xs text-muted-foreground">Berekend op {new Date(data.generated_at).toLocaleString("nl-NL")}. Alle aantallen zijn exact.</p>
          </div>
        )}
      </main>
    </div>
  );
}
