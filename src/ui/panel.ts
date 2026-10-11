import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { LEVELS, type Grape, type Region } from '../content/types';

const flag = (cc?: string) =>
  cc ? String.fromCodePoint(...[...cc.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)) : '';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const markdown = (md: string) => DOMPurify.sanitize(marked.parse(md, { async: false }) as string);

export interface PanelHandlers {
  onClose: () => void;
  onGrape: (name: string) => void;
  onRegion: (slug: string) => void;
  onBack: () => void;
  /** "Test yourself" on a region or grape page. */
  onQuiz: (subject: { kind: 'region' | 'grape'; slug: string }) => void;
  /** "Back to quiz" on a page opened from the quiz. */
  onQuizBack: () => void;
}

export class Panel {
  private drawer = document.getElementById('drawer')!;
  private body = document.getElementById('drawer-body')!;
  /** Key of what is showing, e.g. "region:bordeaux" or "grape:syrah". */
  current: string | null = null;

  /** @param hasGrapeInfo names of grapes that have an info page (their chips become clickable). */
  constructor(h: PanelHandlers, private hasGrapeInfo: (name: string) => boolean) {
    this.drawer.inert = true;
    document.getElementById('drawer-close')!.addEventListener('click', () => h.onClose());
    addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || !this.isOpen) return;
      // Escape closes an open grape popover first, then the drawer.
      const pop = document.getElementById('filter-pop')!;
      if (!pop.hidden) {
        pop.hidden = true;
        document.getElementById('filter-toggle')!.setAttribute('aria-expanded', 'false');
      } else h.onClose();
    });
    this.body.addEventListener('click', (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('.facts [data-grape], .where [data-region], .back, .quiz-launch');
      if (!el) return;
      if (el.dataset.quizKind) h.onQuiz({ kind: el.dataset.quizKind as 'region' | 'grape', slug: el.dataset.quizSlug! });
      else if (el.dataset.quizBack !== undefined) h.onQuizBack();
      else if (el.dataset.grape) h.onGrape(el.dataset.grape);
      else if (el.dataset.region) h.onRegion(el.dataset.region);
      else h.onBack();
    });
  }

  get isOpen(): boolean {
    return this.current !== null;
  }

  private grapeChips(names: string[], cls: string): string {
    return names
      .map((n) =>
        this.hasGrapeInfo(n)
          ? `<li><button class="chip ${cls} link-chip" data-grape="${esc(n)}">${esc(n)}</button></li>`
          : `<li class="chip ${cls}">${esc(n)}</li>`,
      )
      .join('');
  }

  private quizLinks(kind: 'region' | 'grape', slug: string, name: string, fromQuiz: boolean): [string, string] {
    return [
      fromQuiz ? `<button class="back" data-quiz-back>← Back to quiz</button>` : '',
      `<button class="quiz-launch btn" data-quiz-kind="${kind}" data-quiz-slug="${esc(slug)}">Test yourself on ${esc(name)}</button>`,
    ];
  }

  openRegion(r: Region, fromQuiz = false): void {
    const [back, test] = this.quizLinks('region', r.slug, r.name, fromQuiz);
    const chips = (items: string[]) => items.map((i) => `<li class="chip style">${esc(i)}</li>`).join('');
    this.show(
      `region:${r.slug}`,
      `
      ${back}
      <p class="eyebrow">${flag(r.countryCode)} ${esc(r.country)}</p>
      <h2>${esc(r.name)}</h2>
      ${r.climate ? `<p class="climate">${esc(r.climate)} climate</p>` : ''}
      <div class="facts">
        ${r.grapes.red.length ? `<h3>Red grapes</h3><ul class="chips">${this.grapeChips(r.grapes.red, 'red')}</ul>` : ''}
        ${r.grapes.white.length ? `<h3>White grapes</h3><ul class="chips">${this.grapeChips(r.grapes.white, 'white')}</ul>` : ''}
        <h3>Typical wines</h3><ul class="chips">${chips(r.styles)}</ul>
        ${r.subregions.length ? `<h3>Notable sub-regions</h3><p class="sub">${r.subregions.map(esc).join(' · ')}</p>` : ''}
      </div>
      <div class="prose">${markdown(r.body)}</div>
      ${test}`,
    );
  }

  /** @param growing regions that grow the grape; @param backTo region we came from, if any. */
  openGrape(g: Grape, growing: Region[], backTo: Region | null, focus = true, fromQuiz = false): void {
    const [quizBack, test] = this.quizLinks('grape', g.slug, g.name, fromQuiz);
    const meter = (label: string, v: (typeof LEVELS)[number]) => {
      const n = LEVELS.indexOf(v) + 1;
      return `<div class="meter"><span>${label}</span><span class="dots" role="img" aria-label="${label}: ${v}">${'<i class="on"></i>'.repeat(n)}${'<i></i>'.repeat(5 - n)}</span><em>${v}</em></div>`;
    };
    const chips = (items: string[]) => items.map((i) => `<li class="chip style">${esc(i)}</li>`).join('');
    const where = growing
      .map(
        (r) =>
          `<li><button class="region-link" data-region="${esc(r.slug)}">${flag(r.countryCode)} <b>${esc(r.name)}</b> <span>${esc(r.country)}</span></button></li>`,
      )
      .join('');
    this.show(
      `grape:${g.slug}`,
      `
      ${quizBack}${backTo ? `<button class="back" data-back>← ${esc(backTo.name)}</button>` : ''}
      <p class="eyebrow"><span class="swatch ${g.color}"></span> ${g.color === 'red' ? 'Red' : 'White'} grape</p>
      <h2>${esc(g.name)}</h2>
      ${g.synonyms.length ? `<p class="climate">Also known as ${g.synonyms.map(esc).join(', ')}</p>` : ''}
      <div class="facts">
        <h3>Origin</h3><p class="sub">${esc(g.origin)}</p>
        <h3>Structure</h3>
        <div class="meters">${meter('Acidity', g.structure.acidity)}${meter('Tannin', g.structure.tannin)}${meter('Body', g.structure.body)}</div>
        <h3>Typical aromas</h3><ul class="chips">${chips(g.aromas)}</ul>
        ${g.pairings.length ? `<h3>Food pairings</h3><ul class="chips">${chips(g.pairings)}</ul>` : ''}
      </div>
      <div class="prose">${markdown(g.body)}</div>
      ${growing.length ? `<div class="prose"><h2>Where it grows</h2></div><ul class="where">${where}</ul>` : ''}
      ${test}`,
      focus,
    );
  }

  /** Open the drawer for the quiz and return the empty element the quiz renders into. */
  openQuiz(): HTMLElement {
    this.show('quiz', '');
    const el = document.createElement('div');
    el.className = 'quiz';
    this.body.appendChild(el);
    return el;
  }

  private show(key: string, html: string, focus = true): void {
    this.current = key;
    this.drawer.setAttribute('aria-label', key === 'quiz' ? 'Flash card quiz' : 'Wine region details');
    this.body.innerHTML = html;
    this.body.scrollTop = 0;
    this.drawer.classList.add('open');
    document.body.classList.add('drawer-open');
    this.drawer.setAttribute('aria-hidden', 'false');
    this.drawer.inert = false;
    if (focus) document.getElementById('drawer-close')!.focus({ preventScroll: true });
  }

  close(): void {
    this.current = null;
    this.drawer.classList.remove('open');
    document.body.classList.remove('drawer-open');
    this.drawer.setAttribute('aria-hidden', 'true');
    this.drawer.inert = true;
  }

  /** Pixels of screen the drawer covers: width on desktop (right side), height on mobile (bottom sheet). */
  coverage(): { x: number; y: number } {
    if (!this.isOpen) return { x: 0, y: 0 };
    const r = this.drawer.getBoundingClientRect();
    const mobile = matchMedia('(max-width: 720px)').matches;
    return mobile ? { x: 0, y: r.height / 2 } : { x: r.width / 2, y: 0 };
  }
}
