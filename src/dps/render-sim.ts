/**
 * The panels that belong to the simulator: what the fight looks like, what came
 * out of it, what each stat turned out to be worth, and which swaps that makes
 * worth taking.
 *
 * Kept apart from render.ts, which only needs a character. These need a spec
 * module and a result, and a class nobody has written a spec for still gets the
 * whole of the other file.
 */

import { iconImg } from '../shared/icons';
import type { ItemRef, Slot, StatKey } from './export-format';
import { SLOT_LABEL } from './export-format';
import { buffsOfKind, type BuffDef, type BuffKind } from './data/buffs';
import type { Upgrade } from './gear';
import type { SwapResult } from './compare';
import type { FightConfig, SimResult } from './sim/types';
import type { SpecModule } from './sim/spec';
import { isNoisy, type WeightResult, type WeightTable } from './weights';
import { el, qualityColor } from './render';

export interface FightHandlers {
  onFightChange(patch: Partial<FightConfig>): void;
  onToggleBuff(id: string, on: boolean, kind: BuffKind): void;
  onRotation(name: string): void;
  onRun(): void;
  onDeriveWeights(): void;
  onWeightOverride(stat: StatKey, value: number | null): void;
  onReference(stat: StatKey): void;
  onConfirmSwap(slot: Slot, item: ItemRef): void;
}

export interface Busy {
  label: string;
  done: number;
  total: number;
}

function foreverPill(status: string, note?: string): HTMLElement {
  const pill = el('span', 'pill pill--' + status, status);
  if (note) pill.title = note;
  return pill;
}

function field(label: string, control: HTMLElement): HTMLElement {
  const wrap = el('label', 'dfield');
  wrap.appendChild(el('span', 'dfield__label', label));
  wrap.appendChild(control);
  return wrap;
}

function numberInput(
  value: number,
  onChange: (n: number) => void,
  min = 1,
  max = 100000,
): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'number';
  input.className = 'btn dfield__input';
  input.value = String(value);
  input.min = String(min);
  input.max = String(max);
  input.addEventListener('change', () => {
    const n = Number(input.value);
    if (Number.isFinite(n)) onChange(Math.max(min, Math.min(max, n)));
  });
  return input;
}

function round(value: number, digits = 1): string {
  return value.toFixed(digits);
}

/* --------------------------------------------------------- fight settings */

function buffRow(buff: BuffDef, on: boolean, handlers: FightHandlers): HTMLElement {
  const row = el('label', 'dbuff' + (on ? ' dbuff--on' : ''));

  const box = document.createElement('input');
  box.type = 'checkbox';
  box.checked = on;
  box.addEventListener('change', () => handlers.onToggleBuff(buff.id, box.checked, buff.kind));
  row.appendChild(box);

  row.appendChild(iconImg(buff.icon, buff.name, 'dbuff__icon'));

  const text = el('div', 'dbuff__text');
  text.appendChild(el('span', 'dbuff__name', buff.name));
  if (buff.from) text.appendChild(el('span', 'dbuff__from', buff.from));
  row.appendChild(text);

  if (buff.forever.note) row.appendChild(foreverPill(buff.forever.status, buff.forever.note));
  return row;
}

