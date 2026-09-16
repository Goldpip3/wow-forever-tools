import { renderFooter, renderHeader } from '../shared/header';
import { accountView, loadUser } from '../shared/session';
import { copyText, toast } from '../shared/toast';
import { KEY_CHARACTERS, KEY_PREFS, readJson, writeJson } from '../shared/storage';
import { attachTooltips } from '../shared/tooltip';
import { CLASSES, specById } from '../shared/classes';
import type { TalentData } from '../talents/types';
import { loadTalentData } from '../talents/data';
import { dataKeyFor } from '../talents/codec';

import type { ItemRef, Slot, StatKey } from './export-format';
import type { Character, ImportIssue } from './types';
import { parseCharacterExport, parseCharacterValue } from './importer';
import { buildCodeFromExport } from './talents';
import { MAX_SAVED, decodeCharacter, encodeCharacter, type SavedCharacter } from './codec';
import { SAMPLE_EXPORT } from './sample';
import { DEFAULT_BUFFS, DEFAULT_CONSUMABLES, type BuffKind } from './data/buffs';
import { rankAll, upgrades, type SlotRanking } from './gear';
import { dpsPerPoint, weightTable, normalise, type WeightResult, type WeightTable } from './weights';
import type { SwapResult } from './compare';
import type { FightConfig, SimResult } from './sim/types';
import { specModule } from './sim/specs';
import { runCompare, runSimulation, runWeights } from './client';
import {
  itemForCell,
  itemTip,
  renderCharacterPanel,
  renderGearPanel,
  renderImportPanel,
  renderHowTo,
  renderNotes,
  renderSaveBar,
  renderSheetPanel,
  resetItemIndex,
  type DpsHandlers,
  type SlotRowExtras,
} from './render';
import {
  renderFightPanel,
  renderResultsPanel,
  renderUnsupported,
  renderUpgradesPanel,
  renderWeightsPanel,
  upgradeKey,
  type Busy,
  type FightHandlers,
} from './render-sim';

const app = document.getElementById('app');

/* -------------------------------------------------------------------- state */

let character: Character | null = null;
let skipped: ImportIssue[] = [];
let warnings: string[] = [];
let talentData: TalentData | null = null;
let suppressHash = false;

let fight: FightConfig = defaultFight();
let rotation = 'standard';
let result: SimResult | null = null;
let weights: WeightResult | null = null;
let overrides: WeightTable = {};
const confirmed = new Map<string, SwapResult>();
let busy: Busy | null = null;

/** The slot whose other items are showing under the character sheet. */
let openSlot: Slot | null = null;

function defaultFight(): FightConfig {
  return {
    duration: 300,
    iterations: 1000,
    seed: 20260915,
    target: { level: 63, armor: 0, resistance: 0, behind: true, canParry: false, canBlock: false },
    buffs: [...DEFAULT_BUFFS],
    debuffs: [],
    consumables: [...DEFAULT_CONSUMABLES],
  };
}

/* ------------------------------------------------------------------- prefs */

interface DpsPrefs {
  fight?: FightConfig;
  overrides?: Record<number, WeightTable>;
  rotation?: string;
}

function prefs(): DpsPrefs {
  return readJson<{ dps?: DpsPrefs }>(KEY_PREFS, {}).dps ?? {};
}

function savePrefs(patch: DpsPrefs): void {
  const all = readJson<Record<string, unknown>>(KEY_PREFS, {});
  all.dps = { ...prefs(), ...patch };
  writeJson(KEY_PREFS, all);
}

function loadPrefs(): void {
  const saved = prefs();
  if (saved.fight) fight = { ...defaultFight(), ...saved.fight, target: { ...defaultFight().target, ...saved.fight.target } };
  if (saved.rotation) rotation = saved.rotation;
}

function savedCharacters(): SavedCharacter[] {
  return readJson<SavedCharacter[]>(KEY_CHARACTERS, []);
}

/* ------------------------------------------------------------------ import */

function classTalentsFor(id: string) {
  return talentData?.talents[dataKeyFor(id)];
}

function syncHash(): void {
  suppressHash = true;
  const next = character ? '#c=' + encodeCharacter(character.source, { trim: true }) : '';
  history.replaceState(null, '', location.pathname + location.search + next);
  window.setTimeout(() => {
    suppressHash = false;
  }, 0);
}

