/**
 * What a gear paste is allowed to carry, built field by field.
 *
 * The export the addon writes holds a great deal more than a profile shows: every
 * bag and bank slot, the raw item links, where each item was sitting, weapon
 * skills, resistances. The first version of this trimmed the top level — bags and
 * bank came off — and then forwarded `equipped` and `talents` as they arrived.
 * Anything nested inside an item survived that, which is the same as storing it.
 *
 * So nothing is forwarded. Every object here is constructed from a list of fields
 * this page can name, at every depth, and a key nobody named does not exist by
 * the time the upload is built. The addon runs on the member's own machine and
 * can be edited; the shape of what it sends is not a promise.
 *
 * The lists are the contract in GUILD-SPEC §7, and the bot builds the same ones
 * again on its side. Two copies rather than a shared package, the same standing
 * arrangement as the twelve professions: the tests here check this list, the
 * bot's check its own, and the spec is what both are checked against.
 */

import type { Slot, StatKey } from '../dps/export-format';
import { SLOTS, STAT_KEYS } from '../dps/export-format';

/* ------------------------------------------------------------------ bounds
   Every string and every list has a ceiling. They are generous: the point is
   that a number exists, not that it is tight. */

/** The most characters a paste may hold before it is even parsed. */
export const MAX_PASTE_CHARS = 400_000;

/** The biggest upload the bot will store, and the size this page checks first. */
export const MAX_UPLOAD_BYTES = 64 * 1024;

const MAX_NAME = 80;
const MAX_ICON = 120;
const MAX_SUBTYPE = 40;
const MAX_SET_NAME = 80;
const MAX_EFFECT = 240;
const MAX_EFFECTS = 12;
const MAX_TALENT_TABS = 4;
const MAX_TALENTS_PER_TAB = 40;

/* ------------------------------------------------------------------ helpers */

function str(raw: unknown, max: number): string {
  return typeof raw === 'string' ? raw.slice(0, max) : '';
}

/** A finite whole number in range, or null. NaN and Infinity are not numbers here. */
function num(raw: unknown, min: number, max: number): number | null {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
  const value = Math.round(raw);
  return value >= min && value <= max ? value : null;
}

/** Kept to two decimals, for the figures that are not whole. */
function decimal(raw: unknown, min: number, max: number): number | null {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
  if (raw < min || raw > max) return null;
  return Math.round(raw * 100) / 100;
}

function obj(raw: unknown): Record<string, unknown> | null {
  return raw && typeof raw === 'object' && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : null;
}

/* ------------------------------------------------------------------ an item */

/**
 * The stats the sheet and the tooltip read, by the site's own stat keys.
 *
 * STAT_KEYS is the list the tooltip walks, so a key outside it could never be
 * shown. Percentages keep their decimals; everything else is whole.
 */
export function itemStats(raw: unknown): Partial<Record<StatKey, number>> {
  const source = obj(raw);
  const out: Partial<Record<StatKey, number>> = {};
  if (!source) return out;
  for (const key of STAT_KEYS) {
    const value = decimal(source[key], -100_000, 100_000);
    if (value !== null && value !== 0) out[key] = value;
  }
  return out;
}

export interface WornWeapon {
  min: number;
  max: number;
  speed: number;
}

/**
 * What the guild page shows about one worn item.
 *
 * Narrower than the gear page's ItemRef on purpose, and the differences are the
 * point:
 *
 * - no `link`: the raw item link is a string the addon built, nothing here reads
 *   it, and a field nothing reads is a place for anything to travel;
 * - no `location`: an equipped item is equipped. The export can say bank, with a
 *   bag and an index in it, and a bank is exactly what this feature promises not
 *   to hold;
 * - no `enchant`, `suffix`, `resistances`, `weaponSkill`, `equipLoc`: the
 *   read-only sheet shows none of them.
 */
export interface WornItem {
  id: number;
  name: string;
  icon?: string;
  quality: number;
  ilvl?: number;
  subType?: string;
  unique?: boolean;
  setName?: string;
  stats: Partial<Record<StatKey, number>>;
  weapon?: WornWeapon;
  /** Equip and Use lines the addon could not turn into stats. Game text. */
  effects?: string[];
}

