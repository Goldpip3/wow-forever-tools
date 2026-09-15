/**
 * What a point of each stat is actually worth, measured rather than guessed.
 *
 * The method is a finite difference. Run the fight, add some of one stat, run
 * it again, and divide the change in damage by how much was added. Do that for
 * every stat and you have a weight table that came out of this character's own
 * rotation, gear and talents, instead of a table someone wrote down for a
 * different mage in a different raid.
 *
 * The trick that makes it usable is sharing seeds. Both runs see the same
 * misses in the same places, so the difference between them is the stat and not
 * the dice. Comparing two independent averages would need hundreds of times as
 * many iterations to see through the noise.
 */

import { specById } from '../shared/classes';
import type { StatKey } from './export-format';
import { STAT_KEYS, STAT_LABEL } from './export-format';
import { CONVERSIONS } from './data/conversions';
import { convert } from './stats';
import { applyTalents } from './sim/spells';
import { dpsSeries } from './sim/sim';
import type { SpecModule } from './sim/spec';
import { spellHitChance } from './sim/tables';
import type { SimConfig, StatSheet } from './sim/types';

export interface StatWeight {
  stat: StatKey;
  label: string;
  /** Damage per second gained per point of the stat. */
  perPoint: number;
  /** How well that figure is pinned down, in damage per second per point. */
  stderr: number;
  /** Relative to the reference stat. */
  normalised: number;
  /** The stat is at a cap, so more of it does nothing. */
  capped?: boolean;
  /** How much was added to measure it. */
  step: number;
}

export interface WeightResult {
  baseDps: number;
  weights: StatWeight[];
  reference: StatKey;
  iterations: number;
  notes: string[];
}

export interface WeightOptions {
  /** Overrides the fight's own iteration count, which can be lower for speed. */
  iterations?: number;
  onProgress?: (done: number, total: number) => void;
  /** Show weights against this stat instead of the spec's usual one. */
  reference?: StatKey;
}

/**
 * Adds some of a stat the way putting on an item would.
 *
 * This has to go through the class conversions or a primary stat measures as
 * worthless: the simulator never reads intellect, it reads the crit and the
 * mana that intellect turned into. Adding fifty intellect to the resolved sheet
 * and nothing else would change no number the fight ever looks at, which is how
 * a real stat ends up with a weight of zero.
 */
function perturb(config: SimConfig, stat: StatKey, step: number): StatSheet {
  const classId = specById(config.specId)?.classId;
  const delta = classId ? convert(classId, { [stat]: step }) : { [stat]: step };

  const sheet: StatSheet = { ...config.stats };
  for (const key of STAT_KEYS) {
    const value = delta[key];
    if (value) sheet[key] += value;
  }

  // Mana follows intellect, the same as it does in the stat model.
  const intellect = delta.intellect ?? 0;
  if (classId && intellect) sheet.mana += intellect * CONVERSIONS[classId].manaPerInt;

  return sheet;
}

function mean(values: number[]): number {
  return values.reduce((sum, n) => sum + n, 0) / values.length;
}

/** The spread of the paired differences, which is what the seed sharing shrinks. */
function pairedStderr(base: number[], moved: number[]): number {
  const n = Math.min(base.length, moved.length);
  if (n < 2) return 0;
  const diffs = new Array<number>(n);
  for (let i = 0; i < n; i += 1) diffs[i] = moved[i]! - base[i]!;
  const m = mean(diffs);
  const variance = diffs.reduce((sum, d) => sum + (d - m) ** 2, 0) / (n - 1);
  return Math.sqrt(variance / n);
}

/**
 * How much more hit can still do something. Spells cap at ninety-nine per cent
 * to land, so past that point another point of hit is worth precisely nothing
 * and the table should say so rather than showing a number near zero.
 */
function hitRoom(config: SimConfig, spec: SpecModule, stat: StatKey): number | null {
  if (stat !== 'spellHit') return null;
  const mods = applyTalents(spec.talentHooks, config.talents);
  const current = config.stats.spellHit + mods.spellHit;
  const level = config.stats.level;
  const target = config.fight.target.level;
  const now = spellHitChance(level, target, current);

  // Walk up until another point stops helping.
  for (let extra = 0; extra <= 40; extra += 0.5) {
    if (spellHitChance(level, target, current + extra) > now) {
      // There is room; find where it stops paying.
      let room = 0;
      while (room < 40 && spellHitChance(level, target, current + room + 0.5) > spellHitChance(level, target, current + room)) {
        room += 0.5;
      }
      return room;
    }
  }
  return 0;
}

