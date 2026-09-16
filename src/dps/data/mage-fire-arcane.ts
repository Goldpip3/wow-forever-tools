/**
 * Fire and Arcane mage spells and the talents that change them.
 *
 * Kept apart from mage.ts on purpose. Frost Mage is the reference spec and its
 * answer is pinned by a test, so nothing it reads is touched here: Evocation,
 * the Mana Gem and the potion are shared by importing them, and the talents
 * both files speak about, such as Arcane Instability, get their own hooks
 * because a Fire or Arcane mage needs them to reach more than Frost.
 *
 * Forever's Fire and Arcane trees are new in most places. Hot Streak shortens
 * Pyroblast rather than making it free, Arcane Blast raises every other spell
 * rather than itself, and Missile Barrage is a talent of its own. Every hook
 * cites the description it was read from. Spells the trees give a number for
 * give the rank the talent teaches, which is not what a level sixty mage casts,
 * so the Classic level-sixty rank is used and the note says so.
 */

import type { School } from '../export-format';
import type { SpellDef, SpellMods, TalentHook } from '../sim/spells';
import { addCastTime, addCritBonus, multiplySchool } from '../sim/spells';
import { EVOCATION_SPELL, MANA_GEM, MANA_POTION } from './mage';

/* ---------------------------------------------------------------- numbers */

export const FIRE_BLAST_COOLDOWN = 8;
export const IMPROVED_SCORCH = { perStack: 0.03, stacks: 5, duration: 30 };
export const HOT_STREAK = { perStack: 0.25, stacks: 3, duration: 15 };
export const COMBUSTION = { perHit: 10, crits: 4, cooldown: 180 };
export const IGNITE = { ticks: 2, interval: 2 };
export const ARCANE_BLAST = { perStack: 0.1, costPerStack: 1.75, stacks: 4, duration: 8 };
export const MISSILE_BARRAGE = { fromBlast: 0.4, fromBolts: 0.2, duration: 15, speed: 2 };
export const ARCANE_POWER = { damage: 0.3, cost: 0.3, duration: 15, cooldown: 180 };
export const PRESENCE_OF_MIND = { cooldown: 180 };

const classic = (note: string) => ({ status: 'unverified' as const, note });

/* ------------------------------------------------------------------ Fire */

export const FIREBALL: SpellDef = {
  id: 'fireball',
  name: 'Fireball',
  icon: 'spell_fire_flamebolt',
  school: 'fire',
  castTime: 3.5,
  cost: 410,
  minDamage: 596,
  maxDamage: 760,
  coefficient: 1,
  dot: { ticks: 4, interval: 2, damage: 76, coefficient: 0 },
  forever: classic('Rank 12 at the Classic values, burning a little more over eight seconds.'),
};

export const SCORCH: SpellDef = {
  id: 'scorch',
  name: 'Scorch',
  icon: 'spell_fire_soulburn',
  school: 'fire',
  castTime: 1.5,
  cost: 150,
  minDamage: 237,
  maxDamage: 280,
  coefficient: 0.4286,
  forever: classic('Rank 7 at the Classic values.'),
};

export const FIRE_BLAST: SpellDef = {
  id: 'fire-blast',
  name: 'Fire Blast',
  icon: 'spell_fire_fireball',
  school: 'fire',
  castTime: 0,
  cost: 340,
  minDamage: 446,
  maxDamage: 524,
  coefficient: 0.4286,
  forever: classic('Rank 7 at the Classic values, on an eight second cooldown.'),
};

export const PYROBLAST: SpellDef = {
  id: 'pyroblast',
  name: 'Pyroblast',
  icon: 'spell_fire_fireball02',
  school: 'fire',
  castTime: 6,
  cost: 440,
  minDamage: 716,
  maxDamage: 890,
  coefficient: 1,
  dot: { ticks: 4, interval: 3, damage: 268, coefficient: 0 },
  forever: classic(
    'The Fire tree gives 155 to 185, which is the rank the talent teaches. A level sixty mage ' +
      'casts Rank 8, which is taken at the Classic values.',
  ),
};

export const BLAST_WAVE: SpellDef = {
  id: 'blast-wave',
  name: 'Blast Wave',
  icon: 'spell_holy_excorcism_02',
  school: 'fire',
  castTime: 0,
  cost: 545,
  cooldown: 45,
  minDamage: 462,
  maxDamage: 545,
  coefficient: 0.1357,
  aoe: { maxTargets: 10 },
  forever: classic(
    'The Fire tree gives 160 to 191, which is the rank the talent teaches. Rank 5 is taken at ' +
      'the Classic values.',
  ),
};

