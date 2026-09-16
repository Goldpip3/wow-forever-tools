/**
 * Balance Druid: Moonfire and Insect Swarm kept up, Starfire between with a
 * Wrath woven in for Eclipse, in Moonkin Form.
 *
 * Nature's Grace, Eclipse and Balance of Nature all change a later cast rather
 * than the one that set them off, so each is decided when a cast starts and
 * remembered for that cast, the same way the mage does it.
 */

import { spiritRegenPer2s } from '../../data/conversions';
import {
  BALANCE_ABILITIES,
  BALANCE_OF_NATURE,
  BALANCE_TALENT_HOOKS,
  ECLIPSE,
  NATURES_GRACE,
  STARFIRE,
} from '../../data/druid';
import type { SpecModule } from '../spec';
import type { PriorityEntry } from '../rotation';

export const BALANCE_AURAS = {
  naturesGrace: 'natures-grace',
  eclipse: 'eclipse',
  /** Balance of Nature: the next spell of that school is raised. */
  nextArcane: 'balance-of-nature-arcane',
  nextNature: 'balance-of-nature-nature',
};

const DAMAGE = new Set(['wrath', 'starfire', 'moonfire', 'insect-swarm']);
const NATURE = new Set(['wrath', 'insect-swarm']);

const thisCast = { spellId: '', speed: 1, balance: 0 };

