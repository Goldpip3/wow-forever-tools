import { renderFooter, renderHeader } from '../shared/header';
import { CLASSES, type ClassId } from '../shared/classes';
import { copyText, toast } from '../shared/toast';
import { KEY_BUILDS, KEY_PREFS, readJson, writeJson } from '../shared/storage';
import { attachTooltips, refreshTip } from '../shared/tooltip';
import { loadTalentData, classTalents, spellbookFor } from './data';
import type { ClassTalents, TalentData } from './types';
import {
  addPoint,
  createBuild,
  pointsForLevel,
  primaryTree,
  removePoint,
  resetAll,
  resetTree,
  totalSpent,
  type BuildState,
} from './build';
import { decode, encode, hashFor, parseCode } from './codec';
import {
  blockedReason,
  renderBanner,
  renderClassTabs,
  renderLegend,
  renderPointsStrip,
  renderToolbar,
  renderTrees,
  type RenderContext,
} from './render';
import { buildTalentTip } from './compare';
import {
  collapsible,
  renderChangelogModal,
  renderClassAbilities,
  renderLegacy,
  renderRacials,
  renderSpellbook,
} from './sections';

interface SavedBuild {
  id: string;
  name: string;
  classKey: string;
  level: number;
  code: string;
  savedAt: string;
}

interface Prefs {
  compare?: boolean;
}

const app = document.getElementById('app');
let data: TalentData | null = null;
let cls: ClassTalents | null = null;
let build: BuildState | null = null;
let compare = readJson<Prefs>(KEY_PREFS, {}).compare ?? false;
let suppressHash = false;

function el(tag: string, cls2?: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (cls2) node.className = cls2;
  if (text !== undefined) node.textContent = text;
  return node;
}

function savedBuilds(): SavedBuild[] {
  return readJson<SavedBuild[]>(KEY_BUILDS, []);
}

function ctx(): RenderContext {
  return { cls: cls!, build: build!, compare };
}

function className(): string {
  return CLASSES[build!.classKey as ClassId]?.name ?? build!.classKey;
}

/* ------------------------------------------------------------ state changes */

function syncHash(): void {
  if (!build) return;
  suppressHash = true;
  const next = '#' + hashFor(build);
  if (location.hash !== next) history.replaceState(null, '', next);
  window.setTimeout(() => {
    suppressHash = false;
  }, 0);
}

function update(): void {
  syncHash();
  draw();
}

async function switchClass(classKey: string, level: number, code?: string): Promise<void> {
  if (!data) return;
  const next = classTalents(data, classKey);
  if (!next) {
    toast('No data for that class');
    return;
  }
  cls = next;
  build = code ? decode(next, code) : null;
  if (!build) build = createBuild(classKey, next, level);
  build.classKey = classKey;
  build.level = level;
  update();
}

/* ------------------------------------------------------------------ drawing */

function tipFor(cell: HTMLElement): Node | null {
  if (!cls || !build) return null;
  const treeIdx = Number(cell.dataset.tree);
  const talentIdx = Number(cell.dataset.talent);
  const talent = cls.trees[treeIdx]?.talents[talentIdx];
  if (!talent) return null;
  return buildTalentTip({
    talent,
    rank: build.ranks[treeIdx]?.[talentIdx] ?? 0,
    compare,
    blocked: blockedReason(ctx(), treeIdx, talentIdx),
  });
}

function onCellPointer(ev: MouseEvent): void {
  const target = (ev.target as Element | null)?.closest('.cell') as HTMLElement | null;
  if (!target || !cls || !build) return;
  const treeIdx = Number(target.dataset.tree);
  const talentIdx = Number(target.dataset.talent);

  const remove = ev.type === 'contextmenu' || ev.shiftKey || ('button' in ev && ev.button === 2);
  const result = remove
    ? removePoint(cls, build, treeIdx, talentIdx)
    : addPoint(cls, build, treeIdx, talentIdx);

  if (!result.ok && result.reason) toast(result.reason);
  if (result.ok) update();
  refreshTip(() => tipFor(target));
}

function draw(): void {
  if (!app || !data || !cls || !build) return;
  const scrollY = window.scrollY;
  app.replaceChildren();

  const whatsNew = el('button', 'btn btn--gold', 'What changed');
  whatsNew.addEventListener('click', () => {
    document.body.appendChild(renderChangelogModal(data!.changelog ?? []));
  });

  renderHeader({
    page: 'talents',
    nav: [whatsNew],
  });

  app.appendChild(renderClassTabs(build.classKey));

  app.appendChild(
    renderToolbar(ctx(), {
      savedBuilds: savedBuilds()
        .filter((b) => b.classKey === build!.classKey)
        .map((b) => ({ id: b.id, name: b.name })),
      onLevel: (level) => {
        build!.level = level;
        const max = pointsForLevel(level);
        // Trim from the end of the last tree so the build stays legal.
        let over = totalSpent(build!.ranks) - max;
        for (let t = build!.ranks.length - 1; t >= 0 && over > 0; t -= 1) {
          const tree = build!.ranks[t]!;
          for (let i = tree.length - 1; i >= 0 && over > 0; i -= 1) {
            while (tree[i]! > 0 && over > 0) {
              if (!removePoint(cls!, build!, t, i).ok) break;
              over -= 1;
            }
          }
        }
        update();
      },
      onReset: () => {
        resetAll(build!);
        update();
        toast('Build reset');
      },
      onCopyLink: () => {
        const url = location.origin + location.pathname + '#' + encode(build!);
        void copyText(url, 'Link copied');
      },
      onToggleCompare: () => {
        compare = !compare;
        writeJson(KEY_PREFS, { compare });
        draw();
      },
      onPickBuild: (id) => {
        const found = savedBuilds().find((b) => b.id === id);
        if (!found) return;
        void switchClass(found.classKey, found.level, found.code);
        toast('Loaded ' + found.name);
      },
    }),
  );

  app.appendChild(renderBanner(ctx(), build.classKey));
  app.appendChild(renderPointsStrip(ctx()));

  const trees = renderTrees(ctx(), {
    onResetTree: (treeIdx) => {
      resetTree(build!, treeIdx);
      update();
    },
  });
  trees.addEventListener('click', onCellPointer);
  trees.addEventListener('contextmenu', (ev) => {
    if ((ev.target as Element | null)?.closest('.cell')) {
      ev.preventDefault();
      onCellPointer(ev as MouseEvent);
    }
  });
  attachTooltips(
    trees,
    (target) => (target.closest('.cell') as HTMLElement | null),
    (cell) => tipFor(cell),
  );
  app.appendChild(trees);

  app.appendChild(renderActions());
  app.appendChild(renderRacials(data, className()));

  const book = renderSpellbook(spellbookFor(data, build.classKey), className());
  if (book) app.appendChild(book);

  const abilities = renderClassAbilities(data, build.classKey, className());
  if (abilities) app.appendChild(abilities);

  const legacy = renderLegacy(data.legacy);
  if (legacy) app.appendChild(legacy);

  app.appendChild(renderLegend());
  app.appendChild(renderFooter());

  window.scrollTo({ top: scrollY });
}

