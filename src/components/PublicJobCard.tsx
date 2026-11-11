import { useState } from "react";
import { Link } from "react-router-dom";
import { Building2, ExternalLink, Heart, MapPin, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AssignmentFacts } from "@/components/AssignmentFacts";
import { JobFacts } from "@/components/JobFacts";
import type { PublicJob } from "@/lib/api/publicJobs";
import {
  companyLabel,
  decodeText,
  employmentLabel,
  jobLocation,
} from "@/lib/jobDisplay";
import { LAST_SEARCH } from "@/lib/discoveryState";
import { trackEvent } from "@/lib/productEvents";
import { jobPath } from "@/lib/jobSlug";

type Props = {
  job: PublicJob;
  saved?: boolean;
  onSave?: (job: PublicJob) => Promise<void> | void;
};

export default function PublicJobCard({ job, saved = false, onSave }: Props) {
  const [logoFailed, setLogoFailed] = useState(false);
  const logo = (() => {
    try {
      return `https://${new URL(job.company.career_url).hostname}/favicon.ico`;
    } catch {
      return null;
    }
  })();
  const rememberSearch = () => {
    if (
      window.location.pathname === "/" ||
      window.location.pathname === "/vacatures"
    ) {
      try {
        sessionStorage.setItem(
          LAST_SEARCH,
          `${window.location.pathname}${window.location.search}`,
        );
      } catch {
        /* optional navigation memory */
      }
    }
  };
  return (
    <article className="rounded-2xl border bg-card p-4 shadow-sm transition hover:border-primary/30 sm:p-5">
      <div className="flex gap-3 sm:gap-4">
        <div className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl border bg-muted/50 sm:h-12 sm:w-12">
          {logo && !logoFailed ? (
            <img
              src={logo}
              alt=""
              className="h-7 w-7 object-contain"
              loading="lazy"
              onError={() => setLogoFailed(true)}
            />
          ) : (
            <Building2 className="h-5 w-5 text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <Link
                to={jobPath(job)}
                onClick={rememberSearch}
                className="text-lg font-semibold leading-snug hover:text-primary"
              >
                {decodeText(job.title)}
              </Link>
              <p className="mt-1 text-sm font-medium text-muted-foreground">
                {companyLabel(job.company.name)}
              </p>
            </div>
            {onSave && (
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0"
                aria-label={saved ? "Verwijder uit bewaard" : "Bewaar vacature"}
                onClick={() =>
                  void Promise.resolve(onSave(job)).catch(() => undefined)
                }
              >
                <Heart
                  className={`h-5 w-5 ${saved ? "fill-primary text-primary" : ""}`}
                />
              </Button>
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-4 w-4" />
              {jobLocation(job)}
            </span>
            {!job.freelance_details && <span>{employmentLabel(job)}</span>}
          </div>
          <JobFacts job={job} />
          <div className="mt-3 flex flex-wrap gap-2">
            {(job.workplace_type === "remote" || job.is_remote) && (
              <Badge variant="secondary">Thuiswerken</Badge>
            )}
            {job.workplace_type === "hybrid" && (
              <Badge variant="secondary">Hybride</Badge>
            )}
            {job.is_internship && <Badge variant="secondary">Stage</Badge>}
            {job.easy_apply && (
              <Badge variant="outline" className="gap-1">
                <Sparkles className="h-3 w-3" />
                FairApply geschikt
              </Badge>
            )}
            {job.experience_level &&
              !(job.is_internship && job.experience_level === "Internship") && (
                <Badge variant="outline">
                  {job.experience_level === "Internship"
                    ? "Stage"
                    : job.experience_level}
                </Badge>
              )}
          </div>
          <AssignmentFacts job={job} compact />
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button asChild>
              <Link to={jobPath(job)} onClick={rememberSearch}>
                Bekijk {job.freelance_details ? "opdracht" : "vacature"}
              </Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <a
                href={job.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => trackEvent("source_open", job.id)}
              >
                {job.freelance_details ? "Bron" : "Werkgever"}
                <ExternalLink className="ml-1 h-3.5 w-3.5" />
              </a>
            </Button>
          </div>
        </div>
      </div>
    </article>
  );
}
