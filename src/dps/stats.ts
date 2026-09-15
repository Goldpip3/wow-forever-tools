/**
 * From a character to the numbers the simulator reads.
 *
 * The idea the whole tool rests on: the game already told us what this
 * character's stats are, so there is no need to rebuild them from race and
 * class tables that Forever has not published. Take the sheet as the truth,
 * subtract what the equipped gear contributes, and what is left is the
 * baseline. Swap an item and only the difference moves.
 *
 * That makes the conversions honest too. Ten intellect on a new ring becomes
 * crit and mana through the class ratios; the intellect already on the sheet
 * does not get converted twice.
 */

import { CLASSES, type ClassId } from '../shared/classes';
import type { CharacterExport, ItemRef, School, Slot, StatBlock, StatKey } from './export-format';
import { SCHOOL_POWER, SLOTS, STAT_KEYS } from './export-format';
import { BASE_STATS } from './data/base-stats';
import { CONVERSIONS, spiritRegenPer2s } from './data/conversions';
import { buffById } from './data/buffs';
import type { Character } from './types';
import { emptyStatSheet, type FightConfig, type StatSheet } from './sim/types';

/** The school a spec cares about, for reading the right column off the sheet. */
export const SPEC_SCHOOL: Record<number, School> = {
  61: 'frost', 41: 'fire', 81: 'arcane',
  203: 'shadow', 301: 'fire', 302: 'shadow', 303: 'shadow',
  261: 'nature', 283: 'arcane', 382: 'holy', 202: 'holy', 201: 'holy', 262: 'nature',
};

function addInto(target: StatBlock, source: StatBlock, sign = 1): void {
  for (const key of STAT_KEYS) {
    const value = source[key];
    if (value) target[key] = (target[key] ?? 0) + value * sign;
  }
}

/** Everything the equipped set contributes, summed. */
export function equippedStats(
  equipped: Partial<Record<Slot, ItemRef>>,
  override?: Partial<Record<Slot, ItemRef | null>>,
): StatBlock {
  const total: StatBlock = {};
  for (const slot of SLOTS) {
    const item = override && slot in override ? override[slot] : equipped[slot];
    if (item) addInto(total, item.stats);
  }
  return total;
}

/**
 * The character with nothing on: the sheet minus the gear.
 *
 * Percentage effects land here rather than being modelled. A gnome's five per
 * cent intellect, or Arcane Mind, is already inside the sheet total, so it ends
 * up inside the baseline. New intellect will not be scaled by it, which is a
 * known and small understatement.
 */
export function baselineStats(source: CharacterExport): StatBlock {
  const gear = equippedStats(source.equipped);
  const sheet = source.stats;

  const base: StatBlock = {
    strength: sheet.strength,
    agility: sheet.agility,
    stamina: sheet.stamina,
    intellect: sheet.intellect,
    spirit: sheet.spirit,
    attackPower: sheet.attackPower,
    rangedAttackPower: sheet.rangedAttackPower,
    crit: sheet.meleeCrit,
    hit: sheet.hit ?? 0,
    spellHit: sheet.spellHit ?? 0,
    armor: sheet.armor,
  };

  // The sheet reports spell power and crit per school, already including the
  // generic pool. Take the lowest school as the generic part and the rest as
  // that school's own bonus, which is how the game builds the two numbers.
  const powers = Object.values(sheet.spellPower).filter((n): n is number => typeof n === 'number');
  const generic = powers.length ? Math.min(...powers) : 0;
  base.spellPower = generic;
  for (const [schoolName, value] of Object.entries(sheet.spellPower)) {
    const key = SCHOOL_POWER[schoolName as School];
    if (key && typeof value === 'number' && value > generic) base[key] = value - generic;
  }

  const crits = Object.values(sheet.spellCrit).filter((n): n is number => typeof n === 'number');
  base.spellCrit = crits.length ? Math.max(...crits) : 0;

  base.healing = sheet.healing;
  base.mp5 = 0;

  addInto(base, gear, -1);
  return base;
}

/* -------------------------------------------------------------------- buffs */

/** Stats from the fight's ticked buffs, skipping anything already on the sheet. */
export function buffStats(
  ids: string[],
  activeBuffs: string[] = [],
): { stats: StatBlock; skipped: string[] } {
  const stats: StatBlock = {};
  const skipped: string[] = [];
  const already = new Set(activeBuffs.map((b) => b.trim().toLowerCase()));
  const chosen = new Set(ids);

  for (const id of ids) {
    const buff = buffById(id);
    if (!buff) continue;
    if (already.has(buff.name.toLowerCase())) {
      skipped.push(buff.name);
      continue;
    }
    // Two buffs that overwrite each other only pay out once.
    const clash = buff.exclusiveWith?.find((other) => chosen.has(other) && other < id);
    if (clash) continue;
    addInto(stats, buff.stats);
  }

  return { stats, skipped };
}

