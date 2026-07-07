import { describe, expect, it } from 'vitest';
import { findKnownCity, normalizeCity, provinceOf } from '../src/extract/nl-geo.js';

describe('findKnownCity', () => {
  it('finds a known NL city named in free text (e.g. a job title)', () => {
    expect(findKnownCity('GZ Psycholoog ziekenhuis Rotterdam')).toBe('rotterdam');
    expect(findKnownCity('Projectmanager Eindhoven (parttime)')).toBe('eindhoven');
    expect(findKnownCity('Standplaats: Den Haag')).toBe('den haag');
  });
  it('returns null when no known city appears', () => {
    expect(findKnownCity('Senior Backend Developer')).toBeNull();
    expect(findKnownCity('ANIOS Interne Geneeskunde Hardenberg')).toBeNull(); // small town, not in table
    expect(findKnownCity(undefined)).toBeNull();
  });
  it('does not false-match short/ambiguous names inside words', () => {
    expect(findKnownCity('The process goes on')).toBeNull(); // "goes" is ambiguous
    expect(findKnownCity('Bedelaarsstraat')).toBeNull(); // no "ede" whole-word match
  });
});

describe('normalizeCity', () => {
  it('resolves city==province names to the city (previously dropped)', () => {
    expect(normalizeCity('Utrecht, Utrecht')).toBe('utrecht');
    expect(normalizeCity('Utrecht, NL')).toBe('utrecht');
    expect(normalizeCity('Utrecht')).toBe('utrecht');
    expect(normalizeCity('Groningen, Groningen')).toBe('groningen');
  });

  it('finds the city regardless of segment order or leading commas', () => {
    expect(normalizeCity('Noord-Brabant, Eindhoven')).toBe('eindhoven');
    expect(normalizeCity('Noord-Holland, Blaricum')).toBe('blaricum');
    expect(normalizeCity(', Wassenaar, Zuid-Holland')).toBe('wassenaar');
    expect(normalizeCity('Amsterdam / Rotterdam')).toBe('amsterdam');
  });

  it('still handles the simple + parenthetical cases', () => {
    expect(normalizeCity('Amsterdam')).toBe('amsterdam');
    expect(normalizeCity('Rotterdam, Zuid-Holland')).toBe('rotterdam');
    expect(normalizeCity('Amsterdam (remote)')).toBe('amsterdam');
  });

  it('returns null for non-geographic / country-only / empty', () => {
    expect(normalizeCity('Nederland')).toBeNull();
    expect(normalizeCity('NL')).toBeNull();
    expect(normalizeCity('Remote')).toBeNull();
    expect(normalizeCity('Divers')).toBeNull();
    expect(normalizeCity('Noord-Holland')).toBeNull(); // a bare province is not a city
    expect(normalizeCity(undefined)).toBeNull();
    expect(normalizeCity('1234')).toBeNull();
  });
});

describe('provinceOf (with the fixed city detection)', () => {
  it('derives province from the resolved city', () => {
    expect(provinceOf('Utrecht, Utrecht', 'utrecht')).toBe('Utrecht');
    expect(provinceOf('Noord-Brabant, Eindhoven', 'eindhoven')).toBe('Noord-Brabant');
  });
  it('falls back to an explicit province in the string for unknown cities', () => {
    expect(provinceOf(', Wassenaar, Zuid-Holland', 'wassenaar')).toBe('Zuid-Holland');
    expect(provinceOf('Noord-Holland, Blaricum', 'blaricum')).toBe('Noord-Holland');
  });
});
