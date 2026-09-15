/**
 * What a point of a primary stat turns into, per class.
 *
 * These only ever touch the difference a gear change makes. The character sheet
 * the addon sent already has the character's current conversions baked in, so
 * applying them again to the whole total would count everything twice. What the
 * site does instead is take the sheet as given and convert only the delta: put
 * on a ring with ten more intellect and that ten becomes crit and mana here.
 *
 * Classic level-sixty numbers. Forever has confirmed none of them.
 */

import type { ClassId } from '../../shared/classes';
import type { ForeverStatus } from '../../raid/types';

export interface ClassConversions {
  /** Points of intellect for one per cent of spell critical strike. */
  intPerSpellCrit: number;
  /** Points of agility for one per cent of melee critical strike. */
  agiPerMeleeCrit: number;
  /** Attack power per point of strength. */
  apPerStrength: number;
  /** Attack power per point of agility. */
  apPerAgility: number;
  /** Ranged attack power per point of agility. */
  rapPerAgility: number;
  /** Mana per point of intellect. */
  manaPerInt: number;
  /** Armor per point of agility. */
  armorPerAgility: number;
  /**
   * Mana every two seconds out of the five second rule: spirit over the
   * divisor, plus a flat amount.
   */
  spiritRegen: { divisor: number; flat: number };
}

export const CONVERSIONS: Record<ClassId, ClassConversions> = {
  warrior: {
    intPerSpellCrit: 0, agiPerMeleeCrit: 20, apPerStrength: 2, apPerAgility: 0,
    rapPerAgility: 2, manaPerInt: 0, armorPerAgility: 2,
    spiritRegen: { divisor: 0, flat: 0 },
  },
  paladin: {
    intPerSpellCrit: 54, agiPerMeleeCrit: 19.77, apPerStrength: 2, apPerAgility: 0,
    rapPerAgility: 0, manaPerInt: 15, armorPerAgility: 2,
    spiritRegen: { divisor: 5, flat: 15 },
  },
  hunter: {
    intPerSpellCrit: 0, agiPerMeleeCrit: 53, apPerStrength: 1, apPerAgility: 0,
    rapPerAgility: 2, manaPerInt: 15, armorPerAgility: 2,
    spiritRegen: { divisor: 5, flat: 15 },
  },
  rogue: {
    intPerSpellCrit: 0, agiPerMeleeCrit: 29, apPerStrength: 1, apPerAgility: 1,
    rapPerAgility: 2, manaPerInt: 0, armorPerAgility: 2,
    spiritRegen: { divisor: 0, flat: 0 },
  },
  priest: {
    intPerSpellCrit: 59.2, agiPerMeleeCrit: 20, apPerStrength: 1, apPerAgility: 0,
    rapPerAgility: 0, manaPerInt: 15, armorPerAgility: 2,
    spiritRegen: { divisor: 4, flat: 12.5 },
  },
  shaman: {
    intPerSpellCrit: 59.2, agiPerMeleeCrit: 19.7, apPerStrength: 2, apPerAgility: 0,
    rapPerAgility: 0, manaPerInt: 15, armorPerAgility: 2,
    spiritRegen: { divisor: 5, flat: 15 },
  },
  mage: {
    intPerSpellCrit: 59.5, agiPerMeleeCrit: 20, apPerStrength: 1, apPerAgility: 0,
    rapPerAgility: 0, manaPerInt: 15, armorPerAgility: 2,
    spiritRegen: { divisor: 4, flat: 12.5 },
  },
  warlock: {
    intPerSpellCrit: 60.6, agiPerMeleeCrit: 20, apPerStrength: 1, apPerAgility: 0,
    rapPerAgility: 0, manaPerInt: 15, armorPerAgility: 2,
    spiritRegen: { divisor: 5, flat: 15 },
  },
  druid: {
    intPerSpellCrit: 60, agiPerMeleeCrit: 20, apPerStrength: 2, apPerAgility: 0,
    rapPerAgility: 0, manaPerInt: 15, armorPerAgility: 2,
    spiritRegen: { divisor: 5, flat: 15 },
  },
};

export const CONVERSIONS_STATUS: { status: ForeverStatus; note: string } = {
  status: 'unverified',
  note:
    'Stat conversions are the Classic level-sixty ratios. They are applied only to the ' +
    'difference a gear change makes, never to the sheet the game reported.',
};

/** Mana every two seconds from spirit, for a class that has any. */
export function spiritRegenPer2s(classId: ClassId, spirit: number): number {
  const { divisor, flat } = CONVERSIONS[classId].spiritRegen;
  if (divisor <= 0) return 0;
  return spirit / divisor + flat;
}
