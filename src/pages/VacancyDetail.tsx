import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Building2, ExternalLink, Loader2, MapPin, Sparkles } from "lucide-react";
import ReactMarkdown from "react-markdown";
import Header from "@/components/Header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { fetchJob } from "@/lib/api/publicJobs";
import { jobIdFromSlug } from "@/lib/jobSlug";

function setMeta(name: string, content: string, property = false) {
  const attribute = property ? "property" : "name";
  let element = document.head.querySelector(`meta[${attribute}="${name}"]`) as HTMLMetaElement | null;
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attribute, name);
    document.head.appendChild(element);
  }
  element.content = content;
}

export default function VacancyDetail() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const id = jobIdFromSlug(slug);
  const query = useQuery({ queryKey: ["job-detail", id], queryFn: () => fetchJob(id!), enabled: Boolean(id) });
  const job = query.data;

  useEffect(() => {
    if (!job) return;
    const title = `${job.title} bij ${job.company.name} | FairJobs`;
    const description = `${job.title} bij ${job.company.name} in ${job.location || "Nederland"}. Bekijk de vacature en solliciteer direct of met FairApply.`;
    document.title = title;
    setMeta("description", description);
    setMeta("og:title", title, true);
    setMeta("og:description", description, true);
    return () => { document.title = "FairJobs — eerlijke vacatures in Nederland"; };
  }, [job]);

  if (!id || query.isError) {
    return <div className="min-h-screen"><Header /><main className="container max-w-3xl py-20 text-center"><h1 className="text-2xl font-bold">Vacature niet gevonden</h1><p className="mt-2 text-muted-foreground">Deze vacature is mogelijk gesloten of verwijderd.</p><Button asChild className="mt-6"><Link to="/vacatures">Bekijk openstaande vacatures</Link></Button></main></div>;
  }
  if (query.isLoading || !job) return <div className="min-h-screen"><Header /><div className="grid place-items-center py-32"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div></div>;
  const meaningfulSalary = job.salary_range && !/\b(?:eur|€)\s*0(?:\D|$)/i.test(job.salary_range);

  return (
    <div className="min-h-screen bg-muted/20">
      <Header />
      <main className="container max-w-4xl py-8">
        <Button variant="ghost" onClick={() => navigate(-1)} className="mb-5"><ArrowLeft className="mr-2 h-4 w-4" />Terug</Button>
        <Card className="overflow-hidden rounded-2xl">
          <CardContent className="p-0">
            <header className="border-b bg-card p-6 sm:p-9">
              <div className="flex items-start gap-4"><div className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-muted"><Building2 className="h-6 w-6 text-muted-foreground" /></div><div><h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{job.title}</h1><p className="mt-2 text-lg text-muted-foreground">{job.company.name}</p></div></div>
              <div className="mt-5 flex flex-wrap items-center gap-3 text-sm text-muted-foreground"><span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4" />{job.location || "Nederland"}</span>{job.employment_type && <span>{job.employment_type}</span>}{meaningfulSalary && <span className="font-medium text-foreground">{job.salary_range}</span>}</div>
              <div className="mt-4 flex flex-wrap gap-2">{job.is_remote && <Badge variant="secondary">Thuiswerken</Badge>}{job.is_internship && <Badge variant="secondary">Stage</Badge>}{job.easy_apply && <Badge><Sparkles className="mr-1 h-3 w-3" />FairApply geschikt</Badge>}{job.experience_level && <Badge variant="outline">{job.experience_level}</Badge>}</div>
              <div className="mt-7 flex flex-wrap gap-3"><Button size="lg" asChild><a href={`https://fairapply.app/job/${job.id}?source=fairjobs`}>Solliciteer met FairApply<Sparkles className="ml-2 h-4 w-4" /></a></Button><Button size="lg" variant="outline" asChild><a href={job.url} target="_blank" rel="noopener noreferrer">Direct bij werkgever<ExternalLink className="ml-2 h-4 w-4" /></a></Button></div>
            </header>
            <div className="bg-card p-6 sm:p-9">
              <h2 className="text-xl font-semibold">Over deze vacature</h2>
              {job.description ? <div className="prose prose-slate mt-5 max-w-none dark:prose-invert"><ReactMarkdown>{job.description}</ReactMarkdown></div> : <p className="mt-4 text-muted-foreground">De werkgever heeft geen volledige omschrijving beschikbaar gemaakt. Open de vacature bij de werkgever voor alle details.</p>}
              {job.requirements && <><h2 className="mt-9 text-xl font-semibold">Functie-eisen</h2><div className="prose prose-slate mt-4 max-w-none dark:prose-invert"><ReactMarkdown>{job.requirements}</ReactMarkdown></div></>}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