function update(): void {
  syncHash();
  draw();
}

/** A new character invalidates everything that was worked out for the old one. */
function clearResults(): void {
  result = null;
  weights = null;
  confirmed.clear();
  busy = null;
}

function adopt(imported: ReturnType<typeof parseCharacterExport>, quiet = false): boolean {
  if (imported.error || !imported.character) {
    if (!quiet) toast(imported.error ?? 'That would not read');
    return false;
  }
  character = imported.character;
  skipped = imported.skipped;
  warnings = imported.warnings;
  overrides = prefs().overrides?.[character.specId] ?? {};
  openSlot = null;
  clearResults();
  return true;
}

function guessClassKey(text: string): string {
  const match = /"classId"\s*:\s*"([a-z]+)"/i.exec(text);
  return match?.[1]?.toLowerCase() ?? '';
}

function importFromText(text: string): void {
  const imported = parseCharacterExport(text, classTalentsFor(guessClassKey(text)));
  if (!adopt(imported)) return;
  update();
  const spec = specById(character!.specId);
  toast('Read ' + character!.source.name + ', ' + (spec ? spec.name + ' ' : '') + CLASSES[character!.classId].name);
}

function backfillBuild(): void {
  if (!character || character.build) return;
  const cls = classTalentsFor(character.classId);
  if (!cls) return;
  character.build = buildCodeFromExport(
    character.classId,
    character.source.talents,
    cls,
    character.source.level,
  );
}

/* ------------------------------------------------------------------ running */

function fail(err: unknown): void {
  busy = null;
  const message = err instanceof Error ? err.message : String(err);
  if (message !== 'cancelled') toast(message);
  draw();
}

function runSim(): void {
  if (!character || busy) return;
  busy = { label: 'Simulating', done: 0, total: fight.iterations };
  draw();

  runSimulation(character, { ...fight }, rotation, (done, total) => {
    if (busy) {
      busy = { label: 'Simulating', done, total };
      drawProgress();
    }
  })
    .then((res) => {
      result = res;
      busy = null;
      draw();
    })
    .catch(fail);
}

function deriveWeightsNow(): void {
  if (!character || busy) return;
  // Weights only have to rank two items apart, which needs far less precision
  // than the damage figure, so they run on a fraction of the iterations.
  const iterations = Math.max(100, Math.min(400, Math.round(fight.iterations / 4)));
  busy = { label: 'Measuring stat weights', done: 0, total: 9 };
  draw();

  runWeights(character, { ...fight }, { iterations, rotation }, (done, total) => {
    if (busy) {
      busy = { label: 'Measuring stat weights', done, total };
      drawProgress();
    }
  })
    .then((res) => {
      weights = res;
      confirmed.clear();
      busy = null;
      draw();
    })
    .catch(fail);
}

function confirmSwap(slot: Slot, item: ItemRef): void {
  if (!character || busy) return;
  busy = { label: 'Checking ' + item.name, done: 0, total: 2 };
  draw();

  runCompare(
    character,
    { ...fight },
    [{ slot, item }],
    Math.max(200, Math.round(fight.iterations / 2)),
    rotation,
  )
    .then((res) => {
      const swap = res.results[0];
      if (swap) confirmed.set(upgradeKey(slot, item), swap);
      busy = null;
      draw();
    })
    .catch(fail);
}

/* ---------------------------------------------------------------- handlers */

