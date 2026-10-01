/**
 * Hunter shots and the talents that change them.
 *
 * Forever's hunter trees are new in most places. Marksmanship ends in Sniper
 * Shot and has Lone Wolf, Careful Aim and Barrage; Beast Mastery has Deadly
 * Aspects and Focused Fire; Survival has turned towards melee. Every hook below
 * is keyed by the name in public/data/talents.generated.json and cites the
 * description it was read from.
 *
 * Each shot is the highest rank a level sixty can learn, read from the beta
 * client's own tooltip at build 1.60.1.70009. Where the tooltip leaves a number
 * out, the Classic one stands in and the note says so. The arrows are assumed
 * too: the export does not say what is in the quiver.
 */

import type { AbilityDef, TalentHook } from '../sim/spells';
import { multiplyCost, multiplyDamage } from '../sim/spells';

/* ---------------------------------------------------------------- numbers */

/** Damage per second the ammunition adds to the weapon: Thorium Headed Arrows. */
export const AMMO_DPS = 17.5;

/** Ranged attack power the hunter puts up before the pull. */
export const ASPECT_OF_THE_HAWK = { rangedAttackPower: 120 };
/**
 * Rank 4, learned at 58: 71 ranged attack power for everyone attacking the
 * target. Rank 3 reads 98 in the same client, so one of the two tooltips may be
 * wrong; the highest rank's own text is what is used.
 */
export const HUNTERS_MARK = { rangedAttackPower: 71 };

export const RAPID_FIRE = { haste: 0.4, duration: 15, cooldown: 300 };
export const DEADLY_ASPECTS = { haste: 0.3, duration: 12 };
export const SERPENT_STING = { damage: 555, ticks: 5, interval: 3 };
/** Started by the spec, because Improved Arcane Shot shortens it. */
export const ARCANE_SHOT_COOLDOWN = 6;

export const AIMED_SHOT_CAST = 2;
export const SNIPER_SHOT_CAST = 4;
/** "Aimed Shot shares its cooldown with Multi-Shot", and the other way round. */
export const SHARED_SHOT_COOLDOWN = 6;

/** Hunter base mana at sixty, for the costs the client gives as a share of it. */
const BASE_MANA = 1691;

const classic = (note?: string) =>
  (note ? { status: 'unverified' as const, note } : { status: 'unverified' as const });
const changed = (note: string) => ({ status: 'changed' as const, note });

/* -------------------------------------------------------------- abilities */

export const AIMED_SHOT: AbilityDef = {
  id: 'aimed-shot',
  name: 'Aimed Shot',
  icon: 'inv_spear_07',
  school: 'physical',
  kind: 'ranged',
  resource: 'mana',
  castTime: AIMED_SHOT_CAST,
  cost: 310,
  cooldown: SHARED_SHOT_COOLDOWN,
  minDamage: 0,
  maxDamage: 0,
  coefficient: 0,
  weapon: { hand: 'ranged', multiplier: 1, flat: 166, normalised: false },
  forever: changed(
    'Rank 6 in the beta client at build 1.60.1.70009: the weapon plus 166, two seconds to cast, ' +
      '310 mana, and a six second cooldown shared with Multi-Shot. Classic was the weapon plus 600 ' +
      'over three seconds. Auto Shot starting over once it is loosed is carried over from Classic.',
  ),
};

export const MULTI_SHOT: AbilityDef = {
  id: 'multi-shot',
  name: 'Multi-Shot',
  icon: 'ability_upgrademoonglaive',
  school: 'physical',
  kind: 'ranged',
  resource: 'mana',
  castTime: 0.5,
  cost: Math.round(BASE_MANA * 0.139),
  cooldown: SHARED_SHOT_COOLDOWN,
  minDamage: 0,
  maxDamage: 0,
  coefficient: 0,
  aoe: { maxTargets: 3 },
  weapon: { hand: 'ranged', multiplier: 1, flat: 150, normalised: false },
  forever: classic(
    'The beta client at build 1.60.1.70009 has one rank: half a second to cast, 13.9% of base ' +
      'mana, three targets, and a six second cooldown shared with Aimed Shot. It gives no damage, ' +
      'so the weapon plus 150 is Classic Rank 5.',
  ),
};

export const ARCANE_SHOT: AbilityDef = {
  id: 'arcane-shot',
  name: 'Arcane Shot',
  icon: 'ability_impalingbolt',
  school: 'arcane',
  kind: 'ranged',
  resource: 'mana',
  castTime: 0,
  cost: 190,
  minDamage: 0,
  maxDamage: 0,
  coefficient: 0,
  weapon: { hand: 'ranged', multiplier: 0, flat: 217, normalised: false },
  forever: changed(
    'Rank 8 in the beta client at build 1.60.1.70009: 217 Arcane damage for 190 mana, every six ' +
      'seconds. Classic was 183. Armor does not touch it.',
  ),
};

/** The sting. The shot itself does nothing; the damage is all over time. */
export const SERPENT_STING_SPELL: AbilityDef = {
  id: 'serpent-sting',
  name: 'Serpent Sting',
  icon: 'ability_hunter_quickshot',
  school: 'nature',
  kind: 'ranged',
  resource: 'mana',
  castTime: 0,
  cost: 250,
  minDamage: 0,
  maxDamage: 0,
  coefficient: 0,
  weapon: { hand: 'ranged', multiplier: 0, flat: 0, normalised: false },
  forever: {
    status: 'same',
    note: 'Rank 9 in the beta client at build 1.60.1.70009: 555 Nature damage over 15 sec for 250 mana, as in Classic.',
  },
};

