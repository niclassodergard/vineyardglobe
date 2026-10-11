import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertUniqueSlugs, parseGrape, parseRegion } from '../src/content/parse';

const dir = join(import.meta.dirname, '..', 'content', 'regions');
const slugs = readdirSync(dir)
  .filter((f) => f.endsWith('.md') && !f.startsWith('_'))
  .map((f) => f.replace(/\.md$/, ''));

let failed = 0;
try {
  assertUniqueSlugs(slugs);
} catch (e) {
  console.error((e as Error).message);
  failed++;
}
for (const slug of slugs) {
  try {
    parseRegion(slug, readFileSync(join(dir, `${slug}.md`), 'utf8'));
  } catch (e) {
    console.error(`✗ ${(e as Error).message}`);
    failed++;
  }
}

const grapeDir = join(import.meta.dirname, '..', 'content', 'grapes');
const grapeSlugs = readdirSync(grapeDir)
  .filter((f) => f.endsWith('.md') && !f.startsWith('_'))
  .map((f) => f.replace(/\.md$/, ''));
try {
  assertUniqueSlugs(grapeSlugs, 'grape');
} catch (e) {
  console.error((e as Error).message);
  failed++;
}
const names = new Set<string>();
for (const slug of [...slugs, ...grapeSlugs]) {
  if (!/^[\w-]+$/.test(slug)) {
    console.error(`✗ "${slug}.md": file names may only contain letters, digits, "_" and "-" (needed for deep links)`);
    failed++;
  }
}
for (const slug of grapeSlugs) {
  try {
    const g = parseGrape(slug, readFileSync(join(grapeDir, `${slug}.md`), 'utf8'));
    if (names.has(g.name)) throw new Error(`content/grapes/${slug}.md: duplicate grape name "${g.name}"`);
    names.add(g.name);
  } catch (e) {
    console.error(`✗ ${(e as Error).message}`);
    failed++;
  }
}
if (failed) {
  console.error(`\n${failed} problem(s) in ${slugs.length + grapeSlugs.length} content file(s).`);
  process.exit(1);
}
console.log(`✓ ${slugs.length} region files and ${grapeSlugs.length} grape files valid.`);
