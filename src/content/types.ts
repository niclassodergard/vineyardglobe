export interface Region {
  slug: string;
  name: string;
  country: string;
  countryCode?: string;
  lat: number;
  lon: number;
  subregions: string[];
  grapes: { red: string[]; white: string[] };
  styles: string[];
  climate?: string;
  /** Markdown body (below the frontmatter). */
  body: string;
}

export const LEVELS = ['low', 'medium-low', 'medium', 'medium-high', 'high'] as const;
export type Level = (typeof LEVELS)[number];

export interface Grape {
  slug: string;
  /** Canonical name, spelled exactly as in the region files' grape lists. */
  name: string;
  color: 'red' | 'white';
  synonyms: string[];
  origin: string;
  aromas: string[];
  structure: { acidity: Level; tannin: Level; body: Level };
  pairings: string[];
  body: string;
}
