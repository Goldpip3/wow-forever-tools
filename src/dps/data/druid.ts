/**
 * Druid abilities and the talents that change them, for Feral in Cat Form.
 *
 * Forever's Feral tree is its own. Mangle is a Cat Form strike for the whole
 * weapon plus twenty-six, Berserk takes its cooldown away, Rend and Tear rewards
 * a bleeding target, and King of the Jungle hands energy back through Tiger's
 * Fury. Every hook below is keyed by the name in
 * public/data/talents.generated.json and cites the description it was read
 * from.
 *
 * The trees say nothing about Claw, Shred, Rake, Rip or Ferocious Bite
 * themselves, so those are their Classic level-sixty values and say so. So are
 * the paws: what a cat hits for before attack power is not given anywhere.
 */

import type { AbilityDef, TalentHook } from '../sim/spells';
import { multiplyDamage, reduceCost } from '../sim/spells';
import type { WeaponStats } from '../sim/types';

/* ---------------------------------------------------------------- numbers */

/** A cat swings its paws once a second whatever is equipped. */
export const CAT_PAWS: WeaponStats = {
  min: 40,
  max: 60,
  speed: 1,
  skill: 300,
  type: 'Paws',
  twoHanded: false,
};

/** What Cat Form adds to the attack power a druid has standing up. */
export const CAT_FORM = {
  /** Each point of agility is a point of attack power in the form. */
  apPerAgility: 1,
  /** Twice the level, less the twenty the caster sheet already counts. */
  flat: 120,
};

export const TIGERS_FURY = { duration: 6, bonus: 40, cooldown: 0 };
export const BERSERK = { duration: 15, cooldown: 180 };
export const MANGLE = { cooldown: 6 };
export const RIP = { perPoint: 222, ticks: 6, interval: 2 };
export const RAKE = { bleed: 90, ticks: 3, interval: 3 };

const changed = (note: string) => ({ status: 'changed' as const, note });
const classic = (note?: string) =>
  (note ? { status: 'unverified' as const, note } : { status: 'unverified' as const });

/* -------------------------------------------------------------- abilities */

export const CLAW: AbilityDef = {
  id: 'claw',
  name: 'Claw',
  icon: 'ability_druid_rake',
  school: 'physical',
  kind: 'melee',
  resource: 'energy',
  castTime: 0,
  cost: 45,
  minDamage: 0,
  maxDamage: 0,
  coefficient: 0,
  combo: { generates: 1 },
  weapon: { hand: 'main', multiplier: 1, flat: 115, normalised: false },
  forever: classic('Rank 6 at the Classic values: the paws plus a hundred and fifteen.'),
};

export const SHRED: AbilityDef = {
  id: 'shred',
  name: 'Shred',
  icon: 'spell_shadow_vampiricaura',
  school: 'physical',
  kind: 'melee',
  resource: 'energy',
  castTime: 0,
  cost: 60,
  minDamage: 0,
  maxDamage: 0,
  coefficient: 0,
  combo: { generates: 1 },
  fromBehind: true,
  weapon: { hand: 'main', multiplier: 2.25, flat: 180, normalised: false },
  forever: classic('Rank 5 at the Classic values: the paws two and a quarter times over, plus 180. Only from behind.'),
};

export const MANGLE_SPELL: AbilityDef = {
  id: 'mangle',
  name: 'Mangle',
  icon: 'ability_druid_mangle2',
  school: 'physical',
  kind: 'melee',
  resource: 'energy',
  castTime: 0,
  cost: 45,
  minDamage: 0,
  maxDamage: 0,
  coefficient: 0,
  combo: { generates: 1 },
  weapon: { hand: 'main', multiplier: 1, flat: 26, normalised: false },
  forever: {
    status: 'new',
    note:
      'The normal damage plus twenty-six is what the Feral tree says. Its cost and cooldown are ' +
      'not given; forty-five energy and six seconds are assumed, because Berserk says it has one.',
  },
};

