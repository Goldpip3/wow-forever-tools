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

import { candidatesFor, equippedIn, itemKey, itemScore, pairedSlot, sameItem } from './gear';
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
  /**
   * How many loadouts will be run: every one the choices allow, or TOP_GEAR_CAP when
   * there are more than that.
   */
  combinations: number;
  /** True when there were more than the cap, so only the best-scoring ones are run. */
  capped: boolean;
}

/** No more than this many loadouts in one go, however many the choices allow. */
export const TOP_GEAR_CAP = 2000;

/** How many of the best are run again at the full iteration count. */
export const FINALISTS = 5;

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

    let options: Array<ItemRef | null> = [worn ?? null, ...ranked];

    // Both halves of a pair pick their shortlist from the same bags, so both can name the
    // same physical ring. When a second copy is owned the second finger takes that one,
    // or wearing the pair would be refused as one ring on two fingers.
    const pair = pairedSlot(slot);
    const first = pair ? choices.find((c) => c.slot === pair) : undefined;
    if (first) options = options.map((option) => otherCopy(character, option, first.options));

    if (options.length > 1) choices.push({ slot, options });
  }

  const counted = countCombinations(choices, TOP_GEAR_CAP + 1);
  return { choices, combinations: Math.min(counted, TOP_GEAR_CAP), capped: counted > TOP_GEAR_CAP };
}

/** A copy of `item` that none of `taken` already is, or `item` when there is no other. */
function otherCopy(
  character: Character,
  item: ItemRef | null,
  taken: Array<ItemRef | null>,
): ItemRef | null {
  if (!item || !taken.some((t) => sameItem(t, item))) return item;
  const spare = character.owned.find(
    (copy) => itemKey(copy) === itemKey(item) && !taken.some((t) => sameItem(t, copy)),
  );
  return spare ?? item;
}

/**
 * How many loadouts a plan really comes to.
 *
 * The multiplication is an upper bound: a unique ring cannot go on both fingers
 * and a pair is unordered, so some of the product never gets run. Counting them
 * properly means walking them, which is cheap next to simulating them and is
 * the difference between an estimate and a number.
 *
 * The walk stops at `limit`. The page counts on every redraw, and a big bank can allow
 * more loadouts than any browser could walk; past the cap the exact number does not
 * change what is run.
 */
function countCombinations(choices: SlotChoices[], limit: number): number {
  let count = 0;
  const walk = enumerate(choices);
  while (count < limit && !walk.next().done) count += 1;
  return count;
}

/**
 * The `limit` loadouts that score best on the weights, best first, with what is worn
 * always among them.
 *
 * A loadout's score is the sum of its slots', so this walks outward from the best option
 * in every slot, one step down one slot at a time, and never builds the loadouts it does
 * not keep. Taking the first two thousand in enumeration order instead would have run
 * whatever happened to come first, and building every one to sort them is exactly the
 * cost the cap is there to avoid.
 *
 * Set bonuses are not in the score, as they are not in the first cut anywhere else.
 */
export function bestLoadouts(
  character: Character,
  choices: SlotChoices[],
  weights: WeightTable,
  limit: number,
): Loadout[] {
  /* The walk is over units, not slots. A lone slot is a unit of its options. A pair of
     rings or trinkets is one unit whose options are the pairs that may be worn, already
     deduplicated, so every step of the walk is a loadout that can exist. Walking the two
     fingers separately spent the whole budget on pairs of one ring worn twice whenever the
     best-scoring rings were the ones in the bags, and came back with nothing but what was
     worn. */
  const scoreItem = (item: ItemRef | null) => (item ? itemScore(item, weights) : 0);
  const units: Array<Array<{ part: Loadout; score: number }>> = [];
  for (const choice of choices) {
    const pair = pairedSlot(choice.slot);
    const partner = pair ? choices.find((c) => c.slot === pair) : undefined;
    if (partner && SLOTS.indexOf(partner.slot) < SLOTS.indexOf(choice.slot)) continue;
    const parts = partner ? [...enumerate([choice, partner])] : choice.options.map((o) => ({ [choice.slot]: o }));
    units.push(
      parts
        .map((part) => ({ part, score: Object.values(part).reduce((sum, item) => sum + scoreItem(item ?? null), 0) }))
        // Stable: equal scores keep the order the options were listed in, so the same inputs
        // always give the same shortlist.
        .sort((a, b) => b.score - a.score),
    );
  }
  const n = units.length;
  const scoreOf = (at: number[]) => at.reduce((sum, r, i) => sum + units[i]![r]!.score, 0);
  const build = (at: number[]): Loadout => Object.assign({}, ...at.map((r, i) => units[i]![r]!.part));
  const legal = (loadout: Loadout): boolean => valid(character, loadout);

  // A max-heap on score. Each step lowers one slot at or after the one the parent
  // lowered, which reaches every combination exactly once.
  type Node = { at: number[]; from: number; score: number };
  const heap: Node[] = [];
  const push = (node: Node) => {
    heap.push(node);
    for (let i = heap.length - 1; i > 0; ) {
      const up = (i - 1) >> 1;
      if (heap[up]!.score >= heap[i]!.score) break;
      [heap[up], heap[i]] = [heap[i]!, heap[up]!];
      i = up;
    }
  };
  const pop = (): Node => {
    const top = heap[0]!;
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      for (let i = 0; ; ) {
        const l = 2 * i + 1;
        const r = l + 1;
        let big = i;
        if (l < heap.length && heap[l]!.score > heap[big]!.score) big = l;
        if (r < heap.length && heap[r]!.score > heap[big]!.score) big = r;
        if (big === i) break;
        [heap[big], heap[i]] = [heap[i]!, heap[big]!];
        i = big;
      }
    }
    return top;
  };

  const out: Loadout[] = [];
  const start = new Array<number>(n).fill(0);
  push({ at: start, from: 0, score: scoreOf(start) });
  // Every unit option is wearable, so this only guards against a loadout valid() refuses.
  let budget = limit * 50;
  while (heap.length && out.length < limit && budget-- > 0) {
    const node = pop();
    const loadout = build(node.at);
    if (legal(loadout)) out.push(loadout);
    for (let j = node.from; j < n; j += 1) {
      if (node.at[j]! + 1 >= units[j]!.length) continue;
      const at = [...node.at];
      at[j] += 1;
      push({ at, from: j, score: scoreOf(at) });
    }
  }

  // What is worn is the yardstick, so it is run whether or not it scored its way in.
  const worn: Loadout = {};
  for (const choice of choices) worn[choice.slot] = choice.options[0] ?? null;
  if (!out.some((l) => swapsIn(character, l).length === 0)) {
    if (out.length >= limit) out.pop();
    out.push(worn);
  }
  return out;
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
  const optionsFor = new Map(ordered.map((c) => [c.slot, c.options]));

  function* walk(at: number, sofar: Loadout): Generator<Loadout> {
    if (at >= ordered.length) {
      yield { ...sofar };
      return;
    }

    const choice = ordered[at]!;
    for (const option of choice.options) {
      if (!allowed(choice.slot, option, sofar, optionsFor)) continue;
      sofar[choice.slot] = option;
      yield* walk(at + 1, sofar);
    }
    delete sofar[choice.slot];
  }

  yield* walk(0, {});
}

