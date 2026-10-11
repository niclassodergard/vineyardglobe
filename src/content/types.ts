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
