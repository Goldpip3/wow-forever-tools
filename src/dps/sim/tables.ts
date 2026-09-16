/**
 * The combat tables: who misses, who dodges, who crits, and how much armor and
 * resistance take off the top.
 *
 * Arithmetic only. Every number it works from lives in data/combat-constants.ts
 * so the beta can move one without touching this file.
 */

import * as K from '../data/combat-constants';
import type { Rng } from './rng';
import type { Outcome } from './types';

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/* ------------------------------------------------------------------- spells */

/** How often a spell lands, as a percentage, before the cap is applied. */
export function spellHitChance(attackerLevel: number, targetLevel: number, hitBonus = 0): number {
  const diff = Math.max(0, Math.round(targetLevel - attackerLevel));
  const table = K.SPELL_BASE_MISS.value;
  const baseMiss = table[Math.min(diff, 3)] ?? table[3]!;
  return clamp(100 - baseMiss + hitBonus, 0, K.SPELL_HIT_CAP.value);
}

/** Spell crit chance after any level penalty. */
export function spellCritChance(critPct: number, attackerLevel: number, targetLevel: number): number {
  const diff = Math.max(0, targetLevel - attackerLevel);
  return Math.max(0, critPct - diff * K.SPELL_CRIT_SUPPRESSION_PER_LEVEL.value);
}

/**
 * One roll decides whether a spell lands, and a second decides whether it crits.
 * Unlike melee, a spell has no third option.
 */
export function rollSpell(hitPct: number, critPct: number, rng: Rng): Outcome {
  if (!rng.chance(hitPct / 100)) return 'miss';
  return rng.chance(Math.max(0, critPct) / 100) ? 'crit' : 'hit';
}

/* -------------------------------------------------------------------- melee */

export interface AttackParams {
  /** Skill with the weapon being swung. */
  skill: number;
  /** The target's defence, which is five per level for anything unplayered. */
  defense: number;
  hitPct: number;
  critPct: number;
  attackerLevel: number;
  targetLevel: number;
  /** A swing from the off hand while holding two weapons misses far more. */
  dualWield?: boolean;
  behind?: boolean;
  canParry?: boolean;
  canBlock?: boolean;
  /** A shot from a bow, gun or crossbow, which cannot be dodged, parried or glance. */
  ranged?: boolean;
}

/**
 * The table a swing rolls against, in percentage points. A white swing walks it
 * from the top and stops at the first band it lands in, so a high chance to be
 * avoided pushes crits off the bottom. An aimed attack skips the glancing band.
 */
export interface AttackTable {
  miss: number;
  dodge: number;
  parry: number;
  glance: number;
  block: number;
  crit: number;
  hit: number;
}

export function missChance(skill: number, defense: number, hitPct = 0, dualWield = false): number {
  const diff = defense - skill;
  const base =
    diff > 10
      ? K.MELEE_MISS_OVER_10_BASE.value + diff * K.MELEE_MISS_PER_SKILL_OVER_10.value
      : K.MELEE_BASE_MISS.value + diff * K.MELEE_MISS_PER_SKILL_UNDER_10.value;
  const withDualWield = base + (dualWield ? K.DUAL_WIELD_MISS_PENALTY.value : 0);
  return Math.max(0, withDualWield - hitPct);
}

export function dodgeChance(skill: number, defense: number): number {
  return Math.max(0, K.MELEE_BASE_DODGE.value + (defense - skill) * K.MELEE_DODGE_PER_SKILL.value);
}

export function glancingChance(skill: number, defense: number): number {
  if (defense <= skill) return 0;
  return clamp(
    K.GLANCING_BASE.value + (defense - skill) * K.GLANCING_PER_SKILL.value,
    0,
    K.GLANCING_CAP.value,
  );
}

/** Melee crit after the penalty for swinging above your level. */
export function meleeCritChance(critPct: number, attackerLevel: number, targetLevel: number): number {
  const diff = Math.max(0, targetLevel - attackerLevel);
  const suppression =
    diff * K.MELEE_CRIT_PER_LEVEL.value + (diff >= 3 ? K.MELEE_CRIT_SUPPRESSION_AT_3.value : 0);
  return Math.max(0, critPct - suppression);
}

