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
import { specModule } from './sim/specs';
import type { FightConfig, SimConfig, SimResult } from './sim/types';
import { deriveStatSheet } from './stats';
import { assembleWeights, planWeights, type WeightResult } from './weights';
import type { Character } from './types';
import type { StatKey } from './export-format';

export type Progress = (done: number, total: number) => void;

export interface RunOptions {
  onProgress?: Progress;
  /** Aborting stops new work being handed out; the run rejects with 'cancelled'. */
  signal?: AbortSignal;
}

function configFor(character: Character, fight: FightConfig, rotation?: string): SimConfig {
  return {
    specId: character.specId,
    stats: deriveStatSheet(character, fight),
    talents: character.talentRanks,
    fight,
    ...(rotation ? { rotation } : {}),
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
  const config = configFor(character, fight, rotation);
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
  const plan = planWeights(configFor(character, fight, opts.rotation), spec, {
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
  const plan = planCompare(character, fight, swaps, opts.iterations, opts.rotation);

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
