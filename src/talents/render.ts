import type { ClassTalents, Talent, Tree } from './types';
import {
  MAX_COL,
  MAX_LEVEL,
  MAX_POINTS,
  MAX_ROW,
  MIN_LEVEL,
  cellState,
  canAdd,
  levelNeeded,
  nextRowAt,
  pointsForLevel,
  pointsLeft,
  primaryTree,
  rowRequirement,
  totalSpent,
  treeTotal,
  type BuildState,
} from './build';
import { bgUrl, iconImg, iconUrl } from '../shared/icons';
import { CLASSES, type ClassId } from '../shared/classes';

export interface RenderContext {
  cls: ClassTalents;
  build: BuildState;
  compare: boolean;
  /** A tap takes a point back rather than adding one. */
  removing?: boolean;
}

function el(tag: string, cls?: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

/* ---------------------------------------------------------------- class tabs */

export function renderClassTabs(current: string): HTMLElement {
  const bar = el('div', 'class-tabs');
  for (const info of Object.values(CLASSES)) {
    const a = document.createElement('a');
    a.className = 'class-tab' + (info.id === current ? ' class-tab--on' : '');
    a.href = '#' + info.id + '/60/';
    a.dataset.classId = info.id;
    a.appendChild(iconImg(info.icon, info.name, 'class-tab__icon'));
    const name = el('span', 'class-tab__name', info.name);
    name.style.color = info.color;
    a.appendChild(name);
    bar.appendChild(a);
  }
  return bar;
}

/* ------------------------------------------------------------------ toolbar */

export interface ToolbarHandlers {
  onLevel: (level: number) => void;
  onReset: () => void;
  onCopyLink: () => void;
  onToggleCompare: () => void;
  onToggleRemoving: () => void;
  onPickBuild: (id: string) => void;
  savedBuilds: Array<{ id: string; name: string }>;
}

export function renderToolbar(ctx: RenderContext, h: ToolbarHandlers): HTMLElement {
  const bar = el('div', 'toolbar');

  const left = el('div', 'toolbar__group');
  left.appendChild(el('span', 'toolbar__label', 'Level'));

  const select = document.createElement('select');
  select.className = 'btn';
  select.setAttribute('aria-label', 'Character level');
  for (let lvl = MAX_LEVEL; lvl >= MIN_LEVEL; lvl -= 1) {
    const opt = document.createElement('option');
    opt.value = String(lvl);
    opt.textContent = 'Level ' + lvl;
    if (lvl === ctx.build.level) opt.selected = true;
    select.appendChild(opt);
  }
  select.addEventListener('change', () => h.onLevel(Number(select.value)));
  left.appendChild(select);

  const reset = el('button', 'btn', 'Reset');
  reset.addEventListener('click', h.onReset);
  left.appendChild(reset);

  const copy = el('button', 'btn', 'Copy link');
  copy.addEventListener('click', h.onCopyLink);
  left.appendChild(copy);

  const builds = document.createElement('select');
  builds.className = 'btn toolbar__builds';
  const head = document.createElement('option');
  head.value = '';
  head.textContent = h.savedBuilds.length ? 'Builds' : 'Builds (none saved)';
  builds.appendChild(head);
  for (const b of h.savedBuilds) {
    const opt = document.createElement('option');
    opt.value = b.id;
    opt.textContent = b.name;
    builds.appendChild(opt);
  }
  builds.addEventListener('change', () => {
    if (builds.value) h.onPickBuild(builds.value);
    builds.value = '';
  });
  left.appendChild(builds);

  bar.appendChild(left);

  const right = el('div', 'toolbar__group');
  const take = el('button', 'btn' + (ctx.removing ? ' btn--on' : ''), 'Take points back');
  take.setAttribute('aria-pressed', String(!!ctx.removing));
  take.title = 'While this is on, a tap or click takes a point back';
  take.addEventListener('click', h.onToggleRemoving);
  right.appendChild(take);
  const cmp = el('button', 'btn' + (ctx.compare ? ' btn--on' : ''), 'Compare to Classic');
  cmp.addEventListener('click', h.onToggleCompare);
  right.appendChild(cmp);
  bar.appendChild(right);

  return bar;
}

/* ------------------------------------------------------------------- banner */

export function renderBanner(ctx: RenderContext, classKey: string): HTMLElement {
  const info = CLASSES[classKey as ClassId];
  const banner = el('div', 'banner');
  const primary = primaryTree(ctx.cls, ctx.build);
  banner.style.backgroundImage =
    'linear-gradient(90deg, rgba(18,18,18,.92), rgba(18,18,18,.55) 55%, rgba(18,18,18,.85)), url(' +
    bgUrl(primary ? primary.tree.bg : ctx.cls.trees[0]!.bg) +
    ')';

  const titles = el('div', 'banner__titles');
  const h2 = el('h2', 'banner__class', info?.name ?? classKey);
  if (info) h2.style.color = info.color;
  titles.appendChild(h2);

  const spec = el('div', 'banner__spec');
  if (primary) {
    spec.appendChild(el('span', 'banner__spec-name', primary.tree.name + ' ' + info?.name));
    spec.appendChild(el('span', 'banner__spec-points', primary.points + ' ' + primary.tree.name));
  } else {
    spec.appendChild(el('span', 'banner__spec-name', 'No talents spent yet'));
  }
  titles.appendChild(spec);
  banner.appendChild(titles);

  const bars = el('div', 'banner__bars');
  ctx.cls.trees.forEach((tree, i) => {
    const points = treeTotal(ctx.build.ranks, i);
    const row = el('div', 'banner__bar');
    row.appendChild(iconImg(tree.icon, tree.name, 'banner__bar-icon'));
    const track = el('div', 'banner__bar-track');
    const fill = el('div', 'banner__bar-fill');
    fill.style.width = Math.round((points / MAX_POINTS) * 100) + '%';
    track.appendChild(fill);
    row.appendChild(track);
    row.appendChild(el('span', 'banner__bar-count', String(points)));
    row.title = tree.name + ': ' + points + ' points';
    bars.appendChild(row);
  });
  banner.appendChild(bars);

  return banner;
}

/* -------------------------------------------------------------- points strip */

export function renderPointsStrip(ctx: RenderContext): HTMLElement {
  const strip = el('div', 'points');
  strip.appendChild(el('span', 'points__title', 'Talents'));

  const right = el('div', 'points__right');
  const split = ctx.cls.trees.map((_, i) => treeTotal(ctx.build.ranks, i)).join('/');
  right.appendChild(el('span', 'points__split', split));

  const left = pointsLeft(ctx.build);
  const leftEl = el('span', 'points__left', 'Points left: ' + left);
  if (left === 0) leftEl.classList.add('points__left--none');
  right.appendChild(leftEl);

  const spent = totalSpent(ctx.build.ranks);
  if (spent > 0) {
    right.appendChild(el('span', 'points__level', 'Level needed: ' + levelNeeded(ctx.build)));
  }
  strip.appendChild(right);

  if (left === 0 && spent >= pointsForLevel(ctx.build.level)) {
    const note = el(
      'div',
      'points__note',
      spent >= MAX_POINTS
        ? 'All 51 points are spent. Take one back before adding another.'
        : 'Every point for level ' + ctx.build.level + ' is spent. Level up or take one back.',
    );
    strip.appendChild(note);
  }

  return strip;
}

/* ------------------------------------------------------------------- trees */

function rankBadge(rank: number, max: number, state: string): HTMLElement {
  const badge = el('span', 'cell__rank cell__rank--' + state, rank + '/' + max);
  return badge;
}

/**
 * Arrows run from a prerequisite to the talent that needs it. The data has
 * vertical hops of one to three rows and horizontal hops of one column.
 */
function renderArrow(from: Talent, to: Talent, active: boolean): HTMLElement {
  const arrow = el('div', 'arrow' + (active ? ' arrow--on' : ''));
  const dRow = to.row - from.row;
  const dCol = to.col - from.col;

  if (dCol === 0) {
    arrow.classList.add('arrow--v');
    arrow.style.gridColumn = String(from.col);
    arrow.style.gridRow = from.row + ' / ' + (to.row + 1);
  } else if (dRow === 0) {
    arrow.classList.add(dCol > 0 ? 'arrow--r' : 'arrow--l');
    arrow.style.gridRow = String(from.row);
    arrow.style.gridColumn = dCol > 0 ? from.col + ' / ' + (to.col + 1) : to.col + ' / ' + (from.col + 1);
  } else {
    // No diagonal links exist in the data; fall back to a vertical run.
    arrow.classList.add('arrow--v');
    arrow.style.gridColumn = String(to.col);
    arrow.style.gridRow = from.row + ' / ' + (to.row + 1);
  }
  return arrow;
}

export interface TreeHandlers {
  onResetTree: (treeIdx: number) => void;
}

export function renderTree(
  ctx: RenderContext,
  treeIdx: number,
  h: TreeHandlers,
): HTMLElement {
  const tree: Tree = ctx.cls.trees[treeIdx]!;
  const panel = el('div', 'tree');
  panel.dataset.tree = String(treeIdx);

  /* header */
  const head = el('div', 'tree__head');
  head.appendChild(iconImg(tree.icon, tree.name, 'tree__icon'));
  const titles = el('div', 'tree__titles');
  titles.appendChild(el('div', 'tree__name', tree.name));
  const next = nextRowAt(ctx.cls, ctx.build.ranks, treeIdx);
  titles.appendChild(
    el('div', 'tree__next', next === null ? 'every row open' : 'next row at ' + next),
  );
  head.appendChild(titles);

  const points = treeTotal(ctx.build.ranks, treeIdx);
  head.appendChild(el('div', 'tree__count', points + ' / ' + MAX_POINTS));

  const reset = el('button', 'tree__reset', '↺');
  reset.title = 'Reset ' + tree.name;
  reset.setAttribute('aria-label', 'Reset ' + tree.name);
  reset.addEventListener('click', () => h.onResetTree(treeIdx));
  head.appendChild(reset);
  panel.appendChild(head);

  /* grid */
  const grid = el('div', 'grid');
  grid.style.backgroundImage =
    'linear-gradient(rgba(12,12,12,.55), rgba(12,12,12,.72)), url(' + bgUrl(tree.bg) + ')';

  const byName = new Map<string, Talent>();
  for (const t of tree.talents) byName.set(t.name, t);

  // Arrows first so cells paint over them.
  tree.talents.forEach((talent, idx) => {
    if (!talent.req) return;
    const from = byName.get(talent.req);
    if (!from) return;
    const fromIdx = tree.talents.indexOf(from);
    const active =
      (ctx.build.ranks[treeIdx]?.[fromIdx] ?? 0) >= from.max &&
      (ctx.build.ranks[treeIdx]?.[idx] ?? 0) > 0;
    grid.appendChild(renderArrow(from, talent, active));
  });

  tree.talents.forEach((talent, idx) => {
    const rank = ctx.build.ranks[treeIdx]?.[idx] ?? 0;
    const state = cellState(ctx.cls, ctx.build, treeIdx, idx);
    const cell = el('button', 'cell cell--' + state);
    cell.style.gridRow = String(talent.row);
    cell.style.gridColumn = String(talent.col);
    cell.dataset.tree = String(treeIdx);
    cell.dataset.talent = String(idx);
    cell.dataset.name = talent.name;
    cell.dataset.focusKey = 'cell-' + treeIdx + '-' + idx;
    cell.setAttribute(
      'aria-label',
      talent.name + ', rank ' + rank + ' of ' + talent.max + ', ' + state +
        '. Enter adds a point, Delete takes one back.',
    );
    cell.setAttribute('aria-keyshortcuts', 'Enter Delete');

    const frame = el('span', 'cell__frame');
    const img = iconImg(talent.icon, '', 'cell__icon');
    frame.appendChild(img);
    cell.appendChild(frame);
    cell.appendChild(rankBadge(rank, talent.max, state));

    const status = talent.classic?.status;
    if (ctx.compare && status && status !== 'same') {
      const flag = el('span', 'cell__flag cell__flag--' + status, status.charAt(0).toUpperCase());
      flag.title = status + ' compared to Classic';
      cell.appendChild(flag);
    }
    grid.appendChild(cell);
  });

  // Keep the grid a fixed shape even when a tree has empty rows.
  grid.style.gridTemplateRows = 'repeat(' + MAX_ROW + ', auto)';
  grid.style.gridTemplateColumns = 'repeat(' + MAX_COL + ', 1fr)';

  panel.appendChild(grid);

  /* removed-in-Forever footnote */
  if (ctx.compare && tree.removed?.length) {
    const removed = el('div', 'tree__removed');
    removed.appendChild(
      el('div', 'tree__removed-head', 'Gone from this tree in Forever'),
    );
    const list = el('ul', 'tree__removed-list');
    for (const r of tree.removed) {
      const li = document.createElement('li');
      li.textContent = r.name;
      if (r.text) li.title = r.text;
      list.appendChild(li);
    }
    removed.appendChild(list);
    panel.appendChild(removed);
  }

  return panel;
}

export function renderTrees(ctx: RenderContext, h: TreeHandlers): HTMLElement {
  const wrap = el('div', 'trees');
  ctx.cls.trees.forEach((_, i) => wrap.appendChild(renderTree(ctx, i, h)));
  return wrap;
}

/* ---------------------------------------------------------------- the legend */

export function renderLegend(): HTMLElement {
  const panel = el('section', 'panel');
  const head = el('div', 'panel__head', 'How it works');
  panel.appendChild(head);
  const body = el('div', 'panel__body');

  const samples = el('div', 'legend');
  const rows: Array<[string, string, string]> = [
    ['open', '0/3', 'open'],
    ['learning', '4/5', 'learning'],
    ['maxed', '3/3', 'maxed'],
    ['locked', '0/2', 'locked'],
  ];
  for (const [state, text, label] of rows) {
    const item = el('div', 'legend__item');
    const box = el('div', 'legend__box cell cell--' + state);
    const frame = el('span', 'cell__frame');
    const img = document.createElement('img');
    img.src = iconUrl('ability_warrior_charge');
    img.alt = '';
    img.className = 'cell__icon';
    frame.appendChild(img);
    box.appendChild(frame);
    box.appendChild(el('span', 'cell__rank cell__rank--' + state, text));
    item.appendChild(box);
    item.appendChild(el('span', 'legend__label', label));
    samples.appendChild(item);
  }
  body.appendChild(samples);

  const notes = el('ul', 'legend__notes');
  for (const note of [
    'Click or tap adds a point. Right-click, Shift+click or Delete takes one back, and so does a tap while Take points back is on.',
    'Rows open every 5 points in that tree. An arrow means the talent it comes from has to be maxed first.',
    'Estimated in a tooltip means the demo only showed some ranks and the rest were scaled from those.',
    'Turn on Compare to Classic to see each talent beside its Classic version, plus what was cut from each tree.',
  ]) {
    const li = document.createElement('li');
    li.textContent = note;
    notes.appendChild(li);
  }
  body.appendChild(notes);
  panel.appendChild(body);
  return panel;
}

export function talentAt(ctx: RenderContext, treeIdx: number, talentIdx: number): Talent | undefined {
  return ctx.cls.trees[treeIdx]?.talents[talentIdx];
}

export function blockedReason(
  ctx: RenderContext,
  treeIdx: number,
  talentIdx: number,
): string | undefined {
  const rank = ctx.build.ranks[treeIdx]?.[talentIdx] ?? 0;
  const talent = talentAt(ctx, treeIdx, talentIdx);
  if (!talent || rank >= talent.max) return undefined;
  const check = canAdd(ctx.cls, ctx.build, treeIdx, talentIdx);
  if (check.ok) return undefined;
  // Row requirements read better as the threshold itself.
  if (check.reason?.startsWith('Requires ' + rowRequirement(talent.row))) return check.reason;
  return check.reason;
}
