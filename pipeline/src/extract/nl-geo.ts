// Normalize messy NL job location strings ("Utrecht, Utrecht", "Amsterdam, NL",
// "Breda, Noord-Brabant") into a clean city + province.

export const NL_PROVINCES = [
  'Groningen', 'Friesland', 'Drenthe', 'Overijssel', 'Flevoland', 'Gelderland', 'Utrecht',
  'Noord-Holland', 'Zuid-Holland', 'Zeeland', 'Noord-Brabant', 'Limburg',
] as const;

const PROVINCE_ALIASES: Record<string, string> = {
  'noord-holland': 'Noord-Holland', 'noord holland': 'Noord-Holland', 'north holland': 'Noord-Holland',
  'zuid-holland': 'Zuid-Holland', 'zuid holland': 'Zuid-Holland', 'south holland': 'Zuid-Holland',
  'noord-brabant': 'Noord-Brabant', 'noord brabant': 'Noord-Brabant', 'north brabant': 'Noord-Brabant',
  'groningen': 'Groningen', 'friesland': 'Friesland', 'fryslân': 'Friesland', 'fryslan': 'Friesland',
  'drenthe': 'Drenthe', 'overijssel': 'Overijssel', 'flevoland': 'Flevoland', 'gelderland': 'Gelderland',
  'utrecht': 'Utrecht', 'zeeland': 'Zeeland', 'limburg': 'Limburg',
};

// City → province for the busiest NL cities/towns (covers the large majority of jobs).
const CITY_PROVINCE: Record<string, string> = {
  amsterdam: 'Noord-Holland', haarlem: 'Noord-Holland', amstelveen: 'Noord-Holland', zaandam: 'Noord-Holland',
  alkmaar: 'Noord-Holland', hoofddorp: 'Noord-Holland', hilversum: 'Noord-Holland', purmerend: 'Noord-Holland',
  hoorn: 'Noord-Holland', velsen: 'Noord-Holland', 'den helder': 'Noord-Holland', beverwijk: 'Noord-Holland',
  rotterdam: 'Zuid-Holland', 'den haag': 'Zuid-Holland', "'s-gravenhage": 'Zuid-Holland', 'the hague': 'Zuid-Holland',
  leiden: 'Zuid-Holland', delft: 'Zuid-Holland', zoetermeer: 'Zuid-Holland', dordrecht: 'Zuid-Holland',
  schiedam: 'Zuid-Holland', gouda: 'Zuid-Holland', spijkenisse: 'Zuid-Holland', 'capelle aan den ijssel': 'Zuid-Holland',
  vlaardingen: 'Zuid-Holland', katwijk: 'Zuid-Holland', 'alphen aan den rijn': 'Zuid-Holland', rijswijk: 'Zuid-Holland',
  utrecht: 'Utrecht', amersfoort: 'Utrecht', nieuwegein: 'Utrecht', zeist: 'Utrecht', houten: 'Utrecht',
  veenendaal: 'Utrecht', woerden: 'Utrecht',
  eindhoven: 'Noord-Brabant', tilburg: 'Noord-Brabant', breda: 'Noord-Brabant', 'den bosch': 'Noord-Brabant',
  "'s-hertogenbosch": 'Noord-Brabant', helmond: 'Noord-Brabant', oss: 'Noord-Brabant', roosendaal: 'Noord-Brabant',
  'bergen op zoom': 'Noord-Brabant', veghel: 'Noord-Brabant', waalwijk: 'Noord-Brabant',
  arnhem: 'Gelderland', nijmegen: 'Gelderland', apeldoorn: 'Gelderland', ede: 'Gelderland', doetinchem: 'Gelderland',
  harderwijk: 'Gelderland', wageningen: 'Gelderland', zutphen: 'Gelderland', tiel: 'Gelderland',
  zwolle: 'Overijssel', enschede: 'Overijssel', deventer: 'Overijssel', hengelo: 'Overijssel', almelo: 'Overijssel',
  groningen: 'Groningen', leeuwarden: 'Friesland', drachten: 'Friesland', sneek: 'Friesland',
  assen: 'Drenthe', emmen: 'Drenthe', meppel: 'Drenthe', hoogeveen: 'Drenthe',
  almere: 'Flevoland', lelystad: 'Flevoland',
  maastricht: 'Limburg', venlo: 'Limburg', heerlen: 'Limburg', sittard: 'Limburg', roermond: 'Limburg', weert: 'Limburg',
  middelburg: 'Zeeland', vlissingen: 'Zeeland', terneuzen: 'Zeeland', goes: 'Zeeland',
};

