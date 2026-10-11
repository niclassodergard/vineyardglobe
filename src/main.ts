import '@fontsource/cormorant-garamond/500.css';
import '@fontsource/cormorant-garamond/700.css';
import '@fontsource/cormorant-garamond/500-italic.css';
import '@fontsource/eb-garamond/400.css';
import '@fontsource/eb-garamond/500.css';
import '@fontsource/eb-garamond/400-italic.css';
import './styles/main.css';
import { loadGrapes } from './content/loadGrapes';
import { loadRegions } from './content/loadRegions';
import type { Grape, Region } from './content/types';
import { Globe } from './globe/scene';
import { setupFilter, regionGrapes } from './ui/filter';
import { buildIndex } from './quiz/index';
import type { SubjectRef } from './quiz/types';
import { Panel } from './ui/panel';
import { Quiz } from './ui/quiz';
import { setupSearch } from './ui/search';

const regions = loadRegions();
const grapes = loadGrapes();
const grapeByName = new Map(grapes.map((g) => [g.name, g]));
const tooltip = document.getElementById('tooltip')!;

/** The region whose page is open, or the one a grape page was opened from (for the back link). */
let currentRegion: Region | null = null;

const panel: Panel = new Panel(
  {
    onClose: () => closePanel(),
    onGrape: (name) => {
      filter.setOnly(name);
      openGrape(name, currentRegion);
    },
    onRegion: (slug) => selectRegion(regions.find((r) => r.slug === slug) ?? null),
    onBack: () => selectRegion(currentRegion),
    onQuiz: (subject) => openQuiz(subject),
    onQuizBack: () => openQuiz(),
  },
  (name) => grapeByName.has(name),
);

const globe = new Globe(document.getElementById('globe')!, regions, {
  onHover(region, x, y) {
    if (!region) {
      tooltip.hidden = true;
      return;
    }
    tooltip.hidden = false;
    tooltip.innerHTML = '';
    const b = document.createElement('b');
    b.textContent = region.name;
    const s = document.createElement('span');
    s.textContent = region.country;
    tooltip.append(b, s);
    tooltip.style.transform = `translate(${x + 14}px, ${y + 14}px)`;
  },
  onSelect: (region) => (region ? selectRegion(region) : closePanel()),
});

const filter = setupFilter(
  regions,
  (slugs) => globe.setActiveRegions(slugs),
  (name, selected) => {
    const grape = grapeByName.get(name);
    if (!grape) return;
    if (selected) openGrape(name, null, false);
    else if (panel.current === `grape:${grape.slug}`) closePanel();
  },
  () => {
    if (panel.current?.startsWith('grape:')) closePanel();
  },
);

/** True while the globe shows a quiz highlight that must be undone. */
let quizHighlight = false;
function clearQuizHighlight(): void {
  if (!quizHighlight) return;
  quizHighlight = false;
  filter.reapply();
}

const quiz = new Quiz(buildIndex(regions, grapes), {
  mount: () => panel.openQuiz(),
  isActive: () => panel.current === 'quiz',
  onReveal(card) {
    if (card.highlight) {
      quizHighlight = true;
      globe.setActiveRegions(new Set(card.highlight));
    } else clearQuizHighlight();
    globe.setSelected(card.flyTo ?? null);
    if (card.flyTo) globe.flyTo(card.flyTo);
  },
  onReset() {
    clearQuizHighlight();
    globe.setSelected(null);
  },
  onLearn(subject) {
    if (subject.kind === 'region') selectRegion(regions.find((r) => r.slug === subject.slug) ?? null, true);
    else {
      const g = grapes.find((x) => x.slug === subject.slug);
      if (g) openGrape(g.name, null, true, true);
    }
  },
});

function openQuiz(focus?: SubjectRef): void {
  tooltip.hidden = true;
  clearQuizHighlight();
  filter.clear();
  currentRegion = null;
  globe.setSelected(null);
  quiz.open(focus);
  setHash('#/quiz');
  syncView();
}
document.getElementById('quiz-open')!.addEventListener('click', () => openQuiz());

function syncView(): void {
  const c = panel.coverage();
  globe.setViewShift(c.x, c.y);
  globe.setHoldRotation(panel.isOpen);
}

function setHash(hash: string): void {
  if (location.hash !== hash) history.replaceState(null, '', hash || location.pathname + location.search);
}

function selectRegion(region: Region | null, fromQuiz = false): void {
  tooltip.hidden = true;
  clearQuizHighlight();
  if (!region) return closePanel();
  // Don't show a region that the active grape filter hides.
  if (!filter.isVisible(region.slug)) filter.clear();
  currentRegion = region;
  panel.openRegion(region, fromQuiz);
  globe.flyTo(region.slug);
  globe.setSelected(region.slug);
  setHash(`#/region/${region.slug}`);
  syncView();
}

function openGrape(name: string, from: Region | null, focus = true, fromQuiz = false): void {
  const grape = grapeByName.get(name);
  if (!grape) return;
  tooltip.hidden = true;
  clearQuizHighlight();
  currentRegion = from;
  const growing = regions.filter((r) => regionGrapes(r).includes(grape.name));
  panel.openGrape(grape, growing, from, focus, fromQuiz);
  globe.setSelected(null);
  setHash(`#/grape/${grape.slug}`);
  syncView();
}

function closePanel(): void {
  const wasQuiz = panel.current === 'quiz';
  tooltip.hidden = true;
  clearQuizHighlight();
  currentRegion = null;
  panel.close();
  globe.setSelected(null);
  setHash('');
  syncView();
  if (wasQuiz) document.getElementById('quiz-open')!.focus({ preventScroll: true });
}

setupSearch(regions, selectRegion);
addEventListener('resize', syncView);

function fromHash(): { region?: Region; grape?: Grape; quiz?: boolean } {
  if (location.hash === '#/quiz') return { quiz: true };
  const m = /^#\/(region|grape)\/([\w-]+)$/.exec(location.hash);
  if (!m) return {};
  return m[1] === 'region'
    ? { region: regions.find((r) => r.slug === m[2]) }
    : { grape: grapes.find((g) => g.slug === m[2]) };
}
function applyHash(): void {
  const { region, grape, quiz: wantsQuiz } = fromHash();
  if (wantsQuiz) {
    if (panel.current !== 'quiz') openQuiz();
  } else if (region && panel.current !== `region:${region.slug}`) selectRegion(region);
  else if (grape && panel.current !== `grape:${grape.slug}`) {
    filter.setOnly(grape.name);
    openGrape(grape.name, null);
  } else if (!region && !grape && panel.isOpen) closePanel();
}
applyHash();
addEventListener('hashchange', applyHash);

void globe.ready.then(() => document.getElementById('loading')!.classList.add('done'));
