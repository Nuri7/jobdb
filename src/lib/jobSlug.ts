export function slugifyJobTitle(title: string) {
  return title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "vacature";
}

export function jobPath(job: { id: string; title: string }) {
  return `/vacatures/${slugifyJobTitle(job.title)}--${job.id}`;
}

export function jobIdFromSlug(slug?: string) {
  return slug?.match(/--([0-9a-f-]{36})$/i)?.[1] ?? null;
}
