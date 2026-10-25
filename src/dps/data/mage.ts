/**
 * Mage spells and the talents that change them.
 *
 * Spell numbers are the highest rank a level sixty mage learns, as the beta
 * client gives it at build 1.60.1.70009. Where the client gives no spell power
 * share, the Classic one is kept and the note says so.
 */

import type { SpellDef, SpellMods, TalentHook } from '../sim/spells';
import {
  addCastTime, addCritBonus, multiplyCost, multiplySchool,
} from '../sim/spells';

/** Evocation: mana regeneration up by fifteen hundred per cent. */
export const EVOCATION = {
  /** A fifteen hundred per cent increase is sixteen times the rate. */
  multiplier: 16,
  duration: 8,
  /** Regeneration ticks every two seconds. */
  ticks: 4,
  cooldown: 480,
};

/**
 * The share of mana regeneration Mage Armor keeps going while casting: 'allows
 * 50% of your mana regeneration to continue while casting' at Rank 3. Classic
 * was 30%.
 */
export const MAGE_ARMOR_REGEN = 0.5;

export const CLEARCASTING_DURATION = 15;
export const WINTERS_CHILL_DURATION = 15;
export const WINTERS_CHILL_PER_STACK = 2;
export const FINGERS_OF_FROST_DURATION = 15;
/** 'a 15% chance' at both ranks; the second rank covers 2 spells rather than 1. */
export const FINGERS_OF_FROST_CHANCE = 0.15;

/** Mana Ruby: 'restore 1,000 to 1,200 mana', taken at the middle. */
export const MANA_GEM_AMOUNT = 1100;
export const MANA_POTION_AMOUNT = 1800;

export const FROSTBOLT: SpellDef = {
  id: 'frostbolt',
  name: 'Frostbolt',
  icon: 'spell_frost_frostbolt02',
  school: 'frost',
  castTime: 3,
  cost: 290,
  minDamage: 457,
  maxDamage: 493,
  coefficient: 0.814,
  forever: {
    status: 'changed',
    note:
      'Rank 11 in the beta client at build 1.60.1.70009: 457 to 493 in 3 sec for 290 mana, ' +
      'with 81.4% of spell power. Classic was 515 to 555.',
  },
};

export const ICE_LANCE: SpellDef = {
  id: 'ice-lance',
  name: 'Ice Lance',
  icon: 'spell_frost_frostblast',
  school: 'frost',
  castTime: 0,
  cost: 160,
  minDamage: 136,
  maxDamage: 160,
  coefficient: 0.4286,
  forever: {
    status: 'new',
    note:
      'Rank 6 in the beta client at build 1.60.1.70009: 136 to 160 for 160 mana, and 300% more ' +
      'against a frozen target. The client gives no spell power share, so the one here is a ' +
      'guess. No rotation uses it yet.',
  },
};

export const EVOCATION_SPELL: SpellDef = {
  id: 'evocation',
  name: 'Evocation',
  icon: 'spell_nature_purge',
  school: 'arcane',
  castTime: EVOCATION.duration,
  cost: 0,
  cooldown: EVOCATION.cooldown,
  minDamage: 0,
  maxDamage: 0,
  coefficient: 0,
  channel: { ticks: EVOCATION.ticks, interval: 2 },
  useBelowMana: 0.2,
  forever: {
    status: 'changed',
    note:
      'Eight seconds of mana regeneration up by 1,500% on an eight minute cooldown, as the beta ' +
      'client gives it at build 1.60.1.70009.',
  },
};

export const MANA_GEM: SpellDef = {
  id: 'mana-gem',
  name: 'Mana Gem',
  icon: 'inv_misc_gem_ruby_02',
  school: 'arcane',
  castTime: 0,
  gcd: 0,
  cost: 0,
  cooldown: 120,
  minDamage: 0,
  maxDamage: 0,
  coefficient: 0,
  restoresMana: MANA_GEM_AMOUNT,
  useBelowMana: 0.75,
  forever: {
    status: 'same',
    note: 'A Mana Ruby, 1,000 to 1,200 mana, as the beta client gives it at build 1.60.1.70009.',
  },
};

export const MANA_POTION: SpellDef = {
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
  restoresMana: MANA_POTION_AMOUNT,
  useBelowMana: 0.7,
  forever: { status: 'unverified' },
};

export const MAGE_SPELLS: SpellDef[] = [
  FROSTBOLT,
  ICE_LANCE,
  EVOCATION_SPELL,
  MANA_GEM,
  MANA_POTION,
];

/* ------------------------------------------------------------------ talents */

/** Frost spell ids, for a talent that speaks about the whole school's cost. */
const FROST_SPELLS = [FROSTBOLT.id, ICE_LANCE.id];

/**
 * Keyed by the talent name exactly as the talent data spells it. Each one reads
 * off the description the importer showed: Improved Frostbolt takes a tenth of
 * a second per rank, Ice Shards adds a fifth to the critical bonus, and so on.
 */
export const FROST_TALENT_HOOKS: Record<string, TalentHook> = {
  'Improved Frostbolt': (rank, mods) => {
    addCastTime(mods, FROSTBOLT.id, -0.1 * rank);
  },

  'Elemental Precision': (rank, mods) => {
    // Two per cent per rank, for frost and fire. A frost mage casts nothing else.
    mods.spellHit += 2 * rank;
  },

  'Ice Shards': (rank, mods) => {
    // The base critical bonus is half again; each rank adds a fifth of that base.
    addCritBonus(mods, 'frost', 0.5 * 0.2 * rank);
  },

  'Frost Channeling': (rank, mods) => {
    for (const id of FROST_SPELLS) multiplyCost(mods, id, 1 - 0.05 * rank);
  },

  'Arcane Instability': (rank, mods) => {
    multiplySchool(mods, 'frost', 1 + 0.01 * rank);
    mods.spellCrit.frost = (mods.spellCrit.frost ?? 0) + rank;
  },

  'Arcane Concentration': (rank, mods) => {
    mods.flags.clearcastingChance = 0.02 * rank;
  },

  "Winter's Chill": (rank, mods) => {
    mods.flags.wintersChillChance = 0.2 * rank;
    mods.flags.wintersChillMaxStacks = rank;
  },

  // 'Gives your Chill effects a 15% chance to grant you the Fingers of Frost
  // effect, which treats your next 1 spell cast as if the target were Frozen.'
  // The second rank keeps the chance and makes it 2 spells.
  'Fingers of Frost': (rank, mods) => {
    mods.flags.fingersOfFrostChance = FINGERS_OF_FROST_CHANCE;
    mods.flags.fingersOfFrostCharges = rank;
  },

  // 'Increases the critical strike chance of all your spells against Frozen
  // targets by 17%.' Fifty at three ranks.
  Shatter: (rank, mods) => {
    mods.flags.shatterCrit = [0, 17, 33, 50][Math.min(rank, 3)] ?? 0;
  },
};

/** Mage Armor is the only thing that keeps spirit flowing while casting. */
export function spiritWhileCasting(mods: SpellMods): number {
  return mods.flags.spiritWhileCasting ?? 0;
}
