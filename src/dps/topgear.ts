/**
 * The best combination of what you already own.
 *
 * Ranking slots one at a time is a lie the moment two items interact, and they
 * interact constantly: two rings that are each an upgrade cannot both go on if
 * one is unique, a two-hander takes the off hand with it, and a set bonus only
 * arrives when the last piece does. The only honest answer is to try the
 * combinations.
 *
 * Trying all of them is out of the question, so the linear score does the first
 * cut. It is wrong in the ways a straight line through a curve is wrong, but it
 * is right enough to say which three helmets are worth simulating out of the
 * eleven in your bank, and simulating is what settles it.
 */

import { candidatesFor, equippedIn, itemKey, itemScore, pairedSlot } from './gear';
import { isTwoHanded, SLOTS, type ItemRef, type Slot } from './export-format';
import { setProgress } from './data/sets';
import { wornItems } from './stats';
import type { Character } from './types';
import type { WeightTable } from './weights';

/** One slot's shortlist: what is on now, plus the best few that are not. */
export interface SlotChoices {
  slot: Slot;
  /** What is worn, first, so the loadout you already have is always in the run. */
  options: Array<ItemRef | null>;
}

export interface TopGearPlan {
  choices: SlotChoices[];
  /** How many loadouts this comes to, after the impossible ones are taken out. */
  combinations: number;
}

/** A full set of decisions: what goes in each slot. */
export type Loadout = Partial<Record<Slot, ItemRef | null>>;

/**
 * The best few candidates per slot, by the linear score.
 *
 * Weapons are left out of the cross product entirely. Main hand and off hand
 * have to be chosen together and against two-handers, which is its own problem
 * and is already solved by weaponChoice; folding it in here would multiply the
 * count by a hundred to answer a question that has been answered.
 */
export function planTopGear(
  character: Character,
  weights: WeightTable,
  perSlot = 3,
): TopGearPlan {
  const choices: SlotChoices[] = [];

  for (const slot of SLOTS) {
    if (slot === 'mainhand' || slot === 'offhand') continue;

    const worn = equippedIn(character, slot);
    const ranked = candidatesFor(character, slot)
      .map((item) => ({ item, score: itemScore(item, weights) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.max(0, perSlot))
      .map((entry) => entry.item);

    const options: Array<ItemRef | null> = [worn ?? null, ...ranked];
    if (options.length > 1) choices.push({ slot, options });
  }

  return { choices, combinations: countCombinations(choices) };
}

/**
 * How many loadouts a plan really comes to.
 *
 * The multiplication is an upper bound: a unique ring cannot go on both fingers
 * and a pair is unordered, so some of the product never gets run. Counting them
 * properly means walking them, which is cheap next to simulating them and is
 * the difference between an estimate and a number.
 */
function countCombinations(choices: SlotChoices[]): number {
  let count = 0;
  const walk = enumerate(choices);
  while (!walk.next().done) count += 1;
  return count;
}

/**
 * Every loadout the choices allow.
 *
 * Two rules take combinations out. A unique item cannot be in both halves of a
 * pair, which is what stops two copies of the same ring. And a pair of rings or
 * trinkets is unordered, so wearing A and B is the same loadout as wearing B
 * and A and only one of them is worth simulating.
 */
export function* enumerate(choices: SlotChoices[]): Generator<Loadout> {
  const ordered = [...choices];

  function* walk(at: number, sofar: Loadout): Generator<Loadout> {
    if (at >= ordered.length) {
      yield { ...sofar };
      return;
    }

    const choice = ordered[at]!;
    for (const option of choice.options) {
      if (option && !allowed(choice.slot, option, sofar)) continue;
      sofar[choice.slot] = option;
      yield* walk(at + 1, sofar);
    }
    delete sofar[choice.slot];
  }

  yield* walk(0, {});
}

/** Whether this item may go in this slot given what is already decided. */
function allowed(slot: Slot, item: ItemRef, sofar: Loadout): boolean {
  const pair = pairedSlot(slot);
  if (!pair) return true;

  const other = sofar[pair];
  if (!other) return true;

  // The same unique item cannot be worn twice.
  if (item.unique && other.id === item.id) return false;
  if (other.id === item.id && itemKey(other) === itemKey(item)) {
    // Two copies of an item that is not unique are allowed, but the same one is
    // not: an item already on the other finger is one ring, not two.
    if (other.location.where === item.location.where
      && other.location.bag === item.location.bag
      && other.location.index === item.location.index) return false;
  }

  // Rings and trinkets come in unordered pairs, so only keep one arrangement.
  // The second slot of a pair must hold something ordered after the first.
  if (slot.endsWith('2') && itemKey(item) < itemKey(other)) return false;

  return true;
}

/** Everything a loadout changes against what is worn now. */
export function swapsIn(character: Character, loadout: Loadout): Array<{ slot: Slot; item: ItemRef | null }> {
  const out: Array<{ slot: Slot; item: ItemRef | null }> = [];
  for (const [slot, item] of Object.entries(loadout) as Array<[Slot, ItemRef | null]>) {
    const worn = equippedIn(character, slot) ?? null;
    if ((worn?.id ?? null) === (item?.id ?? null)) continue;
    out.push({ slot, item });
  }
  return out;
}

/** The sets a loadout would be wearing, for the row that explains why. */
export function setsIn(character: Character, loadout: Loadout): Array<{ name: string; worn: number }> {
  return setProgress(wornItems(character.source.equipped, loadout));
}

/** The linear score of a whole loadout, for the first cut and for the ordering. */
export function loadoutScore(character: Character, loadout: Loadout, weights: WeightTable): number {
  let total = 0;
  for (const item of wornItems(character.source.equipped, loadout)) {
    total += itemScore(item, weights);
  }
  return total;
}

export interface TopGearEstimate {
  combinations: number;
  /** Seconds, from how fast the last run turned out to be. */
  seconds: number;
}

/**
 * Roughly how long a run would take, from the rate the last one managed.
 *
 * It is shown before anything starts rather than after, because the only thing
 * worse than a slow answer is a slow answer nobody agreed to wait for.
 */
export function estimate(
  combinations: number,
  iterations: number,
  msPerIteration: number,
  cores: number,
): TopGearEstimate {
  const work = combinations * iterations * Math.max(0.01, msPerIteration);
  return { combinations, seconds: work / Math.max(1, cores) / 1000 };
}

/** Whether a loadout would put a two-hander on with something in the off hand. */
export function valid(character: Character, loadout: Loadout): boolean {
  const main = loadout.mainhand ?? equippedIn(character, 'mainhand');
  const off = loadout.offhand ?? equippedIn(character, 'offhand');
  if (main && isTwoHanded(main.equipLoc) && off) return false;
  return true;
}
