import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Building2,
  ExternalLink,
  Loader2,
  MapPin,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import Header from "@/components/Header";
import { Button } from "@/components/ui/button";
import { fetchJob } from "@/lib/api/publicJobs";
import {
  companyLabel,
  decodeText,
  employmentLabel,
  jobLocation,
} from "@/lib/jobDisplay";
import { jobIdFromSlug } from "@/lib/jobSlug";
import { LAST_SEARCH, safeDestination } from "@/lib/discoveryState";
import { AssignmentFacts } from "@/components/AssignmentFacts";
import { JobFacts, VerificationExplanation } from "@/components/JobFacts";
import { FairApplyHandoff } from "@/components/FairApplyHandoff";
import { trackEvent } from "@/lib/productEvents";

export default function VacancyDetail() {
  const { slug } = useParams<{ slug: string }>();
  const id = jobIdFromSlug(slug);
  const query = useQuery({
    queryKey: ["job-detail", id],
    queryFn: () => fetchJob(id!),
    enabled: Boolean(id),
  });
  const job = query.data;
  const tracked = useRef<string | null>(null);
  let back = "/vacatures";
  try {
    back = safeDestination(sessionStorage.getItem(LAST_SEARCH), "/vacatures");
  } catch {
    /* fallback search */
  }
  useEffect(() => {
    if (!job) return;
    document.title = `${decodeText(job.title)} bij ${companyLabel(job.company.name)} | FairJobs`;
    const meta = document.querySelector('meta[name="description"]');
    const previous = meta?.getAttribute("content");
    meta?.setAttribute(
      "content",
      `${decodeText(job.title)} bij ${companyLabel(job.company.name)} · ${jobLocation(job)}. Bekijk voorwaarden en bron op FairJobs.`,
    );
    if (tracked.current !== job.id) {
      tracked.current = job.id;
      trackEvent("job_open", job.id);
    }
    return () => {
      document.title = "FairJobs — eerlijke vacatures in Nederland";
      if (previous) meta?.setAttribute("content", previous);
    };
  }, [job]);
  if (!id || query.isError)
    return (
      <div className="min-h-screen">
        <Header />
        <main className="container max-w-3xl py-20 text-center">
          <h1 className="text-2xl font-bold">Vacature niet gevonden</h1>
          <p className="mt-2 text-muted-foreground">
            Deze vacature is mogelijk gesloten, verwijderd of valt buiten ons
            Nederlandse aanbod.
          </p>
          <Button asChild className="mt-6">
            <Link to={back}>Terug naar je zoekresultaten</Link>
          </Button>
        </main>
      </div>
    );
  if (query.isLoading || !job)
    return (
      <div className="min-h-screen">
        <Header />
        <div className="grid place-items-center py-32">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
        </div>
      </div>
    );
  return (
    <div className="min-h-screen bg-muted/20">
      <Header />
      <main className="container max-w-4xl py-6 sm:py-8">
        <Button variant="ghost" asChild className="mb-4">
          <Link to={back}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Terug naar zoekresultaten
          </Link>
        </Button>
        <article className="overflow-hidden rounded-2xl border bg-card">
          <header className="border-b p-5 sm:p-9">
            <div className="flex items-start gap-4">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-muted">
                <Building2 className="h-6 w-6 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                  {decodeText(job.title)}
                </h1>
                <p className="mt-2 text-lg text-muted-foreground">
                  {companyLabel(job.company.name)}
                </p>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-4 w-4" />
                {jobLocation(job)}
              </span>
              <span>{employmentLabel(job)}</span>
            </div>
            <JobFacts job={job} detailed />
            <AssignmentFacts job={job} />
            <div className="mt-5">
              <VerificationExplanation />
            </div>
            <Button
              asChild
              className="mt-6"
              variant={!job.description ? "default" : "outline"}
            >
              <a
                href={job.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => trackEvent("source_open", job.id)}
              >
                {job.freelance_details
                  ? "Bekijk bij de bron"
                  : "Direct bij werkgever"}
                <ExternalLink className="ml-2 h-4 w-4" />
              </a>
            </Button>
          </header>
          <div className="p-5 sm:p-9">
            <h2 className="text-xl font-semibold">
              Werkzaamheden en voorwaarden
            </h2>
            {job.description ? (
              <div className="prose prose-slate mt-5 max-w-none break-words dark:prose-invert">
                <ReactMarkdown>{decodeText(job.description)}</ReactMarkdown>
              </div>
            ) : (
              <div className="mt-4 rounded-xl bg-muted/40 p-4">
                <p className="font-medium">
                  De volledige omschrijving ontbreekt op FairJobs.
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  We hebben bij de bron nog geen volledige tekst kunnen ophalen.
                  Open de originele vacature voor de werkzaamheden, eisen en
                  arbeidsvoorwaarden.
                </p>
              </div>
            )}
            <section className="mt-8">
              <h2 className="text-xl font-semibold">Functie-eisen</h2>
              {job.requirements ? (
                <div className="prose prose-slate mt-4 max-w-none break-words">
                  <ReactMarkdown>{decodeText(job.requirements)}</ReactMarkdown>
                </div>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">
                  {job.description
                    ? "Bekijk de eisen in de vacaturetekst hierboven en controleer de volledige voorwaarden bij de bron."
                    : "Geen afzonderlijke functie-eisen beschikbaar. Controleer deze bij de bron voordat je solliciteert."}
                </p>
              )}
            </section>
            <FairApplyHandoff job={job} />
          </div>
        </article>
      </main>
    </div>
  );
}
