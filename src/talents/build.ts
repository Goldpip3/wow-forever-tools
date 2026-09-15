import type { ClassTalents, Talent, Tree } from './types';

export const MAX_POINTS = 51;
export const MIN_LEVEL = 10;
export const MAX_LEVEL = 60;
export const ROW_STEP = 5;
export const MAX_ROW = 7;
export const MAX_COL = 4;

/** Points available at a level: 1 at level 10, 51 at level 60. */
export function pointsForLevel(level: number): number {
  return Math.max(0, Math.min(MAX_POINTS, level - 9));
}

/** Lowest level that can afford this many points. */
export function levelForPoints(points: number): number {
  return Math.max(MIN_LEVEL, Math.min(MAX_LEVEL, points + 9));
}

/** Ranks spent, one array per tree, in that tree's own talent array order. */
export type Ranks = number[][];

export interface BuildState {
  classKey: string;
  level: number;
  ranks: Ranks;
}

export function emptyRanks(cls: ClassTalents): Ranks {
  return cls.trees.map((tree) => tree.talents.map(() => 0));
}

export function createBuild(classKey: string, cls: ClassTalents, level = MAX_LEVEL): BuildState {
  return { classKey, level, ranks: emptyRanks(cls) };
}

export function treeTotal(ranks: Ranks, treeIdx: number): number {
  return (ranks[treeIdx] ?? []).reduce((a, b) => a + b, 0);
}

export function totalSpent(ranks: Ranks): number {
  return ranks.reduce((sum, tree) => sum + tree.reduce((a, b) => a + b, 0), 0);
}

export function pointsLeft(build: BuildState): number {
  return pointsForLevel(build.level) - totalSpent(build.ranks);
}

/** Points in this tree needed before a row opens: row 1 free, row 2 at 5, row 3 at 10. */
export function rowRequirement(row: number): number {
  return (row - 1) * ROW_STEP;
}

/** Points needed in this tree for the next locked row, or null when every row is open. */
export function nextRowAt(cls: ClassTalents, ranks: Ranks, treeIdx: number): number | null {
  const spent = treeTotal(ranks, treeIdx);
  const rows = new Set((cls.trees[treeIdx]?.talents ?? []).map((t) => t.row));
  for (const row of [...rows].sort((a, b) => a - b)) {
    if (spent < rowRequirement(row)) return rowRequirement(row);
  }
  return null;
}

function indexByName(tree: Tree): Map<string, number> {
  const map = new Map<string, number>();
  tree.talents.forEach((t, i) => map.set(t.name, i));
  return map;
}

/** Talents in this tree that name talentName as their prerequisite. */
function dependents(tree: Tree, talentName: string): number[] {
  const out: number[] = [];
  tree.talents.forEach((t, i) => {
    if (t.req === talentName) out.push(i);
  });
  return out;
}

export interface RuleResult {
  ok: boolean;
  reason?: string;
}

/** Whether the prerequisite for a talent is satisfied at the given ranks. */
export function prereqMet(tree: Tree, ranks: number[], talentIdx: number): RuleResult {
  const talent = tree.talents[talentIdx];
  if (!talent?.req) return { ok: true };
  const reqIdx = indexByName(tree).get(talent.req);
  if (reqIdx === undefined) return { ok: true };
  const reqTalent = tree.talents[reqIdx]!;
  if ((ranks[reqIdx] ?? 0) < reqTalent.max) {
    return { ok: false, reason: 'Requires ' + reqTalent.max + ' points in ' + reqTalent.name };
  }
  return { ok: true };
}

export function canAdd(
  cls: ClassTalents,
  build: BuildState,
  treeIdx: number,
  talentIdx: number,
): RuleResult {
  const tree = cls.trees[treeIdx];
  const talent = tree?.talents[talentIdx];
  if (!tree || !talent) return { ok: false, reason: 'Unknown talent' };

  const ranks = build.ranks[treeIdx] ?? [];
  const current = ranks[talentIdx] ?? 0;
  if (current >= talent.max) return { ok: false, reason: 'Already at maximum rank' };

  if (pointsLeft(build) <= 0) {
    return { ok: false, reason: 'All points are spent. Take one back first.' };
  }

  const spentInTree = treeTotal(build.ranks, treeIdx);
  const needed = rowRequirement(talent.row);
  if (spentInTree < needed) {
    return { ok: false, reason: 'Requires ' + needed + ' points in ' + tree.name };
  }

  return prereqMet(tree, ranks, talentIdx);
}

export function canRemove(
  cls: ClassTalents,
  build: BuildState,
  treeIdx: number,
  talentIdx: number,
): RuleResult {
  const tree = cls.trees[treeIdx];
  const talent = tree?.talents[talentIdx];
  if (!tree || !talent) return { ok: false, reason: 'Unknown talent' };

  const ranks = build.ranks[treeIdx] ?? [];
  const current = ranks[talentIdx] ?? 0;
  if (current <= 0) return { ok: false, reason: 'No points to remove' };

  // Removing the last point of a maxed prerequisite would orphan whatever depends on it.
  if (current === talent.max) {
    for (const depIdx of dependents(tree, talent.name)) {
      if ((ranks[depIdx] ?? 0) > 0) {
        const depName = tree.talents[depIdx]!.name;
        return { ok: false, reason: depName + ' needs ' + talent.name + ' maxed. Unlearn it first.' };
      }
    }
  }

  // Dropping below a row threshold would strand points spent in rows above.
  const after = treeTotal(build.ranks, treeIdx) - 1;
  for (let i = 0; i < tree.talents.length; i += 1) {
    if (i === talentIdx) continue;
    const t = tree.talents[i]!;
    if ((ranks[i] ?? 0) > 0 && after < rowRequirement(t.row)) {
      return { ok: false, reason: t.name + ' needs ' + rowRequirement(t.row) + ' points in ' + tree.name };
    }
  }

  return { ok: true };
}