export const COMBUSTION_SPELL: SpellDef = {
  id: 'combustion',
  name: 'Combustion',
  icon: 'spell_fire_sealoffire',
  school: 'fire',
  kind: 'item',
  castTime: 0,
  gcd: 0,
  cost: 0,
  cooldown: COMBUSTION.cooldown,
  minDamage: 0,
  maxDamage: 0,
  coefficient: 0,
  forever: {
    status: 'changed',
    note:
      'Ten per cent more critical strike chance for each Fire hit until four critical strikes, ' +
      'from the Fire tree. Classic stopped at three. The three minute cooldown is Classic.',
  },
};

/* ---------------------------------------------------------------- Arcane */

export const ARCANE_MISSILES: SpellDef = {
  id: 'arcane-missiles',
  name: 'Arcane Missiles',
  icon: 'spell_nature_starfall',
  school: 'arcane',
  castTime: 5,
  cost: 655,
  minDamage: 1150,
  maxDamage: 1150,
  coefficient: 1.4286,
  channel: { ticks: 5, interval: 1 },
  forever: classic('Rank 8 at the Classic values: five missiles of 230 over five seconds.'),
};

export const ARCANE_BLAST_SPELL: SpellDef = {
  id: 'arcane-blast',
  name: 'Arcane Blast',
  icon: 'spell_arcane_blast',
  school: 'arcane',
  castTime: 2.5,
  cost: 195,
  minDamage: 95,
  maxDamage: 104,
  coefficient: 0.7143,
  forever: {
    status: 'new',
    note:
      '95 to 104, and ten per cent more on every other spell for each stack, from the Arcane ' +
      'tree. That is the rank the talent teaches, and no higher rank is known. The cast time ' +
      'and cost are not given; two and a half seconds and 195 mana are assumed.',
  },
};

export const ARCANE_POWER_SPELL: SpellDef = {
  id: 'arcane-power',
  name: 'Arcane Power',
  icon: 'spell_nature_lightning',
  school: 'arcane',
  kind: 'item',
  castTime: 0,
  gcd: 0,
  cost: 0,
  cooldown: ARCANE_POWER.cooldown,
  minDamage: 0,
  maxDamage: 0,
  coefficient: 0,
  forever: classic('Thirty per cent more damage and thirty per cent more mana for fifteen seconds, from the tree. The three minute cooldown is Classic.'),
};

export const PRESENCE_OF_MIND_SPELL: SpellDef = {
  id: 'presence-of-mind',
  name: 'Presence of Mind',
  icon: 'spell_nature_enchantarmor',
  school: 'arcane',
  kind: 'item',
  castTime: 0,
  gcd: 0,
  cost: 0,
  cooldown: PRESENCE_OF_MIND.cooldown,
  minDamage: 0,
  maxDamage: 0,
  coefficient: 0,
  forever: classic('The next spell with a cast time is instant. The three minute cooldown is Classic.'),
};

export const FIRE_SPELLS: SpellDef[] = [
  FIREBALL, SCORCH, FIRE_BLAST, PYROBLAST, BLAST_WAVE, COMBUSTION_SPELL,
  EVOCATION_SPELL, MANA_GEM, MANA_POTION,
];

export const ARCANE_SPELLS: SpellDef[] = [
  ARCANE_MISSILES, ARCANE_BLAST_SPELL, ARCANE_POWER_SPELL, PRESENCE_OF_MIND_SPELL,
  EVOCATION_SPELL, MANA_GEM, MANA_POTION,
];

/** Spells that deal damage, for Clearcasting and Arcane Blast to watch. */
export const DAMAGE_SPELLS = new Set([
  FIREBALL.id, SCORCH.id, FIRE_BLAST.id, PYROBLAST.id, BLAST_WAVE.id,
  ARCANE_MISSILES.id, ARCANE_BLAST_SPELL.id,
]);

/** What each spell costs before anything changes it, for Master of Elements. */
export const BASE_COST: Record<string, number> = Object.fromEntries(
  [...FIRE_SPELLS, ...ARCANE_SPELLS].map((s) => [s.id, s.cost]),
);

const SCHOOLS: School[] = ['arcane', 'fire', 'frost'];

/* --------------------------------------------------------------- talents */