const handlers: DpsHandlers = {
  onImport: (text) => importFromText(text),

  onLoadSample: () => importFromText(SAMPLE_EXPORT),

  onClear: () => {
    character = null;
    skipped = [];
    warnings = [];
    clearResults();
    openSlot = null;
    update();
    toast('Cleared');
  },

  onSave: (name) => {
    if (!character) return;
    const list = savedCharacters();
    const entry: SavedCharacter = {
      id: 'c' + Date.now().toString(36),
      name: name || character.source.name,
      code: encodeCharacter(character.source),
      savedAt: new Date().toISOString(),
    };
    list.unshift(entry);
    if (writeJson(KEY_CHARACTERS, list.slice(0, MAX_SAVED))) {
      toast('Saved ' + entry.name);
      draw();
    } else {
      toast('This browser would not let me save');
    }
  },

  onLoadSaved: (id) => {
    const entry = savedCharacters().find((c) => c.id === id);
    if (!entry) return;
    const source = decodeCharacter(entry.code);
    if (!source) {
      toast('That saved character would not load');
      return;
    }
    if (!adopt(parseCharacterValue(source, classTalentsFor(source.classId)))) return;
    update();
    toast('Loaded ' + entry.name);
  },

  onDeleteSaved: (id) => {
    writeJson(KEY_CHARACTERS, savedCharacters().filter((c) => c.id !== id));
    draw();
  },

  onCopyLink: () => {
    if (!character) return;
    const url = location.origin + location.pathname + '#c=' + encodeCharacter(character.source, { trim: true });
    void copyText(url, 'Link copied');
  },

  onCopyJson: () => {
    if (!character) return;
    void copyText(JSON.stringify(character.source, null, 2), 'Character JSON copied');
  },
};

const fightHandlers: FightHandlers = {
  onFightChange: (patch) => {
    fight = { ...fight, ...patch };
    savePrefs({ fight });
    // The old answer belonged to the old fight.
    result = null;
    weights = null;
    confirmed.clear();
    draw();
  },

  onToggleBuff: (id, on, kind: BuffKind) => {
    const key = kind === 'raid' ? 'buffs' : kind === 'consumable' ? 'consumables' : 'debuffs';
    const current = fight[key];
    fight = { ...fight, [key]: on ? [...current, id] : current.filter((b) => b !== id) };
    savePrefs({ fight });
    result = null;
    weights = null;
    confirmed.clear();
    draw();
  },

  onRotation: (name) => {
    rotation = name;
    savePrefs({ rotation });
    result = null;
    weights = null;
    draw();
  },

  onRun: runSim,
  onDeriveWeights: deriveWeightsNow,

  onWeightOverride: (stat: StatKey, value) => {
    if (value === null || !Number.isFinite(value)) delete overrides[stat];
    else overrides[stat] = value;
    if (character) {
      savePrefs({ overrides: { ...prefs().overrides, [character.specId]: overrides } });
    }
    confirmed.clear();
    draw();
  },

  onReference: (stat: StatKey) => {
    if (!weights) return;
    normalise(weights.weights, stat);
    weights = { ...weights, reference: stat };
    draw();
  },

  onConfirmSwap: confirmSwap,
};

/** Clicking a slot on the character sheet opens what else fits it, and closes it again. */
function selectSlot(slot: Slot): void {
  openSlot = openSlot === slot ? null : slot;
  draw();
}

/* -------------------------------------------------------------------- draw */

/** Repaints only the progress bar, so a long run does not rebuild the page. */
function drawProgress(): void {
  if (!busy) return;
  const fill = document.querySelector<HTMLElement>('.dprogress__fill');
  const label = document.querySelector<HTMLElement>('.dprogress__label');
  if (!fill || !label) return;
  const pct = busy.total > 0 ? Math.round((busy.done / busy.total) * 100) : 0;
  fill.style.width = pct + '%';
  label.textContent = busy.label + ' · ' + pct + '%';
}

/** Turns the ranking into the score lines the gear panel shows. */
function gearExtras(rankings: SlotRanking[], scale: number): Partial<Record<Slot, SlotRowExtras>> {
  const extras: Partial<Record<Slot, SlotRowExtras>> = {};
  const unit = scale > 0 ? ' damage per second' : ' points';
  const show = (value: number) => (scale > 0 ? value * scale : value).toFixed(1);

  for (const ranking of rankings) {
    const row: SlotRowExtras = {
      candidates: ranking.candidates.map((candidate) => ({
        item: candidate.item,
        note: (candidate.gain >= 0 ? '+' : '') + show(candidate.gain) + unit,
        better: candidate.gain > 0,
      })),
    };
    if (ranking.equipped) row.note = 'worth ' + show(ranking.equipped.score) + unit;
    extras[ranking.slot] = row;
  }
  return extras;
}

