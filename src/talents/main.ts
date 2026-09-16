import { renderFooter, renderHeader } from '../shared/header';
import { accountView, loadUser, SIGN_IN_MESSAGE, takeSignInOutcome } from '../shared/session';
import { CLASSES, type ClassId } from '../shared/classes';
import { copyText, toast } from '../shared/toast';
import {
  KEY_BUILDS, hasStrings, patchPrefs, readList, readPrefs, writeJson,
} from '../shared/storage';
import { attachTooltips, refreshTip } from '../shared/tooltip';
import { keepFocus } from '../shared/focus';
import { loadTalentData, classTalents } from './data';
import type { ClassTalents, TalentData } from './types';
import {
  addPoint,
  createBuild,
  legalize,
  primaryTree,
  removePoint,
  resetAll,
  resetTree,
  type BuildState,
} from './build';
import { decodeChecked, encode, hashFor, parseCode } from './codec';
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
  renderClassAbilities,
  renderLegacy,
  renderRacials,
} from './sections';

interface SavedBuild {
  id: string;
  name: string;
  classKey: string;
  level: number;
  code: string;
  savedAt: string;
}

const app = document.getElementById('app');
let data: TalentData | null = null;
let cls: ClassTalents | null = null;
let build: BuildState | null = null;
let compare = readPrefs().compare === true;
let suppressHash = false;
/** Tapping takes a point back instead of adding one. A touch screen has no right-click. */
let removing = false;

function el(tag: string, cls2?: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (cls2) node.className = cls2;
  if (text !== undefined) node.textContent = text;
  return node;
}

function savedBuilds(): SavedBuild[] {
  return readList(KEY_BUILDS, (v): v is SavedBuild =>
    hasStrings(v, ['id', 'name', 'classKey', 'code']) && typeof v.level === 'number');
}

function ctx(): RenderContext {
  return { cls: cls!, build: build!, compare, removing };
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
  const decoded = code ? decodeChecked(next, code) : null;
  const fresh = decoded?.build ?? createBuild(classKey, next, level);
  fresh.classKey = classKey;
  fresh.level = level;
  build = fresh;
  update();
  if (decoded?.dropped) {
    toast(
      decoded.dropped + (decoded.dropped === 1 ? ' point' : ' points') +
        ' in that link broke the talent rules and were left out.',
      4000,
    );
  }
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
  const remove =
    removing || ev.type === 'contextmenu' || ev.shiftKey || ('button' in ev && ev.button === 2);
  changeCell(target, remove);
}

/* Enter and Space press the cell like any button. Delete, Backspace and minus take a point
   back, which is the keyboard's right-click. */
function onCellKey(ev: KeyboardEvent): void {
  if (ev.key !== 'Delete' && ev.key !== 'Backspace' && ev.key !== '-') return;
  const target = (ev.target as Element | null)?.closest('.cell') as HTMLElement | null;
  if (!target) return;
  ev.preventDefault();
  changeCell(target, true);
}

function changeCell(target: HTMLElement | null, remove: boolean): void {
  if (!target || !cls || !build) return;
  const treeIdx = Number(target.dataset.tree);
  const talentIdx = Number(target.dataset.talent);

  const result = remove
    ? removePoint(cls, build, treeIdx, talentIdx)
    : addPoint(cls, build, treeIdx, talentIdx);

  if (!result.ok && result.reason) toast(result.reason);
  if (result.ok) update();
  refreshTip(() => tipFor(target));
}

/** Redraw the page, keeping the keyboard on the talent it was on. */
function draw(): void {
  keepFocus(drawNow);
}

function drawNow(): void {
  if (!app || !data || !cls || !build) return;
  const scrollY = window.scrollY;
  app.replaceChildren();

  renderHeader({ page: 'talents', account: accountView(draw) });

  app.appendChild(renderClassTabs(build.classKey));

  app.appendChild(
    renderToolbar(ctx(), {
      savedBuilds: savedBuilds()
        .filter((b) => b.classKey === build!.classKey)
        .map((b) => ({ id: b.id, name: b.name })),
      onLevel: (level) => {
        build!.level = level;
        // Fewer points: the same rules as a link decide what stays, so nothing is left
        // stranded below a row it no longer opens.
        build = legalize(cls!, build!).build;
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
      onToggleRemoving: () => {
        removing = !removing;
        draw();
      },
      onToggleCompare: () => {
        compare = !compare;
        // Only this page's part of the shared preferences; the gear page's stay as they are.
        if (!patchPrefs({ compare })) toast('This browser would not save that setting.');
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
  trees.addEventListener('keydown', onCellKey);
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
      account: accountView(draw),
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

/* Back from signing in: read the outcome and put back the fragment before anything reads it. */
const signIn = takeSignInOutcome();
if (signIn) window.setTimeout(() => toast(SIGN_IN_MESSAGE[signIn]), 0);

void start();

/* Ask once who is signed in, and repaint the header when the answer lands. */
void loadUser(() => {
  if (data) draw();
});
