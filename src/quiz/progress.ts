import type { Card, QuizScope } from './types';

export const STORAGE_KEY = 'vineyardglobe.quiz.v1';
const MAX_MISSED = 50;

export interface Progress {
  scope: QuizScope;
  bestStreak: number;
  answered: number;
  correct: number;
  /** Keys of cards answered wrongly and not yet answered correctly since. Newest first. */
  missed: string[];
}

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export const defaultProgress = (): Progress => ({
  scope: { subjects: 'both', country: null, difficulty: 'easy' },
  bestStreak: 0,
  answered: 0,
  correct: 0,
  missed: [],
});

/** The browser's localStorage, or null where it is unavailable (private mode, blocked, tests). */
export function browserStorage(): Store | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

const count = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);

/** Read saved progress, falling back to defaults for anything missing or malformed. */
export function loadProgress(store: Store | null = browserStorage()): Progress {
  const p = defaultProgress();
  try {
    const raw = JSON.parse(store?.getItem(STORAGE_KEY) ?? 'null') as Record<string, any> | null;
    if (!raw || typeof raw !== 'object') return p;
    const s = raw.scope ?? {};
    if (['regions', 'grapes', 'both'].includes(s.subjects)) p.scope.subjects = s.subjects;
    if (['easy', 'hard'].includes(s.difficulty)) p.scope.difficulty = s.difficulty;
    if (typeof s.country === 'string') p.scope.country = s.country;
    p.bestStreak = count(raw.bestStreak);
    p.answered = count(raw.answered);
    p.correct = Math.min(count(raw.correct), p.answered);
    if (Array.isArray(raw.missed))
      p.missed = raw.missed.filter((k: unknown): k is string => typeof k === 'string').slice(0, MAX_MISSED);
  } catch {
    return defaultProgress();
  }
  return p;
}

export function saveProgress(p: Progress, store: Store | null = browserStorage()): void {
  try {
    store?.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    /* storage full or blocked: the quiz still works, it just won't remember */
  }
}

export function clearProgress(store: Store | null = browserStorage()): void {
  try {
    store?.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** New progress after one answer. `streak` is the running streak including this answer. */
export function recordAnswer(p: Progress, card: Card, correct: boolean, streak: number): Progress {
  const rest = p.missed.filter((k) => k !== card.key);
  return {
    ...p,
    answered: p.answered + 1,
    correct: p.correct + (correct ? 1 : 0),
    bestStreak: Math.max(p.bestStreak, streak),
    missed: (correct ? rest : [card.key, ...rest]).slice(0, MAX_MISSED),
  };
}
