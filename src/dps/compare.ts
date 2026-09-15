/**
 * Checking a swap the hard way.
 *
 * Scores rank quickly but they are a straight line drawn through a curved
 * thing: they cannot see that hit stops paying at the cap, or that more
 * intellect is worth less once mana was never the problem. When two items are
 * close, or the answer is surprising, this runs the fight again with the item
 * actually on and reports the difference the simulator measured.
 *
 * Both runs share their seeds, so the difference is the item rather than the
 * dice.
 */

import type { ItemRef, Slot } from './export-format';
import { isTwoHanded } from './export-format';
import { pairedSlot } from './gear';
import { deriveStatSheet } from './stats';
import { dpsSeries } from './sim/sim';
import type { SpecModule } from './sim/spec';
import type { FightConfig, SimConfig } from './sim/types';
import type { Character } from './types';

export interface GearSwap {
  slot: Slot;
  /** The item to put on, or null to take the slot's item off. */
  item: ItemRef | null;
}

export interface SwapResult extends GearSwap {
  /** Damage per second gained, as the simulator measured it. */
  deltaDps: number;
  /** How well that difference is pinned down. */
  stderr: number;
  /** The off hand had to come off to make room for a two-hander. */
  clearedOffhand?: boolean;
}

export interface CompareResult {
  baseDps: number;
  results: SwapResult[];
}

function mean(values: number[]): number {
  return values.reduce((sum, n) => sum + n, 0) / values.length;
}

function pairedStderr(base: number[], moved: number[]): number {
  const n = Math.min(base.length, moved.length);
  if (n < 2) return 0;
  const diffs = new Array<number>(n);
  for (let i = 0; i < n; i += 1) diffs[i] = moved[i]! - base[i]!;
  const m = mean(diffs);
  const variance = diffs.reduce((sum, d) => sum + (d - m) ** 2, 0) / (n - 1);
  return Math.sqrt(variance / n);
}

/** What the equipped set looks like with one swap applied. */
export function overrideFor(swap: GearSwap): Partial<Record<Slot, ItemRef | null>> {
  const override: Partial<Record<Slot, ItemRef | null>> = { [swap.slot]: swap.item };

  // A two-hander needs the off hand empty, and taking one off frees it again.
  if (swap.item && isTwoHanded(swap.item.equipLoc) && swap.slot === 'mainhand') {
    override.offhand = null;
  }
  return override;
}

export interface CompareOptions {
  iterations?: number;
  onProgress?: (done: number, total: number) => void;
}

export function compareGear(
  character: Character,
  fight: FightConfig,
  spec: SpecModule,
  swaps: GearSwap[],
  opts: CompareOptions = {},
  rotation?: string,
): CompareResult {
  const iterations = Math.max(1, Math.round(opts.iterations ?? fight.iterations));
  const runFight: FightConfig = { ...fight, iterations };

  const baseConfig: SimConfig = {
    specId: character.specId,
    stats: deriveStatSheet(character, runFight),
    talents: character.talentRanks,
    fight: runFight,
    ...(rotation ? { rotation } : {}),
  };

  const total = swaps.length + 1;
  const baseSeries = dpsSeries(baseConfig, spec);
  const baseDps = mean(baseSeries);
  opts.onProgress?.(1, total);

  const results: SwapResult[] = swaps.map((swap, i) => {
    const override = overrideFor(swap);
    const config: SimConfig = {
      ...baseConfig,
      stats: deriveStatSheet(character, runFight, { gearOverride: override }),
    };
    const series = dpsSeries(config, spec);

    const result: SwapResult = {
      slot: swap.slot,
      item: swap.item,
      deltaDps: mean(series) - baseDps,
      stderr: pairedStderr(baseSeries, series),
    };
    if (override.offhand === null && swap.slot === 'mainhand') result.clearedOffhand = true;

    opts.onProgress?.(i + 2, total);
    return result;
  });

  return { baseDps, results };
}

/** The slot an item would displace, for a label like "instead of your ring". */
export function displaces(character: Character, swap: GearSwap): ItemRef | undefined {
  const worn = character.source.equipped[swap.slot];
  if (worn) return worn;
  const pair = pairedSlot(swap.slot);
  return pair ? character.source.equipped[pair] : undefined;
}
