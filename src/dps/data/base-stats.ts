/**
 * A fallback for a character with no sheet.
 *
 * The addon always sends a sheet, so this is only reached by a hand-written
 * export or one where the read failed. Race is ignored: Forever has ten of them
 * and the demo footage did not confirm their stat spreads, so a class average
 * with a warning beats a made-up table that looks precise.
 */

import type { ClassId } from '../../shared/classes';
import type { ForeverStatus } from '../../raid/types';

export interface BaseStats {
  strength: number;
  agility: number;
  stamina: number;
  intellect: number;
  spirit: number;
  /** Mana before any intellect on gear. */
  baseMana: number;
  /** Health before any stamina on gear. */
  baseHealth: number;
}

/** Roughly the level-sixty unequipped character, averaged across races. */
export const BASE_STATS: Record<ClassId, BaseStats> = {
  warrior: { strength: 120, agility: 80, stamina: 110, intellect: 35, spirit: 50, baseMana: 0, baseHealth: 1483 },
  paladin: { strength: 115, agility: 70, stamina: 105, intellect: 75, spirit: 70, baseMana: 1523, baseHealth: 1483 },
  hunter: { strength: 75, agility: 125, stamina: 95, intellect: 70, spirit: 70, baseMana: 1691, baseHealth: 1483 },
  rogue: { strength: 95, agility: 130, stamina: 95, intellect: 45, spirit: 60, baseMana: 0, baseHealth: 1483 },
  priest: { strength: 45, agility: 55, stamina: 75, intellect: 135, spirit: 145, baseMana: 1961, baseHealth: 1483 },
  shaman: { strength: 95, agility: 65, stamina: 100, intellect: 105, spirit: 115, baseMana: 1783, baseHealth: 1483 },
  mage: { strength: 35, agility: 55, stamina: 70, intellect: 150, spirit: 135, baseMana: 1213, baseHealth: 1483 },
  warlock: { strength: 55, agility: 60, stamina: 85, intellect: 130, spirit: 125, baseMana: 1720, baseHealth: 1483 },
  druid: { strength: 85, agility: 70, stamina: 90, intellect: 120, spirit: 125, baseMana: 1244, baseHealth: 1483 },
};

export const BASE_STATS_STATUS: { status: ForeverStatus; note: string } = {
  status: 'unverified',
  note:
    'Base stats are a Classic class average, used only when an export arrived without a ' +
    'character sheet. Export again from the addon for real numbers.',
};
