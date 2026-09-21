/**
 * Shadow Priest: Shadow Word: Pain kept up, Mind Blast on cooldown, Mind Flay
 * between, all in Shadowform.
 */

import { spiritRegenPer2s } from '../../data/conversions';
import {
  MIND_BLAST_COOLDOWN,
  POWER_INFUSION,
  PRIEST_SPELLS,
  PRIEST_TALENT_HOOKS,
  SHADOW_WEAVING,
} from '../../data/priest';
import type { SpecModule } from '../spec';
import type { PriorityEntry } from '../rotation';

export const PRIEST_AURAS = {
  shadowWeaving: 'shadow-weaving',
  powerInfusion: 'power-infusion',
};

export const priestShadow: SpecModule = {
  specId: 203,
  label: 'Shadow Priest',
  resource: 'mana',
  buffRole: 'caster',
  spells: PRIEST_SPELLS,
  talentHooks: PRIEST_TALENT_HOOKS,
  referenceStat: 'spellPower',

  weightStats: [
    { stat: 'spellPower', step: 50 },
    { stat: 'shadowPower', step: 50 },
    { stat: 'spellCrit', step: 2 },
    { stat: 'spellHit', step: 2 },
    { stat: 'intellect', step: 50 },
    { stat: 'spirit', step: 50 },
    { stat: 'mp5', step: 10 },
  ],

  rotations: {
    standard: (talents): PriorityEntry[] => [
      {
        spellId: 'power-infusion',
        when: (ctx) => (talents['Power Infusion'] ?? 0) > 0 && ctx.timeLeft > 15,
        text: 'talent.power-infusion and time_left > 15',
      },
      {
        spellId: 'shadow-word-pain',
        when: (ctx) => !ctx.onTarget('shadow-word-pain') && ctx.timeLeft > 12,
        text: 'not debuff.shadow-word-pain.up and time_left > 12',
      },
      { spellId: 'mind-blast' },
      {
        spellId: 'mind-flay',
        when: () => (talents['Mind Flay'] ?? 0) > 0,
        text: 'talent.mind-flay',
      },
      {
        spellId: 'smite',
        when: () => (talents['Mind Flay'] ?? 0) === 0,
        text: 'not talent.mind-flay',
      },
    ],
  },

  rotationLabels: {
    standard: 'Shadow Word: Pain kept up, Mind Blast on cooldown, Mind Flay between',
  },

  manaRegen: (stats, mods) => ({
    per2s: spiritRegenPer2s('priest', stats.spirit),
    castingFraction: mods.flags.castingRegen ?? 0,
  }),

  init: (actor, config, mods) => {
    const guidance = mods.flags.spiritualGuidance ?? 0;
    if (guidance > 0) actor.addBonus({ spellPower: config.stats.spirit * guidance }, 1);
  },

  onCastStart: ({ spellId, actor, now, mods }) => {
    if (spellId === 'mind-blast') {
      actor.startCooldown(spellId, now, MIND_BLAST_COOLDOWN - (mods.flags.mindBlastCooldownOff ?? 0));
    }
    if (spellId === 'power-infusion') {
      actor.auras.apply(PRIEST_AURAS.powerInfusion, now, { duration: POWER_INFUSION.duration });
      actor.startCooldown(spellId, now, POWER_INFUSION.cooldown);
    }
  },

  damageBonusFor: ({ school, actor, now }) => {
    let bonus = 1;
    if (school === 'shadow') {
      bonus *= 1 + SHADOW_WEAVING.perStack * actor.auras.stacks(PRIEST_AURAS.shadowWeaving, now);
    }
    if (actor.auras.has(PRIEST_AURAS.powerInfusion, now)) bonus *= 1 + POWER_INFUSION.damage;
    return bonus;
  },

  /** Shadow Weaving stacks from any Shadow spell that lands. */
  onLand: ({ school, outcome, actor, now, rng, mods }) => {
    const chance = mods.flags.shadowWeaving ?? 0;
    if (outcome === 'miss' || school !== 'shadow' || chance <= 0) return;
    if (rng.chance(chance)) {
      actor.auras.apply(PRIEST_AURAS.shadowWeaving, now, {
        duration: SHADOW_WEAVING.duration, maxStacks: SHADOW_WEAVING.stacks,
      });
    }
  },

  forever: {
    status: 'unverified',
    note:
      'Forever rebuilt the Shadow tree, so the talents here are read from its own ' +
      'text. The spells are Classic level-sixty ranks.',
  },

  unmodelledTalents: {
    'Power in Light': 'Smite and Penance only gain it on a target with Holy Fire, which is not in the rotation.',
    'Wand Specialization': 'a wand is not in any rotation.',
    'Silent Resolve': 'threat does nothing to damage.',
    'Holy Precision': 'it only helps Holy spells, and Smite is only for a priest without Mind Flay.',
    'Improved Power Word: Shield': 'shields are not simulated.',
    Martyrdom: 'nothing hits you.',
    'Inner Focus': 'it is a button for one spell, which no rotation here holds.',
    'Improved Inner Fire': 'armor does nothing to damage.',
    'Mental Strength':
      'the intellect it adds is already on your sheet, but new intellect from a gear change is not scaled by it.',
    'Soul Warding': 'shields are not simulated.',
    'Improved Mana Burn': 'Mana Burn is not in any rotation.',
    Penance: 'at the one rank the tree shows it hits for less than Mind Flay.',
    'Renewed Hope': 'healing is not simulated.',
    'Divine Aegis': 'healing is not simulated.',
    'Twilight Focus': 'nothing here interrupts a cast.',
    'Improved Renew': 'healing is not simulated.',
    'Spell Warding': 'nothing casts at you.',
    'Holy Nova': 'it is not in any rotation.',
    'Blessed Recovery': 'nothing hits you.',
    Inspiration: 'healing is not simulated.',
    'Holy Reach': 'range does nothing to damage.',
    'Improved Healing': 'healing is not simulated.',
    'Binding Heal': 'healing is not simulated.',
    'Litany of Light': 'healing is not simulated.',
    'Spirit of Redemption': 'nothing here kills you.',
    'Spiritual Healing': 'healing is not simulated.',
    'Prayer of Mending': 'healing is not simulated.',
    Blackout: 'a stun does nothing to a boss.',
    'Spirit Tap': 'nothing dies.',
    'Shadow Affinity': 'threat does nothing to damage.',
    'Shadow Reach': 'range does nothing to damage.',
    'Improved Psychic Scream': 'Psychic Scream is not in any rotation.',
    'Improved Fade': 'Fade is not in any rotation.',
    'Vampiric Embrace': 'it heals the party, which is not simulated.',
    Silence: 'a boss cannot be silenced.',
    'Devouring Contagion': 'Devouring Plague is not in the rotation.',
    'Early Demise': 'Shadow Word: Death is not in the rotation.',
  },

  notes: [
    'The priest is taken to be in Shadowform from the pull when the talent is taken.',
    'Mind Flay lands all three ticks when the channel ends, and is never clipped.',
    'The simulated priest never hesitates between casts, which is worth a few per cent more ' +
      'than anyone actually manages.',
  ],
};
