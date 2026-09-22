/**
 * The contract between the WoW Forever Sync addon and this site.
 *
 * The addon writes this shape as compact JSON behind a WFSYNC1 prefix and the
 * site reads it in importer.ts. Everything here is wire format: change a field
 * and EXPORT_VERSION has to move with it.
 *
 * Item stats are whatever the addon read off the in-game tooltip. There is no
 * item database on this side, so those numbers are the only thing the site
 * knows about an item.
 */

import type { ClassId } from '../shared/classes';

/**
 * 1: the original.
 * 2: adds `professions`, which the guild page shows.
 *
 * The site reads every version up to this one, so an older addon keeps working.
 */
export const EXPORT_VERSION = 2;

/** What the addon puts in front of the JSON so a paste is recognisable. */
export const EXPORT_PREFIX = 'WFSYNC1';

/** Strips the addon's prefix and any stray wrapping the clipboard added. */
export function stripPrefix(raw: string): string {
  let text = (raw ?? '').trim();
  // The fence comes off first. Pasted out of Discord the export arrives inside one
  // with the prefix still in it, and taking the prefix off first left the backticks
  // in front of the JSON, which then failed to parse.
  text = text.replace(/^```[a-z]*\s*/i, '').replace(/\s*```$/, '').trim();
  const prefix = new RegExp('^' + EXPORT_PREFIX + '\\s*[:=]?\\s*', 'i');
  return text.replace(prefix, '').trim();
}

/* ----------------------------------------------------------------- schools */

export const SCHOOLS = ['physical', 'holy', 'fire', 'nature', 'frost', 'shadow', 'arcane'] as const;
export type School = (typeof SCHOOLS)[number];

/** Blizzard's school indices, which is how the addon keys its per-school reads. */
export const SCHOOL_BY_INDEX: Record<string, School> = {
  '1': 'physical', '2': 'holy', '3': 'fire',
  '4': 'nature', '5': 'frost', '6': 'shadow', '7': 'arcane',
};

/* ------------------------------------------------------------------- stats */

/**
 * Every stat the site understands. Crit, hit and their spell versions are
 * percentages. weaponDps is the one key the addon never sends: the importer
 * works it out from the weapon damage line. Haste is another: no Classic item
 * carries it, but a buff can, and the swing timers read it.
 */
export const STAT_KEYS = [
  'strength', 'agility', 'stamina', 'intellect', 'spirit',
  'attackPower', 'rangedAttackPower', 'feralAttackPower',
  'crit', 'hit', 'spellCrit', 'spellHit',
  'spellPower', 'healing',
  'arcanePower', 'firePower', 'frostPower', 'naturePower', 'shadowPower', 'holyPower',
  'mp5', 'armor', 'weaponDps', 'haste',
] as const;

export type StatKey = (typeof STAT_KEYS)[number];

export const STAT_LABEL: Record<StatKey, string> = {
  strength: 'Strength', agility: 'Agility', stamina: 'Stamina',
  intellect: 'Intellect', spirit: 'Spirit',
  attackPower: 'Attack power', rangedAttackPower: 'Ranged attack power',
  feralAttackPower: 'Feral attack power',
  crit: 'Crit %', hit: 'Hit %', spellCrit: 'Spell crit %', spellHit: 'Spell hit %',
  spellPower: 'Spell damage', healing: 'Healing',
  arcanePower: 'Arcane damage', firePower: 'Fire damage', frostPower: 'Frost damage',
  naturePower: 'Nature damage', shadowPower: 'Shadow damage', holyPower: 'Holy damage',
  mp5: 'Mana per 5', armor: 'Armor', weaponDps: 'Weapon DPS', haste: 'Haste %',
};

/** The stat key that carries each school's spell damage bonus. */
export const SCHOOL_POWER: Record<School, StatKey | null> = {
  physical: null,
  holy: 'holyPower',
  fire: 'firePower',
  nature: 'naturePower',
  frost: 'frostPower',
  shadow: 'shadowPower',
  arcane: 'arcanePower',
};

