import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseGrape, parseRegion } from '../src/content/parse';
import { LEVELS } from '../src/content/types';
import { makeRound } from '../src/quiz/generate';
import { buildIndex, originCountry } from '../src/quiz/index';
import { clearProgress, defaultProgress, loadProgress, recordAnswer, saveProgress, STORAGE_KEY } from '../src/quiz/progress';
import { seeded } from '../src/quiz/rng';
import { aromaFamilies, similarWords, TEMPLATES, usableSynonyms } from '../src/quiz/templates';
import type { Card, QuizScope } from '../src/quiz/types';
import { norm } from '../src/util/text';

const load = <T>(dir: string, parse: (slug: string, raw: string) => T): T[] => {
  const d = join(import.meta.dirname, '..', 'content', dir);
  return readdirSync(d)
    .filter((f) => f.endsWith('.md') && !f.startsWith('_'))
    .map((f) => parse(f.replace(/\.md$/, ''), readFileSync(join(d, f), 'utf8')));
};
const regions = load('regions', parseRegion);
const grapes = load('grapes', parseGrape);
const ix = buildIndex(regions, grapes);

const scopes = (['easy', 'hard'] as const).map((difficulty): QuizScope => ({ subjects: 'both', country: null, difficulty }));

describe('originCountry', () => {
  const c = ['France', 'Spain', 'Portugal', 'Italy'];
  it('takes a single known country, with or without detail', () => {
    expect(originCountry('France (Burgundy)', c)).toBe('France');
    expect(originCountry('Spain', c)).toBe('Spain');
    expect(originCountry('Spain (probably Aragón)', c)).toBe('Spain');
  });
  it('skips several countries, disputed origins and unknown places', () => {
    expect(originCountry('Spain (Galicia) and Portugal (Minho)', c)).toBeNull();
    expect(originCountry('Portugal (Dão or Douro, disputed)', c)).toBeNull();
    expect(originCountry('Italy (Liguria, Sardinia) or Corsica, disputed', c)).toBeNull();
    expect(originCountry('Central Europe (uncertain)', c)).toBeNull();
  });
});

