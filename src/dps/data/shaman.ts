/**
 * Shaman abilities and the talents that change them, for both damage trees.
 *
 * Forever's shaman is further from Classic than any class written so far.
 * Lightning Bolt and Chain Lightning are each half a second faster to cast.
 * Enhancement has Maelstrom Weapon, Mental Dexterity and Rage of the Farseer,
 * none of which Classic had, and Elemental ends in Lava Burst. Every hook below
 * is keyed by the name in public/data/talents.generated.json and cites the
 * description it was read from.
 *
 * Each spell is the highest rank a level sixty can learn, read from the beta
 * client's own tooltip at build 1.60.1.70009: damage, cost, cast time,
 * cooldown and share of spell power. Where a tooltip leaves something out, the
 * note says what stands in for it.
 */

import type { AbilityDef, SpellMods, TalentHook } from '../sim/spells';
import { addCastTime, addCritBonus, multiplyCost, multiplyDamage } from '../sim/spells';

/* ---------------------------------------------------------------- numbers */

export const WINDFURY_WEAPON = {
  /** A fifth of the swings that land. */
  chance: 0.2,
  /** Rank 4, learned at 60: "2 extra attacks with 333 extra melee attack power". */
  attackPower: 333,
  attacks: 2,
};

/**
 * "Increase the damage you deal to the target with your next Lightning Bolt,
 * Chain Lightning, or Earth Shock spell by 20% for 12 sec." The next one only,
 * and only the Shaman's own.
 */
export const STORMSTRIKE = { duration: 12, bonus: 0.2, cooldown: 8 };
export const STORMSTRIKE_SPELLS = ['lightning-bolt', 'chain-lightning', 'earth-shock'];
/** "Increases your attack speed by 30% for 25 sec", 3 min cooldown. Casting is not sped up. */
export const RAGE_OF_THE_FARSEER = { duration: 25, speed: 0.3, cooldown: 180 };
export const SHOCK_COOLDOWN = 6;
export const FLAME_SHOCK = { duration: 12 };
export const ELEMENTAL_DEVASTATION = { duration: 10, perRank: 3 };
export const CLEARCASTING = { chance: 0.1, duration: 15 };

/** Elemental Weapons, read rank by rank: the tree gives all three. */
const WINDFURY_BONUS = [0, 0.13, 0.27, 0.4];

const changed = (note: string) => ({ status: 'changed' as const, note });

/* -------------------------------------------------------------- abilities */

export const LIGHTNING_BOLT: AbilityDef = {
  id: 'lightning-bolt',
  name: 'Lightning Bolt',
  icon: 'spell_nature_lightning',
  school: 'nature',
  kind: 'spell',
  castTime: 2.5,
  cost: 220,
  minDamage: 189,
  maxDamage: 211,
  coefficient: 0.714,
  forever: changed(
    'Rank 10, learned at 56, in the beta client at build 1.60.1.70009: 189 to 211 Nature damage, ' +
      '220 mana, two and a half seconds, 71.4% of spell power. Classic Rank 10 was 428 to 476 over ' +
      'three seconds at 85.7%.',
  ),
};

export const CHAIN_LIGHTNING: AbilityDef = {
  id: 'chain-lightning',
  name: 'Chain Lightning',
  icon: 'spell_nature_chainlightning',
  school: 'nature',
  kind: 'spell',
  castTime: 2,
  cost: 485,
  cooldown: 6,
  minDamage: 119,
  maxDamage: 133,
  coefficient: 0.571,
  aoe: { maxTargets: 3, falloff: 0.7 },
  forever: changed(
    'Rank 4, learned at 56, in the beta client at build 1.60.1.70009: 119 to 133 Nature damage, ' +
      '485 mana, two seconds, a six second cooldown, 57.1% of spell power, three targets with each ' +
      'jump thirty per cent weaker. Classic Rank 4 was 505 to 563.',
  ),
};

/** The three shocks share a cooldown, which the spec starts for all of them. */
export const EARTH_SHOCK: AbilityDef = {
  id: 'earth-shock',
  name: 'Earth Shock',
  icon: 'spell_nature_earthshock',
  school: 'nature',
  kind: 'spell',
  castTime: 0,
  cost: 450,
  minDamage: 293,
  maxDamage: 309,
  coefficient: 0.386,
  forever: changed(
    'Rank 7 in the beta client at build 1.60.1.70009: 293 to 309 Nature damage for 450 mana, ' +
      '38.6% of spell power. Classic Rank 7 was 517 to 545.',
  ),
};

