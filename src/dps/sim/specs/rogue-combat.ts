/**
 * Combat Rogue: two weapons, an energy bar that arrives in lumps, and a finisher
 * that is worth whatever was banked when you pressed it.
 *
 * It is the third shape the engine has had to take. A mage spends mana that
 * trickles, a warrior earns rage by hitting things, and a rogue is handed
 * twenty energy every two seconds whatever happens, which is why its rotation is
 * about not wasting a tick rather than about not running dry.
 *
 * Slice and Dice is the reason the rotation looks the way it does: it makes the
 * weapons swing a third again as fast, so keeping it up is worth more than any
 * one Eviscerate, and the first thing the list does is put it back.
 */

import * as K from '../../data/combat-constants';
import {
  ADRENALINE_RUSH,
  BLADE_FLURRY,
  ROGUE_ABILITIES,
  ROGUE_FLAGS,
  ROGUE_TALENT_HOOKS,
  SLICE_AND_DICE,
  sliceDuration,
} from '../../data/rogue';
import type { Actor } from '../actor';
import type { SpecModule } from '../spec';
import type { SpellMods } from '../spells';
import type { PriorityEntry } from '../rotation';
import type { Hand, SimConfig, WeaponStats } from '../types';

export const ROGUE_AURAS = {
  sliceAndDice: 'slice-and-dice',
  adrenalineRush: 'adrenaline-rush',
  bladeFlurry: 'blade-flurry',
};

/** Hack and Slash reads the weapon, so it cannot be folded in with the talents. */
function applyHackAndSlash(mods: SpellMods, weapon: WeaponStats | undefined): void {
  const rank = mods.flags[ROGUE_FLAGS.hackAndSlashRank] ?? 0;
  if (!rank || !weapon) return;
  const type = weapon.type.toLowerCase();

  if (type.includes('dagger') || type.includes('fist')) mods.meleeCrit += rank;
  else if (type.includes('mace')) mods.armorIgnored += 0.03 * rank;
  else if (type.includes('sword') || type.includes('axe')) mods.flags.hackAndSlashSword = 0.01 * rank;
}

