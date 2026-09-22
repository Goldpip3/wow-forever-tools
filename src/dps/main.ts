import { renderFooter, renderHeader } from '../shared/header';
import { accountView, loadUser, SIGN_IN_MESSAGE, takeSignInOutcome } from '../shared/session';
import { copyText, toast } from '../shared/toast';
import {
  KEY_CHARACTERS,
  KEY_REPORTS,
  hasStrings,
  patchPrefs,
  readList,
  readPrefs,
  writeJson,
} from '../shared/storage';
import { clearDraft, openCharacterLink, readDraft, writeDraft } from './draft';
import { applyHandoff, decodeHandoff, planHandoff, type PlannerHandoff } from './handoff';
import { renderHandoffPanel, type HandoffHandlers } from './render-handoff';
import { defaultFight, migrateFight } from './fight';
import { readDpsPrefs, type DpsPrefs } from './validate';
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
  SIM_REVISION, sameEngine, summarise, type Report, type SavedCharacter, type SavedReport,
} from './codec';
import { sampleByKey } from './samples';
import {
  defaultsFor, type BuffKind, type BuffRole,
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
import {
  configFor, runCompare, runDroptimizer, runSimulation, runTopGear, runWeights,
  type DropResult, type TopGearResult,
} from './client';
import { estimate, planTopGear, type TopGearPlan } from './topgear';
import { poolTiming } from './pool';
import { renderTopGearPanel, type TopGearHandlers } from './render-topgear';
import { renderRotationPanel, type RotationHandlers } from './render-rotation';
import { renderDropPanel, type DropHandlers } from './render-droptimizer';
import { loadItemDatabase, type ItemDatabase } from './itemdb';
import { planDrops } from './droptimizer';
import { linesOf, type RotationLine } from './sim/rotation';
import {
  el,
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
/**
 * Whether the character on screen belongs on this device: imported, loaded from a save, or
 * recovered from the draft. Only then is it kept as the draft. A character opened from
 * somebody's link or report is shown, and never written over the owner's draft.
 */
let characterOwned = false;
/** A player sent over from the raid planner, shown until dismissed. Nothing is applied on arrival. */
let handoff: PlannerHandoff | null = null;
let handoffApplied = false;
/** Which simulator made the result on screen: this build's, a report's, or null if not recorded. */
let resultEngine: string | null = null;
/** Set once the page has said this browser would not keep the draft, so it says it once. */
let draftRefused = false;
/** The same, for preferences. */
let prefsRefused = false;
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
/**
 * What the result on screen was run with. Kept apart from the live settings, which can
 * change after the run, so the replay and a shared report describe that run and no other.
 */
let resultInputs: RunInputs | null = null;
/**
 * Which set of inputs the results on screen belong to: character, fight, buffs, rotation.
 * Every change to them goes through clearResults, which moves this on. A run remembers the
 * number it started under and its answer is dropped if the number has moved, even if the
 * run itself was not cancelled in time.
 */
let inputsVersion = 0;
const startedUnder = new WeakMap<AbortController, number>();
let topGear: TopGearResult | null = null;
let topGearPerSlot = 3;
/**
 * The top-gear plan for the inputs it was made from. Drawing asks for it on every redraw,
 * so it is made once per character, weight table and shortlist size rather than each time.
 */
let topGearPlanCache: { character: Character; perSlot: number; table: string; plan: TopGearPlan } | null = null;
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

/* ------------------------------------------------------------------- prefs */

/** This page's saved preferences, each part checked, and a wrong-shaped part left out. */
function prefs(): DpsPrefs {
  return readDpsPrefs(readPrefs().dps);
}

function savePrefs(patch: DpsPrefs): void {
  if (patchPrefs({ dps: { ...prefs(), ...patch } as Record<string, unknown> })) return;
  if (prefsRefused) return;
  prefsRefused = true;
  window.setTimeout(
    () => toast('This browser would not save your settings, so they will reset when the page reloads.', 5000),
    0,
  );
}

function loadPrefs(): void {
  const saved = prefs();
  if (saved.fight) fight = migrateFight(saved.fight);
  if (saved.rotation) rotation = saved.rotation;
}

function savedCharacters(): SavedCharacter[] {
  return readList(KEY_CHARACTERS, (v): v is SavedCharacter => hasStrings(v, ['id', 'name', 'code']));
}

/* ------------------------------------------------------------------ import */

function classTalentsFor(id: string) {
  return talentData?.talents[dataKeyFor(id)];
}

function syncHash(): void {
  suppressHash = true;
  // The link drops bags and bank. A character that belongs here is kept whole as the draft,
  // so a reload of its link gets them back. See draft.ts for which one opens when.
  if (!character) clearDraft();
  else if (characterOwned && !writeDraft(character.source) && !draftRefused) {
    draftRefused = true;
    // After whatever the import says about itself, so this is the notice left on screen.
    window.setTimeout(() => toast(
      'This browser would not keep a copy of your bags and bank, so a reload will lose them.',
      6000,
    ), 0);
  }
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

interface RunInputs {
  fight: FightConfig;
  rotation: string;
  apl: RotationLine[] | null;
}

/**
 * Everything worked out for the character: the run, its replay, the weights, the swaps
 * checked, the best loadouts and the drops. They all rest on the fight, the rotation and
 * the character, so a change to any of those clears all of them together. Clearing some
 * left the rest to reappear once new weights arrived, still describing the old fight.
 */
function clearResults(): void {
  inputsVersion += 1;
  cancelRun();
  result = null;
  resultInputs = null;
  resultEngine = null;
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
  characterOwned = true;
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
  startedUnder.set(running, inputsVersion);
  busy = { label, done: 0, total };
  draw();
  return running;
}

/** Whether a run's answer may be shown: it is still the run, and the inputs have not moved. */
function finished(controller: AbortController): boolean {
  if (running !== controller) return false;
  running = null;
  busy = null;
  return startedUnder.get(controller) === inputsVersion;
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
  const inputs: RunInputs = { fight: { ...fight }, rotation, apl };
  runSimulation(character, inputs.fight, inputs.rotation, {
    ...(inputs.apl ? { apl: inputs.apl } : {}),
    signal: controller.signal,
    onProgress: progressInto('Simulating', controller),
  })
    .then((res) => {
      msPerIteration = (Date.now() - began) / Math.max(1, fight.iterations);
      if (!finished(controller)) return;
      result = res;
      resultInputs = inputs;
      resultEngine = SIM_REVISION;
      trace = replayMiddle(res, inputs);
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
function replayMiddle(res: SimResult, inputs: RunInputs): TraceEvent[] | null {
  if (!character) return null;
  const spec = specModule(character.specId);
  if (!spec) return null;
  try {
    // The same config the run was given, trinkets and written rotation included, or the
    // replayed fight is a different fight wearing the same seed.
    const config = configFor(
      character,
      { ...inputs.fight, iterations: 1 },
      inputs.rotation,
      inputs.apl ?? undefined,
    );
    return traceIteration(config, spec, res.representative.seed);
  } catch {
    // A picture is worth having and never worth failing a run over.
    return null;
  }
}

/* ------------------------------------------------------------------ reports */

function savedReports(): SavedReport[] {
  return readList(KEY_REPORTS, (v): v is SavedReport =>
    hasStrings(v, ['id', 'name', 'code']) && typeof v.dps === 'number');
}

function reportFor(res: SimResult): Report | null {
  if (!character || !resultInputs) return null;
  const { fight: ran, rotation: ranRotation, apl: ranApl } = resultInputs;
  return {
    character: character.source,
    fight: { ...ran },
    ...(ranRotation ? { rotation: ranRotation } : {}),
    ...(ranApl?.length ? { apl: ranApl } : {}),
    engine: SIM_REVISION,
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
  // A report opens what it holds. It is not this device's character.
  characterOwned = false;

  fight = migrateFight(report.fight);
  if (report.rotation) rotation = report.rotation;
  const current = sameEngine(report);
  const recorded = !!report.engine;
  // The report's own inputs, never this device's. A report that recorded a written rotation
  // brings it. One from before that was recorded is shown with the spec's own, and says so
  // below. The device's saved rotation is left as it was either way.
  apl = recorded && report.apl?.length ? report.apl : null;
  resultInputs = { fight: { ...fight }, rotation, apl };

  // The summary carries everything but the notes, which are rebuilt from the
  // spec and the fight so an old link picks up a caveat added since.
  const spec = specModule(character!.specId);
  const notes = spec
    ? buildNotes(configFor(character!, fight, rotation, apl ?? undefined), spec, targetStateFor(fight))
    : [];
  if (!recorded) {
    notes.unshift(
      'This link is from before the page recorded which simulator made a run and whether it used ' +
        'a written rotation. The figures are what it gave then. The fight timeline is left out, and ' +
        'the rotation shown is the spec’s own, which may not be what it ran. Simulate again for a ' +
        'current figure.',
    );
  } else if (!current) {
    notes.unshift(
      'This run was made by an earlier version of the simulator. The figures are what it gave ' +
        'then. The fight timeline is left out because this version would not replay the same ' +
        'fight. Simulate again for a current figure.',
    );
  }
  result = { ...report.summary, notes };
  resultEngine = report.engine ?? null;
  trace = current ? replayMiddle(result, resultInputs) : null;
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

  onLoadSample: (key) => {
    const sample = sampleByKey(key);
    if (sample) importFromText(sample.text);
  },

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
    characterOwned = true;
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
    clearResults();
    draw();
  },

  onReset: () => {
    if (!character) return;
    apl = null;
    const saved = { ...prefs().apl };
    delete saved[character.specId];
    savePrefs({ apl: saved });
    clearResults();
    draw();
  },
};

/** The plan for these inputs, made once and kept until one of them changes. */
function topGearPlanFor(table: WeightTable, perSlot: number): TopGearPlan {
  const key = JSON.stringify(table);
  const cached = topGearPlanCache;
  if (cached && cached.character === character && cached.perSlot === perSlot && cached.table === key) {
    return cached.plan;
  }
  const plan = planTopGear(character!, table, perSlot);
  topGearPlanCache = { character: character!, perSlot, table: key, plan };
  return plan;
}

/** How fast this machine runs, per worker, and how many workers there are. */
function speed(): { msPerIteration: number; workers: number } {
  const pool = poolTiming();
  // The pool's own rate is per worker once it has measured one. Before that, the last
  // whole run's wall-clock rate already includes however many workers ran it.
  return pool.measured
    ? { msPerIteration: pool.msPerIteration, workers: pool.workers }
    : { msPerIteration, workers: 1 };
}

function runTopGearNow(perSlot: number): void {
  if (!character || busy || !weights) return;
  const table = weightTable(weights, overrides);
  const plan = topGearPlanFor(table, perSlot);
  const label = (plan.capped ? 'Trying the best ' : 'Trying ') + plan.combinations.toLocaleString() + ' combinations';
  // Replaced by the real total as soon as the run reports; this is only the opening bar.
  const controller = startRun(label, (1 + plan.combinations) * 300 + (1 + Math.min(5, plan.combinations)) * fight.iterations);

  runTopGear(character, { ...fight }, table, {
    plan,
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
    // The old answers belonged to the old fight.
    clearResults();
    draw();
  },

  onToggleBuff: (id, on, kind: BuffKind) => {
    const key = kind === 'raid' ? 'buffs' : kind === 'consumable' ? 'consumables' : 'debuffs';
    const current = fight[key];
    fight = { ...fight, [key]: on ? [...current, id] : current.filter((b) => b !== id) };
    savePrefs({ fight });
    clearResults();
    draw();
  },

  onRotation: (name) => {
    rotation = name;
    savePrefs({ rotation });
    clearResults();
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
    // Recommendations were ranked with the old weights, so they go with them. The damage
    // figure and the weights measured by the simulator do not depend on an override.
    confirmed.clear();
    topGear = null;
    drops = null;
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

  if (handoff) app.appendChild(renderHandoffPanel(handoffView(), handoffHandlers));

  if (!character) {
    // A sample first: seeing the tool work comes before installing anything for it.
    app.appendChild(renderImportPanel(handlers, false));
    app.appendChild(renderHowTo());
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
    const plan = topGearPlanFor(table, topGearPerSlot);
    const guess = estimate({ combinations: plan.combinations, first: 300, final: fight.iterations, ...speed() });
    left.appendChild(
      renderTopGearPanel(
        plan.combinations,
        plan.capped,
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
      right.appendChild(
        el(
          'p',
          'drawer__hint',
          resultEngine
            ? 'Simulator version ' + resultEngine + (resultEngine === SIM_REVISION ? ', this page\u2019s own' : '') +
              '. Spell and combat numbers are Classic values, unverified for Forever.'
            : 'The simulator version that made this run was not recorded.',
        ),
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

function handoffView() {
  const role = character ? specModule(character.specId)?.buffRole ?? 'caster' : null;
  return {
    handoff: handoff!,
    plan: character && role ? planHandoff(handoff!, role) : null,
    loadedSpecId: character?.specId ?? null,
    loadedClassId: character?.classId ?? null,
    role,
    applied: handoffApplied,
    hasDraft: !character && !!readDraft(),
  };
}

const handoffHandlers: HandoffHandlers = {
  onApply: () => {
    if (!character || !handoff) return;
    const plan = planHandoff(handoff, specModule(character.specId)?.buffRole ?? 'caster');
    fight = applyHandoff(fight, plan);
    savePrefs({ fight });
    clearResults();
    handoffApplied = true;
    draw();
  },
  onDismiss: () => {
    handoff = null;
    draw();
  },
  onUseDraft: () => {
    const code = readDraft();
    const source = code ? decodeCharacter(code) : null;
    if (!source || !adopt(parseCharacterValue(source, classTalentsFor(source.classId)))) {
      toast('That character would not load');
      return;
    }
    characterOwned = true;
    update();
  },
};

function readHash(): void {
  const hash = location.hash.replace(/^#/, '');

  // A player from the raid planner. Shown, not applied, and taken out of the address so a
  // reload does not bring it back after it was dismissed.
  if (hash.startsWith('h=')) {
    const arrived = decodeHandoff(hash);
    history.replaceState(null, '', location.pathname + location.search);
    if (arrived) {
      handoff = arrived;
      handoffApplied = false;
    } else {
      toast('That link from the raid planner would not open');
    }
    draw();
    return;
  }

  if (hash.startsWith('r=')) {
    if (!openReport(hash.slice(2))) {
      draw();
      toast('That report is incomplete or invalid. Ask for a fresh link, or import your character and run it again.');
      return;
    }
    draw();
    return;
  }

  if (!hash.startsWith('c=')) {
    draw();
    return;
  }
  const opened = openCharacterLink(hash.slice(2));
  if (!opened) {
    draw();
    toast('That link would not open');
    return;
  }
  if (adopt(parseCharacterValue(opened.source, classTalentsFor(opened.source.classId)), true)) {
    characterOwned = opened.recovered;
  }
  draw();
}

window.addEventListener('hashchange', () => {
  if (suppressHash) return;
  readHash();
});

/* Back from signing in: read the outcome and put back the fragment before anything reads it. */
const signIn = takeSignInOutcome();
if (signIn) window.setTimeout(() => toast(SIGN_IN_MESSAGE[signIn]), 0);

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