/** Builds the table for one swing. `yellow` is an aimed attack: no glancing. */
export function meleeAttackTable(params: AttackParams, yellow = false): AttackTable {
  const { skill, defense } = params;

  const miss = missChance(skill, defense, params.hitPct, !yellow && params.dualWield);
  const dodge = params.ranged ? 0 : dodgeChance(skill, defense);
  const parry = params.ranged || params.behind || params.canParry === false ? 0 : K.MELEE_BOSS_PARRY.value;
  const glance = yellow || params.ranged ? 0 : glancingChance(skill, defense);
  const block =
    params.behind || !params.canBlock
      ? 0
      : Math.max(0, K.MELEE_BASE_BLOCK.value + (defense - skill) * K.MELEE_BLOCK_PER_SKILL.value);

  const crit = meleeCritChance(params.critPct, params.attackerLevel, params.targetLevel);

  // The bands are laid down in order; whatever room is left is a clean hit.
  const used = miss + dodge + parry + glance + block;
  const critRoom = Math.max(0, Math.min(crit, 100 - used));
  const hit = Math.max(0, 100 - used - critRoom);

  return { miss, dodge, parry, glance, block, crit: critRoom, hit };
}

/** A swing you did not aim: one roll down the whole table. */
export function resolveWhite(table: AttackTable, rng: Rng): Outcome {
  const roll = rng.next() * 100;
  let edge = table.miss;
  if (roll < edge) return 'miss';
  edge += table.dodge;
  if (roll < edge) return 'dodge';
  edge += table.parry;
  if (roll < edge) return 'parry';
  edge += table.glance;
  if (roll < edge) return 'glance';
  edge += table.block;
  if (roll < edge) return 'block';
  edge += table.crit;
  if (roll < edge) return 'crit';
  return 'hit';
}

/**
 * An aimed attack rolls twice: once to see whether it is avoided, and if it got
 * through, once more for a critical strike. That is why a yellow hit can crit
 * at its full rate where a white one cannot.
 */
export function resolveYellow(table: AttackTable, rng: Rng): Outcome {
  const roll = rng.next() * 100;
  let edge = table.miss;
  if (roll < edge) return 'miss';
  edge += table.dodge;
  if (roll < edge) return 'dodge';
  edge += table.parry;
  if (roll < edge) return 'parry';
  edge += table.block;
  if (roll < edge) return 'block';
  return rng.chance(table.crit / 100) ? 'crit' : 'hit';
}

/** What a glancing blow keeps of its damage. */
export function glancingMultiplier(skill: number, defense: number, rng: Rng): number {
  const diff = Math.max(0, defense - skill);
  const low = K.GLANCING_LOW.value;
  const high = K.GLANCING_HIGH.value;
  const lo = clamp(low.base - diff * low.perSkill, low.min, low.max);
  const hi = clamp(high.base - diff * high.perSkill, high.min, high.max);
  return rng.between(Math.min(lo, hi), Math.max(lo, hi));
}

/* -------------------------------------------------------- armor and resist */

/** The share of a physical hit that armor keeps out. */
export function armorReduction(armor: number, attackerLevel: number): number {
  if (armor <= 0) return 0;
  const { flat, perLevel } = K.ARMOR_CONSTANT.value;
  const denominator = armor + flat + perLevel * attackerLevel;
  return clamp(armor / denominator, 0, K.ARMOR_CAP.value);
}

export function armorMultiplier(armor: number, attackerLevel: number): number {
  return 1 - armorReduction(armor, attackerLevel);
}

/** The average share of a spell that resistance keeps out. */
export function averageResist(resistance: number, attackerLevel: number, targetLevel: number): number {
  const cap = K.RESIST_PER_LEVEL.value * attackerLevel;
  const capped = clamp(resistance, 0, cap);
  const fromResistance = cap > 0 ? K.RESIST_MAX_AVERAGE.value * (capped / cap) : 0;
  const fromLevel =
    Math.max(0, targetLevel - attackerLevel) * K.RESIST_PER_LEVEL_PENALTY.value;
  return clamp(fromResistance + fromLevel, 0, K.RESIST_MAX_AVERAGE.value);
}

export function resistMultiplier(resistance: number, attackerLevel: number, targetLevel: number): number {
  return 1 - averageResist(resistance, attackerLevel, targetLevel);
}

/** Defence for anything that is not a player: five per level. */
export function defenseFor(level: number): number {
  return level * K.BOSS_DEFENSE_PER_LEVEL.value;
}
