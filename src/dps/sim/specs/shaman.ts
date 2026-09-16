/**
 * What Enhancement and Elemental have in common, which is less than the two
 * warrior trees shared.
 *
 * Both cast the same spells out of the same mana bar and read the same talents,
 * so those live here. What differs is whether a weapon swings at all: an
 * Elemental shaman is a caster holding a mace it never uses, and Enhancement is
 * a melee spec that happens to press Earth Shock.
 */

import { spiritRegenPer2s } from '../../data/conversions';
import {
  CLEARCASTING,
  ELEMENTAL_DEVASTATION,
  FLAME_SHOCK,
  RAGE_OF_THE_FARSEER,
  SHAMAN_ABILITIES,
  SHAMAN_TALENT_HOOKS,
  SHOCKS,
  STORMSTRIKE,
  WINDFURY_WEAPON,
  shockCooldown,
  windfuryAttackPower,
} from '../../data/shaman';
import type { Actor } from '../actor';
import type { SpecModule } from '../spec';
import type { SpellMods } from '../spells';

export const SHAMAN_AURAS = {
  flurry: 'flurry',
  farseer: 'rage-of-the-farseer',
  stormstrike: 'stormstrike',
  flameShock: 'flame-shock',
  clearcasting: 'clearcasting',
  devastation: 'elemental-devastation',
};

/** Spells that count as damage for Clearcasting and Elemental Focus. */
const DAMAGE_SPELLS = new Set(['lightning-bolt', 'chain-lightning', 'earth-shock', 'flame-shock', 'lava-burst']);
const LIGHTNING = new Set(['lightning-bolt', 'chain-lightning']);
const MELEE = new Set(['auto-main', 'auto-off', 'extra-attack', 'windfury', 'stormstrike']);

/** Talents both trees know about by name and model nothing of, with the reason. */
export const SHAMAN_UNMODELLED: Record<string, string> = {
  'Ancestral Knowledge':
    'the intellect it adds is already on your sheet, but new intellect from a gear change is not scaled by it.',
  Toughness: 'stamina does nothing to damage.',
  'Mental Dexterity':
    'the attack power it gives is already on your sheet, but new intellect from a gear change is not turned into more of it.',
  'Mental Quickness':
    'the spell damage it gives is already on your sheet, but new intellect from a gear change is not turned into more of it.',
  'Maelstrom Weapon': 'the tree says "a chance" without saying what the chance is.',
  'Improved Stormstrike': 'it resets on a dodge or a parry, and nothing here dodges or parries.',
  "Earth's Grasp": 'it strengthens totems that deal no damage.',
  'Guardian Totems': 'it strengthens totems that deal no damage.',
  'Improved Ghost Wolf': 'Ghost Wolf is not in any rotation.',
  'Improved Lightning Shield': 'Lightning Shield only hurts what hits you, and nothing does.',
  Anticipation: 'a dodge chance, which does nothing to damage.',
  'Spirit Weapons': 'it moves threat and parry, neither of which is damage.',
  'Elemental Warding': 'it reduces damage taken, which nothing here deals.',
  'Improved Fire Nova': 'Fire Nova is not in any rotation.',
  'Eye of the Storm': 'it reduces pushback, and nothing here interrupts a cast.',
  'Elemental Reach': 'range does nothing standing still.',
  Earthbound: 'Earthbind Totem is not in any rotation.',
};

/**
 * Everything but the rotation, the specId and whether a weapon swings.
 */
