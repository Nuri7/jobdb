import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const SITE = "https://fairjobs.app";
const API = `${SITE}/api/jobs`;
const OUTPUT = new URL("../dist/", import.meta.url).pathname;
const PAGE_SIZE = 50;
const MAX_JOBS = 500;

const escapeHtml = (value = "") => String(value)
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;").replaceAll("'", "&#039;");

const slugify = (value) => String(value || "vacature")
  .normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "vacature";

function plainText(markdown = "") {
  return String(markdown).replace(/```[\s\S]*?```/g, " ").replace(/[#*_>`\[\]()!-]/g, " ").replace(/\s+/g, " ").trim();
}

async function fetchRecentJobs() {
  const jobs = [];
  for (let offset = 0; offset < MAX_JOBS; offset += PAGE_SIZE) {
    const response = await fetch(`${API}?limit=${PAGE_SIZE}&offset=${offset}&include_description=true`, {
      headers: { accept: "application/json", "x-internal": "true" },
    });
    if (!response.ok) throw new Error(`FairJobs API returned ${response.status}`);
    const payload = await response.json();
    jobs.push(...(payload.data || []));
    if (!payload.meta?.has_more || !payload.data?.length) break;
  }
  return jobs;
}

const baseTemplate = await readFile(join(OUTPUT, "index.html"), "utf8");
let jobs = [];
try { jobs = await fetchRecentJobs(); }
catch (error) { console.warn(`Static vacancy generation skipped: ${error.message}`); }

const sitemapUrls = [
  { loc: SITE, modified: new Date().toISOString() },
  { loc: `${SITE}/vacatures`, modified: new Date().toISOString() },
  { loc: `${SITE}/kaart`, modified: new Date().toISOString() },
];

for (const job of jobs) {
  const slug = `${slugify(job.title)}--${job.id}`;
  const canonical = `${SITE}/vacatures/${slug}`;
  const company = job.company?.name || "werkgever";
  const title = `${job.title} bij ${company} | FairJobs`;
  const summary = plainText(job.description).slice(0, 155) || `${job.title} bij ${company} in ${job.location || "Nederland"}.`;
  const structuredData = JSON.stringify({
    "@context": "https://schema.org", "@type": "JobPosting", title: job.title,
    description: plainText(job.description) || `${job.title} bij ${company}`,
    datePosted: job.first_seen_at || job.posted_date || job.scraped_at,
    validThrough: job.closing_date || undefined, employmentType: job.employment_type || undefined,
    hiringOrganization: { "@type": "Organization", name: company, sameAs: job.company?.career_url || undefined },
    jobLocationType: job.is_remote ? "TELECOMMUTE" : undefined,
    jobLocation: job.location ? { "@type": "Place", address: { "@type": "PostalAddress", addressLocality: job.city || job.location, addressCountry: "NL" } } : undefined,
    url: canonical, directApply: Boolean(job.easy_apply),
  });
  const content = `<main style="max-width:800px;margin:48px auto;padding:0 20px;font-family:system-ui,sans-serif"><p><a href="/vacatures">← Alle vacatures</a></p><h1>${escapeHtml(job.title)}</h1><p><strong>${escapeHtml(company)}</strong> · ${escapeHtml(job.location || "Nederland")}</p><p>${escapeHtml(plainText(job.description).slice(0, 1200))}</p><p><a href="${escapeHtml(job.url)}">Bekijk bij werkgever</a> · <a href="https://fairapply.app/job/${job.id}?source=fairjobs">Solliciteer met FairApply</a></p></main>`;
  const html = baseTemplate
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(title)}</title>`)
    .replace("</head>", `<meta name="description" content="${escapeHtml(summary)}"><link rel="canonical" href="${canonical}"><meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(summary)}"><meta property="og:url" content="${canonical}"><script type="application/ld+json">${structuredData.replaceAll("<", "\\u003c")}</script></head>`)
    .replace('<div id="root"></div>', `<div id="root">${content}</div>`);
  const target = join(OUTPUT, "vacatures", slug);
  await mkdir(target, { recursive: true });
  await writeFile(join(target, "index.html"), html);
  sitemapUrls.push({ loc: canonical, modified: job.scraped_at || new Date().toISOString() });
}

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapUrls.map(({ loc, modified }) => `  <url><loc>${escapeHtml(loc)}</loc><lastmod>${new Date(modified).toISOString()}</lastmod></url>`).join("\n")}\n</urlset>\n`;
await writeFile(join(OUTPUT, "sitemap.xml"), sitemap);
console.log(`Generated ${jobs.length} crawlable vacancy pages and sitemap.xml`);
