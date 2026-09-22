/**
 * What the gear page will accept from outside: a link, a report, a saved preference.
 *
 * Everything read in arrives as `unknown`. JSON that parsed proves only that it was JSON,
 * so each thing is checked for the shape the page goes on to read before any of it is
 * allowed near the page's state. Validation says yes or no. Migration, which fills in what
 * an older valid object predates and pulls a number back inside what the panel allows,
 * happens afterwards and only to something that passed.
 */

import { CLASS_IDS } from '../shared/classes';
import { STAT_KEYS, type CharacterExport, type StatKey } from './export-format';
import type { RotationLine } from './sim/rotation';
import type { FightConfig } from './sim/types';
import type { BuffRole } from './data/buffs';
import type { WeightTable } from './weights';

/** Longest link text worth decompressing. A full report with a bank is well under this. */
export const MAX_LINK_CHARS = 200_000;
/** Longest JSON a decompressed link may turn into. */
export const MAX_JSON_CHARS = 2_000_000;

/* Hard limits for a number to be believable at all. The panel's own, tighter limits are
   applied by migration afterwards; these only turn away what cannot be a real fight. */
const MAX_DURATION = 36_000;
const MAX_ITERATIONS = 10_000_000;
const MAX_ROTATION_LINES = 100;

export const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const between = (v: unknown, min: number, max: number): boolean => finite(v) && v >= min && v <= max;
const text = (v: unknown, max = 200): v is string => typeof v === 'string' && v.length <= max;
const texts = (v: unknown, max = 200): boolean => Array.isArray(v) && v.length <= max && v.every((s) => text(s));
/** Absent is fine, since migration fills it in; present and the wrong kind is not. */
const optional = (v: unknown, ok: (v: unknown) => boolean): boolean => v === undefined || ok(v);
const records = (v: unknown, max: number, ok: (r: Record<string, unknown>) => boolean = () => true): boolean =>
  Array.isArray(v) && v.length <= max && v.every((r) => isRecord(r) && ok(r));

function isItem(v: unknown): boolean {
  return isRecord(v) && finite(v.id) && text(v.equipLoc, 64) && isRecord(v.stats)
    && Object.values(v.stats).every(finite) && optional(v.name, (n) => text(n, 300));
}

/** A character as a link or report carries it: the sheet, the talents and what is worn. */
export function isCharacterShape(v: unknown): v is CharacterExport {
  if (!isRecord(v)) return false;
  if (!text(v.classId, 20) || !(CLASS_IDS as readonly string[]).includes(v.classId.toLowerCase())) return false;
  if (!optional(v.level, (l) => between(l, 1, 100))) return false;
  if (!isRecord(v.stats) || !isRecord(v.equipped)) return false;
  if (!Object.values(v.equipped).every((item) => item === null || isItem(item))) return false;
  if (!records(v.talents, 5, (tab) => Array.isArray(tab.list))) return false;
  if (!optional(v.bags, (b) => Array.isArray(b) && b.length <= 1000 && b.every(isItem))) return false;
  if (!optional(v.bank, (b) => Array.isArray(b) && b.length <= 2000 && b.every(isItem))) return false;
  return true;
}

export function isFightShape(v: unknown): v is Partial<FightConfig> {
  if (!isRecord(v)) return false;
  if (!optional(v.duration, (d) => between(d, 1, MAX_DURATION))) return false;
  if (!optional(v.iterations, (n) => between(n, 1, MAX_ITERATIONS))) return false;
  if (!optional(v.seed, finite)) return false;
  if (!optional(v.targets, (n) => between(n, 1, 100))) return false;
  if (!optional(v.target, (t) => isRecord(t)
    && ['level', 'armor', 'resistance'].every((k) => optional(t[k], finite))
    && ['behind', 'canParry', 'canBlock'].every((k) => optional(t[k], (b) => typeof b === 'boolean')))) return false;
  for (const key of ['buffs', 'debuffs', 'consumables']) {
    if (!optional(v[key], (list) => texts(list, 200))) return false;
  }
  if (!optional(v.style, (s) => isRecord(s) && (
    s.kind === 'patchwerk'
    || (s.kind === 'movement' && between(s.every, 1, MAX_DURATION) && between(s.for, 0, MAX_DURATION))
    || (s.kind === 'cleave' && between(s.targets, 1, 100))
  ))) return false;
  if (!optional(v.incoming, (i) => isRecord(i) && between(i.damagePerSecond, 0, 1e7))) return false;
  if (!optional(v.stance, (s) => text(s, 40))) return false;
  return true;
}

