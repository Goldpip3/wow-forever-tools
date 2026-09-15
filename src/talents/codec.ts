import type { ClassTalents } from './types';
import { MAX_LEVEL, MIN_LEVEL, emptyRanks, type BuildState, type Ranks } from './build';

/**
 * Build codes match talentsforever.com so their links can be pasted here and back:
 *   <class>/<level>/<tree1>-<tree2>-<tree3>
 * Each tree segment is one digit per talent, in that tree's talent array order.
 * Example: warrior/60/05305213030510201-000000000000000000-0000000000000000000
 */

export interface ParsedCode {
  classKey: string;
  level: number;
  /** One string per tree, already padded to the right length where possible. */
  trees: string[];
}

const CLASS_KEYS = [
  'warrior', 'paladin', 'hunter', 'rogue', 'priest',
  'shaman', 'mage', 'warlock', 'druid',
];

function titleCase(key: string): string {
  return key.charAt(0).toUpperCase() + key.slice(1);
}

/** 'warrior' -> 'Warrior', the key used inside the talent data file. */
export function dataKeyFor(classKey: string): string {
  return titleCase(classKey.toLowerCase());
}

/**
 * Accepts a bare hash ('warrior/60/053-000-000'), a full talentsforever URL, or
 * one of our own URLs. Returns null when nothing usable is present.
 */
export function parseCode(input: string): ParsedCode | null {
  let text = (input ?? '').trim();
  if (!text) return null;

  // Strip a full URL down to its path or hash.
  if (/^https?:\/\//i.test(text)) {
    try {
      const url = new URL(text);
      text = url.hash ? url.hash.slice(1) : url.pathname;
    } catch {
      return null;
    }
  }
  text = text.replace(/^[#/]+/, '').replace(/\/+$/, '');
  if (!text) return null;

  const parts = text.split('/').filter(Boolean);
  if (!parts.length) return null;

  const classKey = parts[0]!.toLowerCase();
  if (!CLASS_KEYS.includes(classKey)) return null;

  let level = MAX_LEVEL;
  let treePart = '';

  if (parts.length >= 3) {
    const parsed = Number(parts[1]);
    if (Number.isFinite(parsed)) level = parsed;
    treePart = parts[2]!;
  } else if (parts.length === 2) {
    // Either '<class>/<level>' or '<class>/<trees>'.
    const parsed = Number(parts[1]);
    if (Number.isFinite(parsed)) level = parsed;
    else treePart = parts[1]!;
  }

  level = Math.max(MIN_LEVEL, Math.min(MAX_LEVEL, Math.round(level)));
  const trees = treePart ? treePart.split('-') : [];
  return { classKey, level, trees };
}

/** Turns a parsed code into ranks, clamping each digit to that talent's max. */
export function ranksFromCode(cls: ClassTalents, parsed: ParsedCode): Ranks {
  const ranks = emptyRanks(cls);
  cls.trees.forEach((tree, treeIdx) => {
    const segment = parsed.trees[treeIdx] ?? '';
    tree.talents.forEach((talent, talentIdx) => {
      const char = segment.charAt(talentIdx);
      const value = char === '' ? 0 : Number.parseInt(char, 10);
      ranks[treeIdx]![talentIdx] = Number.isFinite(value)
        ? Math.max(0, Math.min(talent.max, value))
        : 0;
    });
  });
  return ranks;
}

export function decode(cls: ClassTalents, input: string): BuildState | null {
  const parsed = parseCode(input);
  if (!parsed) return null;
  return { classKey: parsed.classKey, level: parsed.level, ranks: ranksFromCode(cls, parsed) };
}

/** Just the tree digits, e.g. '05305213030510201-000...-000...'. */
export function encodeTrees(build: BuildState): string {
  return build.ranks.map((tree) => tree.map((r) => String(Math.min(9, Math.max(0, r)))).join('')).join('-');
}

/** The full code, e.g. 'warrior/60/053...-000...-000...'. */
export function encode(build: BuildState): string {
  return build.classKey + '/' + build.level + '/' + encodeTrees(build);
}

/** True when no points are spent, so the URL can stay short. */
export function isEmptyCode(build: BuildState): boolean {
  return build.ranks.every((tree) => tree.every((r) => r === 0));
}

export function hashFor(build: BuildState): string {
  return isEmptyCode(build) ? build.classKey + '/' + build.level + '/' : encode(build);
}