export const RAKE_SPELL: AbilityDef = {
  id: 'rake',
  name: 'Rake',
  icon: 'ability_druid_disembowel',
  school: 'physical',
  kind: 'melee',
  resource: 'energy',
  castTime: 0,
  cost: 40,
  minDamage: 0,
  maxDamage: 0,
  coefficient: 0,
  combo: { generates: 1 },
  weapon: { hand: 'main', multiplier: 0, flat: 66, normalised: false },
  forever: classic('Rank 4 at the Classic values: sixty-six up front and ninety more over nine seconds.'),
};

/** The bleed finisher. Its damage is worked out from the points it spent. */
export const RIP_SPELL: AbilityDef = {
  id: 'rip',
  name: 'Rip',
  icon: 'ability_ghoulfrenzy',
  school: 'physical',
  kind: 'melee',
  resource: 'energy',
  castTime: 0,
  cost: 30,
  minDamage: 0,
  maxDamage: 0,
  coefficient: 0,
  combo: { spends: true },
  weapon: { hand: 'main', multiplier: 0, flat: 0, normalised: false },
  forever: classic(
    'Rank 6 at the Classic values, 222 over twelve seconds for each combo point. It does not ' +
      'grow with attack power, which in Classic it did not.',
  ),
};

export const FEROCIOUS_BITE: AbilityDef = {
  id: 'ferocious-bite',
  name: 'Ferocious Bite',
  icon: 'ability_druid_ferociousbite',
  school: 'physical',
  kind: 'melee',
  resource: 'energy',
  castTime: 0,
  cost: 35,
  minDamage: 0,
  maxDamage: 0,
  coefficient: 0,
  combo: { spends: true },
  comboDamage: { min: 157, max: 175, apCoefficient: 0.03 },
  weapon: { hand: 'main', multiplier: 0, flat: 0, normalised: false },
  forever: classic(
    'Rank 5 at the Classic values, about 785 to 875 at five combo points. Energy left over after ' +
      'it is not turned into more damage here.',
  ),
};

export const TIGERS_FURY_SPELL: AbilityDef = {
  id: 'tigers-fury',
  name: "Tiger's Fury",
  icon: 'ability_mount_jungletiger',
  school: 'physical',
  kind: 'item',
  resource: 'energy',
  castTime: 0,
  gcd: 0,
  cost: 30,
  minDamage: 0,
  maxDamage: 0,
  coefficient: 0,
  forever: classic('Rank 4 at the Classic values: forty more damage on every hit for six seconds.'),
};

export const BERSERK_SPELL: AbilityDef = {
  id: 'berserk',
  name: 'Berserk',
  icon: 'ability_druid_berserk',
  school: 'physical',
  kind: 'item',
  resource: 'energy',
  castTime: 0,
  gcd: 0,
  cost: 0,
  cooldown: BERSERK.cooldown,
  minDamage: 0,
  maxDamage: 0,
  coefficient: 0,
  forever: changed(
    'Fifteen seconds of Mangle with no cooldown and every combo point strike a critical one, from ' +
      'the Feral tree. The tree gives no cooldown; three minutes is assumed.',
  ),
};

export const FERAL_ABILITIES: AbilityDef[] = [
  CLAW,
  SHRED,
  MANGLE_SPELL,
  RAKE_SPELL,
  RIP_SPELL,
  FEROCIOUS_BITE,
  TIGERS_FURY_SPELL,
  BERSERK_SPELL,
];

/** Strikes that earn a combo point, which Primal Fury and Berserk both read. */
export const GENERATORS = new Set(['claw', 'shred', 'mangle', 'rake']);

/* --------------------------------------------------------------- talents */

