#!/usr/bin/env node
/**
 * Turns the client's own item tables into public/data/items.json.
 *
 * The CSVs in data-raw/ are exports of the Forever beta client's DB2 tables,
 * taken from wago.tools. They are not in the repository: they are large, they
 * are Blizzard's data, and they are replaced wholesale every build. What ships
 * is the JSON this writes.
 *
 * The client does not store a finished item. It stores a budget: an item level,
 * a quality, and a percentage of that budget per stat, and works the rest out
 * when it draws the tooltip. So does this. Each formula below is checked
 * against items whose Classic values are known, in tests/items-import.test.ts.
 *
 * What is not in these tables, and so is not in the file: where an item drops,
 * the text of its Equip and Use lines, and its icon. The addon reads all three
 * off a real tooltip, which is why a scanned item still beats a listed one.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = resolve(ROOT, 'data-raw');
const OUT = resolve(ROOT, 'public/data/items.json');

/* ------------------------------------------------------------------- csv */

/** Splits one line, honouring quoted fields and doubled quotes inside them. */
function splitLine(line) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else quoted = !quoted;
      continue;
    }
    if (ch === ',' && !quoted) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function readTable(name) {
  const file = readdirSync(RAW).find((f) => f.startsWith(name + '.') && f.endsWith('.csv'));
  if (!file) throw new Error(`no export for ${name} in data-raw/`);
  const text = readFileSync(resolve(RAW, file), 'utf8');
  const lines = text.split(/\r?\n/);
  const head = splitLine(lines[0]);
  const rows = [];
  for (const line of lines.slice(1)) {
    if (!line) continue;
    const cells = splitLine(line);
    const row = {};
    head.forEach((key, i) => { row[key] = cells[i]; });
    rows.push(row);
  }
  return { rows, build: file.split('.').slice(1, -1).join('.') };
}

const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const byId = (rows, key = 'ID') => new Map(rows.map((r) => [num(r[key]), r]));

/* --------------------------------------------------------------- mapping */

/** InventoryType, as the client numbers it, to the INVTYPE token the site uses. */
const INVENTORY_TYPE = {
  1: 'INVTYPE_HEAD', 2: 'INVTYPE_NECK', 3: 'INVTYPE_SHOULDER', 4: 'INVTYPE_BODY',
  5: 'INVTYPE_CHEST', 6: 'INVTYPE_WAIST', 7: 'INVTYPE_LEGS', 8: 'INVTYPE_FEET',
  9: 'INVTYPE_WRIST', 10: 'INVTYPE_HAND', 11: 'INVTYPE_FINGER', 12: 'INVTYPE_TRINKET',
  13: 'INVTYPE_WEAPON', 14: 'INVTYPE_SHIELD', 15: 'INVTYPE_RANGED', 16: 'INVTYPE_CLOAK',
  17: 'INVTYPE_2HWEAPON', 18: 'INVTYPE_BAG', 19: 'INVTYPE_TABARD', 20: 'INVTYPE_ROBE',
  21: 'INVTYPE_WEAPONMAINHAND', 22: 'INVTYPE_WEAPONOFFHAND', 23: 'INVTYPE_HOLDABLE',
  24: 'INVTYPE_AMMO', 25: 'INVTYPE_THROWN', 26: 'INVTYPE_RANGEDRIGHT', 28: 'INVTYPE_RELIC',
};

/**
 * Which column of the stat budget a slot spends from. A head takes the largest
 * share and a ring the smallest, which is why the same percentage is worth
 * more on one than the other. Worked out from the tables themselves: for each
 * slot, only one column turns every item's percentages into whole numbers.
 */
const BUDGET_COLUMN = {
  1: 0, 5: 0, 7: 0, 17: 0, 20: 0,
  3: 1, 6: 1, 8: 1, 10: 1, 12: 1,
  2: 2, 9: 2, 11: 2, 14: 2, 16: 2, 23: 2, 28: 2,
  13: 3, 21: 3, 22: 3,
  15: 4, 25: 4, 26: 4,
};

/** Quality to the budget band the client reads. */
const BAND = { 0: 'Good', 1: 'Good', 2: 'Good', 3: 'Superior', 4: 'Epic', 5: 'Epic', 6: 'Epic' };

/** The client's stat ids, as far as a Classic-era item uses them. */
const STAT_ID = {
  3: 'agility', 4: 'strength', 5: 'intellect', 6: 'spirit', 7: 'stamina',
  38: 'attackPower', 39: 'rangedAttackPower',
  41: 'healing', 42: 'spellPower', 43: 'mp5', 45: 'spellPower',
  50: 'armor',
};

/**
 * Hit, crit and haste are stored as ratings, and the game divides them by a
 * figure that depends on your level. These are the level sixty divisors, which
 * are not in the tables this reads: they live in a game table the client keeps
 * elsewhere. They are the Classic ones, and an item that reads 28 crit rating
 * comes out at the two per cent its tooltip shows.
 *
 * One rating covers both weapon and spell, which is why each one fills two
 * fields at different rates.
 */
