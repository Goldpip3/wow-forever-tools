/**
 * The simulator, off the main thread.
 *
 * It has one job now: run a slice of iterations and hand the numbers back. The
 * thinking about what to run, which stats a swap changes and how the pieces go
 * together all stayed on the main thread, because that part is cheap and having
 * it in two places is how the two copies drift apart.
 */

import { runShard, type Shard } from './sim/sim';
import { specModule } from './sim/specs';
import type { SimConfig } from './sim/types';

// The DOM library is on for the rest of the site, so `self` needs telling that
// here it is a worker rather than a window.
const ctx = self as unknown as Worker;

export interface ChunkRequest {
  token: number;
  config: SimConfig;
  /** Iterations [start, end), by index, which is what picks the seeds. */
  start: number;
  end: number;
}

export type ChunkResponse =
  | { kind: 'chunk'; token: number; shard: Shard }
  | { kind: 'error'; token: number; message: string };

ctx.addEventListener('message', (event: MessageEvent<ChunkRequest>) => {
  const { token, config, start, end } = event.data;

  try {
    const spec = specModule(config.specId);
    if (!spec) throw new Error('No simulation has been written for this spec yet.');
    const shard = runShard(config, spec, start, end);
    ctx.postMessage({ kind: 'chunk', token, shard } satisfies ChunkResponse);
  } catch (err) {
    ctx.postMessage({
      kind: 'error',
      token,
      message: err instanceof Error ? err.message : String(err),
    } satisfies ChunkResponse);
  }
});
