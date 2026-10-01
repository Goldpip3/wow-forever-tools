/**
 * Feral Druid in Cat Form: a rogue's bar with paws instead of a weapon, and two
 * bleeds to keep on the target instead of Slice and Dice.
 *
 * Whatever is equipped, a cat swings its paws once a second, and the gear only
 * matters for the attack power and crit it carries. That is why the form has a
 * hook of its own for what is on the end of the arm.
 */

import * as K from '../../data/combat-constants';
import {
  BERSERK,
  CAT_FORM,
  CAT_PAWS,
  DRUID_TALENT_HOOKS,
  FERAL_ABILITIES,
  GENERATORS,
  RAKE,
  RIP,
  TIGERS_FURY,
} from '../../data/druid';
import type { SpecModule } from '../spec';
import type { PriorityEntry } from '../rotation';

export const DRUID_AURAS = {
  tigersFury: 'tigers-fury',
  berserk: 'berserk',
  rip: 'rip',
  rake: 'rake',
};

/** Where the bleeds are billed. */
export const RIP_BLEED_ID = 'rip-bleed';
export const RAKE_BLEED_ID = 'rake-bleed';

/** The most energy Tiger's Fury is pressed at, so King of the Jungle's is not wasted. */
const furyEnergy = (talents: Record<string, number>): number =>
  K.ENERGY_MAX.value - 20 * (talents['King of the Jungle'] ?? 0);

/** Combo points at the moment a finisher was pressed, read back when it lands. */
let pointsSpent = 0;

