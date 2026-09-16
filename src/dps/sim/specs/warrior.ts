/**
 * What Arms and Fury have in common, which is nearly all of it.
 *
 * A warrior is the other half of the engine from a frost mage: no mana, no cast
 * bar worth speaking of, and a weapon swinging on a timer that everything else
 * hangs off. Rage arrives from swings, Flurry speeds the swings up, and the
 * swings earn more rage. Getting that loop right is the whole spec.
 *
 * The two trees differ in one strike and one rotation, so they share this file
 * and declare only what is theirs.
 */

import * as K from '../../data/combat-constants';
import {
  BLOODRAGE,
  DEATH_WISH,
  DEEP_WOUNDS,
  ENRAGE,
  FLURRY,
  RECKLESSNESS,
  WARRIOR_ABILITIES,
  WARRIOR_FLAGS,
  WARRIOR_TALENT_HOOKS,
  whirlwindHitsOffhand,
} from '../../data/warrior';
import type { Actor } from '../actor';
import type { SpecModule } from '../spec';
import type { SpellMods } from '../spells';
import type { Hand, SimConfig, WeaponStats } from '../types';

export const WARRIOR_AURAS = {
  flurry: 'flurry',
  deathWish: 'death-wish',
  recklessness: 'recklessness',
  enrage: 'enrage',
  bloodrage: 'bloodrage',
};

/** The tally id Deep Wounds bills its ticks to. */
export const DEEP_WOUNDS_ID = 'deep-wounds';

/* ---------------------------------------------------------------- setting up */

/**
 * Weaponmaster reads whatever is in your hand, so it cannot be folded in with
 * the other talents: the mods are worked out before the gear is known. It is
 * resolved here instead, once the weapons are on.
 */
function applyWeaponmaster(mods: SpellMods, weapon: WeaponStats | undefined): void {
  const rank = mods.flags.weaponmasterRank ?? 0;
  if (!rank || !weapon) return;
  const type = weapon.type.toLowerCase();

  if (type.includes('axe') || type.includes('polearm')) mods.meleeCrit += rank;
  else if (type.includes('mace') || type.includes('staff')) mods.armorIgnored += 0.03 * rank;
  else if (type.includes('sword')) mods.flags[WARRIOR_FLAGS.swordSpecChance] = 0.01 * rank;
}

/** Arms the hands the character is actually holding something in. */
export function armWarrior(actor: Actor, config: SimConfig, mods: SpellMods): void {
  const weapons = config.stats.weapons;
  const haste = 1 + (config.stats.haste ?? 0) / 100;

  if (weapons.main) actor.arm('main', weapons.main.speed, 0, haste);
  if (weapons.off) actor.arm('off', weapons.off.speed, 0, haste);

  // Only once per run: the mods are shared between iterations, so applying the
  // weapon branch again would stack it.
  if (!mods.flags.weaponmasterDone) {
    applyWeaponmaster(mods, weapons.main);
    if (weapons.main?.twoHanded) mods.physicalDamage *= 1 + (mods.flags.twoHandedDamage ?? 0);
    mods.flags.weaponmasterDone = 1;
  }
}

/* ------------------------------------------------------------------- shared */

