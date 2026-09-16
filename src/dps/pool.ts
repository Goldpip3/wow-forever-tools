/**
 * Every core the machine has.
 *
 * A simulation is a pile of identical, independent fights, which is the easiest
 * kind of work there is to spread out. The only thing that makes it safe is the
 * seeds: iteration i always uses splitSeed(seed, i), so a worker handed
 * iterations 300 to 420 produces exactly the fights that stretch would have
 * produced anywhere else, and the answer does not depend on how the work was
 * divided or on what order it came back in.
 *
 * Work is pulled rather than pushed. A worker asks for its next slice when it
 * finishes the last one, which balances a slow core against a fast one on its
 * own and makes cancelling nothing more than declining to hand out more work.
 * Nothing is terminated mid-flight, so a cancelled run costs at most one slice.
 */

import { mergeShards } from './sim/accumulate';
import { runShard, type Shard } from './sim/sim';
import { specModule } from './sim/specs';
import type { SimConfig } from './sim/types';
import type { ChunkRequest, ChunkResponse } from './worker';

export interface Job {
  jobId: number;
  config: SimConfig;
  iterations: number;
}

export interface JobResult {
  jobId: number;
  shard: Shard;
}

export interface RunOptions {
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
}

/** How long a slice should take, so progress moves without the chatter. */
const TARGET_MS = 150;
const MIN_CHUNK = 10;
const MAX_CHUNK = 2000;

/** Leaves a core for the page itself, and never opens more than this many. */
function poolSize(): number {
  const cores = typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency ?? 4) : 4;
  return Math.max(1, Math.min(8, cores - 1));
}

export function workersAvailable(): boolean {
  return typeof Worker !== 'undefined';
}

/* ------------------------------------------------------------------ workers */

interface Slot {
  worker: Worker;
}

let slots: Slot[] = [];
let nextToken = 1;
const waiting = new Map<number, { resolve: (shard: Shard) => void; reject: (err: Error) => void }>();

/**
 * How long one iteration takes on this machine, learned from the slices that
 * have come back. It starts pessimistic so the first slice is small and the
 * progress bar moves straight away.
 */
let msPerIteration = 5;
/** Whether msPerIteration has been measured yet, or is still the opening guess. */
let measured = false;

/**
 * How fast one worker gets through an iteration, and how many work at once. The rate is
 * per worker, so an estimate divides the work by the count. Before any slice has come
 * back the rate is only the opening guess, and says so.
 */
export function poolTiming(): { msPerIteration: number; workers: number; measured: boolean } {
  return { msPerIteration, workers: workersAvailable() ? poolSize() : 1, measured };
}

function chunkSize(): number {
  const size = Math.round(TARGET_MS / Math.max(0.01, msPerIteration));
  return Math.max(MIN_CHUNK, Math.min(MAX_CHUNK, size));
}

function ensureSlots(): Slot[] {
  if (slots.length) return slots;

  slots = Array.from({ length: poolSize() }, () => {
    const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });

    worker.addEventListener('message', (event: MessageEvent<ChunkResponse>) => {
      const message = event.data;
      const entry = waiting.get(message.token);
      if (!entry) return;
      waiting.delete(message.token);
      if (message.kind === 'error') entry.reject(new Error(message.message));
      else entry.resolve(message.shard);
    });

    worker.addEventListener('error', (event) => {
      const failure = new Error(event.message || 'The simulator stopped unexpectedly.');
      for (const entry of waiting.values()) entry.reject(failure);
      waiting.clear();
      // The whole pool goes, because a worker that died once will die again and
      // the next run should start from a clean set.
      shutdown();
    });

    return { worker };
  });

  return slots;
}

/** Closes every worker. The next run opens a fresh set. */
export function shutdown(): void {
  for (const slot of slots) slot.worker.terminate();
  slots = [];
}

function askWorker(slot: Slot, request: Omit<ChunkRequest, 'token'>): Promise<Shard> {
  const token = nextToken;
  nextToken += 1;
  return new Promise<Shard>((resolve, reject) => {
    waiting.set(token, { resolve, reject });
    slot.worker.postMessage({ ...request, token } satisfies ChunkRequest);
  });
}

/* --------------------------------------------------------------- the run */

function specFor(config: SimConfig) {
  const spec = specModule(config.specId);
  if (!spec) throw new Error('No simulation has been written for this spec yet.');
  return spec;
}

/**
 * Runs every job, splitting each one into slices and handing them out as
 * workers come free. The results come back in the order the jobs were given,
 * whatever order the slices finished in.
 */
export async function runJobs(jobs: Job[], opts: RunOptions = {}): Promise<JobResult[]> {
  const parts = new Map<number, Shard[]>();
  for (const job of jobs) parts.set(job.jobId, []);

  const total = jobs.reduce((sum, job) => sum + job.iterations, 0);
  let done = 0;

  // The next slice to hand out, walked in order.
  let jobIndex = 0;
  let offset = 0;

  const cancelled = () => opts.signal?.aborted === true;

  function take(): { job: Job; start: number; end: number } | null {
    while (jobIndex < jobs.length) {
      const job = jobs[jobIndex]!;
      if (offset >= job.iterations) {
        jobIndex += 1;
        offset = 0;
        continue;
      }
      const start = offset;
      const end = Math.min(job.iterations, start + chunkSize());
      offset = end;
      return { job, start, end };
    }
    return null;
  }

  function record(jobId: number, shard: Shard, count: number): void {
    parts.get(jobId)!.push(shard);
    done += count;
    opts.onProgress?.(done, total);
  }

  if (!workersAvailable()) {
    // Tests and anything without workers run the same slices in a line. The
    // arithmetic is identical; it just blocks while it works.
    for (;;) {
      if (cancelled()) throw new Error('cancelled');
      const next = take();
      if (!next) break;
      const shard = runShard(next.job.config, specFor(next.job.config), next.start, next.end);
      record(next.job.jobId, shard, next.end - next.start);
    }
  } else {
    const pool = ensureSlots();

    const drive = async (slot: Slot): Promise<void> => {
      for (;;) {
        if (cancelled()) return;
        const next = take();
        if (!next) return;

        const began = Date.now();
        const shard = await askWorker(slot, {
          config: next.job.config,
          start: next.start,
          end: next.end,
        });

        // Learn how fast this machine is from the slice that just came back, so
        // the next one is sized to take about as long as intended.
        const count = next.end - next.start;
        const elapsed = Date.now() - began;
        if (count > 0 && elapsed > 0) {
          msPerIteration = elapsed / count;
          measured = true;
        }

        record(next.job.jobId, shard, count);
      }
    };

    await Promise.all(pool.map((slot) => drive(slot)));
    if (cancelled()) throw new Error('cancelled');
  }

  return jobs.map((job) => ({ jobId: job.jobId, shard: mergeShards(parts.get(job.jobId)!) }));
}
