/**
 * The warlock: damage over time kept on the boss, Shadow Bolt between, and a
 * demon that is not simulated but still decides what several talents do.
 *
 * The three trees cast the same spells, so they share this module and differ
 * in name and talents. Which demon is out, or which was sacrificed, is a choice
 * in the fight settings, because Demonic Sacrifice, Soul Link, Demonic
 * Knowledge and Master Demonologist each read it.
 */

import { spiritRegenPer2s } from '../../data/conversions';
import {
  CONFLAGRATE_COOLDOWN,
  IMPROVED_SHADOW_BOLT,
  LIFE_TAP_MANA,
  SHADOW_AND_FLAME,
  SHADOW_TRANCE,
  WARLOCK_SPELLS,
  WARLOCK_TALENT_HOOKS,
} from '../../data/warlock';
import type { SpecModule, StanceOption } from '../spec';
import type { SpellMods } from '../spells';
import type { PriorityEntry } from '../rotation';

export const WARLOCK_AURAS = {
  shadowTrance: 'shadow-trance',
  improvedShadowBolt: 'improved-shadow-bolt',
  shadowAndFlame: 'shadow-and-flame',
};

/** What was decided when the cast in progress started. */
const thisCast = { spellId: '', speed: 1 };

type Demon = 'imp' | 'succubus';

/** The damage side of each demon choice, from the talents that read it. */
function demonChoice(demon: Demon, sacrificed: boolean) {
  return (mods: SpellMods): void => {
    mods.flags.petOut = sacrificed ? 0 : 1;
    if (sacrificed) {
      if (!mods.flags.demonicSacrifice) return;
      // 'Imp: Increases your Shadow damage by 15%. ... Succubus/Incubus:
      // Increases your Fire damage by 15%.'
      const school = demon === 'imp' ? 'shadow' : 'fire';
      mods.schoolDamage[school] = (mods.schoolDamage[school] ?? 1) * 1.15;
      return;
    }
    const master = mods.flags.masterDemonologist ?? 0;
    if (master > 0) {
      const school = demon === 'imp' ? 'fire' : 'shadow';
      mods.schoolDamage[school] = (mods.schoolDamage[school] ?? 1) * (1 + master);
    }
    if (mods.flags.soulLink) {
      for (const school of ['shadow', 'fire'] as const) {
        mods.schoolDamage[school] = (mods.schoolDamage[school] ?? 1) * 1.03;
      }
    }
  };
}

const DEMONS: StanceOption[] = [
  { id: 'imp', label: 'Imp out', mods: demonChoice('imp', false) },
  { id: 'succubus', label: 'Succubus out', mods: demonChoice('succubus', false) },
  { id: 'imp-sacrificed', label: 'Imp sacrificed', mods: demonChoice('imp', true) },
  { id: 'succubus-sacrificed', label: 'Succubus sacrificed', mods: demonChoice('succubus', true) },
];

