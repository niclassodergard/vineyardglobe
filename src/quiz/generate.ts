import type { Grape, Region } from '../content/types';
import type { QuizIndex } from './index';
import { pick, type Rng } from './rng';
import { TEMPLATES, type Template } from './templates';
import type { Card, QuizScope, SubjectRef } from './types';

export interface RoundOptions {
  /** Number of cards wanted (fewer are returned when the filters allow fewer distinct cards). */
  count?: number;
  /** Only ask about this region or grape. Ignores the subject and country filters. */
  focus?: SubjectRef | null;
  /** Keys of cards answered wrongly before; these come back with some probability. */
  missed?: string[];
  /** Ids of recently seen cards to avoid when possible. */
  avoid?: Set<string>;
}

type Subject = Region | Grape;
const MISSED_CHANCE = 0.3;

/** Make a round of distinct cards. Pure apart from the random generator passed in. */
export function makeRound(ix: QuizIndex, scope: QuizScope, rng: Rng, opts: RoundOptions = {}): Card[] {
  const count = opts.count ?? 10;
  const focus = opts.focus ?? null;
  const effective: QuizScope = focus ? { ...scope, country: null, subjects: 'both' } : scope;

  const pools = new Map<Template, Subject[]>();
  for (const t of TEMPLATES) {
    if (focus ? t.kind !== focus.kind : effective.subjects !== 'both' && t.kind !== effective.subjects.slice(0, -1)) continue;
    let subjects = t.subjects(ix, effective);
    if (focus) subjects = subjects.filter((s) => s.slug === focus.slug);
    if (subjects.length) pools.set(t, subjects);
  }
  const templates = [...pools.keys()];
  if (!templates.length) return [];

  const cards: Card[] = [];
  const seen = new Set<string>();
  const keys = new Set<string>();
  const fill = (avoid: Set<string> | undefined) => {
    for (let tries = 0; cards.length < count && tries < count * 40; tries++) {
      let tpl: Template;
      let subject: Subject;
      const key = opts.missed?.length && rng() < MISSED_CHANCE ? pick(opts.missed, rng) : null;
      const m = key && /^([\w-]+)\|(region|grape):(.+)$/.exec(key);
      const known = m && templates.find((t) => t.id === m[1]);
      const target = known && pools.get(known)!.find((s) => s.slug === m![3]);
      if (known && target) {
        tpl = known;
        subject = target;
      } else {
        // Regions and grapes get equal weight, however many templates each has.
        const kinds = [...new Set(templates.map((t) => t.kind))];
        const kind = pick(kinds, rng);
        tpl = pick(templates.filter((t) => t.kind === kind), rng);
        subject = pick(pools.get(tpl)!, rng);
      }
      const card = tpl.build(subject as never, effective, ix, rng);
      if (!card || seen.has(card.id) || (!focus && keys.has(card.key)) || (avoid?.has(card.id) && !opts.missed?.includes(card.key))) continue;
      seen.add(card.id);
      keys.add(card.key);
      cards.push(card);
    }
  };
  fill(opts.avoid);
  if (cards.length < count && opts.avoid?.size) fill(undefined);
  return cards;
}
