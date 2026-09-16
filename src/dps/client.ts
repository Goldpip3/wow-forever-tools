/**
 * Talking to the simulator.
 *
 * Everything the page asks for comes down to the same thing: a list of fights,
 * each of which is a pile of independent iterations. This file works out which
 * fights are needed, hands them to the pool, and puts the answers back together.
 * The thinking stays here rather than in the worker, because it is cheap and a
 * second copy of it in another thread is how two copies drift apart.
 *
 * When workers are not available, which is every test run, the pool runs the
 * same slices in a line instead. The answer is identical; it just blocks.
 */

import {
  assembleCompare, planCompare, type CompareResult, type GearSwap,
} from './compare';
import { runJobs, type Job } from './pool';
import { finishShard } from './sim/accumulate';
import type { RotationLine } from './sim/rotation';
import { specModule } from './sim/specs';
import type { FightConfig, SimConfig, SimResult } from './sim/types';
import { deriveStatSheet, effectsOn } from './stats';
import { assembleWeights, planWeights, type WeightResult } from './weights';
import type { Character } from './types';
import type { ItemRef, Slot, StatKey } from './export-format';
import {
  enumerate, planTopGear, setsIn, swapsIn, valid, type Loadout,
} from './topgear';
import type { WeightTable } from './weights';

export type Progress = (done: number, total: number) => void;

export interface RunOptions {
  onProgress?: Progress;
  /** Aborting stops new work being handed out; the run rejects with 'cancelled'. */
  signal?: AbortSignal;
  /** A rotation somebody wrote themselves, which replaces the spec's own. */
  apl?: RotationLine[];
}

function configFor(
  character: Character,
  fight: FightConfig,
  rotation?: string,
  apl?: RotationLine[],
): SimConfig {
  return {
    specId: character.specId,
    stats: deriveStatSheet(character, fight),
    talents: character.talentRanks,
    fight,
    ...(rotation ? { rotation } : {}),
    ...(apl?.length ? { apl } : {}),
    ...effectsOn(character),
  };
}

function specFor(character: Character) {
  const spec = specModule(character.specId);
  if (!spec) throw new Error('No simulation has been written for this spec yet.');
  return spec;
}

/* ------------------------------------------------------------------- the api */

export async function runSimulation(
  character: Character,
  fight: FightConfig,
  rotation?: string,
  opts: RunOptions = {},
): Promise<SimResult> {
  const spec = specFor(character);
  const config = configFor(character, fight, rotation, opts.apl);
  const iterations = Math.max(1, Math.round(fight.iterations));

  const [result] = await runJobs([{ jobId: 0, config, iterations }], opts);
  return finishShard(result!.shard, config, spec);
}

export interface WeightsOptions extends RunOptions {
  iterations?: number;
  reference?: StatKey;
  rotation?: string;
}

export async function runWeights(
  character: Character,
  fight: FightConfig,
  opts: WeightsOptions = {},
): Promise<WeightResult> {
  const spec = specFor(character);
  const plan = planWeights(configFor(character, fight, opts.rotation, opts.apl), spec, {
    ...(opts.iterations !== undefined ? { iterations: opts.iterations } : {}),
    ...(opts.reference ? { reference: opts.reference } : {}),
  });

  // The baseline is job zero and every stat that is not capped is a job after
  // it, all sharing the same seeds so the differences are paired.
  const jobs: Job[] = [{ jobId: 0, config: plan.base, iterations: plan.iterations }];
  const jobFor = new Map<number, number>();
  plan.entries.forEach((entry, i) => {
    if (!entry.config) return;
    jobFor.set(i, jobs.length);
    jobs.push({ jobId: jobs.length, config: entry.config, iterations: plan.iterations });
  });

  const results = await runJobs(jobs, opts);
  const baseSeries = results[0]!.shard.series;
  const moved = plan.entries.map((_, i) => {
    const at = jobFor.get(i);
    return at === undefined ? null : results[at]!.shard.series;
  });

  return assembleWeights(plan, spec, baseSeries, moved, {
    ...(opts.reference ? { reference: opts.reference } : {}),
  });
}

export interface CompareOptions extends RunOptions {
  iterations?: number;
  rotation?: string;
}

export async function runCompare(
  character: Character,
  fight: FightConfig,
  swaps: GearSwap[],
  opts: CompareOptions = {},
): Promise<CompareResult> {
  specFor(character);
  const plan = planCompare(character, fight, swaps, opts.iterations, opts.rotation, opts.apl);

  const jobs: Job[] = [{ jobId: 0, config: plan.base, iterations: plan.iterations }];
  plan.swaps.forEach((entry, i) => {
    jobs.push({ jobId: i + 1, config: entry.config, iterations: plan.iterations });
  });

  const results = await runJobs(jobs, opts);
  return assembleCompare(
    plan,
    results[0]!.shard.series,
    plan.swaps.map((_, i) => results[i + 1]!.shard.series),
  );
}

/** Whether this character's spec has a simulation behind it at all. */
export function canSimulate(character: Character): boolean {
  return !!specModule(character.specId);
}

/* ----------------------------------------------------------------- top gear */

export interface TopGearOptions extends RunOptions {
  /** How many candidates per slot the linear score shortlists. */
  perSlot?: number;
  /** Iterations for the first pass, which only has to rank. */
  iterations?: number;
  /** Iterations for the handful that come out on top. */
  finalIterations?: number;
  rotation?: string;
}

