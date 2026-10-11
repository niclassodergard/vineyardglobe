import type { Region } from '../content/types';

export function regionGrapes(r: Region): string[] {
  return [...r.grapes.red, ...r.grapes.white];
}

/** Slugs of regions growing any of the selected grapes, or null when nothing is selected. */
export function applyGrapeFilter(regions: Region[], selected: Set<string>): Set<string> | null {
  if (!selected.size) return null;
  return new Set(regions.filter((r) => regionGrapes(r).some((g) => selected.has(g))).map((r) => r.slug));
}

export interface FilterControl {
  /** Select only this grape (used when a grape is clicked in a region's info). */
  setOnly(grape: string): void;
  /** Remove every selected grape. */
  clear(): void;
  /** Re-send the current filter to the globe (undoes any temporary highlight). */
  reapply(): void;
  /** Whether a region is visible under the current filter. */
  isVisible(slug: string): boolean;
}

export function setupFilter(
  regions: Region[],
  onChange: (slugs: Set<string> | null) => void,
  /** Called when the user toggles a grape chip in the selector. */
  onToggle: (grape: string, selected: boolean) => void,
  /** Called when the Clear button empties the selection. */
  onClear: () => void,
): FilterControl {
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
  const buttons = new Map<string, HTMLButtonElement>();
  for (const g of grapes) {
    const b = document.createElement('button');
    b.className = `chip ${reds.has(g) ? 'red' : 'white'} toggle`;
    b.textContent = `${g} · ${tally.get(g)}`;
    b.setAttribute('aria-pressed', 'false');
    b.addEventListener('click', () => {
      selected.has(g) ? selected.delete(g) : selected.add(g);
      b.setAttribute('aria-pressed', String(selected.has(g)));
      update();
      onToggle(g, selected.has(g));
    });
    buttons.set(g, b);
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
    onClear();
  });
  document.addEventListener('pointerdown', (e) => {
    if (!pop.hidden && !(e.target as HTMLElement).closest('.filter')) {
      pop.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
    }
  });
  return {
    clear() {
      selected.clear();
      buttons.forEach((b) => b.setAttribute('aria-pressed', 'false'));
      update();
    },
    reapply: update,
    isVisible: (slug) => selected.size === 0 || (applyGrapeFilter(regions, selected)?.has(slug) ?? true),
    setOnly(grape) {
      selected.clear();
      if (tally.has(grape)) selected.add(grape);
      buttons.forEach((b, g) => b.setAttribute('aria-pressed', String(selected.has(g))));
      update();
    },
  };
}
