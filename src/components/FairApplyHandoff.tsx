import { Link } from "react-router-dom";
import { Sparkles } from "lucide-react";
import type { PublicJob } from "@/lib/api/publicJobs";
import { Button } from "@/components/ui/button";
import { trackEvent } from "@/lib/productEvents";

export function FairApplyHandoff({ job }: { job: PublicJob }) {
  return (
    <section
      className="mt-8 rounded-2xl border border-primary/20 bg-primary/5 p-5 sm:p-6"
      aria-labelledby="fairapply-title"
    >
      <h2
        id="fairapply-title"
        className="flex items-center gap-2 text-lg font-semibold"
      >
        <Sparkles className="h-5 w-5 text-primary" />
        Verder met FairApply
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Open deze vacature in FairApply om je sollicitatie voor te bereiden.
        Daar heb je een account, je cv en je profielgegevens nodig. Eventuele
        credits of kosten zie je daar voordat je verdergaat.
      </p>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Je kunt je documenten en antwoorden controleren. Deze knop verstuurt
        geen sollicitatie en schakelt automatisch solliciteren niet in. In
        FairApply bepaal je zelf of je een sollicitatie goedkeurt of
        automatisering inschakelt.
      </p>
      {!job.description && (
        <p className="mt-3 text-sm font-medium">
          Lees eerst de volledige vacature bij de bron; de omschrijving
          ontbreekt hier.
        </p>
      )}
      <Button asChild className="mt-4">
        <a
          href={`https://fairapply.app/job/${job.id}?source=fairjobs`}
          onClick={() => trackEvent("fairapply_open", job.id)}
        >
          Voorbereiden met FairApply
          <Sparkles className="ml-2 h-4 w-4" />
        </a>
      </Button>
      <p className="mt-3 text-xs text-muted-foreground">
        <Link to="/bewaard" className="underline">
          Je bewaarde vacatures
        </Link>{" "}
        blijven ook beschikbaar op FairJobs.
      </p>
    </section>
  );
}
