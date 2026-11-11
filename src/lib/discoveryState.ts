import type { JobFilters } from "./api/publicJobs";

export const LAST_SEARCH = "fairjobs:last-search";
export const AUTH_RETURN = "fairjobs:auth-return";
export const PENDING_ALERT = "fairjobs:pending-alert";
export const PENDING_JOB = "fairjobs:pending-job";

export function safeDestination(value: unknown, fallback = "/bewaard") {
  return typeof value === "string" &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.includes("\\") &&
    !value
      .split("")
      .some(
        (character) =>
          character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
      )
    ? value
    : fallback;
}

export function filtersFromParams(params: URLSearchParams): JobFilters {
  const numeric = (key: string) =>
    params.has(key) && Number.isFinite(Number(params.get(key)))
      ? Number(params.get(key))
      : undefined;
  return {
    mode:
      params.get("mode") === "freelance" || params.get("type") === "freelance"
        ? "freelance"
        : "employment",
    search: params.get("q") || undefined,
    location: params.get("location") || undefined,
    radiusKm: params.get("location") ? (numeric("afstand") ?? 25) : undefined,
    jobType: params.get("type") || undefined,
    experienceLevel: params.get("niveau") || undefined,
    workplaceType: params.get("werkplek") || undefined,
    remote: ["1", "true"].includes(params.get("remote") || ""),
    hasSalary: ["1", "true"].includes(params.get("salaris") || ""),
    easyApply: ["1", "true"].includes(params.get("fairapply") || ""),
    postedWithin: numeric("dagen") ?? 30,
    sort: params.get("sort") || "relevance",
    payMin: numeric("bedrag"),
    hoursMin: numeric("uren_vanaf"),
    hoursMax: numeric("uren_tot"),
    startBefore: params.get("start_voor") || undefined,
    closingWithin: numeric("sluit_binnen"),
    page: Math.max(1, numeric("page") || 1),
    limit: 24,
  };
}

export function searchUrl(filters: JobFilters) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({
    q: filters.search,
    location: filters.location,
    afstand: filters.radiusKm,
    mode: filters.mode,
    type: filters.jobType,
    niveau: filters.experienceLevel,
    werkplek: filters.workplaceType,
    dagen: filters.postedWithin,
    bedrag: filters.payMin,
    uren_vanaf: filters.hoursMin,
    uren_tot: filters.hoursMax,
    start_voor: filters.startBefore,
    sluit_binnen: filters.closingWithin,
  })) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  if (filters.hasSalary) params.set("salaris", "1");
  if (filters.easyApply) params.set("fairapply", "1");
  if (filters.remote) params.set("remote", "1");
  return `/vacatures?${params}`;
}

export function criteriaSummary(filters: JobFilters) {
  return [
    filters.mode === "freelance" || filters.jobType === "freelance"
      ? "Freelance & ZZP"
      : "Vacatures",
    filters.search,
    filters.location &&
      `${filters.location}${filters.radiusKm ? ` + ${filters.radiusKm} km` : ""}`,
    filters.jobType && filters.jobType !== "freelance" && filters.jobType,
    filters.experienceLevel,
    filters.workplaceType &&
      ({ remote: "Volledig thuis", hybrid: "Hybride", onsite: "Op locatie" }[
        filters.workplaceType
      ] ||
        filters.workplaceType),
    filters.hasSalary && "Beloning vermeld",
    filters.payMin &&
      `Vanaf € ${filters.payMin}/${filters.mode === "freelance" ? "uur" : "maand"}`,
    filters.hoursMin && `Vanaf ${filters.hoursMin} uur`,
    filters.hoursMax && `Tot ${filters.hoursMax} uur`,
    filters.startBefore && `Start uiterlijk ${filters.startBefore}`,
    filters.closingWithin && `Sluit binnen ${filters.closingWithin} dagen`,
    filters.easyApply && "FairApply geschikt",
  ]
    .filter(Boolean)
    .join(" · ");
}
