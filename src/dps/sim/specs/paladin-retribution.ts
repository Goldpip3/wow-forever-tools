/**
 * Retribution Paladin: a two-handed weapon, Seal of Command riding on it, and
 * Judgement every ten seconds without giving the seal up.
 *
 * Forever turned the Classic seal dance into something steadier. Judgement no
 * longer eats the seal, so there is no reason to let it drop: the seal goes up,
 * stays up, and everything else is pressed around it.
 */

import { spiritRegenPer2s } from '../../data/conversions';
import {
  HOLY_STRIKE,
  JUDGEMENT,
  PALADIN_ABILITIES,
  PALADIN_TALENT_HOOKS,
  SEAL_OF_COMMAND,
  VENGEANCE,
} from '../../data/paladin';
import { weaponRoll } from '../melee';
import type { SpecModule } from '../spec';
import type { PriorityEntry } from '../rotation';

export const PALADIN_AURAS = {
  seal: 'seal-of-command',
  vengeance: 'vengeance',
};

/** Where Seal of Command's own damage is billed. */
export const SEAL_HIT_ID = 'seal-of-command-hit';

export const paladinRetribution: SpecModule = {
  specId: 381,
  label: 'Retribution Paladin',
  resource: 'mana',
  buffRole: 'melee',
  spells: PALADIN_ABILITIES,
  talentHooks: PALADIN_TALENT_HOOKS,
  referenceStat: 'attackPower',

  weightStats: [
    { stat: 'attackPower', step: 100 },
    { stat: 'strength', step: 50 },
    { stat: 'agility', step: 50 },
    { stat: 'crit', step: 2 },
    { stat: 'hit', step: 2 },
    { stat: 'spellPower', step: 50 },
    { stat: 'intellect', step: 50 },
  ],

  extraNames: { [SEAL_HIT_ID]: 'Seal of Command, from swings' },

  rotations: {
    // Seal of Command is a talent, and Judgement of Command comes with it.
    standard: (talents): PriorityEntry[] => [
      {
        spellId: 'seal-of-command',
        when: (ctx) => (talents['Seal of Command'] ?? 0) > 0 && ctx.remaining(PALADIN_AURAS.seal) < 2,
        text: 'talent.seal-of-command and buff.seal-of-command.remains < 2',
      },
      {
        spellId: 'judgement',
        when: (ctx) => ctx.has(PALADIN_AURAS.seal),
        text: 'buff.seal-of-command.up',
      },
      { spellId: 'hammer-of-wrath' },
      { spellId: 'holy-strike' },
      {
        spellId: 'consecration',
        when: (ctx) => ctx.manaPct > 0.6,
        text: 'mana_pct > 0.6',
      },
    ],
  },

  rotationLabels: {
    standard: 'Seal of Command kept up, Judgement and Holy Strike on cooldown',
  },

  manaRegen: (stats, mods) => ({
    per2s: spiritRegenPer2s('paladin', stats.spirit),
    castingFraction: mods.flags.castingRegen ?? 0,
  }),

  init: (actor, config, mods) => {
    const main = config.stats.weapons.main;
    if (main) actor.arm('main', main.speed, 0, 1 + (config.stats.haste ?? 0) / 100);

    // Only once per run: the mods are shared between iterations.
    if (!mods.flags.weaponSpecDone && main) {
      const bonus = main.twoHanded ? mods.flags.twoHandedDamage ?? 0 : mods.flags.oneHandedDamage ?? 0;
      mods.physicalDamage *= 1 + bonus;
      mods.flags.weaponSpecDone = 1;
    }
  },

  hasteFor: (actor) => 1 + (actor.stats.haste ?? 0) / 100,

  /** Vengeance raises Physical and Holy damage for each critical strike stacked. */
  damageBonusFor: ({ school, actor, now, mods }) => {
    const per = mods.flags.vengeance ?? 0;
    if (per <= 0 || (school !== 'physical' && school !== 'holy')) return 1;
    return 1 + per * actor.auras.stacks(PALADIN_AURAS.vengeance, now);
  },

  onCastStart: ({ spellId, actor, now, mods }) => {
    if (spellId === 'seal-of-command') {
      actor.auras.apply(PALADIN_AURAS.seal, now, { duration: SEAL_OF_COMMAND.duration });
    }
    // Both cooldowns are shortened by a talent, so they are started here.
    if (spellId === 'judgement') {
      actor.startCooldown(spellId, now, JUDGEMENT.cooldown - (mods.flags.judgementCooldownOff ?? 0));
    }
    if (spellId === 'holy-strike') {
      actor.startCooldown(spellId, now, HOLY_STRIKE.cooldown - (mods.flags.holyStrikeCooldownOff ?? 0));
    }
  },

  onLand: ({ outcome, actor, now, mods }) => {
    if (outcome === 'crit' && (mods.flags.vengeance ?? 0) > 0) {
      actor.auras.apply(PALADIN_AURAS.vengeance, now, {
        duration: VENGEANCE.duration, maxStacks: VENGEANCE.stacks,
      });
    }
  },

  /**
   * Seal of Command on anything that lands, and Vengeance on anything that
   * crits. The seal's damage is seventy per cent of a normal swing of the
   * weapon, attack power included, dealt as Holy so armor does not touch it.
   */
  onSwing: ({ outcome, weapon, actor, now, rng, mods, procDamage }) => {
    if (outcome === 'crit' && (mods.flags.vengeance ?? 0) > 0) {
      actor.auras.apply(PALADIN_AURAS.vengeance, now, {
        duration: VENGEANCE.duration, maxStacks: VENGEANCE.stacks,
      });
    }

    const connected = outcome !== 'miss' && outcome !== 'dodge' && outcome !== 'parry';
    if (!connected || !actor.auras.has(PALADIN_AURAS.seal, now)) return;

    const chance = (SEAL_OF_COMMAND.ppm * weapon.speed) / 60;
    if (!rng.chance(Math.min(1, chance))) return;

    const swing = weaponRoll(weapon, actor.statAt('attackPower'), rng, false);
    procDamage(SEAL_HIT_ID, swing * SEAL_OF_COMMAND.share * (1 + (mods.flags.sealDamage ?? 0)), 'holy');
  },

  forever: {
    status: 'unverified',
    note:
      'Forever rebuilt the paladin, so the talents here are read from its own text and the ' +
      'abilities from the class notes where they speak. The rest are Classic values.',
  },

  unmodelledTalents: {
    'Divine Strength':
      'the strength it adds is already on your sheet, but new strength from a gear change is not scaled by it.',
    'Divine Intellect':
      'the intellect it adds is already on your sheet, but new intellect from a gear change is not scaled by it.',
    'Champion of the Light':
      'the spell damage it gives is already on your sheet, but new intellect from a gear change is not turned into more of it.',
    Vindication: 'the tree says "a chance" without saying what the chance is.',
    'Sanctified Judgement': 'it returns mana to a seal whose Forever cost is not known.',
    'Consecrated Ground': 'it depends on where enemies walk, and the boss stands still.',
    'Twist of Light': 'it rewards swapping seals, and the rotation keeps one seal up.',
    'Swift Judgement': 'it is a button that finishes a cooldown, and no rotation here holds it.',
    Deflection: 'a parry chance, which does nothing to damage.',
    'Pursuit of Justice': 'movement speed does nothing standing still.',
    'Eye for an Eye': 'it reflects damage taken, and nothing hits you.',
    Repentance: 'it incapacitates a humanoid, which a boss is not.',
    'Unyielding Faith': 'nothing here fears you.',
    'Voice of Truth': 'nothing here silences you.',
    'Healing Light': 'healing is not simulated.',
    'Spiritual Focus': 'healing is not simulated.',
    'Purifying Power': 'Exorcism and Holy Wrath only hit demons and undead.',
    'Infusion of Light': 'healing is not simulated.',
    Illumination: 'healing is not simulated.',
    'Divine Favor': 'healing is not simulated.',
    "Light's Vigil": 'it is built around healing a party, which is not simulated.',
    'Holy Shock': 'it is not in the Retribution rotation.',
    Toughness: 'armor does nothing to damage.',
    Redoubt: 'blocking does nothing to damage.',
    "Guardian's Favor": 'neither blessing it changes deals damage.',
    Anticipation: 'defense does nothing to damage.',
    'Improved Seal of Fury': 'Seal of Fury is the tank seal.',
    'Improved Righteous Fury': 'it reduces damage taken.',
    'Shield Specialization': 'it needs a shield and a block.',
    'Sacred Duty': 'stamina and defensive cooldowns do nothing to damage.',
    'Improved Hammer of Justice': 'Hammer of Justice is not in any rotation.',
    "Templar's Bulwark": 'it is a shield, not damage.',
    Reckoning: 'it needs you to block or be critically struck.',
  },

  notes: [
    'Seal of Command fires seven times a minute, which is the Classic rate: the tree does not say ' +
      'how often it fires in Forever.',
    'Holy Strike counts only its weapon damage. How much Holy it adds at level sixty is not given.',
    'Judgement of Command uses the damage the tree shows, which is the rank the talent teaches, ' +
      'so it understates a level sixty paladin.',
    'The simulated paladin never hesitates between globals, which is worth a few per cent more ' +
      'than anyone actually manages.',
  ],
};