/** One item, or null when there is not enough of it to show. */
export function wornItem(raw: unknown): WornItem | null {
  const source = obj(raw);
  if (!source) return null;

  const name = str(source.name, MAX_NAME).trim();
  // A square with no name is one the reader cannot read. An id on its own is not
  // an item, it is a number.
  if (!name) return null;

  const item: WornItem = {
    id: num(source.id, 0, 10_000_000) ?? 0,
    name,
    quality: num(source.quality, 0, 7) ?? 1,
    stats: itemStats(source.stats),
  };

  const icon = str(source.icon, MAX_ICON).trim();
  if (icon) item.icon = icon;

  const ilvl = num(source.ilvl, 1, 1000);
  if (ilvl !== null) item.ilvl = ilvl;

  const subType = str(source.subType, MAX_SUBTYPE).trim();
  if (subType) item.subType = subType;

  if (source.unique === true) item.unique = true;

  const setName = str(source.setName, MAX_SET_NAME).trim();
  if (setName) item.setName = setName;

  const weapon = obj(source.weapon);
  if (weapon) {
    const min = decimal(weapon.min, 0, 100_000);
    const max = decimal(weapon.max, 0, 100_000);
    const speed = decimal(weapon.speed, 0, 100);
    if (min !== null && max !== null && speed !== null) item.weapon = { min, max, speed };
  }

  if (Array.isArray(source.effects)) {
    const lines = source.effects
      .filter((line): line is string => typeof line === 'string')
      .map((line) => line.slice(0, MAX_EFFECT).trim())
      .filter(Boolean)
      .slice(0, MAX_EFFECTS);
    if (lines.length) item.effects = lines;
  }

  return item;
}

/**
 * What is worn, keyed by the seventeen slots the sheet draws.
 *
 * Walks the slot list rather than the keys the export came with, so a slot this
 * site does not know cannot appear, whatever the export calls it.
 */
export function wornSet(raw: unknown): Partial<Record<Slot, WornItem>> {
  const source = obj(raw);
  const out: Partial<Record<Slot, WornItem>> = {};
  if (!source) return out;
  for (const slot of SLOTS) {
    const item = wornItem(source[slot]);
    if (item) out[slot] = item;
  }
  return out;
}

/* ------------------------------------------------------------------ talents */

export interface TalentPick {
  name: string;
  tier: number;
  column: number;
  rank: number;
  max: number;
}

export interface TalentTab {
  tab: string;
  points: number;
  list: TalentPick[];
}

/** The trees and what is spent in them, with nothing else along for the ride. */
export function talentTabs(raw: unknown): TalentTab[] {
  if (!Array.isArray(raw)) return [];
  const out: TalentTab[] = [];
  for (const entry of raw.slice(0, MAX_TALENT_TABS)) {
    const source = obj(entry);
    if (!source) continue;
    const tab = str(source.tab, MAX_NAME).trim();
    const points = num(source.points, 0, 51);
    if (!tab || points === null) continue;

    const list: TalentPick[] = [];
    if (Array.isArray(source.list)) {
      for (const item of source.list.slice(0, MAX_TALENTS_PER_TAB)) {
        const pick = obj(item);
        if (!pick) continue;
        const name = str(pick.name, MAX_NAME).trim();
        const tier = num(pick.tier, 1, 9);
        const column = num(pick.column, 1, 4);
        const rank = num(pick.rank, 0, 5);
        const max = num(pick.max, 1, 5);
        if (!name || tier === null || column === null || rank === null || max === null) continue;
        list.push({ name, tier, column, rank, max });
      }
    }
    out.push({ tab, points, list });
  }
  return out;
}

/* ------------------------------------------------------------------- stats */

/**
 * The character sheet's own totals, as the game showed them at export time.
 *
 * The flat figures only. The export also carries per-school spell crit and spell
 * power as nested objects, and the three weapon damage lines; the profile shows
 * none of them, so none of them are stored, and neither is a key outside this
 * list.
 *
 * The profile does not show these either, yet. They are kept because they are a
 * summary of gear that is already on the page, and because reading them back off
 * a paste later would mean asking every member to paste again.
 */
export const SHEET_STAT_KEYS = [
  'strength',
  'agility',
  'stamina',
  'intellect',
  'spirit',
  'attackPower',
  'rangedAttackPower',
  'meleeCrit',
  'rangedCrit',
  'healing',
  'hit',
  'spellHit',
  'mana',
  'health',
  'armor',
] as const;

export type SheetStatKey = (typeof SHEET_STAT_KEYS)[number];

export function sheetStats(raw: unknown): Partial<Record<SheetStatKey, number>> {
  const source = obj(raw);
  const out: Partial<Record<SheetStatKey, number>> = {};
  if (!source) return out;
  for (const key of SHEET_STAT_KEYS) {
    const value = decimal(source[key], -1_000_000, 1_000_000);
    if (value !== null) out[key] = value;
  }
  return out;
}

