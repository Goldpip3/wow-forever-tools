/**
 * Arms Warrior: one large weapon, Mortal Strike, and Deep Wounds bleeding away
 * behind every critical strike.
 *
 * It earns far less rage than Fury does, because rage comes in proportion to
 * how often the weapon lands rather than how hard, so the rage dump sits higher
 * up the bar and Heroic Strike is the last thing on the list rather than the
 * thing keeping it from overflowing.
 */

import { priorityRotation } from '../rotation';
import { warriorSpec } from './warrior';

/** A two-hander earns rage in lumps, so there is less spare than Fury has. */
const RAGE_DUMP = 60;

export const warriorArms = warriorSpec({
  specId: 161,
  label: 'Arms Warrior',

  rotations: {
    standard: (talents) =>
      priorityRotation([
        {
          spellId: 'bloodrage',
          when: (ctx) => ctx.rage < 60,
          text: 'rage < 60',
        },
        {
          spellId: 'recklessness',
          when: (ctx) => ctx.timeLeft > 15,
          text: 'time_left > 15',
        },
        {
          // Without Improved Berserker Rage it earns nothing, and a global
          // spent on nothing is a global not spent on a strike.
          spellId: 'berserker-rage',
          when: (ctx) => (talents['Improved Berserker Rage'] ?? 0) > 0 && ctx.rage < 80,
          text: 'talent.improved-berserker-rage and rage < 80',
        },
        { spellId: 'mortal-strike' },
        {
          spellId: 'execute',
          when: (ctx) => ctx.rage > 25,
          text: 'rage > 25',
        },
        { spellId: 'whirlwind' },
        {
          spellId: 'heroic-strike',
          when: (ctx) => ctx.rage > RAGE_DUMP,
          text: 'rage > ' + RAGE_DUMP,
        },
      ]),
  },

  rotationLabels: {
    standard: 'Mortal Strike and Whirlwind, with Execute once the boss is low',
  },
});
