/**
 * Paladin abilities and the talents that change them, for Retribution.
 *
 * Forever rebuilt the paladin's damage. Judgement no longer eats the seal and
 * sits on a ten second cooldown of its own, which the class notes read off the
 * demo. Holy Strike is baseline: weapon damage plus Holy, on twelve seconds.
 * Consecration and Blessing of Kings are trained rather than talented. Every
 * hook below is keyed by the name in public/data/talents.generated.json and
 * cites the description it was read from.
 *
 * Two numbers the data leaves out are said out loud. How large the Holy part
 * of Holy Strike is at level sixty is not given, so only its weapon half is
 * counted. And Seal of Command's own chance to fire is not given either, so it
 * runs at the Classic seven a minute and says so.
 */

import type { AbilityDef, TalentHook } from '../sim/spells';
import { addCastTime, multiplyCost, multiplyDamage } from '../sim/spells';

/* ---------------------------------------------------------------- numbers */

export const SEAL_OF_COMMAND = {
  /** Seventy per cent of a normal weapon swing, from the talent's own text. */
  share: 0.7,
  /** Procs a minute, which the tree does not give: the Classic figure. */
  ppm: 7,
  duration: 30,
};

export const HOLY_STRIKE = { cooldown: 12 };
export const JUDGEMENT = { cooldown: 10 };
export const VENGEANCE = { duration: 30, stacks: 5 };

const changed = (note: string) => ({ status: 'changed' as const, note });
const classic = (note?: string) =>
  (note ? { status: 'unverified' as const, note } : { status: 'unverified' as const });

/* -------------------------------------------------------------- abilities */

export const SEAL_OF_COMMAND_SPELL: AbilityDef = {
  id: 'seal-of-command',
  name: 'Seal of Command',
  icon: 'ability_warrior_innerrage',
  school: 'holy',
  kind: 'item',
  resource: 'mana',
  castTime: 0,
  cost: 65,
  minDamage: 0,
  maxDamage: 0,
  coefficient: 0,
  forever: changed(
    'Seventy per cent of normal weapon damage as Holy, which is what the Retribution tree says. ' +
      'It does not say how often; seven times a minute is the Classic rate. The cost is Classic.',
  ),
};

/**
 * Judging Seal of Command. The tree gives 68 to 73, which is the rank the talent
 * teaches rather than the rank a level sixty paladin would have trained.
 */
export const JUDGEMENT_SPELL: AbilityDef = {
  id: 'judgement',
  name: 'Judgement of Command',
  icon: 'spell_holy_righteousfury',
  school: 'holy',
  kind: 'spell',
  castTime: 0,
  gcd: 0,
  cost: 86,
  minDamage: 68,
  maxDamage: 73,
  coefficient: 0.43,
  forever: changed(
    'Ten seconds and the seal stays up, from the class notes. 68 to 73 is what the tree shows, ' +
      'which is the rank the talent teaches, so this understates a level sixty paladin. The ' +
      'share of spell power is Classic.',
  ),
};

export const HOLY_STRIKE_SPELL: AbilityDef = {
  id: 'holy-strike',
  name: 'Holy Strike',
  icon: 'spell_holy_holysmite',
  school: 'physical',
  kind: 'melee',
  resource: 'mana',
  castTime: 0,
  cost: 60,
  minDamage: 0,
  maxDamage: 0,
  coefficient: 0,
  weapon: { hand: 'main', multiplier: 1, flat: 0, normalised: false },
  forever: {
    status: 'new',
    note:
      'Baseline in Forever on a twelve second cooldown, from the class notes. Only the weapon ' +
      'half is counted: how much Holy it adds at level sixty is not given. The cost is assumed.',
  },
};

export const CONSECRATION: AbilityDef = {
  id: 'consecration',
  name: 'Consecration',
  icon: 'spell_holy_innerfire',
  school: 'holy',
  kind: 'spell',
  castTime: 0,
  cost: 565,
  cooldown: 8,
  minDamage: 0,
  maxDamage: 0,
  coefficient: 0,
  dot: { ticks: 4, interval: 2, damage: 384, coefficient: 0.33 },
  aoe: { maxTargets: 10 },
  forever: classic('Trained rather than talented in Forever. Rank 5 at the Classic values.'),
};

export const HAMMER_OF_WRATH: AbilityDef = {
  id: 'hammer-of-wrath',
  name: 'Hammer of Wrath',
  icon: 'ability_thunderclap',
  school: 'holy',
  kind: 'spell',
  castTime: 1,
  cost: 295,
  cooldown: 6,
  minDamage: 316,
  maxDamage: 348,
  coefficient: 0.43,
  execute: { belowPct: 0.2 },
  forever: classic('Rank 3 at the Classic values: only usable once the target is below a fifth.'),
};