const RATING_ID = {
  31: { hit: 10, spellHit: 8 },
  32: { crit: 14, spellCrit: 14 },
  36: { haste: 10 },
};

/** Resistances are stats too in this client, on ids of their own. */
const RESIST_ID = { 51: 'fire', 52: 'frost', 53: 'holy', 54: 'shadow', 55: 'nature', 56: 'arcane' };

/** AllowableClass is a bitmask in the order the game numbers the classes. */
const CLASS_BIT = {
  1: 'warrior', 2: 'paladin', 4: 'hunter', 8: 'rogue', 16: 'priest',
  64: 'shaman', 128: 'mage', 256: 'warlock', 1024: 'druid',
};

/**
 * Names the client keeps for its own use. Blizzard's test gear sits in the same
 * tables as the real thing and is far stronger than any of it, so a list that
 * kept it would put 'Fast Test Fist' at the top of every upgrade list.
 */
const NOT_IN_THE_GAME = [
  /\btest(ing|er)?\b/i, /\bdebug\b/i, /\bqa\b/i, /placeholder/i, /\bunused\b/i,
  /deprecated/i, /^old[ _]/i, /^zz/i, /\[ph\]/i, /\bmonster\b/i, /\bdnd\b/i, /internal/i,
  // Blizzard's level-banded sample gear, such as '90 Epic Frost Wand'.
  /^\d+ (epic|superior|rare|green|blue|white|grey|gray|poor|uncommon|common) /i,
];

/** The level the game stops at, which decides what is reachable. */
const MAX_LEVEL = 60;

/** Item class 2 is a weapon, 4 is armor. */
const WEAPON_CLASS = 2;
const ARMOR_CLASS = 4;

/** Armor subclasses, for the armor table's per-material column. */
const ARMOR_MATERIAL = { 1: 'Cloth', 2: 'Leather', 3: 'Chain', 4: 'Plate' };

/** Weapon subclasses that read the caster damage tables rather than the melee ones. */
const CASTER_FLAG = 0x200;

/* ------------------------------------------------------------------ build */

const sparse = readTable('ItemSparse');
const build = sparse.build;
const items = byId(readTable('Item').rows);
const rand = byId(readTable('RandPropPoints').rows);
const subclasses = new Map(
  // The verbose name is the one a tooltip shows, and the only one that tells a
  // one-handed sword from a two-handed one, which is what proficiency reads.
  readTable('ItemSubClass').rows.map((r) => [`${num(r.ClassID)}/${num(r.SubClassID)}`, r.VerboseName_lang || r.DisplayName_lang]),
);
const sets = readTable('ItemSet').rows;
const armorQuality = byId(readTable('ItemArmorQuality').rows);
const armorTotal = byId(readTable('ItemArmorTotal').rows);
const armorLocation = byId(readTable('ArmorLocation').rows);

const damageTables = {
  oneHand: byId(readTable('ItemDamageOneHand').rows, 'ItemLevel'),
  oneHandCaster: byId(readTable('ItemDamageOneHandCaster').rows, 'ItemLevel'),
  twoHand: byId(readTable('ItemDamageTwoHand').rows, 'ItemLevel'),
  twoHandCaster: byId(readTable('ItemDamageTwoHandCaster').rows, 'ItemLevel'),
  ranged: byId(readTable('ItemDamageRanged').rows, 'ItemLevel'),
  wand: byId(readTable('ItemDamageWand').rows, 'ItemLevel'),
};

/** The set each item belongs to, by item id. */
const setOf = new Map();
const setList = [];
for (const row of sets) {
  const ids = [];
  for (let i = 0; i < 17; i += 1) {
    const id = num(row[`ItemID_${i}`]);
    if (id > 0) ids.push(id);
  }
  if (!ids.length) continue;
  setList.push({ name: row.Name_lang, pieces: ids.length, itemIds: ids });
  for (const id of ids) setOf.set(id, row.Name_lang);
}

/** The weapon damage table an item reads, or nothing for anything that is not a weapon. */
function damageTableFor(item, sparseRow) {
  const subclass = num(item.SubclassID);
  const caster = (num(sparseRow.Flags_1) & CASTER_FLAG) !== 0;
  const inv = num(sparseRow.InventoryType);
  if (subclass === 19) return damageTables.wand;
  if (subclass === 2 || subclass === 3 || subclass === 18) return damageTables.ranged;
  if (subclass === 16) return null; // thrown; the client has no table for it here
  if (inv === 17) return caster ? damageTables.twoHandCaster : damageTables.twoHand;
  return caster ? damageTables.oneHandCaster : damageTables.oneHand;
}

const out = [];
const unknownStats = new Map();
let skipped = 0;

