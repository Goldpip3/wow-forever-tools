/**
 * What to go and get.
 *
 * The gear panel answers what to wear out of what you have. This answers the
 * other half: of everything that drops in a place, which pieces would actually
 * move your damage, and by how much. It is the same machinery as the gear
 * comparison with a different source of candidates, which is the whole reason
 * the item database was worth a seam rather than a rewrite.
 *
 * Nothing here works until a list exists. Until then the panel says so, which
 * is the honest state of a site for a game that has published no items.
 */

import { slotsFor, type ItemRef, type Slot } from './export-format';
import { canUse } from './proficiency';
import { toItemRef, type DbItem, type ItemDatabase } from './itemdb';
import { equippedIn, itemScore } from './gear';
import type { Character } from './types';
import type { WeightTable } from './weights';

export interface DropCandidate {
  item: ItemRef;
  slot: Slot;
  /** Where it comes from, for the heading it sits under. */
  zone: string;
  boss: string;
  /** What the linear score makes of it, for the first cut. */
  score: number;
  /** The score of what it would replace. */
  wornScore: number;
}

export interface DropPlan {
  candidates: DropCandidate[];
  /** Zones the list knows about, for the picker. */
  zones: string[];
}

/**
 * Everything a place drops that this character could actually wear and that is
 * not obviously worse than what is on.
 *
 * The linear score does the cut, the same way it does for Top Gear: it is wrong
 * in the ways a straight line through a curve is wrong and right enough to keep
 * a cloth hat out of a warrior's list.
 */
export function planDrops(
  character: Character,
  db: ItemDatabase,
  weights: WeightTable,
  zones?: string[],
): DropPlan {
  const wanted = zones?.length ? new Set(zones) : null;
  const candidates: DropCandidate[] = [];
  const owned = new Set<number>();

  for (const item of character.owned) owned.add(item.id);

  const grouped = db.bySource();
  for (const [zone, bosses] of grouped) {
    if (wanted && !wanted.has(zone)) continue;

    for (const [boss, items] of bosses) {
      for (const dbItem of items) {
        // Something already in your bags is the gear panel's business.
        if (owned.has(dbItem.id)) continue;
        if (!fitsClass(character, dbItem)) continue;

        const item = toItemRef(dbItem);
        if (!canUse(character.classId, item).usable) continue;

        for (const slot of slotsFor(item.equipLoc)) {
          const worn = equippedIn(character, slot);
          const wornScore = worn ? itemScore(worn, weights) : 0;
          const score = itemScore(item, weights);

          // Far enough below what is on that simulating it would only confirm
          // what the score already said.
          if (worn && score < wornScore * 0.6) continue;

          candidates.push({ item, slot, zone, boss, score, wornScore });
          // A ring goes in either finger, and trying both would double the work
          // to answer the same question.
          break;
        }
      }
    }
  }

  return {
    candidates: candidates.sort((a, b) => (b.score - b.wornScore) - (a.score - a.wornScore)),
    zones: [...grouped.keys()].sort(),
  };
}

function fitsClass(character: Character, item: DbItem): boolean {
  if (!item.classes?.length) return true;
  return item.classes.includes(character.classId);
}

/** Drops grouped the way the panel shows them: a zone, then what drops it. */
export function groupDrops<T extends { zone: string; boss: string }>(
  rows: T[],
): Array<{ zone: string; bosses: Array<{ boss: string; rows: T[] }> }> {
  const zones = new Map<string, Map<string, T[]>>();

  for (const row of rows) {
    const bosses = zones.get(row.zone) ?? new Map<string, T[]>();
    const list = bosses.get(row.boss) ?? [];
    list.push(row);
    bosses.set(row.boss, list);
    zones.set(row.zone, bosses);
  }

  return [...zones.entries()].map(([zone, bosses]) => ({
    zone,
    bosses: [...bosses.entries()].map(([boss, list]) => ({ boss, rows: list })),
  }));
}