describe('every template, every subject, both difficulties', () => {
  const countryOf = (name: string) => regions.find((r) => r.name === name)!;
  for (const scope of scopes) {
    for (const t of TEMPLATES) {
      it(`${t.id} (${scope.difficulty}) builds valid, true cards`, () => {
        const subjects = t.subjects(ix, scope);
        expect(subjects.length).toBeGreaterThan(0);
        let built = 0;
        for (const s of subjects) {
          for (let seed = 1; seed <= 4; seed++) {
            const card = t.build(s as never, scope, ix, seeded(seed));
            if (!card) continue;
            built++;
            check(card, s as never);
          }
        }
        expect(built).toBeGreaterThan(subjects.length / 2);
      });
    }
  }

  function check(card: Card, s: any): void {
    expect(card.options).toHaveLength(3);
    expect(new Set(card.options.map(norm)).size).toBe(3);
    expect(card.statement.split('___')).toHaveLength(2);
    expect(card.explanation.length).toBeGreaterThan(10);
    expect(card.subject.slug).toBe(s.slug);
    const right = card.options[card.answer];
    const wrong = card.options.filter((_, i) => i !== card.answer);
    const growing = (g: string) => ix.regionsByGrape.get(g) ?? [];
    switch (card.template) {
      case 'region-country':
        expect(right).toBe(s.country);
        wrong.forEach((w) => expect(w).not.toBe(s.country));
        // Regions that cross a border never offer the neighbour as a wrong answer.
        if (s.slug === 'istria') wrong.forEach((w) => expect(['Slovenia', 'Italy']).not.toContain(w));
        if (s.slug.endsWith('rhone') || s.slug === 'rhone-valley') expect(wrong).not.toContain('Switzerland');
        break;
      case 'region-grape': {
        expect([...s.grapes.red, ...s.grapes.white]).toContain(right);
        // A wrong grape may not be listed by any region in the same country.
        wrong.forEach((w) => expect(ix.grapesByCountry.get(s.country)!.has(w)).toBe(false));
        break;
      }
      case 'grape-region': {
        expect(growing(s.name).map((r) => r.name)).toContain(right);
        for (const w of wrong) {
          expect(growing(s.name).map((r) => r.name)).not.toContain(w);
          expect(growing(s.name).some((r) => r.country === countryOf(w).country)).toBe(false);
        }
        expect(card.highlight!.length).toBeGreaterThan(0);
        break;
      }
      case 'grape-synonym': {
        const syn = card.statement.split(' is another name')[0];
        expect(s.synonyms).toContain(syn);
        expect(right).toBe(s.name);
        wrong.forEach((w) => expect(ix.grapeByName.get(w)!.synonyms.map(norm)).not.toContain(norm(syn)));
        // The synonym must not contain the grape's own name, and no wrong grape may share a word with it.
        expect(usableSynonyms(s, ix)).toContain(syn);
        const words = norm(syn).split(/[^a-z]+/).filter((x) => x.length >= 4 && !['blanc', 'noir', 'gris', 'rouge', 'nero'].includes(x));
        for (const w of wrong) {
          const x = ix.grapeByName.get(w)!;
          for (const n of [x.name, ...x.synonyms]) for (const t of norm(n).split(/[^a-z]+/)) expect(words).not.toContain(t);
        }
        break;
      }
      case 'grape-structure': {
        const trait = /has ___ (\w+)\.$/.exec(card.statement)![1] as 'acidity' | 'tannin' | 'body';
        if (trait === 'tannin') expect(s.color).toBe('red');
        const t = LEVELS.indexOf(s.structure[trait]);
        expect(right).toBe(s.structure[trait]);
        wrong.forEach((w) => expect(Math.abs(LEVELS.indexOf(w as never) - t)).toBeGreaterThanOrEqual(2));
        break;
      }
      case 'grape-origin':
        expect(right).toBe(ix.originCountry.get(s.slug));
        wrong.forEach((w) => expect(w).not.toBe(right));
        expect(s.origin).not.toMatch(/probabl|possibl/i);
        if (s.slug === 'zinfandel') expect(wrong).not.toContain('Italy');
        break;
      case 'grape-aroma': {
        expect(s.aromas).toContain(right);
        const ownFamilies = new Set(s.aromas.flatMap((a: string) => [...aromaFamilies(a)]));
        for (const w of wrong) {
          for (const a of s.aromas.map(norm)) {
            expect(norm(w).includes(a)).toBe(false);
            expect(a.includes(norm(w))).toBe(false);
          }
          // No wrong aroma may belong to a family the grape already has (Citrus vs Lemon, Black vs White pepper).
          for (const f of aromaFamilies(w)) expect(ownFamilies.has(f)).toBe(false);
          expect(aromaFamilies(w).size).toBeGreaterThan(0);
        }
        break;
      }
    }
  }
});

describe('similarWords', () => {
  it('catches spelling variants, compounds and shared stems, not unrelated words', () => {
    for (const [a, b] of [['carignano', 'carignan'], ['sylvaner', 'silvaner'], ['rheinriesling', 'riesling'], ['tourigo', 'touriga'], ['ermitage', 'hermitage'], ['traminer', 'gewurztraminer']])
      expect(similarWords(a, b)).toBe(true);
    for (const [a, b] of [['frankovka', 'blaufrankisch'], ['gnanico', 'aglianico'], ['breton', 'cabernet']]) expect(similarWords(a, b)).toBe(false);
  });
});

