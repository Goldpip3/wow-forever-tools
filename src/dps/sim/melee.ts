/**
 * A weapon swing, from the roll to the number.
 *
 * sim/tables.ts has had the whole Classic attack table in it since the caster
 * engine was written, tested and unused. This file is what finally calls it:
 * build the bands for this weapon against this target, roll once for a swing
 * you did not aim or twice for one you did, and turn the outcome into damage.
 */

import * as K from '../data/combat-constants';
import type { Rng } from './rng';
import {
  armorMultiplier,
  defenseFor,
  glancingMultiplier,
  meleeAttackTable,
  resolveWhite,
  resolveYellow,
  type AttackParams,
  type AttackTable,
} from './tables';
import type { AbilityDef } from './spells';
import type {
  AttackBands, Hand, Outcome, StatSheet, TargetState, WeaponStats,
} from './types';

/** What the weapon rolls for on its own, before the ability takes a share. */
export function weaponRoll(
  weapon: WeaponStats,
  attackPower: number,
  rng: Rng,
  normalised: boolean,
  average = false,
): number {
  const base = average ? (weapon.min + weapon.max) / 2 : rng.between(weapon.min, weapon.max);
  const speed = normalised ? normalisedSpeed(weapon) : weapon.speed;
  return base + (attackPower / K.AP_PER_DPS.value) * speed;
}

/** The speed attack power is measured against for a normalised strike. */
export function normalisedSpeed(weapon: WeaponStats): number {
  const speeds = K.NORMALISED_SPEED.value;
  const type = weapon.type.toLowerCase();
  if (type.includes('dagger')) return speeds.dagger;
  if (type.includes('bow') || type.includes('gun') || type.includes('crossbow')) return speeds.ranged;
  return weapon.twoHanded ? speeds.twoHand : speeds.oneHand;
}

export interface SwingParams {
  weapon: WeaponStats;
  hand: Hand;
  stats: StatSheet;
  target: TargetState;
  /** Extra percentage points beyond what the sheet already carries. */
  hitBonus: number;
  critBonus: number;
  behind: boolean;
  canParry: boolean;
  canBlock: boolean;
  /** Holding a weapon in each hand, which costs a great deal of accuracy. */
  dualWield: boolean;
  /** Bands pinned by the fight overrides, for checking a case by hand. */
  forced?: Partial<AttackBands>;
}

/** The bands one swing of this weapon rolls against. */
export function bandsFor(params: SwingParams, aimed: boolean): AttackTable {
  const attack: AttackParams = {
    skill: params.weapon.skill,
    defense: defenseFor(params.target.level),
    hitPct: params.stats.hit + params.hitBonus,
    critPct: params.stats.crit + params.critBonus,
    attackerLevel: params.stats.level,
    targetLevel: params.target.level,
    dualWield: params.dualWield,
    behind: params.behind,
    canParry: params.canParry,
    canBlock: params.canBlock,
  };

  const table = meleeAttackTable(attack, aimed);
  if (!params.forced) return table;

  // A forced band replaces the rolled one and the clean hit takes the rest, so
  // a test can pin every swing to a miss or a crit and check the arithmetic.
  const merged = { ...table, ...params.forced };
  const used = merged.miss + merged.dodge + merged.parry + merged.glance + merged.block + merged.crit;
  return { ...merged, hit: Math.max(0, 100 - used) };
}

/** One swing: what happened, and what it did. */
export interface SwingResult {
  outcome: Outcome;
  amount: number;
  /** Whether this was a swing that came round on its own. */
  white: boolean;
}

/**
 * Resolve one attack.
 *
 * A white swing walks the whole table in one roll, so a target that dodges a
 * great deal pushes critical strikes off the bottom of it. An aimed strike
 * rolls to be avoided and then rolls again to crit, which is why the same crit
 * chance shows up more often on abilities than on swings.
 */
export function resolveAttack(
  params: SwingParams,
  rng: Rng,
  ability: AbilityDef | null,
  averageDamage = false,
): SwingResult {
  // Anything the character chose to press is aimed, which skips the glancing
  // band and rolls for a critical strike on its own.
  const aimed = ability !== null;
  const table = bandsFor(params, aimed);
  const outcome = aimed ? resolveYellow(table, rng) : resolveWhite(table, rng);

  if (outcome === 'miss' || outcome === 'dodge' || outcome === 'parry') {
    return { outcome, amount: 0, white: !aimed };
  }

  const attackPower = params.stats.attackPower;
  const share = ability?.weapon?.multiplier ?? 1;
  const normalise = ability?.weapon?.normalised ?? false;
  const flat = ability?.weapon?.flat ?? 0;

  let amount = weaponRoll(params.weapon, attackPower, rng, normalise, averageDamage) * share + flat;
  if (ability?.apCoefficient) amount += attackPower * ability.apCoefficient;

  if (outcome === 'glance') {
    amount *= glancingMultiplier(params.weapon.skill, defenseFor(params.target.level), rng);
  }
  if (outcome === 'block') amount = Math.max(0, amount - K.BLOCK_VALUE_DEFAULT.value);

  return { outcome, amount, white: !aimed };
}

/** What armor leaves of a physical hit, after anything that ignores a share. */
export function physicalMultiplier(
  target: TargetState,
  attackerLevel: number,
  armorIgnored: number,
): number {
  const armor = Math.max(0, target.armor * (1 - Math.max(0, Math.min(1, armorIgnored))));
  const school = target.damageTaken.physical ?? 1;
  return armorMultiplier(armor, attackerLevel) * school;
}
