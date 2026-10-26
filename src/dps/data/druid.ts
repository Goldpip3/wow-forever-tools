/**
 * Druid abilities and the talents that change them, for Feral in Cat Form and,
 * further down, for Balance.
 *
 * Forever's Feral tree is its own. Berserk makes every combo point strike a
 * critical one, Blood Frenzy hands a point back on a critical strike, and Rend
 * and Tear rewards a bleeding target. Primal Bite, the talent that took Mangle's place, needs
 * Bear Form, so a cat never presses it. Every hook below is keyed by the name in
 * public/data/talents.generated.json and cites the description it was read
 * from.
 *
 * Claw, Shred, Rake, Rip, Ferocious Bite, Tiger's Fury and the Balance spells
 * are the highest rank a level sixty druid learns, as the beta client gives it
 * at build 1.60.1.70009. Where the client gives no attack power or spell power
 * share, the Classic one is kept and the note says so. The paws are not given
 * anywhere: what a cat hits for before attack power is a Classic figure.
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

/** 'Increases Physical damage done by 15% for 6 sec.' on a 30 sec cooldown. */
export const TIGERS_FURY = { duration: 6, damage: 0.15, cooldown: 30 };
export const BERSERK = { duration: 15, cooldown: 180 };
/**
 * Rank 6: 243 over twelve seconds at one point and 153 more for each point
 * after, so 855 at five.
 */
export const RIP = { base: 90, perPoint: 153, ticks: 6, interval: 2 };
export const RAKE = { bleed: 102, ticks: 3, interval: 3 };

