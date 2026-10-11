import type { Grape, Region } from '../content/types';
import { norm } from '../util/text';

export interface QuizIndex {
  regions: Region[];
  grapes: Grape[];
  /** Countries that have at least one region, sorted. */
  countries: string[];
  grapeByName: Map<string, Grape>;
  /** Names of grapes listed by any region of a country. */
  grapesByCountry: Map<string, Set<string>>;
  regionsByGrape: Map<string, Region[]>;
  /** Grape names appearing in a red / white list of any region. */
  namesByColor: { red: string[]; white: string[] };
  /** Normalised synonym -> names of grape pages that list it. */
  synonymOwners: Map<string, string[]>;
  /** Country of origin for grapes whose origin is a single known country. */
  originCountry: Map<string, string>;
  /** Other countries, nearest first (by distance between centroids). */
  nearestCountries(country: string): string[];
  /** Other countries, nearest first, measured from a point to each country's closest region. */
  nearestCountriesTo(lat: number, lon: number, exclude: string): string[];
}

function km(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const r = Math.PI / 180;
  const h =
    Math.sin(((bLat - aLat) * r) / 2) ** 2 +
    Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(((bLon - aLon) * r) / 2) ** 2;
  return 12742 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Country from a free-text `origin` such as "France (Burgundy)". Returns null when the origin is
 * not a single known country (several countries, a vague area, or marked as disputed/uncertain).
 */
export function originCountry(origin: string, countries: Iterable<string>): string | null {
  const m = /^([^()]+?)\s*(?:\(([^)]*)\))?\s*$/.exec(origin.trim());
  if (!m) return null;
  const country = m[1].trim();
  if (!new Set(countries).has(country)) return null;
  if (m[2] && /disputed|uncertain|or corsica/i.test(m[2])) return null;
  return country;
}

export function buildIndex(regions: Region[], grapes: Grape[]): QuizIndex {
  const countries = [...new Set(regions.map((r) => r.country))].sort();
  const grapeByName = new Map(grapes.map((g) => [g.name, g]));

  const grapesByCountry = new Map<string, Set<string>>();
  const regionsByGrape = new Map<string, Region[]>();
  const red = new Set<string>();
  const white = new Set<string>();
  const byCountry = new Map<string, Region[]>();
  for (const r of regions) {
    if (!grapesByCountry.has(r.country)) grapesByCountry.set(r.country, new Set());
    byCountry.set(r.country, [...(byCountry.get(r.country) ?? []), r]);
    for (const [list, set] of [
      [r.grapes.red, red],
      [r.grapes.white, white],
    ] as const) {
      for (const g of list) {
        set.add(g);
        grapesByCountry.get(r.country)!.add(g);
        const rs = regionsByGrape.get(g) ?? [];
        if (!rs.includes(r)) rs.push(r);
        regionsByGrape.set(g, rs);
      }
    }
  }

  const synonymOwners = new Map<string, string[]>();
  for (const g of grapes)
    for (const s of g.synonyms) synonymOwners.set(norm(s), [...(synonymOwners.get(norm(s)) ?? []), g.name]);

  const origins = new Map<string, string>();
  for (const g of grapes) {
    const c = originCountry(g.origin, countries);
    if (c) origins.set(g.slug, c);
  }

  const centroid = new Map<string, [number, number]>();
  for (const [c, rs] of byCountry)
    centroid.set(c, [rs.reduce((s, r) => s + r.lat, 0) / rs.length, rs.reduce((s, r) => s + r.lon, 0) / rs.length]);

  const rank = (dist: (country: string) => number, exclude: string) =>
    countries.filter((c) => c !== exclude).sort((a, b) => dist(a) - dist(b) || a.localeCompare(b));

  return {
    regions,
    grapes,
    countries,
    grapeByName,
    grapesByCountry,
    regionsByGrape,
    namesByColor: { red: [...red].sort(), white: [...white].sort() },
    synonymOwners,
    originCountry: origins,
    nearestCountries(country) {
      const c = centroid.get(country);
      if (!c) return countries.filter((x) => x !== country);
      return rank((x) => km(c[0], c[1], ...centroid.get(x)!), country);
    },
    nearestCountriesTo(lat, lon, exclude) {
      return rank((x) => Math.min(...byCountry.get(x)!.map((r) => km(lat, lon, r.lat, r.lon))), exclude);
    },
  };
}
