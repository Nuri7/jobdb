import type { PublicJob } from "./api/publicJobs";

export function decodeText(value: string) {
  const named: Record<string, string> = {
    amp: "&",
    quot: '"',
    apos: "'",
    nbsp: " ",
    ndash: "–",
    mdash: "—",
    eacute: "é",
    euml: "ë",
    lt: "<",
    gt: ">",
  };
  return value.replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (match, entity: string) => {
    if (!entity.startsWith("#")) return named[entity.toLowerCase()] ?? match;
    const code =
      entity[1].toLowerCase() === "x"
        ? parseInt(entity.slice(2), 16)
        : Number(entity.slice(1));
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
  });
}

export function displaySalary(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  let salary = value.trim().replace(/\s+/g, " ");
  const numbers = [...salary.matchAll(/\d[\d.,]*/g)]
    .map(([raw]) =>
      Number(raw.replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", ".")),
    )
    .filter(Number.isFinite);
  if (numbers.length && numbers.every((number) => number === 0)) return null;
  salary = salary
    .replace(/^EUR\s*/i, "€ ")
    .replace(/^USD\s*/i, "$ ")
    .replace(/^GBP\s*/i, "£ ");
  salary = salary
    .replace(/\/month\b|per month\b/gi, "/maand")
    .replace(/\/hour\b|per hour\b/gi, "/uur")
    .replace(/\/year\b|per year\b/gi, "/jaar")
    .replace(/\/day\b/gi, "/dag");
  salary = salary.replace(/\d[\d.,]*/g, (raw) => {
    const n = Number(raw.replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", "."));
    return Number.isFinite(n)
      ? new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 2 }).format(n)
      : raw;
  });
  const upperOnly = salary.match(/^([€$£])\s*(?:0\s*)?[–—-]\s*(.+)$/);
  return upperOnly ? `Tot ${upperOnly[1]} ${upperOnly[2]}` : salary;
}

export function employmentLabel(job: PublicJob) {
  const labels: Record<string, string> = {
    fulltime: "Fulltime",
    parttime: "Parttime",
    contract: "Tijdelijk / contract",
    freelance: "Freelance / ZZP",
    internship: "Stage",
    permanent: "Vast dienstverband",
    "fixed term": "Tijdelijk",
    temporary: "Tijdelijk",
    "full-time": "Fulltime",
    "part-time": "Parttime",
  };
  return (
    labels[(job.employment_type || "").toLowerCase()] ||
    labels[job.employment_type_normalized || ""] ||
    decodeText(job.employment_type || "Dienstverband niet vermeld")
  );
}

export function jobLocation(job: PublicJob) {
  return decodeText(job.location || job.city || "Locatie niet vermeld");
}

export function dateLabel(value?: string | null) {
  if (!value || Number.isNaN(Date.parse(value))) return null;
  return new Intl.DateTimeFormat("nl-NL", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Europe/Amsterdam",
  }).format(new Date(value.length === 10 ? `${value}T12:00:00Z` : value));
}

export function discoveryDate(job: PublicJob) {
  if (dateLabel(job.posted_date))
    return `Geplaatst ${dateLabel(job.posted_date)}`;
  return dateLabel(job.first_seen_at)
    ? `Gevonden ${dateLabel(job.first_seen_at)}`
    : "Publicatiedatum niet vermeld";
}

export function companyLabel(value: string) {
  const name = decodeText(value).trim();
  if (name !== name.toLocaleLowerCase("nl-NL")) return name;
  const acronyms = new Set([
    "asml",
    "kpn",
    "ing",
    "ns",
    "uwv",
    "dji",
    "rwe",
    "dnb",
    "tno",
    "rivm",
    "coa",
    "apg",
    "fnv",
  ]);
  return name
    .split(" ")
    .map((word, index) =>
      acronyms.has(word)
        ? word.toUpperCase()
        : index > 0 && ["de", "het", "van", "en"].includes(word)
          ? word
          : word.charAt(0).toLocaleUpperCase("nl-NL") + word.slice(1),
    )
    .join(" ");
}