const NON_CITY = new Set([
  'nederland', 'nl', 'netherlands', 'the netherlands', 'remote', 'thuiswerk', 'hybride', 'hybrid',
  'landelijk', 'divers', 'various', 'meerdere locaties', 'diverse locaties', 'op locatie', 'flexibel',
  '', 'onbekend', 'unknown', 'nvt', 'n.v.t.',
]);

/**
 * Clean a location string into a lowercase city name, or null if it isn't a city.
 * Scans every comma/pipe/slash segment (not just the first) so "province-first" strings
 * ("Noord-Brabant, Eindhoven") and leading-comma strings (", Wassenaar, Zuid-Holland")
 * still resolve, and prefers a segment that is a known city so names shared with a
 * province (Utrecht, Groningen — both cities and provinces) resolve to the city.
 */
export function normalizeCity(location: string | undefined): string | null {
  if (!location) return null;
  const segments = location
    .split(/[,|/]/)
    .map((s) => s.split('(')[0]!.toLowerCase().replace(/\s+/g, ' ').replace(/\.$/, '').trim())
    .filter(Boolean);
  const plausible = (s: string): boolean =>
    s.length >= 2 && s.length <= 40 && !/^\d+$/.test(s) && !NON_CITY.has(s);
  // 1. A segment that is a known NL city wins (handles province-first order + Utrecht/Groningen).
  for (const s of segments) if (plausible(s) && CITY_PROVINCE[s]) return s;
  // 2. Otherwise the first plausible segment that isn't purely a province name.
  for (const s of segments) if (plausible(s) && !PROVINCE_ALIASES[s]) return s;
  return null;
}

/**
 * Province for a location. The city→province lookup is authoritative (clean); an explicit
 * province name in the string is only a fallback for cities we don't know — scanning the
 * whole string is noisy for multi-location postings ("Amsterdam / Rotterdam, Zuid-Holland").
 */
export function provinceOf(location: string | undefined, city: string | null): string | null {
  if (city && CITY_PROVINCE[city]) return CITY_PROVINCE[city];
  if (location) {
    for (const part of location.split(/[,|]/)) {
      const p = PROVINCE_ALIASES[part.trim().toLowerCase()];
      if (p) return p;
    }
  }
  return null;
}

// Whole-word matchers for known NL cities, longest name first. Short names (<4 chars) and a few
// that collide with common words are skipped to avoid false positives when scanning free text.
const AMBIGUOUS_CITY = new Set(['ede', 'oss', 'goes', 'weert']);
const CITY_MATCHERS = Object.keys(CITY_PROVINCE)
  .filter((c) => c.length >= 4 && !AMBIGUOUS_CITY.has(c))
  .sort((a, b) => b.length - a.length)
  .map((c) => ({ city: c, re: new RegExp(`(?:^|[^a-zà-ÿ])${c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:[^a-zà-ÿ]|$)`, 'i') }));

/**
 * Find the first known NL city named in free text (a job title or body) — used to recover a
 * location when a page has no structured location field. High-precision (known cities only).
 */
export function findKnownCity(text: string | undefined): string | null {
  if (!text) return null;
  for (const { city, re } of CITY_MATCHERS) if (re.test(text)) return city;
  return null;
}
