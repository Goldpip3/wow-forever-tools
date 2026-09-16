/**
 * Fury Warrior: two weapons, Bloodthirst, and more rage than globals to spend
 * it on.
 *
 * The rotation is a priority list rather than a plan. Bloodthirst whenever it
 * is up, Whirlwind after it, and Heroic Strike with whatever rage is left over,
 * which is what keeps the bar from overflowing. Everything else is a cooldown
 * pressed as soon as it is worth pressing.
 */

import { priorityRotation } from '../rotation';
import { warriorSpec } from './warrior';

/** Above this much rage there is more coming in than globals to spend it. */
const RAGE_DUMP = 45;

export const warriorFury = warriorSpec({
  specId: 164,
  label: 'Fury Warrior',

  rotations: {
    standard: (talents) =>
      priorityRotation([
        {
          spellId: 'bloodrage',
          when: (ctx) => ctx.rage < 60,
          text: 'rage < 60',
        },
        {
          spellId: 'death-wish',
          when: (ctx) => ctx.timeLeft > 15,
          text: 'time_left > 15',
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
        { spellId: 'bloodthirst' },
        { spellId: 'whirlwind' },
        {
          spellId: 'execute',
          when: (ctx) => ctx.rage > 30,
          text: 'rage > 30',
        },
        {
          spellId: 'heroic-strike',
          when: (ctx) => ctx.rage > RAGE_DUMP,
          text: 'rage > ' + RAGE_DUMP,
        },
      ]),
  },

  rotationLabels: {
    standard: 'Bloodthirst and Whirlwind, with Heroic Strike on spare rage',
  },
});
