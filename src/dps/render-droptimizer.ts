/**
 * What each drop would be worth.
 *
 * Almost all of this panel is the empty state, and that is the honest shape of
 * it: there is no item list to read, so the thing to do is say so plainly and
 * say what would make it work, rather than hide the feature or fake it.
 */

import { el, qualityColor } from './render';
import { SLOT_LABEL } from './export-format';
import { groupDrops } from './droptimizer';
import type { ItemDatabase } from './itemdb';
import type { DropResult } from './client';

export interface DropHandlers {
  onRun(zones: string[]): void;
  onToggleZone(zone: string, on: boolean): void;
}

function round(value: number, digits = 1): string {
  return value.toFixed(digits);
}

function signed(value: number, digits = 1): string {
  return (value > 0 ? '+' : '') + value.toFixed(digits);
}

/** The panel when there is nothing to read, which is today. */
function emptyState(): HTMLElement {
  const panel = el('section', 'panel');
  panel.appendChild(el('div', 'panel__head', 'What to go and get'));
  const body = el('div', 'panel__body');

  body.appendChild(
    el(
      'p',
      '',
      'There is no item list yet. WoW Forever has not published what drops where, and guessing ' +
        'it would be worse than waiting: a comparison against an invented item is wrong in a way ' +
        'nobody can see.',
    ),
  );
  body.appendChild(
    el(
      'p',
      'drawer__hint',
      'When the list exists it goes in public/data/items.json and this panel fills in on its own. ' +
        'Everything under it is already written.',
    ),
  );

  panel.appendChild(body);
  return panel;
}

export function renderDropPanel(
  db: ItemDatabase | null,
  zones: string[],
  chosen: string[],
  result: DropResult | null,
  handlers: DropHandlers,
  busy: boolean,
): HTMLElement {
  if (!db) return emptyState();

  const panel = el('section', 'panel');
  const head = el('div', 'panel__head', 'What to go and get');
  head.appendChild(el('span', 'panel__count', db.source));
  panel.appendChild(head);
  const body = el('div', 'panel__body');

  body.appendChild(
    el(
      'p',
      '',
      'Every drop that would go somewhere, simulated against what you are wearing. A piece that ' +
        'the score says is far worse than what is on is left out rather than run.',
    ),
  );

  const picker = el('div', 'dzones');
  for (const zone of zones) {
    const row = el('label', 'dzone' + (chosen.includes(zone) ? ' dzone--on' : ''));
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = chosen.includes(zone);
    box.addEventListener('change', () => handlers.onToggleZone(zone, box.checked));
    row.appendChild(box);
    row.appendChild(el('span', '', zone));
    picker.appendChild(row);
  }
  body.appendChild(picker);

  const go = el('button', 'btn btn--gold', busy ? 'Working…' : 'Work out what is worth going for');
  if (busy || !chosen.length) go.setAttribute('disabled', '');
  go.addEventListener('click', () => handlers.onRun(chosen));
  const actions = el('div', 'spec-picker');
  actions.appendChild(go);
  body.appendChild(actions);

  if (result) {
    if (!result.drops.length) {
      body.appendChild(el('p', 'empty-note', 'Nothing in there beats what you already have.'));
    }

    for (const zone of groupDrops(result.drops)) {
      const section = el('div', 'ddrops');
      section.appendChild(el('div', 'dbuffs__head', zone.zone));

      for (const boss of zone.bosses) {
        const group = el('div', 'ddrop-group');
        group.appendChild(el('div', 'ddrop__boss', boss.boss));

        for (const drop of boss.rows) {
          const row = el('div', 'ddrop');

          const gain = el('span', 'ddrop__gain' + (drop.deltaDps > 0 ? ' ddrop__gain--up' : ''),
            signed(drop.deltaDps, 1));
          row.appendChild(gain);

          const name = el('span', 'ddrop__name', drop.item.name);
          name.style.color = qualityColor(drop.item.quality);
          row.appendChild(name);

          row.appendChild(el('span', 'ddrop__slot', SLOT_LABEL[drop.slot]));
          row.appendChild(el('span', 'ddrop__range', '± ' + round(drop.stderr, 1)));
          group.appendChild(row);
        }
        section.appendChild(group);
      }
      body.appendChild(section);
    }
  }

  panel.appendChild(body);
  return panel;
}