export const druidFeral: SpecModule = {
  specId: 281,
  label: 'Feral Druid',
  resource: 'energy',
  buffRole: 'melee',
  spells: FERAL_ABILITIES,
  talentHooks: DRUID_TALENT_HOOKS,
  referenceStat: 'attackPower',

  // Weapon damage is not weighed: the paws do the hitting.
  weightStats: [
    { stat: 'attackPower', step: 100 },
    { stat: 'agility', step: 50 },
    { stat: 'strength', step: 50 },
    { stat: 'crit', step: 2 },
    { stat: 'hit', step: 2 },
  ],

  extraNames: {
    [RIP_BLEED_ID]: 'Rip, over time',
    [RAKE_BLEED_ID]: 'Rake, over time',
  },

  rotations: {
    standard: (talents): PriorityEntry[] => [
      // Tiger's Fury costs nothing now, so it goes on cooldown. With King of the
      // Jungle it waits until the energy it hands back would not be wasted.
      {
        spellId: 'tigers-fury',
        when: (ctx) => !ctx.has(DRUID_AURAS.tigersFury) && ctx.energy <= furyEnergy(talents),
        text: 'not buff.tigers-fury.up and energy <= ' + furyEnergy(talents),
      },
      {
        spellId: 'berserk',
        when: (ctx) => (talents.Berserk ?? 0) > 0 && ctx.timeLeft > 15,
        text: 'talent.berserk and time_left > 15',
      },
      {
        spellId: 'rip',
        when: (ctx) => ctx.comboPoints >= 5 && !ctx.onTarget(DRUID_AURAS.rip) && ctx.timeLeft > 10,
        text: 'combo >= 5 and not debuff.rip.up and time_left > 10',
      },
      {
        spellId: 'ferocious-bite',
        when: (ctx) => ctx.comboPoints >= 5,
        text: 'combo >= 5',
      },
      {
        spellId: 'rake',
        when: (ctx) => !ctx.onTarget(DRUID_AURAS.rake) && ctx.timeLeft > 9,
        text: 'not debuff.rake.up and time_left > 9',
      },
      // Shred waits for energy rather than letting Claw spend it, and Claw is
      // for when you cannot get behind.
      { spellId: 'shred' },
      {
        spellId: 'claw',
        when: (ctx) => !ctx.fight.target.behind,
        text: 'not behind',
      },
    ],
  },

  rotationLabels: {
    standard: 'Rip and Rake kept up, Ferocious Bite at five points, Shred from behind',
  },

  weaponsFor: () => ({ main: CAT_PAWS }),

  init: (actor, config, mods) => {
    const stats = config.stats;
    actor.arm('main', CAT_PAWS.speed, 0, 1 + (stats.haste ?? 0) / 100);
    actor.energy.max = K.ENERGY_MAX.value;
    actor.energy.current = actor.energy.max;

    // The export is read standing up, so the form's own attack power goes on
    // here: agility, the flat part, Predatory Strikes and Heart of the Wild.
    const strength = stats.strength * (mods.flags.catStrength ?? 0);
    actor.addBonus({
      attackPower:
        stats.agility * CAT_FORM.apPerAgility
        + CAT_FORM.flat
        + stats.level * (mods.flags.predatoryStrikes ?? 0)
        + strength * 2,
      strength,
    }, 1);
    pointsSpent = 0;
  },

  hasteFor: (actor) => 1 + (actor.stats.haste ?? 0) / 100,

  /** Berserk makes every combo point strike a critical one. */
  critBonusFor: ({ spellId, actor, now }) =>
    (GENERATORS.has(spellId) && actor.auras.has(DRUID_AURAS.berserk, now) ? 100 : 0),

  /**
   * Tiger's Fury on every physical hit, and Rend and Tear for strikes that are
   * pressed while something bleeds.
   */
  damageBonusFor: ({ spellId, school, actor, now, mods }) => {
    let multiplier = 1;
    if (school === 'physical' && actor.auras.has(DRUID_AURAS.tigersFury, now)) multiplier *= 1 + TIGERS_FURY.damage;
    const bonus = mods.flags.rendAndTear ?? 0;
    if (bonus <= 0 || !FERAL_ABILITIES.some((a) => a.id === spellId)) return multiplier;
    const bleeding = actor.targetAuras.has(DRUID_AURAS.rip, now) || actor.targetAuras.has(DRUID_AURAS.rake, now);
    return bleeding ? multiplier * (1 + bonus) : multiplier;
  },

  onCastStart: ({ spellId, actor, now, mods }) => {
    if (spellId === 'rip') pointsSpent = actor.comboPoints;
    if (spellId === 'tigers-fury') {
      actor.auras.apply(DRUID_AURAS.tigersFury, now, { duration: TIGERS_FURY.duration });
      const energy = mods.flags.kingOfTheJungle ?? 0;
      if (energy > 0) actor.gain('energy', energy);
    }
    if (spellId === 'berserk') {
      actor.auras.apply(DRUID_AURAS.berserk, now, { duration: BERSERK.duration });
    }
  },

  /**
   * The bleeds start from the strike that landed them, and take Tiger's Fury
   * with them if it was up then. Blood Frenzy hands a point back on a critical
   * strike.
   */
  onSwing: ({ spellId, outcome, actor, now, rng, mods, bleed }) => {
    const connected = outcome !== 'miss' && outcome !== 'dodge' && outcome !== 'parry';
    if (!connected) return;

    const fury = actor.auras.has(DRUID_AURAS.tigersFury, now) ? 1 + TIGERS_FURY.damage : 1;
    const periodic = mods.physicalDamage * (1 + (mods.flags.periodicDamage ?? 0)) * fury;
    if (spellId === 'rip' && pointsSpent > 0) {
      bleed(RIP_BLEED_ID, (RIP.base + RIP.perPoint * pointsSpent) * periodic, RIP.ticks, RIP.interval);
      actor.targetAuras.apply(DRUID_AURAS.rip, now, { duration: RIP.ticks * RIP.interval });
      pointsSpent = 0;
    }
    if (spellId === 'rake') {
      const total = RAKE.bleed * periodic * (1 + (mods.flags.rakeBleed ?? 0));
      bleed(RAKE_BLEED_ID, total, RAKE.ticks, RAKE.interval);
      actor.targetAuras.apply(DRUID_AURAS.rake, now, { duration: RAKE.ticks * RAKE.interval });
    }

    const frenzy = mods.flags.bloodFrenzy ?? 0;
    if (outcome === 'crit' && frenzy > 0 && GENERATORS.has(spellId) && rng.chance(Math.min(1, frenzy))) {
      actor.addCombo(1, K.COMBO_POINT_MAX.value);
    }
  },

  forever: {
    status: 'unverified',
    note:
      'Forever rebuilt the Feral tree, so the talents here are read from its own text, and the ' +
      'strikes and finishers from the beta client at build 1.60.1.70009. The paws and the ' +
      'attack power shares are still Classic figures.',
  },

  unmodelledTalents: {
    'Feral Swiftness': 'movement speed and dodge do nothing to damage.',
    'Feral Instinct': 'Swipe is not in the rotation, and prowling does nothing to damage.',
    'Brutal Impact': 'Bash and Pounce are not in any rotation.',
    'Thick Hide': 'armor does nothing to damage.',
    'Feral Charge': 'the boss stands still, so there is nothing to charge at.',
    'Primal Bite': 'it needs Bear Form, and the druid here is in Cat Form.',
    'Natural Reaction': 'a dodge chance, which does nothing to damage.',
    Furor: 'the druid is in Cat Form from the pull and never leaves it.',
    'Improved Wrath': 'a cat does not cast Wrath.',
    Moonglow: 'a cat does not cast spells.',
    'Improved Moonfire': 'a cat does not cast Moonfire.',
    'Improved Entangling Roots': 'Entangling Roots is not in any rotation.',
    "Nature's Splendor": 'a cat does not cast Moonfire or Insect Swarm.',
    Vengeance: 'a cat does not cast spells.',
    'Insect Swarm': 'a cat does not cast Insect Swarm.',
    'Improved Starfire': 'a cat does not cast Starfire.',
    Overgrowth: 'Entangling Roots is not in any rotation.',
    "Nature's Grace": 'a cat does not cast spells.',
    Eclipse: 'a cat does not cast Wrath or Starfire.',
    Moonfury: 'a cat deals no Arcane or Nature damage.',
    'Moonkin Form': 'a cat is not a moonkin.',
    "Nature's Focus": 'nothing here interrupts a cast.',
    Subtlety: 'threat does nothing to damage.',
    'Natural Shapeshifter': 'the druid never shifts during the fight.',
    Reflection: 'a cat does not spend mana.',
    'Gift of Nature': 'healing is not simulated.',
    'Gift of the Earthmother': 'healing is not simulated.',
    'Tranquil Spirit': 'healing is not simulated.',
    'Improved Rejuvenation': 'healing is not simulated.',
    Swiftmend: 'healing is not simulated.',
    "Nature's Swiftness": 'a cat does not cast Nature spells.',
    'Living Spirit': 'spirit does nothing to a cat.',
    'Improved Tranquility': 'healing is not simulated.',
    'Improved Regrowth': 'healing is not simulated.',
    'Wild Growth': 'healing is not simulated.',
  },

  notes: [
    'The druid is taken to be in Cat Form from the pull, and the export to have been made standing ' +
      'up. The form\'s own attack power is added on top of the sheet; an export made in Cat Form ' +
      'would have it counted twice.',
    'A cat\'s paws hit for 40 to 60 once a second before attack power. That is not given anywhere ' +
      'and is close to what a Classic cat did.',
    'Rip grows with attack power in Forever, but the client does not say by how much, so here ' +
      'it does not.',
    'The simulated druid never powershifts, which a skilled Classic druid did for energy.',
  ],
};
