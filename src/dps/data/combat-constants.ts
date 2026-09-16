/**
 * The numbers behind the combat tables.
 *
 * All of this is the Classic level-sixty model. Forever has confirmed none of
 * it, so every entry carries a status and the results panel says so out loud.
 * When the beta contradicts something, this is the file to edit: the tables in
 * sim/tables.ts only do arithmetic.
 */

import type { ForeverStatus } from '../../raid/types';

export interface Sourced<T> {
  value: T;
  forever: { status: ForeverStatus; note?: string };
}

const classic = <T>(value: T, note?: string): Sourced<T> => ({
  value,
  forever: note ? { status: 'unverified', note } : { status: 'unverified' },
});

/* ------------------------------------------------------------------- spells */

/**
 * How much of a spell misses by level difference, before any hit on gear.
 * Four per cent against your own level, then a cliff at three levels up, which
 * is what a raid boss is.
 */
export const SPELL_BASE_MISS = classic<Record<number, number>>(
  { 0: 4, 1: 5, 2: 6, 3: 17 },
  'The seventeen per cent step at plus three levels is the Classic number.',
);

/** Spells can never be made to land every time. */
export const SPELL_HIT_CAP = classic(99);

/** A spell critical strike deals half as much again. */
export const SPELL_CRIT_MULTIPLIER = classic(1.5);

/**
 * Classic applied no level-based penalty to spell critical strike chance.
 * Later expansions did, so this is a knob rather than a constant.
 */
export const SPELL_CRIT_SUPPRESSION_PER_LEVEL = classic(0);

/* -------------------------------------------------------------------- melee */

/** Everyone starts from a five per cent chance to miss an even-level target. */
export const MELEE_BASE_MISS = classic(5);

/**
 * Missing scales gently with the first ten points of skill you are short, then
 * sharply after that. Being fifteen short, which is an untrained weapon against
 * a boss, is the nine per cent every melee player knows.
 */
export const MELEE_MISS_PER_SKILL_UNDER_10 = classic(0.1);
export const MELEE_MISS_OVER_10_BASE = classic(6);
export const MELEE_MISS_PER_SKILL_OVER_10 = classic(0.2);

/** The off hand misses far more often, and only on swings you did not aim. */
export const DUAL_WIELD_MISS_PENALTY = classic(19);

export const MELEE_BASE_DODGE = classic(5);
export const MELEE_DODGE_PER_SKILL = classic(0.1);

/** Bosses parry a great deal from the front and nothing at all from behind. */
export const MELEE_BOSS_PARRY = classic(14);

export const MELEE_BASE_BLOCK = classic(5);
export const MELEE_BLOCK_PER_SKILL = classic(0.1);

/** Glancing blows land only on swings you did not aim, at a higher-level target. */
export const GLANCING_BASE = classic(10);
export const GLANCING_PER_SKILL = classic(2);
export const GLANCING_CAP = classic(40);

/** The damage a glancing blow keeps, as a low and high end that is rolled between. */
export const GLANCING_LOW = classic({ base: 1.3, perSkill: 0.05, min: 0.01, max: 0.91 });
export const GLANCING_HIGH = classic({ base: 1.2, perSkill: 0.03, min: 0.2, max: 0.99 });

/** A melee critical strike deals twice as much. */
export const MELEE_CRIT_MULTIPLIER = classic(2);

/** A blocked hit loses a flat amount rather than a share. */
export const BLOCK_VALUE_DEFAULT = classic(0);

/**
 * Critical strikes are harder to land on something above your level: a fifth of
 * a per cent per level, and a further one and four fifths at three levels up.
 */
export const MELEE_CRIT_PER_LEVEL = classic(0.2);
export const MELEE_CRIT_SUPPRESSION_AT_3 = classic(1.8);

/* ---------------------------------------------------------- armor and resist */

/** Armor takes a share off physical damage, and the share shrinks with level. */
export const ARMOR_CONSTANT = classic({ flat: 400, perLevel: 85 });

/** Armor can never take more than three quarters of a hit. */
export const ARMOR_CAP = classic(0.75);

/** Resistance is capped at five points per level of the caster. */
export const RESIST_PER_LEVEL = classic(5);

