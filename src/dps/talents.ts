/**
 * Turns the addon's talent tabs into the shapes the rest of the site already
 * speaks: a rank lookup for the simulator and a build code for the calculator.
 *
 * The addon cannot produce a build code itself. A code is one digit per talent
 * in the order the talent data file lists them, and the game client has no idea
 * what that order is, so it sends raw rows and the matching happens here.
 */

import type { ClassTalents } from '../talents/types';
import { CLASSES, type ClassId } from '../shared/classes';
import type { TalentTabExport } from './export-format';

function norm(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

/** Talent name to rank, for every tab. Ranks of zero are kept out. */
export function talentRanksFromExport(tabs: TalentTabExport[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const tab of tabs ?? []) {
    for (const entry of tab.list ?? []) {
      const rank = Math.max(0, Math.round(Number(entry.rank) || 0));
      if (rank > 0 && entry.name) out[entry.name] = rank;
    }
  }
  return out;
}

/**
 * Lines the export's tabs up with the class's trees. CLASSES lists specs in the
 * same order the talent data lists trees, so an index match is the fallback and
 * a name match wins when the client and the data agree on what a tree is called.
 */
function tabForTree(tabs: TalentTabExport[], treeName: string, treeIndex: number): TalentTabExport | undefined {
  const wanted = norm(treeName);
  const byName = tabs.find((tab) => norm(tab.tab) === wanted);
  if (byName) return byName;
  // Forever renames some trees, so fall back to a prefix match before the index.
  const byPrefix = tabs.find((tab) => {
    const name = norm(tab.tab);
    return name.length > 2 && (wanted.startsWith(name) || name.startsWith(wanted));
  });
  return byPrefix ?? tabs[treeIndex];
}

/**
 * The spec whose tab holds the most points. Ties go to the earlier tab, which
 * is the same rule the raid planner uses for a pasted build code.
 */
export function specIdFromTabs(classId: ClassId, tabs: TalentTabExport[]): number {
  const specs = CLASSES[classId]?.specs ?? [];
  let best = specs[0]?.id ?? 0;
  let bestPoints = -1;

  specs.forEach((spec, i) => {
    const tab = tabForTree(tabs ?? [], spec.name, i);
    const points = tab
      ? Number(tab.points) || (tab.list ?? []).reduce((sum, t) => sum + (Number(t.rank) || 0), 0)
      : 0;
    if (points > bestPoints) {
      bestPoints = points;
      best = spec.id;
    }
  });

  return best;
}

/**
 * Builds a talent code the calculator can open. Matches each talent by name
 * first and by its place in the grid second, so a renamed talent still lands as
 * long as it did not also move.
 */
export function buildCodeFromExport(
  classId: ClassId,
  tabs: TalentTabExport[],
  cls: ClassTalents,
  level = 60,
): string {
  const trees = cls.trees.map((tree, treeIndex) => {
    const tab = tabForTree(tabs ?? [], tree.name, treeIndex);
    const byName = new Map<string, number>();
    const byCell = new Map<string, number>();
    for (const entry of tab?.list ?? []) {
      const rank = Math.max(0, Math.round(Number(entry.rank) || 0));
      if (entry.name) byName.set(norm(entry.name), rank);
      byCell.set(entry.tier + 'x' + entry.column, rank);
    }

    return tree.talents
      .map((talent) => {
        const rank = byName.get(norm(talent.name)) ?? byCell.get(talent.row + 'x' + talent.col) ?? 0;
        return String(Math.min(9, Math.max(0, Math.min(talent.max, rank))));
      })
      .join('');
  });

  return classId + '/' + level + '/' + trees.join('-');
}