export const SNIPER_SHOT: AbilityDef = {
  id: 'sniper-shot',
  name: 'Sniper Shot',
  icon: 'ability_hunter_snipershot',
  school: 'physical',
  kind: 'ranged',
  resource: 'mana',
  castTime: SNIPER_SHOT_CAST,
  cost: 365,
  cooldown: 15,
  minDamage: 0,
  maxDamage: 0,
  coefficient: 0,
  weapon: { hand: 'ranged', multiplier: 1, flat: 295, normalised: false },
  forever: {
    status: 'new',
    note:
      'Rank 3, learned at 58, in the beta client at build 1.60.1.70009: the weapon plus 295, four ' +
      'seconds to cast, 365 mana and a fifteen second cooldown. That Auto Shot waits for it rather ' +
      'than starting over is assumed.',
  },
};

export const RAPID_FIRE_SPELL: AbilityDef = {
  id: 'rapid-fire',
  name: 'Rapid Fire',
  icon: 'ability_hunter_runningshot',
  school: 'physical',
  kind: 'item',
  resource: 'mana',
  castTime: 0,
  gcd: 0,
  cost: 100,
  minDamage: 0,
  maxDamage: 0,
  coefficient: 0,
  forever: changed(
    'Forty per cent faster for fifteen seconds, every five minutes, for 100 mana, at build ' +
      '1.60.1.70009. Forever adds melee attack speed, which a hunter who is shooting does not use.',
  ),
};

export const HUNTER_ABILITIES: AbilityDef[] = [
  AIMED_SHOT,
  MULTI_SHOT,
  ARCANE_SHOT,
  SERPENT_STING_SPELL,
  SNIPER_SHOT,
  RAPID_FIRE_SPELL,
];

/** Everything a hunter shoots, for the talents that speak about shots. */
const SHOTS = [AIMED_SHOT, MULTI_SHOT, ARCANE_SHOT, SNIPER_SHOT];

/* --------------------------------------------------------------- talents */

export const HUNTER_TALENT_HOOKS: Record<string, TalentHook> = {
  /* --------------------------------------------------------- Beast Mastery */

  // 'While Aspect of the Hawk is active, Auto Shot has a 2% chance of
  // increasing ranged attack speed by 30% for 12 sec.'
  'Deadly Aspects': (rank, mods) => {
    mods.flags.deadlyAspects = 0.02 * rank;
  },

  // 'Increases all damage you and your pet deal by 1% while your pet is
  // active.' Read by the pet choice in the fight settings.
  'Focused Fire': (rank, mods) => {
    mods.flags.focusedFire = 0.01 * rank;
  },

  // '... allows 25% of your Mana regeneration to continue while casting.'
  'Bestial Discipline': (rank, mods) => {
    mods.flags.castingRegen = 0.25 * rank;
  },

  /* ---------------------------------------------------------- Marksmanship */

  // 'Increases your critical strike chance with all attacks by 1%.'
  'Lethal Attacks': (rank, mods) => {
    mods.meleeCrit += rank;
  },

  // 'Increases the damage of your Serpent Sting ability by 6% ...'
  'Improved Stings': (rank, mods) => {
    mods.flags.stingDamage = 0.06 * rank;
  },

  // 'Reduces the Mana cost of your Shots, Stings, and melee abilities by 3%.'
  Efficiency: (rank, mods) => {
    for (const shot of [...SHOTS, SERPENT_STING_SPELL]) multiplyCost(mods, shot.id, 1 - 0.03 * rank);
  },

  // 'Increases your Attack Power by 20% of your Intellect.'
  'Careful Aim': (rank, mods) => {
    mods.flags.carefulAim = 0.2 * rank;
  },

  // 'Reduces the cooldown on your Rapid Fire ability by 1 min.'
  'Rapid Killing': (rank, mods) => {
    mods.flags.rapidFireCooldownOff = 60 * rank;
  },

  // 'Reduces the cooldown of your Arcane Shot by 0.3 sec.'
  'Improved Arcane Shot': (rank, mods) => {
    mods.flags.arcaneShotCooldownOff = 0.3 * rank;
  },

  // 'You deal 20% increased damage with all attacks while you do not have an
  // active pet.' Read by the pet choice in the fight settings.
  'Lone Wolf': (_rank, mods) => {
    mods.flags.loneWolf = 0.2;
  },

  // 'Increases the critical strike damage bonus on all ranged abilities by 6%.'
  // Auto Shot is one, so it is the weapon bonus that moves.
  'Mortal Shots': (rank, mods) => {
    mods.meleeCritBonus += 0.06 * rank;
  },

  // 'Increases the damage done by your Multi-Shot, Aimed Shot, and Volley
  // abilities by 3%.'
  Barrage: (rank, mods) => {
    for (const shot of [MULTI_SHOT, AIMED_SHOT]) multiplyDamage(mods, shot.id, 1 + 0.03 * rank);
  },

  // 'Increases the damage you deal with ranged weapons by 5%.' At five ranks.
  'Ranged Weapon Specialization': (rank, mods) => {
    mods.physicalDamage *= 1 + 0.01 * rank;
    mods.schoolDamage.arcane = (mods.schoolDamage.arcane ?? 1) * (1 + 0.01 * rank);
  },

  /* -------------------------------------------------------------- Survival */

  // 'Increases your hit chance by 1% ...'
  Surefooted: (rank, mods) => {
    mods.meleeHit += rank;
  },
};