export const DRUID_TALENT_HOOKS: Record<string, TalentHook> = {
  /* --------------------------------------------------------------- Balance */

  // 'Increases the periodic damage and healing done by your spells and
  // abilities by 1%.'
  Genesis: (rank, mods) => {
    mods.flags.periodicDamage = 0.01 * rank;
  },

  // 'Increases your critical strike chance with spells and melee attacks by 2%.'
  "Nature's Majesty": (rank, mods) => {
    mods.meleeCrit += 2 * rank;
    for (const school of ['nature', 'arcane'] as const) {
      mods.spellCrit[school] = (mods.spellCrit[school] ?? 0) + 2 * rank;
    }
  },

  // '... increases the chance for all your spells and attacks to hit by 2%.'
  "Nature's Reach": (rank, mods) => {
    mods.meleeHit += 2 * rank;
    mods.spellHit += 2 * rank;
  },

  /* ---------------------------------------------------------- Feral Combat */

  // 'Reduces the cost of your Maul, Mangle, Swipe, Claw, and Rake abilities by
  // 1 Rage or Energy.'
  Ferocity: (rank, mods) => {
    for (const id of [MANGLE_SPELL.id, CLAW.id, RAKE_SPELL.id]) reduceCost(mods, id, rank);
  },

  // '... while in Cat Form your Strength is increased by 2%.' The intellect and
  // the bear stamina do nothing to a cat's damage.
  'Heart of the Wild': (rank, mods) => {
    mods.flags.catStrength = 0.02 * rank;
  },

  // 'Increases the damage caused by your Claw, Rake, Shred, Maul, and Swipe
  // abilities by 5%.'
  'Savage Fury': (rank, mods) => {
    for (const id of [CLAW.id, RAKE_SPELL.id, SHRED.id]) multiplyDamage(mods, id, 1 + 0.05 * rank);
    mods.flags.rakeBleed = 0.05 * rank;
  },

  // 'Increases your critical strike chance while in Bear Form, Dire Bear Form,
  // or Cat Form by 6%.' That is the second rank; the first is 3%.
  'Sharpened Claws': (rank, mods) => {
    mods.meleeCrit += 3 * rank;
  },

  // 'Reduces the Energy cost of your Shred ability by 6 ...'
  'Shredding Attacks': (rank, mods) => {
    reduceCost(mods, SHRED.id, 6 * rank);
  },

  // 'Increases your melee Attack Power by 50% of your level.'
  'Predatory Strikes': (rank, mods) => {
    mods.flags.predatoryStrikes = 0.5 * rank;
  },

  // '... your non-periodic critical strikes from Cat Form abilities that
  // generate Combo Points have a 50% chance to add an additional Combo Point.'
  'Primal Fury': (rank, mods) => {
    mods.flags.primalFury = 0.5 * rank;
  },

  // 'Increases the critical strike damage bonus of your melee abilities by 10%.'
  // Abilities alone, so the paws' own swings are left as they were.
  'Predatory Instincts': (rank, mods) => {
    mods.critBonus.physical = (mods.critBonus.physical ?? 0) + 0.1 * rank;
  },

  // 'While in Cat Form ... increases the critical strike chance of all party
  // members within 45 yards by 3%.' The druid is one of them.
  'Leader of the Pack': (_rank, mods) => {
    mods.meleeCrit += 3;
  },

  // "Tiger's Fury now instantly grants you 20 Energy." Only the first rank is
  // given; twenty a rank is assumed.
  'King of the Jungle': (rank, mods) => {
    mods.flags.kingOfTheJungle = 20 * rank;
  },

  // 'Increases damage done by your melee abilities on Bleeding targets by 2%.'
  'Rend and Tear': (rank, mods) => {
    mods.flags.rendAndTear = 0.02 * rank;
  },

  // 'Causes your Mangle ability to strike up to 3 targets, removes its
  // cooldown, and increases the critical strike chance of your Combo
  // Point-generating abilities by 100%.' It is a button; the hook only says
  // the druid has it.
  Berserk: (_rank, mods) => {
    mods.flags.berserk = 1;
  },

  /* ----------------------------------------------------------- Restoration */

  // '... increases all damage you deal by 1%.'
  Naturalist: (rank, mods) => {
    mods.physicalDamage *= 1 + 0.01 * rank;
    for (const school of ['nature', 'arcane'] as const) {
      mods.schoolDamage[school] = (mods.schoolDamage[school] ?? 1) * (1 + 0.01 * rank);
    }
  },
};
