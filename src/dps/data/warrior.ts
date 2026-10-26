/**
 * Warrior abilities and the talents that change them.
 *
 * Forever's warrior trees are not Classic's. Bloodthirst deals thirty-five per
 * cent of attack power plus forty-eight at rank 4 where Classic's dealt
 * forty-five per cent, Unbridled Wrath pays out at twelve per cent a rank rather
 * than eight, Flurry gives five per cent a rank rather than ten, and there are
 * talents Classic never had at all. Every hook below is keyed by the name in
 * public/data/talents.generated.json and cites the description it was read
 * from, because a Classic name would silently never fire.
 *
 * Damage, cost, cast time and cooldown are the highest rank in the level-sixty
 * spellbook of the beta client, build 1.60.1.70009. 'same' means the game's
 * text matches Classic and 'changed' means it does not. No tooltip gives a
 * coefficient, so none here comes from the game.
 */

import type { AbilityDef, SpellMods, TalentHook } from '../sim/spells';
import { reduceCost } from '../sim/spells';

/* ---------------------------------------------------------------- numbers */

/** Rage generated instantly by Bloodrage, and the trickle after it. */
export const BLOODRAGE = { instant: 10, overTime: 10, duration: 10, cooldown: 60 };

export const DEATH_WISH = { damage: 0.2, duration: 30, cooldown: 180 };
export const RECKLESSNESS = { duration: 15, cooldown: 1800 };
export const FLURRY = { swings: 3, duration: 12, perRank: 0.05 };
export const ENRAGE = { duration: 12, perRank: 0.02, chance: 0.3 };
export const DEEP_WOUNDS = { ticks: 4, interval: 3, sharePerRank: 0.2 };

const changed = (note: string) => ({ status: 'changed' as const, note });

/* -------------------------------------------------------------- abilities */

/**
 * A strike that waits for the weapon to come round. It replaces the swing
 * rather than arriving alongside it, so its damage is the swing's damage plus
 * a flat amount and the rage is paid when the weapon lands.
 */
export const HEROIC_STRIKE: AbilityDef = {
  id: 'heroic-strike',
  name: 'Heroic Strike',
  icon: 'ability_rogue_ambush',
  school: 'physical',
  kind: 'melee',
  resource: 'rage',
  castTime: 0,
  gcd: 0,
  cost: 15,
  minDamage: 0,
  maxDamage: 0,
  coefficient: 0,
  onNextSwing: true,
  weapon: { hand: 'main', multiplier: 1, flat: 157, normalised: false },
  forever: {
    status: 'same',
    note: 'Rank 9, learned at level 60 in build 1.60.1.70009: melee damage plus 157 for 15 Rage, as in Classic.',
  },
};

export const CLEAVE: AbilityDef = {
  id: 'cleave',
  name: 'Cleave',
  icon: 'ability_warrior_cleave',
  school: 'physical',
  kind: 'melee',
  resource: 'rage',
  castTime: 0,
  gcd: 0,
  cost: 20,
  minDamage: 0,
  maxDamage: 0,
  coefficient: 0,
  onNextSwing: true,
  aoe: { maxTargets: 2 },
  weapon: { hand: 'main', multiplier: 1, flat: 50, normalised: false },
  forever: {
    status: 'same',
    note:
      'Rank 5, learned at level 60 in build 1.60.1.70009: weapon damage plus 50 to the target ' +
      'and a second nearby enemy, for 20 Rage, as in Classic.',
  },
};

/**
 * Bloodthirst is one of the places Forever moved: thirty-five per cent of
 * attack power plus a flat amount, where Classic read forty-five per cent and
 * healed you. The talent grants rank 1 (plus thirty); the level-sixty
 * spellbook has rank 4 (plus forty-eight).
 */
export const BLOODTHIRST: AbilityDef = {
  id: 'bloodthirst',
  name: 'Bloodthirst',
  icon: 'spell_nature_bloodlust',
  school: 'physical',
  kind: 'melee',
  resource: 'rage',
  castTime: 0,
  cost: 30,
  cooldown: 6,
  minDamage: 0,
  maxDamage: 0,
  coefficient: 0,
  apCoefficient: 0.35,
  weapon: { hand: 'main', multiplier: 0, flat: 48, normalised: true },
  forever: changed(
    'Rank 4, learned at level 60 in build 1.60.1.70009: thirty-five per cent of attack power ' +
      'plus forty-eight. Classic dealt forty-five per cent and restored health. The ten per ' +
      'cent movement speed it gives now does nothing here.',
  ),
};

