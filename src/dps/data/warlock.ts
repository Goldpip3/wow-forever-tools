/**
 * Warlock spells and the talents that change them.
 *
 * Forever renamed and rebuilt a great deal. Curse of Agony is Bane of Agony,
 * Nightfall and Improved Shadow Bolt read differently, Demonology gained
 * Demonic Pact, and Destruction ends in Incinerate. Every hook below is keyed by
 * the name in public/data/talents.generated.json and cites the description it
 * was read from.
 *
 * The spells the trees give a number for give the rank the talent teaches. The
 * ones with a Classic rank a level sixty warlock would cast use it and say so;
 * the new ones with no other rank are left out of the rotation, and the notes
 * say why.
 */

import type { SpellDef, TalentHook } from '../sim/spells';
import { addCastTime, addCritBonus, multiplyCost, multiplyDamage, multiplySchool } from '../sim/spells';

/* ---------------------------------------------------------------- numbers */

export const LIFE_TAP_MANA = 424;
export const SHADOW_TRANCE = { duration: 10 };
export const IMPROVED_SHADOW_BOLT = { duration: 12 };
export const SHADOW_AND_FLAME = { duration: 20 };
export const CONFLAGRATE_COOLDOWN = 10;

const classic = (note: string) => ({ status: 'unverified' as const, note });

/* ----------------------------------------------------------------- spells */

export const SHADOW_BOLT: SpellDef = {
  id: 'shadow-bolt',
  name: 'Shadow Bolt',
  icon: 'spell_shadow_shadowbolt',
  school: 'shadow',
  castTime: 3,
  cost: 380,
  minDamage: 482,
  maxDamage: 538,
  coefficient: 0.8571,
  forever: classic('Rank 10 at the Classic values.'),
};

export const CORRUPTION: SpellDef = {
  id: 'corruption',
  name: 'Corruption',
  icon: 'spell_shadow_abominationexplosion',
  school: 'shadow',
  castTime: 2,
  cost: 340,
  minDamage: 0,
  maxDamage: 0,
  coefficient: 0,
  dot: { ticks: 6, interval: 3, damage: 822, coefficient: 1 },
  forever: classic('Rank 7 at the Classic values: 822 over eighteen seconds.'),
};

export const BANE_OF_AGONY: SpellDef = {
  id: 'bane-of-agony',
  name: 'Bane of Agony',
  icon: 'spell_shadow_curseofsargeras',
  school: 'shadow',
  castTime: 0,
  cost: 265,
  minDamage: 0,
  maxDamage: 0,
  coefficient: 0,
  dot: { ticks: 12, interval: 2, damage: 1044, coefficient: 1 },
  forever: classic(
    'Classic\'s Curse of Agony under Forever\'s name, at Rank 6: 1044 over twenty-four seconds. ' +
      'Classic ramped the ticks up; here they are even.',
  ),
};

export const IMMOLATE: SpellDef = {
  id: 'immolate',
  name: 'Immolate',
  icon: 'spell_fire_immolation',
  school: 'fire',
  castTime: 2,
  cost: 380,
  minDamage: 279,
  maxDamage: 279,
  coefficient: 0.2,
  dot: { ticks: 5, interval: 3, damage: 510, coefficient: 0.65 },
  forever: classic('Rank 8 at the Classic values: 279 at once and 510 over fifteen seconds.'),
};

export const CONFLAGRATE: SpellDef = {
  id: 'conflagrate',
  name: 'Conflagrate',
  icon: 'spell_fire_fireball',
  school: 'fire',
  castTime: 0,
  cost: 305,
  minDamage: 447,
  maxDamage: 557,
  coefficient: 0.4286,
  forever: classic(
    'The Destruction tree gives 109 to 132, which is the rank the talent teaches. Rank 5 is taken ' +
      'at the Classic values, on a ten second cooldown.',
  ),
};

export const LIFE_TAP: SpellDef = {
  id: 'life-tap',
  name: 'Life Tap',
  icon: 'spell_shadow_burningspirit',
  school: 'shadow',
  castTime: 0,
  cost: 0,
  minDamage: 0,
  maxDamage: 0,
  coefficient: 0,
  restoresMana: LIFE_TAP_MANA,
  useBelowMana: 0.3,
  forever: classic('Rank 6 at the Classic values: 424 mana for 424 health, which is not counted.'),
};

export const WARLOCK_SPELLS: SpellDef[] = [
  SHADOW_BOLT, CORRUPTION, BANE_OF_AGONY, IMMOLATE, CONFLAGRATE, LIFE_TAP,
];

const DESTRUCTION = [SHADOW_BOLT, IMMOLATE, CONFLAGRATE];

/* --------------------------------------------------------------- talents */

