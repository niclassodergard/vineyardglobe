import { LEVELS, type Grape, type Region } from '../content/types';
import { norm } from '../util/text';
import type { QuizIndex } from './index';
import { pick, sample, shuffle, type Rng } from './rng';
import type { Card, QuizScope, SubjectRef, TemplateId } from './types';

/** A kind of card. `subjects` lists what it can be asked about; `build` makes one card or gives up (null). */
export interface Template<T extends Region | Grape = Region | Grape> {
  id: TemplateId;
  kind: 'region' | 'grape';
  subjects(ix: QuizIndex, scope: QuizScope): T[];
  build(subject: T, scope: QuizScope, ix: QuizIndex, rng: Rng): Card | null;
}

const BLANK = '___';

function regionPool(ix: QuizIndex, scope: QuizScope): Region[] {
  return scope.country ? ix.regions.filter((r) => r.country === scope.country) : ix.regions;
}

function grapePool(ix: QuizIndex, scope: QuizScope): Grape[] {
  return scope.country
    ? ix.grapes.filter((g) => ix.grapesByCountry.get(scope.country!)?.has(g.name))
    : ix.grapes;
}

/** Assemble a card from the correct answer and two wrong ones; null unless all three differ. */
function finish(
  template: TemplateId,
  subject: SubjectRef & { name: string },
  statement: string,
  explanation: string,
  correct: string,
  wrong: string[],
  rng: Rng,
  extra: Pick<Card, 'flyTo' | 'highlight'> = {},
): Card | null {
  if (wrong.length !== 2 || !statement.includes(BLANK)) return null;
  if (new Set([correct, ...wrong].map(norm)).size !== 3) return null;
  const options = shuffle([correct, ...wrong], rng);
  const key = `${template}|${subject.kind}:${subject.slug}`;
  return {
    id: `${key}|${norm(correct)}`,
    key,
    template,
    subject: { kind: subject.kind, slug: subject.slug },
    subjectName: subject.name,
    statement,
    options,
    answer: options.indexOf(correct),
    explanation,
    ...extra,
  };
}

/** From candidates ordered nearest-first, hard picks among the closest few; easy picks anywhere. */
function pickByDifficulty<T>(ordered: T[], scope: QuizScope, rng: Rng, closest = 4): T[] {
  return sample(scope.difficulty === 'hard' && ordered.length > closest ? ordered.slice(0, closest) : ordered, 2, rng);
}

/** Other countries a region also extends into, so they can't be offered as wrong answers. */
const ALSO_IN: Record<string, string[]> = {
  istria: ['Italy', 'Slovenia', 'Croatia'],
  'goriska-brda': ['Italy'],
  'rhone-valley': ['Switzerland'],
  'northern-rhone': ['Switzerland'],
  douro: ['Spain'],
};

const regionCountry: Template<Region> = {
  id: 'region-country',
  kind: 'region',
  subjects: regionPool,
  build(r, scope, ix, rng) {
    // "Cyprus is a wine region in Cyprus" gives the answer away.
    if (norm(r.name).includes(norm(r.country)) || norm(r.country).includes(norm(r.name))) return null;
    const also = new Set(ALSO_IN[r.slug] ?? []);
    const others = ix.nearestCountriesTo(r.lat, r.lon, r.country).filter((c) => !also.has(c));
    const sameCountry = ix.regions.filter((x) => x.country === r.country).length;
    return finish(
      this.id,
      { kind: 'region', slug: r.slug, name: r.name },
      `${r.name} is a wine region in ${BLANK}.`,
      `${r.name} is in ${r.country}, one of ${sameCountry} region${sameCountry === 1 ? '' : 's'} in ${r.country} in this atlas.`,
      r.country,
      pickByDifficulty(others, scope, rng),
      rng,
      { flyTo: r.slug },
    );
  },
};

const regionGrape: Template<Region> = {
  id: 'region-grape',
  kind: 'region',
  subjects: regionPool,
  build(r, scope, ix, rng) {
    const red = new Set(r.grapes.red);
    const correct = pick([...r.grapes.red, ...r.grapes.white], rng);
    const color = red.has(correct) ? 'red' : 'white';
    const grownHere = ix.grapesByCountry.get(r.country)!;
    // Never offer a grape that any region of the same country lists, so a wrong option can't be true.
    const ok = (g: string) => !grownHere.has(g) && norm(g) !== norm(correct);
    let pool = (scope.difficulty === 'hard' ? ix.namesByColor[color] : [...ix.namesByColor.red, ...ix.namesByColor.white]).filter(ok);
    if (scope.difficulty === 'hard') {
      const near = new Set(
        ix.nearestCountriesTo(r.lat, r.lon, r.country).slice(0, 4).flatMap((c) => [...ix.grapesByCountry.get(c)!]),
      );
      const nearby = pool.filter((g) => near.has(g));
      if (nearby.length >= 2) pool = nearby;
    }
    return finish(
      this.id,
      { kind: 'region', slug: r.slug, name: r.name },
      `${BLANK} is one of the typical ${color} grapes of ${r.name}.`,
      `${correct} is one of ${r.name}'s typical ${color} grapes in this atlas.`,
      correct,
      sample([...new Set(pool)], 2, rng),
      rng,
      { flyTo: r.slug },
    );
  },
};

