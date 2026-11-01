/**
 * Raid compare: two to four planner rosters side by side, for a night that runs more than one
 * group, such as two 10-mans in the same place.
 *
 * Planner mode only, and read-only. Each roster is the ordinary planner code, so the codec is
 * untouched and every entry opens back in the planner as it was.
 *
 *   #cmp=<name>:<code>,<name>:<code>
 *
 * Names are encodeURIComponent'd, which escapes ',' ':' '&' and '='. Codes come from lz-string's
 * URI alphabet (A-Z a-z 0-9 + - $), which has neither separator. So the split is safe, and the
 * hash can never read as a signed roster link: that needs `roster=` and `t=` parameters.
 */

import type { Coverage, EffectCoverage, Roster } from './types';
import { decodeRoster } from './codec';
import { playersInRaid } from './engine';
import { overview } from './suggestions';
import { campStates, type CampObject } from './camp';
import { ALL_SPECS, CLASSES, CLASS_LIST, type ClassId, type RoleBucket } from '../shared/classes';

export const MIN_COMPARE = 2;
export const MAX_COMPARE = 4;
export const MAX_COMPARE_NAME = 40;
export const COMPARE_PREFIX = 'cmp=';

export interface CompareEntry {
  name: string;
  code: string;
  roster: Roster;
}

export function encodeCompareHash(entries: ReadonlyArray<{ name: string; code: string }>): string {
  return (
    COMPARE_PREFIX +
    entries
      .slice(0, MAX_COMPARE)
      .map((e) => encodeURIComponent(e.name.trim().slice(0, MAX_COMPARE_NAME)) + ':' + e.code)
      .join(',')
  );
}

export function isCompareHash(hash: string): boolean {
  return hash.replace(/^#/, '').startsWith(COMPARE_PREFIX);
}

/** Every entry that decodes, up to four. An entry that does not is dropped, not fatal. */
export function parseCompareHash(hash: string): CompareEntry[] {
  const body = hash.replace(/^#/, '');
  if (!body.startsWith(COMPARE_PREFIX)) return [];
  const out: CompareEntry[] = [];
  for (const part of body.slice(COMPARE_PREFIX.length).split(',')) {
    if (out.length >= MAX_COMPARE) break;
    const colon = part.indexOf(':');
    const rawName = colon >= 0 ? part.slice(0, colon) : '';
    const code = colon >= 0 ? part.slice(colon + 1) : part;
    let name: string;
    try {
      name = decodeURIComponent(rawName).trim();
    } catch {
      continue;
    }
    if (name.length > MAX_COMPARE_NAME) continue;
    const roster = decodeRoster(code);
    if (!roster) continue;
    out.push({ name: name || 'Raid ' + (out.length + 1), code, roster });
  }
  return out;
}

/* ------------------------------------------------------------------- warnings */

export interface CompareWarning {
  level: 'warn' | 'info';
  title: string;
  detail: string;
}

/** Names createPlayer makes up, like "Fury Warrior". Two of those in two raids is not one person. */
const MADE_UP_NAMES = new Set(
  [
    ...ALL_SPECS.map((s) => (s.short + ' ' + CLASSES[s.classId].name).toLowerCase()),
    ...CLASS_LIST.map((c) => c.name.toLowerCase()),
  ],
);

function listNames(names: string[]): string {
  if (names.length <= 1) return names.join('');
  return names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
}

function plural(className: string, n: number): string {
  return n === 1 ? className : className + 's';
}

export function compareWarnings(entries: readonly CompareEntry[]): CompareWarning[] {
  const out: CompareWarning[] = [];

  // One person seated in two raids.
  const seen = new Map<string, { display: string; raids: string[] }>();
  for (const entry of entries) {
    const here = new Set<string>();
    for (const p of playersInRaid(entry.roster)) {
      const key = p.name.trim().toLowerCase();
      if (!key || MADE_UP_NAMES.has(key) || here.has(key)) continue;
      here.add(key);
      const row = seen.get(key) ?? { display: p.name.trim(), raids: [] };
      row.raids.push(entry.name);
      seen.set(key, row);
    }
  }
  for (const { display, raids } of seen.values()) {
    if (raids.length < 2) continue;
    out.push({
      level: 'warn',
      title: display + ' is in ' + listNames(raids),
      detail: 'One person cannot play in two raids at once. Take them out of all but one.',
    });
  }

  // A class one raid has none of while another has three or more.
  for (const cls of CLASS_LIST) {
    const counts = entries.map((e) => playersInRaid(e.roster).filter((p) => p.classId === cls.id).length);
    const most = Math.max(...counts);
    if (most < 3) continue;
    const empty = entries.filter((_, i) => counts[i] === 0).map((e) => e.name);
    if (!empty.length) continue;
    const rich = entries[counts.indexOf(most)]!.name;
    out.push({
      level: 'info',
      title: 'No ' + plural(cls.name, 2) + ' in ' + listNames(empty) + ', ' + most + ' in ' + rich,
      detail: 'Moving one over gives both raids what a ' + cls.name + ' brings.',
    });
  }

  return out;
}

/* -------------------------------------------------------------------- summary */

export interface RaidSummary {
  seated: number;
  size: number;
  classes: Array<{ classId: ClassId; n: number }>;
  roles: Record<RoleBucket, number>;
  /** Raid-wide buffs nobody here brings and no camp object covers. Party buffs depend on seating, so they stay in the planner. */
  missing: EffectCoverage[];
  camp: Array<{ object: CampObject; state: 'covers' | 'wasted' | 'other' }>;
  problems: number;
  warnings: number;
}

export function summarise(entry: CompareEntry, coverage: Coverage): RaidSummary {
  const players = playersInRaid(entry.roster);
  return {
    seated: players.length,
    size: entry.roster.size,
    classes: CLASS_LIST.map((c) => ({ classId: c.id, n: players.filter((p) => p.classId === c.id).length })),
    roles: overview(entry.roster).counts,
    missing: [...coverage.byEffect.values()]
      .filter(
        (c) =>
          c.effect.kind === 'buff' &&
          c.effect.scope === 'raid' &&
          !c.covered &&
          !c.effect.categories.every((cat) => cat.endsWith('-resist')),
      )
      .sort((a, b) => a.effect.name.localeCompare(b.effect.name)),
    camp: campStates(entry.roster, coverage),
    problems: coverage.warnings.filter((w) => w.level === 'error').length,
    warnings: coverage.warnings.filter((w) => w.level === 'warn').length,
  };
}
