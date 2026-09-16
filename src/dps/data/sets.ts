/**
 * What wearing several pieces of the same set is worth.
 *
 * The addon has always sent the set name off each item's tooltip, and nothing
 * has ever read it. This is where the numbers behind it go, and like the item
 * effects it ships empty: Forever has published no set bonuses, and a guessed
 * one would move every gear comparison that touches the set.
 *
 * The seam is what matters. When the real list exists it drops in here, or
 * arrives with the item database keyed by item id, which beats a tooltip name
 * because a name can be translated and an id cannot.
 */

import type { ForeverStatus } from '../../raid/types';
import type { ItemRef, StatBlock } from '../export-format';
import type { SpellMods } from '../sim/spells';

export interface SetBonusDef {
  /** The set name exactly as the tooltip prints it. */
  setName: string;
  /** How many pieces it takes. */
  pieces: number;
  /** Stats it adds, which the score can see. */
  stats?: StatBlock;
  /** Anything else it does, which only the simulation can see. */
  mods?: (mods: SpellMods) => void;
  forever: { status: ForeverStatus; note?: string };
}

/**
 * Empty on purpose. See the note at the top of the file: a set bonus invented
 * here would be invisible and wrong rather than missing and said so.
 */
export const SET_BONUSES: SetBonusDef[] = [];

/** How many pieces of each set a loadout is wearing. */
export function setCounts(items: Array<ItemRef | undefined>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    if (!item?.setName) continue;
    counts.set(item.setName, (counts.get(item.setName) ?? 0) + 1);
  }
  return counts;
}

/**
 * Every bonus a loadout has earned. A four-piece bonus and a two-piece bonus on
 * the same set both apply, which is how the game does it, but the same bonus
 * never applies twice however many extra pieces are on.
 */
export function bonusesFor(items: Array<ItemRef | undefined>): SetBonusDef[] {
  const counts = setCounts(items);
  return SET_BONUSES.filter((bonus) => (counts.get(bonus.setName) ?? 0) >= bonus.pieces);
}

/** The stats a loadout's set bonuses add, for the sheet and for the score. */
export function setStats(items: Array<ItemRef | undefined>): StatBlock {
  const total: StatBlock = {};
  for (const bonus of bonusesFor(items)) {
    for (const [key, value] of Object.entries(bonus.stats ?? {}) as Array<[keyof StatBlock, number]>) {
      total[key] = (total[key] ?? 0) + value;
    }
  }
  return total;
}

/** Sets a loadout is part way into, for a panel that wants to say so. */
export function setProgress(items: Array<ItemRef | undefined>): Array<{ name: string; worn: number }> {
  return [...setCounts(items).entries()]
    .map(([name, worn]) => ({ name, worn }))
    .sort((a, b) => b.worn - a.worn);
}
