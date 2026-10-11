import { assertUniqueSlugs, parseGrape } from './parse';
import type { Grape } from './types';

// Files in content/grapes are bundled at build time; files starting with "_" are ignored.
const files = import.meta.glob('/content/grapes/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

export function loadGrapes(): Grape[] {
  const entries = Object.entries(files)
    .map(([path, raw]) => ({ slug: path.split('/').pop()!.replace(/\.md$/, ''), raw }))
    .filter((e) => !e.slug.startsWith('_'));
  assertUniqueSlugs(entries.map((e) => e.slug), 'grape');
  return entries.map((e) => parseGrape(e.slug, e.raw)).sort((a, b) => a.name.localeCompare(b.name));
}
