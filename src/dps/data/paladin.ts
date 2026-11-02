/**
 * Paladin abilities and the talents that change them, for Retribution.
 *
 * Forever rebuilt the paladin's damage. Judgement no longer eats the seal and
 * sits on a ten second cooldown of its own. Holy Strike is baseline: half the
 * weapon's damage plus Holy, on ten seconds. Consecration and Blessing of Kings
 * are trained rather than talented. Every hook below is keyed by the name in
 * public/data/talents.generated.json and cites the description it was read
 * from. The spell numbers are the beta client's text at build 1.60.1.70009,
 * at the highest rank a level sixty can train.
 *
 * Seal of Command's own chance to fire is not given, so it runs at the Classic
 * seven a minute and says so.
 */

import type { AbilityDef, TalentHook } from '../sim/spells';
import { addCastTime, addSpellCrit, multiplyCost, multiplyDamage } from '../sim/spells';

/* ---------------------------------------------------------------- numbers */

export const SEAL_OF_COMMAND = {
  /** Seventy per cent of a normal weapon swing, from the talent's own text. */
  share: 0.7,
  /** Procs a minute, which the tree does not give: the Classic figure. */
  ppm: 7,
  duration: 30,
};

/**
 * Rank 8: 'An instant strike that causes 50% weapon damage plus an additional
 * 40 to 53 as Holy damage.' 10 sec cooldown.
 */
export const HOLY_STRIKE = { cooldown: 10, weaponShare: 0.5, holyMin: 40, holyMax: 53 };
export const JUDGEMENT = { cooldown: 10 };
export const VENGEANCE = { duration: 30, stacks: 3 };

const changed = (note: string) => ({ status: 'changed' as const, note });

/* -------------------------------------------------------------- abilities */

export const SEAL_OF_COMMAND_SPELL: AbilityDef = {
  id: 'seal-of-command',
  name: 'Seal of Command',
  icon: 'ability_warrior_innerrage',
  school: 'holy',
  kind: 'item',
  resource: 'mana',
  castTime: 0,
  cost: 210,
  minDamage: 0,
  maxDamage: 0,
  coefficient: 0,
  forever: changed(
    'Rank 5 from the beta client at build 1.60.1.70009: seventy per cent of normal weapon ' +
      'damage as Holy, for 210 mana. It does not say how often; seven times a minute is the ' +
      'Classic rate.',
  ),
};