export const shamanBase = {
  resource: 'mana' as const,
  spells: SHAMAN_ABILITIES,
  talentHooks: SHAMAN_TALENT_HOOKS,

  manaRegen: (stats: { spirit: number }) => ({
    per2s: spiritRegenPer2s('shaman', stats.spirit),
    castingFraction: 0,
  }),

  /** Clearcasting makes the next damage spell free. */
  costFor: ({ spellId, baseCost, actor, now }: {
    spellId: string; baseCost: number; actor: Actor; now: number;
  }): number =>
    (DAMAGE_SPELLS.has(spellId) && actor.auras.has(SHAMAN_AURAS.clearcasting, now) ? 0 : baseCost),

  /** Rage of the Farseer is the only thing that speeds a cast up. */
  castSpeedFor: (actor: Actor, now: number): number =>
    (actor.auras.has(SHAMAN_AURAS.farseer, now) ? 1 + RAGE_OF_THE_FARSEER.speed : 1),

  critBonusFor: ({ spellId, actor, now, mods }: {
    spellId: string; actor: Actor; now: number; mods: SpellMods;
  }): number => {
    let bonus = 0;
    if (LIGHTNING.has(spellId)) bonus += mods.flags.callOfThunder ?? 0;
    if (MELEE.has(spellId) && actor.auras.has(SHAMAN_AURAS.devastation, now)) {
      bonus += mods.flags.elementalDevastation ?? 0;
    }
    return bonus;
  },

  /**
   * Stormstrike makes the target take more Nature, and Flame Shock makes Lava
   * Burst hit harder. Both are on the target, so both are read at the moment
   * the damage lands.
   */
  damageBonusFor: ({ spellId, school, actor, now }: {
    spellId: string; school: string; actor: Actor; now: number;
  }): number => {
    let factor = 1;
    if (school === 'nature' && actor.targetAuras.has(SHAMAN_AURAS.stormstrike, now)) {
      factor *= 1 + STORMSTRIKE.natureTaken;
    }
    if (spellId === 'lava-burst' && actor.targetAuras.has(SHAMAN_AURAS.flameShock, now)) factor *= 1.2;
    return factor;
  },

  onCastStart: ({ spellId, actor, now, mods }: {
    spellId: string; actor: Actor; now: number; mods: SpellMods;
  }): void => {
    // The shocks share one cooldown, so pressing either holds both.
    if (SHOCKS.includes(spellId)) {
      for (const id of SHOCKS) actor.startCooldown(id, now, shockCooldown(mods));
    }
    if (spellId === 'flame-shock') {
      actor.targetAuras.apply(SHAMAN_AURAS.flameShock, now, { duration: FLAME_SHOCK.duration });
    }
    if (spellId === 'stormstrike') {
      actor.targetAuras.apply(SHAMAN_AURAS.stormstrike, now, { duration: STORMSTRIKE.duration });
    }
    if (spellId === 'rage-of-the-farseer') {
      actor.auras.apply(SHAMAN_AURAS.farseer, now, { duration: RAGE_OF_THE_FARSEER.duration });
    }
    // A free cast spends the Clearcasting that made it free.
    if (DAMAGE_SPELLS.has(spellId)) actor.auras.consume(SHAMAN_AURAS.clearcasting, now);
  },

  onLand: ({ spellId, outcome, actor, now, rng, mods, echo }: {
    spellId: string; outcome: string; actor: Actor; now: number;
    rng: { chance(p: number): boolean }; mods: SpellMods; echo?: (m: number) => void;
  }): void => {
    const focus = mods.flags.elementalFocus ?? 0;
    if (focus > 0 && DAMAGE_SPELLS.has(spellId) && rng.chance(focus)) {
      actor.auras.apply(SHAMAN_AURAS.clearcasting, now, { duration: CLEARCASTING.duration });
    }

    if (outcome === 'crit' && (mods.flags.elementalDevastation ?? 0) > 0) {
      actor.auras.apply(SHAMAN_AURAS.devastation, now, { duration: ELEMENTAL_DEVASTATION.duration });
    }

    const overload = mods.flags.lightningOverload ?? 0;
    if (echo && overload > 0 && LIGHTNING.has(spellId) && rng.chance(overload)) echo(0.5);
  },
};

/** Arms the hands, for the spec that swings. */
export function armShaman(actor: Actor, weapons: { main?: { speed: number }; off?: { speed: number } }, haste: number): void {
  if (weapons.main) actor.arm('main', weapons.main.speed, 0, haste);
  if (weapons.off) actor.arm('off', weapons.off.speed, 0, haste);
}

/** Flurry and Rage of the Farseer both speed the weapons up. */
export function shamanHaste(actor: Actor, now: number, mods: SpellMods): number {
  let factor = 1 + (actor.stats.haste ?? 0) / 100;
  const flurry = mods.flags.flurryRank ?? 0;
  if (flurry > 0 && actor.auras.has(SHAMAN_AURAS.flurry, now)) factor *= 1 + 0.05 * flurry;
  if (actor.auras.has(SHAMAN_AURAS.farseer, now)) factor *= 1 + RAGE_OF_THE_FARSEER.speed;
  return factor;
}

export { WINDFURY_WEAPON, windfuryAttackPower };
export type ShamanSpec = SpecModule;
