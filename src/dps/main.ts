import { renderFooter, renderHeader } from '../shared/header';
import { accountView, loadUser } from '../shared/session';
import { copyText, toast } from '../shared/toast';
import { KEY_CHARACTERS, KEY_PREFS, KEY_REPORTS, readJson, writeJson } from '../shared/storage';
import { attachTooltips } from '../shared/tooltip';
import { CLASSES, specById } from '../shared/classes';
import type { TalentData } from '../talents/types';
import { loadTalentData } from '../talents/data';
import { dataKeyFor } from '../talents/codec';

import type { ItemRef, Slot, StatKey } from './export-format';
import type { Character, ImportIssue } from './types';
import { parseCharacterExport, parseCharacterValue } from './importer';
import { buildCodeFromExport } from './talents';
import {
  MAX_REPORTS, MAX_SAVED, decodeCharacter, decodeReport, encodeCharacter, encodeReport,
  summarise, type Report, type SavedCharacter, type SavedReport,
} from './codec';
import { SAMPLE_EXPORT } from './sample';
import { SAMPLE_WARRIOR_EXPORT } from './sample-warrior';
import { SAMPLE_ROGUE_EXPORT } from './sample-rogue';
import {
  DEFAULT_BUFFS, DEFAULT_CONSUMABLES, defaultsFor, type BuffKind, type BuffRole,
} from './data/buffs';
import { rankAll, upgrades, type SlotRanking } from './gear';
import { dpsPerPoint, weightTable, normalise, type WeightResult, type WeightTable } from './weights';
import type { SwapResult } from './compare';
import type { FightConfig, SimResult } from './sim/types';
import { specModule } from './sim/specs';
import { traceIteration } from './sim/sim';
import { buildNotes } from './sim/notes';
import { targetStateFor } from './sim/target';
import type { TraceEvent } from './sim/trace';
import { deriveStatSheet } from './stats';
import {
  runCompare, runDroptimizer, runSimulation, runTopGear, runWeights,
  type DropResult, type TopGearResult,
} from './client';
import { estimate, planTopGear } from './topgear';
import { renderTopGearPanel, type TopGearHandlers } from './render-topgear';
import { renderRotationPanel, type RotationHandlers } from './render-rotation';
import { renderDropPanel, type DropHandlers } from './render-droptimizer';
import { loadItemDatabase, type ItemDatabase } from './itemdb';
import { planDrops } from './droptimizer';
import { linesOf, type RotationLine } from './sim/rotation';
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

/**
 * Bumped when the shape of a fight changes in a way migrateFight has to know.
 *
 * Declared up here rather than beside defaultFight because the module state
 * below calls that during bootstrap, and a const read before its own line is a
 * dead-zone error. This repo has now been caught by that four times.
 */
const FIGHT_VERSION = 2;

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
/** One fight from the last run, replayed for the timeline. */
let trace: TraceEvent[] | null = null;
let topGear: TopGearResult | null = null;
let topGearPerSlot = 3;
/** A rotation somebody wrote themselves, per spec. Empty means the spec's own. */
let apl: RotationLine[] | null = null;
/** How fast this machine turned out to be, so an estimate can be given. */
let msPerIteration = 0.5;
/** The item list, when there is one. Null until it has been looked for. */
let items: ItemDatabase | null = null;
let drops: DropResult | null = null;
let dropZones: string[] = [];
/** The run in flight, so changing the fight or the character can call it off. */
let running: AbortController | null = null;

/** The slot whose other items are showing under the character sheet. */
let openSlot: Slot | null = null;

