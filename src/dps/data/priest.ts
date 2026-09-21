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
 * Mind Flay is given in the tree at the rank the talent teaches. The Classic
 * level sixty rank is used, and the note says so.
 */

import type { SpellDef, TalentHook } from '../sim/spells';
import { addCritBonus, multiplyCost, multiplyDamage, multiplySchool } from '../sim/spells';

/* ---------------------------------------------------------------- numbers */

export const MIND_BLAST_COOLDOWN = 8;
export const SHADOW_WEAVING = { perStack: 0.02, stacks: 5, duration: 15 };
export const POWER_INFUSION = { damage: 0.2, duration: 15, cooldown: 180 };

const classic = (note: string) => ({ status: 'unverified' as const, note });

/* ----------------------------------------------------------------- spells */

export const MIND_BLAST: SpellDef = {
  id: 'mind-blast',
  name: 'Mind Blast',
  icon: 'spell_shadow_unholyfrenzy',
  school: 'shadow',
  castTime: 1.5,
  cost: 350,
  minDamage: 503,
  maxDamage: 531,
  coefficient: 0.4286,
  forever: classic('Rank 9 at the Classic values, on an eight second cooldown.'),
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
  dot: { ticks: 6, interval: 3, damage: 852, coefficient: 1 },
  forever: classic('Rank 8 at the Classic values: 852 over eighteen seconds.'),
};

export const MIND_FLAY: SpellDef = {
  id: 'mind-flay',
  name: 'Mind Flay',
  icon: 'spell_shadow_siphonmana',
  school: 'shadow',
  castTime: 3,
  cost: 205,
  minDamage: 426,
  maxDamage: 426,
  coefficient: 0.45,
  channel: { ticks: 3, interval: 1 },
  forever: classic(
    'The Shadow tree gives 104 over three seconds, which is the rank the talent teaches. ' +
      'Rank 6 is taken at the Classic values.',
  ),
};

export const SMITE: SpellDef = {
  id: 'smite',
  name: 'Smite',
  icon: 'spell_holy_holysmite',
  school: 'holy',
  castTime: 2.5,
  cost: 280,
  minDamage: 371,
  maxDamage: 414,
  coefficient: 0.7143,
  forever: classic('Rank 8 at the Classic values, for a priest without Mind Flay.'),
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
      'Twenty per cent more spell damage for fifteen seconds, from the Discipline tree. Cast on ' +
      'yourself here. The three minute cooldown is Classic.',
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

  // 'Reduces the mana cost of your Smite, Holy Fire, and Instant cast spells by 3%.'
  'Mental Agility': (rank, mods) => {
    for (const spell of [SMITE, SHADOW_WORD_PAIN]) multiplyCost(mods, spell.id, 1 - 0.03 * rank);
  },

  // 'Allows 17% of your Mana regeneration to continue while casting.'
  Meditation: (rank, mods) => {
    mods.flags.castingRegen = 0.17 * rank;
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

  // 'Increases your Holy damage done by 2% ...'
  'Searing Light': (rank, mods) => {
    multiplySchool(mods, 'holy', 1 + 0.02 * rank);
  },

  // '... and your spell damage by up to 1% of your total Spirit.'
  'Spiritual Guidance': (rank, mods) => {
    mods.flags.spiritualGuidance = 0.01 * rank;
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
