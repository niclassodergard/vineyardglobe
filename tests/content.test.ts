import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseGrape, parseRegion } from '../src/content/parse';
import { matchRegions } from '../src/ui/search';
import { applyGrapeFilter } from '../src/ui/filter';

const good = `---
name: Test
country: France
lat: 44
lon: -1
grapes:
  red: [Merlot]
styles: [Red]
---
## Overview
Hello`;

describe('parseRegion', () => {
  it('parses a valid file', () => {
    const r = parseRegion('test', good);
    expect(r.name).toBe('Test');
    expect(r.grapes.white).toEqual([]);
  });
  it('rejects missing frontmatter, bad coordinates and missing grapes', () => {
    expect(() => parseRegion('x', '# nope')).toThrow(/x\.md/);
    expect(() => parseRegion('x', good.replace('lat: 44', 'lat: 99'))).toThrow(/lat/);
    expect(() => parseRegion('x', good.replace('red: [Merlot]', 'red: []'))).toThrow(/grape/);
  });
});

describe('shipped content', () => {
  const dir = join(import.meta.dirname, '..', 'content', 'regions');
  const regions = readdirSync(dir)
    .filter((f) => f.endsWith('.md') && !f.startsWith('_'))
    .map((f) => parseRegion(f.replace(/\.md$/, ''), readFileSync(join(dir, f), 'utf8')));
  it('has at least 40 valid regions', () => expect(regions.length).toBeGreaterThanOrEqual(40));
  it('search finds by name (accent-insensitive), country and grape', () => {
    expect(matchRegions(regions, 'rhone')[0].slug).toBe('rhone-valley');
    expect(matchRegions(regions, 'chile').length).toBeGreaterThan(1);
    expect(matchRegions(regions, 'nebbiolo').map((r) => r.slug)).toContain('piedmont');
  });
  it('grape filter returns matching slugs, or null when empty', () => {
    expect(applyGrapeFilter(regions, new Set())).toBeNull();
    expect(applyGrapeFilter(regions, new Set(['Nebbiolo']))!.has('piedmont')).toBe(true);
  });
});

describe('shipped grape pages', () => {
  const dir = join(import.meta.dirname, '..', 'content', 'grapes');
  const grapes = readdirSync(dir)
    .filter((f) => f.endsWith('.md') && !f.startsWith('_'))
    .map((f) => parseGrape(f.replace(/\.md$/, ''), readFileSync(join(dir, f), 'utf8')));
  const regionDir = join(import.meta.dirname, '..', 'content', 'regions');
  const used = new Set(
    readdirSync(regionDir)
      .filter((f) => f.endsWith('.md') && !f.startsWith('_'))
      .flatMap((f) => {
        const r = parseRegion(f.replace(/\.md$/, ''), readFileSync(join(regionDir, f), 'utf8'));
        return [...r.grapes.red, ...r.grapes.white];
      }),
  );
  it('region files use canonical grape names, not synonyms of a grape that has a page', () => {
    const synonyms = new Map(grapes.flatMap((g) => g.synonyms.map((s) => [s, g.name] as const)));
    for (const name of used) {
      const canonical = synonyms.get(name);
      if (canonical && canonical !== name) throw new Error(`Regions use "${name}"; use the canonical name "${canonical}"`);
    }
  });
  it('has grape pages', () => expect(grapes.length).toBeGreaterThanOrEqual(25));
  it('every grape name matches a grape used in the region files', () => {
    for (const g of grapes) expect(used.has(g.name), `${g.name} is not used by any region`).toBe(true);
  });
});
