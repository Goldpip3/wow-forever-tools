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

import { splitSeed } from './rng';
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
  /** Seconds each aura spent up, summed over the iterations in this slice. */
  auraUptime: Record<string, number>;
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
    auraUptime: {},
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
    for (const [id, seconds] of Object.entries(part.auraUptime)) {
      out.auraUptime[id] = (out.auraUptime[id] ?? 0) + seconds;
    }
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

/** An aura id nobody named: 'winters-chill' reads as Winters chill. */
function auraName(id: string): string {
  const words = id.replace(/-/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The ids white swings are tallied under, so their names can be filled in. */
const AUTO_ATTACK_NAME: Record<string, string> = {
  'auto-main': 'Main hand',
  'auto-off': 'Off hand',
  'auto-ranged': 'Ranged',
};

/** How many buckets the spread is drawn in. Forty is enough to see the shape. */
const BINS = 40;

function histogramOf(series: number[]): { min: number; max: number; bins: number[] } {
  const bins = new Array<number>(BINS).fill(0);
  if (!series.length) return { min: 0, max: 0, bins };

  const min = Math.min(...series);
  const max = Math.max(...series);
  if (max <= min) {
    bins[0] = series.length;
    return { min, max, bins };
  }

  const width = (max - min) / BINS;
  for (const value of series) {
    // The top of the range belongs in the last bucket rather than one past it.
    const at = Math.min(BINS - 1, Math.floor((value - min) / width));
    bins[at] += 1;
  }
  return { min, max, bins };
}

/** The run that came out closest to the middle of the pack. */
function representativeOf(series: number[], seed: number): { index: number; seed: number; dps: number } {
  if (!series.length) return { index: 0, seed: splitSeed(seed, 0), dps: 0 };

  const sorted = [...series].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)]!;

  let best = 0;
  let bestGap = Infinity;
  for (let i = 0; i < series.length; i += 1) {
    const gap = Math.abs(series[i]! - median);
    if (gap < bestGap) {
      bestGap = gap;
      best = i;
    }
  }
  return { index: best, seed: splitSeed(seed, best), dps: series[best]! };
}

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
  // A trinket or a weapon proc bills its damage to a row of its own, named
  // after the item it came from.
  for (const entry of config.effects ?? []) {
    if (entry.effect.kind !== 'extra-attacks') names.set(entry.effect.aura.id, entry.name);
  }

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

  // Only auras worth naming: anything that was up for less than a tenth of a
  // second in an average run is noise from the last moments of a fight.
  const auras = Object.entries(shard.auraUptime)
    .map(([id, seconds]) => ({ id, name: names.get(id) ?? auraName(id), uptime: seconds / iterations }))
    .filter((a) => a.uptime >= 0.1)
    .sort((a, b) => b.uptime - a.uptime);

  return {
    dps: mean,
    dpsStdev: stdev,
    dpsStderr: stdev / Math.sqrt(iterations),
    iterations,
    duration,
    abilities,
    resources,
    histogram: histogramOf(shard.series),
    auras,
    representative: representativeOf(shard.series, config.fight.seed),
    notes: buildNotes(config, spec, targetStateFor(config.fight)),
  };
}
