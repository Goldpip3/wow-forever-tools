/**
 * The panel that tries every combination.
 *
 * It says how many it is about to run and roughly how long that will take
 * before it runs any of them, because the only thing worse than a slow answer
 * is a slow answer nobody agreed to wait for.
 */

import { el, qualityColor } from './render';
import { SLOT_LABEL } from './export-format';
import type { TopGearEntry, TopGearResult } from './client';

export interface TopGearHandlers {
  onRun(perSlot: number): void;
  onPerSlot(perSlot: number): void;
}

function round(value: number, digits = 1): string {
  return value.toFixed(digits);
}

function signed(value: number, digits = 1): string {
  return (value > 0 ? '+' : '') + value.toFixed(digits);
}

/** Roughly how long, in words rather than in seconds. */
function howLong(seconds: number): string {
  if (seconds < 5) return 'a moment';
  if (seconds < 90) return 'about ' + Math.round(seconds) + ' seconds';
  return 'about ' + Math.round(seconds / 60) + ' minutes';
}

function loadoutRow(entry: TopGearEntry, best: boolean): HTMLElement {
  const row = el('details', 'dcombo' + (best ? ' dcombo--best' : ''));

  const summary = document.createElement('summary');
  summary.className = 'dcombo__head';

  const gain = el('span', 'dcombo__gain' + (entry.delta > 0 ? ' dcombo__gain--up' : ''),
    signed(entry.delta, 1));
  summary.appendChild(gain);

  summary.appendChild(
    el('span', 'dcombo__what', entry.swaps.length === 0
      ? 'What you are wearing'
      : entry.swaps.length + (entry.swaps.length === 1 ? ' change' : ' changes')),
  );

  summary.appendChild(
    el('span', 'dcombo__dps', round(entry.dps, 1) + (entry.confirmed ? '' : ' ranked only')),
  );
  row.appendChild(summary);

  const body = el('div', 'dcombo__body');
  if (!entry.swaps.length) {
    body.appendChild(el('p', 'empty-note', 'Nothing beats it, which is worth knowing too.'));
  }

  for (const swap of entry.swaps) {
    const line = el('div', 'dcombo__swap');
    line.appendChild(el('span', 'dcombo__slot', SLOT_LABEL[swap.slot]));
    if (swap.item) {
      const name = el('span', 'dcombo__item', swap.item.name);
      name.style.color = qualityColor(swap.item.quality);
      line.appendChild(name);
    } else {
      line.appendChild(el('span', 'dcombo__item dcombo__item--off', 'nothing'));
    }
    body.appendChild(line);
  }

  const sets = entry.sets.filter((s) => s.worn > 1);
  if (sets.length) {
    body.appendChild(
      el('p', 'drawer__hint', sets.map((s) => s.worn + ' pieces of ' + s.name).join(', ') + '.'),
    );
  }

  if (!entry.confirmed) {
    body.appendChild(
      el(
        'p',
        'drawer__hint',
        'Ranked at the shorter count and not run again, so this figure is only good enough to ' +
          'say it did not make the top five.',
      ),
    );
  }

  row.appendChild(body);
  return row;
}

export function renderTopGearPanel(
  combinations: number,
  capped: boolean,
  seconds: number,
  perSlot: number,
  result: TopGearResult | null,
  handlers: TopGearHandlers,
  busy: boolean,
): HTMLElement {
  const panel = el('section', 'panel');
  const head = el('div', 'panel__head', 'The best of what you own');
  if (result) head.appendChild(el('span', 'panel__count', result.combinations.toLocaleString() + ' tried'));
  panel.appendChild(head);
  const body = el('div', 'panel__body');

  body.appendChild(
    el(
      'p',
      '',
      'Ranking one slot at a time falls apart as soon as two items interact, and they do: ' +
        'a set bonus only arrives with the last piece, and two rings that are each an upgrade ' +
        'may not both go on. This tries the combinations instead.',
    ),
  );

  const row = el('div', 'dfields');
  const pick = document.createElement('select');
  pick.className = 'btn dfield__input';
  for (const n of [2, 3, 4, 5]) {
    const option = document.createElement('option');
    option.value = String(n);
    option.textContent = n + ' per slot';
    option.selected = n === perSlot;
    pick.appendChild(option);
  }
  pick.addEventListener('change', () => handlers.onPerSlot(Number(pick.value)));

  const field = el('label', 'dfield');
  field.appendChild(el('span', 'dfield__label', 'Candidates'));
  field.appendChild(pick);
  row.appendChild(field);
  body.appendChild(row);

  const go = el(
    'button',
    'btn btn--gold',
    busy ? 'Working…' : capped ? 'Try the best ' + combinations.toLocaleString() : 'Try them all',
  );
  if (busy) go.setAttribute('disabled', '');
  go.addEventListener('click', () => handlers.onRun(perSlot));

  const actions = el('div', 'spec-picker');
  actions.appendChild(go);
  body.appendChild(actions);

  body.appendChild(
    el(
      'p',
      'drawer__hint',
      (capped
        ? 'There are more than ' + combinations.toLocaleString() + ' combinations. The ' +
          combinations.toLocaleString() + ' that score best on your stat weights are run, ' +
          howLong(seconds) + ' on this machine. That score leaves out set bonuses. '
        : combinations.toLocaleString() + ' combinations, ' + howLong(seconds) + ' on this machine. ') +
        'The best five are run again properly; the rest are only ranked. Weapons are not part ' +
        'of this search: every combination keeps what you are holding, and the weapon choice ' +
        'is ranked on its own in the gear list.',
    ),
  );

  if (result) {
    body.appendChild(
      el('p', 'drawer__hint', 'What you are wearing comes out at ' + round(result.baseDps, 1) + '.'),
    );
    if (result.capped) {
      body.appendChild(
        el(
          'p',
          'drawer__hint',
          'These are the best of the ' + result.combinations.toLocaleString() + ' combinations tried. ' +
            'More were possible, so one that was not tried could still do better.',
        ),
      );
    }
    const list = el('div', 'dcombos');
    result.entries.slice(0, 12).forEach((entry, i) => {
      list.appendChild(loadoutRow(entry, i === 0 && entry.delta > 0));
    });
    body.appendChild(list);
  }

  panel.appendChild(body);
  return panel;
}