export function addPoint(
  cls: ClassTalents,
  build: BuildState,
  treeIdx: number,
  talentIdx: number,
): RuleResult {
  const check = canAdd(cls, build, treeIdx, talentIdx);
  if (!check.ok) return check;
  build.ranks[treeIdx]![talentIdx] = (build.ranks[treeIdx]![talentIdx] ?? 0) + 1;
  return { ok: true };
}

export function removePoint(
  cls: ClassTalents,
  build: BuildState,
  treeIdx: number,
  talentIdx: number,
): RuleResult {
  const check = canRemove(cls, build, treeIdx, talentIdx);
  if (!check.ok) return check;
  build.ranks[treeIdx]![talentIdx] = (build.ranks[treeIdx]![talentIdx] ?? 0) - 1;
  return { ok: true };
}

export function resetTree(build: BuildState, treeIdx: number): void {
  const tree = build.ranks[treeIdx];
  if (tree) build.ranks[treeIdx] = tree.map(() => 0);
}

export function resetAll(build: BuildState): void {
  build.ranks = build.ranks.map((tree) => tree.map(() => 0));
}

/** Lowest level this build could exist at. */
export function levelNeeded(build: BuildState): number {
  return levelForPoints(totalSpent(build.ranks));
}

export type CellState = 'locked' | 'open' | 'learning' | 'maxed';

export function cellState(
  cls: ClassTalents,
  build: BuildState,
  treeIdx: number,
  talentIdx: number,
): CellState {
  const tree = cls.trees[treeIdx]!;
  const talent = tree.talents[talentIdx]!;
  const rank = build.ranks[treeIdx]?.[talentIdx] ?? 0;
  if (rank >= talent.max) return 'maxed';
  if (rank > 0) return 'learning';
  const rowOpen = treeTotal(build.ranks, treeIdx) >= rowRequirement(talent.row);
  const prereq = prereqMet(tree, build.ranks[treeIdx] ?? [], talentIdx);
  return rowOpen && prereq.ok ? 'open' : 'locked';
}

/** The spec a build reads as: the tree with the most points, or null when nothing is spent. */
export function primaryTree(
  cls: ClassTalents,
  build: BuildState,
): { index: number; tree: Tree; points: number } | null {
  let best = -1;
  let bestPoints = 0;
  build.ranks.forEach((_, i) => {
    const pts = treeTotal(build.ranks, i);
    if (pts > bestPoints) {
      bestPoints = pts;
      best = i;
    }
  });
  if (best < 0) return null;
  return { index: best, tree: cls.trees[best]!, points: bestPoints };
}

const NUMBER = /\d+(?:\.\d+)?/g;

/**
 * Scale the numbers a talent's text carries from one rank to another.
 *
 * `scaleIdx` lists which numbers in the string grow with rank, counted in the order they
 * appear, so "a 33% chance to return 20% of the Mana cost" with `[0, 1]` scales both and
 * "lowers movement speed by 15% for 1.5 sec" with `[0]` leaves the duration alone.
 *
 * The result is an estimate and is always labelled as one. Checked against the thirteen
 * talents whose data happens to carry two read ranks: nine come out exactly right and
 * three land within Blizzard's own rounding. Improved Blizzard is the one that does not,
 * because its real progression is 15/30/40 rather than a straight multiple.
 */
function scaleNumbers(text: string, idx: number[], factor: number): string {
  let seen = 0;
  return text.replace(NUMBER, (match) => {
    if (!idx.includes(seen++)) return match;
    const scaled = parseFloat(match) * factor;
    // A whole number stays whole; one that was written with a decimal keeps one.
    return match.includes('.')
      ? String(Math.round(scaled * 10) / 10)
      : String(Math.round(scaled));
  });
}

/** Rank text for a talent, interpolating when only some ranks were read off the demo. */
export function rankText(talent: Talent, rank: number): { text: string; estimated: boolean } {
  const wanted = Math.max(1, Math.min(talent.max, rank));
  if (Array.isArray(talent.desc)) {
    const text = talent.desc[wanted - 1] ?? talent.desc[0] ?? '';
    return { text, estimated: talent.complete === false };
  }
  const map = talent.desc ?? {};
  const exact = map[String(wanted)];
  if (exact) return { text: exact, estimated: false };

  const known = Object.keys(map)
    .map(Number)
    .filter((n) => !Number.isNaN(n) && n > 0)
    .sort((a, b) => a - b);
  if (!known.length) return { text: '', estimated: true };

  // Scale from whichever read rank is closest, so the guess travels the shortest distance.
  const from = known.reduce((best, n) =>
    Math.abs(n - wanted) < Math.abs(best - wanted) ? n : best,
  );
  const base = map[String(from)] ?? '';
  if (!talent.scaleIdx?.length || from === wanted) return { text: base, estimated: true };
  return { text: scaleNumbers(base, talent.scaleIdx, wanted / from), estimated: true };
}