const same = (note: string) => ({ status: 'same' as const, note });
const changed = (note: string) => ({ status: 'changed' as const, note });

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
  weapon: { hand: 'main', multiplier: 1.1, flat: 126, normalised: false },
  forever: changed(
    'Rank 5 in the beta client at build 1.60.1.70009: 110% of normal damage plus 126. Classic ' +
      'added a flat 115.',
  ),
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
  weapon: { hand: 'main', multiplier: 1.55, flat: 180, normalised: false },
  forever: changed(
    'Rank 5 in the beta client at build 1.60.1.70009: 155% damage plus 180, from behind only. ' +
      'Classic was 225%.',
  ),
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
  weapon: { hand: 'main', multiplier: 0, flat: 61, normalised: false },
  forever: changed(
    'Rank 4 in the beta client at build 1.60.1.70009: 61 damage and 102 more over 9 sec. Classic ' +
      'was 66 and 90.',
  ),
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
  forever: changed(
    'Rank 6 in the beta client at build 1.60.1.70009: 855 over 12 sec at five combo points. The ' +
      'client says it grows with attack power but not by how much, so here it does not.',
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
  // A fifth of the five point figure, which is exact at five points, the only
  // number of points the rotation bites at.
  comboDamage: { min: 157.4, max: 169.4, apCoefficient: 0.03 },
  weapon: { hand: 'main', multiplier: 0, flat: 0, normalised: false },
  forever: same(
    'Rank 5 in the beta client at build 1.60.1.70009: 787 to 847 at five combo points. The ' +
      'attack power share is Classic’s, and energy left over is not turned into more damage here.',
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
  cost: 0,
  cooldown: TIGERS_FURY.cooldown,
  minDamage: 0,
  maxDamage: 0,
  coefficient: 0,
  forever: changed(
    'Physical damage up 15% for 6 sec on a 30 sec cooldown, at no energy cost, in the beta client ' +
      'at build 1.60.1.70009. Classic cost 30 energy for a flat bonus on each hit.',
  ),
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
  forever: {
    status: 'new',
    note:
      'Fifteen seconds of every combo point strike a critical one, on a 3 min cooldown, in the ' +
      'beta client at build 1.60.1.70009. What it does to Primal Bite needs Bear Form.',
  },
};

export const FERAL_ABILITIES: AbilityDef[] = [
  CLAW,
  SHRED,
  RAKE_SPELL,
  RIP_SPELL,
  FEROCIOUS_BITE,
  TIGERS_FURY_SPELL,
  BERSERK_SPELL,
];

/** Strikes that earn a combo point, which Blood Frenzy and Berserk both read. */
export const GENERATORS = new Set(['claw', 'shred', 'rake']);

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

  // 'Reduces the cost of your Maul, Primal Bite, Swipe, Claw, and Rake abilities
  // by 1 Rage or Energy.' Maul, Primal Bite and Swipe are Bear Form's.
  Ferocity: (rank, mods) => {
    for (const id of [CLAW.id, RAKE_SPELL.id]) reduceCost(mods, id, rank);
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
  'Blood Frenzy': (rank, mods) => {
    mods.flags.bloodFrenzy = 0.5 * rank;
  },

  // 'Increases the critical strike damage bonus of your melee abilities by 10%
  // and increases your spell healing by 12% of your Intellect.' Abilities alone,
  // so the paws' own swings are left as they were. Healing is not simulated.
  'Natural Instinct': (rank, mods) => {
    mods.critBonus.physical = (mods.critBonus.physical ?? 0) + 0.1 * rank;
  },

  // 'While in Cat Form ... increases the melee and ranged Critical Strike chance of
  // all party or raid members within 45 yards by 3%.' The druid is one of them.
  'Leader of the Pack': (_rank, mods) => {
    mods.meleeCrit += 3;
  },

  // 'Increases damage done by your melee abilities on Bleeding targets by 2%.'
  'Rend and Tear': (rank, mods) => {
    mods.flags.rendAndTear = 0.02 * rank;
  },

  // 'Causes your Primal Bite ability to strike up to 3 targets, removes its
  // cooldown, and increases the critical strike chance of your Combo
  // Point-generating abilities by 100%.' Primal Bite needs Bear Form, so a cat
  // only gets the crit. It is a button; the hook only says the druid has it.
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
 * level sixty rank from the spellbook is used instead.
 */

export const NATURES_GRACE = { speed: 1.1, duration: 3 };
export const ECLIPSE = { perRank: 0.17, charges: 2, maxCharges: 4, duration: 15 };
export const BALANCE_OF_NATURE = { perRank: 0.01, duration: 10 };
/** Moonglow's mana cost cut at each rank: 8%, 17% and 25%. */
export const MOONGLOW = [0.08, 0.17, 0.25];

export const WRATH: AbilityDef = {
  id: 'wrath',
  name: 'Wrath',
  icon: 'spell_nature_abolishmagic',
  school: 'nature',
  castTime: 2,
  cost: 120,
  minDamage: 92,
  maxDamage: 102,
  coefficient: 0.571,
  forever: changed(
    'Rank 8 in the beta client at build 1.60.1.70009: 92 to 102 for 120 mana, with 57.1% of ' +
      'spell power. Classic was 248 to 276 for 180.',
  ),
};

export const STARFIRE: AbilityDef = {
  id: 'starfire',
  name: 'Starfire',
  icon: 'spell_arcane_starfire',
  school: 'arcane',
  castTime: 3.5,
  cost: 340,
  minDamage: 350,
  maxDamage: 412,
  coefficient: 1,
  forever: changed(
    'Rank 7 in the beta client at build 1.60.1.70009: 350 to 412, with all of spell power. ' +
      'Classic was 496 to 584.',
  ),
};

export const MOONFIRE: AbilityDef = {
  id: 'moonfire',
  name: 'Moonfire',
  icon: 'spell_nature_starfall',
  school: 'arcane',
  castTime: 0,
  cost: 375,
  minDamage: 128,
  maxDamage: 150,
  coefficient: 0.15,
  dot: { ticks: 4, interval: 3, damage: 240, coefficient: 0.52 },
  forever: changed(
    'Rank 10 in the beta client at build 1.60.1.70009: 128 to 150 at once and 240 over 12 sec, ' +
      'with 15% of spell power and 13% a tick.',
  ),
};

export const INSECT_SWARM: AbilityDef = {
  id: 'insect-swarm',
  name: 'Insect Swarm',
  icon: 'spell_nature_insectswarm',
  school: 'nature',
  castTime: 0,
  cost: 160,
  minDamage: 0,
  maxDamage: 0,
  coefficient: 0,
  dot: { ticks: 6, interval: 2, damage: 186, coefficient: 0.948 },
  forever: changed(
    'Rank 5 in the beta client at build 1.60.1.70009: 186 over 12 sec for 160 mana, with 15.8% ' +
      'of spell power a tick.',
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

  // 'Reduces the Mana cost of your damaging spells by 8%.' That is the first
  // rank; the third is 25%.
  Moonglow: (rank, mods) => {
    const off = MOONGLOW[Math.min(rank, MOONGLOW.length) - 1] ?? 0;
    for (const spell of BALANCE_SPELLS) mods.cost[spell.id] = (mods.cost[spell.id] ?? 1) * (1 - off);
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

  /* Balance of Nature is not in the Balance tree as of build 1.60.1.70009. The
     simulator still knows how to run it, so if a later build brings it back this
     hook is the only thing that needs to come with it:

       'Balance of Nature': (rank, mods) => {
         mods.flags.balanceOfNature = BALANCE_OF_NATURE.perRank * rank;
       },
  */

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

  // 'Increases the damage done by your Arcane and Nature spells by 2%.' Ten at
  // five ranks.
  Moonfury: (rank, mods) => {
    for (const school of ['arcane', 'nature'] as const) {
      mods.schoolDamage[school] = (mods.schoolDamage[school] ?? 1) * (1 + 0.02 * rank);
    }
  },

  // '... all party or raid members within 45 yards have their spell Critical Strike
  // chance increased by 3%.' The druid is one of them; the fight settings decide whether it is
  // already counted as a raid buff.
  'Moonkin Form': (_rank, mods) => {
    mods.flags.moonkinForm = 1;
  },

  // 'Allows 17% of your Mana regeneration to continue while casting.'
  Reflection: (rank, mods) => {
    mods.flags.castingRegen = 0.17 * rank;
  },
};
