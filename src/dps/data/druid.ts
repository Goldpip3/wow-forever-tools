/**
 * Druid abilities and the talents that change them, for Feral in Cat Form and,
 * further down, for Balance.
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

/* =============================================================== Balance */

/*
 * Balance is kept apart from the Feral hooks above rather than added to them,
 * because each tree lists the other's talents as doing nothing, and one shared
 * map would say every talent does something for both.
 *
 * The Balance tree gives Insect Swarm at the rank the talent teaches. The
 * Classic level sixty rank is used, and the note says so.
 */

export const NATURES_GRACE = { speed: 1.1, duration: 3 };
export const ECLIPSE = { perRank: 0.17, charges: 2, maxCharges: 4, duration: 15 };
export const BALANCE_OF_NATURE = { perRank: 0.01, duration: 10 };

export const WRATH: AbilityDef = {
  id: 'wrath',
  name: 'Wrath',
  icon: 'spell_nature_abolishmagic',
  school: 'nature',
  castTime: 2,
  cost: 180,
  minDamage: 236,
  maxDamage: 266,
  coefficient: 0.571,
  forever: classic('Rank 8 at the Classic values.'),
};

export const STARFIRE: AbilityDef = {
  id: 'starfire',
  name: 'Starfire',
  icon: 'spell_arcane_starfire',
  school: 'arcane',
  castTime: 3.5,
  cost: 340,
  minDamage: 463,
  maxDamage: 543,
  coefficient: 1,
  forever: classic('Rank 6 at the Classic values.'),
};

export const MOONFIRE: AbilityDef = {
  id: 'moonfire',
  name: 'Moonfire',
  icon: 'spell_nature_starfall',
  school: 'arcane',
  castTime: 0,
  cost: 375,
  minDamage: 195,
  maxDamage: 228,
  coefficient: 0.15,
  dot: { ticks: 4, interval: 3, damage: 384, coefficient: 0.52 },
  forever: classic('Rank 10 at the Classic values: 195 to 228 at once and 384 over twelve seconds.'),
};

export const INSECT_SWARM: AbilityDef = {
  id: 'insect-swarm',
  name: 'Insect Swarm',
  icon: 'spell_nature_insectswarm',
  school: 'nature',
  castTime: 0,
  cost: 110,
  minDamage: 0,
  maxDamage: 0,
  coefficient: 0,
  dot: { ticks: 6, interval: 2, damage: 324, coefficient: 0.76 },
  forever: classic(
    'The Balance tree gives 55 over twelve seconds, which is the rank the talent teaches. Rank 5 ' +
      'is taken at the Classic values.',
  ),
};

/** Classic's Major Mana Potion, the same one the mage drinks. */
export const DRUID_MANA_POTION: AbilityDef = {
  id: 'mana-potion',
  name: 'Major Mana Potion',
  icon: 'inv_potion_76',
  school: 'arcane',
  castTime: 0,
  gcd: 0,
  cost: 0,
  cooldown: 120,
  minDamage: 0,
  maxDamage: 0,
  coefficient: 0,
  restoresMana: 1800,
  useBelowMana: 0.7,
  forever: { status: 'unverified' },
};

export const BALANCE_ABILITIES: AbilityDef[] = [WRATH, STARFIRE, MOONFIRE, INSECT_SWARM, DRUID_MANA_POTION];

const BALANCE_SPELLS = [WRATH, STARFIRE, MOONFIRE, INSECT_SWARM];

export const BALANCE_TALENT_HOOKS: Record<string, TalentHook> = {
  "Nature's Majesty": DRUID_TALENT_HOOKS["Nature's Majesty"]!,
  "Nature's Reach": DRUID_TALENT_HOOKS["Nature's Reach"]!,
  Naturalist: DRUID_TALENT_HOOKS.Naturalist!,

  // 'Increases the periodic damage and healing done by your spells and
  // abilities by 1%.'
  Genesis: (rank, mods) => {
    mods.flags.periodicDamage = 0.01 * rank;
  },

  // 'Reduces the cast time of your Wrath spell by 0.1 sec and its Mana cost by 10%.'
  'Improved Wrath': (rank, mods) => {
    mods.castTime[WRATH.id] = (mods.castTime[WRATH.id] ?? 0) - 0.1 * rank;
    mods.cost[WRATH.id] = (mods.cost[WRATH.id] ?? 1) * (1 - 0.1 * rank);
  },

  // 'Reduces the Mana cost of your spells by 3%.'
  Moonglow: (rank, mods) => {
    for (const spell of BALANCE_SPELLS) mods.cost[spell.id] = (mods.cost[spell.id] ?? 1) * (1 - 0.03 * rank);
  },

  // 'Increases the damage and critical strike chance of your Moonfire spell by 5%.'
  'Improved Moonfire': (rank, mods) => {
    multiplyDamage(mods, MOONFIRE.id, 1 + 0.05 * rank);
    mods.flags.improvedMoonfire = 5 * rank;
  },

  // 'Increases the duration of your Moonfire ... by 3 sec ... and your Insect
  // Swarm spell by 2 sec.' One tick more on each.
  "Nature's Splendor": (_rank, mods) => {
    mods.dotTicks[MOONFIRE.id] = (mods.dotTicks[MOONFIRE.id] ?? 0) + 1;
    mods.dotTicks[INSECT_SWARM.id] = (mods.dotTicks[INSECT_SWARM.id] ?? 0) + 1;
  },

  // 'Each time you cast a Nature spell, your next Arcane damage spell within 10
  // sec deals 1% increased damage', and the other way round.
  'Balance of Nature': (rank, mods) => {
    mods.flags.balanceOfNature = BALANCE_OF_NATURE.perRank * rank;
  },

  // 'Increases the critical strike damage bonus of your Arcane and Nature
  // spells by 20%.'
  Vengeance: (rank, mods) => {
    mods.critBonus.arcane = (mods.critBonus.arcane ?? 0) + 0.5 * 0.2 * rank;
    mods.critBonus.nature = (mods.critBonus.nature ?? 0) + 0.5 * 0.2 * rank;
  },

  // 'Reduces the cast time of Starfire by 0.1 sec ...'
  'Improved Starfire': (rank, mods) => {
    mods.castTime[STARFIRE.id] = (mods.castTime[STARFIRE.id] ?? 0) - 0.1 * rank;
  },

  "Nature's Grace": (_rank, mods) => {
    mods.flags.naturesGrace = 1;
  },

  // 'Your Wrath spell reduces the cast time of your next 2 Starfire spells by
  // 0.17 sec. Stores up to 4 charges.'
  Eclipse: (rank, mods) => {
    mods.flags.eclipse = ECLIPSE.perRank * rank;
  },

  // 'Increases the damage done by your Arcane and Nature spells by 1%.'
  Moonfury: (rank, mods) => {
    for (const school of ['arcane', 'nature'] as const) {
      mods.schoolDamage[school] = (mods.schoolDamage[school] ?? 1) * (1 + 0.01 * rank);
    }
  },

  // '... all party members within 45 yards have their critical chance increased
  // by 3%.' The druid is one of them; the fight settings decide whether it is
  // already counted as a raid buff.
  'Moonkin Form': (_rank, mods) => {
    mods.flags.moonkinForm = 1;
  },

  // 'Allows 17% of your Mana regeneration to continue while casting.'
  Reflection: (rank, mods) => {
    mods.flags.castingRegen = 0.17 * rank;
  },
};