/**
 * The talent grants rank 1 (weapon damage plus eighty-five). The level-sixty
 * spellbook has rank 4 (plus one hundred and sixty).
 */
export const MORTAL_STRIKE: AbilityDef = {
  id: 'mortal-strike',
  name: 'Mortal Strike',
  icon: 'ability_warrior_savageblow',
  school: 'physical',
  kind: 'melee',
  resource: 'rage',
  castTime: 0,
  cost: 30,
  cooldown: 6,
  minDamage: 0,
  maxDamage: 0,
  coefficient: 0,
  weapon: { hand: 'main', multiplier: 1, flat: 160, normalised: true },
  forever: {
    status: 'same',
    note: 'Rank 4, learned at level 60 in build 1.60.1.70009: weapon damage plus 160, as in Classic.',
  },
};

export const WHIRLWIND: AbilityDef = {
  id: 'whirlwind',
  name: 'Whirlwind',
  icon: 'ability_whirlwind',
  school: 'physical',
  kind: 'melee',
  resource: 'rage',
  castTime: 0,
  cost: 25,
  cooldown: 10,
  minDamage: 0,
  maxDamage: 0,
  coefficient: 0,
  aoe: { maxTargets: 4 },
  weapon: { hand: 'main', multiplier: 1, flat: 0, normalised: true },
  forever: {
    status: 'same',
    note: 'Weapon damage to up to 4 enemies within 8 yards, on a 10 sec cooldown, as in Classic.',
  },
};

export const EXECUTE: AbilityDef = {
  id: 'execute',
  name: 'Execute',
  icon: 'inv_sword_48',
  school: 'physical',
  kind: 'melee',
  resource: 'rage',
  castTime: 0,
  cost: 15,
  minDamage: 600,
  maxDamage: 600,
  coefficient: 0,
  execute: { belowPct: 0.2 },
  weapon: { hand: 'main', multiplier: 0, flat: 600, normalised: false },
  forever: {
    status: 'same',
    note:
      'Rank 5, learned at level 56 in build 1.60.1.70009: six hundred damage, and fifteen more ' +
      'for each extra point of rage. The extra rage is not modelled, so this understates it.',
  },
};

export const SLAM: AbilityDef = {
  id: 'slam',
  name: 'Slam',
  icon: 'ability_warrior_decisivestrike',
  school: 'physical',
  kind: 'melee',
  resource: 'rage',
  castTime: 1.5,
  cost: 15,
  cooldown: 18,
  minDamage: 0,
  maxDamage: 0,
  coefficient: 0,
  weapon: { hand: 'main', multiplier: 1, flat: 87, normalised: false },
  forever: changed(
    'Rank 5, learned at level 54 in build 1.60.1.70009: weapon damage plus eighty-seven, a ' +
      '1.5 sec cast, and an 18 sec cooldown Classic did not have. No rotation here presses it.',
  ),
};

export const OVERPOWER: AbilityDef = {
  id: 'overpower',
  name: 'Overpower',
  icon: 'ability_meleedamage',
  school: 'physical',
  kind: 'melee',
  resource: 'rage',
  castTime: 0,
  cost: 5,
  cooldown: 5,
  minDamage: 0,
  maxDamage: 0,
  coefficient: 0,
  weapon: { hand: 'main', multiplier: 1, flat: 35, normalised: false },
  forever: {
    status: 'same',
    note:
      'Rank 4, learned at level 60 in build 1.60.1.70009: weapon damage plus thirty-five. It ' +
      'can only be used after the target dodges or Bloodthrill procs, and no rotation here ' +
      'waits for either.',
  },
};

/**
 * Berserker Rage earns rage only once Improved Berserker Rage is taken, so the
 * amount comes from the talent rather than from the ability, and the rotation
 * leaves it alone when the talent is not there.
 */