export function renderFightPanel(
  fight: FightConfig,
  spec: SpecModule,
  rotation: string,
  handlers: FightHandlers,
  busy: Busy | null,
): HTMLElement {
  const panel = el('section', 'panel');
  panel.appendChild(el('div', 'panel__head', 'The fight'));
  const body = el('div', 'panel__body');

  const row = el('div', 'dfields');
  row.appendChild(
    field('Seconds', numberInput(fight.duration, (n) => handlers.onFightChange({ duration: n }), 10, 1800)),
  );

  const iterations = document.createElement('select');
  iterations.className = 'btn dfield__input';
  for (const n of [200, 1000, 5000, 20000]) {
    const option = document.createElement('option');
    option.value = String(n);
    option.textContent = n.toLocaleString() + ' runs';
    option.selected = fight.iterations === n;
    iterations.appendChild(option);
  }
  iterations.addEventListener('change', () =>
    handlers.onFightChange({ iterations: Number(iterations.value) }),
  );
  row.appendChild(field('Repeat', iterations));

  const bossLevel = document.createElement('select');
  bossLevel.className = 'btn dfield__input';
  for (const level of [60, 61, 62, 63]) {
    const option = document.createElement('option');
    option.value = String(level);
    option.textContent = level === 63 ? '63, a raid boss' : String(level);
    option.selected = fight.target.level === level;
    bossLevel.appendChild(option);
  }
  bossLevel.addEventListener('change', () =>
    handlers.onFightChange({ target: { ...fight.target, level: Number(bossLevel.value) } }),
  );
  row.appendChild(field('Target level', bossLevel));

  if (Object.keys(spec.rotations).length > 1) {
    const select = document.createElement('select');
    select.className = 'btn dfield__input';
    for (const name of Object.keys(spec.rotations)) {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = spec.rotationLabels?.[name] ?? name;
      option.selected = name === rotation;
      select.appendChild(option);
    }
    select.addEventListener('change', () => handlers.onRotation(select.value));
    row.appendChild(field('Rotation', select));
  }

  body.appendChild(row);

  const sections: Array<[string, BuffKind, string[]]> = [
    ['Buffs', 'raid', fight.buffs],
    ['Consumables', 'consumable', fight.consumables],
    ['On the boss', 'debuff', fight.debuffs],
  ];

  for (const [title, kind, chosen] of sections) {
    const section = el('div', 'dbuffs');
    section.appendChild(el('div', 'dbuffs__head', title));
    for (const buff of buffsOfKind(kind)) {
      section.appendChild(buffRow(buff, chosen.includes(buff.id), handlers));
    }
    body.appendChild(section);
  }

  body.appendChild(
    el(
      'p',
      'drawer__hint',
      'Tick what you will actually have. Anything already up when you exported is skipped rather ' +
        'than counted twice, and the notes above say so.',
    ),
  );

  const actions = el('div', 'spec-picker');
  const run = el('button', 'btn btn--gold', busy ? 'Running…' : 'Run the simulation');
  if (busy) run.setAttribute('disabled', '');
  run.addEventListener('click', handlers.onRun);

  const weights = el('button', 'btn', 'Work out stat weights');
  if (busy) weights.setAttribute('disabled', '');
  weights.addEventListener('click', handlers.onDeriveWeights);

  actions.append(run, weights);
  body.appendChild(actions);

  if (busy) {
    const bar = el('div', 'dprogress');
    const pct = busy.total > 0 ? Math.round((busy.done / busy.total) * 100) : 0;
    const fill = el('div', 'dprogress__fill');
    fill.style.width = pct + '%';
    bar.appendChild(fill);
    body.appendChild(bar);
    body.appendChild(el('div', 'dprogress__label', busy.label + ' · ' + pct + '%'));
  }

  panel.appendChild(body);
  return panel;
}

/* ----------------------------------------------------------------- results */

export function renderResultsPanel(result: SimResult): HTMLElement {
  const panel = el('section', 'panel');
  const head = el('div', 'panel__head', 'Damage');
  head.appendChild(
    el('span', 'panel__count', result.iterations.toLocaleString() + ' runs of ' + result.duration + 's'),
  );
  panel.appendChild(head);
  const body = el('div', 'panel__body');

  const big = el('div', 'ddps');
  big.appendChild(el('span', 'ddps__value', round(result.dps, 1)));
  big.appendChild(el('span', 'ddps__unit', 'damage per second'));
  big.appendChild(el('span', 'ddps__range', 'give or take ' + round(result.dpsStderr, 1)));
  body.appendChild(big);

  body.appendChild(
    el(
      'p',
      'drawer__hint',
      'Any single pull of this fight would land within about ' + round(result.dpsStdev, 0) +
        ' either side of that, which is the dice rather than your gear.',
    ),
  );

  const table = el('div', 'dtable');
  const header = el('div', 'dtable__row dtable__row--head');
  for (const label of ['Spell', 'Casts', 'Crit', 'Per second', 'Share']) {
    header.appendChild(el('span', 'dtable__cell', label));
  }
  table.appendChild(header);

  for (const ability of result.abilities) {
    const row = el('div', 'dtable__row');
    row.appendChild(el('span', 'dtable__cell dtable__cell--name', ability.name));
    row.appendChild(el('span', 'dtable__cell', round(ability.casts, 0)));
    row.appendChild(
      el('span', 'dtable__cell', ability.hits > 0 ? round((ability.crits / ability.hits) * 100, 0) + '%' : '–'),
    );
    row.appendChild(el('span', 'dtable__cell', round(ability.dps, 1)));
    row.appendChild(el('span', 'dtable__cell', round(ability.share * 100, 0) + '%'));
    table.appendChild(row);
  }
  body.appendChild(table);

  const lines: string[] = [];
  if (result.resources.oomAt !== undefined) {
    lines.push('Ran out of mana about ' + round(result.resources.oomAt, 0) + ' seconds in.');
  }
  if (result.resources.timeIdle > 1) {
    lines.push(round(result.resources.timeIdle, 0) + ' seconds went by with nothing to cast.');
  }
  for (const line of lines) {
    const warn = el('div', 'warn warn--warn');
    warn.appendChild(el('div', 'warn__title', line));
    body.appendChild(warn);
  }

  const notes = el('div', 'dnotes');
  const notesHead = el('div', 'dnotes__head');
  notesHead.appendChild(foreverPill('unverified'));
  notesHead.appendChild(el('span', '', 'Read this before you trust the number'));
  notes.appendChild(notesHead);

  const list = document.createElement('ul');
  for (const note of result.notes) {
    const li = document.createElement('li');
    li.textContent = note;
    list.appendChild(li);
  }
  notes.appendChild(list);
  body.appendChild(notes);

  panel.appendChild(body);
  return panel;
}