function draw(): void {
  if (!app) return;
  const scroll = window.scrollY;
  resetItemIndex();
  app.replaceChildren();

  const info = character ? CLASSES[character.classId] : null;
  const spec = character ? specById(character.specId) : undefined;

  renderHeader({
    page: 'dps',
    account: accountView(draw),
  });

  if (!character) {
    app.appendChild(renderHowTo());
    app.appendChild(renderImportPanel(handlers, false));
    const saved = savedCharacters();
    if (saved.length) app.appendChild(renderSavedOnly(saved));
    app.appendChild(renderFooter());
    window.scrollTo(0, scroll);
    return;
  }

  app.appendChild(renderCharacterPanel(character));

  const notes = renderNotes(warnings, skipped);
  if (notes) app.appendChild(notes);

  const module = specModule(character.specId);
  const table = weights ? weightTable(weights, overrides) : null;
  const rankings = table ? rankAll(character, table) : [];
  const scale = weights ? dpsPerPoint(weights) : 0;

  const main = document.createElement('div');
  main.className = 'dmain';

  const left = document.createElement('div');
  left.className = 'dcol';

  if (table) {
    left.appendChild(
      renderUpgradesPanel(upgrades(character, table), confirmed, fightHandlers, busy, scale),
    );
  }
  left.appendChild(renderGearPanel(character, table ? gearExtras(rankings, scale) : {}, openSlot, selectSlot));
  main.appendChild(left);

  const right = document.createElement('div');
  right.className = 'dcol';

  if (module) {
    right.appendChild(renderFightPanel(fight, module, rotation, fightHandlers, busy));
    if (result) right.appendChild(renderResultsPanel(result));
    if (weights) right.appendChild(renderWeightsPanel(weights, overrides, fightHandlers));
  } else {
    right.appendChild(renderUnsupported(spec ? spec.name + ' ' + info!.name : info!.name));
  }

  right.appendChild(renderSheetPanel(character));
  right.appendChild(renderSaveBar(handlers, savedCharacters(), character.source.name));
  right.appendChild(renderImportPanel(handlers, true));
  right.appendChild(renderHowTo(true));
  main.appendChild(right);

  app.appendChild(main);
  app.appendChild(renderFooter());

  attachTooltips(
    main,
    (target) => (target as Element).closest<HTMLElement>('.ditem, .dcell'),
    (node) => {
      const item = itemForCell(node);
      return item ? itemTip(item) : null;
    },
  );

  window.scrollTo(0, scroll);
}

function renderSavedOnly(saved: SavedCharacter[]): HTMLElement {
  const panel = document.createElement('section');
  panel.className = 'panel';
  const head = document.createElement('div');
  head.className = 'panel__head';
  head.textContent = 'Saved on this device';
  panel.appendChild(head);

  const body = document.createElement('div');
  body.className = 'panel__body';
  const list = document.createElement('div');
  list.className = 'spec-picker';

  for (const entry of saved) {
    const pair = document.createElement('span');
    pair.style.display = 'inline-flex';
    pair.style.gap = '2px';

    const load = document.createElement('button');
    load.className = 'btn btn--sm';
    load.textContent = entry.name;
    load.addEventListener('click', () => handlers.onLoadSaved(entry.id));

    const del = document.createElement('button');
    del.className = 'btn btn--sm';
    del.textContent = '×';
    del.title = 'Delete ' + entry.name;
    del.addEventListener('click', () => handlers.onDeleteSaved(entry.id));

    pair.append(load, del);
    list.appendChild(pair);
  }

  body.appendChild(list);
  panel.appendChild(body);
  return panel;
}

/* -------------------------------------------------------------------- hash */

function readHash(): void {
  const hash = location.hash.replace(/^#/, '');
  if (!hash.startsWith('c=')) {
    draw();
    return;
  }
  const source = decodeCharacter(hash.slice(2));
  if (!source) {
    draw();
    toast('That link would not open');
    return;
  }
  adopt(parseCharacterValue(source, classTalentsFor(source.classId)), true);
  draw();
}

window.addEventListener('hashchange', () => {
  if (suppressHash) return;
  readHash();
});

loadPrefs();
readHash();

/* Ask once who is signed in, and repaint the header when the answer lands. */
void loadUser(draw);

// The build code needs the talent file, which lands after the first paint.
void loadTalentData()
  .then((data) => {
    talentData = data;
    backfillBuild();
    draw();
  })
  .catch(() => {
    toast('Talent data would not load, so build links are off');
  });