export function warlockSpec(specId: number, label: string): SpecModule {
  return {
    specId,
    label,
    resource: 'mana',
    buffRole: 'caster',
    spells: WARLOCK_SPELLS,
    talentHooks: WARLOCK_TALENT_HOOKS,
    referenceStat: 'spellPower',

    weightStats: [
      { stat: 'spellPower', step: 50 },
      { stat: 'shadowPower', step: 50 },
      { stat: 'firePower', step: 50 },
      { stat: 'spellCrit', step: 2 },
      { stat: 'spellHit', step: 2 },
      { stat: 'intellect', step: 50 },
      { stat: 'spirit', step: 50 },
    ],

    stance: { label: 'Demon', options: DEMONS },

    rotations: {
      standard: (talents): PriorityEntry[] => [
        {
          spellId: 'bane-of-agony',
          when: (ctx) => !ctx.onTarget('bane-of-agony') && ctx.timeLeft > 20,
          text: 'not debuff.bane-of-agony.up and time_left > 20',
        },
        {
          spellId: 'corruption',
          when: (ctx) => !ctx.onTarget('corruption') && ctx.timeLeft > 12,
          text: 'not debuff.corruption.up and time_left > 12',
        },
        {
          spellId: 'immolate',
          when: (ctx) => !ctx.onTarget('immolate') && ctx.timeLeft > 9,
          text: 'not debuff.immolate.up and time_left > 9',
        },
        {
          spellId: 'conflagrate',
          when: (ctx) => (talents.Conflagrate ?? 0) > 0 && ctx.onTarget('immolate')
            && ctx.remainingOnTarget('immolate') < 4,
          text: 'talent.conflagrate and debuff.immolate.up and debuff.immolate.remains < 4',
        },
        { spellId: 'life-tap' },
        { spellId: 'shadow-bolt' },
      ],
    },

    rotationLabels: {
      standard: 'Bane of Agony, Corruption and Immolate kept up, Shadow Bolt between',
    },

    manaRegen: (stats) => ({
      per2s: spiritRegenPer2s('warlock', stats.spirit),
      castingFraction: 0,
    }),

    init: (actor, config, mods) => {
      thisCast.spellId = '';
      thisCast.speed = 1;
      const knowledge = mods.flags.demonicKnowledge ?? 0;
      if (knowledge > 0 && mods.flags.petOut) {
        actor.addBonus({ spellPower: config.stats.level * knowledge }, 1);
      }
    },

    castSpeedFor: (_actor, _now, _mods, spellId) => (spellId === thisCast.spellId ? thisCast.speed : 1),

    onCastStart: ({ spellId, actor, now }) => {
      thisCast.spellId = spellId;
      thisCast.speed = 1;
      if (spellId === 'shadow-bolt' && actor.auras.has(WARLOCK_AURAS.shadowTrance, now)) {
        thisCast.speed = 1000;
        actor.auras.consume(WARLOCK_AURAS.shadowTrance, now);
      }
      if (spellId === 'conflagrate') actor.startCooldown(spellId, now, CONFLAGRATE_COOLDOWN);
    },

    onCastFinish: ({ spellId, actor, mods }) => {
      if (spellId === 'life-tap') actor.restore(LIFE_TAP_MANA * (mods.flags.lifeTap ?? 0));
    },

    critBonusFor: ({ spellId, mods }) => (spellId === 'conflagrate' ? mods.flags.fireAndBrimstone ?? 0 : 0),

    damageBonusFor: ({ spellId, school, actor, now, mods, periodic }) => {
      let bonus = 1;
      if (periodic) bonus *= 1 + (mods.flags.malediction ?? 0);
      if (spellId === 'immolate' && !periodic) bonus *= 1 + (mods.flags.aftermath ?? 0);
      if (school === 'shadow') {
        if (actor.targetAuras.has(WARLOCK_AURAS.improvedShadowBolt, now)) {
          bonus *= 1 + (mods.flags.improvedShadowBolt ?? 0);
        }
        if (actor.auras.has(WARLOCK_AURAS.shadowAndFlame, now)) bonus *= 1 + (mods.flags.shadowAndFlame ?? 0);
      }
      return bonus;
    },

    onLand: ({ spellId, outcome, actor, now, rng, mods }) => {
      if (outcome === 'miss') return;
      if (spellId === 'shadow-bolt' && outcome === 'crit' && (mods.flags.improvedShadowBolt ?? 0) > 0) {
        actor.targetAuras.apply(WARLOCK_AURAS.improvedShadowBolt, now, { duration: IMPROVED_SHADOW_BOLT.duration });
      }
      if (spellId === 'conflagrate') {
        if ((mods.flags.shadowAndFlame ?? 0) > 0) {
          actor.auras.apply(WARLOCK_AURAS.shadowAndFlame, now, { duration: SHADOW_AND_FLAME.duration });
        }
        // Conflagrate burns Immolate up, unless Shadow and Flame keeps it.
        if (!rng.chance(Math.min(1, mods.flags.keepImmolate ?? 0))) actor.targetAuras.remove('immolate', now);
      }
    },

    /** Nightfall watches Corruption's ticks. */
    onTick: ({ spellId, actor, now, rng, mods }) => {
      const chance = mods.flags.nightfall ?? 0;
      if (spellId === 'corruption' && chance > 0 && rng.chance(chance)) {
        actor.auras.apply(WARLOCK_AURAS.shadowTrance, now, { duration: SHADOW_TRANCE.duration });
      }
    },

    forever: {
      status: 'unverified',
      note:
        'Forever rebuilt the warlock trees, so the talents here are read from their own text. The ' +
        'spells are Classic level-sixty ranks.',
    },

    unmodelledTalents: {
      'Soul Harvesting': 'nothing dies with Drain Soul on it.',
      'Improved Drains': 'Drain Life and Drain Soul are not in the rotation.',
      'Fel Concentration': 'nothing here interrupts a cast.',
      'Amplify Curse': 'it is a three minute button for one Bane, which the rotation does not hold.',
      Pandemic: 'damage over time never crits here.',
      'Curse of Exhaustion': 'a slow does nothing to a boss.',
      'Siphon Life': 'at the one rank the tree shows, fifteen every three seconds, it is not worth a global.',
      'Soul Siphon': 'Drain Life and Drain Soul are not in the rotation.',
      Wrack: 'a six second shadow dot, too short for the rotation to keep up.',
      'Improved Health Funnel': 'Health Funnel is not in any rotation.',
      'Improved Imp': 'the demon is not simulated.',
      'Demonic Embrace': 'stamina does nothing to damage.',
      'Unholy Power': 'the demon is not simulated.',
      'Demonic Aegis': 'armor does nothing to damage.',
      'Improved Voidwalker': 'the demon is not simulated.',
      'Fel Vitality': 'the mana it adds is already on your sheet.',
      'Demonic Energies': 'the demon is not simulated.',
      'Improved Sayaad': 'the demon is not simulated.',
      'Master Summoner': 'the demon is summoned before the pull.',
      Decimation: 'Soul Fire is not in the rotation, and the boss\'s health is not read for it.',
      'Fel Domination': 'the demon is summoned before the pull.',
      'Demonic Brand': 'Searing Pain is not in the rotation.',
      'Improved Felhunter': 'the demon is not simulated.',
      'Demonic Pact': 'no demon is summoned during the fight, so nothing cancels the sacrifice.',
      'Destructive Reach': 'range does nothing to damage.',
      'Molten Skin': 'nothing hits you.',
      Shadowburn: 'it needs a Soul Shard, and shards are not simulated.',
      Intensity: 'nothing here interrupts a cast.',
      Pyroclasm: 'a stun does nothing to a boss.',
      'Bane of Havoc': 'it only matters with a second target to hit.',
      Incinerate: 'only the rank the talent teaches is known, which is far below Shadow Bolt.',
    },

    notes: [
      'The demon is not simulated. Which one is out, or was sacrificed, still counts for the ' +
        'talents that read it.',
      'Life Tap\'s health is not counted, because nothing here is hurting you.',
      'Bane of Agony takes the curse slot. If another warlock is counting on you for Curse of ' +
        'Shadow, untick it from the boss debuffs or the two are counted together.',
    ],
  };
}

export const warlockAffliction = warlockSpec(302, 'Affliction Warlock');
export const warlockDemonology = warlockSpec(303, 'Demonology Warlock');
export const warlockDestruction = warlockSpec(301, 'Destruction Warlock');
