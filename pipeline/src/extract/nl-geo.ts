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

/** Clean a location string into a lowercase city name, or null if it isn't a city. */
export function normalizeCity(location: string | undefined): string | null {
  if (!location) return null;
  let city = location.split(',')[0]!.split('|')[0]!.split('(')[0]!.toLowerCase().trim();
  city = city.replace(/\s+/g, ' ').replace(/\.$/, '').trim();
  if (NON_CITY.has(city) || city.length < 2 || city.length > 40) return null;
  if (/^\d+$/.test(city)) return null; // postcode-only
  if (PROVINCE_ALIASES[city]) return null; // it's a province, not a city
  return city;
}

/** Province for a location: from an explicit province in the string, else the city lookup. */
export function provinceOf(location: string | undefined, city: string | null): string | null {
  if (location) {
    for (const part of location.split(/[,|]/)) {
      const p = PROVINCE_ALIASES[part.trim().toLowerCase()];
      if (p) return p;
    }
  }
  if (city && CITY_PROVINCE[city]) return CITY_PROVINCE[city];
  return null;
}