export const PALADIN_ABILITIES: AbilityDef[] = [
  SEAL_OF_COMMAND_SPELL,
  JUDGEMENT_SPELL,
  HOLY_STRIKE_SPELL,
  CONSECRATION,
  HAMMER_OF_WRATH,
];

/* --------------------------------------------------------------- talents */

export const PALADIN_TALENT_HOOKS: Record<string, TalentHook> = {
  /* ----------------------------------------------------------------- Holy */

  // 'Increases the damage done by your Seals and Judgements by 5%.'
  'Improved Seals': (rank, mods) => {
    mods.flags.sealDamage = 0.05 * rank;
    multiplyDamage(mods, JUDGEMENT_SPELL.id, 1 + 0.05 * rank);
  },

  // 'Reduces the cooldown of your Holy Strike ability by 1 sec.'
  'Improved Holy Strike': (rank, mods) => {
    mods.flags.holyStrikeCooldownOff = rank;
  },

  // 'Increases the critical strike chance of your Holy Shock spell by 3%, and
  // all other spells by 1%.'
  'Holy Power': (rank, mods) => {
    mods.spellCrit.holy = (mods.spellCrit.holy ?? 0) + rank;
  },

  // 'Increases your chance to hit with Holy spells by 6%.'
  'Divine Precision': (rank, mods) => {
    mods.spellHit += 6 * rank;
  },

  // 'Allows 30% of your Mana regeneration to continue while casting.' That is
  // the third rank; each is a tenth.
  Reverence: (rank, mods) => {
    mods.flags.castingRegen = 0.1 * rank;
  },

  /* ----------------------------------------------------------- Protection */

  // 'Increases your chance to hit with all spells and attacks by 1%.'
  Precision: (rank, mods) => {
    mods.meleeHit += rank;
    mods.spellHit += rank;
  },

  // 'Increases the damage you deal with one-handed melee weapons by 3%.'
  'One-Handed Weapon Specialization': (rank, mods) => {
    mods.flags.oneHandedDamage = 0.03 * rank;
  },

  /* --------------------------------------------------------- Retribution */

  // 'Reduces the Mana cost of all instant cast spells and abilities by 2%.'
  Benediction: (rank, mods) => {
    for (const ability of PALADIN_ABILITIES) {
      if (ability.castTime === 0) multiplyCost(mods, ability.id, 1 - 0.02 * rank);
    }
  },

  // 'Decreases the cooldown of your Judgement ability by 1 sec.'
  'Improved Judgement': (rank, mods) => {
    mods.flags.judgementCooldownOff = rank;
  },

  // 'Increases your chance to get a critical strike with melee attacks by 1%.'
  Conviction: (rank, mods) => {
    mods.meleeCrit += rank;
  },

  // 'Increases all damage dealt by 1%.' The extra against demons and undead is
  // not counted, because the fight does not say what the boss is.
  Crusade: (rank, mods) => {
    mods.physicalDamage *= 1 + 0.01 * rank;
    mods.schoolDamage.holy = (mods.schoolDamage.holy ?? 1) * (1 + 0.01 * rank);
    mods.flags.crusade = 0.01 * rank;
  },

  // 'Increases the damage you deal with two-handed melee weapons by 3%.'
  'Two-Handed Weapon Specialization': (rank, mods) => {
    mods.flags.twoHandedDamage = 0.03 * rank;
  },

  // 'Increases your Physical and Holy damage dealt by 1% for 30 sec after
  // landing a critical strike. Stacks up to 5 times.'
  Vengeance: (rank, mods) => {
    mods.flags.vengeance = 0.01 * rank;
  },

  // 'Reduces the mana cost of your Consecration, Holy Wrath, Exorcism, and
  // Hammer of Wrath spells by 20%.'
  'Holy Conduit': (rank, mods) => {
    for (const id of [CONSECRATION.id, HAMMER_OF_WRATH.id]) multiplyCost(mods, id, 1 - 0.2 * rank);
  },

  // 'Increases the damage of your Holy Strike ability by 10%.'
  'Sacred Arbiter': (_rank, mods) => {
    multiplyDamage(mods, HOLY_STRIKE_SPELL.id, 1.1);
  },

  // 'Reduces the cast time of your Hammer of Wrath by 0.5 sec.' Both ranks given.
  'Instrument of Law': (rank, mods) => {
    addCastTime(mods, HAMMER_OF_WRATH.id, -0.5 * rank);
  },
};
