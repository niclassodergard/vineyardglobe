import { makeRound } from '../quiz/generate';
import type { QuizIndex } from '../quiz/index';
import { clearProgress, defaultProgress, loadProgress, recordAnswer, saveProgress, type Progress } from '../quiz/progress';
import { seeded } from '../quiz/rng';
import type { Card, QuizScope, SubjectRef } from '../quiz/types';
import { esc } from '../util/text';

export interface QuizHost {
  /** Open the drawer in quiz mode and return the element to render into. */
  mount(): HTMLElement;
  /** Whether the quiz is what the drawer is showing (keyboard shortcuts only apply then). */
  isActive(): boolean;
  /** An answer was revealed: move or light up the globe. */
  onReveal(card: Card): void;
  /** Leave the revealed state (next card or end of round): put the globe back. */
  onReset(): void;
  /** "Read more": open the region or grape page. */
  onLearn(subject: SubjectRef): void;
}

type Phase = 'start' | 'card' | 'summary';
const ROUND = 10;
const FOCUS_ROUND = 5;
const RECENT = 40;

/** Flash-card quiz. Keeps its state in memory, so leaving for a page and coming back resumes. */
export class Quiz {
  private root: HTMLElement | null = null;
  private phase: Phase = 'start';
  private round: Card[] = [];
  private i = 0;
  private picked: number | null = null;
  private score = 0;
  private streak = 0;
  private wrong: Card[] = [];
  private focus: SubjectRef | null = null;
  private recent: string[] = [];
  private progress: Progress;
  private notice = '';

  constructor(
    private ix: QuizIndex,
    private host: QuizHost,
    private store?: Parameters<typeof loadProgress>[0],
  ) {
    this.progress = loadProgress(store);
    if (this.progress.scope.country && !ix.countries.includes(this.progress.scope.country)) this.progress.scope.country = null;
    addEventListener('keydown', (e) => this.onKey(e));
  }

  /** Show the quiz. With a focus, start a short round about that region or grape. */
  open(focus?: SubjectRef): void {
    this.root = this.host.mount();
    this.root.addEventListener('click', (e) => this.onClick(e));
    this.root.addEventListener('change', (e) => this.onChange(e));
    if (focus) this.start(focus);
    else {
      if (this.phase === 'summary') this.phase = 'start';
      this.render();
    }
  }

  private get card(): Card {
    return this.round[this.i];
  }

  private start(focus: SubjectRef | null): void {
    this.focus = focus;
    this.round = makeRound(this.ix, this.progress.scope, seeded((Math.random() * 2 ** 32) >>> 0), {
      count: focus ? FOCUS_ROUND : ROUND,
      focus,
      missed: this.progress.missed,
      avoid: new Set(this.recent),
    });
    this.i = 0;
    this.picked = null;
    this.score = 0;
    this.streak = 0;
    this.wrong = [];
    this.notice = '';
    if (!this.round.length) {
      this.phase = 'start';
      this.notice = 'No cards can be made for these options. Try a different country or subject.';
    } else {
      this.phase = 'card';
      if (this.round.length < (focus ? FOCUS_ROUND : ROUND))
        this.notice = `Only ${this.round.length} different cards are available for this selection.`;
    }
    this.render();
  }

  private pick(i: number): void {
    if (this.phase !== 'card' || this.picked !== null || !this.card.options[i]) return;
    const card = this.card;
    this.picked = i;
    const right = i === card.answer;
    this.streak = right ? this.streak + 1 : 0;
    if (right) this.score++;
    else this.wrong.push(card);
    if (right) this.recent = [...this.recent, card.id].slice(-RECENT);
    this.progress = recordAnswer(this.progress, card, right, this.streak);
    saveProgress(this.progress, this.store);
    this.host.onReveal(card);
    this.showAnswer(true);
  }

  private next(): void {
    if (this.phase !== 'card' || this.picked === null) return;
    this.host.onReset();
    this.i++;
    this.picked = null;
    if (this.i >= this.round.length) this.phase = 'summary';
    this.render();
  }

