import { assertUniqueSlugs, parseRegion } from './parse';
import type { Region } from './types';

// Every markdown file in content/regions is bundled at build time.
// Files starting with "_" are ignored (templates, drafts).
const files = import.meta.glob('/content/regions/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

export function loadRegions(): Region[] {
  const entries = Object.entries(files)
    .map(([path, raw]) => ({ slug: path.split('/').pop()!.replace(/\.md$/, ''), raw }))
    .filter((e) => !e.slug.startsWith('_'));
  assertUniqueSlugs(entries.map((e) => e.slug));
  return entries
    .map((e) => parseRegion(e.slug, e.raw))
    .sort((a, b) => a.country.localeCompare(b.country) || a.name.localeCompare(b.name));
}