/* ------------------------------------------------------ save / share / export */

function renderActions(): HTMLElement {
  const body = el('div');

  body.appendChild(el('div', 'section-label', 'My builds'));
  const saveRow = el('div', 'actions');
  const nameInput = document.createElement('input');
  nameInput.className = 'btn';
  nameInput.placeholder = defaultBuildName();
  nameInput.setAttribute('aria-label', 'Build name');
  nameInput.style.minWidth = '190px';
  const save = el('button', 'btn btn--gold', 'Save this build');
  save.addEventListener('click', () => {
    const list = savedBuilds();
    const entry: SavedBuild = {
      id: 'b' + Date.now().toString(36),
      name: nameInput.value.trim() || defaultBuildName(),
      classKey: build!.classKey,
      level: build!.level,
      code: encode(build!),
      savedAt: new Date().toISOString(),
    };
    list.unshift(entry);
    if (writeJson(KEY_BUILDS, list.slice(0, 40))) {
      toast('Saved ' + entry.name);
      draw();
    } else {
      toast('This browser would not let me save');
    }
  });
  saveRow.append(nameInput, save);
  body.appendChild(saveRow);
  body.appendChild(el('p', 'hint', 'Kept on this device only. Pick it back up from the Builds menu.'));

  const list = savedBuilds().filter((b) => b.classKey === build!.classKey);
  if (list.length) {
    const ul = el('ul', 'book__list');
    for (const item of list) {
      const li = document.createElement('li');
      const load = el('button', 'btn btn--sm', item.name + '  (' + item.level + ')');
      load.addEventListener('click', () => {
        void switchClass(item.classKey, item.level, item.code);
      });
      const del = el('button', 'btn btn--sm', 'Delete');
      del.addEventListener('click', () => {
        writeJson(KEY_BUILDS, savedBuilds().filter((b) => b.id !== item.id));
        draw();
      });
      li.append(load, del);
      li.style.gap = '6px';
      li.style.justifyContent = 'flex-start';
      ul.appendChild(li);
    }
    body.appendChild(ul);
  }

  body.appendChild(el('div', 'section-label', 'Share'));
  const shareRow = el('div', 'actions');
  const copyLink = el('button', 'btn', 'Copy link');
  copyLink.addEventListener('click', () => {
    void copyText(location.origin + location.pathname + '#' + encode(build!), 'Link copied');
  });
  const copyCode = el('button', 'btn', 'Copy build code');
  copyCode.addEventListener('click', () => {
    void copyText(encode(build!), 'Code copied');
  });
  shareRow.append(copyLink, copyCode);
  body.appendChild(shareRow);

  const planner = el('div', 'actions');
  planner.style.marginTop = '12px';
  const toRaid = document.createElement('a');
  toRaid.className = 'btn btn--gold';
  toRaid.href = 'raid.html#import=' + encodeURIComponent(encode(build!));
  toRaid.textContent = 'Take this build to the raid planner';
  planner.appendChild(toRaid);
  body.appendChild(planner);

  return collapsible('Save and share', undefined, body, true);
}

function defaultBuildName(): string {
  const primary = primaryTree(cls!, build!);
  return primary ? primary.tree.name + ' ' + className() : className() + ' build';
}

/* -------------------------------------------------------------------- routing */

function readHash(): void {
  const parsed = parseCode(location.hash);
  const classKey = parsed?.classKey ?? 'warrior';
  const level = parsed?.level ?? 60;
  const code = parsed && parsed.trees.length ? location.hash.replace(/^#/, '') : undefined;
  void switchClass(classKey, level, code);
}

async function start(): Promise<void> {
  if (!app) return;
  app.appendChild(el('p', 'hint', 'Loading talent data...'));
  try {
    data = await loadTalentData();
  } catch (err) {
    app.replaceChildren();
    renderHeader({
      page: 'talents',
    });
    app.appendChild(
      el(
        'p',
        'error',
        'Talent data did not load. Run "npm run import" to fetch it, then reload. (' +
          (err as Error).message +
          ')',
      ),
    );
    return;
  }

  readHash();
  window.addEventListener('hashchange', () => {
    if (suppressHash) return;
    readHash();
  });
}

void start();
