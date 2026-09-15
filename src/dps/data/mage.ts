/**
 * Mage spells and the talents that change them.
 *
 * Where the demo footage gave a number, the note says so. Where it did not, the
 * value is the Classic one. The footage only reached level thirty-eight, so
 * every level-sixty rank here is a Classic rank carried over, and the Frostbolt
 * the demo showed was Rank 7 at two and a half seconds with that character's
 * own talents included, which is consistent with the Classic three seconds and
 * five points in Improved Frostbolt rather than proof of a change.
 */

import type { SpellDef, SpellMods, TalentHook } from '../sim/spells';
import {
  addCastTime, addCritBonus, multiplyCost, multiplySchool,
} from '../sim/spells';

/** Evocation in the demo: mana regeneration up by fifteen hundred per cent. */
export const EVOCATION = {
  /** A fifteen hundred per cent increase is sixteen times the rate. */
  multiplier: 16,
  duration: 8,
  /** Regeneration ticks every two seconds. */
  ticks: 4,
  cooldown: 480,
};

/** The share of spirit regeneration Mage Armor keeps going while casting. */
export const MAGE_ARMOR_REGEN = 0.3;

export const CLEARCASTING_DURATION = 15;
export const WINTERS_CHILL_DURATION = 15;
export const WINTERS_CHILL_PER_STACK = 2;
export const FINGERS_OF_FROST_DURATION = 15;

export const MANA_GEM_AMOUNT = 1100;
export const MANA_POTION_AMOUNT = 1800;

export const FROSTBOLT: SpellDef = {
  id: 'frostbolt',
  name: 'Frostbolt',
  icon: 'spell_frost_frostbolt02',
  school: 'frost',
  castTime: 3,
  cost: 290,
  minDamage: 515,
  maxDamage: 555,
  coefficient: 0.814,
  forever: {
    status: 'unverified',
    note:
      'Rank 11 at the Classic values. The demo only reached level thirty-eight and showed ' +
      'Rank 7 at 2.5 seconds with the character’s own talents included.',
  },
};

export const ICE_LANCE: SpellDef = {
  id: 'ice-lance',
  name: 'Ice Lance',
  icon: 'spell_frost_frostblast',
  school: 'frost',
  castTime: 0,
  cost: 45,
  minDamage: 28,
  maxDamage: 33,
  coefficient: 0.4286,
  forever: {
    status: 'new',
    note:
      'New in Forever, and the demo only showed its first rank at 28 to 33 damage. What it ' +
      'hits for at level sixty is unknown, so no rotation uses it yet.',
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
    note: 'The demo confirmed eight seconds, an eight minute cooldown and fifteen hundred per cent regeneration.',
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
    status: 'unverified',
    note: 'A Classic Mana Ruby. The demo showed the lower ranks conjured at level twenty-eight and thirty-eight.',
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
    // One per cent per rank, for frost and fire. A frost mage casts nothing else.
    mods.spellHit += rank;
  },

  'Ice Shards': (rank, mods) => {
    // The base critical bonus is half again; each rank adds a fifth of that base.
    addCritBonus(mods, 'frost', 0.5 * 0.2 * rank);
  },

  'Piercing Ice': (rank, mods) => {
    multiplySchool(mods, 'frost', 1 + 0.02 * rank);
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

  'Fingers of Frost': (rank, mods) => {
    mods.flags.fingersOfFrostChance = 0.15 * rank;
  },

  Shatter: (rank, mods) => {
    // Seventeen points at the first rank was all the demo showed.
    mods.flags.shatterCrit = 17 * rank;
  },
};

/** Mage Armor is the only thing that keeps spirit flowing while casting. */
export function spiritWhileCasting(mods: SpellMods): number {
  return mods.flags.spiritWhileCasting ?? 0;
}