/**
 * Measures every stat the spec asked about.
 *
 * Runs one fight per stat plus one baseline, so a spec with eight weight stats
 * costs nine runs. Iterations can be dialled down here: a weight only has to be
 * good enough to rank two items, which needs far less precision than the damage
 * figure itself.
 */
export function deriveWeights(
  config: SimConfig,
  spec: SpecModule,
  opts: WeightOptions = {},
): WeightResult {
  const iterations = Math.max(1, Math.round(opts.iterations ?? config.fight.iterations));
  const base: SimConfig = { ...config, fight: { ...config.fight, iterations } };

  const total = spec.weightStats.length + 1;
  const baseSeries = dpsSeries(base, spec);
  const baseDps = mean(baseSeries);
  opts.onProgress?.(1, total);

  const notes: string[] = [];
  const weights: StatWeight[] = [];

  spec.weightStats.forEach((entry, i) => {
    let step = entry.step;
    let capped = false;

    const room = hitRoom(base, spec, entry.stat);
    if (room !== null) {
      if (room <= 0) {
        capped = true;
      } else if (room < step) {
        // Only part of the step would do anything, so measure the part that does.
        step = room;
      }
    }

    if (capped) {
      weights.push({
        stat: entry.stat,
        label: STAT_LABEL[entry.stat],
        perPoint: 0,
        stderr: 0,
        normalised: 0,
        capped: true,
        step: entry.step,
      });
      opts.onProgress?.(i + 2, total);
      return;
    }

    const moved: SimConfig = { ...base, stats: perturb(base, entry.stat, step) };
    const movedSeries = dpsSeries(moved, spec);

    weights.push({
      stat: entry.stat,
      label: STAT_LABEL[entry.stat],
      perPoint: (mean(movedSeries) - baseDps) / step,
      stderr: pairedStderr(baseSeries, movedSeries) / step,
      normalised: 0,
      step,
    });

    opts.onProgress?.(i + 2, total);
  });

  const reference = opts.reference ?? spec.referenceStat;
  normalise(weights, reference);

  const referenceWeight = weights.find((w) => w.stat === reference);
  if (!referenceWeight || referenceWeight.perPoint <= 0) {
    notes.push(
      'The reference stat is worth nothing to this character, so the relative column is ' +
        'left blank. Read the damage per point instead.',
    );
  }
  if (weights.some((w) => w.capped)) {
    notes.push('A capped stat does nothing more for you. Spend those points elsewhere.');
  }

  return { baseDps, weights, reference, iterations, notes };
}

/** Rewrites the relative column against a chosen stat. */
export function normalise(weights: StatWeight[], reference: StatKey): void {
  const anchor = weights.find((w) => w.stat === reference);
  const divisor = anchor && anchor.perPoint > 0 ? anchor.perPoint : 0;
  for (const weight of weights) {
    weight.normalised = divisor > 0 ? weight.perPoint / divisor : 0;
  }
}

/** The table a score uses: the relative column, with any user edits on top. */
export type WeightTable = Partial<Record<StatKey, number>>;

export function weightTable(result: WeightResult, overrides: WeightTable = {}): WeightTable {
  const table: WeightTable = {};
  for (const weight of result.weights) {
    table[weight.stat] = overrides[weight.stat] ?? weight.normalised;
  }
  for (const [key, value] of Object.entries(overrides) as Array<[StatKey, number]>) {
    if (table[key] === undefined) table[key] = value;
  }
  return table;
}

/**
 * What one point of an item score is worth in damage per second.
 *
 * Scores are built from the relative column, because that is the column people
 * edit: spell damage is one and everything else is a multiple of it. That makes
 * a score a count of spell-damage-equivalents rather than damage, so anything
 * shown to a reader has to come back through here first, or a seven point gain
 * gets printed as seven damage per second when it is really two.
 */
export function dpsPerPoint(result: WeightResult): number {
  const anchor = result.weights.find((w) => w.stat === result.reference);
  return anchor && anchor.perPoint > 0 ? anchor.perPoint : 0;
}

/** Whether a weight is too uncertain to rank two close items apart. */
export function isNoisy(weight: StatWeight): boolean {
  if (weight.capped || weight.perPoint <= 0) return false;
  return weight.stderr > Math.abs(weight.perPoint) * 0.25;
}