export const druidBalance: SpecModule = {
  specId: 283,
  label: 'Balance Druid',
  resource: 'mana',
  buffRole: 'caster',
  spells: BALANCE_ABILITIES,
  talentHooks: BALANCE_TALENT_HOOKS,
  referenceStat: 'spellPower',

  weightStats: [
    { stat: 'spellPower', step: 50 },
    { stat: 'arcanePower', step: 50 },
    { stat: 'naturePower', step: 50 },
    { stat: 'spellCrit', step: 2 },
    { stat: 'spellHit', step: 2 },
    { stat: 'intellect', step: 50 },
    { stat: 'spirit', step: 50 },
  ],

  rotations: {
    standard: (talents): PriorityEntry[] => [
      { spellId: 'mana-potion' },
      {
        spellId: 'moonfire',
        when: (ctx) => !ctx.onTarget('moonfire') && ctx.timeLeft > 9,
        text: 'not debuff.moonfire.up and time_left > 9',
      },
      {
        spellId: 'insect-swarm',
        when: (ctx) => (talents['Insect Swarm'] ?? 0) > 0 && !ctx.onTarget('insect-swarm') && ctx.timeLeft > 10,
        text: 'talent.insect-swarm and not debuff.insect-swarm.up and time_left > 10',
      },
      // One Wrath buys two faster Starfires with Eclipse, and alternating the
      // schools feeds Balance of Nature too.
      {
        spellId: 'wrath',
        when: (ctx) => (talents.Eclipse ?? 0) > 0 && ctx.stacks('eclipse') < 1,
        text: 'talent.eclipse and buff.eclipse.stacks < 1',
      },
      { spellId: 'starfire' },
    ],
  },

  rotationLabels: {
    standard: 'Moonfire and Insect Swarm kept up, a Wrath for each pair of Eclipse Starfires',
  },

  manaRegen: (stats, mods) => ({
    per2s: spiritRegenPer2s('druid', stats.spirit),
    castingFraction: mods.flags.castingRegen ?? 0,
  }),

  /** Moonkin Form's crit counts for the druid unless it is already ticked as a raid buff. */
  configure: (config, mods) => {
    if (mods.flags.moonkinForm && !config.fight.buffs.includes('moonkin-aura')) {
      for (const school of ['arcane', 'nature'] as const) {
        mods.spellCrit[school] = (mods.spellCrit[school] ?? 0) + 3;
      }
    }
  },

  init: () => {
    thisCast.spellId = '';
    thisCast.speed = 1;
    thisCast.balance = 0;
  },

  castSpeedFor: (_actor, _now, _mods, spellId) => (spellId === thisCast.spellId ? thisCast.speed : 1),

  onCastStart: ({ spellId, actor, now, mods }) => {
    if (!DAMAGE.has(spellId)) return;
    thisCast.spellId = spellId;
    thisCast.speed = 1;
    thisCast.balance = 0;

    // Nature's Grace lasts three seconds rather than one cast.
    if (actor.auras.has(BALANCE_AURAS.naturesGrace, now)) thisCast.speed *= NATURES_GRACE.speed;

    // Eclipse takes a fixed number of seconds off, which is a larger share of a
    // Starfire already shortened by Improved Starfire.
    const eclipse = mods.flags.eclipse ?? 0;
    if (spellId === 'starfire' && eclipse > 0 && actor.auras.has(BALANCE_AURAS.eclipse, now)) {
      const cast = STARFIRE.castTime + (mods.castTime[STARFIRE.id] ?? 0);
      thisCast.speed *= cast / Math.max(0.5, cast - eclipse);
      actor.auras.consume(BALANCE_AURAS.eclipse, now);
    }

    const balance = mods.flags.balanceOfNature ?? 0;
    if (balance > 0) {
      const waiting = NATURE.has(spellId) ? BALANCE_AURAS.nextNature : BALANCE_AURAS.nextArcane;
      if (actor.auras.has(waiting, now)) {
        thisCast.balance = balance;
        actor.auras.consume(waiting, now);
      }
      actor.auras.apply(NATURE.has(spellId) ? BALANCE_AURAS.nextArcane : BALANCE_AURAS.nextNature, now, {
        duration: BALANCE_OF_NATURE.duration,
      });
    }
  },

  critBonusFor: ({ spellId, mods }) => (spellId === 'moonfire' ? mods.flags.improvedMoonfire ?? 0 : 0),

  damageBonusFor: ({ spellId, mods, periodic }) => {
    let bonus = 1;
    if (periodic) bonus *= 1 + (mods.flags.periodicDamage ?? 0);
    if (!periodic && spellId === thisCast.spellId) bonus *= 1 + thisCast.balance;
    return bonus;
  },

  onLand: ({ spellId, outcome, actor, now, mods }) => {
    if (outcome === 'crit' && mods.flags.naturesGrace) {
      actor.auras.apply(BALANCE_AURAS.naturesGrace, now, { duration: NATURES_GRACE.duration });
    }
    if (spellId === 'wrath' && outcome !== 'miss' && (mods.flags.eclipse ?? 0) > 0) {
      actor.auras.apply(BALANCE_AURAS.eclipse, now, {
        duration: ECLIPSE.duration, maxStacks: ECLIPSE.maxCharges, stacks: ECLIPSE.charges,
      });
    }
  },

  forever: {
    status: 'unverified',
    note:
      'Forever rebuilt the Balance tree, so the talents here are read from its own text. The ' +
      'spells are Classic level-sixty ranks.',
  },

  unmodelledTalents: {
    'Improved Entangling Roots': 'Entangling Roots is not in any rotation.',
    Overgrowth: 'Entangling Roots is not in any rotation.',
    Ferocity: 'the druid here casts rather than fighting in Cat or Bear Form.',
    'Heart of the Wild':
      'the intellect it adds is already on your sheet, and the rest only works in Cat or Bear Form.',
    'Feral Swiftness': 'the druid here is not in Cat Form.',
    'Feral Instinct': 'the druid here is not in Cat Form.',
    'Brutal Impact': 'Bash and Pounce are not in any rotation.',
    'Thick Hide': 'armor does nothing to damage.',
    'Savage Fury': 'the druid here is not in Cat Form.',
    'Feral Charge': 'the druid here is not in Cat Form.',
    'Sharpened Claws': 'the druid here is not in Cat or Bear Form.',
    'Shredding Attacks': 'the druid here is not in Cat Form.',
    Mangle: 'the druid here is not in Cat Form.',
    'Predatory Strikes': 'the druid here is not in Cat Form.',
    'Primal Fury': 'the druid here is not in Cat Form.',
    'Predatory Instincts': 'the druid here is not in Cat Form.',
    'Leader of the Pack': 'the druid here is in Moonkin Form, which it cannot share with.',
    'King of the Jungle': 'the druid here is not in Cat Form.',
    'Natural Reaction': 'dodge does nothing to damage.',
    'Rend and Tear': 'the druid here is not in Cat Form.',
    Berserk: 'the druid here is not in Cat Form.',
    "Nature's Focus": 'nothing here interrupts a cast.',
    Furor: 'the druid never changes form during the fight.',
    Subtlety: 'threat does nothing to damage.',
    'Natural Shapeshifter': 'the druid never changes form during the fight.',
    'Gift of Nature': 'healing is not simulated.',
    'Gift of the Earthmother': 'healing is not simulated.',
    'Tranquil Spirit': 'healing is not simulated.',
    'Improved Rejuvenation': 'healing is not simulated.',
    Swiftmend: 'healing is not simulated.',
    "Nature's Swiftness": 'it is a button for one spell, which no rotation here holds.',
    'Living Spirit':
      'the spirit it adds is already on your sheet, but new spirit from a gear change is not scaled by it.',
    'Improved Tranquility': 'healing is not simulated.',
    'Improved Regrowth': 'healing is not simulated.',
    'Wild Growth': 'healing is not simulated.',
  },

  notes: [
    'The druid is taken to be in Moonkin Form from the pull when the talent is taken. Its three ' +
      'per cent crit is counted once, whether or not Moonkin Aura is also ticked in the buffs.',
    'Without Eclipse the rotation casts Starfire alone. With a fully talented Wrath that can ' +
      'come out behind Wrath alone, which the rotation editor can check.',
    'Nature\'s Grace shortens the next cast but not the global cooldown.',
  ],
};