const kindOf = (item: ItemRef | null): string => (item ? itemKey(item) : '');

/** Whether this item may go in this slot given what is already decided. */
function allowed(
  slot: Slot,
  item: ItemRef | null,
  sofar: Loadout,
  optionsFor: Map<Slot, Array<ItemRef | null>>,
): boolean {
  const pair = pairedSlot(slot);
  if (!pair || !(pair in sofar)) return true;
  const other = sofar[pair] ?? null;

  if (item && other) {
    // The same unique item cannot be worn twice.
    if (item.unique && other.id === item.id) return false;
    // Two copies of an item are two items; one item seen from both lists is one.
    if (sameItem(item, other)) return false;
  }

  // Rings and trinkets come in unordered pairs, so A and B is the same loadout as B and
  // A. Only when both arrangements can actually be built is one of them dropped, and it
  // is always the same one. Dropping on order alone threw away a pair whose other
  // arrangement was never on offer.
  const firstSlot = SLOTS.indexOf(pair) < SLOTS.indexOf(slot) ? pair : slot;
  if (slot === firstSlot) return true;
  const here = kindOf(item);
  const there = kindOf(other);
  if (here === there) return true;
  // The pair on now is kept in the order it is worn, and its mirror is the one dropped, so
  // what is worn stays in the run as itself rather than as a swap of two rings for two
  // copies of them. Each shortlist starts with what is worn.
  const wornHere = kindOf(optionsFor.get(slot)?.[0] ?? null);
  const wornThere = kindOf(optionsFor.get(pair)?.[0] ?? null);
  if (wornHere !== wornThere) {
    if (here === wornHere && there === wornThere) return true;
    if (here === wornThere && there === wornHere) return false;
  }
  // Otherwise the first slot keeps the kind that sorts first.
  if (here > there) return true;
  const reversible =
    (optionsFor.get(pair) ?? []).some((o) => kindOf(o) === here) &&
    (optionsFor.get(slot) ?? []).some((o) => kindOf(o) === there);
  return !reversible;
}

/**
 * Everything a loadout changes against what is worn now.
 *
 * Compared by kind: the item, its enchant and its suffix. The same ring with a different
 * enchant is a swap, and a second copy of exactly what is worn is not.
 */
export function swapsIn(character: Character, loadout: Loadout): Array<{ slot: Slot; item: ItemRef | null }> {
  const out: Array<{ slot: Slot; item: ItemRef | null }> = [];
  for (const [slot, item] of Object.entries(loadout) as Array<[Slot, ItemRef | null]>) {
    const worn = equippedIn(character, slot) ?? null;
    if (kindOf(worn) === kindOf(item)) continue;
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

export interface EstimateInputs {
  /** Loadouts that will be run, already capped. */
  combinations: number;
  /** Iterations each loadout gets in the ranking pass. */
  first: number;
  /** Iterations for what is worn and each finalist in the second pass. */
  final: number;
  /** Milliseconds one worker spends on one iteration. */
  msPerIteration: number;
  /** How many workers run at once. */
  workers: number;
}

/**
 * Roughly how long a run would take, from the rate the last one managed.
 *
 * It is shown before anything starts rather than after, because the only thing
 * worse than a slow answer is a slow answer nobody agreed to wait for.
 */
export function estimate(inputs: EstimateInputs): TopGearEstimate {
  const { combinations, first, final, msPerIteration, workers } = inputs;
  // Both passes, as run: what is worn plus every loadout, then what is worn plus the finalists.
  const iterations = (1 + combinations) * first + (1 + Math.min(FINALISTS, combinations)) * final;
  const work = iterations * Math.max(0.01, msPerIteration);
  return { combinations, seconds: work / Math.max(1, workers) / 1000 };
}

/** Whether a loadout would put a two-hander on with something in the off hand. */
export function valid(character: Character, loadout: Loadout): boolean {
  // An empty hand in the loadout is a decision, not a gap to fill from what is worn.
  const main = 'mainhand' in loadout ? loadout.mainhand : equippedIn(character, 'mainhand');
  const off = 'offhand' in loadout ? loadout.offhand : equippedIn(character, 'offhand');
  if (main && isTwoHanded(main.equipLoc) && off) return false;
  return true;
}
