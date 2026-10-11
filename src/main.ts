import '@fontsource/cormorant-garamond/500.css';
import '@fontsource/cormorant-garamond/700.css';
import '@fontsource/cormorant-garamond/500-italic.css';
import '@fontsource/eb-garamond/400.css';
import '@fontsource/eb-garamond/500.css';
import '@fontsource/eb-garamond/400-italic.css';
import './styles/main.css';
import { loadRegions } from './content/loadRegions';
import { Globe } from './globe/scene';
import { Panel } from './ui/panel';
import { setupFilter } from './ui/filter';
import { setupSearch } from './ui/search';

const regions = loadRegions();
const tooltip = document.getElementById('tooltip')!;

const panel: Panel = new Panel(() => select(null));
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
  onSelect: (region) => select(region),
});

function select(region: (typeof regions)[number] | null): void {
  tooltip.hidden = true;
  if (region) {
    panel.open(region);
    globe.flyTo(region.slug);
  } else {
    panel.close();
  }
  globe.setSelected(region?.slug ?? null);
  globe.setHoldRotation(!!region);
  const c = panel.coverage();
  globe.setViewShift(c.x, c.y);
  const hash = region ? `#/region/${region.slug}` : '';
  if (location.hash !== hash) history.replaceState(null, '', hash || location.pathname + location.search);
}

setupSearch(regions, select);
setupFilter(regions, (slugs) => globe.setActiveRegions(slugs));
addEventListener('resize', () => {
  const c = panel.coverage();
  globe.setViewShift(c.x, c.y);
});

const fromHash = () => {
  const slug = /^#\/region\/([\w-]+)$/.exec(location.hash)?.[1];
  return regions.find((r) => r.slug === slug) ?? null;
};
const initialRegion = fromHash();
if (initialRegion) select(initialRegion);
addEventListener('hashchange', () => {
  const r = fromHash();
  if (r && !panel.isOpen) select(r);
  else if (r && panel.current !== r.slug) select(r);
  else if (!r && panel.isOpen) select(null);
});

void globe.ready.then(() => document.getElementById('loading')!.classList.add('done'));
