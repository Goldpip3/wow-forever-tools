/**
 * Elemental Shaman: Flame Shock on the target, Lava Burst while it burns,
 * Chain Lightning when it is up and Lightning Bolt in between.
 *
 * It is the most mana-hungry thing the site has simulated. A Classic elemental
 * shaman ran dry partway through any fight that went on long enough, and the
 * results panel says when that happened rather than pretending the bar is
 * bottomless.
 */

import type { SpecModule } from '../spec';
import type { PriorityEntry } from '../rotation';
import { SHAMAN_AURAS, SHAMAN_UNMODELLED, shamanBase } from './shaman';

export const shamanElemental: SpecModule = {
  ...shamanBase,
  specId: 261,
  label: 'Elemental Shaman',
  buffRole: 'caster',
  referenceStat: 'spellPower',

  weightStats: [
    { stat: 'spellPower', step: 50 },
    { stat: 'naturePower', step: 50 },
    { stat: 'spellCrit', step: 2 },
    { stat: 'spellHit', step: 2 },
    { stat: 'intellect', step: 50 },
    { stat: 'spirit', step: 50 },
    { stat: 'mp5', step: 10 },
  ],

  rotations: {
    standard: (talents): PriorityEntry[] => [
      {
        // Recast once it is gone, not before: a new Flame Shock replaces the old
        // burn, so recasting with a tick still to come throws that tick away.
        spellId: 'flame-shock',
        when: (ctx) => !ctx.onTarget(SHAMAN_AURAS.flameShock),
        text: 'not debuff.flame-shock.up',
      },
      {
        // Lava Burst is a talent, so the line is skipped for anyone without it.
        spellId: 'lava-burst',
        when: (ctx) => (talents['Lava Burst'] ?? 0) > 0 && ctx.onTarget(SHAMAN_AURAS.flameShock),
        text: 'talent.lava-burst and debuff.flame-shock.up',
      },
      { spellId: 'chain-lightning' },
      { spellId: 'lightning-bolt' },
    ],
  },

  rotationLabels: {
    standard: 'Flame Shock kept up, Lava Burst, Chain Lightning, Lightning Bolt',
  },

  forever: {
    status: 'unverified',
    note:
      'Forever rebuilt the Elemental tree, so the talents here are read from its own text. The ' +
      'spells it says nothing about are still Classic values, apart from the faster casts the ' +
      'class notes give.',
  },

  unmodelledTalents: SHAMAN_UNMODELLED,

  notes: [
    'Lava Burst\'s damage is what the tree shows, which is its first rank. Its cast time, cooldown ' +
      'and cost are not given anywhere and are assumed.',
    'Chain Lightning is cast on cooldown against a single target. Against more than one, each ' +
      'jump keeps seventy per cent of the last, which is what the class notes say.',
    'The simulated shaman never hesitates between casts, which is worth a few per cent more than ' +
      'anyone actually manages.',
  ],
};
