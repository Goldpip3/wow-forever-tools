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
 * cites the description it was read from. Spell numbers are the highest rank
 * a level sixty mage learns, as the beta client gives it at build 1.60.1.70009,
 * not the rank a talent teaches.
 */

import type { School } from '../export-format';
import type { SpellDef, SpellMods, TalentHook } from '../sim/spells';
import { addCastTime, addCritBonus, multiplySchool } from '../sim/spells';
import { EVOCATION_SPELL, MANA_GEM, MANA_POTION } from './mage';

/* ---------------------------------------------------------------- numbers */

export const FIRE_BLAST_COOLDOWN = 8;
export const IMPROVED_SCORCH = { perStack: 0.03, stacks: 5, duration: 30 };
export const HOT_STREAK = { perStack: 0.25, stacks: 3, duration: 20 };
export const COMBUSTION = { perHit: 10, crits: 4, cooldown: 180 };
export const IGNITE = { ticks: 2, interval: 2 };
export const ARCANE_BLAST = { perStack: 0.1, costPerStack: 1.75, stacks: 4, duration: 8 };
export const MISSILE_BARRAGE = { fromBlast: 0.4, fromBolts: 0.2, duration: 15, speed: 2 };
export const ARCANE_POWER = { damage: 0.3, cost: 0.3, duration: 15, cooldown: 180 };
export const PRESENCE_OF_MIND = { cooldown: 180 };

const same = (note: string) => ({ status: 'same' as const, note });
const changed = (note: string) => ({ status: 'changed' as const, note });

/* ------------------------------------------------------------------ Fire */

export const FIREBALL: SpellDef = {
  id: 'fireball',
  name: 'Fireball',
  icon: 'spell_fire_flamebolt',
  school: 'fire',
  castTime: 3.5,
  cost: 410,
  minDamage: 425,
  maxDamage: 541,
  coefficient: 1,
  dot: { ticks: 4, interval: 2, damage: 60, coefficient: 0 },
  forever: changed(
    'Rank 12 in the beta client at build 1.60.1.70009: 425 to 541 and 60 more over 8 sec, with ' +
      'all of spell power on the hit. Classic was 596 to 760 and 76.',
  ),
};

export const SCORCH: SpellDef = {
  id: 'scorch',
  name: 'Scorch',
  icon: 'spell_fire_soulburn',
  school: 'fire',
  castTime: 1.5,
  cost: 150,
  minDamage: 166,
  maxDamage: 196,
  coefficient: 0.429,
  forever: changed(
    'Rank 7 in the beta client at build 1.60.1.70009: 166 to 196, with 42.9% of spell power. ' +
      'Classic was 237 to 279.',
  ),
};

export const FIRE_BLAST: SpellDef = {
  id: 'fire-blast',
  name: 'Fire Blast',
  icon: 'spell_fire_fireball',
  school: 'fire',
  castTime: 0,
  cost: 340,
  minDamage: 417,
  maxDamage: 489,
  coefficient: 0.429,
  forever: changed(
    'Rank 7 in the beta client at build 1.60.1.70009: 417 to 489 on an 8 sec cooldown, with ' +
      '42.9% of spell power. Classic was 446 to 524.',
  ),
};

export const PYROBLAST: SpellDef = {
  id: 'pyroblast',
  name: 'Pyroblast',
  icon: 'spell_fire_fireball02',
  school: 'fire',
  castTime: 6,
  cost: 440,
  minDamage: 520,
  maxDamage: 646,
  coefficient: 1,
  dot: { ticks: 4, interval: 3, damage: 212, coefficient: 0.6 },
  forever: changed(
    'Rank 8 in the beta client at build 1.60.1.70009: 520 to 646 and 212 more over 12 sec, with ' +
      'all of spell power on the hit and 15% a tick. Classic was 716 to 890 and 268.',
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
  minDamage: 453,
  maxDamage: 533,
  coefficient: 0.129,
  aoe: { maxTargets: 10 },
  forever: changed(
    'Rank 5 in the beta client at build 1.60.1.70009: 453 to 533 on a 45 sec cooldown, with ' +
      '12.9% of spell power.',
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
      'Ten per cent more critical strike chance for each Fire hit until four critical strikes, on ' +
      'a 3 min cooldown, in the beta client at build 1.60.1.70009. Classic stopped at three.',
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
  minDamage: 1045,
  maxDamage: 1045,
  coefficient: 1.43,
  channel: { ticks: 5, interval: 1 },
  forever: changed(
    'Rank 8 in the beta client at build 1.60.1.70009: five missiles of 209 over 5 sec, each with ' +
      '28.6% of spell power. Classic was 230 a missile at 24%.',
  ),
};

export const ARCANE_BLAST_SPELL: SpellDef = {
  id: 'arcane-blast',
  name: 'Arcane Blast',
  icon: 'spell_arcane_blast',
  school: 'arcane',
  castTime: 2.5,
  cost: 182,
  minDamage: 364,
  maxDamage: 424,
  coefficient: 0.714,
  forever: {
    status: 'new',
    note:
      'Rank 5 in the beta client at build 1.60.1.70009: 364 to 424 in 2.5 sec, with 71.4% of ' +
      'spell power, and ten per cent more on every other spell for each stack. It costs 15% of ' +
      'base mana, taken as 182 from the 1,213 base mana this site assumes for a level 60 mage.',
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
  forever: same(
    'Thirty per cent more damage and thirty per cent more mana for 15 sec on a 3 min cooldown, ' +
      'as the beta client gives it at build 1.60.1.70009.',
  ),
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
  forever: same(
    'The next Mage spell with a cast time under 10 sec is instant, on a 3 min cooldown, as the ' +
      'beta client gives it at build 1.60.1.70009.',
  ),
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

  // 'Reduces the cooldown of your Fire Blast spell by 1 sec.' The crit after a
  // kill does nothing against one boss.
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
