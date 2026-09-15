/**
 * Frost Mage: the reference spec.
 *
 * It was picked to go first because its rotation is one button, which makes the
 * damage checkable by hand, while still exercising every piece the engine has:
 * cast timing, the spell hit and crit rolls, a stacking debuff on the boss,
 * procs that buff the caster, cooldowns worth planning around, and a mana pool
 * that runs out.
 *
 * Adding another spec means writing a file shaped like this one and adding it
 * to the registry next door. Nothing in the engine has to change unless the
 * spec needs a mechanic the engine has never seen.
 */

import { spiritRegenPer2s } from '../../data/conversions';
import {
  CLEARCASTING_DURATION,
  EVOCATION,
  FINGERS_OF_FROST_DURATION,
  FROSTBOLT,
  FROST_TALENT_HOOKS,
  MAGE_ARMOR_REGEN,
  MANA_GEM,
  MANA_GEM_AMOUNT,
  MANA_POTION,
  MANA_POTION_AMOUNT,
  MAGE_SPELLS,
  WINTERS_CHILL_DURATION,
  WINTERS_CHILL_PER_STACK,
} from '../../data/mage';
import { priorityRotation } from '../rotation';
import type { SpecModule } from '../spec';

const CLEARCASTING = 'clearcasting';
const FINGERS_OF_FROST = 'fingers-of-frost';
const WINTERS_CHILL = 'winters-chill';

export const mageFrost: SpecModule = {
  specId: 61,
  label: 'Frost Mage',
  spells: MAGE_SPELLS,
  talentHooks: FROST_TALENT_HOOKS,
  referenceStat: 'spellPower',

  rotations: {
    standard: () =>
      priorityRotation([
        // Nothing else is worth a global while the tank is waiting, so the only
        // question each time is whether mana needs attention first.
        {
          spellId: 'evocation',
          when: (ctx) => ctx.timeLeft > EVOCATION.duration + 4,
        },
        {
          spellId: 'mana-gem',
          when: (ctx) => ctx.actor.maxMana - ctx.actor.mana > MANA_GEM_AMOUNT,
        },
        {
          spellId: 'mana-potion',
          when: (ctx) => ctx.actor.maxMana - ctx.actor.mana > MANA_POTION_AMOUNT,
        },
        { spellId: 'frostbolt' },
      ]),
  },

  rotationLabels: {
    standard: 'Frostbolt, with mana handled as it runs low',
  },

  weightStats: [
    { stat: 'spellPower', step: 50 },
    { stat: 'frostPower', step: 50 },
    { stat: 'spellCrit', step: 2 },
    { stat: 'spellHit', step: 2 },
    { stat: 'intellect', step: 50 },
    { stat: 'spirit', step: 50 },
    { stat: 'mp5', step: 10 },
    { stat: 'stamina', step: 50 },
  ],

  /**
   * Mage Armor is the only thing that keeps spirit flowing while casting, and
   * it changes what mana is worth enough that it belongs in the fight settings
   * rather than being assumed either way.
   */
  init: (_actor, config, mods) => {
    if (config.fight.buffs.includes('mage-armor')) mods.flags.spiritWhileCasting = MAGE_ARMOR_REGEN;
  },

  manaRegen: (stats, mods) => ({
    per2s: spiritRegenPer2s('mage', stats.spirit),
    // Nothing gives a frost mage regeneration while casting unless Mage Armor
    // is up, and the demo did not confirm what Forever's version does.
    castingFraction: mods.flags.spiritWhileCasting ?? 0,
  }),

  /** Clearcasting makes the next spell free. */
  costFor: ({ baseCost, actor, now }) => (actor.auras.has(CLEARCASTING, now) ? 0 : baseCost),

  /** Consumed the moment the free cast starts, not when it lands. */
  onCastStart: ({ actor, now }) => {
    actor.auras.consume(CLEARCASTING, now);
  },

  /**
   * Winter's Chill stacks on the boss and Fingers of Frost sits on the caster.
   * Both only help the frost spells they name.
   */
  critBonusFor: ({ school, actor, now, mods }) => {
    if (school !== 'frost') return 0;
    let bonus = actor.targetAuras.stacks(WINTERS_CHILL, now) * WINTERS_CHILL_PER_STACK;
    if (actor.auras.has(FINGERS_OF_FROST, now)) bonus += mods.flags.shatterCrit ?? 0;
    return bonus;
  },

  onCastFinish: ({ spellId, actor, stats }) => {
    if (spellId !== 'evocation') return;
    // Regeneration runs at sixteen times the usual rate for the whole channel.
    const per2s = spiritRegenPer2s('mage', stats.spirit);
    actor.restore(per2s * EVOCATION.multiplier * EVOCATION.ticks);
  },

  onLand: ({ spellId, school, outcome, actor, rng, now, mods }) => {
    if (outcome === 'miss') return;

    // Fingers of Frost is spent by the spell that benefited from it, and the
    // same spell can put a fresh one up on its way out.
    if (actor.auras.has(FINGERS_OF_FROST, now)) actor.auras.consume(FINGERS_OF_FROST, now);

    if (school === 'frost') {
      const chillChance = mods.flags.wintersChillChance ?? 0;
      const maxStacks = mods.flags.wintersChillMaxStacks ?? 0;
      if (chillChance > 0 && maxStacks > 0 && rng.chance(chillChance)) {
        actor.targetAuras.apply(WINTERS_CHILL, now, {
          duration: WINTERS_CHILL_DURATION,
          maxStacks,
        });
      }

      // Frostbolt slows, and a slow is the Chill that Fingers of Frost watches.
      const fingersChance = mods.flags.fingersOfFrostChance ?? 0;
      if (spellId === FROSTBOLT.id && fingersChance > 0 && rng.chance(fingersChance)) {
        actor.auras.apply(FINGERS_OF_FROST, now, { duration: FINGERS_OF_FROST_DURATION });
      }
    }

    const clearcasting = mods.flags.clearcastingChance ?? 0;
    if (clearcasting > 0 && rng.chance(clearcasting)) {
      actor.auras.apply(CLEARCASTING, now, { duration: CLEARCASTING_DURATION });
    }
  },

  forever: {
    status: 'unverified',
    note:
      'Frostbolt is modelled at the Classic Rank 11 values because the demo footage stopped ' +
      'at level thirty-eight.',
  },

  notes: [
    'Ice Lance is in the Forever tree but only its first rank was ever shown, so no rotation ' +
      'casts it and it counts for nothing here.',
    'Shatter only helps while the target counts as frozen, which against a boss means the ' +
      'Fingers of Frost window and nothing else. Frostbite is left out for the same reason.',
    'The simulated player never hesitates between casts, which is worth a few per cent more ' +
      'than anyone actually manages.',
  ],
};

/** Ids the tests and the UI use when they want to talk about these auras. */
export const FROST_AURAS = {
  clearcasting: CLEARCASTING,
  fingersOfFrost: FINGERS_OF_FROST,
  wintersChill: WINTERS_CHILL,
};

/** Kept so the rotation list can name the spells it uses without importing data. */
export const FROST_SPELL_IDS = {
  frostbolt: FROSTBOLT.id,
  manaGem: MANA_GEM.id,
  manaPotion: MANA_POTION.id,
};
