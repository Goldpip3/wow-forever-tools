/**
 * Where an item database would plug in.
 *
 * Today the site knows exactly what the addon scanned off your tooltips and
 * nothing more, which is why it can only rank what you already own. A database
 * of every item in the game would let it answer the other question, the one
 * about what to go and get, and this is the seam that change would go through:
 * everything downstream reads ItemRef, so filling one in from a database rather
 * than a tooltip changes nothing else.
 *
 * It is a stub on purpose. Shipping a guessed item list for an expansion whose
 * loot tables nobody has seen would be worse than shipping nothing.
 */

import type { ItemRef } from './export-format';

export interface ItemDatabase {
  /** Everything known about an item id. */
  get(id: number): Partial<ItemRef> | undefined;
}

/**
 * Fills in what the scan missed, without ever overwriting what it found. The
 * tooltip is the more trustworthy of the two: it already has the enchant and
 * the random suffix on it.
 */
export function resolveItem(item: ItemRef, db?: ItemDatabase): ItemRef {
  const known = db?.get(item.id);
  if (!known) return item;

  return {
    ...known,
    ...item,
    stats: { ...known.stats, ...item.stats },
  };
}

/** Whether a database is wired up at all, for the UI to say so. */
export function hasItemDatabase(db?: ItemDatabase): boolean {
  return !!db;
}
