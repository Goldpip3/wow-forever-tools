/**
 * Where rage comes from.
 *
 * Two sources, and only one of them matters to a damage dealer. Hitting things
 * earns rage in proportion to the damage and to how slow the weapon is, so a
 * two-hander earns it in large lumps and a pair of daggers in a steady trickle.
 * Being hit earns it too, which is the tank's half of the bar and is worth
 * nothing at all to someone standing behind the boss.
 *
 * Every number lives in data/combat-constants.ts. The conversion value is the
 * single likeliest thing on this page to be wrong for Forever, which is why the
 * results panel says so.
 */

import * as K from '../data/combat-constants';
import type { Hand } from './types';

/**
 * Rage for one swing that connected.
 *
 * The Classic formula is the damage over the conversion value, plus the hit
 * factor scaled by the weapon's speed, averaged. A critical strike doubles the
 * hit factor's half, which is why crits feel like they refill the bar.
 */
export function rageFromDamage(
  damage: number,
  weaponSpeed: number,
  hand: Hand,
  crit: boolean,
): number {
  if (damage <= 0) return 0;
  const conversion = K.RAGE_CONVERSION.value;
  const factor = hand === 'off' ? K.RAGE_HIT_FACTOR_OFF.value : K.RAGE_HIT_FACTOR_MAIN.value;
  const hitFactor = crit ? factor * K.RAGE_CRIT_MULTIPLIER.value : factor;
  return (damage / conversion + hitFactor * weaponSpeed) / 2;
}

/** Rage for damage arriving, which is the tank's half of the bar. */
export function rageFromDamageTaken(damage: number): number {
  if (damage <= 0) return 0;
  return (K.RAGE_FROM_DAMAGE_TAKEN.value * damage) / K.RAGE_CONVERSION.value;
}
