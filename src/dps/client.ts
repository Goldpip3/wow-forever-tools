/**
 * Talking to the simulator.
 *
 * Every call returns a promise and reports progress on the way. When workers
 * are not available, which is every test run, the same functions run inline
 * instead: the answer is identical, it just blocks while it works.
 */

import { compareGear, type CompareResult, type GearSwap } from './compare';
import { simulate } from './sim/sim';
import { specModule } from './sim/specs';
import type { FightConfig, SimConfig, SimResult } from './sim/types';
import { deriveStatSheet } from './stats';
import { deriveWeights, type WeightResult } from './weights';
import type { Character } from './types';
import type { StatKey } from './export-format';
import type { WorkerRequest, WorkerResponse } from './worker';

export type Progress = (done: number, total: number) => void;

/** Omit over a union has to be distributed by hand or the members collapse. */
type WithoutId<T> = T extends { id: number } ? Omit<T, 'id'> : never;
type AnyRequest = WithoutId<WorkerRequest>;

interface Pending {
  resolve: (value: never) => void;
  reject: (reason: Error) => void;
  onProgress?: Progress;
}

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, Pending>();

function workersAvailable(): boolean {
  return typeof Worker !== 'undefined';
}

function ensureWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });

  worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
    const message = event.data;
    const entry = pending.get(message.id);
    if (!entry) return;

    if (message.kind === 'progress') {
      entry.onProgress?.(message.done, message.total);
      return;
    }

    pending.delete(message.id);
    if (message.kind === 'error') entry.reject(new Error(message.message));
    else entry.resolve(message.result as never);
  });

  worker.addEventListener('error', (event) => {
    const failure = new Error(event.message || 'The simulator stopped unexpectedly.');
    for (const entry of pending.values()) entry.reject(failure);
    pending.clear();
    worker?.terminate();
    worker = null;
  });

  return worker;
}

function send<T>(request: AnyRequest, onProgress?: Progress): Promise<T> {
  const id = nextId;
  nextId += 1;

  return new Promise<T>((resolve, reject) => {
    const entry: Pending = { resolve: resolve as (value: never) => void, reject };
    if (onProgress) entry.onProgress = onProgress;
    pending.set(id, entry);
    ensureWorker().postMessage({ ...request, id } as WorkerRequest);
  });
}

/** Throws out any run in flight, for when the character changed underneath it. */
export function cancelAll(): void {
  if (!worker) return;
  const cancelled = new Error('cancelled');
  for (const entry of pending.values()) entry.reject(cancelled);
  pending.clear();
  worker.terminate();
  worker = null;
}

/* -------------------------------------------------------------- inline path */

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

export function runSimulation(
  character: Character,
  fight: FightConfig,
  rotation?: string,
  onProgress?: Progress,
): Promise<SimResult> {
  if (!workersAvailable()) {
    const spec = specFor(character);
    const opts = onProgress ? { onProgress: (p: { done: number; total: number }) => onProgress(p.done, p.total) } : {};
    return Promise.resolve(simulate(configFor(character, fight, rotation), spec, opts));
  }
  return send<SimResult>(
    { kind: 'simulate', character, fight, ...(rotation ? { rotation } : {}) },
    onProgress,
  );
}

export interface WeightsOptions {
  iterations?: number;
  reference?: StatKey;
  rotation?: string;
}

export function runWeights(
  character: Character,
  fight: FightConfig,
  opts: WeightsOptions = {},
  onProgress?: Progress,
): Promise<WeightResult> {
  if (!workersAvailable()) {
    const spec = specFor(character);
    const inline: Parameters<typeof deriveWeights>[2] = {};
    if (opts.iterations !== undefined) inline.iterations = opts.iterations;
    if (opts.reference) inline.reference = opts.reference;
    if (onProgress) inline.onProgress = onProgress;
    return Promise.resolve(deriveWeights(configFor(character, fight, opts.rotation), spec, inline));
  }

  return send<WeightResult>(
    {
      kind: 'weights',
      character,
      fight,
      ...(opts.iterations !== undefined ? { iterations: opts.iterations } : {}),
      ...(opts.reference ? { reference: opts.reference } : {}),
      ...(opts.rotation ? { rotation: opts.rotation } : {}),
    },
    onProgress,
  );
}

export function runCompare(
  character: Character,
  fight: FightConfig,
  swaps: GearSwap[],
  iterations?: number,
  rotation?: string,
  onProgress?: Progress,
): Promise<CompareResult> {
  if (!workersAvailable()) {
    const spec = specFor(character);
    const inline: Parameters<typeof compareGear>[4] = {};
    if (iterations !== undefined) inline.iterations = iterations;
    if (onProgress) inline.onProgress = onProgress;
    return Promise.resolve(compareGear(character, fight, spec, swaps, inline, rotation));
  }

  return send<CompareResult>(
    {
      kind: 'compare',
      character,
      fight,
      swaps,
      ...(iterations !== undefined ? { iterations } : {}),
      ...(rotation ? { rotation } : {}),
    },
    onProgress,
  );
}

/** Whether this character's spec has a simulation behind it at all. */
export function canSimulate(character: Character): boolean {
  return !!specModule(character.specId);
}
