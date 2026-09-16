/**
 * Which item can go where, and which of the ones you own are worth a look.
 *
 * Scoring arrives with the stat weights; this half is only about slots, pairs
 * and the rules that stop the list offering something you cannot actually wear
 * alongside what is already on.
 */

import type { ItemRef, Slot, StatKey } from './export-format';
import { SLOTS, isTwoHanded, slotsFor } from './export-format';
import type { WeightTable } from './weights';
import type { Character } from './types';

/** The other half of a paired slot: two rings, two trinkets, two weapon hands. */
export function pairedSlot(slot: Slot): Slot | null {
  switch (slot) {
    case 'finger1': return 'finger2';
    case 'finger2': return 'finger1';
    case 'trinket1': return 'trinket2';
    case 'trinket2': return 'trinket1';
    case 'mainhand': return 'offhand';
    case 'offhand': return 'mainhand';
    default: return null;
  }
}

export function equippedIn(character: Character, slot: Slot): ItemRef | undefined {
  return character.source.equipped[slot];
}

/** A stable key for one item, so two copies of the same ring collapse into one row. */
export function itemKey(item: ItemRef): string {
  return [item.id, item.enchant ?? 0, item.suffix ?? 0].join(':');
}

/**
 * Whether two refs are the one physical item. Two copies of a ring share a key and are
 * still two rings; one ring seen from two places is one.
 */
export function sameItem(a: ItemRef | null | undefined, b: ItemRef | null | undefined): boolean {
  if (!a || !b) return false;
  if (a.location.where !== b.location.where) return false;
  if (a.location.where === 'equipped') return a.location.slot === b.location.slot;
  // Nothing from a drop list is owned, so there is no copy of it to tell apart.
  if (a.location.where === 'database') return itemKey(a) === itemKey(b);
  // An export that gave no bag position cannot say where each copy sits, so only the very
  // same record counts as the same item. Treating every unplaced item as one would forbid
  // wearing any two of them together.
  if (a.location.index === undefined || b.location.index === undefined) return a === b;
  return a.location.bag === b.location.bag && a.location.index === b.location.index;
}

/**
 * Everything owned that could go in this slot, other than what is in it.
 *
 * The other hand matters here. The ring on your other finger is one ring, not
 * two, so moving it across is not an upgrade and never appears. A second copy
 * of a ring marked unique does not appear either, because the game would not
 * let you wear both.
 *
 * Two identical items in your bags collapse into one row.
 */
export function candidatesFor(character: Character, slot: Slot): ItemRef[] {
  const worn = equippedIn(character, slot);
  const pair = pairedSlot(slot);
  const pairWorn = pair ? equippedIn(character, pair) : undefined;
  const blockedUniqueId = pairWorn?.unique ? pairWorn.id : null;

  const seen = new Set<string>();
  const out: ItemRef[] = [];

  for (const item of character.owned) {
    if (!slotsFor(item.equipLoc).includes(slot)) continue;
    if (sameItem(item, worn)) continue;
    // Another copy of exactly what is in the slot changes nothing.
    if (worn && itemKey(item) === itemKey(worn)) continue;
    // The item on the other hand is that same item, not a second one.
    if (pairWorn && sameItem(item, pairWorn)) continue;
    if (blockedUniqueId !== null && item.id === blockedUniqueId) continue;
    // A two-hander cannot sit in the off hand, and the slot table already says so.
    if (slot === 'offhand' && isTwoHanded(item.equipLoc)) continue;
    const key = itemKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }

  return out;
}

/** Slots worth showing for this character, keeping empty ones that matter. */
export function slotsInUse(character: Character): Slot[] {
  return SLOTS.filter((slot) => {
    if (equippedIn(character, slot)) return true;
    return candidatesFor(character, slot).length > 0;
  });
}

/* ------------------------------------------------------------------ scoring */

/**
 * An item's score is its stats read through the weight table. The units are
 * damage per second, because the weights came out of the simulator that way, so
 * a difference of twelve between two helmets means twelve damage per second.
 *
 * Nothing here knows about use effects or procs. A trinket that only does
 * something when you press it scores on its plain stats alone, which is why the
 * page says so next to anything carrying one.
 */
export function itemScore(item: ItemRef, weights: WeightTable): number {
  let total = 0;
  for (const [key, value] of Object.entries(item.stats) as Array<[StatKey, number]>) {
    const weight = weights[key];
    if (weight) total += weight * value;
  }
  return total;
}

export interface ScoredItem {
  item: ItemRef;
  score: number;
  /** Against whatever is in the slot now. */
  gain: number;
}

export interface SlotRanking {
  slot: Slot;
  equipped?: ScoredItem;
  /** Everything else that fits, best first. */
  candidates: ScoredItem[];
  /** The best of them, when it beats what is on. */
  best?: ScoredItem;
}

export function rankSlot(character: Character, slot: Slot, weights: WeightTable): SlotRanking {
  const worn = equippedIn(character, slot);
  const wornScore = worn ? itemScore(worn, weights) : 0;

  const candidates = candidatesFor(character, slot)
    .map((item) => {
      const score = itemScore(item, weights);
      return { item, score, gain: score - wornScore };
    })
    .sort((a, b) => b.score - a.score);

  const ranking: SlotRanking = { slot, candidates };
  if (worn) ranking.equipped = { item: worn, score: wornScore, gain: 0 };
  const top = candidates[0];
  if (top && top.gain > 0) ranking.best = top;
  return ranking;
}