/** At the cap, three quarters of the damage is resisted on average. */
export const RESIST_MAX_AVERAGE = classic(0.75);

/**
 * Whether a higher-level target resists a share of every spell on top of its
 * actual resistance is still argued about for Classic and unknown for Forever,
 * so the default is nothing and the fight settings can raise it.
 */
export const RESIST_PER_LEVEL_PENALTY = classic(0);

/* ------------------------------------------------------------------- timing */

/** The pause after anything you cast. */
export const GLOBAL_COOLDOWN = classic(1.5);

/** A cast can never be pushed below this, however much it is shortened. */
export const MIN_CAST_TIME = classic(1);

/** What the site assumes about the player, since a simulator has no hands. */
export const DEFAULT_REACTION = classic(0, 'No delay between casts is assumed, which flatters a real player.');

/* ------------------------------------------------------------------ targets */

/** A raid boss: three levels up, and it never turns its back on you. */
export const BOSS_LEVEL = classic(63);
export const BOSS_DEFENSE_PER_LEVEL = classic(5);

/** Everything on this page that has not been confirmed for Forever. */
export const BASELINE_NOTE =
  'Classic level sixty numbers, unverified for Forever. Treat the result as an estimate.';

/* --------------------------------------------------------------------- rage */

/**
 * The divisor that turns damage into rage at level sixty.
 *
 * Classic's formula is a curve fitted to the level: damage over this number,
 * scaled by how slow the weapon is, and doubled on a critical strike. It has
 * never been confirmed for Forever and Forever has already moved the rage
 * talents around it, so it is the likeliest number on this page to be wrong.
 */
export const RAGE_CONVERSION = classic(230.6, 'The Classic level-sixty rage conversion value.');

/** A swing is worth more rage than a strike you aimed, which is worth none. */
export const RAGE_HIT_FACTOR_MAIN = classic(3.5);
export const RAGE_HIT_FACTOR_OFF = classic(1.75);

/** A critical strike earns twice the rage the same damage otherwise would. */
export const RAGE_CRIT_MULTIPLIER = classic(2);

/** The rage bar, before any talent widens it. */
export const RAGE_MAX = classic(100);

/** Rage from damage taken, which only matters when the fight sends any back. */
export const RAGE_FROM_DAMAGE_TAKEN = classic(
  2.5,
  'Rage from damage taken is the Classic factor. It does nothing unless the fight ' +
    'settings say damage is arriving.',
);

/* ------------------------------------------------------------------- energy */

/**
 * Rage, energy and anything else that trickles back share one heartbeat: the
 * same two seconds the mana tick has always run on. Energy arrives in a lump on
 * it rather than smoothly, which is what makes a rogue's rotation what it is.
 */
export const RESOURCE_TICK = classic(2);
export const ENERGY_PER_TICK = classic(20);
export const ENERGY_MAX = classic(100);
export const COMBO_POINT_MAX = classic(5);

/* -------------------------------------------------------------------- swings */

/**
 * The speed attack power is measured against when an ability is normalised, so
 * that putting a slower weapon on does not hand a strike free damage.
 */
export const NORMALISED_SPEED = classic({
  dagger: 1.7,
  oneHand: 2.4,
  twoHand: 3.3,
  ranged: 2.8,
});

/** Attack power buys damage at this rate: fourteen points for one per second. */
export const AP_PER_DPS = classic(14);

/* -------------------------------------------------------------- item effects */

/**
 * How long a trinket you press waits before it can be pressed again.
 *
 * A tooltip does not say, so this is assumed rather than read, and the results
 * panel names any item it was assumed for. Most Classic trinkets are between
 * ninety seconds and three minutes; three is the cautious end.
 */
export const TRINKET_COOLDOWN = classic(
  180,
  'A trinket tooltip does not give its cooldown, so three minutes is assumed.',
);

/**
 * How often a proc with a rate rather than a chance fires: that rate a minute,
 * scaled by how slow the weapon is, which is what keeps a slow weapon from
 * procing less than a fast one over the same fight.
 */
export const PROC_PPM_DEFAULT = classic(1);
