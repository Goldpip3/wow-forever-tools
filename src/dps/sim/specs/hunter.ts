/**
 * The hunter: Auto Shot on its own timer, shots pressed around it, and a pet
 * that is not simulated.
 *
 * The three trees shoot the same way, so they share this one module and differ
 * only in name. What changes between them is talents, and the talents are
 * read the same whichever tree they came from.
 *
 * A cast shot is the part a melee spec never had to think about. Aimed Shot
 * starts Auto Shot over once it is loosed, and Sniper Shot holds Auto Shot back
 * until it is done, which is why the rotation only starts Sniper Shot when the
 * next Auto Shot is far enough away.
 */

import { spiritRegenPer2s } from '../../data/conversions';
import {
  AIMED_SHOT_CAST,
  AMMO_DPS,
  ARCANE_SHOT_COOLDOWN,
  ASPECT_OF_THE_HAWK,
  DEADLY_ASPECTS,
  HUNTERS_MARK,
  HUNTER_ABILITIES,
  HUNTER_TALENT_HOOKS,
  RAPID_FIRE,
  SERPENT_STING,
  SNIPER_SHOT_CAST,
} from '../../data/hunter';
import type { SpecModule } from '../spec';
import type { SpellMods } from '../spells';
import type { PriorityEntry } from '../rotation';
import type { StatSheet } from '../types';

export const HUNTER_AURAS = {
  rapidFire: 'rapid-fire',
  deadlyAspects: 'deadly-aspects',
  serpentSting: 'serpent-sting',
};

/** Where Serpent Sting's ticks are billed. */
export const SERPENT_STING_DOT_ID = 'serpent-sting-dot';

/** Damage that depends on whether the pet is out, which the fight settings choose. */
function petChoice(withPet: boolean) {
  return (mods: SpellMods): void => {
    const bonus = withPet ? mods.flags.focusedFire ?? 0 : mods.flags.loneWolf ?? 0;
    if (bonus <= 0) return;
    mods.physicalDamage *= 1 + bonus;
    for (const school of ['arcane', 'nature'] as const) {
      mods.schoolDamage[school] = (mods.schoolDamage[school] ?? 1) * (1 + bonus);
    }
  };
}

/** The bow with its arrows, which the sheet does not know about. */
function withAmmo(stats: StatSheet): StatSheet['weapons'] {
  const ranged = stats.weapons.ranged;
  if (!ranged) return stats.weapons;
  const add = AMMO_DPS * ranged.speed;
  return { ...stats.weapons, ranged: { ...ranged, min: ranged.min + add, max: ranged.max + add } };
}