const grapeRegion: Template<Grape> = {
  id: 'grape-region',
  kind: 'grape',
  subjects: (ix, scope) =>
    grapePool(ix, scope).filter((g) =>
      ix.regionsByGrape.get(g.name)?.some((r) => !scope.country || r.country === scope.country),
    ),
  build(g, scope, ix, rng) {
    const growing = ix.regionsByGrape.get(g.name)!;
    const candidates = growing.filter((r) => !scope.country || r.country === scope.country);
    const correct = pick(candidates, rng);
    const grownIn = new Set(growing.map((r) => r.country));
    // Wrong regions must not list the grape and must lie in a country where no region lists it.
    const wrong = ix.regions.filter((r) => !grownIn.has(r.country));
    const ordered =
      scope.difficulty === 'hard'
        ? [...wrong].sort(
            (a, b) =>
              Math.hypot(a.lat - correct.lat, a.lon - correct.lon) - Math.hypot(b.lat - correct.lat, b.lon - correct.lon),
          )
        : wrong;
    return finish(
      this.id,
      { kind: 'grape', slug: g.slug, name: g.name },
      `${g.name} is one of the typical grapes of ${BLANK}.`,
      `${g.name} is listed for ${correct.name}, ${correct.country}. It appears in ${growing.length} region${growing.length === 1 ? '' : 's'} in this atlas.`,
      correct.name,
      pickByDifficulty(ordered, scope, rng, 6).map((r) => r.name),
      rng,
      { flyTo: correct.slug, highlight: growing.map((r) => r.slug) },
    );
  },
};

