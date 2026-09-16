/**
 * Enhancement Shaman: a two-handed weapon, Windfury on it, and Stormstrike to
 * make the shocks land harder.
 *
 * Windfury Weapon is the spec. A fifth of the swings that land take another
 * swing at once with three hundred and fifteen more attack power, and nothing
 * else in the tree comes close to what that adds. Everything the rotation does
 * is pressed around the swing timer rather than instead of it.
 *
 * Windfury is assumed to be on the weapon. It is the imbue every Enhancement
 * shaman uses, and the notes say so rather than offering a choice nobody takes.
 */

import type { SpecModule } from '../spec';
import type { PriorityEntry } from '../rotation';
import {
  SHAMAN_AURAS,
  SHAMAN_UNMODELLED,
  WINDFURY_WEAPON,
  armShaman,
  shamanBase,
  shamanHaste,
  windfuryAttackPower,
} from './shaman';

export const shamanEnhancement: SpecModule = {
  ...shamanBase,
  specId: 263,
  label: 'Enhancement Shaman',
  buffRole: 'melee',
  referenceStat: 'attackPower',

  weightStats: [
    { stat: 'attackPower', step: 100 },
    { stat: 'strength', step: 50 },
    { stat: 'agility', step: 50 },
    { stat: 'crit', step: 2 },
    { stat: 'hit', step: 2 },
    { stat: 'haste', step: 5 },
    { stat: 'spellPower', step: 50 },
    { stat: 'intellect', step: 50 },
  ],

  extraNames: { windfury: 'Windfury Weapon' },

  rotations: {
    // Rage of the Farseer and Stormstrike are both talents, so each line is
    // skipped for anybody who did not take it.
    standard: (talents): PriorityEntry[] => [
      {
        spellId: 'rage-of-the-farseer',
        when: (ctx) => (talents['Rage of the Farseer'] ?? 0) > 0 && ctx.timeLeft > 25,
        text: 'talent.rage-of-the-farseer and time_left > 25',
      },
      {
        spellId: 'stormstrike',
        when: () => (talents.Stormstrike ?? 0) > 0,
        text: 'talent.stormstrike',
      },
      {
        // Earth Shock is only worth a global once Stormstrike has made the
        // target soft to Nature, and only while there is mana to spare.
        spellId: 'earth-shock',
        when: (ctx) => ctx.onTarget(SHAMAN_AURAS.stormstrike) && ctx.manaPct > 0.3,
        text: 'debuff.stormstrike.up and mana_pct > 0.3',
      },
    ],
  },

  rotationLabels: {
    standard: 'Stormstrike, and Earth Shock while it is up',
  },

  init: (actor, config) => {
    armShaman(actor, config.stats.weapons, 1 + (config.stats.haste ?? 0) / 100);
  },

  hasteFor: shamanHaste,

  /**
   * Windfury on the main hand, and Flurry on any critical strike. Flurry is
   * spent first and then put up again, or a crit would eat its own charge.
   */
  onSwing: ({ hand, outcome, actor, now, rng, mods, extraAttack }) => {
    const flurry = mods.flags.flurryRank ?? 0;
    if (flurry > 0 && actor.auras.has(SHAMAN_AURAS.flurry, now)) actor.auras.consume(SHAMAN_AURAS.flurry, now);
    if (flurry > 0 && outcome === 'crit') {
      actor.auras.apply(SHAMAN_AURAS.flurry, now, { duration: 15, stacks: 3, maxStacks: 3 });
    }

    const connected = outcome !== 'miss' && outcome !== 'dodge' && outcome !== 'parry';
    if (hand === 'main' && connected && rng.chance(WINDFURY_WEAPON.chance)) {
      extraAttack(windfuryAttackPower(mods), 'windfury');
    }
  },

  forever: {
    status: 'unverified',
    note:
      'Forever rebuilt the Enhancement tree, so the talents here are read from its own text. The ' +
      'abilities it says nothing about are still Classic values.',
  },

  unmodelledTalents: SHAMAN_UNMODELLED,

  notes: [
    'Windfury Weapon is assumed to be on the main hand, at the Classic Rank 4 attack power. It ' +
      'does not stack with Windfury Totem, so leave the totem unticked.',
    'Rage of the Farseer has no cooldown in the tree, so it is assumed to come back every three ' +
      'minutes.',
    'The simulated shaman never hesitates between globals, which is worth a few per cent more than ' +
      'anyone actually manages.',
  ],
};
