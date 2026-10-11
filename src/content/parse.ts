import { parse as parseYaml } from 'yaml';
import type { Region } from './types';

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

export function splitFrontmatter(raw: string, file: string): { data: Record<string, unknown>; body: string } {
  const m = FRONTMATTER.exec(raw.trim());
  if (!m) throw new Error(`${file}: missing frontmatter block (--- ... ---)`);
  let data: unknown;
  try {
    data = parseYaml(m[1]);
  } catch (e) {
    throw new Error(`${file}: invalid YAML frontmatter: ${(e as Error).message}`);
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new Error(`${file}: frontmatter must be a key/value map`);
  }
  return { data: data as Record<string, unknown>, body: m[2].trim() };
}

function str(v: unknown, field: string, file: string, required = true): string {
  if (typeof v === 'string' && v.trim()) return v.trim();
  if (!required && v === undefined) return '';
  throw new Error(`${file}: "${field}" must be a non-empty string`);
}

function strList(v: unknown, field: string, file: string): string[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v) || v.some((x) => typeof x !== 'string' || !x.trim())) {
    throw new Error(`${file}: "${field}" must be a list of strings`);
  }
  return v.map((x: string) => x.trim());
}

function coord(v: unknown, field: string, limit: number, file: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || Math.abs(v) > limit) {
    throw new Error(`${file}: "${field}" must be a number between -${limit} and ${limit}`);
  }
  return v;
}

/** Validates one region file and returns a typed Region. Throws with the file name on any problem. */
export function parseRegion(slug: string, raw: string): Region {
  const file = `content/regions/${slug}.md`;
  const { data, body } = splitFrontmatter(raw, file);

  const grapesRaw = (data.grapes ?? {}) as Record<string, unknown>;
  if (typeof grapesRaw !== 'object' || Array.isArray(grapesRaw)) {
    throw new Error(`${file}: "grapes" must have "red" and/or "white" lists`);
  }
  const grapes = {
    red: strList(grapesRaw.red, 'grapes.red', file),
    white: strList(grapesRaw.white, 'grapes.white', file),
  };
  if (grapes.red.length + grapes.white.length === 0) {
    throw new Error(`${file}: at least one grape is required under grapes.red or grapes.white`);
  }
  const styles = strList(data.styles, 'styles', file);
  if (styles.length === 0) throw new Error(`${file}: "styles" must contain at least one wine style`);
  if (!body) throw new Error(`${file}: body text is empty`);

  const countryCode = data.countryCode === undefined ? undefined : str(data.countryCode, 'countryCode', file).toUpperCase();
  if (countryCode !== undefined && !/^[A-Z]{2}$/.test(countryCode)) {
    throw new Error(`${file}: "countryCode" must be a 2-letter ISO code`);
  }

  return {
    slug,
    name: str(data.name, 'name', file),
    country: str(data.country, 'country', file),
    countryCode,
    lat: coord(data.lat, 'lat', 90, file),
    lon: coord(data.lon, 'lon', 180, file),
    subregions: strList(data.subregions, 'subregions', file),
    grapes,
    styles,
    climate: str(data.climate, 'climate', file, false) || undefined,
    body,
  };
}

export function assertUniqueSlugs(slugs: string[]): void {
  const seen = new Set<string>();
  for (const s of slugs) {
    if (seen.has(s)) throw new Error(`Duplicate region slug: ${s}`);
    seen.add(s);
  }
}