describe('makeRound', () => {
  const scope = scopes[0];
  it('is reproducible from a seed and yields ten distinct cards', () => {
    const a = makeRound(ix, scope, seeded(7));
    const b = makeRound(ix, scope, seeded(7));
    expect(a).toEqual(b);
    expect(a).toHaveLength(10);
    expect(new Set(a.map((c) => c.id)).size).toBe(10);
  });
  it('asks about each region or grape at most once with each card type per round', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const cards = makeRound(ix, scope, seeded(seed), { missed: ['region-grape|region:bordeaux', 'grape-aroma|grape:syrah'] });
      expect(new Set(cards.map((c) => c.key)).size).toBe(cards.length);
    }
  });
  it('respects the subject filter', () => {
    const only = (subjects: QuizScope['subjects'], kind: string) =>
      makeRound(ix, { ...scope, subjects }, seeded(3), { count: 20 }).every((c) => c.subject.kind === kind);
    expect(only('regions', 'region')).toBe(true);
    expect(only('grapes', 'grape')).toBe(true);
  });
  it('respects the country filter', () => {
    const cards = makeRound(ix, { ...scope, country: 'Italy' }, seeded(5), { count: 20 });
    expect(cards.length).toBeGreaterThan(5);
    for (const c of cards) {
      if (c.subject.kind === 'region') expect(regions.find((r) => r.slug === c.subject.slug)!.country).toBe('Italy');
      else expect(ix.grapesByCountry.get('Italy')!.has(grapes.find((g) => g.slug === c.subject.slug)!.name)).toBe(true);
    }
  });
  it('focuses on one subject and stops when it runs out of distinct cards', () => {
    const cards = makeRound(ix, scope, seeded(2), { focus: { kind: 'region', slug: 'piedmont' }, count: 5 });
    expect(cards.length).toBeGreaterThan(0);
    expect(cards.every((c) => c.subject.slug === 'piedmont')).toBe(true);
    const grape = makeRound(ix, scope, seeded(2), { focus: { kind: 'grape', slug: 'nebbiolo' }, count: 5 });
    expect(grape.every((c) => c.subject.slug === 'nebbiolo')).toBe(true);
  });
  it('returns nothing when no card fits', () => {
    expect(makeRound(ix, { ...scope, country: 'Atlantis' }, seeded(1))).toEqual([]);
  });
  it('avoids recent cards when it can', () => {
    const first = makeRound(ix, scope, seeded(1));
    const again = makeRound(ix, scope, seeded(1), { avoid: new Set(first.map((c) => c.id)) });
    expect(again.filter((c) => first.some((f) => f.id === c.id))).toHaveLength(0);
  });
  it('brings missed cards back even when they were just seen', () => {
    const key = 'region-country|region:piedmont';
    const avoid = new Set([`${key}|italy`]);
    const seen = Array.from({ length: 20 }, (_, i) =>
      makeRound(ix, scope, seeded(i + 1), { missed: [key], avoid }).some((c) => c.key === key),
    );
    expect(seen.filter(Boolean).length).toBeGreaterThan(5);
  });
  it('brings missed cards back', () => {
    const key = 'region-country|region:piedmont';
    const seen = Array.from({ length: 20 }, (_, i) =>
      makeRound(ix, scope, seeded(i + 1), { missed: [key] }).some((c) => c.key === key),
    );
    expect(seen.filter(Boolean).length).toBeGreaterThan(5);
  });
});

describe('progress', () => {
  const memory = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
  };
  const card = { key: 'a|region:x' } as Card;
  it('round-trips and tracks missed cards', () => {
    const store = memory();
    let p = recordAnswer(defaultProgress(), card, false, 0);
    expect(p.missed).toEqual(['a|region:x']);
    p = recordAnswer(p, card, true, 1);
    expect(p).toMatchObject({ answered: 2, correct: 1, bestStreak: 1, missed: [] });
    saveProgress(p, store);
    expect(loadProgress(store)).toEqual(p);
    clearProgress(store);
    expect(loadProgress(store)).toEqual(defaultProgress());
  });
  it('falls back to defaults for broken or hostile storage', () => {
    const store = memory();
    store.setItem(STORAGE_KEY, '{nope');
    expect(loadProgress(store)).toEqual(defaultProgress());
    store.setItem(STORAGE_KEY, JSON.stringify({ scope: { subjects: 'x', difficulty: 3 }, answered: -4, missed: [1, 'ok'] }));
    expect(loadProgress(store)).toEqual({ ...defaultProgress(), missed: ['ok'] });
    const throwing = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('full'); }, removeItem: () => { throw new Error('x'); } };
    expect(loadProgress(throwing)).toEqual(defaultProgress());
    expect(() => saveProgress(defaultProgress(), throwing)).not.toThrow();
    expect(loadProgress(null)).toEqual(defaultProgress());
  });
});