export const BERSERKER_RAGE_SPELL: AbilityDef = {
  id: 'berserker-rage',
  name: 'Berserker Rage',
  icon: 'spell_nature_ancestralguardian',
  school: 'physical',
  kind: 'item',
  resource: 'rage',
  castTime: 0,
  cost: 0,
  cooldown: 30,
  minDamage: 0,
  maxDamage: 0,
  coefficient: 0,
  forever: changed(
    'Five rage a rank from Improved Berserker Rage, which is what the Fury tree says. Its own ' +
      'extra rage from taking damage is not modelled, so without the talent the rotation skips it.',
  ),
};

export const BLOODRAGE_SPELL: AbilityDef = {
  id: 'bloodrage',
  name: 'Bloodrage',
  icon: 'ability_racial_bloodrage',
  school: 'physical',
  kind: 'item',
  resource: 'rage',
  castTime: 0,
  gcd: 0,
  cost: 0,
  cooldown: BLOODRAGE.cooldown,
  minDamage: 0,
  maxDamage: 0,
  coefficient: 0,
  restoresResource: BLOODRAGE.instant,
  forever: {
    status: 'same',
    note:
      'Ten rage at once and ten more over ten seconds, on a 1 min cooldown. The trickle is ' +
      'handed over in full at the press, which is worth a little more than waiting for it.',
  },
};

export const DEATH_WISH_SPELL: AbilityDef = {
  id: 'death-wish',
  name: 'Death Wish',
  icon: 'spell_shadow_deathpact',
  school: 'physical',
  kind: 'item',
  resource: 'rage',
  castTime: 0,
  cost: 10,
  cooldown: DEATH_WISH.cooldown,
  minDamage: 0,
  maxDamage: 0,
  coefficient: 0,
  forever: changed(
    'A fifth more physical damage for thirty seconds, and five per cent more damage taken, ' +
      'on a 3 min cooldown. Classic lowered your armor and resistances instead.',
  ),
};

export const RECKLESSNESS_SPELL: AbilityDef = {
  id: 'recklessness',
  name: 'Recklessness',
  icon: 'ability_criticalstrike',
  school: 'physical',
  kind: 'item',
  resource: 'rage',
  castTime: 0,
  cost: 0,
  cooldown: RECKLESSNESS.cooldown,
  minDamage: 0,
  maxDamage: 0,
  coefficient: 0,
  forever: changed(
    'One hundred per cent more critical strike chance for fifteen seconds, on a 30 min ' +
      'cooldown, which is what build 1.60.1.70009 says. That means once a fight and never again.',
  ),
};

export const WARRIOR_ABILITIES: AbilityDef[] = [
  HEROIC_STRIKE,
  CLEAVE,
  BLOODTHIRST,
  MORTAL_STRIKE,
  WHIRLWIND,
  EXECUTE,
  SLAM,
  OVERPOWER,
  BERSERKER_RAGE_SPELL,
  BLOODRAGE_SPELL,
  DEATH_WISH_SPELL,
  RECKLESSNESS_SPELL,
];

/* ----------------------------------------------------------------- flags */

/** Flags the warrior spec modules read back out of the mods. */
export const WARRIOR_FLAGS = {
  flurryRank: 'flurryRank',
  unbridledChance: 'unbridledChance',
  deepWoundsShare: 'deepWoundsShare',
  angerManagement: 'angerManagement',
  swordSpecChance: 'swordSpecChance',
  improvedOverpowerCrit: 'improvedOverpowerCrit',
};

/* --------------------------------------------------------------- talents */

/** Furious Precision's off-hand hit at ranks 1 to 3, as its text gives them. */
export const FURIOUS_PRECISION_HIT = [4, 7, 10];

/**
 * Keyed by the talent name exactly as public/data/talents.generated.json spells
 * it. Anything not in this map is listed in the spec's unmodelled list instead,
 * so a build is never quietly worth more than the number says.
 */