  private onClick(e: Event): void {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (!el) return;
    switch (el.dataset.act) {
      case 'start':
        return this.start(null);
      case 'again':
        return this.start(this.focus);
      case 'options':
        this.focus = null;
        this.phase = 'start';
        this.notice = '';
        return this.render();
      case 'pick':
        return this.pick(Number(el.dataset.i));
      case 'next':
        return this.next();
      case 'learn':
        return this.host.onLearn(this.card.subject);
      case 'reset':
        if (confirm('Reset your saved quiz progress?')) {
          clearProgress(this.store);
          this.progress = { ...defaultProgress(), scope: this.progress.scope };
          saveProgress(this.progress, this.store);
          this.recent = [];
          this.render();
          this.root?.querySelector<HTMLElement>('[data-act="start"]')?.focus();
        }
    }
  }

  private onChange(e: Event): void {
    const el = e.target as HTMLSelectElement;
    const s = this.progress.scope;
    if (el.name === 'subjects') s.subjects = el.value as QuizScope['subjects'];
    else if (el.name === 'country') s.country = el.value || null;
    else if (el.name === 'difficulty') s.difficulty = el.value as QuizScope['difficulty'];
    else return;
    saveProgress(this.progress, this.store);
  }

  private onKey(e: KeyboardEvent): void {
    if (!this.host.isActive() || this.phase !== 'card' || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target as HTMLElement;
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName)) return;
    if (e.key >= '1' && e.key <= '3') this.pick(Number(e.key) - 1);
    else if (e.key === 'Enter' && this.picked !== null && t.tagName !== 'BUTTON') this.next();
  }

  // --- rendering ---

  private render(): void {
    if (!this.root) return;
    const html = { start: () => this.startHtml(), card: () => this.cardHtml(), summary: () => this.summaryHtml() }[this.phase]();
    this.root.innerHTML = html;
    if (this.phase === 'card') {
      if (this.picked !== null) {
        this.showAnswer(false);
        this.host.onReveal(this.card);
      }
      this.root.querySelector<HTMLElement>('.quiz-statement')!.focus({ preventScroll: true });
    }
    if (this.picked === null) this.root.closest('.drawer-body')?.scrollTo(0, 0);
  }

  private startHtml(): string {
    const s = this.progress.scope;
    const p = this.progress;
    const opt = (v: string, label: string, cur: string) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(label)}</option>`;
    const pct = p.answered ? Math.round((100 * p.correct) / p.answered) : 0;
    return `
      <p class="eyebrow">Flash cards</p>
      <h2>Test yourself</h2>
      <p class="climate">Rounds of ten multiple-choice cards about the regions and grapes in this atlas.</p>
      <div class="quiz-opts">
        <label>Ask about
          <select name="subjects">${opt('both', 'Regions and grapes', s.subjects)}${opt('regions', 'Regions', s.subjects)}${opt('grapes', 'Grapes', s.subjects)}</select>
        </label>
        <label>Country
          <select name="country">${opt('', 'All countries', s.country ?? '')}${this.ix.countries.map((c) => opt(c, c, s.country ?? '')).join('')}</select>
        </label>
        <label>Difficulty
          <select name="difficulty">${opt('easy', 'Easy: unrelated wrong answers', s.difficulty)}${opt('hard', 'Hard: look-alike wrong answers', s.difficulty)}</select>
        </label>
      </div>
      ${this.notice ? `<p class="quiz-note" role="status">${esc(this.notice)}</p>` : ''}
      <button class="btn quiz-primary" data-act="start">Start a round</button>
      <p class="quiz-stats">${
        p.answered
          ? `Answered ${p.answered} · ${pct}% correct · best streak ${p.bestStreak}`
          : 'Your progress is saved in this browser.'
      }</p>
      ${p.answered ? `<button class="link" data-act="reset">Reset progress</button>` : ''}`;
  }

  private cardHtml(): string {
    const c = this.card;
    const [before, after] = c.statement.split('___');
    return `
      <div class="quiz-top"><span>Card ${this.i + 1} of ${this.round.length}</span><span>Score ${this.score} · Streak ${this.streak}</span></div>
      ${this.notice && this.i === 0 ? `<p class="quiz-note">${esc(this.notice)}</p>` : ''}
      <div class="quiz-card">
        <p class="quiz-statement" id="quiz-statement" tabindex="-1">${esc(before)}<span class="quiz-blank" aria-hidden="true">___</span><span class="sr-only"> blank </span>${esc(after)}</p>
        <div class="quiz-options" role="group" aria-labelledby="quiz-statement">
          ${c.options.map((o, i) => `<button class="quiz-option" data-act="pick" data-i="${i}"><kbd aria-hidden="true">${i + 1}</kbd><span>${esc(o)}</span></button>`).join('')}
        </div>
        <div class="quiz-feedback"></div>
      </div>`;
  }

  /** Mark the answer on the card that is already on screen. */
  private showAnswer(announce: boolean): void {
    const root = this.root!;
    const c = this.card;
    const right = this.picked === c.answer;
    root.querySelector('.quiz-card')!.classList.add('revealed');
    root.querySelector('.quiz-top span:last-child')!.textContent = `Score ${this.score} · Streak ${this.streak}`;
    const [before, after] = c.statement.split('___');
    root.querySelector('.quiz-statement')!.innerHTML = `${esc(before)}<strong class="quiz-blank filled">${esc(c.options[c.answer])}</strong>${esc(after)}`;
    root.querySelectorAll<HTMLButtonElement>('.quiz-option').forEach((b, i) => {
      b.disabled = true;
      b.classList.toggle('correct', i === c.answer);
      b.classList.toggle('wrong', i === this.picked && i !== c.answer);
      if (i === c.answer || i === this.picked) b.querySelector('kbd')!.textContent = i === c.answer ? '✓' : '✗';
      const note = i === c.answer ? ' (correct answer)' : i === this.picked ? ' (your answer)' : '';
      if (note) b.querySelector('span')!.insertAdjacentHTML('beforeend', `<span class="sr-only">${note}</span>`);
    });
    const last = this.i + 1 >= this.round.length;
    // The verdict is a status region that takes focus, so screen readers read it once.
    root.querySelector('.quiz-feedback')!.innerHTML = `
      <div class="quiz-verdict" role="status" tabindex="-1">
        <p class="verdict ${right ? 'ok' : 'bad'}">${right ? '✓ Correct' : '✗ Not quite'}</p>
        <p>The answer is ${esc(c.options[c.answer])}. ${esc(c.explanation)}</p>
      </div>
      <div class="quiz-actions">
        <button class="link" data-act="learn">Read more about ${esc(c.subjectName)} →</button>
        <button class="btn quiz-primary" data-act="next">${last ? 'See results' : 'Next card →'}</button>
      </div>`;
    const feedback = root.querySelector<HTMLElement>('.quiz-feedback')!;
    feedback.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    if (announce) root.querySelector<HTMLElement>('.quiz-verdict')!.focus({ preventScroll: true });
  }

  private summaryHtml(): string {
    const n = this.round.length;
    const missed = this.wrong
      .map((c) => `<li>${esc(c.statement.replace('___', c.options[c.answer]))}</li>`)
      .join('');
    return `
      <p class="eyebrow">Round complete</p>
      <h2>${this.score} / ${n}</h2>
      <p class="climate">${
        this.score === n ? 'A perfect round.' : this.score >= n * 0.7 ? 'Well done.' : 'Every round teaches something new.'
      } Best streak: ${this.progress.bestStreak}.</p>
      ${missed ? `<div class="facts"><h3>To remember</h3><ul class="quiz-missed">${missed}</ul></div>` : ''}
      <div class="quiz-actions">
        <button class="btn quiz-primary" data-act="again">Another round</button>
        <button class="link" data-act="options">Change options</button>
      </div>`;
  }
}
