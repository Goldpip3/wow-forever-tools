/**
 * Rogue abilities and the talents that change them.
 *
 * Forever's rogue trees are close to Classic's in shape and not in numbers.
 * Hack and Slash is new and reads the weapon in your hand the way the warrior's
 * Weaponmaster does. Puncturing Wounds now speaks about Mutilate. Blade Flurry
 * is twenty per cent attack speed rather than Classic's twenty per cent for one
 * target. Every hook below is keyed by the name in
 * public/data/talents.generated.json and cites the description it was read from.
 *
 * Damage, cost and cooldown are the highest rank in the level-sixty spellbook
 * of the beta client, build 1.60.1.70009. 'same' means the game's text matches
 * Classic and 'changed' means it does not. No tooltip gives a coefficient, so
 * the one attack power figure here is an estimate and says so.
 */

import type { AbilityDef, SpellMods, TalentHook } from '../sim/spells';
import { reduceCost } from '../sim/spells';

/* ---------------------------------------------------------------- numbers */

export const SLICE_AND_DICE = {
  /** A third again as fast, which is Classic's figure. */
  haste: 0.3,
  /** Seconds at one combo point, and per point after it. */
  base: 9,
  perPoint: 3,
  cost: 25,
};

export const ADRENALINE_RUSH = { duration: 15, cooldown: 300 };
export const BLADE_FLURRY = { duration: 15, cooldown: 120, haste: 0.2 };

/** Energy the bar holds, before Vigor widens it. */
export const ROGUE_ENERGY = 100;

const changed = (note: string) => ({ status: 'changed' as const, note });

/* -------------------------------------------------------------- abilities */

export const SINISTER_STRIKE: AbilityDef = {
  id: 'sinister-strike',
  name: 'Sinister Strike',
  icon: 'spell_shadow_ritualofsacrifice',
  school: 'physical',
  kind: 'melee',
  resource: 'energy',
  castTime: 0,
  cost: 45,
  minDamage: 0,
  maxDamage: 0,
  coefficient: 0,
  combo: { generates: 1 },
  weapon: { hand: 'main', multiplier: 1, flat: 68, normalised: false },
  forever: {
    status: 'same',
    note: 'Rank 8, learned at level 54 in build 1.60.1.70009: weapon damage plus 68 for 45 Energy, as in Classic.',
  },
};

export const BACKSTAB: AbilityDef = {
  id: 'backstab',
  name: 'Backstab',
  icon: 'ability_backstab',
  school: 'physical',
  kind: 'melee',
  resource: 'energy',
  castTime: 0,
  cost: 60,
  minDamage: 0,
  maxDamage: 0,
  coefficient: 0,
  combo: { generates: 1 },
  weapon: { hand: 'main', multiplier: 1.5, flat: 225, normalised: false },
  forever: {
    status: 'same',
    note:
      'Rank 9, learned at level 60 in build 1.60.1.70009: 150% weapon damage plus 225 for 60 ' +
      'Energy. It needs a dagger and it needs you behind the target, and the rotation only ' +
      'offers it with one on.',
  },
};

/**
 * The finisher. Its damage is not a number, it is a number per combo point,
 * which is why the engine spends the points before it rolls anything.
 *
 * The game's rank 9 is 224-332 at one point and 170 more per point after it,
 * which a flat amount per point cannot match at every count. It is set to the
 * five-point figure, 904-1,012, because that is the only count the rotation
 * spends; at fewer points it comes out low.
 */
export const EVISCERATE: AbilityDef = {
  id: 'eviscerate',
  name: 'Eviscerate',
  icon: 'ability_rogue_eviscerate',
  school: 'physical',
  kind: 'melee',
  resource: 'energy',
  castTime: 0,
  cost: 35,
  minDamage: 0,
  maxDamage: 0,
  coefficient: 0,
  combo: { spends: true },
  comboDamage: { min: 904 / 5, max: 1012 / 5, apCoefficient: 0.03 },
  weapon: { hand: 'main', multiplier: 0, flat: 0, normalised: false },
  forever: {
    status: 'same',
    note:
      'Rank 9, learned at level 60 in build 1.60.1.70009: 904 to 1,012 at five combo points, as ' +
      'in Classic. The game says attack power raises it but gives no figure, so the three per ' +
      'cent of attack power a point is an estimate.',
  },
};

