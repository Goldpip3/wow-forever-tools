/**
 * Shaman abilities and the talents that change them, for both damage trees.
 *
 * Forever's shaman is further from Classic than any class written so far.
 * Lightning Bolt and Chain Lightning are each half a second faster to cast.
 * Enhancement has Maelstrom Weapon, Mental Dexterity and Rage of the Farseer,
 * none of which Classic had, and Elemental ends in Lava Burst. Every hook below
 * is keyed by the name in public/data/talents.generated.json and cites the
 * description it was read from; the cast times come from the class notes in
 * the same file.
 *
 * What the data does not say is said out loud rather than filled in quietly.
 * Lava Burst's damage is the talent's own text; its cast time and cooldown are
 * not given anywhere, so they are guesses and the note says so.
 */

import type { AbilityDef, SpellMods, TalentHook } from '../sim/spells';
import { addCastTime, addCritBonus, multiplyCost, multiplyDamage } from '../sim/spells';

/* ---------------------------------------------------------------- numbers */

export const WINDFURY_WEAPON = {
  /** A fifth of the swings that land. */
  chance: 0.2,
  /** Rank 4 at the Classic value. */
  attackPower: 315,
};

export const STORMSTRIKE = { duration: 12, natureTaken: 0.2, cooldown: 20 };
export const RAGE_OF_THE_FARSEER = { duration: 25, speed: 0.3, cooldown: 180 };
export const SHOCK_COOLDOWN = 6;
export const FLAME_SHOCK = { duration: 12 };
export const ELEMENTAL_DEVASTATION = { duration: 10, perRank: 3 };
export const CLEARCASTING = { chance: 0.1, duration: 15 };

/** Elemental Weapons, read rank by rank: the tree gives all three. */
const WINDFURY_BONUS = [0, 0.13, 0.27, 0.4];

const changed = (note: string) => ({ status: 'changed' as const, note });
const classic = (note?: string) =>
  (note ? { status: 'unverified' as const, note } : { status: 'unverified' as const });

/* -------------------------------------------------------------- abilities */

export const LIGHTNING_BOLT: AbilityDef = {
  id: 'lightning-bolt',
  name: 'Lightning Bolt',
  icon: 'spell_nature_lightning',
  school: 'nature',
  kind: 'spell',
  castTime: 2.5,
  cost: 265,
  minDamage: 428,
  maxDamage: 477,
  coefficient: 0.857,
  forever: changed(
    'Half a second faster than Classic, which the class notes read off the demo. The damage ' +
      'and the share of spell power are Classic Rank 10; whether the share moved with the cast ' +
      'time is not known.',
  ),
};

export const CHAIN_LIGHTNING: AbilityDef = {
  id: 'chain-lightning',
  name: 'Chain Lightning',
  icon: 'spell_nature_chainlightning',
  school: 'nature',
  kind: 'spell',
  castTime: 2,
  cost: 490,
  cooldown: 6,
  minDamage: 505,
  maxDamage: 564,
  coefficient: 0.714,
  aoe: { maxTargets: 3, falloff: 0.7 },
  forever: changed(
    'Two seconds and a six second cooldown, three targets, each jump thirty per cent weaker, ' +
      'which is what the class notes say. The damage is Classic Rank 4.',
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
  cost: 345,
  minDamage: 517,
  maxDamage: 545,
  coefficient: 0.386,
  forever: classic('Rank 7 at the Classic values.'),
};

export const FLAME_SHOCK_SPELL: AbilityDef = {
  id: 'flame-shock',
  name: 'Flame Shock',
  icon: 'spell_fire_flameshock',
  school: 'fire',
  kind: 'spell',
  castTime: 0,
  cost: 410,
  minDamage: 292,
  maxDamage: 292,
  coefficient: 0.214,
  dot: { ticks: 4, interval: 3, damage: 320, coefficient: 0.5 },
  forever: classic('Rank 6 at the Classic values: a hit and then twelve seconds of burning.'),
};

/**
 * Lava Burst is new, and the tree only shows its first rank's damage. Nothing
 * anywhere gives its cast time or its cooldown, so both are assumptions.
 */
export const LAVA_BURST: AbilityDef = {
  id: 'lava-burst',
  name: 'Lava Burst',
  icon: 'spell_shaman_lavaburst',
  school: 'fire',
  kind: 'spell',
  castTime: 2,
  cost: 300,
  cooldown: 8,
  minDamage: 158,
  maxDamage: 187,
  coefficient: 0.571,
  forever: {
    status: 'new',
    note:
      'New in Forever. 158 to 187 is what the tree shows, which is its first rank. The two ' +
      'second cast, eight second cooldown and mana cost are assumed; nothing says what they are.',
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
  cost: 260,
  cooldown: STORMSTRIKE.cooldown,
  minDamage: 0,
  maxDamage: 0,
  coefficient: 0,
  weapon: { hand: 'main', multiplier: 1, flat: 0, normalised: false },
  forever: changed(
    'Normal weapon damage and a fifth more Nature damage on the target for twelve seconds, ' +
      'which is what the Enhancement tree says. The cooldown and cost are Classic.',
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
      'New in Forever: thirty per cent faster swings and casts for twenty-five seconds, from the ' +
      'tree. The tree does not give a cooldown, so three minutes is assumed.',
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
