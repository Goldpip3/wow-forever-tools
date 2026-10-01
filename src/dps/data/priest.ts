/**
 * Priest spells and the talents that change them, for Shadow.
 *
 * Forever called this tree Shadow Magic until build 1.60.1.69876 renamed it back
 * to Shadow, with the same talents in it. It still reads differently from
 * Classic: Shadow Weaving is a stacking bonus on the priest rather than a debuff
 * on the boss, Shadowform doubles the critical bonus and halves the cost, and
 * Discipline has Twin Disciplines and Penance. Every hook below is keyed by the name in
 * public/data/talents.generated.json and cites the description it was read
 * from.
 *
 * The spells are the beta client's text at build 1.60.1.70009, at the highest
 * rank a level sixty can train, with the spell power share the export gives.
 * Mind Flay's talent teaches rank 1; the trainer sells rank 6.
 */

import type { SpellDef, TalentHook } from '../sim/spells';
import { addCritBonus, multiplyCost, multiplyDamage, multiplySchool } from '../sim/spells';

/* ---------------------------------------------------------------- numbers */

export const MIND_BLAST_COOLDOWN = 8;
export const SHADOW_WEAVING = { perStack: 0.02, stacks: 5, duration: 15 };
export const POWER_INFUSION = { damage: 0.2, duration: 15, cooldown: 180 };

const beta = (note: string) => ({ status: 'changed' as const, note });

/** A talent's value at each rank, where the ranks do not go up evenly. */
const atRank = (values: number[], rank: number): number =>
  values[Math.max(0, Math.min(values.length, rank) - 1)] ?? 0;

/* ----------------------------------------------------------------- spells */

export const MIND_BLAST: SpellDef = {
  id: 'mind-blast',
  name: 'Mind Blast',
  icon: 'spell_shadow_unholyfrenzy',
  school: 'shadow',
  castTime: 1.5,
  cost: 350,
  minDamage: 477,
  maxDamage: 503,
  coefficient: 0.429,
  forever: beta(
    'Rank 9 from the beta client at build 1.60.1.70009: 477 to 503 Shadow for 350 mana, on an ' +
      'eight second cooldown. Classic gave 508 to 536.',
  ),
};

export const SHADOW_WORD_PAIN: SpellDef = {
  id: 'shadow-word-pain',
  name: 'Shadow Word: Pain',
  icon: 'spell_shadow_shadowwordpain',
  school: 'shadow',
  castTime: 0,
  cost: 470,
  minDamage: 0,
  maxDamage: 0,
  coefficient: 0,
  dot: { ticks: 6, interval: 3, damage: 762, coefficient: 1.2 },
  forever: beta(
    'Rank 8 from the beta client at build 1.60.1.70009: 762 over 18 sec for 470 mana, with 20% ' +
      'of spell power a tick. Classic gave 852.',
  ),
};

export const MIND_FLAY: SpellDef = {
  id: 'mind-flay',
  name: 'Mind Flay',
  icon: 'spell_shadow_siphonmana',
  school: 'shadow',
  castTime: 3,
  cost: 205,
  minDamage: 390,
  maxDamage: 390,
  coefficient: 0.5,
  channel: { ticks: 3, interval: 1 },
  forever: beta(
    'Rank 6 from the beta client at build 1.60.1.70009: 390 over 3 sec for 205 mana, with 16.7% ' +
      'of spell power a tick. The talent itself teaches rank 1. Classic gave 426.',
  ),
};

export const SMITE: SpellDef = {
  id: 'smite',
  name: 'Smite',
  icon: 'spell_holy_holysmite',
  school: 'holy',
  castTime: 2.5,
  cost: 280,
  minDamage: 166,
  maxDamage: 186,
  coefficient: 0.714,
  forever: beta(
    'Rank 8 from the beta client at build 1.60.1.70009: 166 to 186 Holy for 280 mana, less than ' +
      "half of Classic's 384 to 428. For a priest without Mind Flay.",
  ),
};

export const POWER_INFUSION_SPELL: SpellDef = {
  id: 'power-infusion',
  name: 'Power Infusion',
  icon: 'spell_holy_powerinfusion',
  school: 'holy',
  kind: 'item',
  castTime: 0,
  gcd: 0,
  cost: 0,
  minDamage: 0,
  maxDamage: 0,
  coefficient: 0,
  forever: {
    status: 'changed',
    note:
      'Twenty per cent more spell damage for fifteen seconds on a three minute cooldown, from the ' +
      'beta client at build 1.60.1.70009. Cast on yourself here.',
  },
};

