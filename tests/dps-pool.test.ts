import { describe, expect, it } from 'vitest';

import { finishShard, mergeShards, type Shard } from '../src/dps/sim/accumulate';
import { runShard, simulate } from '../src/dps/sim/sim';
import { runJobs, workersAvailable } from '../src/dps/pool';
import { parseCharacterExport } from '../src/dps/importer';
import { SAMPLE_WARRIOR_EXPORT } from '../src/dps/sample-warrior';
import { deriveStatSheet } from '../src/dps/stats';
import { specModule } from '../src/dps/sim/specs';
import { runSimulation, runWeights } from '../src/dps/client';
import type { FightConfig, SimConfig } from '../src/dps/sim/types';

/**
 * The point of splitting a run is that it comes back the same. Iteration i
 * always uses splitSeed(seed, i), so any way of carving up the range has to
 * give the identical answer, not a close one.
 */

const character = parseCharacterExport(SAMPLE_WARRIOR_EXPORT).character!;
const spec = specModule(character.specId)!;

function fight(iterations = 1000): FightConfig {
  return {
    duration: 120,
    iterations,
    seed: 20260915,
    target: { level: 63, armor: 3000, resistance: 0, behind: true, canParry: false, canBlock: false },
    buffs: [],
    debuffs: [],
    consumables: [],
  };
}

function configFor(f: FightConfig): SimConfig {
  return {
    specId: character.specId,
    stats: deriveStatSheet(character, f),
    talents: character.talentRanks,
    fight: f,
  };
}

describe('slicing a run', () => {
  const f = fight();
  const config = configFor(f);
  const whole = runShard(config, spec, 0, 1000);

  it('joins three slices into exactly the one run', () => {
    const parts = [
      runShard(config, spec, 0, 300),
      runShard(config, spec, 300, 700),
      runShard(config, spec, 700, 1000),
    ];
    const merged = mergeShards(parts);

    expect(merged.series.length).toBe(whole.series.length);
    for (let i = 0; i < whole.series.length; i += 1) {
      expect(merged.series[i]).toBe(whole.series[i]);
    }
  });

  it('does not care what order the slices came back in', () => {
    const parts: Shard[] = [
      runShard(config, spec, 700, 1000),
      runShard(config, spec, 0, 300),
      runShard(config, spec, 300, 700),
    ];
    const merged = mergeShards(parts);
    expect(merged.series).toEqual(whole.series);
  });

  it('adds the tallies up rather than losing them', () => {
    const merged = mergeShards([
      runShard(config, spec, 0, 400),
      runShard(config, spec, 400, 1000),
    ]);
    for (const [id, tally] of Object.entries(whole.abilities)) {
      expect(merged.abilities[id]!.casts).toBe(tally.casts);
      expect(merged.abilities[id]!.hits).toBe(tally.hits);
      expect(merged.abilities[id]!.damage).toBeCloseTo(tally.damage, 6);
    }
  });

  it('gives the same mean and spread as one run would', () => {
    const merged = mergeShards([
      runShard(config, spec, 0, 137),
      runShard(config, spec, 137, 555),
      runShard(config, spec, 555, 1000),
    ]);
    const split = finishShard(merged, config, spec);
    const single = simulate(config, spec);

    expect(split.dps).toBe(single.dps);
    expect(split.dpsStdev).toBe(single.dpsStdev);
    expect(split.dpsStderr).toBe(single.dpsStderr);
    expect(split.iterations).toBe(single.iterations);
  });
});

describe('the scheduler', () => {
  it('runs inline when there are no workers, which is every test', () => {
    expect(workersAvailable()).toBe(false);
  });

  it('reports progress that reaches the total exactly once', async () => {
    const f = fight(200);
    const seen: Array<[number, number]> = [];
    await runJobs([{ jobId: 0, config: configFor(f), iterations: 200 }], {
      onProgress: (done, total) => seen.push([done, total]),
    });

    expect(seen.length).toBeGreaterThan(0);
    expect(seen.at(-1)).toEqual([200, 200]);
    // Never goes backwards and never overshoots.
    let last = 0;
    for (const [done, total] of seen) {
      expect(done).toBeGreaterThan(last);
      expect(done).toBeLessThanOrEqual(total);
      last = done;
    }
  });

  it('counts every job towards the same total', async () => {
    const f = fight(100);
    const config = configFor(f);
    let final: [number, number] = [0, 0];
    const results = await runJobs(
      [
        { jobId: 0, config, iterations: 100 },
        { jobId: 1, config, iterations: 100 },
        { jobId: 2, config, iterations: 100 },
      ],
      { onProgress: (done, total) => { final = [done, total]; } },
    );
    expect(final).toEqual([300, 300]);
    expect(results.map((r) => r.jobId)).toEqual([0, 1, 2]);
    for (const result of results) expect(result.shard.series.length).toBe(100);
  });

  it('gives every job its own answer, not the first one repeated', async () => {
    const f = fight(50);
    const quiet = configFor(f);
    const loud: SimConfig = { ...quiet, stats: { ...quiet.stats, attackPower: quiet.stats.attackPower + 2000 } };

    const [a, b] = await runJobs([
      { jobId: 0, config: quiet, iterations: 50 },
      { jobId: 1, config: loud, iterations: 50 },
    ]);
    const quietDps = finishShard(a!.shard, quiet, spec).dps;
    const loudDps = finishShard(b!.shard, loud, spec).dps;
    expect(loudDps).toBeGreaterThan(quietDps);
  });

  it('stops when the run is called off', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      runJobs([{ jobId: 0, config: configFor(fight(200)), iterations: 200 }], {
        signal: controller.signal,
      }),
    ).rejects.toThrow('cancelled');
  });

  it('stops part way through without finishing the rest', async () => {
    const controller = new AbortController();
    let chunks = 0;
    const promise = runJobs([{ jobId: 0, config: configFor(fight(5000)), iterations: 5000 }], {
      signal: controller.signal,
      onProgress: () => {
        chunks += 1;
        if (chunks === 2) controller.abort();
      },
    });
    await expect(promise).rejects.toThrow('cancelled');
    expect(chunks).toBeLessThan(20);
  });
});

describe('the api on top of it', () => {
  it('simulating through the client matches simulating directly', async () => {
    const f = fight(200);
    const direct = simulate(configFor(f), spec);
    const viaClient = await runSimulation(character, f);
    expect(viaClient.dps).toBe(direct.dps);
    expect(viaClient.abilities.length).toBe(direct.abilities.length);
  });

  it('weighs every stat the spec asked for, baseline included', async () => {
    const result = await runWeights(character, fight(120), { iterations: 60 });
    expect(result.weights.map((w) => w.stat)).toEqual(spec.weightStats.map((w) => w.stat));
    expect(result.baseDps).toBeGreaterThan(0);
    // Attack power is the reference, so it is one by construction.
    expect(result.weights.find((w) => w.stat === 'attackPower')!.normalised).toBeCloseTo(1, 9);
  });
});
