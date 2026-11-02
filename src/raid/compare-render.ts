/**
 * Drawing the compare view. Read-only: each card opens back in the planner for changes.
 *
 * The planner's own panels keep module state (which rows are open, the Missing-only filter)
 * and look themselves up by id, which assumes one roster on the page. The cards here are
 * drawn fresh, and only the raid buff bar and the tooltip builder are reused.
 */

import type { Coverage } from './types';
import { computeCoverage, activeGroupCount } from './engine';
import { buildEffectTip, renderRaidBuffBar } from './render';
import { attachTooltips } from '../shared/tooltip';
import { iconImg } from '../shared/icons';
import { CLASSES, ROLE_ORDER, ROLE_SHORT, seatSpecOf } from '../shared/classes';
import {
  MAX_COMPARE,
  MIN_COMPARE,
  compareWarnings,
  summarise,
  type CompareEntry,
} from './compare';

function el(tag: string, cls?: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

export interface CompareHandlers {
  onOpen: (index: number) => void;
  onRemove: (index: number) => void;
  onBack: () => void;
  onCopyLink: () => void;
}

function countLine(problems: number, warnings: number): string {
  if (!problems && !warnings) return 'No problems';
  const parts: string[] = [];
  if (problems) parts.push(problems + (problems === 1 ? ' problem' : ' problems'));
  if (warnings) parts.push(warnings + (warnings === 1 ? ' warning' : ' warnings'));
  return parts.join(', ');
}

function renderCard(entry: CompareEntry, coverage: Coverage, index: number, count: number, h: CompareHandlers): HTMLElement {
  const s = summarise(entry, coverage);
  const card = el('section', 'panel cmp-card');

  const head = el('div', 'panel__head cmp-card__head');
  head.appendChild(el('span', 'cmp-card__name', entry.name));
  const full = s.seated === s.size;
  head.appendChild(el('span', 'tally' + (full ? ' tally--ok' : ''), s.seated + '/' + s.size));
  const actions = el('span', 'cmp-card__actions');
  const open = el('button', 'btn btn--sm btn--gold', 'Open in planner');
  open.addEventListener('click', () => h.onOpen(index));
  actions.appendChild(open);
  const remove = el('button', 'btn btn--sm', 'Remove');
  remove.title = count <= MIN_COMPARE ? 'Removing this one goes back to the planner' : 'Take ' + entry.name + ' out of the comparison';
  remove.addEventListener('click', () => h.onRemove(index));
  actions.appendChild(remove);
  head.appendChild(actions);
  card.appendChild(head);

  const body = el('div', 'panel__body cmp-card__body');

  const bar = renderRaidBuffBar(entry.roster, coverage);
  if (bar) body.appendChild(bar);

  // Roles, then classes.
  const counts = el('div', 'cmp-counts');
  for (const role of ROLE_ORDER) {
    counts.appendChild(el('span', 'cmp-role', s.roles[role] + ' ' + ROLE_SHORT[role]));
  }
  for (const c of s.classes) {
    if (!c.n) continue;
    const pill = el('span', 'cmp-class');
    pill.style.color = CLASSES[c.classId].color;
    pill.appendChild(iconImg(CLASSES[c.classId].icon, '', 'cmp-class__icon'));
    pill.appendChild(el('span', '', String(c.n)));
    pill.title = c.n + ' ' + CLASSES[c.classId].name + (c.n === 1 ? '' : 's');
    counts.appendChild(pill);
  }
  body.appendChild(counts);

  // The groups, names only.
  const groups = el('div', 'cmp-groups');
  const active = activeGroupCount(entry.roster.size);
  for (let g = 0; g < active; g += 1) {
    const box = el('div', 'cmp-group');
    box.appendChild(el('div', 'section-label', 'Group ' + (g + 1)));
    const list = el('ul', 'cmp-group__list');
    for (const p of entry.roster.groups[g] ?? []) {
      if (!p) {
        list.appendChild(el('li', 'cmp-group__empty', 'Empty'));
        continue;
      }
      const li = el('li');
      const name = el('span', 'cmp-group__name', p.name);
      name.style.color = CLASSES[p.classId].color;
      li.appendChild(name);
      const spec = seatSpecOf(p);
      if (spec) li.appendChild(el('span', 'cmp-group__spec', spec.short));
      li.title = p.name + (spec ? ', ' + spec.name + ' ' + CLASSES[p.classId].name : '');
      list.appendChild(li);
    }
    box.appendChild(list);
    groups.appendChild(box);
  }
  body.appendChild(groups);

  // What is missing.
  const missing = el('div', 'cmp-missing');
  missing.appendChild(el('div', 'section-label', 'Raid buffs not covered'));
  if (!s.missing.length) {
    missing.appendChild(el('p', 'empty-note', 'Every raid buff is covered.'));
  } else {
    const list = el('div', 'cmp-missing__list');
    for (const cov of s.missing) {
      const item = el('span', 'cmp-missing__item');
      item.dataset.effect = cov.effect.id;
      item.appendChild(iconImg(cov.effect.icon, '', 'cmp-missing__icon'));
      item.appendChild(el('span', '', cov.effect.name));
      list.appendChild(item);
    }
    missing.appendChild(list);
    attachTooltips(
      list,
      (target) => target.closest('.cmp-missing__item') as HTMLElement | null,
      (node) => {
        const cov = node.dataset.effect ? coverage.byEffect.get(node.dataset.effect) : undefined;
        return cov ? buildEffectTip(cov, active) : null;
      },
    );
  }
  body.appendChild(missing);

  if (s.camp.length) {
    const words = s.camp.map(
      (c) => c.object.name + (c.state === 'covers' ? '' : c.state === 'wasted' ? ' (wasted)' : ''),
    );
    body.appendChild(el('p', 'cmp-camp', 'At camp: ' + words.join(', ')));
  }

  body.appendChild(el('p', 'cmp-problems' + (s.problems ? ' cmp-problems--bad' : ''), countLine(s.problems, s.warnings)));

  card.appendChild(body);
  return card;
}

export function renderCompare(entries: readonly CompareEntry[], h: CompareHandlers): HTMLElement {
  const wrap = el('div', 'cmp-page');

  const bar = el('div', 'rtoolbar cmp-toolbar');
  bar.appendChild(el('span', 'cmp-toolbar__title', 'Comparing ' + entries.length + ' rosters'));
  const right = el('span', 'cmp-toolbar__actions');
  const copy = el('button', 'btn btn--sm', 'Copy link');
  copy.addEventListener('click', h.onCopyLink);
  const back = el('button', 'btn btn--sm', 'Back to planner');
  back.addEventListener('click', h.onBack);
  right.append(copy, back);
  bar.appendChild(right);
  wrap.appendChild(bar);

  const grid = el('div', 'cmp');
  entries.forEach((entry, i) => grid.appendChild(renderCard(entry, computeCoverage(entry.roster), i, entries.length, h)));
  wrap.appendChild(grid);

  const across = el('section', 'panel cmp-across');
  across.appendChild(el('div', 'panel__head', 'Across these raids'));
  const body = el('div', 'panel__body');
  const warnings = compareWarnings(entries);
  if (!warnings.length) {
    body.appendChild(el('p', 'empty-note', 'Nothing clashes across these raids.'));
  } else {
    for (const w of warnings) {
      const box = el('div', 'warn warn--' + w.level);
      box.appendChild(el('div', 'warn__title', w.title));
      box.appendChild(el('div', 'warn__detail', w.detail));
      body.appendChild(box);
    }
  }
  across.appendChild(body);
  wrap.appendChild(across);

  return wrap;
}

/** A roster the chooser can offer: a saved one, or the one on screen. */
export interface CompareOption {
  id: string;
  name: string;
  code: string;
  /** Set on the roster on screen, which is listed first. */
  current?: boolean;
}

export function renderCompareChooser(
  options: readonly CompareOption[],
  onCompare: (chosen: Array<{ name: string; code: string }>) => void,
  onClose: () => void,
): HTMLElement {
  const overlay = el('div', 'modal');
  const box = el('div', 'modal__box');
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-label', 'Compare rosters');

  const head = el('div', 'modal__head');
  head.appendChild(el('h2', 'modal__title', 'Compare rosters'));
  const close = el('button', 'btn btn--sm', '×');
  close.setAttribute('aria-label', 'Close');
  close.addEventListener('click', onClose);
  head.appendChild(close);
  box.appendChild(head);

  const body = el('div', 'modal__body');
  body.appendChild(
    el('p', 'drawer__hint', 'Pick ' + MIN_COMPARE + ' to ' + MAX_COMPARE + '. They show side by side in the order listed here.'),
  );

  const picked = new Set<string>();
  const go = el('button', 'btn btn--gold', 'Compare') as HTMLButtonElement;
  const sync = () => {
    go.disabled = picked.size < MIN_COMPARE || picked.size > MAX_COMPARE;
    go.textContent = picked.size ? 'Compare ' + picked.size : 'Compare';
  };

  const list = el('div', 'cmp-choose');
  for (const option of options) {
    const row = el('label', 'cmp-choose__row');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.addEventListener('change', () => {
      if (input.checked) picked.add(option.id);
      else picked.delete(option.id);
      sync();
    });
    row.appendChild(input);
    row.appendChild(el('span', '', option.current ? 'The roster on screen' : option.name));
    list.appendChild(row);
  }
  body.appendChild(list);

  go.addEventListener('click', () => {
    const chosen = options
      .filter((o) => picked.has(o.id))
      .map((o) => ({ name: o.current ? 'On screen' : o.name, code: o.code }));
    if (chosen.length >= MIN_COMPARE && chosen.length <= MAX_COMPARE) onCompare(chosen);
  });
  sync();
  const foot = el('div', 'cmp-choose__foot');
  foot.appendChild(go);
  body.appendChild(foot);

  box.appendChild(body);
  overlay.appendChild(box);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) onClose();
  });
  return overlay;
}