export const SLICE_AND_DICE_SPELL: AbilityDef = {
  id: 'slice-and-dice',
  name: 'Slice and Dice',
  icon: 'ability_rogue_slicedice',
  school: 'physical',
  kind: 'item',
  resource: 'energy',
  castTime: 0,
  cost: SLICE_AND_DICE.cost,
  minDamage: 0,
  maxDamage: 0,
  coefficient: 0,
  combo: { spends: true },
  forever: {
    status: 'same',
    note:
      'Rank 2, learned at level 42 in build 1.60.1.70009: thirty per cent attack speed, for nine ' +
      'seconds at one combo point and three more for each point after it, as in Classic.',
  },
};

export const ADRENALINE_RUSH_SPELL: AbilityDef = {
  id: 'adrenaline-rush',
  name: 'Adrenaline Rush',
  icon: 'spell_shadow_shadowworddominate',
  school: 'physical',
  kind: 'item',
  resource: 'energy',
  castTime: 0,
  gcd: 0,
  cost: 0,
  cooldown: ADRENALINE_RUSH.cooldown,
  minDamage: 0,
  maxDamage: 0,
  coefficient: 0,
  forever: {
    status: 'same',
    note: 'Twice the energy back for fifteen seconds, on a 5 min cooldown, as in Classic.',
  },
};

export const BLADE_FLURRY_SPELL: AbilityDef = {
  id: 'blade-flurry',
  name: 'Blade Flurry',
  icon: 'ability_warrior_punishingblow',
  school: 'physical',
  kind: 'item',
  resource: 'energy',
  castTime: 0,
  gcd: 0,
  cost: 25,
  cooldown: BLADE_FLURRY.cooldown,
  minDamage: 0,
  maxDamage: 0,
  coefficient: 0,
  forever: changed(
    'A fifth faster and an extra target for fifteen seconds, on a 2 min cooldown, which is what ' +
      'build 1.60.1.70009 says. The extra target is not modelled.',
  ),
};

export const ROGUE_ABILITIES: AbilityDef[] = [
  SINISTER_STRIKE,
  BACKSTAB,
  EVISCERATE,
  SLICE_AND_DICE_SPELL,
  ADRENALINE_RUSH_SPELL,
  BLADE_FLURRY_SPELL,
];

/* ----------------------------------------------------------------- flags */

export const ROGUE_FLAGS = {
  sliceDuration: 'sliceDuration',
  sealFateChance: 'sealFateChance',
  ruthlessnessChance: 'ruthlessnessChance',
  relentlessChance: 'relentlessChance',
  hackAndSlashRank: 'hackAndSlashRank',
  backstabCrit: 'backstabCrit',
  backstabComboChance: 'backstabComboChance',
};

/* --------------------------------------------------------------- talents */

