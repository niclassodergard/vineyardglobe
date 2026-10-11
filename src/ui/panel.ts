import DOMPurify from 'dompurify';
import { marked } from 'marked';
import type { Region } from '../content/types';

const flag = (cc?: string) =>
  cc ? String.fromCodePoint(...[...cc.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)) : '';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const chips = (items: string[], cls: string) =>
  items.map((i) => `<li class="chip ${cls}">${esc(i)}</li>`).join('');

export class Panel {
  private drawer = document.getElementById('drawer')!;
  private body = document.getElementById('drawer-body')!;
  current: string | null = null;

  constructor(private onClose: () => void) {
    this.drawer.inert = true;
    document.getElementById('drawer-close')!.addEventListener('click', () => this.onClose());
    addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) this.onClose();
    });
  }

  get isOpen(): boolean {
    return this.current !== null;
  }

  open(r: Region): void {
    this.current = r.slug;
    const html = DOMPurify.sanitize(marked.parse(r.body, { async: false }) as string);
    this.body.innerHTML = `
      <p class="eyebrow">${flag(r.countryCode)} ${esc(r.country)}</p>
      <h2>${esc(r.name)}</h2>
      ${r.climate ? `<p class="climate">${esc(r.climate)} climate</p>` : ''}
      <div class="facts">
        ${r.grapes.red.length ? `<h3>Red grapes</h3><ul class="chips">${chips(r.grapes.red, 'red')}</ul>` : ''}
        ${r.grapes.white.length ? `<h3>White grapes</h3><ul class="chips">${chips(r.grapes.white, 'white')}</ul>` : ''}
        <h3>Typical wines</h3><ul class="chips">${chips(r.styles, 'style')}</ul>
        ${r.subregions.length ? `<h3>Notable sub-regions</h3><p class="sub">${r.subregions.map(esc).join(' · ')}</p>` : ''}
      </div>
      <div class="prose">${html}</div>`;
    this.body.scrollTop = 0;
    this.drawer.classList.add('open');
    document.body.classList.add('drawer-open');
    this.drawer.setAttribute('aria-hidden', 'false');
    this.drawer.inert = false;
    document.getElementById('drawer-close')!.focus({ preventScroll: true });
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
