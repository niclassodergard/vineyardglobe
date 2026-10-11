import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertUniqueSlugs, parseRegion } from '../src/content/parse';

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
if (failed) {
  console.error(`\n${failed} problem(s) in ${slugs.length} region file(s).`);
  process.exit(1);
}
console.log(`✓ ${slugs.length} region files valid.`);