for (const row of sparse.rows) {
  const id = num(row.ID);
  const item = items.get(id);
  if (!item) continue;

  const inv = num(row.InventoryType);
  const equipLoc = INVENTORY_TYPE[inv];
  if (!equipLoc) continue;
  const name = row.Display_lang ?? '';
  if (!name || NOT_IN_THE_GAME.some((pattern) => pattern.test(name))) {
    skipped += 1;
    continue;
  }

  // A level sixty game, so anything that asks for a higher level is a leftover
  // from a later expansion that happens to share these tables.
  if (num(row.RequiredLevel) > MAX_LEVEL) {
    skipped += 1;
    continue;
  }

  // Artifact quality is a later expansion's idea. The three Warglaives are the
  // only things in here wearing it.
  if (num(row.OverallQualityID) > 5) {
    skipped += 1;
    continue;
  }

  const ilvl = num(row.ItemLevel);
  const quality = num(row.OverallQualityID);
  const budgetRow = rand.get(ilvl);
  const column = BUDGET_COLUMN[inv];
  const budget = budgetRow && column !== undefined ? num(budgetRow[`${BAND[quality]}_${column}`]) : 0;

  const stats = {};
  const resistances = {};
  for (let i = 0; i < 10; i += 1) {
    const statId = num(row[`StatModifier_bonusStat_${i}`]);
    const share = num(row[`StatPercentEditor_${i}`]);
    if (statId <= 0 || share <= 0 || budget <= 0) continue;
    const value = Math.round((share * budget) / 10000);
    if (value <= 0) continue;
    const key = STAT_ID[statId];
    const rating = RATING_ID[statId];
    const resist = RESIST_ID[statId];
    if (key) stats[key] = (stats[key] ?? 0) + value;
    else if (rating) {
      for (const [field, per] of Object.entries(rating)) {
        stats[field] = Math.round(((stats[field] ?? 0) + value / per) * 100) / 100;
      }
    } else if (resist) resistances[resist] = (resistances[resist] ?? 0) + value;
    else unknownStats.set(statId, (unknownStats.get(statId) ?? 0) + 1);
  }

  const entry = {
    id,
    name: row.Display_lang,
    ilvl,
    quality,
    equipLoc,
    stats,
  };

  const subType = subclasses.get(`${num(item.ClassID)}/${num(item.SubclassID)}`);
  if (subType) entry.subType = subType;
  if (Object.keys(resistances).length) entry.resistances = resistances;
  if (num(row.MaxCount) === 1) entry.unique = true;
  if (setOf.has(id)) entry.set = setOf.get(id);

  const allowable = num(row.AllowableClass);
  if (allowable > 0 && allowable !== -1) {
    const classes = Object.entries(CLASS_BIT)
      .filter(([bit]) => (allowable & Number(bit)) !== 0)
      .map(([, name]) => name);
    if (classes.length && classes.length < 9) entry.classes = classes;
  }

  // The weapon, worked out from its speed, its item level and its quality the
  // way the client does when it draws the tooltip.
  if (num(item.ClassID) === WEAPON_CLASS && num(row.ItemDelay) > 0) {
    const table = damageTableFor(item, row);
    const dpsRow = table?.get(ilvl);
    const dps = dpsRow ? num(dpsRow[`Quality_${quality}`]) : 0;
    const speed = num(row.ItemDelay) / 1000;
    const variance = num(row.DmgVariance);
    if (dps > 0 && speed > 0) {
      const average = dps * speed;
      entry.weapon = {
        min: Math.floor(average * (1 - variance / 2)),
        max: Math.ceil(average * (1 + variance / 2)),
        speed,
        type: subType ?? '',
      };
    }
  }

  // Armor, which is the material's share of the item level total, scaled by
  // quality and by how much of the body the piece covers.
  if (num(item.ClassID) === ARMOR_CLASS) {
    const material = ARMOR_MATERIAL[num(item.SubclassID)];
    const total = armorTotal.get(ilvl);
    const qualityRow = armorQuality.get(ilvl);
    const location = armorLocation.get(inv);
    if (material && total && qualityRow && location) {
      const armor = num(total[`${material}Modifier`])
        * num(qualityRow[`Qualitymod_${quality}`])
        * num(location[`${material}modifier`]);
      if (armor > 0) entry.stats.armor = (entry.stats.armor ?? 0) + Math.round(armor);
    }
  }

  out.push(entry);
}

const file = {
  v: 1,
  source: `WoW Forever client tables, build ${build}, via wago.tools. Stats, weapon damage and ` +
    `armor are worked out from the client's budget tables rather than read off a tooltip.`,
  items: out,
  sets: setList,
};

if (!existsSync(dirname(OUT))) throw new Error('public/data is missing');
writeFileSync(OUT, JSON.stringify(file));

const weapons = out.filter((i) => i.weapon).length;
console.log(`wrote ${out.length} items (${weapons} weapons, ${setList.length} sets) from build ${build}`);
console.log(`left out ${skipped} the client keeps for itself: test gear, deprecated pieces and the like`);
if (unknownStats.size) {
  const list = [...unknownStats.entries()].sort((a, b) => b[1] - a[1]).map(([id, n]) => `${id}x${n}`);
  console.log(`stat ids this script does not know, left out: ${list.join(' ')}`);
}
