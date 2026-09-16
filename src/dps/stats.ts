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
import { setStats } from './data/sets';
import { effectsForLoadout } from './data/item-effects';
import type { ActiveEffect } from './sim/effects';
import type { Character } from './types';
import {
  emptyStatSheet, type FightConfig, type Hand, type StatSheet, type WeaponStats,
} from './sim/types';

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
  const worn = wornItems(equipped, override);
  const total: StatBlock = {};
  for (const item of worn) addInto(total, item.stats);
  // A set bonus is counted here rather than on top, so a swap that breaks a set
  // loses the bonus the same way it loses the item's own stats.
  addInto(total, setStats(worn));
  return total;
}

/** Which item is in each slot once a swap has been applied. */
export function wornItems(
  equipped: Partial<Record<Slot, ItemRef>>,
  override?: Partial<Record<Slot, ItemRef | null>>,
): ItemRef[] {
  const out: ItemRef[] = [];
  for (const slot of SLOTS) {
    const item = override && slot in override ? override[slot] : equipped[slot];
    if (item) out.push(item);
  }
  return out;
}

/**
 * The stats the exported character sheet actually measured.
 *
 * A measured total already holds the gear and any buff that was up, so gear is taken off it
 * to find the baseline. A stat not measured is built from the gear and buffs alone. The
 * sheet has no line at all for mana per five, haste, feral attack power or weapon DPS. Hit
 * and spell hit are measured only when the client had the API: absent is not measured, and
 * an explicit zero is a measured zero that stays authoritative. Spell power and spell crit
 * are measured when the sheet lists any school.
 */
export function sheetReports(source: CharacterExport): Set<StatKey> {
  const sheet = source.stats;
  const reported = new Set<StatKey>([
    'strength', 'agility', 'stamina', 'intellect', 'spirit',
    'attackPower', 'rangedAttackPower', 'crit', 'armor', 'healing',
  ]);
  if (sheet.hit !== undefined) reported.add('hit');
  if (sheet.spellHit !== undefined) reported.add('spellHit');
  if (Object.values(sheet.spellPower).some((n) => typeof n === 'number')) {
    reported.add('spellPower');
    for (const school of Object.keys(sheet.spellPower) as School[]) {
      const key = SCHOOL_POWER[school];
      if (key) reported.add(key);
    }
  }
  if (Object.values(sheet.spellCrit).some((n) => typeof n === 'number')) reported.add('spellCrit');
  return reported;
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

  // Gear comes off only what the sheet counted it in. Taking it off a stat the sheet never
  // measured left a character wearing 10 mana per five with none, and with -10 once the
  // item came off.
  const reported = sheetReports(source);
  for (const key of STAT_KEYS) {
    if (!reported.has(key)) base[key] = 0;
    else if (gear[key]) base[key] = (base[key] ?? 0) - gear[key]!;
  }
  return base;
}

/**
 * The trinkets and weapon procs on what a character is wearing, read off the
 * tooltips the addon scanned.
 *
 * Resolved here rather than in the worker because it is cheap, and because a
 * line nothing could be made of has to reach the notes rather than vanish.
 */
export function effectsOn(
  character: Character,
  override?: Partial<Record<Slot, ItemRef | null>>,
): { effects: ActiveEffect[]; effectNotes: string[] } {
  const worn = wornItems(character.source.equipped, override);
  const read = effectsForLoadout(worn);

  return {
    effects: read.effects.map(({ item, effect }) => ({ name: item.name, effect })),
    effectNotes: read.unknown.map(
      ({ item, line }) =>
        item.name + ' does something this page cannot read: "' + line.trim() +
        '". Whatever that is worth is missing from the figure.',
    ),
  };
}

/* -------------------------------------------------------------------- buffs */

export interface BuffTotals {
  /** Points added outright. */
  stats: StatBlock;
  /**
   * Stats raised by a share. Kept apart from the flat ones because they have to
   * be applied to what you already have, not to each other.
   */
  multipliers: Partial<Record<StatKey, number>>;
  /**
   * Flat stats of the buffs that were already up. The sheet holds them only for the stats
   * it measures; for the rest, mana per five from a totem say, they still have to be added.
   */
  skippedStats: StatBlock;
  /** Names of buffs that were already up when the export ran. */
  skipped: string[];
}