export const ROGUE_TALENT_HOOKS: Record<string, TalentHook> = {
  /* -------------------------------------------------------- Assassination */

  // 'Increases your critical strike chance with all attacks and Poisons by 1%.'
  Malice: (rank, mods) => {
    mods.meleeCrit += rank;
  },

  // 'Increases the critical strike damage bonus of your Sinister Strike,
  // Gouge, Backstab, Mutilate, Ghostly Strike, and Hemorrhage abilities by 4%.'
  // Twenty per cent at rank 5. Applied to every strike, auto attacks included,
  // which overstates it.

  Lethality: (rank, mods) => {
    mods.meleeCritBonus += 0.04 * rank;
  },

  // 'Increases the duration of your Slice and Dice ability by 15%.'
  'Improved Slice and Dice': (rank, mods) => {
    mods.flags[ROGUE_FLAGS.sliceDuration] = 0.15 * rank;
  },

  // 'Gives your finishing moves a 20% chance to add a combo point.'
  Ruthlessness: (rank, mods) => {
    mods.flags[ROGUE_FLAGS.ruthlessnessChance] = 0.2 * rank;
  },

  // 'Your finishing moves have a 20% chance per combo point to restore 25 energy.'
  'Relentless Strikes': (_rank, mods) => {
    mods.flags[ROGUE_FLAGS.relentlessChance] = 0.2;
  },

  // 'Your critical strikes from abilities that add combo points have a 20%
  // chance to add an additional combo point.'
  'Seal Fate': (rank, mods) => {
    mods.flags[ROGUE_FLAGS.sealFateChance] = 0.2 * rank;
  },

  // 'Increases your maximum Energy by 5.'
  Vigor: (rank, mods) => {
    mods.flags.bonusEnergy = 5 * rank;
  },

  /* --------------------------------------------------------------- Combat */

  // 'Reduces the Energy cost of your Sinister Strike ability by 3.' The second
  // rank is five rather than six, which the tree gives outright.
  'Improved Sinister Strike': (rank, mods) => {
    reduceCost(mods, SINISTER_STRIKE.id, rank >= 2 ? 5 : 3);
  },

  // 'Increases the damage done by your Eviscerate ability by 7%.'
  'Improved Eviscerate': (rank, mods) => {
    mods.damage[EVISCERATE.id] = (mods.damage[EVISCERATE.id] ?? 1) * (1 + 0.07 * rank);
  },

  // 'Improves your chance to hit by 1%.'
  Precision: (rank, mods) => {
    mods.meleeHit += rank;
  },

  // 'Increases the damage of your Sinister Strike, Backstab, and Eviscerate
  // abilities by 2%.'
  Aggression: (rank, mods) => {
    const factor = 1 + 0.02 * rank;
    for (const id of [SINISTER_STRIKE.id, BACKSTAB.id, EVISCERATE.id]) {
      mods.damage[id] = (mods.damage[id] ?? 1) * factor;
    }
  },

  // 'Increases the damage done by your off-hand weapon by 5%.'
  'Dual Wield Specialization': (rank, mods) => {
    mods.offhandDamage *= 1 + 0.05 * rank;
  },

  // 'Reduces the chance for your attacks to be Dodged or Parried by 1%.'
  // Modelled as hit, which is the same thing to the attack table.
  'Weapon Expertise': (rank, mods) => {
    mods.meleeHit += rank;
  },

  // 'Increases the critical strike chance of your Backstab by 10% and your
  // Mutilate by 5%, and gives Backstab a 15% chance to add an additional Combo
  // Point.' Mutilate is not simulated, so only the Backstab half is read.
  'Puncturing Wounds': (rank, mods) => {
    mods.flags[ROGUE_FLAGS.backstabCrit] = 10 * rank;
    mods.flags[ROGUE_FLAGS.backstabComboChance] = 0.15 * rank;
  },


  /**
   * 'Axe/Sword: 1% chance to trigger an extra attack. Dagger/Fist: critical
   * strike chance by 1%. Mace: ignore 3% of armor.' Which branch depends on
   * what is in your hand, so the rank goes on a flag and the spec reads the
   * weapon once the gear is known.
   */
  'Hack and Slash': (rank, mods) => {
    mods.flags[ROGUE_FLAGS.hackAndSlashRank] = rank;
  },
};

/** How long Slice and Dice lasts for this many points, after the talent. */
export function sliceDuration(points: number, mods: SpellMods): number {
  const base = SLICE_AND_DICE.base + SLICE_AND_DICE.perPoint * Math.max(0, points - 1);
  return base * (1 + (mods.flags[ROGUE_FLAGS.sliceDuration] ?? 0));
}