export function isRotationLines(v: unknown): v is RotationLine[] {
  return records(v, MAX_ROTATION_LINES, (line) => text(line.spellId, 64) && optional(line.text, (t) => text(t, 500)));
}

/** Everything the results panel reads out of a saved run. */
function isSummaryShape(v: unknown): boolean {
  if (!isRecord(v)) return false;
  if (!['dps', 'dpsStdev', 'dpsStderr'].every((k) => finite(v[k]))) return false;
  if (!between(v.iterations, 1, MAX_ITERATIONS) || !between(v.duration, 1, MAX_DURATION)) return false;
  const numeric = (r: Record<string, unknown>, keys: string[]) => keys.every((k) => finite(r[k]));
  if (!records(v.abilities, 500, (a) => text(a.id, 100) && text(a.name, 200)
    && numeric(a, ['casts', 'hits', 'crits', 'misses', 'avoided', 'glances', 'damage', 'dps', 'share']))) return false;
  if (!records(v.auras, 500, (a) => text(a.name, 200) && finite(a.uptime))) return false;
  if (!isRecord(v.resources)
    || !numeric(v.resources, ['timeIdle', 'manaSpent', 'rageGained', 'energySpent', 'starvedFor'])
    || !optional(v.resources.oomAt, finite)) return false;
  if (!isRecord(v.histogram) || !Array.isArray(v.histogram.bins) || v.histogram.bins.length > 1000
    || !finite(v.histogram.min) || !finite(v.histogram.max) || v.histogram.max < v.histogram.min
    || !v.histogram.bins.every((n) => finite(n) && n >= 0)) return false;
  if (!isRecord(v.representative) || !finite(v.representative.seed)) return false;
  return true;
}

export function isReportShape(v: unknown): boolean {
  if (!isRecord(v)) return false;
  if (!isCharacterShape(v.character) || !isFightShape(v.fight)) return false;
  if (!optional(v.rotation, (r) => text(r, 64))) return false;
  if (!optional(v.engine, (e) => text(e, 64))) return false;
  if (!optional(v.apl, isRotationLines)) return false;
  return isSummaryShape(v.summary);
}

/** The gear page's own part of the saved preferences, as the page reads it. */
export interface DpsPrefs {
  fight?: Partial<FightConfig>;
  overrides?: Record<number, WeightTable>;
  rotation?: string;
  /** Which kind of character the ticked buffs were picked for. */
  role?: BuffRole;
  /** Rotations somebody wrote themselves, by spec id. */
  apl?: Record<number, RotationLine[]>;
}

/**
 * The gear page's preferences, keeping each part that is the right shape and dropping each
 * part that is not. One bad part, a fight whose buffs became a string say, costs only that
 * part rather than every preference.
 */
export function readDpsPrefs(raw: unknown): DpsPrefs {
  if (!isRecord(raw)) return {};
  const out: DpsPrefs = {};
  if (isFightShape(raw.fight)) out.fight = raw.fight;
  if (text(raw.rotation, 64)) out.rotation = raw.rotation;
  if (raw.role === 'caster' || raw.role === 'melee') out.role = raw.role;
  if (isRecord(raw.overrides)) {
    const overrides: Record<number, WeightTable> = {};
    for (const [spec, table] of Object.entries(raw.overrides)) {
      if (!/^\d+$/.test(spec) || !isRecord(table)) continue;
      const clean: WeightTable = {};
      for (const [stat, value] of Object.entries(table)) {
        if ((STAT_KEYS as readonly string[]).includes(stat) && between(value, -1e6, 1e6)) clean[stat as StatKey] = value as number;
      }
      overrides[Number(spec)] = clean;
    }
    out.overrides = overrides;
  }
  if (isRecord(raw.apl)) {
    const apl: Record<number, RotationLine[]> = {};
    for (const [spec, lines] of Object.entries(raw.apl)) {
      if (/^\d+$/.test(spec) && isRotationLines(lines)) apl[Number(spec)] = lines;
    }
    out.apl = apl;
  }
  return out;
}