export const rogueCombat: SpecModule = {
  specId: 181,
  label: 'Combat Rogue',
  resource: 'energy',
  buffRole: 'melee',
  spells: ROGUE_ABILITIES,
  talentHooks: ROGUE_TALENT_HOOKS,
  referenceStat: 'attackPower',

  weightStats: [
    { stat: 'attackPower', step: 100 },
    { stat: 'agility', step: 50 },
    { stat: 'strength', step: 50 },
    { stat: 'crit', step: 2 },
    { stat: 'hit', step: 2 },
    { stat: 'haste', step: 5 },
    { stat: 'stamina', step: 50 },
  ],

  rotations: {
    standard: (): PriorityEntry[] => [
      // Nothing else is worth a global while the weapons are swinging slowly.
      // Refreshing it at two points costs a finisher to buy twelve seconds, so
      // the first line waits for a nearly full bar and the second only fires
      // when it is about to drop and waiting would cost more than spending.
      {
        spellId: 'slice-and-dice',
        when: (ctx) => ctx.remaining(ROGUE_AURAS.sliceAndDice) < 3 && ctx.comboPoints >= 4,
        text: 'buff.slice-and-dice.remains < 3 and combo >= 4',
      },
      {
        spellId: 'slice-and-dice',
        when: (ctx) => ctx.remaining(ROGUE_AURAS.sliceAndDice) < 1,
        text: 'buff.slice-and-dice.remains < 1',
      },
      {
        spellId: 'adrenaline-rush',
        when: (ctx) => ctx.timeLeft > 15,
        text: 'time_left > 15',
      },
      {
        spellId: 'blade-flurry',
        when: (ctx) => ctx.timeLeft > 15,
        text: 'time_left > 15',
      },
      {
        spellId: 'eviscerate',
        when: (ctx) => ctx.comboPoints >= 5,
        text: 'combo >= 5',
      },
      { spellId: 'sinister-strike' },
    ],
  },

  rotationLabels: {
    standard: 'Slice and Dice kept up, Eviscerate at five points',
  },

  configure: (config: SimConfig, mods: SpellMods): void => {
    void config;
    void mods;
  },

  init: (actor: Actor, config: SimConfig, mods: SpellMods): void => {
    const weapons = config.stats.weapons;
    const haste = 1 + (config.stats.haste ?? 0) / 100;
    if (weapons.main) actor.arm('main', weapons.main.speed, 0, haste);
    if (weapons.off) actor.arm('off', weapons.off.speed, 0, haste);

    actor.energy.max = K.ENERGY_MAX.value + (mods.flags.bonusEnergy ?? 0);
    actor.energy.current = actor.energy.max;

    // Only once per run: the mods are shared between iterations, so applying the
    // weapon branch again would stack it.
    if (!mods.flags.hackAndSlashDone) {
      applyHackAndSlash(mods, weapons.main);
      mods.flags.hackAndSlashDone = 1;
    }
  },

  /** Slice and Dice and Blade Flurry both speed the weapons up. */
  hasteFor: (actor: Actor, now: number): number => {
    let factor = 1 + (actor.stats.haste ?? 0) / 100;
    if (actor.auras.has(ROGUE_AURAS.sliceAndDice, now)) factor *= 1 + SLICE_AND_DICE.haste;
    if (actor.auras.has(ROGUE_AURAS.bladeFlurry, now)) factor *= 1 + BLADE_FLURRY.haste;
    return factor;
  },

  /** Puncturing Wounds only speaks about Backstab. */
  critBonusFor: ({ spellId, mods }) =>
    (spellId === 'backstab' ? mods.flags[ROGUE_FLAGS.backstabCrit] ?? 0 : 0),

  /**
   * The finishers, at the moment they are pressed.
   *
   * The engine has already taken the points off by the time a strike resolves,
   * so anything that needs to know how many there were has to read them here.
   */
  onCastStart: ({ spellId, actor, now, rng, mods }): void => {
    if (spellId === 'adrenaline-rush') {
      actor.auras.apply(ROGUE_AURAS.adrenalineRush, now, { duration: ADRENALINE_RUSH.duration });
    }
    if (spellId === 'blade-flurry') {
      actor.auras.apply(ROGUE_AURAS.bladeFlurry, now, { duration: BLADE_FLURRY.duration });
    }

    const spends = spellId === 'eviscerate' || spellId === 'slice-and-dice';
    if (!spends) return;

    const points = actor.comboPoints;
    if (spellId === 'slice-and-dice') {
      actor.auras.apply(ROGUE_AURAS.sliceAndDice, now, { duration: sliceDuration(points, mods) });
      actor.spendCombo();
    }

    // Relentless Strikes hands energy back per point, and Ruthlessness hands a
    // point back. Both read what was spent, so both happen here.
    const relentless = mods.flags[ROGUE_FLAGS.relentlessChance] ?? 0;
    if (relentless > 0 && rng.chance(Math.min(1, relentless * points))) actor.gain('energy', 25);

    const ruthless = mods.flags[ROGUE_FLAGS.ruthlessnessChance] ?? 0;
    if (ruthless > 0 && rng.chance(Math.min(1, ruthless))) actor.addCombo(1, K.COMBO_POINT_MAX.value);
  },

  /**
   * Hack and Slash with a sword or an axe swings again on a chance, and Seal
   * Fate hands a point back for a critical strike that earned one.
   */
  onSwing: ({ spellId, outcome, actor, rng, mods, extraAttack }): void => {
    const connected = outcome !== 'miss' && outcome !== 'dodge' && outcome !== 'parry';
    const sword = mods.flags.hackAndSlashSword ?? 0;
    if (connected && sword > 0 && rng.chance(sword)) extraAttack();

    if (outcome !== 'crit') return;
    if (spellId !== 'sinister-strike' && spellId !== 'backstab') return;
    const chance = mods.flags[ROGUE_FLAGS.sealFateChance] ?? 0;
    if (chance > 0 && rng.chance(Math.min(1, chance))) actor.addCombo(1, K.COMBO_POINT_MAX.value);
  },

  /** Adrenaline Rush is a second helping of energy on the same heartbeat. */
  onResourceTick: ({ actor, now }): void => {
    if (actor.auras.has(ROGUE_AURAS.adrenalineRush, now)) {
      actor.gain('energy', K.ENERGY_PER_TICK.value);
    }
  },

  /** Blade Flurry reaches one more thing while it is up. */
  extraHandsFor: (): Hand[] => [],

  forever: {
    status: 'unverified',
    note:
      'Forever moved the rogue trees, so the talents here are read from its own text. The ' +
      'abilities the trees say nothing about are still Classic values.',
  },

  unmodelledTalents: {
    'Vile Poisons': 'poisons are not simulated, so nothing that changes them does anything.',
    'Improved Poisons': 'poisons are not simulated.',
    Venom: 'it is a finisher that only changes poisons, which are not simulated.',
    Murder: 'it only helps against a humanoid or a giant, and the fight does not say what the boss is.',
    'Cold Blood': 'it makes one strike a critical one, and no rotation here holds it for the right one.',
    'Remorseless Attacks': 'it needs something to have died, and nothing does.',
    'Improved Expose Armor': 'Expose Armor is not in any rotation.',
    'Improved Kidney Shot': 'Kidney Shot is not in any rotation.',
    'Lightning Reflexes': 'a dodge chance, which does nothing to somebody behind a boss.',
    Deflection: 'a parry chance, which does nothing to somebody behind a boss.',
    Riposte: 'it becomes usable after you parry, and nothing here parries.',
    'Improved Gouge': 'Gouge is not in any rotation.',
    Endurance: 'it shortens Sprint and Evasion, neither of which is in a rotation.',
    'Improved Sprint': 'Sprint is not in any rotation.',
    'Improved Kick': 'Kick is not in any rotation.',
  },

  notes: [
    'Poisons are not simulated at all, and a rogue in Classic got a large share of its damage ' +
      'from them. The figure here is the weapons and the finishers alone.',
    'Backstab needs a dagger and needs you behind the target. The rotation only offers it when ' +
      'a dagger is in the main hand.',
    'The simulated rogue never hesitates between globals, which is worth a few per cent more ' +
      'than anyone actually manages.',
  ],
};