export const FLAME_SHOCK_SPELL: AbilityDef = {
  id: 'flame-shock',
  name: 'Flame Shock',
  icon: 'spell_fire_flameshock',
  school: 'fire',
  kind: 'spell',
  castTime: 0,
  cost: 410,
  minDamage: 166,
  maxDamage: 166,
  coefficient: 0.214,
  // 10% of spell power a tick, four ticks.
  dot: { ticks: 4, interval: 3, damage: 176, coefficient: 0.4 },
  forever: changed(
    'Rank 6 in the beta client at build 1.60.1.70009: 166 Fire damage at once and 176 over 12 sec ' +
      'for 410 mana, with 21.4% of spell power on the hit and 10% on each tick. Classic Rank 6 was ' +
      '292 and 320.',
  ),
};

export const LAVA_BURST: AbilityDef = {
  id: 'lava-burst',
  name: 'Lava Burst',
  icon: 'spell_shaman_lavaburst',
  school: 'fire',
  kind: 'spell',
  castTime: 2.5,
  cost: 265,
  cooldown: 10,
  minDamage: 192,
  maxDamage: 248,
  coefficient: 0.714,
  forever: {
    status: 'new',
    note:
      'Rank 3, learned at 60, in the beta client at build 1.60.1.70009: 192 to 248 Fire damage, 265 ' +
      'mana, two and a half seconds, a ten second cooldown, 71.4% of spell power, and 20% more ' +
      'while your Flame Shock is on the target.',
  },
};

export const STORMSTRIKE_SPELL: AbilityDef = {
  id: 'stormstrike',
  name: 'Stormstrike',
  icon: 'spell_holy_sealofmight',
  school: 'physical',
  kind: 'melee',
  resource: 'mana',
  castTime: 0,
  cost: 125,
  cooldown: STORMSTRIKE.cooldown,
  minDamage: 0,
  maxDamage: 0,
  coefficient: 0,
  weapon: { hand: 'main', multiplier: 1, flat: 0, normalised: false },
  forever: changed(
    'At build 1.60.1.70009: normal weapon damage, and your next Lightning Bolt, Chain Lightning ' +
      'or Earth Shock on the target within 12 sec deals 20% more. 125 mana, eight second cooldown. ' +
      'Classic was an extra attack and the next two Nature hits from anyone, every 20 sec.',
  ),
};

export const RAGE_OF_THE_FARSEER_SPELL: AbilityDef = {
  id: 'rage-of-the-farseer',
  name: 'Rage of the Farseer',
  icon: 'spell_nature_bloodlust',
  school: 'nature',
  kind: 'item',
  resource: 'mana',
  castTime: 0,
  gcd: 0,
  cost: 0,
  cooldown: RAGE_OF_THE_FARSEER.cooldown,
  minDamage: 0,
  maxDamage: 0,
  coefficient: 0,
  forever: {
    status: 'new',
    note:
      'At build 1.60.1.70009: thirty per cent attack speed for 25 sec, three minute cooldown. ' +
      'Build 69876 also sped up casting; this build does not. The tooltip gives no mana cost, so none ' +
      'is charged.',
  },
};

export const SHAMAN_ABILITIES: AbilityDef[] = [
  LIGHTNING_BOLT,
  CHAIN_LIGHTNING,
  EARTH_SHOCK,
  FLAME_SHOCK_SPELL,
  LAVA_BURST,
  STORMSTRIKE_SPELL,
  RAGE_OF_THE_FARSEER_SPELL,
];

export const SHOCKS = [EARTH_SHOCK.id, FLAME_SHOCK_SPELL.id];
const LIGHTNING = [LIGHTNING_BOLT.id, CHAIN_LIGHTNING.id];

/* --------------------------------------------------------------- talents */

