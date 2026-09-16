/**
 * Where an item database plugs in.
 *
 * The site knows exactly what the addon scanned off your own tooltips and
 * nothing more, which is why it can only rank what you already own. A list of
 * every item in the game answers the other question, the one about what to go
 * and get, and this is the seam that goes through: everything downstream reads
 * ItemRef, so filling one in from a list rather than from a tooltip changes
 * nothing else.
 *
 * No list ships. Forever has published none, and a guessed one would be worse
 * than nothing: every comparison that touched a guessed item would be wrong in
 * a way nobody could see. When the real one exists it goes in
 * public/data/items.json in the shape below and the panels fill in on their own.
 */

import { dataUrl } from '../shared/icons';
import type { ClassId } from '../shared/classes';
import type { ItemRef, School, StatBlock } from './export-format';

/** Where an item comes from, which is what a drop list is sorted by. */
export interface ItemSource {
  kind: 'raid' | 'dungeon' | 'quest' | 'craft' | 'vendor' | 'pvp' | 'world';
  /** The instance or the region, e.g. 'Molten Core'. */
  zone?: string;
  /** What drops it, for a raid or a dungeon. */
  boss?: string;
  /** From nought to one, when it is known. */
  dropChance?: number;
}

export interface DbItem {
  id: number;
  name: string;
  ilvl: number;
  quality: number;
  /** Blizzard INVTYPE token, the same one the addon sends. */
  equipLoc: string;
  subType?: string;
  icon?: string;
  unique?: boolean;
  stats: StatBlock;
  weapon?: { min: number; max: number; speed: number; type: string };
  resistances?: Partial<Record<School, number>>;
  /** The same verbatim lines the addon reads off a tooltip. */
  effects?: string[];
  set?: string;
  /** Classes it is meant for, when the list says. Empty means anyone. */
  classes?: ClassId[];
  source: ItemSource;
}

export interface ItemDatabaseFile {
  v: 1;
  /** Who published it and when, which the page shows rather than hides. */
  source: string;
  items: DbItem[];
  /** Sets by item id, which beats a tooltip name because an id is not translated. */
  sets?: Array<{ name: string; pieces: number; itemIds: number[] }>;
}

export interface ItemDatabase {
  /** Who published the list, for the panel to credit. */
  readonly source: string;
  /** Everything known about an item id. */
  get(id: number): DbItem | undefined;
  all(): DbItem[];
  /** Grouped by where it comes from, for a list of what a raid drops. */
  bySource(): Map<string, Map<string, DbItem[]>>;
  sets(): ItemDatabaseFile['sets'];
}

/* ------------------------------------------------------------------ loading */

let cache: ItemDatabase | null = null;
let inflight: Promise<ItemDatabase | null> | null = null;
let looked = false;

/**
 * Reads the list, if there is one.
 *
 * Resolves to nothing rather than throwing when the file is not there, because
 * not having one is the ordinary state of this site rather than an error, and
 * the panels have something honest to say about it.
 */
export async function loadItemDatabase(): Promise<ItemDatabase | null> {
  if (cache) return cache;
  if (looked && !inflight) return null;
  if (inflight) return inflight;

  inflight = fetch(dataUrl('items.json'))
    .then((res) => (res.ok ? (res.json() as Promise<ItemDatabaseFile>) : null))
    .then((file) => {
      inflight = null;
      looked = true;
      if (!file || !Array.isArray(file.items)) return null;
      cache = buildDatabase(file);
      return cache;
    })
    .catch(() => {
      inflight = null;
      looked = true;
      return null;
    });

  return inflight;
}

/** Builds one from a file that is already in hand, which is what the tests do. */
export function buildDatabase(file: ItemDatabaseFile): ItemDatabase {
  const byId = new Map<number, DbItem>(file.items.map((item) => [item.id, item]));

  let grouped: Map<string, Map<string, DbItem[]>> | null = null;

  return {
    source: file.source ?? 'unknown',
    get: (id) => byId.get(id),
    all: () => [...byId.values()],
    sets: () => file.sets,
    bySource: () => {
      if (grouped) return grouped;
      grouped = new Map();
      for (const item of byId.values()) {
        const zone = item.source.zone ?? labelFor(item.source.kind);
        const boss = item.source.boss ?? 'Elsewhere';
        const zoneMap = grouped.get(zone) ?? new Map<string, DbItem[]>();
        const list = zoneMap.get(boss) ?? [];
        list.push(item);
        zoneMap.set(boss, list);
        grouped.set(zone, zoneMap);
      }
      return grouped;
    },
  };
}

function labelFor(kind: ItemSource['kind']): string {
  switch (kind) {
    case 'raid': return 'Raids';
    case 'dungeon': return 'Dungeons';
    case 'quest': return 'Quests';
    case 'craft': return 'Crafted';
    case 'vendor': return 'Vendors';
    case 'pvp': return 'Honour';
    default: return 'Out in the world';
  }
}

/* ------------------------------------------------------------- conversion */

/**
 * A database item as the rest of the site reads items.
 *
 * It is marked as coming from the database rather than from a bag, which is
 * what keeps a drop out of the lists that are about what you already have.
 */
export function toItemRef(item: DbItem): ItemRef {
  const ref: ItemRef = {
    id: item.id,
    name: item.name,
    equipLoc: item.equipLoc,
    quality: item.quality,
    stats: { ...item.stats },
    location: { where: 'database' },
  };

  if (item.ilvl) ref.ilvl = item.ilvl;
  if (item.icon) ref.icon = item.icon;
  if (item.subType) ref.subType = item.subType;
  if (item.unique) ref.unique = true;
  if (item.set) ref.setName = item.set;
  if (item.effects?.length) ref.effects = [...item.effects];
  if (item.resistances) ref.resistances = { ...item.resistances };
  if (item.weapon) {
    ref.weapon = {
      min: item.weapon.min,
      max: item.weapon.max,
      speed: item.weapon.speed,
      type: item.weapon.type,
      hands: handsFor(item.equipLoc),
    };
    ref.stats.weaponDps = Math.round(
      ((item.weapon.min + item.weapon.max) / 2 / Math.max(0.1, item.weapon.speed)) * 100,
    ) / 100;
  }

  return ref;
}

function handsFor(equipLoc: string): NonNullable<ItemRef['weapon']>['hands'] {
  const token = equipLoc.toUpperCase();
  if (token === 'INVTYPE_2HWEAPON') return 'two';
  if (token === 'INVTYPE_WEAPONMAINHAND') return 'main';
  if (token === 'INVTYPE_WEAPONOFFHAND') return 'off';
  if (token.includes('RANGED') || token === 'INVTYPE_THROWN') return 'ranged';
  return 'one';
}

/**
 * Fills in what the scan missed, without ever overwriting what it found. The
 * tooltip is the more trustworthy of the two: it already has the enchant and
 * the random suffix on it, and the database does not know which one you own.
 */
export function resolveItem(item: ItemRef, db?: ItemDatabase | null): ItemRef {
  const known = db?.get(item.id);
  if (!known) return item;

  const filled = toItemRef(known);
  return {
    ...filled,
    ...item,
    stats: { ...filled.stats, ...item.stats },
    location: item.location,
  };
}

/** Whether a list is wired up at all, for the UI to say so. */
export function hasItemDatabase(db?: ItemDatabase | null): boolean {
  return !!db;
}