/**
 * Judging Seal of Command at rank 5: 'instantly causing 169 to 187 Holy damage'.
 * The talent teaches rank 1; the trainer sells the rest.
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
  minDamage: 169,
  maxDamage: 187,
  coefficient: 0.429,
  forever: changed(
    'Ten seconds and the seal stays up. 169 to 187 is rank 5 of Seal of Command in the beta ' +
      'client at build 1.60.1.70009, with 42.9% of spell power from the same data. The cost ' +
      'is 6% of base mana in game; 86 is the Classic figure.',
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
  cost: 20,
  minDamage: 0,
  maxDamage: 0,
  coefficient: 0,
  weapon: { hand: 'main', multiplier: HOLY_STRIKE.weaponShare, flat: 0, normalised: false },
  forever: {
    status: 'new',
    note:
      'Rank 8 from the beta client at build 1.60.1.70009: 50% weapon damage plus 40 to 53 Holy, ' +
      '20 mana, 10 sec cooldown. The Holy part rolls its own critical strike here and takes ' +
      'no spell power, since the data gives it no coefficient.',
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
  dot: { ticks: 4, interval: 2, damage: 312, coefficient: 0.38 },
  aoe: { maxTargets: 4 },
  forever: changed(
    'Rank 5 from the beta client at build 1.60.1.70009: 96 Holy over 8 sec, and another 216 ' +
      'to the first 4 enemies, so 312 is counted on up to 4 targets and the 96 beyond them is ' +
      'left out. 9.5% of spell power a tick is from the data; four ticks is assumed.',
  ),
};

export const HAMMER_OF_WRATH: AbilityDef = {
  id: 'hammer-of-wrath',
  name: 'Hammer of Wrath',
  icon: 'ability_thunderclap',
  school: 'holy',
  kind: 'spell',
  castTime: 1,
  cost: 425,
  cooldown: 6,
  minDamage: 474,
  maxDamage: 522,
  coefficient: 0.429,
  execute: { belowPct: 0.2 },
  forever: changed(
    'Rank 3 from the beta client at build 1.60.1.70009: 474 to 522 Holy for 425 mana, 42.9% ' +
      'of spell power, only on a target at 20% health or less.',
  ),
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

  // 'Increases the damage done by your Seals and Judgements by 3%.' 15% at rank 5.
  'Improved Seals': (rank, mods) => {
    mods.flags.sealDamage = 0.03 * rank;
    multiplyDamage(mods, JUDGEMENT_SPELL.id, 1 + 0.03 * rank);
  },

  // 'Improves your chance to hit with Holy spells by 4%, and reduces the duration
  // of Silence effects on you by 10%.' Only the hit counts here.
  'Divine Precision': (rank, mods) => {
    mods.spellHit += 4 * rank;
  },

  // 'Allows 15% of your Mana regeneration to continue while casting.' 30% at rank 2.
  Reverence: (rank, mods) => {
    mods.flags.castingRegen = 0.15 * rank;
  },

  /* ----------------------------------------------------------- Protection */

  // 'Improves your chance to hit by 1%.' Counted for spells too, as before: the
  // text does not say which.
  Precision: (rank, mods) => {
    mods.meleeHit += rank;
    mods.spellHit += rank;
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

  // 'Gives your Judgement ability a 33% chance to return 20% of the Mana cost of
  // the judged seal.' 66% for 40% at rank 2, 100% for 60% at rank 3.
  'Sanctified Judgement': (rank, mods) => {
    const r = Math.max(1, Math.min(3, rank));
    mods.flags.sanctifiedChance = [0.33, 0.66, 1][r - 1]!;
    mods.flags.sanctifiedShare = [0.2, 0.4, 0.6][r - 1]!;
  },

  // 'Improves your chance to get a critical strike with all spells and attacks by 2%.'
  Conviction: (rank, mods) => {
    mods.meleeCrit += 2 * rank;
    addSpellCrit(mods, 'holy', 2 * rank);
  },

  // 'Increases the physical damage you deal by 2%, and reduces all threat you
  // generate by 7% while a two-handed melee weapon is equipped.'
  'Two-Handed Weapon Specialization': (rank, mods) => {
    mods.flags.twoHandedDamage = 0.02 * rank;
  },

  // 'Increases your Physical and Holy damage dealt by 1% for 30 sec after
  // landing a non-periodic critical strike. Stacks up to 3 times.'
  Vengeance: (rank, mods) => {
    mods.flags.vengeance = 0.01 * rank;
  },

  // 'Reduces the mana cost of your Consecration, Holy Wrath, Exorcism, and
  // Hammer of Wrath spells by 20%.'
  'Holy Conduit': (rank, mods) => {
    for (const id of [CONSECRATION.id, HAMMER_OF_WRATH.id]) multiplyCost(mods, id, 1 - 0.2 * rank);
  },

  // 'Increases the damage of your Holy Strike ability by 20% and causes it to
  // refresh all Judgement effects on the target.'
  'Sacred Arbiter': (_rank, mods) => {
    multiplyDamage(mods, HOLY_STRIKE_SPELL.id, 1.2);
  },

  // 'Increases your spell damage by up to 12% of your Intellect, and reduces the
  // cast time of your Hammer of Wrath by 0.2 sec.' 60% and 1.0 sec at rank 5. Only
  // the cast time is counted here; the spell damage is already on the sheet.
  'Champion of the Light': (rank, mods) => {
    addCastTime(mods, HAMMER_OF_WRATH.id, -0.2 * rank);
  },
};
