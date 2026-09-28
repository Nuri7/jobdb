import { useState } from "react";
import { Link } from "react-router-dom";
import { Building2, ExternalLink, Heart, MapPin, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { PublicJob } from "@/lib/api/publicJobs";
import { displaySalary } from "@/lib/jobDisplay";
import { jobPath } from "@/lib/jobSlug";

type Props = {
  job: PublicJob;
  saved?: boolean;
  onSave?: (job: PublicJob) => Promise<void> | void;
};

function relativeDate(value: string | null) {
  if (!value) return null;
  const days = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000));
  if (days === 0) return "Vandaag";
  if (days === 1) return "Gisteren";
  return `${days} dagen geleden`;
}

export default function PublicJobCard({ job, saved = false, onSave }: Props) {
  const [logoFailed, setLogoFailed] = useState(false);
  const companyHost = (() => {
    try { return new URL(job.company.career_url).hostname; } catch { return null; }
  })();
  const logo = companyHost ? `https://${companyHost}/favicon.ico` : null;
  const salary = displaySalary(job.salary_range);

  return (
    <article className="rounded-2xl border bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex gap-4">
        <div className="h-12 w-12 shrink-0 rounded-xl border bg-muted/50 grid place-items-center overflow-hidden">
          {logo && !logoFailed ? (
            <img src={logo} alt="" className="h-8 w-8 object-contain" loading="lazy" onError={() => setLogoFailed(true)} />
          ) : <Building2 className="h-5 w-5 text-muted-foreground" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Link to={jobPath(job)} className="text-lg font-semibold leading-snug hover:text-primary">
                {job.title}
              </Link>
              <p className="mt-1 truncate text-sm font-medium text-muted-foreground">{job.company.name}</p>
            </div>
            {onSave && (
              <Button variant="ghost" size="icon" aria-label={saved ? "Verwijder uit bewaard" : "Bewaar vacature"} onClick={() => onSave(job)}>
                <Heart className={`h-5 w-5 ${saved ? "fill-primary text-primary" : ""}`} />
              </Button>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4" />{job.location || "Nederland"}</span>
            {job.employment_type && <span>{job.employment_type}</span>}
            {salary && <span className="font-medium text-foreground">{salary}</span>}
            {relativeDate(job.first_seen_at) && <span>{relativeDate(job.first_seen_at)}</span>}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {(job.workplace_type === "remote" || job.is_remote) && <Badge variant="secondary">Thuiswerken</Badge>}
            {job.workplace_type === "hybrid" && <Badge variant="secondary">Hybride</Badge>}
            {job.is_internship && <Badge variant="secondary">Stage</Badge>}
            {job.easy_apply && <Badge className="gap-1"><Sparkles className="h-3 w-3" />FairApply geschikt</Badge>}
            {job.experience_level && <Badge variant="outline">{job.experience_level}</Badge>}
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <Button asChild><Link to={jobPath(job)}>Bekijk vacature</Link></Button>
            <Button variant="outline" asChild>
              <a href={`https://fairapply.app/job/${job.id}?source=fairjobs`}>
                Solliciteer met FairApply <Sparkles className="ml-2 h-4 w-4" />
              </a>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <a href={job.url} target="_blank" rel="noopener noreferrer">Werkgever <ExternalLink className="ml-1.5 h-3.5 w-3.5" /></a>
            </Button>
          </div>
        </div>
      </div>
    </article>
  );
}