export const SHAMAN_TALENT_HOOKS: Record<string, TalentHook> = {
  /* ------------------------------------------------------------ Elemental */

  // 'Reduces the mana cost of your Shock, Lightning Bolt, Lava Burst, and
  // Chain Lightning spells by 2%.'
  Convection: (rank, mods) => {
    for (const id of [...SHOCKS, ...LIGHTNING, LAVA_BURST.id]) multiplyCost(mods, id, 1 - 0.02 * rank);
  },

  // 'Increases the damage done by your Lightning Bolt, Chain Lightning, and
  // Earth Shock spells by 1%.'
  Concussion: (rank, mods) => {
    for (const id of [...LIGHTNING, EARTH_SHOCK.id]) multiplyDamage(mods, id, 1 + 0.01 * rank);
  },

  // 'Reduces the cooldown of your Shock spells by 0.2 sec.' All five ranks given.
  Reverberation: (rank, mods) => {
    mods.flags.shockCooldownOff = 0.2 * rank;
  },

  // 'Increases the damage done by ... your Flame Shock, Fire Nova, and Lava
  // Burst spells by 5%.'
  'Call of Flame': (rank, mods) => {
    for (const id of [FLAME_SHOCK_SPELL.id, LAVA_BURST.id]) multiplyDamage(mods, id, 1 + 0.05 * rank);
  },

  // 'Your offensive spell critical strikes will increase your chance to get a
  // critical strike with melee attacks by 3% for 10 sec.'
  'Elemental Devastation': (rank, mods) => {
    mods.flags.elementalDevastation = ELEMENTAL_DEVASTATION.perRank * rank;
  },

  // 'Gives you a 10% chance to enter a Clearcasting state after casting any
  // Fire, Frost, or Nature damage spell.'
  'Elemental Focus': (_rank, mods) => {
    mods.flags.elementalFocus = CLEARCASTING.chance;
  },

  // 'Increases the critical strike damage bonus of ... your Fire, Frost, and
  // Nature spells by 20%.' The bonus is the half again, so a fifth of it a rank.
  'Elemental Fury': (rank, mods) => {
    for (const school of ['fire', 'frost', 'nature'] as const) addCritBonus(mods, school, 0.5 * 0.2 * rank);
  },

  // 'Increases the critical strike chance of your Lightning Bolt and Chain
  // Lightning spells by 3%.'
  'Call of Thunder': (_rank, mods) => {
    mods.flags.callOfThunder = 3;
  },

  // 'Gives your Lightning Bolt and Chain Lightning spells a 3% chance to cast a
  // second, similar spell ... that causes half damage.'
  'Lightning Overload': (rank, mods) => {
    mods.flags.lightningOverload = 0.03 * rank;
  },

  // 'Reduces the cast time of your Lightning Bolt, Chain Lightning, and Lava
  // Burst spells by 0.17 sec.'
  'Elemental Alacrity': (rank, mods) => {
    for (const id of [...LIGHTNING, LAVA_BURST.id]) addCastTime(mods, id, -0.17 * rank);
  },

  /* ---------------------------------------------------------- Enhancement */

  // 'Improves your chance to get a critical strike with all spells and attacks
  // by 1%.'
  'Thundering Strikes': (rank, mods) => {
    mods.meleeCrit += rank;
    for (const school of ['fire', 'frost', 'nature'] as const) {
      mods.spellCrit[school] = (mods.spellCrit[school] ?? 0) + rank;
    }
  },

  // 'Increases ... your Windfury Weapon effect by 13%' at the first rank, 27%
  // at the second and 40% at the third.
  'Elemental Weapons': (rank, mods) => {
    mods.flags.windfuryBonus = WINDFURY_BONUS[Math.min(3, rank)] ?? 0;
  },

  // 'Reduces the mana cost of your Shock and Lightning Shield spells by 45%.'
  'Shamanistic Focus': (_rank, mods) => {
    for (const id of SHOCKS) multiplyCost(mods, id, 0.55);
  },

  // 'Increases your attack speed by 5% for your next 3 swings after dealing a
  // melee critical strike.'
  Flurry: (rank, mods) => {
    mods.flags.flurryRank = rank;
  },
};

/** What the Windfury Weapon extra attack carries, after Elemental Weapons. */
export function windfuryAttackPower(mods: SpellMods): number {
  return WINDFURY_WEAPON.attackPower * (1 + (mods.flags.windfuryBonus ?? 0));
}

/** The shared shock cooldown, after Reverberation. */
export function shockCooldown(mods: SpellMods): number {
  return Math.max(0, SHOCK_COOLDOWN - (mods.flags.shockCooldownOff ?? 0));
}
