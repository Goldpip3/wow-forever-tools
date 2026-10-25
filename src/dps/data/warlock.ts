/**
 * Warlock spells and the talents that change them.
 *
 * Forever renamed and rebuilt a great deal. Curse of Agony is Bane of Agony,
 * Nightfall and Improved Shadow Bolt read differently, Demonology gained
 * Demonic Pact, and Destruction ends in Incinerate. Every hook below is keyed by
 * the name in public/data/talents.generated.json and cites the description it
 * was read from.
 *
 * Every spell is the highest rank a level sixty warlock learns, at the numbers
 * the beta client gives (build 1.60.1.70009). Forever's spells hit for roughly
 * half what Classic's did at the same rank.
 */

import type { SpellDef, TalentHook } from '../sim/spells';
import { addCastTime, addCritBonus, multiplyCost, multiplyDamage, multiplySchool } from '../sim/spells';

/* ---------------------------------------------------------------- numbers */

export const LIFE_TAP_MANA = 424;
export const SHADOW_TRANCE = { duration: 10 };
export const IMPROVED_SHADOW_BOLT = { duration: 12 };
export const SHADOW_AND_FLAME = { duration: 20 };
export const CONFLAGRATE_COOLDOWN = 10;

const beta = (note: string) => ({ status: 'changed' as const, note });

/* ----------------------------------------------------------------- spells */

export const SHADOW_BOLT: SpellDef = {
  id: 'shadow-bolt',
  name: 'Shadow Bolt',
  icon: 'spell_shadow_shadowbolt',
  school: 'shadow',
  castTime: 3,
  cost: 380,
  minDamage: 253,
  maxDamage: 283,
  coefficient: 0.8571,
  forever: beta('Rank 10, 253 to 283, from the beta client. Classic gave 482 to 538.'),
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
  dot: { ticks: 6, interval: 3, damage: 438, coefficient: 1.2 },
  forever: beta('Rank 7, 438 over eighteen seconds and 20% of spell power a tick, from the beta client. Classic gave 822.'),
};

export const BANE_OF_AGONY: SpellDef = {
  id: 'bane-of-agony',
  name: 'Bane of Agony',
  icon: 'spell_shadow_curseofsargeras',
  school: 'shadow',
  castTime: 0,
  cost: 215,
  minDamage: 0,
  maxDamage: 0,
  coefficient: 0,
  dot: { ticks: 12, interval: 2, damage: 552, coefficient: 1.6 },
  forever: beta(
    'Rank 6, 552 over twenty-four seconds and 13.3% of spell power a tick, from the beta client. ' +
      'The tooltip does not give the tick count; twelve two-second ticks is a guess from Classic. ' +
      'The game ramps the ticks up; here they are even.',
  ),
};

export const IMMOLATE: SpellDef = {
  id: 'immolate',
  name: 'Immolate',
  icon: 'spell_fire_immolation',
  school: 'fire',
  castTime: 2,
  cost: 380,
  minDamage: 158,
  maxDamage: 158,
  coefficient: 0.2,
  dot: { ticks: 5, interval: 3, damage: 275, coefficient: 0.65 },
  forever: beta('Rank 8, 158 at once and 275 over fifteen seconds, from the beta client. Classic gave 279 and 510.'),
};

export const CONFLAGRATE: SpellDef = {
  id: 'conflagrate',
  name: 'Conflagrate',
  icon: 'spell_fire_fireball',
  school: 'fire',
  castTime: 0,
  cost: 255,
  minDamage: 251,
  maxDamage: 313,
  coefficient: 0.4286,
  forever: beta('Rank 6, 251 to 313 on a ten second cooldown, from the beta client.'),
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
  forever: { status: 'same', note: 'Rank 6, 424 mana for 424 health, which is not counted.' },
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

  // 'Increases the damage dealt or life drained by your Shadow spells by 2%.'
  'Shadow Mastery': (rank, mods) => {
    multiplySchool(mods, 'shadow', 1 + 0.02 * rank);
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
    // 33, 67 and 100 by rank.
    mods.flags.demonicKnowledge = [0, 0.33, 0.67, 1][rank] ?? 1;
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
  // The tree rounds: 3, 6 and 10 by rank.
  Cataclysm: (rank, mods) => {
    const cut = [0, 0.03, 0.06, 0.1][rank] ?? 0.1;
    for (const spell of DESTRUCTION) multiplyCost(mods, spell.id, 1 - cut);
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
  // 3, 7 and 10 by rank.
  'Agonizing Flames': (rank, mods) => {
    const more = [0, 0.03, 0.07, 0.1][rank] ?? 0.1;
    for (const spell of DESTRUCTION) multiplyDamage(mods, spell.id, 1 + more);
  },

  // 'Increases the critical strike chance of your Conflagrate spell by 8%.'
  'Fire and Brimstone': (rank, mods) => {
    // 8, 17 and 25 by rank.
    mods.flags.fireAndBrimstone = [0, 8, 17, 25][rank] ?? 25;
  },

  // 'Hitting an enemy with Conflagrate increases all Shadow damage you deal by
  // 2% for 20 sec ... Conflagrate has a 20% chance not to consume Immolate.'
  'Shadow and Flame': (rank, mods) => {
    mods.flags.shadowAndFlame = 0.02 * rank;
    mods.flags.keepImmolate = 0.2 * rank;
  },
};