export const WARRIOR_TALENT_HOOKS: Record<string, TalentHook> = {
  /* ---------------------------------------------------------------- Arms */

  // 'Reduces the cost of your Heroic Strike ability by 1 Rage.' at rank 1.
  'Improved Heroic Strike': (rank, mods) => {
    reduceCost(mods, HEROIC_STRIKE.id, rank);
  },

  // 'Increases the damage you deal with two-handed melee weapons by 1%.'
  'Two-Handed Weapon Specialization': (rank, mods) => {
    mods.flags.twoHandedDamage = 0.01 * rank;
  },

  // 'Increases the critical strike damage bonus of your abilities by 10%.'
  // The base bonus is the whole hit again, so a tenth of that is 0.1 each.
  Impale: (rank, mods) => {
    mods.meleeCritBonus += 0.1 * rank;
  },

  // 'Your critical strikes cause your opponent to Bleed, dealing 20% of your
  // melee weapon's average damage over 12 sec.'
  'Deep Wounds': (rank, mods) => {
    mods.flags[WARRIOR_FLAGS.deepWoundsShare] = DEEP_WOUNDS.sharePerRank * rank;
  },

  // 'Generates 1 Rage every 3 sec while in combat.'
  'Anger Management': (_rank, mods) => {
    mods.flags[WARRIOR_FLAGS.angerManagement] = 1 / 3;
  },

  // 'Increases the critical strike chance of your Overpower ability by 25%.'
  'Improved Overpower': (rank, mods) => {
    mods.flags[WARRIOR_FLAGS.improvedOverpowerCrit] = 25 * rank;
  },

  // 'Reduces the global cooldown and cast time of your Slam ability by 0.25 sec.'
  // The rest of it (no swing delay, a shorter cooldown) is not modelled; no
  // rotation here presses Slam.

  'Improved Slam': (rank, mods) => {
    mods.castTime[SLAM.id] = (mods.castTime[SLAM.id] ?? 0) - 0.25 * rank;
  },

  /**
   * 'Gives your melee weapon attacks a benefit depending on the weapon.
   * Axe/Polearm: critical strike chance by 1%. Mace/Staff: ignore 3% of armor.
   * Sword: 1% chance to trigger an extra attack.'
   *
   * Which branch applies depends on what is in your hand, so the rank is put
   * on a flag and the spec reads the weapon when the fight starts.
   */
  Weaponmaster: (rank, mods) => {
    mods.flags.weaponmasterRank = rank;
  },

  /* ---------------------------------------------------------------- Fury */

  // 'Increases your chance to get a critical strike with melee attacks by 1%.'
  Cruelty: (rank, mods) => {
    mods.meleeCrit += rank;
  },

  /**
   * 'Gives you a 12% chance to generate 1 additional Rage when you deal melee
   * damage with a weapon.' Sixty per cent at rank 5.
   */
  'Unbridled Wrath': (rank, mods) => {
    mods.flags[WARRIOR_FLAGS.unbridledChance] = 0.12 * rank;
  },

  // 'Increases the damage done by your off-hand weapon by 5% and the Rage
  // generated by your off-hand attacks by 10%.'
  'Dual Wield Specialization': (rank, mods) => {
    mods.offhandDamage *= 1 + 0.05 * rank;
    mods.offhandRage *= 1 + 0.1 * rank;
  },

  // 'Increases your chance to hit with off-hand attacks by 4%.' Then 7 and 10,
  // so the ranks are read off a table rather than multiplied.
  'Furious Precision': (rank, mods) => {
    mods.offhandHit += FURIOUS_PRECISION_HIT[Math.min(rank, FURIOUS_PRECISION_HIT.length) - 1] ?? 0;
  },

  // 'Increases your melee attack speed by 5% for your next 3 swings after
  // dealing a melee critical strike.' Twenty-five per cent at rank 5.
  Flurry: (rank, mods) => {
    mods.flags[WARRIOR_FLAGS.flurryRank] = rank;
  },

  // 'Reduces the Rage cost of your Execute ability by 3.'
  'Improved Execute': (rank, mods) => {
    reduceCost(mods, EXECUTE.id, 3 * rank);
  },

  // 'Reduces the Rage cost of your Cleave and Whirlwind abilities by 3.'
  'Raging Blows': (_rank, mods) => {
    reduceCost(mods, CLEAVE.id, 3);
    reduceCost(mods, WHIRLWIND.id, 3);
  },

  // 'Gives you a 30% chance to deal 2% increased Physical damage for 12 sec
  // after being the victim of any damaging attack.'
  Enrage: (rank, mods) => {
    mods.flags.enrageRank = rank;
  },

  // 'Your Berserker Rage ability will instantly generate 5 Rage.'
  'Improved Berserker Rage': (rank, mods) => {
    mods.flags.berserkerRageRage = 5 * rank;
  },
};

/** How much more a two-handed weapon does, once the talent is in. */
export function twoHandedBonus(mods: SpellMods): number {
  return 1 + (mods.flags.twoHandedDamage ?? 0);
}