/* -------------------------------------------------------------- conversions */

/**
 * What a block of raw stats becomes for this class. Only ever handed a
 * difference, never a total.
 */
export function convert(classId: ClassId, delta: StatBlock): StatBlock {
  const c = CONVERSIONS[classId];
  const out: StatBlock = { ...delta };

  const intellect = delta.intellect ?? 0;
  if (intellect && c.intPerSpellCrit > 0) {
    out.spellCrit = (out.spellCrit ?? 0) + intellect / c.intPerSpellCrit;
  }

  const agility = delta.agility ?? 0;
  if (agility) {
    if (c.agiPerMeleeCrit > 0) out.crit = (out.crit ?? 0) + agility / c.agiPerMeleeCrit;
    if (c.apPerAgility) out.attackPower = (out.attackPower ?? 0) + agility * c.apPerAgility;
    if (c.rapPerAgility) {
      out.rangedAttackPower = (out.rangedAttackPower ?? 0) + agility * c.rapPerAgility;
    }
    if (c.armorPerAgility) out.armor = (out.armor ?? 0) + agility * c.armorPerAgility;
  }

  const strength = delta.strength ?? 0;
  if (strength && c.apPerStrength) {
    out.attackPower = (out.attackPower ?? 0) + strength * c.apPerStrength;
  }

  return out;
}

/* ------------------------------------------------------------- the full sheet */

export interface DeriveOptions {
  /** Swap items in before working the stats out, for a candidate comparison. */
  gearOverride?: Partial<Record<Slot, ItemRef | null>>;
  /** Names of buffs that were skipped because they were already up. */
  onSkippedBuff?: (names: string[]) => void;
}

/**
 * The resolved stats for one configuration: baseline, plus the gear that is on,
 * plus the buffs that are ticked, with the class conversions applied to
 * everything that was not already on the sheet.
 */
export function deriveStatSheet(
  character: Character,
  fight: FightConfig,
  opts: DeriveOptions = {},
): StatSheet {
  const source = character.source;
  const classId = character.classId;
  const conversions = CONVERSIONS[classId];

  const base = baselineStats(source);
  const currentGear = equippedStats(source.equipped);
  const newGear = equippedStats(source.equipped, opts.gearOverride);

  const { stats: buffs, skipped } = buffStats(
    [...fight.buffs, ...fight.consumables, ...fight.debuffs],
    source.activeBuffs,
  );
  if (skipped.length) opts.onSkippedBuff?.(skipped);

  // Everything that was not on the sheet goes through the class conversions.
  const added: StatBlock = {};
  addInto(added, newGear);
  addInto(added, currentGear, -1);
  addInto(added, buffs);
  const converted = convert(classId, added);

  const sheet = emptyStatSheet(source.level);
  for (const key of STAT_KEYS) {
    sheet[key] = (base[key] ?? 0) + (currentGear[key] ?? 0) + (converted[key] ?? 0);
  }

  // Mana follows intellect the same way, on top of what the sheet reported.
  const intellectDelta = converted.intellect ?? 0;
  sheet.mana = Math.max(0, source.stats.mana + intellectDelta * conversions.manaPerInt);
  if (sheet.mana === 0 && conversions.manaPerInt > 0) {
    sheet.mana = BASE_STATS[classId].baseMana + sheet.intellect * conversions.manaPerInt;
  }

  sheet.weaponSkill = weaponSkillFor(character, opts.gearOverride);
  sheet.level = source.level;

  return sheet;
}

/** Skill with whatever is in the main hand, defaulting to the level cap for it. */
export function weaponSkillFor(
  character: Character,
  override?: Partial<Record<Slot, ItemRef | null>>,
): number {
  const source = character.source;
  const mainhand = override && 'mainhand' in override ? override.mainhand : source.equipped.mainhand;
  const capped = source.level * 5;
  if (!mainhand?.weapon?.type) return capped;

  const skill = source.skills[mainhand.weapon.type] ?? source.skills[mainhand.subType ?? ''] ?? capped;
  const bonus = mainhand.weaponSkill?.[mainhand.weapon.type] ?? 0;
  return skill + bonus;
}

/** Mana every two seconds from spirit, for the simulator's regeneration ticks. */
export function spiritRegen(classId: ClassId, sheet: StatSheet): number {
  return spiritRegenPer2s(classId, sheet.spirit);
}

/** A short list of what a spec's own school reads on the sheet, for the UI. */
export function schoolFor(specId: number): School {
  return SPEC_SCHOOL[specId] ?? 'physical';
}

/** Whether this class has a spell power column worth showing. */
export function isCaster(classId: ClassId): boolean {
  return CONVERSIONS[classId].intPerSpellCrit > 0 && CLASSES[classId].specs.some((s) => s.role !== 'tank');
}

/** Every stat key, for the weight table. */
export function allStatKeys(): readonly StatKey[] {
  return STAT_KEYS;
}