const COLOR_WORDS = new Set(['blanc', 'noir', 'gris', 'rouge', 'nero', 'bianco', 'white', 'black', 'red', 'rosso']);
/** Words of 4+ letters, ignoring colour words, used to spot names that give each other away. */
const tokens = (s: string) => norm(s).split(/[^a-z]+/).filter((t) => t.length >= 4 && !COLOR_WORDS.has(t));
function lev(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
/** Whether two words are the same name or a spelling variant, compound or shared stem of each other. */
export function similarWords(a: string, b: string): boolean {
  if (a.includes(b) || b.includes(a)) return true;
  let p = 0;
  while (p < a.length && p < b.length && a[p] === b[p]) p++;
  return p >= 5 || lev(a, b) <= (Math.min(a.length, b.length) <= 7 ? 1 : 2);
}
/** Whether two words share a run of 5+ letters (Traminac / Gewürztraminer, Frankovka / Blaufränkisch). */
function shareRun(a: string, b: string, n = 5): boolean {
  for (let i = 0; i + n <= a.length; i++) if (b.includes(a.slice(i, i + n))) return true;
  return false;
}
const anySimilar = (xs: string[], ys: string[]) => xs.some((x) => ys.some((y) => similarWords(x, y)));

/** Names used for several different grapes in practice, even though the data lists them once. */
const AMBIGUOUS = new Set(['hermitage', 'malvoisie', 'johannisberg', 'auxerrois', 'klevner', 'carmenet', 'vidure']);

/** Synonyms that point at one grape page, don't contain that grape's own name and aren't ambiguous. */
export function usableSynonyms(g: Grape, ix: QuizIndex): string[] {
  const names = new Set(ix.grapes.map((x) => norm(x.name)));
  const own = tokens(g.name);
  return g.synonyms.filter((s) => {
    const t = tokens(s);
    return (
      ix.synonymOwners.get(norm(s))?.length === 1 &&
      !names.has(norm(s)) &&
      norm(s) !== norm(g.name) &&
      !anySimilar(t, own) &&
      !t.some((w) => own.some((o) => shareRun(w, o))) &&
      !t.some((w) => AMBIGUOUS.has(w))
    );
  });
}

const grapeSynonym: Template<Grape> = {
  id: 'grape-synonym',
  kind: 'grape',
  subjects: (ix, scope) => grapePool(ix, scope).filter((g) => usableSynonyms(g, ix).length > 0),
  build(g, scope, ix, rng) {
    const syn = pick(usableSynonyms(g, ix), rng);
    // A wrong grape must not share a word with the synonym through its name or its own synonyms.
    const words = tokens(syn);
    const clashes = (x: Grape) => [x.name, ...x.synonyms].some((n) => anySimilar(tokens(n), words));
    const wrong = ix.grapes
      .filter((x) => x !== g && !clashes(x) && (scope.difficulty === 'easy' || x.color === g.color))
      .map((x) => x.name);
    return finish(
      this.id,
      { kind: 'grape', slug: g.slug, name: g.name },
      `${syn} is another name for ${BLANK}.`,
      `${syn} is a synonym of ${g.name}.`,
      g.name,
      sample(wrong, 2, rng),
      rng,
      { highlight: ix.regionsByGrape.get(g.name)?.map((r) => r.slug) },
    );
  },
};

const TRAITS = ['acidity', 'tannin', 'body'] as const;

const grapeStructure: Template<Grape> = {
  id: 'grape-structure',
  kind: 'grape',
  subjects: grapePool,
  build(g, scope, ix, rng) {
    // White grapes are not asked about tannin.
    const trait = pick(g.color === 'red' ? TRAITS : TRAITS.filter((t) => t !== 'tannin'), rng);
    const level = g.structure[trait];
    const t = LEVELS.indexOf(level);
    // Neighbouring levels are arguable, so wrong answers sit at least two steps away.
    const far = LEVELS.filter((_, i) => Math.abs(i - t) >= 2);
    const byDistance = shuffle(far, rng).sort((a, b) => Math.abs(LEVELS.indexOf(a) - t) - Math.abs(LEVELS.indexOf(b) - t));
    const wrong = scope.difficulty === 'hard' ? byDistance.slice(0, 2) : byDistance.slice(-2);
    return finish(
      this.id,
      { kind: 'grape', slug: g.slug, name: g.name },
      `${g.name} has ${BLANK} ${trait}.`,
      `In this atlas ${g.name}'s ${trait} is rated ${level}.`,
      level,
      wrong,
      rng,
      { highlight: ix.regionsByGrape.get(g.name)?.map((r) => r.slug) },
    );
  },
};

/** Countries with a serious competing claim to a grape's origin; never offered as wrong answers. */
const CONTESTED_ORIGIN: Record<string, string[]> = { zinfandel: ['Italy'] };

const grapeOrigin: Template<Grape> = {
  id: 'grape-origin',
  kind: 'grape',
  subjects: (ix, scope) =>
    grapePool(ix, scope).filter((g) => ix.originCountry.has(g.slug) && !/probabl|possibl|perhaps|maybe/i.test(g.origin)),
  build(g, scope, ix, rng) {
    const country = ix.originCountry.get(g.slug)!;
    return finish(
      this.id,
      { kind: 'grape', slug: g.slug, name: g.name },
      `${g.name} is believed to originate in ${BLANK}.`,
      `${g.name}'s origin: ${g.origin}.`,
      country,
      pickByDifficulty(
        ix.nearestCountries(country).filter((c) => !CONTESTED_ORIGIN[g.slug]?.includes(c)),
        scope,
        rng,
      ),
      rng,
      { highlight: ix.regionsByGrape.get(g.name)?.map((r) => r.slug) },
    );
  },
};

const overlaps = (a: string, b: string) => a.includes(b) || b.includes(a);

/** Groups of similar descriptors: an aroma is never offered as wrong if the grape has one from its family. */
const FAMILIES: Record<string, string[]> = {
  citrus: ['lemon', 'lime', 'citrus', 'grapefruit', 'orange', 'tangerine', 'mandarin', 'bergamot', 'yuzu'],
  orchard: ['apple', 'pear', 'quince'],
  stone: ['peach', 'apricot', 'nectarine'],
  tropical: ['pineapple', 'mango', 'passion', 'lychee', 'melon', 'banana', 'papaya', 'guava', 'tropical'],
  red: ['strawberry', 'raspberry', 'cherry', 'cranberry', 'red berr', 'red fruit', 'redcurrant', 'red currant', 'pomegranate', 'red plum'],
  black: ['blackberr', 'blackcurrant', 'cassis', 'blueberr', 'black fruit', 'dark fruit', 'plum', 'mulberr', 'black cherry'],
  floral: ['flower', 'floral', 'blossom', 'rose', 'violet', 'jasmine', 'honeysuckle', 'elderflower', 'lavender', 'acacia', 'geranium', 'peony'],
  pepper: ['pepper', 'spice', 'clove', 'cinnamon', 'nutmeg', 'licorice', 'liquorice', 'anise', 'ginger', 'allspice'],
  herb: ['herb', 'thyme', 'sage', 'mint', 'green pepper', 'red pepper', 'bay', 'dill', 'fennel', 'celery', 'lemongrass', 'basil', 'rosemary', 'grass', 'hay', 'tomato', 'capsicum', 'bell pepper'],
  oak: ['vanilla', 'toast', 'oak', 'smoke', 'cedar', 'coconut', 'cigar', 'tobacco', 'butter', 'brioche', 'caramel', 'chocolate', 'cocoa', 'coffee', 'mocha'],
  earth: ['mineral', 'stone', 'flint', 'chalk', 'slate', 'earth', 'truffle', 'mushroom', 'forest', 'leather', 'petrol', 'game', 'graphite', 'pencil', 'saline', 'sea', 'salt', 'meat'],
  nut: ['almond', 'marzipan', 'hazelnut', 'walnut', 'nut'],
  wool: ['lanolin', 'wool'],
  grapey: ['grape', 'musk', 'muscat'],
  dried: ['dried', 'fig', 'raisin', 'prune', 'jam', 'date', 'honey', 'beeswax'],
};
/** Catch-all words that are true of too many grapes to be safe wrong answers. */
const TOO_BROAD = new Set(['spice', 'spices', 'floral', 'flowers', 'citrus', 'herbs', 'fresh herbs', 'mineral', 'minerality', 'red berries', 'tropical fruit', 'cherry', 'apple', 'fruit', 'berries', 'stone fruit']);

export function aromaFamilies(aroma: string): Set<string> {
  const a = norm(aroma);
  return new Set(Object.entries(FAMILIES).filter(([, words]) => words.some((w) => a.includes(w))).map(([f]) => f));
}

/**
 * Wrong aromas are only drawn from descriptors that contrast sharply with the grape's colour: fruit
 * and spice of red wines offered for white grapes, and citrus, orchard, stone and tropical fruit offered
 * for red grapes. Any closer pairing (Pinot Noir and "plum", Sauvignon Blanc and "smoke") can be true
 * of a grape although the atlas does not list it.
 */
const CONTRAST_FAMILIES = { white: ['red', 'black', 'pepper'], red: ['citrus', 'orchard', 'stone', 'tropical'] } as const;

const grapeAroma: Template<Grape> = {
  id: 'grape-aroma',
  kind: 'grape',
  subjects: (ix, scope) => grapePool(ix, scope).filter((g) => g.aromas.length > 0),
  build(g, _scope, ix, rng) {
    const correct = pick(g.aromas, rng);
    const own = g.aromas.map(norm);
    const ownFamilies = new Set(g.aromas.flatMap((a) => [...aromaFamilies(a)]));
    const allowed = new Set<string>(CONTRAST_FAMILIES[g.color]);
    const pool = [
      ...new Set(ix.grapes.filter((x) => x.color !== g.color).flatMap((x) => x.aromas)),
    ].filter((a) => {
      const fams = aromaFamilies(a);
      return (
        !TOO_BROAD.has(norm(a)) &&
        fams.size > 0 &&
        [...fams].every((f) => allowed.has(f) && !ownFamilies.has(f)) &&
        own.every((o) => !overlaps(norm(a), o))
      );
    });
    // The two wrong aromas must also differ clearly from each other (and not share a family).
    const wrong: string[] = [];
    const used = new Set<string>();
    for (const a of shuffle(pool, rng)) {
      const fams = aromaFamilies(a);
      if (wrong.length < 2 && wrong.every((w) => !overlaps(norm(w), norm(a))) && [...fams].every((f) => !used.has(f))) {
        wrong.push(a);
        fams.forEach((f) => used.add(f));
      }
    }
    return finish(
      this.id,
      { kind: 'grape', slug: g.slug, name: g.name },
      `${BLANK} is a typical aroma of ${g.name}.`,
      `${correct} is among ${g.name}'s typical aromas in this atlas.`,
      correct,
      wrong,
      rng,
      { highlight: ix.regionsByGrape.get(g.name)?.map((r) => r.slug) },
    );
  },
};

export const TEMPLATES: Template[] = [
  regionCountry,
  regionGrape,
  grapeRegion,
  grapeSynonym,
  grapeStructure,
  grapeOrigin,
  grapeAroma,
] as unknown as Template[];