/* ----------------------------------------------------------------- weights */

export function renderWeightsPanel(
  weights: WeightResult,
  overrides: WeightTable,
  handlers: FightHandlers,
): HTMLElement {
  const panel = el('section', 'panel');
  const head = el('div', 'panel__head', 'What a point is worth');
  head.appendChild(
    el('span', 'panel__count', weights.iterations.toLocaleString() + ' runs per stat'),
  );
  panel.appendChild(head);
  const body = el('div', 'panel__body');

  body.appendChild(
    el(
      'p',
      'drawer__hint',
      'Each one was measured by running the same fight again with more of that single stat. ' +
        'They belong to this character with this gear and these talents, not to the class in general.',
    ),
  );

  const referenceRow = el('div', 'dfields');
  const select = document.createElement('select');
  select.className = 'btn dfield__input';
  for (const weight of weights.weights) {
    const option = document.createElement('option');
    option.value = weight.stat;
    option.textContent = weight.label;
    option.selected = weight.stat === weights.reference;
    select.appendChild(option);
  }
  select.addEventListener('change', () => handlers.onReference(select.value as StatKey));
  referenceRow.appendChild(field('Compared against', select));
  body.appendChild(referenceRow);

  const table = el('div', 'dtable dtable--weights');
  const header = el('div', 'dtable__row dtable__row--head');
  for (const label of ['Stat', 'Per point', 'Relative', 'Yours']) {
    header.appendChild(el('span', 'dtable__cell', label));
  }
  table.appendChild(header);

  for (const weight of weights.weights) {
    const row = el('div', 'dtable__row');
    row.appendChild(el('span', 'dtable__cell dtable__cell--name', weight.label));

    const perPoint = el('span', 'dtable__cell');
    if (weight.capped) {
      perPoint.textContent = 'capped';
      perPoint.classList.add('dtable__cell--muted');
      perPoint.title = 'You are at the cap, so more of this does nothing at all.';
    } else {
      perPoint.textContent = weight.perPoint.toFixed(3);
      if (isNoisy(weight)) {
        perPoint.classList.add('dtable__cell--noisy');
        perPoint.title =
          'Too uncertain to tell two close items apart. Repeat the fight more times to sharpen it.';
      }
    }
    row.appendChild(perPoint);

    row.appendChild(el('span', 'dtable__cell', weight.capped ? '–' : weight.normalised.toFixed(2)));

    const input = document.createElement('input');
    input.type = 'number';
    input.step = '0.01';
    input.className = 'btn dtable__input';
    input.placeholder = weight.normalised.toFixed(2);
    const override = overrides[weight.stat];
    if (override !== undefined) input.value = String(override);
    input.addEventListener('change', () => {
      const raw = input.value.trim();
      handlers.onWeightOverride(weight.stat, raw === '' ? null : Number(raw));
    });
    const cell = el('span', 'dtable__cell');
    cell.appendChild(input);
    row.appendChild(cell);

    table.appendChild(row);
  }
  body.appendChild(table);

  for (const note of weights.notes) {
    const warn = el('div', 'warn warn--info');
    warn.appendChild(el('div', 'warn__title', note));
    body.appendChild(warn);
  }

  panel.appendChild(body);
  return panel;
}