/** The hooks both trees share, reaching every school a mage casts. */
const SHARED_HOOKS: Record<string, TalentHook> = {
  // 'Gives you a 2% chance of entering a Clearcasting state after any damage
  // spell hits a target.'
  'Arcane Concentration': (rank, mods) => {
    mods.flags.clearcastingChance = 0.02 * rank;
  },

  // 'Allows 17% of your Mana regeneration to continue while casting.'
  'Arcane Meditation': (rank, mods) => {
    mods.flags.castingRegen = (mods.flags.castingRegen ?? 0) + 0.17 * rank;
  },

  // 'Increases the damage done by all your spells by 1% and your critical
  // strike chance with all attacks by 1%.'
  'Arcane Instability': (rank, mods) => {
    for (const school of SCHOOLS) {
      multiplySchool(mods, school, 1 + 0.01 * rank);
      mods.spellCrit[school] = (mods.spellCrit[school] ?? 0) + rank;
    }
  },

  // 'Increases your Intellect by 2% and increases the critical strike damage
  // bonus of your Arcane spells by 20%.' The intellect is on the sheet already.
  'Arcane Mind': (rank, mods) => {
    addCritBonus(mods, 'arcane', 0.5 * 0.2 * rank);
  },

  // 'Increases the critical strike chance of your Arcane spells by 2%.'
  'Arcane Impact': (rank, mods) => {
    mods.spellCrit.arcane = (mods.spellCrit.arcane ?? 0) + 2 * rank;
  },

  'Arcane Power': (_rank, mods) => {
    mods.flags.arcanePower = 1;
  },

  'Presence of Mind': (_rank, mods) => {
    mods.flags.presenceOfMind = 1;
  },

  // 'Gives your Arcane Blast spell a 40% chance, and your Fireball, Frostbolt,
  // and Frostfire Bolt spells a 20% chance to reduce the channeled duration of
  // your next Arcane Missiles spell by 50%, reduce the Mana cost by 100%, and
  // missiles will fire every 0.5 sec.'
  'Missile Barrage': (_rank, mods) => {
    mods.flags.missileBarrage = 1;
  },

  // 'Your Fire and Frost critical strikes will refund 10% of their base mana cost.'
  'Master of Elements': (rank, mods) => {
    mods.flags.masterOfElements = 0.1 * rank;
  },
};

export const FIRE_TALENT_HOOKS: Record<string, TalentHook> = {
  ...SHARED_HOOKS,

  // 'Reduces the cooldown of your Fire Blast spell by 1 sec.'
  'Wake of Fire': (rank, mods) => {
    mods.flags.fireBlastCooldownOff = rank;
  },

  // 'Increases the critical strike chance of your Fire Blast, Ice Lance,
  // Arcane Blast, and Scorch spells by 2%.'
  Incineration: (rank, mods) => {
    mods.flags.incineration = 2 * rank;
  },

  // 'Reduces the casting time of your Fireball and Frostfire Bolt spells by 0.1 sec.'
  'Improved Fireball': (rank, mods) => {
    addCastTime(mods, FIREBALL.id, -0.1 * rank);
  },

  // 'Your critical strikes from Fire damage spells cause the target to burn for
  // an additional 8% of your spell's damage over 4 sec.'
  Ignite: (rank, mods) => {
    mods.flags.ignite = 0.08 * rank;
  },

  // 'Your Scorch spell has a 33% chance to cause your target to be vulnerable
  // to Fire damage ... 3% ... lasts 30 sec, stacking up to 5 times.'
  'Improved Scorch': (rank, mods) => {
    // A third a rank, which is certain at three.
    mods.flags.improvedScorch = Math.min(1, rank / 3);
  },

  'Hot Streak': (_rank, mods) => {
    mods.flags.hotStreak = 1;
  },

  // 'Increases the critical strike chance of your Fire spells by 2%.'
  'Critical Mass': (rank, mods) => {
    mods.spellCrit.fire = (mods.spellCrit.fire ?? 0) + 2 * rank;
  },

  // 'Increases the damage done by your Fire spells by 2%.'
  'Fire Power': (rank, mods) => {
    multiplySchool(mods, 'fire', 1 + 0.02 * rank);
  },

  Combustion: (_rank, mods) => {
    mods.flags.combustion = 1;
  },

  // 'Increases your chance to hit with Fire and Frost spells by 1%.' A Fire
  // mage casts nothing else.
  'Elemental Precision': (rank, mods) => {
    mods.spellHit += rank;
  },
};

export const ARCANE_TALENT_HOOKS: Record<string, TalentHook> = {
  ...SHARED_HOOKS,

  // 'Increases your chance to hit with your Arcane spells by 1%.' An Arcane
  // mage casts nothing else.
  'Arcane Focus': (rank, mods) => {
    mods.spellHit += rank;
  },

  // 'Increases the critical strike chance of your Fire Blast, Ice Lance,
  // Arcane Blast, and Scorch spells by 2%.'
  Incineration: (rank, mods) => {
    mods.flags.incineration = 2 * rank;
  },
};

/** Mage Armor and Arcane Meditation add together, the way they did in Classic. */
export function castingRegen(mods: SpellMods): number {
  return Math.min(1, (mods.flags.castingRegen ?? 0) + (mods.flags.spiritWhileCasting ?? 0));
}
