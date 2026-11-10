import { Badge } from '@/components/ui/badge';
import type { PublicJob } from '@/lib/api/publicJobs';

function date(value?: string | null) {
  if (!value) return null;
  const parsed = new Date(`${value.slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Amsterdam' }).format(parsed);
}

export function AssignmentFacts({ job, compact = false }: { job: PublicJob; compact?: boolean }) {
  const info = job.freelance_details;
  if (!info) return null;
  const hours = info.hours_min && info.hours_max && info.hours_min !== info.hours_max
    ? `${info.hours_min}–${info.hours_max}` : info.hours_max || info.hours_min;
  const closing = info.closing_at && !Number.isNaN(Date.parse(info.closing_at))
    ? new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Amsterdam' }).format(new Date(info.closing_at))
    : date(job.closing_date);
  return (
    <div className="mt-4 space-y-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={job.freelance_eligible === true ? 'secondary' : 'outline'}>
          {job.freelance_eligible === true ? 'Freelance / ZZP' : job.freelance_eligible === false ? 'Geen ZZP' : 'ZZP niet bevestigd'}
        </Badge>
        <a href={job.url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground underline underline-offset-2">Via {info.source_name}</a>
      </div>
      <dl className="flex flex-wrap gap-x-5 gap-y-2 text-muted-foreground">
        {hours && <div><dt className="sr-only">Uren per week</dt><dd>{hours} uur per week</dd></div>}
        {info.start_date && <div><dt className="inline font-medium">Start: </dt><dd className="inline">{date(info.start_date)}</dd></div>}
        {!compact && (info.end_date || info.duration) && <div><dt className="inline font-medium">Einde / duur: </dt><dd className="inline">{date(info.end_date) || info.duration}</dd></div>}
        {closing && <div><dt className="inline font-medium">Reageren vóór: </dt><dd className="inline">{closing}{info.closing_at ? ' (Nederlandse tijd)' : ''}</dd></div>}
        {!compact && info.reference && <div><dt className="inline font-medium">Referentie: </dt><dd className="inline">{info.reference}</dd></div>}
      </dl>
    </div>
  );
}
