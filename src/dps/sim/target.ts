/**
 * The boss, after the debuffs.
 *
 * Until now a debuff could only add a stat to the player, which is why Curse of
 * the Elements sat in the fight panel adding nothing: what it actually does is
 * make the target take more. That lives here, worked out once per run, because
 * nothing in the model changes the boss mid-fight yet.
 */

import { SCHOOLS, type School } from '../export-format';
import { buffById } from '../data/buffs';
import type { FightConfig, TargetState } from './types';

export function targetStateFor(fight: FightConfig): TargetState {
  const damageTaken: Partial<Record<School, number>> = {};
  let armor = fight.target.armor;

  for (const id of fight.debuffs) {
    const buff = buffById(id);
    if (!buff) continue;

    for (const school of SCHOOLS) {
      const factor = buff.damageTaken?.[school];
      if (factor) damageTaken[school] = (damageTaken[school] ?? 1) * factor;
    }

    // Sunder and its like take a flat amount off, and they stack additively
    // with each other rather than multiplying.
    if (buff.targetArmor) armor -= buff.targetArmor;
  }

  return {
    level: fight.target.level,
    armor: Math.max(0, armor),
    resistance: fight.target.resistance,
    damageTaken,
  };
}
