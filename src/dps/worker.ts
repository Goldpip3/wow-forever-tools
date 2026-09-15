/**
 * The simulator, off the main thread.
 *
 * A thousand iterations is quick but not instant, and doing it inline would
 * freeze the page mid-click. Everything here is the same pure code the tests
 * call directly; the worker only moves it somewhere the interface cannot feel
 * it, and reports progress on the way.
 */

import { compareGear, type CompareResult, type GearSwap } from './compare';
import { simulate } from './sim/sim';
import { specModule } from './sim/specs';
import type { SimConfig, SimResult } from './sim/types';
import type { FightConfig } from './sim/types';
import { deriveStatSheet } from './stats';
import { deriveWeights, type WeightResult } from './weights';
import type { Character } from './types';

// The DOM library is on for the rest of the site, so `self` needs telling that
// here it is a worker rather than a window.
const ctx = self as unknown as Worker;

export interface SimulateRequest {
  kind: 'simulate';
  id: number;
  character: Character;
  fight: FightConfig;
  rotation?: string;
}

export interface WeightsRequest {
  kind: 'weights';
  id: number;
  character: Character;
  fight: FightConfig;
  rotation?: string;
  iterations?: number;
  reference?: string;
}

export interface CompareRequest {
  kind: 'compare';
  id: number;
  character: Character;
  fight: FightConfig;
  swaps: GearSwap[];
  rotation?: string;
  iterations?: number;
}

export type WorkerRequest = SimulateRequest | WeightsRequest | CompareRequest;

export type WorkerResponse =
  | { kind: 'progress'; id: number; done: number; total: number }
  | { kind: 'simulate'; id: number; result: SimResult }
  | { kind: 'weights'; id: number; result: WeightResult }
  | { kind: 'compare'; id: number; result: CompareResult }
  | { kind: 'error'; id: number; message: string };

function post(message: WorkerResponse): void {
  ctx.postMessage(message);
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

ctx.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  const { id } = request;

  try {
    const spec = specModule(request.character.specId);
    if (!spec) {
      post({
        kind: 'error',
        id,
        message: 'No simulation has been written for this spec yet.',
      });
      return;
    }

    if (request.kind === 'simulate') {
      const result = simulate(configFor(request.character, request.fight, request.rotation), spec, {
        onProgress: ({ done, total }) => post({ kind: 'progress', id, done, total }),
      });
      post({ kind: 'simulate', id, result });
      return;
    }

    if (request.kind === 'weights') {
      const opts: Parameters<typeof deriveWeights>[2] = {
        onProgress: (done, total) => post({ kind: 'progress', id, done, total }),
      };
      if (request.iterations !== undefined) opts.iterations = request.iterations;
      if (request.reference) opts.reference = request.reference as never;

      const result = deriveWeights(configFor(request.character, request.fight, request.rotation), spec, opts);
      post({ kind: 'weights', id, result });
      return;
    }

    const compareOpts: Parameters<typeof compareGear>[4] = {
      onProgress: (done, total) => post({ kind: 'progress', id, done, total }),
    };
    if (request.iterations !== undefined) compareOpts.iterations = request.iterations;

    const result = compareGear(
      request.character,
      request.fight,
      spec,
      request.swaps,
      compareOpts,
      request.rotation,
    );
    post({ kind: 'compare', id, result });
  } catch (err) {
    post({ kind: 'error', id, message: err instanceof Error ? err.message : String(err) });
  }
});
