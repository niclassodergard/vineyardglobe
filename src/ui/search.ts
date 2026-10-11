import type { Region } from '../content/types';

const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

export function matchRegions(regions: Region[], query: string): Region[] {
  const q = norm(query.trim());
  if (!q) return [];
  const scored: [number, Region][] = [];
  for (const r of regions) {
    const name = norm(r.name);
    let score = 0;
    if (name.startsWith(q)) score = 100;
    else if (name.includes(q)) score = 80;
    else if (norm(r.country).includes(q)) score = 60;
    else if ([...r.grapes.red, ...r.grapes.white].some((g) => norm(g).includes(q))) score = 50;
    else if (r.subregions.some((s) => norm(s).includes(q))) score = 40;
    if (score) scored.push([score, r]);
  }
  return scored.sort((a, b) => b[0] - a[0] || a[1].name.localeCompare(b[1].name)).slice(0, 8).map(([, r]) => r);
}

export function setupSearch(regions: Region[], onPick: (r: Region) => void): void {
  const input = document.getElementById('search') as HTMLInputElement;
  const list = document.getElementById('results') as HTMLUListElement;
  let items: Region[] = [];
  let sel = -1;

  const render = () => {
    list.hidden = items.length === 0;
    list.innerHTML = items
      .map(
        (_r, i) =>
          `<li role="option" data-i="${i}" class="${i === sel ? 'sel' : ''}"><b></b><span></span></li>`,
      )
      .join('');
    list.querySelectorAll('li').forEach((li, i) => {
      li.querySelector('b')!.textContent = items[i].name;
      li.querySelector('span')!.textContent = items[i].country;
    });
  };
  const pick = (r: Region) => {
    input.value = '';
    items = [];
    sel = -1;
    render();
    input.blur();
    onPick(r);
  };

  input.addEventListener('input', () => {
    items = matchRegions(regions, input.value);
    sel = items.length ? 0 : -1;
    render();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!items.length) return;
      sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      render();
    } else if (e.key === 'Enter' && items[sel]) pick(items[sel]);
    else if (e.key === 'Escape' && input.value) {
      e.stopPropagation();
      input.value = '';
      items = [];
      render();
    }
  });
  list.addEventListener('pointerdown', (e) => {
    const li = (e.target as HTMLElement).closest('li');
    if (li) {
      e.preventDefault();
      pick(items[Number(li.dataset.i)]);
    }
  });
  input.addEventListener('blur', () => setTimeout(() => ((list.hidden = true)), 120));
  input.addEventListener('focus', () => (list.hidden = items.length === 0));
}
