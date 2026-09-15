/**
 * What a spell is, and what talents are allowed to do to it.
 *
 * A spec module declares its spells flat, then declares a hook per talent that
 * edits a mods object. Nothing in the engine knows what Piercing Ice is: the
 * engine only knows that some talent added twelve per cent to frost damage.
 */

import type { ForeverStatus } from '../../raid/types';
import type { School } from '../export-format';

export interface DotDef {
  ticks: number;
  /** Seconds between ticks. */
  interval: number;
  /** Damage over the whole duration, before spell power. */
  damage: number;
  /** Share of spell power the whole duration gets. */
  coefficient: number;
}

export interface ChannelDef {
  ticks: number;
  interval: number;
}

export interface SpellDef {
  id: string;
  name: string;
  icon?: string;
  school: School;
  /** Seconds. Zero is instant. */
  castTime: number;
  /** Seconds. Defaults to the global cooldown, zero for anything off it. */
  gcd?: number;
  /** Mana. */
  cost: number;
  /** Seconds, if it has one of its own. */
  cooldown?: number;
  minDamage: number;
  maxDamage: number;
  /** Share of spell power the spell picks up. */
  coefficient: number;
  /** Half as much again by default. */
  critMultiplier?: number;
  dot?: DotDef;
  channel?: ChannelDef;
  /** Flat mana handed back when it finishes, for a gem or a potion. */
  restoresMana?: number;
  /** Mana handed back as a share of the maximum, for Evocation and its like. */
  restoresManaPct?: number;
  /**
   * Skip this spell when the character has more than this share of its mana.
   * Keeps a rotation from opening with a potion.
   */
  useBelowMana?: number;
  forever: { status: ForeverStatus; note?: string };
}

/**
 * What talents changed. Multipliers start at one and flat bonuses at zero, so a
 * hook can multiply or add without caring what ran before it.
 */
export interface SpellMods {
  /** Seconds off a cast, by spell id. */
  castTime: Record<string, number>;
  /** Damage multiplier, by spell id. */
  damage: Record<string, number>;
  /** Mana cost multiplier, by spell id. */
  cost: Record<string, number>;
  /** Damage multiplier for a whole school. */
  schoolDamage: Partial<Record<School, number>>;
  /** Extra percentage points of spell hit. */
  spellHit: number;
  /** Extra percentage points of spell crit, by school. */
  spellCrit: Partial<Record<School, number>>;
  /** Extra crit damage on top of the base half again, as a fraction of the hit. */
  critBonus: Partial<Record<School, number>>;
  /** Anything that does not fit above; the spec module reads these itself. */
  flags: Record<string, number>;
}

export function emptyMods(): SpellMods {
  return {
    castTime: {},
    damage: {},
    cost: {},
    schoolDamage: {},
    spellHit: 0,
    spellCrit: {},
    critBonus: {},
    flags: {},
  };
}

export function addCastTime(mods: SpellMods, spellId: string, seconds: number): void {
  mods.castTime[spellId] = (mods.castTime[spellId] ?? 0) + seconds;
}

export function multiplyDamage(mods: SpellMods, spellId: string, factor: number): void {
  mods.damage[spellId] = (mods.damage[spellId] ?? 1) * factor;
}

export function multiplyCost(mods: SpellMods, spellId: string, factor: number): void {
  mods.cost[spellId] = (mods.cost[spellId] ?? 1) * factor;
}

export function multiplySchool(mods: SpellMods, school: School, factor: number): void {
  mods.schoolDamage[school] = (mods.schoolDamage[school] ?? 1) * factor;
}

export function addSpellCrit(mods: SpellMods, school: School, points: number): void {
  mods.spellCrit[school] = (mods.spellCrit[school] ?? 0) + points;
}

export function addCritBonus(mods: SpellMods, school: School, fraction: number): void {
  mods.critBonus[school] = (mods.critBonus[school] ?? 0) + fraction;
}

/** A talent hook: given its rank, edit the mods. */
export type TalentHook = (rank: number, mods: SpellMods) => void;

/** Runs every hook whose talent the character actually has. */
export function applyTalents(
  hooks: Record<string, TalentHook>,
  ranks: Record<string, number>,
): SpellMods {
  const mods = emptyMods();
  for (const [name, hook] of Object.entries(hooks)) {
    const rank = ranks[name] ?? 0;
    if (rank > 0) hook(rank, mods);
  }
  return mods;
}