const STAT_KEY_SET = new Set<string>(STAT_KEYS);

export function isStatKey(value: string): value is StatKey {
  return STAT_KEY_SET.has(value);
}

export type StatBlock = Partial<Record<StatKey, number>>;

/* ------------------------------------------------------------------- slots */

export const SLOTS = [
  'head', 'neck', 'shoulder', 'back', 'chest', 'wrist', 'hands', 'waist', 'legs', 'feet',
  'finger1', 'finger2', 'trinket1', 'trinket2', 'mainhand', 'offhand', 'ranged',
] as const;

export type Slot = (typeof SLOTS)[number];

export const SLOT_LABEL: Record<Slot, string> = {
  head: 'Head', neck: 'Neck', shoulder: 'Shoulder', back: 'Back', chest: 'Chest',
  wrist: 'Wrist', hands: 'Hands', waist: 'Waist', legs: 'Legs', feet: 'Feet',
  finger1: 'Ring 1', finger2: 'Ring 2', trinket1: 'Trinket 1', trinket2: 'Trinket 2',
  mainhand: 'Main hand', offhand: 'Off hand', ranged: 'Ranged',
};

/** Blizzard inventory slot ids, the same table the addon walks. */
export const SLOT_INVENTORY_ID: Record<Slot, number> = {
  head: 1, neck: 2, shoulder: 3, back: 15, chest: 5, wrist: 9, hands: 10, waist: 6,
  legs: 7, feet: 8, finger1: 11, finger2: 12, trinket1: 13, trinket2: 14,
  mainhand: 16, offhand: 17, ranged: 18,
};

/** Slots an item with this INVTYPE can go in. Missing means the site ignores it. */
const EQUIP_LOC_SLOTS: Record<string, Slot[]> = {
  INVTYPE_HEAD: ['head'],
  INVTYPE_NECK: ['neck'],
  INVTYPE_SHOULDER: ['shoulder'],
  INVTYPE_CLOAK: ['back'],
  INVTYPE_CHEST: ['chest'],
  INVTYPE_ROBE: ['chest'],
  INVTYPE_WRIST: ['wrist'],
  INVTYPE_HAND: ['hands'],
  INVTYPE_WAIST: ['waist'],
  INVTYPE_LEGS: ['legs'],
  INVTYPE_FEET: ['feet'],
  INVTYPE_FINGER: ['finger1', 'finger2'],
  INVTYPE_TRINKET: ['trinket1', 'trinket2'],
  INVTYPE_WEAPON: ['mainhand', 'offhand'],
  INVTYPE_2HWEAPON: ['mainhand'],
  INVTYPE_WEAPONMAINHAND: ['mainhand'],
  INVTYPE_WEAPONOFFHAND: ['offhand'],
  INVTYPE_HOLDABLE: ['offhand'],
  INVTYPE_SHIELD: ['offhand'],
  INVTYPE_RANGED: ['ranged'],
  INVTYPE_RANGEDRIGHT: ['ranged'],
  INVTYPE_THROWN: ['ranged'],
  INVTYPE_RELIC: ['ranged'],
};

/** Where an item can be worn. Shirts, tabards, bags and ammo return nothing. */
export function slotsFor(equipLoc: string | undefined): Slot[] {
  return EQUIP_LOC_SLOTS[(equipLoc ?? '').toUpperCase()] ?? [];
}

/** True for an INVTYPE that fills both weapon slots by itself. */
export function isTwoHanded(equipLoc: string | undefined): boolean {
  return (equipLoc ?? '').toUpperCase() === 'INVTYPE_2HWEAPON';
}

/* ------------------------------------------------------------------- items */

export type WeaponHands = 'one' | 'two' | 'main' | 'off' | 'ranged';