export const WARLOCK_TALENT_HOOKS: Record<string, TalentHook> = {
  /* ------------------------------------------------------------ Affliction */

  // 'Increases the amount of Mana awarded by your Life Tap spell by 10%.'
  'Improved Life Tap': (rank, mods) => {
    mods.flags.lifeTap = 0.1 * rank;
  },

  // 'Increases your chance to hit with all spells and attacks by 1% ...'
  Suppression: (rank, mods) => {
    mods.spellHit += rank;
  },

  // 'Reduces the casting time of your Corruption spell by 0.4 sec and increases
  // the damage it deals by 2%.'
  'Improved Corruption': (rank, mods) => {
    addCastTime(mods, CORRUPTION.id, -0.4 * rank);
    multiplyDamage(mods, CORRUPTION.id, 1 + 0.02 * rank);
  },

  // 'Increases all periodic damage done by your Warlock spells by 1%.'
  Malediction: (rank, mods) => {
    mods.flags.malediction = 0.01 * rank;
  },

  // 'Increases the damage done by your Bane of Agony by 5%.'
  'Improved Bane of Agony': (rank, mods) => {
    multiplyDamage(mods, BANE_OF_AGONY.id, 1 + 0.05 * rank);
  },

  // 'Increases the critical effect chance of your Shadow spells by 1%.'
  Malevolence: (rank, mods) => {
    mods.spellCrit.shadow = (mods.spellCrit.shadow ?? 0) + rank;
  },

  // 'Gives your Corruption ... a 2% chance to cause you to enter a Shadow
  // Trance ... reduces the casting time of your next Shadow Bolt spell by 100%.'
  Nightfall: (rank, mods) => {
    mods.flags.nightfall = 0.02 * rank;
  },

  // 'Increases the damage dealt or life drained by your Shadow spells by 1%.'
  'Shadow Mastery': (rank, mods) => {
    multiplySchool(mods, 'shadow', 1 + 0.01 * rank);
  },

  /* ----------------------------------------------------------- Demonology */

  // Each of these depends on which demon is out, or whether it was sacrificed,
  // which the fight settings choose. The hook only records the rank.
  'Demonic Sacrifice': (_rank, mods) => {
    mods.flags.demonicSacrifice = 1;
  },
  'Soul Link': (_rank, mods) => {
    mods.flags.soulLink = 1;
  },
  // 'Increases your spell damage and healing by up to 33% of your level while
  // you have a summoned Demon pet active.'
  'Demonic Knowledge': (rank, mods) => {
    mods.flags.demonicKnowledge = 0.33 * rank;
  },
  // 'Imp - Increases Fire damage done by 2%. ... Succubus/Incubus - Increases
  // Shadow damage done by 2%.'
  'Master Demonologist': (rank, mods) => {
    mods.flags.masterDemonologist = 0.02 * rank;
  },

  /* ---------------------------------------------------------- Destruction */

  // 'Your Shadow Bolt critical strikes increase Shadow damage taken by the
  // target from your attacks by 4% for 12 sec.'
  'Improved Shadow Bolt': (rank, mods) => {
    mods.flags.improvedShadowBolt = 0.04 * rank;
  },

  // 'Reduces the casting time of your Shadow Bolt, Immolate, and Incinerate
  // spells by 0.1 sec ...'
  Bane: (rank, mods) => {
    addCastTime(mods, SHADOW_BOLT.id, -0.1 * rank);
    addCastTime(mods, IMMOLATE.id, -0.1 * rank);
  },

  // 'Reduces the Mana cost of your Destruction spells by 3%.'
  Cataclysm: (rank, mods) => {
    for (const spell of DESTRUCTION) multiplyCost(mods, spell.id, 1 - 0.03 * rank);
  },

  // 'Increases the initial damage of your Immolate spell by 10% ...' Only the
  // part that lands at once, so it is applied when it lands.
  Aftermath: (rank, mods) => {
    mods.flags.aftermath = 0.1 * rank;
  },

  // 'Increases the critical strike damage bonus of your Destruction spells by
  // 20%.' Every spell here that can crit is a Destruction spell.
  Ruin: (rank, mods) => {
    addCritBonus(mods, 'shadow', 0.5 * 0.2 * rank);
    addCritBonus(mods, 'fire', 0.5 * 0.2 * rank);
  },

  // '... the damage done by all your Destruction spells by 3%.'
  'Agonizing Flames': (rank, mods) => {
    for (const spell of DESTRUCTION) multiplyDamage(mods, spell.id, 1 + 0.03 * rank);
  },

  // 'Increases the critical strike chance of your Conflagrate spell by 8%.'
  'Fire and Brimstone': (rank, mods) => {
    mods.flags.fireAndBrimstone = 8 * rank;
  },

  // 'Hitting an enemy with Conflagrate increases all Shadow damage you deal by
  // 2% for 20 sec ... Conflagrate has a 20% chance not to consume Immolate.'
  'Shadow and Flame': (rank, mods) => {
    mods.flags.shadowAndFlame = 0.02 * rank;
    mods.flags.keepImmolate = 0.2 * rank;
  },
};