export function hunterSpec(specId: number, label: string): SpecModule {
  return {
    specId,
    label,
    resource: 'mana',
    buffRole: 'melee',
    spells: HUNTER_ABILITIES,
    talentHooks: HUNTER_TALENT_HOOKS,
    referenceStat: 'rangedAttackPower',

    weightStats: [
      { stat: 'rangedAttackPower', step: 100 },
      { stat: 'agility', step: 50 },
      { stat: 'crit', step: 2 },
      { stat: 'hit', step: 2 },
      { stat: 'intellect', step: 50 },
    ],

    stance: {
      label: 'Pet',
      options: [
        { id: 'pet', label: 'Pet out', mods: petChoice(true) },
        { id: 'lone', label: 'No pet', mods: petChoice(false) },
      ],
    },

    extraNames: { [SERPENT_STING_DOT_ID]: 'Serpent Sting, over time' },

    rotations: {
      standard: (talents): PriorityEntry[] => [
        {
          spellId: 'rapid-fire',
          when: (ctx) => ctx.timeLeft > 15,
          text: 'time_left > 15',
        },
        // A hunter runs out of mana long before the fight ends, so the shots
        // go in order of damage for the mana. Sniper Shot is the best of them,
        // and is only started when Auto Shot will not be due before it finishes.
        {
          spellId: 'sniper-shot',
          when: (ctx) => (talents['Sniper Shot'] ?? 0) > 0 && ctx.swingIn('ranged') > SNIPER_SHOT_CAST,
          text: 'talent.sniper-shot and swing.ranged.remains > 1.5',
        },
        {
          spellId: 'aimed-shot',
          when: (ctx) => ctx.manaPct > 0.3,
          text: 'mana_pct > 0.3',
        },
        {
          spellId: 'multi-shot',
          when: (ctx) => ctx.manaPct > 0.5,
          text: 'mana_pct > 0.5',
        },
        {
          spellId: 'serpent-sting',
          when: (ctx) => !ctx.onTarget(HUNTER_AURAS.serpentSting) && ctx.timeLeft > 12 && ctx.manaPct > 0.5,
          text: 'not debuff.serpent-sting.up and time_left > 12 and mana_pct > 0.5',
        },
        {
          spellId: 'arcane-shot',
          when: (ctx) => ctx.manaPct > 0.7,
          text: 'mana_pct > 0.7',
        },
      ],
    },

    rotationLabels: {
      standard: 'Shots in order of damage for the mana, Auto Shot never clipped',
    },

    manaRegen: (stats, mods) => ({
      per2s: spiritRegenPer2s('hunter', stats.spirit),
      castingFraction: mods.flags.castingRegen ?? 0,
    }),

    weaponsFor: withAmmo,

    init: (actor, config, mods) => {
      const stats = config.stats;
      const ranged = stats.weapons.ranged;
      if (ranged) actor.arm('ranged', ranged.speed, 0, 1 + (stats.haste ?? 0) / 100);

      // Aspect of the Hawk and Hunter's Mark are up before the pull, and
      // Careful Aim reads intellect, which a gear change can move.
      actor.addBonus({
        rangedAttackPower:
          ASPECT_OF_THE_HAWK.rangedAttackPower
          + HUNTERS_MARK.rangedAttackPower
          + stats.intellect * (mods.flags.carefulAim ?? 0),
      }, 1);
    },

    hasteFor: (actor, now) => {
      let factor = 1 + (actor.stats.haste ?? 0) / 100;
      if (actor.auras.has(HUNTER_AURAS.rapidFire, now)) factor *= 1 + RAPID_FIRE.haste;
      if (actor.auras.has(HUNTER_AURAS.deadlyAspects, now)) factor *= 1 + DEADLY_ASPECTS.haste;
      return factor;
    },

    onCastStart: ({ spellId, actor, now, mods }) => {
      const timer = actor.swings.ranged;
      if (spellId === 'rapid-fire') {
        actor.auras.apply(HUNTER_AURAS.rapidFire, now, { duration: RAPID_FIRE.duration });
        actor.startCooldown(spellId, now, RAPID_FIRE.cooldown - (mods.flags.rapidFireCooldownOff ?? 0));
      }
      if (spellId === 'arcane-shot') {
        actor.startCooldown(spellId, now, ARCANE_SHOT_COOLDOWN - (mods.flags.arcaneShotCooldownOff ?? 0));
      }
      // Aimed Shot starts Auto Shot over from the moment it is loosed. Sniper
      // Shot only holds it back until the cast is done.
      if (spellId === 'aimed-shot' && timer) timer.reset(now + AIMED_SHOT_CAST);
      if (spellId === 'sniper-shot' && timer) timer.delayUntil(now + SNIPER_SHOT_CAST);
    },

    /** Serpent Sting's damage, and Deadly Aspects on a normal shot. */
    onSwing: ({ spellId, outcome, white, actor, now, rng, mods, bleed }) => {
      if (outcome === 'miss') return;

      if (spellId === 'serpent-sting') {
        const total = SERPENT_STING.damage * (1 + (mods.flags.stingDamage ?? 0))
          * (mods.schoolDamage.nature ?? 1);
        bleed(SERPENT_STING_DOT_ID, total, SERPENT_STING.ticks, SERPENT_STING.interval);
        actor.targetAuras.apply(HUNTER_AURAS.serpentSting, now, {
          duration: SERPENT_STING.ticks * SERPENT_STING.interval,
        });
      }

      const chance = mods.flags.deadlyAspects ?? 0;
      if (white && chance > 0 && rng.chance(chance)) {
        actor.auras.apply(HUNTER_AURAS.deadlyAspects, now, { duration: DEADLY_ASPECTS.duration });
      }
    },

    forever: {
      status: 'unverified',
      note:
        'Forever rebuilt the hunter trees, so the talents here are read from their own text. The ' +
        'shots the trees say nothing about are Classic values.',
    },

    partlyModelledTalents: {
      'Rapid Killing':
        'the shorter Rapid Fire cooldown is modelled; the bonus after a kill is not, because nothing dies.',
      'Deadly Aspects':
        'the Aspect of the Hawk half is modelled; the Aspect of the Beast half is not, because the hunter here shoots.',
    },

    unmodelledTalents: {
      'Endurance Training': 'the pet is not simulated.',
      'Improved Aspect of the Monkey': 'dodge does nothing to damage.',
      Pathfinding: 'movement speed does nothing to damage.',
      'Improved Revive Pet': 'the pet is not simulated.',
      'Bestial Swiftness': 'the pet is not simulated.',
      'Unleashed Fury': 'the pet is not simulated, and hawks are not either.',
      'Improved Mend Pet': 'the pet is not simulated.',
      Ferocity: 'the pet is not simulated, and hawks are not either.',
      'Summon Hawk': 'what the hawk does after its first dive is not given.',
      'Spirit Bond': 'healing is not simulated.',
      Intimidation: 'the pet is not simulated.',
      Frenzy: 'the pet is not simulated.',
      'Bestial Wrath': 'the pet is not simulated.',
      'Hawk Eye': 'range does nothing to damage.',
      'Improved Concussive Shot': 'Concussive Shot is not in any rotation.',
      'Trueshot Aura': 'it is a raid buff: tick it in the buff list so it is not counted twice.',
      'Rapid Recuperation': 'it changes mana while casting for a short while, and mana is modelled at a steady rate.',
      'Scatter Shot': 'it is a crowd control shot, and no rotation here uses it.',
      'Improved Tracking': 'it only helps against one kind of creature, and the fight does not say what the boss is.',
      Deflection: 'a parry chance, which does nothing to damage.',
      Entrapment: 'traps are not simulated.',
      'Savage Strikes': 'the hunter here shoots rather than fighting in melee.',
      Survivalist: 'health does nothing to damage.',
      'Improved Wing Clip': 'Wing Clip is not in any rotation.',
      'Clever Traps': 'traps are not simulated.',
      Deterrence: 'dodge and parry do nothing to damage.',
      'Survival Tactics': 'traps and Feign Death are not simulated.',
      "Predator's Edge": 'the hunter here shoots rather than fighting in melee.',
      Counterattack: 'it needs you to parry, and nothing here attacks you.',
      Resourcefulness: 'traps and melee are not simulated.',
      'Expose Prey': 'Mongoose Bite is melee, and the hunter here shoots.',
      "Survivalist's Discipline": 'traps and Deterrence are not simulated.',
      'Strider Kick': 'the hunter here shoots rather than fighting in melee.',
      'Lightning Reflexes':
        'the agility it adds is already on your sheet, but new agility from a gear change is not scaled by it.',
      'Lacerating Strikes': 'Mongoose Bite is melee, and the hunter here shoots.',
    },

    notes: [
      'The pet is not simulated at all. With "Pet out" its talents still count for you, but the ' +
        'damage the pet itself does is not in this number.',
      'Thorium Headed Arrows are assumed to be in the quiver, because the export does not say.',
      'Aspect of the Hawk and Hunter\'s Mark are taken to be up from the pull.',
      'Ranged crit is read as your melee crit. For most hunters the two are the same.',
    ],
  };
}

export const hunterBeastMastery = hunterSpec(361, 'Beast Mastery Hunter');
export const hunterMarksmanship = hunterSpec(363, 'Marksmanship Hunter');
export const hunterSurvival = hunterSpec(362, 'Survival Hunter');
