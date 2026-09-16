/**
 * A slice of a run, and how two slices add up.
 *
 * Splitting a thousand iterations across eight cores only works if the pieces
 * join back together into exactly the answer one core would have given. The
 * seeds make that possible: iteration i always uses splitSeed(seed, i), so
 * iterations 0 to 299 on one worker and 300 to 999 on another are the same
 * thousand fights, in the same order, as one worker doing all of them.
 *
 * A shard carries its per-iteration figures rather than a running mean and
 * variance. Merging means concatenating rather than applying a variance-merging
 * formula, so the arithmetic at the end is identical to the arithmetic before
 * any of this existed, down to the last bit. It also costs almost nothing:
 * twenty thousand iterations is a hundred and sixty kilobytes, and the
 * histogram the results panel wants needs those figures anyway.
 */

import { buildNotes } from './notes';
import { targetStateFor } from './target';
import type { SpecModule } from './spec';
import type { AbilityStats, SimConfig, SimResult } from './types';

export interface Tally {
  casts: number;
  hits: number;
  crits: number;
  misses: number;
  avoided: number;
  glances: number;
  damage: number;
}

export function emptyTally(): Tally {
  return { casts: 0, hits: 0, crits: 0, misses: 0, avoided: 0, glances: 0, damage: 0 };
}

/**
 * One slice of a run, in a shape that survives being posted between threads:
 * plain numbers and plain objects, no Maps.
 */
export interface Shard {
  /** The first iteration index in this slice, so slices can be put back in order. */
  start: number;
  /** Damage per second of each iteration, in iteration order. */
  series: number[];
  abilities: Record<string, Tally>;
  idle: number;
  starved: number;
  manaSpent: number;
  rageGained: number;
  energySpent: number;
  /** Summed rather than averaged, because not every iteration ran dry. */
  oomSum: number;
  oomCount: number;
}

export function emptyShard(start = 0): Shard {
  return {
    start,
    series: [],
    abilities: {},
    idle: 0,
    starved: 0,
    manaSpent: 0,
    rageGained: 0,
    energySpent: 0,
    oomSum: 0,
    oomCount: 0,
  };
}

function addTallies(into: Record<string, Tally>, from: Record<string, Tally>): void {
  for (const [id, t] of Object.entries(from)) {
    const running = into[id] ?? emptyTally();
    running.casts += t.casts;
    running.hits += t.hits;
    running.crits += t.crits;
    running.misses += t.misses;
    running.avoided += t.avoided;
    running.glances += t.glances;
    running.damage += t.damage;
    into[id] = running;
  }
}

/**
 * Joins slices into one. They are put in iteration order first, so the series
 * that comes out is the series a single run would have produced.
 */
export function mergeShards(parts: Shard[]): Shard {
  if (parts.length === 1) return parts[0]!;

  const ordered = [...parts].sort((a, b) => a.start - b.start);
  const out = emptyShard(ordered[0]?.start ?? 0);

  for (const part of ordered) {
    out.series.push(...part.series);
    addTallies(out.abilities, part.abilities);
    out.idle += part.idle;
    out.starved += part.starved;
    out.manaSpent += part.manaSpent;
    out.rageGained += part.rageGained;
    out.energySpent += part.energySpent;
    out.oomSum += part.oomSum;
    out.oomCount += part.oomCount;
  }

  return out;
}

/** The ids white swings are tallied under, so their names can be filled in. */
const AUTO_ATTACK_NAME: Record<string, string> = {
  'auto-main': 'Main hand',
  'auto-off': 'Off hand',
  'auto-ranged': 'Ranged',
};

/** Turns a finished shard into the result the page reads. */
export function finishShard(shard: Shard, config: SimConfig, spec: SpecModule): SimResult {
  const iterations = Math.max(1, shard.series.length);
  const duration = config.fight.duration;

  const mean = shard.series.reduce((sum, n) => sum + n, 0) / iterations;
  const variance =
    iterations > 1
      ? shard.series.reduce((sum, n) => sum + (n - mean) ** 2, 0) / (iterations - 1)
      : 0;
  const stdev = Math.sqrt(variance);

  const entries = Object.entries(shard.abilities);
  const totalDamage = entries.reduce((sum, [, t]) => sum + t.damage, 0);

  const names = new Map(spec.spells.map((s) => [s.id, s.name]));
  for (const [id, name] of Object.entries(AUTO_ATTACK_NAME)) names.set(id, name);
  for (const [id, name] of Object.entries(spec.extraNames ?? {})) names.set(id, name);

  const abilities: AbilityStats[] = entries
    .map(([id, t]) => ({
      id,
      name: names.get(id) ?? names.get(id.replace(/-dot$/, '')) ?? id,
      casts: t.casts / iterations,
      hits: t.hits / iterations,
      crits: t.crits / iterations,
      misses: t.misses / iterations,
      avoided: t.avoided / iterations,
      glances: t.glances / iterations,
      damage: t.damage / iterations,
      dps: t.damage / iterations / duration,
      share: totalDamage > 0 ? t.damage / totalDamage : 0,
    }))
    .filter((a) => a.casts > 0 || a.damage > 0 || a.hits > 0 || a.misses > 0 || a.avoided > 0)
    .sort((a, b) => b.damage - a.damage);

  const resources: SimResult['resources'] = {
    timeIdle: shard.idle / iterations,
    manaSpent: shard.manaSpent / iterations,
    rageGained: shard.rageGained / iterations,
    energySpent: shard.energySpent / iterations,
    starvedFor: shard.starved / iterations,
  };
  if (shard.oomCount > 0) resources.oomAt = shard.oomSum / shard.oomCount;

  return {
    dps: mean,
    dpsStdev: stdev,
    dpsStderr: stdev / Math.sqrt(iterations),
    iterations,
    duration,
    abilities,
    resources,
    notes: buildNotes(config, spec, targetStateFor(config.fight)),
  };
}