function defaultFight(): FightConfig {
  return {
    v: FIGHT_VERSION,
    style: { kind: 'patchwerk' },
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
  /** Which kind of character the ticked buffs were picked for. */
  role?: BuffRole;
  /** Rotations somebody wrote themselves, by spec id. */
  apl?: Record<number, RotationLine[]>;
}

function prefs(): DpsPrefs {
  return readJson<{ dps?: DpsPrefs }>(KEY_PREFS, {}).dps ?? {};
}

function savePrefs(patch: DpsPrefs): void {
  const all = readJson<Record<string, unknown>>(KEY_PREFS, {});
  all.dps = { ...prefs(), ...patch };
  writeJson(KEY_PREFS, all);
}

/**
 * Reads a fight that was written down earlier, whether in a link or in this
 * browser's preferences. Anything the shape has gained since is filled in from
 * the defaults rather than arriving undefined.
 */
function migrateFight(saved: Partial<FightConfig> | undefined): FightConfig {
  const base = defaultFight();
  if (!saved) return base;
  const merged: FightConfig = { ...base, ...saved, target: { ...base.target, ...saved.target } };
  // A fight written before styles existed was a Patchwerk fight, because that
  // was the only thing the engine could do.
  if (!merged.style) merged.style = { kind: 'patchwerk' };
  merged.v = FIGHT_VERSION;
  return merged;
}

function loadPrefs(): void {
  const saved = prefs();
  if (saved.fight) fight = migrateFight(saved.fight);
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
  cancelRun();
  result = null;
  trace = null;
  topGear = null;
  drops = null;
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
  apl = prefs().apl?.[character.specId] ?? null;
  adoptRole(specModule(character.specId)?.buffRole ?? 'caster');
  clearResults();
  return true;
}

/**
 * A warrior has no use for Arcane Intellect and a mage none for Battle Shout,
 * so loading the other kind of character replaces the ticked list rather than
 * leaving the wrong one on screen. Picks of the same kind are left alone.
 */
function adoptRole(role: BuffRole): void {
  if (prefs().role === role) return;
  const picks = defaultsFor(role);
  fight = { ...fight, buffs: picks.buffs, consumables: picks.consumables, debuffs: [] };
  savePrefs({ fight, role });
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
  const message = err instanceof Error ? err.message : String(err);
  if (message === 'cancelled') return;
  running = null;
  busy = null;
  toast(message);
  draw();
}

function startRun(label: string, total: number): AbortController {
  running?.abort();
  running = new AbortController();
  busy = { label, done: 0, total };
  draw();
  return running;
}

function finished(controller: AbortController): boolean {
  if (running !== controller) return false;
  running = null;
  busy = null;
  return true;
}

/** Throws out whatever is running, for when the answer would be about the old character. */
export function cancelRun(): void {
  running?.abort();
  running = null;
  busy = null;
}

function progressInto(label: string, controller: AbortController) {
  return (done: number, total: number) => {
    if (running !== controller) return;
    busy = { label, done, total };
    drawProgress();
  };
}

function runSim(): void {
  if (!character || busy) return;
  const controller = startRun('Simulating', fight.iterations);

  const began = Date.now();
  runSimulation(character, { ...fight }, rotation, {
    ...(apl ? { apl } : {}),
    signal: controller.signal,
    onProgress: progressInto('Simulating', controller),
  })
    .then((res) => {
      msPerIteration = (Date.now() - began) / Math.max(1, fight.iterations);
      if (!finished(controller)) return;
      result = res;
      trace = replayMiddle(res);
      rememberReport(res);
      draw();
    })
    .catch(fail);
}

/**
 * Runs the one fight that came out closest to the middle again, with a record
 * kept this time. The seed is the whole of the randomness, so this is not a
 * similar fight, it is that fight.
 */
function replayMiddle(res: SimResult): TraceEvent[] | null {
  if (!character) return null;
  const spec = specModule(character.specId);
  if (!spec) return null;
  try {
    const single = { ...fight, iterations: 1 };
    const config = {
      specId: character.specId,
      stats: deriveStatSheet(character, single),
      talents: character.talentRanks,
      fight: single,
      ...(rotation ? { rotation } : {}),
    };
    return traceIteration(config, spec, res.representative.seed);
  } catch {
    // A picture is worth having and never worth failing a run over.
    return null;
  }
}

/* ------------------------------------------------------------------ reports */

function savedReports(): SavedReport[] {
  return readJson<SavedReport[]>(KEY_REPORTS, []);
}

function reportFor(res: SimResult): Report | null {
  if (!character) return null;
  return {
    character: character.source,
    fight: { ...fight },
    ...(rotation ? { rotation } : {}),
    summary: summarise(res),
  };
}

/** Every run this device has seen lately, newest first. */
function rememberReport(res: SimResult): void {
  const report = reportFor(res);
  if (!report || !character) return;

  const spec = specById(character.specId);
  const entry: SavedReport = {
    id: 'r' + Date.now().toString(36),
    name: character.source.name + (spec ? ', ' + spec.name + ' ' + CLASSES[character.classId].name : ''),
    specId: character.specId,
    dps: res.dps,
    at: new Date().toISOString(),
    code: encodeReport(report),
  };
  writeJson(KEY_REPORTS, [entry, ...savedReports()].slice(0, MAX_REPORTS));
}

function copyReportLink(): void {
  if (!result) return;
  const report = reportFor(result);
  if (!report) return;
  const url = location.origin + location.pathname + '#r=' + encodeReport(report);
  void copyText(url, 'Link to this run copied');
}

/** Opens a run somebody shared, or one this device ran earlier. */
function openReport(code: string): boolean {
  const report = decodeReport(code);
  if (!report) return false;
  if (!adopt(parseCharacterValue(report.character, classTalentsFor(report.character.classId)), true)) {
    return false;
  }

  fight = migrateFight(report.fight);
  if (report.rotation) rotation = report.rotation;

  // The summary carries everything but the notes, which are rebuilt from the
  // spec and the fight so an old link picks up a caveat added since.
  const spec = specModule(character!.specId);
  result = {
    ...report.summary,
    notes: spec ? buildNotes(
      {
        specId: character!.specId,
        stats: deriveStatSheet(character!, fight),
        talents: character!.talentRanks,
        fight,
      },
      spec,
      targetStateFor(fight),
    ) : [],
  };
  trace = replayMiddle(result);
  return true;
}

function deriveWeightsNow(): void {
  if (!character || busy) return;
  // Weights only have to rank two items apart, which needs far less precision
  // than the damage figure, so they run on a fraction of the iterations.
  const iterations = Math.max(100, Math.min(400, Math.round(fight.iterations / 4)));
  const label = 'Measuring stat weights';
  const controller = startRun(label, iterations * 9);

  runWeights(character, { ...fight }, {
    iterations,
    rotation,
    ...(apl ? { apl } : {}),
    signal: controller.signal,
    onProgress: progressInto(label, controller),
  })
    .then((res) => {
      if (!finished(controller)) return;
      weights = res;
      confirmed.clear();
      draw();
    })
    .catch(fail);
}

function confirmSwap(slot: Slot, item: ItemRef): void {
  if (!character || busy) return;
  const iterations = Math.max(200, Math.round(fight.iterations / 2));
  const label = 'Checking ' + item.name;
  const controller = startRun(label, iterations * 2);

  runCompare(character, { ...fight }, [{ slot, item }], {
    iterations,
    rotation,
    ...(apl ? { apl } : {}),
    signal: controller.signal,
    onProgress: progressInto(label, controller),
  })
    .then((res) => {
      if (!finished(controller)) return;
      const swap = res.results[0];
      if (swap) confirmed.set(upgradeKey(slot, item), swap);
      draw();
    })
    .catch(fail);
}

/* ---------------------------------------------------------------- handlers */

const handlers: DpsHandlers = {
  onImport: (text) => importFromText(text),

  onLoadSample: (which) => importFromText(
    which === 'warrior' ? SAMPLE_WARRIOR_EXPORT
      : which === 'rogue' ? SAMPLE_ROGUE_EXPORT
        : SAMPLE_EXPORT,
  ),

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

/** The rotation as it stands: the one that was written, or the spec's own. */
function currentLines(): RotationLine[] {
  if (apl) return apl;
  if (!character) return [];
  const spec = specModule(character.specId);
  if (!spec) return [];
  const name = spec.rotations[rotation] ? rotation : Object.keys(spec.rotations)[0]!;
  return linesOf(spec.rotations[name]!(character.talentRanks));
}

const rotationHandlers: RotationHandlers = {
  onChange: (lines) => {
    if (!character) return;
    apl = lines;
    savePrefs({ apl: { ...prefs().apl, [character.specId]: lines } });
    cancelRun();
    result = null;
    trace = null;
    topGear = null;
    draw();
  },

  onReset: () => {
    if (!character) return;
    apl = null;
    const saved = { ...prefs().apl };
    delete saved[character.specId];
    savePrefs({ apl: saved });
    cancelRun();
    result = null;
    trace = null;
    topGear = null;
    draw();
  },
};

function runTopGearNow(perSlot: number): void {
  if (!character || busy || !weights) return;
  const table = weightTable(weights, overrides);
  const plan = planTopGear(character, table, perSlot);
  const label = 'Trying ' + plan.combinations.toLocaleString() + ' combinations';
  const controller = startRun(label, plan.combinations * 300);

  runTopGear(character, { ...fight }, table, {
    perSlot,
    rotation,
    ...(apl ? { apl } : {}),
    signal: controller.signal,
    onProgress: progressInto(label, controller),
  })
    .then((res) => {
      if (!finished(controller)) return;
      topGear = res;
      draw();
    })
    .catch(fail);
}

function runDropsNow(zones: string[]): void {
  if (!character || busy || !weights || !items) return;
  const table = weightTable(weights, overrides);
  const iterations = Math.max(200, Math.round(fight.iterations / 2));
  const plan = planDrops(character, items, table, zones);
  const label = 'Checking ' + plan.candidates.length + ' drops';
  const controller = startRun(label, plan.candidates.length * iterations);

  runDroptimizer(character, { ...fight }, items, table, {
    zones,
    iterations,
    rotation,
    ...(apl ? { apl } : {}),
    signal: controller.signal,
    onProgress: progressInto(label, controller),
  })
    .then((res) => {
      if (!finished(controller)) return;
      drops = res;
      draw();
    })
    .catch(fail);
}

const dropHandlers: DropHandlers = {
  onRun: runDropsNow,
  onToggleZone: (zone, on) => {
    dropZones = on ? [...dropZones, zone] : dropZones.filter((z) => z !== zone);
    draw();
  },
};

const topGearHandlers: TopGearHandlers = {
  onRun: runTopGearNow,
  onPerSlot: (n) => {
    topGearPerSlot = n;
    draw();
  },
};

const fightHandlers: FightHandlers = {
  onFightChange: (patch) => {
    fight = { ...fight, ...patch };
    savePrefs({ fight });
    // The old answer belonged to the old fight.
    cancelRun();
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
    cancelRun();
    result = null;
    weights = null;
    confirmed.clear();
    draw();
  },

  onRotation: (name) => {
    rotation = name;
    savePrefs({ rotation });
    cancelRun();
    result = null;
    weights = null;
    draw();
  },

  onCancel: () => {
    cancelRun();
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
    const recent = renderRecentRuns();
    if (recent) app.appendChild(recent);
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
  if (table && module) {
    const plan = planTopGear(character, table, topGearPerSlot);
    const guess = estimate(plan.combinations, 300, msPerIteration, 8);
    left.appendChild(
      renderTopGearPanel(
        plan.combinations,
        guess.seconds,
        topGearPerSlot,
        topGear,
        topGearHandlers,
        busy !== null,
      ),
    );
  }

  if (table && module) {
    const zones = items ? planDrops(character, items, table).zones : [];
    left.appendChild(
      renderDropPanel(items, zones, dropZones, drops, dropHandlers, busy !== null),
    );
  }

  left.appendChild(renderGearPanel(character, table ? gearExtras(rankings, scale) : {}, openSlot, selectSlot));
  main.appendChild(left);

  const right = document.createElement('div');
  right.className = 'dcol';

  if (module) {
    right.appendChild(renderFightPanel(fight, module, rotation, fightHandlers, busy));
    right.appendChild(
      renderRotationPanel(module, currentLines(), character.talentRanks, rotationHandlers, apl !== null),
    );
    if (result) {
      const names = new Map(module.spells.map((sp) => [sp.id, sp.name]));
      names.set('auto-main', 'Main hand');
      names.set('auto-off', 'Off hand');
      names.set('auto-ranged', 'Ranged');
      for (const [id, name] of Object.entries(module.extraNames ?? {})) names.set(id, name);

      right.appendChild(
        renderResultsPanel(result, {
          ...(trace ? { trace } : {}),
          names,
          resourceLabel: module.resource === 'rage'
            ? 'Rage, all the way through'
            : module.resource === 'energy' ? 'Energy, all the way through' : 'Mana, all the way through',
          onCopyReport: copyReportLink,
        }),
      );
    }
    if (weights) right.appendChild(renderWeightsPanel(weights, overrides, fightHandlers));
  } else {
    right.appendChild(renderUnsupported(spec ? spec.name + ' ' + info!.name : info!.name));
  }

  right.appendChild(renderSheetPanel(character));
  right.appendChild(renderSaveBar(handlers, savedCharacters(), character.source.name));
  right.appendChild(renderImportPanel(handlers, true));
  const recent = renderRecentRuns();
  if (recent) right.appendChild(recent);
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

/** The runs this device has done lately, so one can be opened again. */
function renderRecentRuns(): HTMLElement | null {
  const reports = savedReports();
  if (!reports.length) return null;

  const panel = document.createElement('section');
  panel.className = 'panel';
  const head = document.createElement('div');
  head.className = 'panel__head';
  head.textContent = 'Runs on this device';
  panel.appendChild(head);

  const body = document.createElement('div');
  body.className = 'panel__body';

  const list = document.createElement('div');
  list.className = 'druns';
  for (const entry of reports) {
    const row = document.createElement('button');
    row.className = 'drun';
    row.type = 'button';

    const name = document.createElement('span');
    name.className = 'drun__name';
    name.textContent = entry.name;
    row.appendChild(name);

    const dps = document.createElement('span');
    dps.className = 'drun__dps';
    dps.textContent = entry.dps.toFixed(1);
    row.appendChild(dps);

    const when = document.createElement('span');
    when.className = 'drun__when';
    when.textContent = new Date(entry.at).toLocaleString();
    row.appendChild(when);

    row.addEventListener('click', () => {
      if (!openReport(entry.code)) {
        toast('That run would not open');
        return;
      }
      draw();
      toast('Opened ' + entry.name);
    });
    list.appendChild(row);
  }

  body.appendChild(list);
  body.appendChild(
    (() => {
      const hint = document.createElement('p');
      hint.className = 'drawer__hint';
      hint.textContent =
        'The last ' + MAX_REPORTS + ' runs, kept in this browser. Copy a link to one and it ' +
        'opens anywhere.';
      return hint;
    })(),
  );
  panel.appendChild(body);
  return panel;
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

  if (hash.startsWith('r=')) {
    if (!openReport(hash.slice(2))) {
      draw();
      toast('That link to a run would not open');
      return;
    }
    draw();
    return;
  }

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
// The item list is optional and almost always absent, so it is looked for after
// the page is already up and nothing waits on it.
void loadItemDatabase()
  .then((db) => {
    if (!db) return;
    items = db;
    draw();
  })
  .catch(() => {
    /* An item list nobody shipped is the ordinary case, not a failure. */
  });

void loadTalentData()
  .then((data) => {
    talentData = data;
    backfillBuild();
    draw();
  })
  .catch(() => {
    toast('Talent data would not load, so build links are off');
  });