export interface WeaponInfo {
  min: number;
  max: number;
  speed: number;
  /** Item subtype as the game reports it, e.g. 'Daggers', 'One-Handed Swords'. */
  type: string;
  hands: WeaponHands;
}

export interface ItemLocation {
  /** 'database' is an item you do not own, offered by a list of what drops. */
  where: 'equipped' | 'bag' | 'bank' | 'database';
  /** Set when where is 'equipped'. */
  slot?: Slot;
  bag?: number;
  index?: number;
}

export interface ItemRef {
  id: number;
  name: string;
  /** The raw item link, kept verbatim so a future item database can re-read it. */
  link?: string;
  /** Blizzard INVTYPE token. */
  equipLoc: string;
  /** Item subtype, e.g. 'Cloth' or 'Daggers'. Used for class proficiency. */
  subType?: string;
  quality: number;
  ilvl?: number;
  icon?: string;
  stats: StatBlock;
  resistances?: Partial<Record<School, number>>;
  weapon?: WeaponInfo;
  /** Weapon skill the item grants, e.g. a sword with Increased Swords +5. */
  weaponSkill?: Record<string, number>;
  enchant?: number;
  suffix?: number;
  unique?: boolean;
  setName?: string;
  /** Equip, Use and Chance on hit lines the scanner could not turn into stats. */
  effects?: string[];
  location: ItemLocation;
}

/* --------------------------------------------------------- character sheet */

export interface WeaponDamage {
  min: number;
  max: number;
  speed: number;
}

/**
 * The character sheet as the game showed it at export time. The site treats
 * these as the truth and works out the unequipped baseline by subtracting the
 * stats of what was worn, so it never needs a race and class base table.
 */
export interface SheetStats {
  strength: number;
  agility: number;
  stamina: number;
  intellect: number;
  spirit: number;
  attackPower: number;
  rangedAttackPower: number;
  meleeCrit: number;
  rangedCrit: number;
  /** Per school, as the sheet shows it. */
  spellCrit: Partial<Record<School, number>>;
  spellPower: Partial<Record<School, number>>;
  healing: number;
  /** Undefined when the client had no API for it. */
  hit?: number;
  spellHit?: number;
  mana: number;
  health: number;
  armor: number;
  mainhand?: WeaponDamage;
  offhand?: WeaponDamage;
  ranged?: WeaponDamage;
}

export interface TalentEntryExport {
  name: string;
  /** 1-based row, matching Talent.row in the talent data. */
  tier: number;
  /** 1-based column, matching Talent.col. */
  column: number;
  rank: number;
  max: number;
}

export interface TalentTabExport {
  /** Tab name as the game shows it, e.g. 'Frost'. */
  tab: string;
  points: number;
  list: TalentEntryExport[];
}

/** One trade skill the character has learned. */
export interface ProfessionExport {
  /** The site's own key, e.g. 'blacksmithing' or 'first-aid'. */
  key: string;
  /** The rank the trade window shows, without the bonus gear adds. */
  skill: number;
}

export interface CharacterExport {
  v: number;
  addonVersion: string;
  /** Unix seconds from the game client. */
  generatedAt: number;
  name: string;
  realm: string;
  classId: ClassId;
  level: number;
  race: string;
  faction?: string;
  talents: TalentTabExport[];
  stats: SheetStats;
  /** Weapon skill lines, e.g. a rogue with Daggers 300. */
  skills: Record<string, number>;
  /** Trade skills, from export version 2. Absent on anything older. */
  professions?: ProfessionExport[];
  /** Buffs active when the export ran, so the site can avoid double counting. */
  activeBuffs?: string[];
  equipped: Partial<Record<Slot, ItemRef>>;
  bags: ItemRef[];
  bank: ItemRef[];
  /** The bank list came from an earlier visit rather than this moment. */
  bankStale?: boolean;
  /** At least one read failed, so the export is missing something. */
  partial?: boolean;
}
