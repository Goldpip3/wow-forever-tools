/**
 * What an ability is, and what talents are allowed to do to it.
 *
 * A spec module declares its abilities flat, then declares a hook per talent
 * that edits a mods object. Nothing in the engine knows what Piercing Ice is:
 * the engine only knows that some talent added twelve per cent to frost damage.
 *
 * A spell and a weapon strike are the same declaration with different fields
 * filled in. Frostbolt sets castTime and coefficient; Bloodthirst sets kind to
 * melee and reads attack power instead.
 */

import type { ForeverStatus } from '../../raid/types';
import type { School } from '../export-format';
import type { Hand } from './types';

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

/** Which bar an ability is paid out of. */
export type ResourceKind = 'mana' | 'rage' | 'energy';

/** How an ability reads the weapon it is swung with. */
export interface WeaponAttack {
  hand: Hand;
  /** Share of the weapon's own damage, one being a full swing. */
  multiplier: number;
  /** Flat damage on top, which is what most warrior strikes are made of. */
  flat: number;
  /**
   * Use the weapon type's average speed rather than the weapon's own when
   * turning attack power into damage, so a slow weapon gains nothing free.
   */
  normalised: boolean;
}

export interface AbilityDef {
  id: string;
  name: string;
  icon?: string;
  school: School;
  /**
   * A spell rolls against the spell tables and scales on spell power; a melee
   * or ranged strike rolls against the attack table and scales on the weapon.
   * An item is a trinket or a potion, which does neither.
   */
  kind?: 'spell' | 'melee' | 'ranged' | 'item';
  /** Which bar it comes out of. Mana unless the ability says otherwise. */
  resource?: ResourceKind;
  /** Seconds. Zero is instant. */
  castTime: number;
  /** Seconds. Defaults to the global cooldown, zero for anything off it. */
  gcd?: number;
  /** Mana, rage or energy, depending on resource. */
  cost: number;
  /** Seconds, if it has one of its own. */
  cooldown?: number;
  minDamage: number;
  maxDamage: number;
  /** Share of spell power the spell picks up. */
  coefficient: number;
  /** Share of attack power the strike picks up, for anything that reads it. */
  apCoefficient?: number;
  /** How the weapon feeds this strike. */
  weapon?: WeaponAttack;
  /**
   * Waits for the next swing of that hand instead of landing now. Heroic Strike
   * and Cleave work this way: the rage is paid when the swing comes round.
   */
  onNextSwing?: boolean;
  /** Combo points earned or spent, for anyone who keeps them. */
  combo?: { generates?: number; spends?: boolean };
  /**
   * What each combo point a finisher spends is worth. Eviscerate is why: its
   * damage is not a number, it is a number times however many points were
   * banked when you pressed it.
   */
  comboDamage?: { min: number; max: number; apCoefficient?: number };
  /** How many things it reaches when more than one is standing there. */
  aoe?: {
    maxTargets: number;
    /** What each jump after the first keeps of the damage, for Chain Lightning. */
    falloff?: number;
  };
  /** Only usable once the target is below this share of its health. */
  execute?: { belowPct: number };
  /** Only usable from behind the target, which Shred is. */
  fromBehind?: boolean;
  /** Still usable while moving, which instants generally are. */
  usableWhileMoving?: boolean;
  /** Half as much again by default; twice as much for a weapon strike. */
  critMultiplier?: number;
  dot?: DotDef;
  channel?: ChannelDef;
  /** Flat mana handed back when it finishes, for a gem or a potion. */
  restoresMana?: number;
  /** Mana handed back as a share of the maximum, for Evocation and its like. */
  restoresManaPct?: number;
  /** Rage or energy handed back when it finishes, for Bloodrage and its like. */
  restoresResource?: number;
  /**
   * Skip this spell when the character has more than this share of its mana.
   * Keeps a rotation from opening with a potion.
   */
  useBelowMana?: number;
  forever: { status: ForeverStatus; note?: string };
}

/** The name the caster specs were written against, kept so they do not move. */
export type SpellDef = AbilityDef;

/**
 * What talents changed. Multipliers start at one and flat bonuses at zero, so a
 * hook can multiply or add without caring what ran before it.
 */
export interface SpellMods {
  /** Seconds off a cast, by ability id. */
  castTime: Record<string, number>;
  /** Damage multiplier, by ability id. */
  damage: Record<string, number>;
  /** Resource cost multiplier, by ability id. */
  cost: Record<string, number>;
  /** Flat points off a cost, by ability id, which is how rage talents read. */
  costFlat: Record<string, number>;
  /** Damage multiplier for a whole school. */
  schoolDamage: Partial<Record<School, number>>;
  /** Extra percentage points of spell hit. */
  spellHit: number;
  /** Extra percentage points of spell crit, by school. */
  spellCrit: Partial<Record<School, number>>;
  /** Extra crit damage on top of the base half again, as a fraction of the hit. */
  critBonus: Partial<Record<School, number>>;
  /** Extra percentage points of melee hit and crit. */
  meleeHit: number;
  meleeCrit: number;
  /** Extra percentage points of hit on off-hand swings alone. */
  offhandHit: number;
  /** Damage multiplier on off-hand swings alone. */
  offhandDamage: number;
  /** Flat attack power, for a shout the character puts up itself. */
  attackPower: number;
  /** Multiplier on all physical damage, which is where stance and Death Wish land. */
  physicalDamage: number;
  /** Extra crit damage on a weapon strike, as a fraction of the hit. */
  meleeCritBonus: number;
  /** Share of the target's armor ignored, from nought to one. */
  armorIgnored: number;
  /** Rage earned per point of damage is multiplied by this, per hand. */
  rageFromDamage: number;
  offhandRage: number;
  /** Extra maximum rage. */
  bonusRage: number;
  /** Anything that does not fit above; the spec module reads these itself. */
  flags: Record<string, number>;
}

export function emptyMods(): SpellMods {
  return {
    castTime: {},
    damage: {},
    cost: {},
    costFlat: {},
    schoolDamage: {},
    spellHit: 0,
    spellCrit: {},
    critBonus: {},
    meleeHit: 0,
    meleeCrit: 0,
    offhandHit: 0,
    offhandDamage: 1,
    attackPower: 0,
    physicalDamage: 1,
    meleeCritBonus: 0,
    armorIgnored: 0,
    rageFromDamage: 1,
    offhandRage: 1,
    bonusRage: 0,
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

/** Takes points off a cost rather than a share of it, the way rage talents read. */
export function reduceCost(mods: SpellMods, spellId: string, points: number): void {
  mods.costFlat[spellId] = (mods.costFlat[spellId] ?? 0) + points;
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