export interface TopGearEntry {
  loadout: Loadout;
  dps: number;
  stderr: number;
  /** Against what is worn now. */
  delta: number;
  swaps: Array<{ slot: Slot; item: ItemRef | null }>;
  sets: Array<{ name: string; worn: number }>;
  /** Whether this one was run again properly rather than only ranked. */
  confirmed: boolean;
}

export interface TopGearResult {
  baseDps: number;
  entries: TopGearEntry[];
  /** How many loadouts were run, after the impossible ones were taken out. */
  combinations: number;
}

/** No more than this many loadouts in one go, however many were asked for. */
export const TOP_GEAR_CAP = 2000;

/** How many of the best are run again at the full iteration count. */
const FINALISTS = 5;

/**
 * Every combination worth trying, simulated.
 *
 * Two passes. The first ranks every loadout at a low iteration count, which is
 * enough to tell a good one from a bad one and nowhere near enough to tell two
 * good ones apart. The second runs the handful at the top properly, which is
 * what decides between them.
 */
export async function runTopGear(
  character: Character,
  fight: FightConfig,
  weights: WeightTable,
  opts: TopGearOptions = {},
): Promise<TopGearResult> {
  specFor(character);
  const plan = planTopGear(character, weights, opts.perSlot ?? 3);


  const loadouts = [...enumerate(plan.choices)]
    .filter((loadout) => valid(character, loadout))
    .slice(0, TOP_GEAR_CAP);

  const first = Math.max(50, Math.round(opts.iterations ?? 300));
  const final = Math.max(first, Math.round(opts.finalIterations ?? fight.iterations));

  // Every loadout is a fight of its own, built the way a swap is.
  const runFight: FightConfig = { ...fight, iterations: first };
  const base: SimConfig = {
    specId: character.specId,
    stats: deriveStatSheet(character, runFight),
    talents: character.talentRanks,
    fight: runFight,
    ...(opts.rotation ? { rotation: opts.rotation } : {}),
    ...(opts.apl?.length ? { apl: opts.apl } : {}),
    ...effectsOn(character),
  };

  const configFrom = (loadout: Loadout, iterations: number): SimConfig => {
    const f: FightConfig = { ...fight, iterations };
    return {
      ...base,
      fight: f,
      stats: deriveStatSheet(character, f, { gearOverride: loadout }),
      ...effectsOn(character, loadout),
    };
  };

  const jobs: Job[] = [
    { jobId: 0, config: base, iterations: first },
    ...loadouts.map((loadout, i) => ({
      jobId: i + 1,
      config: configFrom(loadout, first),
      iterations: first,
    })),
  ];

  // Both passes share one progress bar, so it does not appear to finish twice.
  const firstTotal = jobs.reduce((sum, job) => sum + job.iterations, 0);
  const secondTotal = FINALISTS * final;
  const whole = firstTotal + secondTotal;
  const report = (done: number) => opts.onProgress?.(done, whole);

  const ranked = await runJobs(jobs, {
    ...(opts.signal ? { signal: opts.signal } : {}),
    onProgress: (done) => report(done),
  });

  const baseSeries = ranked[0]!.shard.series;
  const baseDps = average(baseSeries);

  const scored = loadouts.map((loadout, i) => {
    const series = ranked[i + 1]!.shard.series;
    return {
      loadout,
      series,
      dps: average(series),
    };
  }).sort((a, b) => b.dps - a.dps);

  const finalists = scored.slice(0, FINALISTS);
  const finalJobs: Job[] = [
    { jobId: 0, config: { ...base, fight: { ...fight, iterations: final } }, iterations: final },
    ...finalists.map((entry, i) => ({
      jobId: i + 1,
      config: configFrom(entry.loadout, final),
      iterations: final,
    })),
  ];

  const settled = await runJobs(finalJobs, {
    ...(opts.signal ? { signal: opts.signal } : {}),
    onProgress: (done) => report(firstTotal + done),
  });

  const settledBase = settled[0]!.shard.series;
  const settledBaseDps = average(settledBase);

  const entries: TopGearEntry[] = scored.map((entry) => {
    const at = finalists.indexOf(entry);
    const series = at >= 0 ? settled[at + 1]!.shard.series : entry.series;
    const against = at >= 0 ? settledBase : baseSeries;
    const dps = average(series);
    return {
      loadout: entry.loadout,
      dps,
      stderr: pairedSpread(against, series),
      delta: dps - (at >= 0 ? settledBaseDps : baseDps),
      swaps: swapsIn(character, entry.loadout),
      sets: setsIn(character, entry.loadout),
      confirmed: at >= 0,
    };
  }).sort((a, b) => b.delta - a.delta);

  // What was actually run, which the cap may have trimmed further.
  return { baseDps: settledBaseDps, entries, combinations: loadouts.length };
}

function average(values: number[]): number {
  return values.length ? values.reduce((sum, n) => sum + n, 0) / values.length : 0;
}

/** The spread of the paired differences, which is what sharing the seeds shrinks. */
function pairedSpread(base: number[], moved: number[]): number {
  const n = Math.min(base.length, moved.length);
  if (n < 2) return 0;
  const diffs = new Array<number>(n);
  for (let i = 0; i < n; i += 1) diffs[i] = moved[i]! - base[i]!;
  const m = average(diffs);
  const variance = diffs.reduce((sum, d) => sum + (d - m) ** 2, 0) / (n - 1);
  return Math.sqrt(variance / n);
}