/** Every slot, ranked. */
export function rankAll(character: Character, weights: WeightTable): SlotRanking[] {
  return slotsInUse(character).map((slot) => rankSlot(character, slot, weights));
}

export interface Upgrade {
  slot: Slot;
  from?: ItemRef;
  to: ItemRef;
  gain: number;
}

/**
 * The swaps worth making, biggest first.
 *
 * The weapons are the awkward case: a two-hander takes the off hand with it, so
 * a two-hander is only an upgrade if it beats the main hand and the off hand
 * added together.
 */
export function upgrades(character: Character, weights: WeightTable): Upgrade[] {
  const out: Upgrade[] = [];

  for (const ranking of rankAll(character, weights)) {
    if (ranking.slot === 'mainhand' || ranking.slot === 'offhand') continue;
    if (!ranking.best) continue;
    const upgrade: Upgrade = {
      slot: ranking.slot,
      to: ranking.best.item,
      gain: ranking.best.gain,
    };
    if (ranking.equipped) upgrade.from = ranking.equipped.item;
    out.push(upgrade);
  }

  const weapons = weaponChoice(character, weights);
  if (weapons.upgrade) out.push(weapons.upgrade);

  return out.sort((a, b) => b.gain - a.gain);
}

export interface WeaponChoice {
  /** The best one-handed pair, scored together. */
  oneHandScore: number;
  /** The best two-hander on its own. */
  twoHandScore: number;
  mainhand?: ItemRef;
  offhand?: ItemRef;
  twoHander?: ItemRef;
  /** Which way round is better, when one of them beats what is equipped. */
  upgrade?: Upgrade;
}

/**
 * Two hands or one and a shield. Scored as a pair, because picking the best
 * main hand and the best off hand separately would happily recommend a
 * two-hander alongside a held-in-off-hand tome.
 */
export function weaponChoice(character: Character, weights: WeightTable): WeaponChoice {
  const owned = character.owned;
  const wornMain = equippedIn(character, 'mainhand');
  const wornOff = equippedIn(character, 'offhand');
  const wornScore = (wornMain ? itemScore(wornMain, weights) : 0) + (wornOff ? itemScore(wornOff, weights) : 0);

  const fits = (item: ItemRef, slot: Slot) => slotsFor(item.equipLoc).includes(slot);

  const oneHanders = owned.filter((i) => fits(i, 'mainhand') && !isTwoHanded(i.equipLoc));
  const offHands = owned.filter((i) => fits(i, 'offhand') && !isTwoHanded(i.equipLoc));
  const twoHanders = owned.filter((i) => isTwoHanded(i.equipLoc));

  const best = (list: ItemRef[]): ScoredItem | undefined =>
    list
      .map((item) => ({ item, score: itemScore(item, weights), gain: 0 }))
      .sort((a, b) => b.score - a.score)[0];

  const bestMain = best(oneHanders);
  const bestOff = best(offHands.filter((i) => i !== bestMain?.item));
  const bestTwo = best(twoHanders);

  const oneHandScore = (bestMain?.score ?? 0) + (bestOff?.score ?? 0);
  const twoHandScore = bestTwo?.score ?? 0;

  const choice: WeaponChoice = { oneHandScore, twoHandScore };
  if (bestMain) choice.mainhand = bestMain.item;
  if (bestOff) choice.offhand = bestOff.item;
  if (bestTwo) choice.twoHander = bestTwo.item;

  const takeTwoHander = twoHandScore > oneHandScore;
  const bestScore = Math.max(oneHandScore, twoHandScore);
  const gain = bestScore - wornScore;

  if (gain > 0) {
    const to = takeTwoHander ? bestTwo?.item : bestMain?.item;
    if (to && !(wornMain && to.id === wornMain.id && !takeTwoHander)) {
      const upgrade: Upgrade = { slot: 'mainhand', to, gain };
      if (wornMain) upgrade.from = wornMain;
      choice.upgrade = upgrade;
    }
  }

  return choice;
}

/** The best of everything owned, slot by slot, for a what-if total. */
export function bestLoadout(character: Character, weights: WeightTable): Partial<Record<Slot, ItemRef>> {
  const out: Partial<Record<Slot, ItemRef>> = {};

  for (const ranking of rankAll(character, weights)) {
    if (ranking.slot === 'mainhand' || ranking.slot === 'offhand') continue;
    const pick = ranking.best?.item ?? ranking.equipped?.item;
    if (pick) out[ranking.slot] = pick;
  }

  const weapons = weaponChoice(character, weights);
  if (weapons.twoHandScore > weapons.oneHandScore) {
    if (weapons.twoHander) out.mainhand = weapons.twoHander;
  } else {
    if (weapons.mainhand) out.mainhand = weapons.mainhand;
    if (weapons.offhand) out.offhand = weapons.offhand;
  }

  return out;
}
