import type { School, StatKey } from '../export-format';
import type { ActiveEffect } from './effects';
import { STAT_KEYS } from '../export-format';

export type { School, StatKey };

/** Which hand a swing or a strike comes from. */
export type Hand = 'main' | 'off' | 'ranged';

/**
 * A weapon as the simulator needs it: what it rolls for, how often it swings,
 * and how well the character handles it.
 */
export interface WeaponStats {
  min: number;
  max: number;
  /** Seconds between swings, before haste. */
  speed: number;
  /** Skill with this weapon, which is what the attack table reads. */
  skill: number;
  /** Subtype as the game reports it, e.g. 'One-Handed Axes'. */
  type: string;
  /** True for anything that fills both hands, which halves nothing and doubles the roll. */
  twoHanded: boolean;
}

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
  /** What is in each hand. Empty for a caster that never swings. */
  weapons: Partial<Record<Hand, WeaponStats>>;
}

export function emptyStatSheet(level = 60): StatSheet {
  const sheet = { level, mana: 0, weaponSkill: level * 5, weapons: {} } as StatSheet;
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
  /**
   * How many things are standing there. One is a raid boss on its own; anything
   * more only reaches abilities that say they hit more than one.
   */
  targets?: number;
  /** Buff ids from data/buffs.ts. */
  buffs: string[];
  debuffs: string[];
  consumables: string[];
  /**
   * Damage arriving per second, which a tank turns into rage. Zero for anyone
   * standing behind the boss, which is why it defaults to nothing.
   */
  incoming?: { damagePerSecond: number };
  /** Which of the spec's stances the character fights in. */
  stance?: string;
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
    /** Never run short of rage or energy, the way infiniteMana works for a caster. */
    infiniteResource?: boolean;
    /** Replace the rolled bands of the melee table, for checking one by hand. */
    forceMeleeTable?: Partial<AttackBands>;
  };
}

/** The bands of a melee swing, in percentage points. Mirrors sim/tables.ts. */
export interface AttackBands {
  miss: number;
  dodge: number;
  parry: number;
  glance: number;
  block: number;
  crit: number;
  hit: number;
}

export interface SimConfig {
  specId: number;
  stats: StatSheet;
  /** Talent name to rank, as the importer read it. */
  talents: Record<string, number>;
  fight: FightConfig;
  /** Which of the spec's rotations to run. */
  rotation?: string;
  /**
   * Trinkets and weapon procs, already read off the worn items. The engine is
   * handed effects rather than items, so it never needs to know what an item is.
   */
  effects?: ActiveEffect[];
  /** Effect lines on the worn items that nothing could be made of. */
  effectNotes?: string[];
}

/**
 * The boss as the fight sees it: how much armor is left on it after the debuffs
 * and how much more of each school it takes. Worked out once per run, because
 * nothing in the model changes it mid-fight yet.
 */
export interface TargetState {
  level: number;
  armor: number;
  resistance: number;
  /** A multiplier per school, one being no change. */
  damageTaken: Partial<Record<School, number>>;
}

/* ------------------------------------------------------------------ results */

export interface AbilityStats {
  id: string;
  name: string;
  casts: number;
  hits: number;
  crits: number;
  misses: number;
  /** Avoided some other way: dodged, parried or blocked away entirely. */
  avoided: number;
  /** Swings that only grazed, which happens to anything you did not aim. */
  glances: number;
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
    /** Rage earned over the fight, for anyone who earns it. */
    rageGained: number;
    energySpent: number;
    /** Seconds spent wanting to act with nothing in the bar to pay for it. */
    starvedFor: number;
  };
  /**
   * Where the runs landed, in forty buckets. It is the shape of the spread
   * rather than one number for it, which is what shows a rotation that usually
   * goes well and occasionally falls apart.
   */
  histogram: { min: number; max: number; bins: number[] };
  /** Seconds each aura was up in an average run, for the ones worth naming. */
  auras: Array<{ id: string; name: string; uptime: number }>;
  /**
   * The run that came out closest to the middle. Its seed is kept rather than
   * its events, because the same seed gives the same fight, so a record of it
   * can be made again whenever one is wanted.
   */
  representative: { index: number; seed: number; dps: number };
  /** Anything the reader should know before trusting the number. */
  notes: string[];
}

/* ------------------------------------------------------------------ damage */

export type Outcome = 'miss' | 'dodge' | 'parry' | 'glance' | 'block' | 'crit' | 'hit';

/** Outcomes where the swing never connected at all. */
export const AVOIDED: ReadonlySet<Outcome> = new Set<Outcome>(['miss', 'dodge', 'parry']);

export interface DamageEvent {
  spellId: string;
  school: School;
  outcome: Outcome;
  amount: number;
  time: number;
}
