import type { Region } from '../content/types';

export function regionGrapes(r: Region): string[] {
  return [...r.grapes.red, ...r.grapes.white];
}

/** Slugs of regions growing any of the selected grapes, or null when nothing is selected. */
export function applyGrapeFilter(regions: Region[], selected: Set<string>): Set<string> | null {
  if (!selected.size) return null;
  return new Set(regions.filter((r) => regionGrapes(r).some((g) => selected.has(g))).map((r) => r.slug));
}

export function setupFilter(regions: Region[], onChange: (slugs: Set<string> | null) => void): void {
  const toggle = document.getElementById('filter-toggle')!;
  const pop = document.getElementById('filter-pop')!;
  const listEl = document.getElementById('grape-list')!;
  const count = document.getElementById('filter-count')!;
  const selected = new Set<string>();

  const reds = new Set(regions.flatMap((r) => r.grapes.red));
  const tally = new Map<string, number>();
  for (const r of regions) for (const g of regionGrapes(r)) tally.set(g, (tally.get(g) ?? 0) + 1);
  const grapes = [...tally.keys()].sort((a, b) => tally.get(b)! - tally.get(a)! || a.localeCompare(b));

  listEl.innerHTML = '';
  for (const g of grapes) {
    const b = document.createElement('button');
    b.className = `chip ${reds.has(g) ? 'red' : 'white'} toggle`;
    b.textContent = `${g} · ${tally.get(g)}`;
    b.setAttribute('aria-pressed', 'false');
    b.addEventListener('click', () => {
      selected.has(g) ? selected.delete(g) : selected.add(g);
      b.setAttribute('aria-pressed', String(selected.has(g)));
      update();
    });
    listEl.appendChild(b);
  }

  const update = () => {
    count.textContent = selected.size ? `(${selected.size})` : '';
    onChange(applyGrapeFilter(regions, selected));
  };
  toggle.addEventListener('click', () => {
    pop.hidden = !pop.hidden;
    toggle.setAttribute('aria-expanded', String(!pop.hidden));
  });
  document.getElementById('filter-clear')!.addEventListener('click', () => {
    selected.clear();
    listEl.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', 'false'));
    update();
  });
  document.addEventListener('pointerdown', (e) => {
    if (!pop.hidden && !(e.target as HTMLElement).closest('.filter')) {
      pop.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
    }
  });
}