/** Stats from the fight's ticked buffs, skipping anything already on the sheet. */
export function buffStats(ids: string[], activeBuffs: string[] = []): BuffTotals {
  const stats: StatBlock = {};
  const skippedStats: StatBlock = {};
  const multipliers: Partial<Record<StatKey, number>> = {};
  const skipped: string[] = [];
  const already = new Set(activeBuffs.map((b) => b.trim().toLowerCase()));
  const chosen = new Set(ids);

  for (const id of ids) {
    const buff = buffById(id);
    if (!buff) continue;
    if (already.has(buff.name.toLowerCase())) {
      skipped.push(buff.name);
      addInto(skippedStats, buff.stats);
      continue;
    }
    // Two buffs that overwrite each other only pay out once.
    const clash = buff.exclusiveWith?.find((other) => chosen.has(other) && other < id);
    if (clash) continue;
    addInto(stats, buff.stats);
    for (const [key, factor] of Object.entries(buff.multipliers ?? {}) as Array<[StatKey, number]>) {
      multipliers[key] = (multipliers[key] ?? 1) * factor;
    }
  }

  return { stats, skippedStats, multipliers, skipped };
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

  const { stats: ticked, skippedStats, multipliers, skipped } = buffStats(
    [...fight.buffs, ...fight.consumables, ...fight.debuffs],
    source.activeBuffs,
  );
  if (skipped.length) opts.onSkippedBuff?.(skipped);

  // A buff already up is in the sheet only where the sheet measures. Elsewhere it is added
  // once here, so it is neither counted twice nor lost.
  const buffs: StatBlock = { ...ticked };
  const reported = sheetReports(source);
  for (const [key, value] of Object.entries(skippedStats) as Array<[StatKey, number]>) {
    if (!reported.has(key)) buffs[key] = (buffs[key] ?? 0) + value;
  }

  // Everything that was not on the sheet goes through the class conversions.
  const added: StatBlock = {};
  addInto(added, newGear);
  addInto(added, currentGear, -1);
  addInto(added, buffs);

  // A percentage buff raises what you already have, so it is worked out against
  // the whole of it and only the extra goes through the conversions. Kings on a
  // sheet with a hundred strength is ten more strength, and those ten become
  // attack power the same way ten off a ring would.
  for (const [key, factor] of Object.entries(multipliers) as Array<[StatKey, number]>) {
    const whole = (base[key] ?? 0) + (newGear[key] ?? 0) + (buffs[key] ?? 0);
    added[key] = (added[key] ?? 0) + whole * (factor - 1);
  }

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
  sheet.weapons = weaponsFor(character, opts.gearOverride);

  return sheet;
}

/** What is in each hand, for anyone who swings rather than casts. */
export function weaponsFor(
  character: Character,
  override?: Partial<Record<Slot, ItemRef | null>>,
): Partial<Record<Hand, WeaponStats>> {
  const out: Partial<Record<Hand, WeaponStats>> = {};
  const pairs: Array<[Hand, Slot]> = [['main', 'mainhand'], ['off', 'offhand'], ['ranged', 'ranged']];

  for (const [hand, slot] of pairs) {
    const item = override && slot in override ? override[slot] : character.source.equipped[slot];
    const weapon = item?.weapon;
    if (!item || !weapon || weapon.speed <= 0) continue;
    out[hand] = {
      min: weapon.min,
      max: weapon.max,
      speed: weapon.speed,
      skill: skillWith(character, item),
      type: weapon.type || item.subType || '',
      twoHanded: weapon.hands === 'two',
    };
  }

  return out;
}

/** Skill with one item, which is the weapon line plus anything the item grants. */
function skillWith(character: Character, item: ItemRef): number {
  const source = character.source;
  const capped = source.level * 5;
  const type = item.weapon?.type ?? item.subType ?? '';
  const skill = source.skills[type] ?? source.skills[item.subType ?? ''] ?? capped;
  return skill + (item.weaponSkill?.[type] ?? 0);
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
