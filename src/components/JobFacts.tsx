import type { PublicJob } from "@/lib/api/publicJobs";
import { dateLabel, discoveryDate, displaySalary } from "@/lib/jobDisplay";

export function JobFacts({
  job,
  detailed = false,
}: {
  job: PublicJob;
  detailed?: boolean;
}) {
  const salary = displaySalary(job.salary_range);
  const freelance = Boolean(
    job.freelance_details || job.employment_type_normalized === "freelance",
  );
  return (
    <div className="mt-3 space-y-2 text-sm">
      <p
        className={
          salary ? "font-semibold text-foreground" : "text-muted-foreground"
        }
      >
        {salary ||
          (freelance ? "Uurtarief niet vermeld" : "Salaris niet vermeld")}
        {salary && freelance && (
          <>
            {" "}
            <span className="ml-2 font-normal text-muted-foreground">
              {!job.salary_min && job.salary_max
                ? "Maximum budget"
                : "Volgens de bron"}
            </span>
          </>
        )}
      </p>
      <p className="text-xs text-muted-foreground">
        {discoveryDate(job)}
        {job.last_seen_at &&
          ` · Laatst aangetroffen ${dateLabel(job.last_seen_at)}`}
      </p>
      {detailed && (
        <dl className="grid grid-cols-1 gap-3 rounded-xl bg-muted/40 p-4 sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Werkplek</dt>
            <dd className="mt-1 font-medium">
              {{
                remote: "Volledig thuis",
                hybrid: "Hybride",
                onsite: "Op locatie",
              }[job.workplace_type || ""] ||
                (job.is_remote ? "Thuiswerken mogelijk" : "Niet vermeld")}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Uren per week</dt>
            <dd className="mt-1 font-medium">
              {job.freelance_details?.hours_min ||
              job.freelance_details?.hours_max
                ? [
                    job.freelance_details.hours_min,
                    job.freelance_details.hours_max,
                  ]
                    .filter(
                      (value, index, all) =>
                        value && all.indexOf(value) === index,
                    )
                    .join("–")
                : "Niet vermeld"}
            </dd>
          </div>
        </dl>
      )}
    </div>
  );
}

export function VerificationExplanation() {
  return (
    <details className="text-sm text-muted-foreground">
      <summary className="cursor-pointer underline underline-offset-4">
        Hoe controleren we vacatures?
      </summary>
      <p className="mt-3 max-w-2xl leading-relaxed">
        We herkennen vacatures via gestructureerde vacaturegegevens of een
        sollicitatiemogelijkheid bij de bron. We controleren bronnen opnieuw en
        sluiten verlopen of verdwenen vacatures. Land, salaris en
        ZZP-toestemming tonen we alleen voor zover bekend. ‘Laatst aangetroffen’
        is de laatste bronwaarneming; het is geen garantie dat de werkgever nog
        reacties aanneemt. Controleer de voorwaarden altijd bij de bron.
      </p>
    </details>
  );
}