export const PRIEST_SPELLS: SpellDef[] = [
  SHADOW_WORD_PAIN, MIND_BLAST, MIND_FLAY, SMITE, POWER_INFUSION_SPELL,
];

const SHADOW_SPELLS = [SHADOW_WORD_PAIN, MIND_BLAST, MIND_FLAY];

/* --------------------------------------------------------------- talents */

export const PRIEST_TALENT_HOOKS: Record<string, TalentHook> = {
  /* ----------------------------------------------------------- Discipline */

  // 'Increases the damage and healing of your instant cast spells by 1%.'
  'Twin Disciplines': (rank, mods) => {
    multiplyDamage(mods, SHADOW_WORD_PAIN.id, 1 + 0.01 * rank);
  },

  // 'Reduces the mana cost of your Smite, Holy Fire, and instant cast spells by
  // 3%.' 7% at rank 2, 10% at rank 3.
  'Mental Agility': (rank, mods) => {
    const off = atRank([0.03, 0.07, 0.1], rank);
    for (const spell of [SMITE, SHADOW_WORD_PAIN]) multiplyCost(mods, spell.id, 1 - off);
  },

  // 'Allows 17% of your Mana regeneration to continue while casting.' 33% at
  // rank 2, 50% at rank 3.
  Meditation: (rank, mods) => {
    mods.flags.castingRegen = atRank([0.17, 0.33, 0.5], rank);
  },

  'Power Infusion': (_rank, mods) => {
    mods.flags.powerInfusion = 1;
  },

  /* ------------------------------------------------------------------ Holy */

  // 'Increases the critical effect chance of your Holy spells by 1%.'
  'Holy Specialization': (rank, mods) => {
    mods.spellCrit.holy = (mods.spellCrit.holy ?? 0) + rank;
  },

  // 'Reduces the casting time of your Smite ... by 0.1 sec.'
  'Divine Fury': (rank, mods) => {
    mods.castTime[SMITE.id] = (mods.castTime[SMITE.id] ?? 0) - 0.1 * rank;
  },

  // 'Increases your Holy damage done by 2% ...' 5% at rank 2.
  'Searing Light': (rank, mods) => {
    multiplySchool(mods, 'holy', 1 + atRank([0.02, 0.05], rank));
  },

  // '... and your spell damage by up to 1% of your total Spirit.' 3, 5, 6 and
  // 8% at ranks 2 to 5.
  'Spiritual Guidance': (rank, mods) => {
    mods.flags.spiritualGuidance = atRank([0.01, 0.03, 0.05, 0.06, 0.08], rank);
  },

  /* ---------------------------------------------------------------- Shadow */

  // 'Increases your chance to hit with your Shadow spells by 1%.' Smite is the
  // only other spell, and only for a priest without Mind Flay.
  'Shadow Focus': (rank, mods) => {
    mods.spellHit += rank;
  },

  // 'Increases the duration of your Shadow Word: Pain spell by 3 sec.'
  'Improved Shadow Word: Pain': (rank, mods) => {
    mods.dotTicks[SHADOW_WORD_PAIN.id] = (mods.dotTicks[SHADOW_WORD_PAIN.id] ?? 0) + rank;
  },

  // 'Reduces the cooldown of your Mind Blast spell by 0.5 sec.'
  'Improved Mind Blast': (rank, mods) => {
    mods.flags.mindBlastCooldownOff = 0.5 * rank;
  },

  // 'Your Mind Flay now deals 10% more damage ...'
  'Improved Mind Flay': (rank, mods) => {
    multiplyDamage(mods, MIND_FLAY.id, 1 + 0.1 * rank);
  },

  // 'Your Shadow damage spells have a 33% chance to increase the Shadow damage
  // you deal by 2% for 15 sec, stacking up to 5 times.' A third a rank.
  'Shadow Weaving': (rank, mods) => {
    mods.flags.shadowWeaving = Math.min(1, rank / 3);
  },

  // 'Increases your Shadow damage done by 2%.'
  Darkness: (rank, mods) => {
    multiplySchool(mods, 'shadow', 1 + 0.02 * rank);
  },

  // 'Assume Shadowform, increasing your Shadow damage by 10%, reducing the Mana
  // cost of all Shadow spells by 50%, increasing the critical strike damage
  // bonus of your Shadow spells by 100%.' Taken to be up from the pull.
  Shadowform: (_rank, mods) => {
    multiplySchool(mods, 'shadow', 1.1);
    for (const spell of SHADOW_SPELLS) multiplyCost(mods, spell.id, 0.5);
    addCritBonus(mods, 'shadow', 0.5);
  },
};