const base = {
  resource: 'rage' as const,
  buffRole: 'melee' as const,
  spells: WARRIOR_ABILITIES,
  talentHooks: WARRIOR_TALENT_HOOKS,
  referenceStat: 'attackPower' as const,

  weightStats: [
    { stat: 'attackPower' as const, step: 100 },
    { stat: 'strength' as const, step: 50 },
    { stat: 'agility' as const, step: 50 },
    { stat: 'crit' as const, step: 2 },
    { stat: 'hit' as const, step: 2 },
    { stat: 'haste' as const, step: 5 },
    { stat: 'stamina' as const, step: 50 },
  ],

  // Weapon DPS is deliberately not weighed. The simulator swings the weapon
  // itself rather than reading that number, so nudging it would move nothing
  // and the table would report a real stat as worthless.
  extraNames: { [DEEP_WOUNDS_ID]: 'Deep Wounds' },

  configure: (config: SimConfig, mods: SpellMods): void => {
    mods.flags.incomingDps = config.fight.incoming?.damagePerSecond ?? 0;
  },

  init: armWarrior,

  /** Flurry is the only thing that moves a warrior's swing timer. */
  hasteFor: (actor: Actor, now: number, mods: SpellMods): number => {
    const sheet = 1 + (actor.stats.haste ?? 0) / 100;
    const rank = mods.flags[WARRIOR_FLAGS.flurryRank] ?? 0;
    if (rank > 0 && actor.auras.has(WARRIOR_AURAS.flurry, now)) {
      return sheet * (1 + FLURRY.perRank * rank);
    }
    return sheet;
  },

  /** Recklessness makes everything a critical strike; Overpower nearly does. */
  critBonusFor: ({ spellId, actor, now, mods }: {
    spellId: string; actor: Actor; now: number; mods: SpellMods;
  }): number => {
    let bonus = 0;
    if (actor.auras.has(WARRIOR_AURAS.recklessness, now)) bonus += 100;
    if (spellId === 'overpower') bonus += mods.flags[WARRIOR_FLAGS.improvedOverpowerCrit] ?? 0;
    return bonus;
  },

  /** Death Wish and Enrage both raise physical damage while they are up. */
  damageBonusFor: ({ actor, now, mods }: {
    actor: Actor; now: number; mods: SpellMods;
  }): number => {
    let factor = 1;
    if (actor.auras.has(WARRIOR_AURAS.deathWish, now)) factor *= 1 + DEATH_WISH.damage;
    const enrageRank = mods.flags.enrageRank ?? 0;
    if (enrageRank > 0 && actor.auras.has(WARRIOR_AURAS.enrage, now)) {
      factor *= 1 + ENRAGE.perRank * enrageRank;
    }
    return factor;
  },

  onCastStart: ({ spellId, actor, now, mods }: {
    spellId: string; actor: Actor; now: number; mods: SpellMods;
  }): void => {
    if (spellId === 'death-wish') {
      actor.auras.apply(WARRIOR_AURAS.deathWish, now, { duration: DEATH_WISH.duration });
    }
    if (spellId === 'recklessness') {
      actor.auras.apply(WARRIOR_AURAS.recklessness, now, { duration: RECKLESSNESS.duration });
    }
    if (spellId === 'bloodrage') {
      // The ten over ten seconds is handed over at the press rather than
      // trickled, which the notes say out loud.
      actor.gain('rage', BLOODRAGE.overTime);
    }
    if (spellId === 'berserker-rage') {
      actor.gain('rage', mods.flags.berserkerRageRage ?? 0);
    }
  },

  /**
   * Every swing, both hands, whatever happened to it. Flurry is put up by a
   * critical strike and spent by the next swing, which is why the order here
   * matters: spend first, then put a fresh one up, or a crit would eat its own
   * charge.
   */
  onSwing: (event: {
    outcome: string; amount: number; hand: Hand; white: boolean; weapon: WeaponStats;
    actor: Actor; now: number; rng: { chance(p: number): boolean }; mods: SpellMods;
    bleed(id: string, total: number, ticks: number, interval: number): void;
    extraAttack(bonusAttackPower?: number, id?: string): void;
  }): void => {
    const { actor, now, mods, rng, outcome } = event;
    const flurryRank = mods.flags[WARRIOR_FLAGS.flurryRank] ?? 0;

    if (flurryRank > 0 && actor.auras.has(WARRIOR_AURAS.flurry, now)) {
      actor.auras.consume(WARRIOR_AURAS.flurry, now);
    }

    const connected = outcome !== 'miss' && outcome !== 'dodge' && outcome !== 'parry';

    if (outcome === 'crit') {
      if (flurryRank > 0) {
        actor.auras.apply(WARRIOR_AURAS.flurry, now, {
          duration: FLURRY.duration,
          stacks: FLURRY.swings,
          maxStacks: FLURRY.swings,
        });
      }

      // Deep Wounds bleeds a share of what the weapon averages, not of the hit
      // that caused it, which is why it reads the weapon rather than the amount.
      const share = mods.flags[WARRIOR_FLAGS.deepWoundsShare] ?? 0;
      if (share > 0) {
        const average = (event.weapon.min + event.weapon.max) / 2;
        event.bleed(DEEP_WOUNDS_ID, average * share, DEEP_WOUNDS.ticks, DEEP_WOUNDS.interval);
      }
    }

    // Weaponmaster with a sword: a chance on any landing to swing again. The
    // extra swing cannot set off another, which the engine enforces.
    const sword = mods.flags[WARRIOR_FLAGS.swordSpecChance] ?? 0;
    if (connected && sword > 0 && rng.chance(sword)) event.extraAttack();

    if (connected) {
      const chance = mods.flags[WARRIOR_FLAGS.unbridledChance] ?? 0;
      if (chance > 0 && rng.chance(Math.min(1, chance))) {
        actor.gain('rage', event.weapon.twoHanded ? 2 : 1);
      }
    }
  },

  /** Raging Blows sends Whirlwind through the off hand as well. */
  extraHandsFor: (spellId: string, mods: SpellMods): Hand[] =>
    (spellId === 'whirlwind' && whirlwindHitsOffhand(mods) ? ['off'] : []),

  /**
   * The heartbeat: rage from Anger Management, and Enrage from being hit.
   *
   * Enrage fires off damage arriving rather than damage dealt, so it does
   * nothing at all to somebody standing behind a boss that never turns round.
   * That is not a gap in the model, it is what the talent does.
   */
  onResourceTick: ({ actor, now, rng, mods }: {
    actor: Actor; now: number; rng: { chance(p: number): boolean }; mods: SpellMods;
  }): void => {
    const enrageRank = mods.flags.enrageRank ?? 0;
    if (enrageRank > 0 && (mods.flags.incomingDps ?? 0) > 0 && rng.chance(ENRAGE.chance)) {
      actor.auras.apply(WARRIOR_AURAS.enrage, now, { duration: ENRAGE.duration });
    }

    const perSecond = mods.flags[WARRIOR_FLAGS.angerManagement] ?? 0;
    if (perSecond > 0) actor.gain('rage', perSecond * K.RESOURCE_TICK.value);
  },

  forever: {
    status: 'unverified' as const,
    note:
      'Forever moved the warrior trees, so the talents here are read from its own text rather ' +
      'than from Classic. The abilities the trees say nothing about are still Classic values.',
  },

  unmodelledTalents: {
    Deflection: 'a parry chance, which does nothing to a warrior standing behind a boss.',
    'Improved Rend': 'no rotation here keeps Rend up, so nothing reads it.',
    Bloodthrill: 'it needs Rend on the target and an Overpower to activate, neither of which is modelled.',
    'Sweeping Strikes': 'it hits one extra target, and extra targets are a first pass here.',
    'Blood Craze': 'it restores health, which nothing here tracks.',
    'Improved Tactical Mastery': 'it keeps rage through a stance change, and nothing changes stance.',
    'Improved Charge': 'the pull is not modelled, so charge rage never arrives.',
    'Booming Voice': 'it lengthens a shout you refresh anyway.',
    'Iron Will': 'it resists stuns, which no fight here applies.',
    'Improved Hamstring': 'Hamstring is not in any rotation.',
    'Improved Intercept': 'Intercept is not in any rotation.',
    'Piercing Howl': 'it slows things down and deals no damage.',
    'Spearing Strike':
      'it deals forty per cent weapon damage and no rotation is better for pressing it.',
  },

  notes: [
    'Battle Shout is a checkbox in the fight settings rather than something the rotation casts, ' +
      'because its attack power cannot yet change part-way through a fight. The rage it costs ' +
      'to keep up is not counted either.',
    'Rage from damage is the Classic conversion value. Nothing about it has been confirmed for ' +
      'Forever, and it moves the answer more than any other number here.',
    'The simulated warrior never hesitates between globals and never misses a swing to movement, ' +
      'which is worth a few per cent more than anyone actually manages.',
  ],
};

/** Both trees, with only the difference between them left to declare. */
export function warriorSpec(over: Partial<SpecModule> & Pick<SpecModule, 'specId' | 'label' | 'rotations'>): SpecModule {
  return { ...base, ...over } as SpecModule;
}
