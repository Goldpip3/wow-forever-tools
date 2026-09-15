import type { School, StatKey } from '../export-format';
import { STAT_KEYS } from '../export-format';

export type { School, StatKey };

/**
 * Every stat the simulator reads, already resolved: gear, buffs and the class's
 * own conversions are all folded in before a fight starts. Crit and hit are
 * percentages. Deriving a stat weight means copying one of these, adding a few
 * points to one key and running the fight again.
 */
export interface StatSheet extends Record<StatKey, number> {
  level: number;
  /** Maximum mana, which is not a gear stat but is needed all the same. */
  mana: number;
  /** Skill with the weapon in the main hand. */
  weaponSkill: number;
}

export function emptyStatSheet(level = 60): StatSheet {
  const sheet = { level, mana: 0, weaponSkill: level * 5 } as StatSheet;
  for (const key of STAT_KEYS) sheet[key] = 0;
  return sheet;
}

/** A copy with one stat moved, which is the whole of the stat weight method. */
export function withStat(sheet: StatSheet, key: StatKey, delta: number): StatSheet {
  return { ...sheet, [key]: (sheet[key] ?? 0) + delta };
}

/* ------------------------------------------------------------------- fights */

export interface TargetConfig {
  level: number;
  armor: number;
  resistance: number;
  /** Standing behind it, which takes parry and block off the table. */
  behind: boolean;
  canParry: boolean;
  canBlock: boolean;
}

export interface FightConfig {
  /** Seconds. */
  duration: number;
  iterations: number;
  seed: number;
  target: TargetConfig;
  /** Buff ids from data/buffs.ts. */
  buffs: string[];
  debuffs: string[];
  consumables: string[];
  /**
   * Test and debug hooks that pin an outcome, so a case can be checked by hand.
   * Nothing in the page sets these.
   */
  overrides?: {
    forceSpellHit?: number;
    forceSpellCrit?: number;
    infiniteMana?: boolean;
    /** Take the middle of every damage range instead of rolling it. */
    forceAverageDamage?: boolean;
  };
}

export interface SimConfig {
  specId: number;
  stats: StatSheet;
  /** Talent name to rank, as the importer read it. */
  talents: Record<string, number>;
  fight: FightConfig;
  /** Which of the spec's rotations to run. */
  rotation?: string;
}

/* ------------------------------------------------------------------ results */

export interface AbilityStats {
  id: string;
  name: string;
  casts: number;
  hits: number;
  crits: number;
  misses: number;
  damage: number;
  dps: number;
  /** Share of the total damage, as a fraction. */
  share: number;
}

export interface SimResult {
  dps: number;
  /** Spread across iterations, which is how much a single run would wander. */
  dpsStdev: number;
  /** How well the mean itself is pinned down. */
  dpsStderr: number;
  iterations: number;
  duration: number;
  abilities: AbilityStats[];
  resources: {
    /** Average second the character first ran dry, when it did. */
    oomAt?: number;
    /** Average seconds spent with nothing to do. */
    timeIdle: number;
    manaSpent: number;
  };
  /** Anything the reader should know before trusting the number. */
  notes: string[];
}

/* ------------------------------------------------------------------ damage */

export type Outcome = 'miss' | 'dodge' | 'parry' | 'glance' | 'block' | 'crit' | 'hit';

export interface DamageEvent {
  spellId: string;
  school: School;
  outcome: Outcome;
  amount: number;
  time: number;
}