/* ---------------------------------------------------------------- upgrades */

export function upgradeKey(slot: Slot, item: ItemRef): string {
  return slot + ':' + item.id;
}

export function renderUpgradesPanel(
  list: Upgrade[],
  confirmed: Map<string, SwapResult>,
  handlers: FightHandlers,
  busy: Busy | null,
  /** Damage per second for one point of score; zero when it is not known. */
  scale: number,
): HTMLElement {
  const panel = el('section', 'panel');
  const head = el('div', 'panel__head', 'Worth swapping');
  head.appendChild(el('span', 'panel__count', list.length + ' found'));
  panel.appendChild(head);
  const body = el('div', 'panel__body');

  if (!list.length) {
    body.appendChild(el('p', 'empty-note', 'Nothing in your bags or bank beats what you have on.'));
    panel.appendChild(body);
    return panel;
  }

  for (const upgrade of list) {
    const row = el('div', 'dupgrade');

    const text = el('div', 'dupgrade__text');
    const line = el('div', 'dupgrade__line');
    line.appendChild(el('span', 'dupgrade__slot', SLOT_LABEL[upgrade.slot]));
    const name = el('span', 'dupgrade__name', upgrade.to.name);
    name.style.color = qualityColor(upgrade.to.quality);
    line.appendChild(name);
    text.appendChild(line);
    if (upgrade.from) text.appendChild(el('div', 'dupgrade__from', 'instead of ' + upgrade.from.name));
    row.appendChild(text);

    const shown = scale > 0 ? upgrade.gain * scale : upgrade.gain;
    const gain = el('div', 'dupgrade__gain', '+' + shown.toFixed(1));
    gain.title = scale > 0
      ? 'Damage per second, worked out from the stat weights'
      : 'Points of score, since the weights could not be put into damage';
    row.appendChild(gain);

    const check = confirmed.get(upgradeKey(upgrade.slot, upgrade.to));
    if (check) {
      const up = check.deltaDps >= 0;
      const measured = el(
        'div',
        'dupgrade__measured' + (up ? ' dupgrade__measured--up' : ' dupgrade__measured--down'),
        (up ? '+' : '') + check.deltaDps.toFixed(1) + ' simulated',
      );
      measured.title = 'Ran the fight again with it on, give or take ' + check.stderr.toFixed(2);
      row.appendChild(measured);
    } else {
      const button = el('button', 'btn btn--sm', 'Confirm');
      button.title = 'Run the whole fight again with this item on';
      if (busy) button.setAttribute('disabled', '');
      button.addEventListener('click', () => handlers.onConfirmSwap(upgrade.slot, upgrade.to));
      row.appendChild(button);
    }

    body.appendChild(row);
  }

  body.appendChild(
    el(
      'p',
      'drawer__hint',
      'The figure on the right comes from the weights, which draw a straight line through ' +
        'something that bends: hit stops paying at the cap, and mana stops mattering once you ' +
        'have enough. Confirming runs the fight again with the item on and reports what moved.',
    ),
  );

  panel.appendChild(body);
  return panel;
}

/* ------------------------------------------------------------- unsupported */

export function renderUnsupported(specLabel: string): HTMLElement {
  const panel = el('section', 'panel');
  panel.appendChild(el('div', 'panel__head', 'No simulation for this spec yet'));
  const body = el('div', 'panel__body');
  body.appendChild(
    el(
      'p',
      '',
      'The engine is built and your gear has been read, but nobody has written down how a ' +
        specLabel + ' actually fights. Until that file exists there is no damage figure to give ' +
        'you, and inventing one would be worse than admitting it.',
    ),
  );
  body.appendChild(
    el(
      'p',
      'drawer__hint',
      'Frost Mage is the spec that works today. The rest of this page, your sheet and your gear ' +
        'list, reads correctly for any class.',
    ),
  );
  panel.appendChild(body);
  return panel;
}
