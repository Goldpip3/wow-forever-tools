/**
 * Reads what the addon exported.
 *
 * Built the same way as src/raid/groupbuilder.ts: take what can be read, put
 * everything else on a skipped list with a reason, and never throw. A character
 * with one unreadable ring is still worth simulating.
 */

import type { ClassTalents } from '../talents/types';
import { CLASS_IDS, type ClassId } from '../shared/classes';
import type {
  CharacterExport, ItemRef, SheetStats, StatBlock, TalentTabExport, WeaponHands, WeaponInfo,
} from './export-format';
import {
  EXPORT_PREFIX, EXPORT_VERSION, SCHOOLS, SLOTS, isStatKey, stripPrefix, type School, type Slot,
} from './export-format';
import type { Character, ImportIssue, ImportResult } from './types';
import { canUse } from './proficiency';
import { buildCodeFromExport, specIdFromTabs, talentRanksFromExport } from './talents';

function num(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

/** A quick look at a pasted blob, so the import box can tell the formats apart. */
export function looksLikeCharacterExport(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const obj = value as Record<string, unknown>;
  return 'v' in obj && 'classId' in obj && ('equipped' in obj || 'stats' in obj);
}

/* stripPrefix moved beside the prefix it strips, so the guild page can unwrap a paste
   without pulling this whole file in. Re-exported for the callers already here. */
export { stripPrefix };

/* -------------------------------------------------------------------- items */

function readWeapon(raw: unknown): WeaponInfo | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const w = raw as Record<string, unknown>;
  const speed = num(w.speed);
  const min = num(w.min);
  const max = num(w.max);
  if (speed <= 0 || max <= 0) return undefined;
  const hands = str(w.hands, 'one') as WeaponHands;
  return {
    min,
    max: Math.max(min, max),
    speed,
    type: str(w.type),
    hands: (['one', 'two', 'main', 'off', 'ranged'] as string[]).includes(hands) ? hands : 'one',
  };
}

function readStats(raw: unknown, onUnknown: (key: string) => void): StatBlock {
  const out: StatBlock = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!isStatKey(key)) {
      onUnknown(key);
      continue;
    }
    const n = num(value);
    if (n !== 0) out[key] = n;
  }
  return out;
}

function readResistances(raw: unknown): Partial<Record<School, number>> | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const out: Partial<Record<School, number>> = {};
  let any = false;
  for (const school of SCHOOLS) {
    const n = num((raw as Record<string, unknown>)[school]);
    if (n !== 0) {
      out[school] = n;
      any = true;
    }
  }
  return any ? out : undefined;
}

interface ItemReadResult {
  item?: ItemRef;
  issues: ImportIssue[];
}

function readItem(raw: unknown, where: ItemRef['location']['where'], slot?: Slot): ItemReadResult {
  const issues: ImportIssue[] = [];
  if (!raw || typeof raw !== 'object') {
    return { issues: [{ name: slot ?? '(unnamed)', reason: 'not an item' }] };
  }

  const obj = raw as Record<string, unknown>;
  const name = str(obj.name).trim();
  const id = Math.round(num(obj.id));
  const equipLoc = str(obj.equipLoc).trim();
  const label = name || (id ? 'item ' + id : '(unnamed)');

  if (!id) return { issues: [{ name: label, reason: 'no item id' }] };
  if (!name) return { issues: [{ name: label, reason: 'no item name' }] };
  if (!equipLoc) return { issues: [{ name: label, reason: 'no equip slot' }] };

  const stats = readStats(obj.stats, (key) => {
    issues.push({ name: label, reason: 'stat this site does not know: ' + key });
  });

  const weapon = readWeapon(obj.weapon);
  // weaponDps is the one stat the addon never sends; it comes off the damage line.
  if (weapon && weapon.speed > 0) {
    stats.weaponDps = Math.round(((weapon.min + weapon.max) / 2 / weapon.speed) * 100) / 100;
  }

  const location: ItemRef['location'] = { where };
  if (slot) location.slot = slot;
  if (obj.bag !== undefined) location.bag = Math.round(num(obj.bag));
  if (obj.index !== undefined) location.index = Math.round(num(obj.index));

  const item: ItemRef = {
    id,
    name,
    equipLoc,
    quality: Math.round(num(obj.quality)),
    stats,
    location,
  };

  const link = str(obj.link);
  if (link) item.link = link;
  const subType = str(obj.subType);
  if (subType) item.subType = subType;
  const ilvl = Math.round(num(obj.ilvl));
  if (ilvl > 0) item.ilvl = ilvl;
  const icon = str(obj.icon);
  if (icon) item.icon = icon;
  if (weapon) item.weapon = weapon;

  const resistances = readResistances(obj.resistances);
  if (resistances) item.resistances = resistances;

  if (obj.weaponSkill && typeof obj.weaponSkill === 'object') {
    const skills: Record<string, number> = {};
    for (const [k, v] of Object.entries(obj.weaponSkill as Record<string, unknown>)) {
      const n = num(v);
      if (n !== 0) skills[k] = n;
    }
    if (Object.keys(skills).length) item.weaponSkill = skills;
  }

  const enchant = Math.round(num(obj.enchant));
  if (enchant > 0) item.enchant = enchant;
  const suffix = Math.round(num(obj.suffix));
  if (suffix !== 0) item.suffix = suffix;
  if (obj.unique === true) item.unique = true;
  const setName = str(obj.setName);
  if (setName) item.setName = setName;
  if (Array.isArray(obj.effects)) {
    const effects = obj.effects.filter((e): e is string => typeof e === 'string' && e.trim() !== '');
    if (effects.length) item.effects = effects;
  }

  return { item, issues };
}

/* -------------------------------------------------------------------- sheet */

function readSheet(raw: unknown): SheetStats {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;

  const perSchool = (value: unknown): Partial<Record<School, number>> => {
    const out: Partial<Record<School, number>> = {};
    if (!value || typeof value !== 'object') return out;
    for (const school of SCHOOLS) {
      const n = num((value as Record<string, unknown>)[school]);
      if (n !== 0) out[school] = n;
    }
    return out;
  };

  const weapon = (value: unknown) => {
    if (!value || typeof value !== 'object') return undefined;
    const w = value as Record<string, unknown>;
    const speed = num(w.speed);
    if (speed <= 0) return undefined;
    return { min: num(w.min), max: num(w.max), speed };
  };

  const sheet: SheetStats = {
    strength: num(obj.strength),
    agility: num(obj.agility),
    stamina: num(obj.stamina),
    intellect: num(obj.intellect),
    spirit: num(obj.spirit),
    attackPower: num(obj.attackPower),
    rangedAttackPower: num(obj.rangedAttackPower),
    meleeCrit: num(obj.meleeCrit),
    rangedCrit: num(obj.rangedCrit),
    spellCrit: perSchool(obj.spellCrit),
    spellPower: perSchool(obj.spellPower),
    healing: num(obj.healing),
    mana: num(obj.mana),
    health: num(obj.health),
    armor: num(obj.armor),
  };

  // Absent means the client had no API for it, which is different from zero.
  if (obj.hit !== undefined && obj.hit !== null) sheet.hit = num(obj.hit);
  if (obj.spellHit !== undefined && obj.spellHit !== null) sheet.spellHit = num(obj.spellHit);

  const mh = weapon(obj.mainhand);
  if (mh) sheet.mainhand = mh;
  const oh = weapon(obj.offhand);
  if (oh) sheet.offhand = oh;
  const ranged = weapon(obj.ranged);
  if (ranged) sheet.ranged = ranged;

  return sheet;
}

function readTabs(raw: unknown): TalentTabExport[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((tab): tab is Record<string, unknown> => !!tab && typeof tab === 'object')
    .map((tab) => ({
      tab: str(tab.tab),
      points: Math.round(num(tab.points)),
      list: Array.isArray(tab.list)
        ? tab.list
            .filter((t): t is Record<string, unknown> => !!t && typeof t === 'object')
            .map((t) => ({
              name: str(t.name),
              tier: Math.round(num(t.tier)),
              column: Math.round(num(t.column)),
              rank: Math.round(num(t.rank)),
              max: Math.round(num(t.max, 1)),
            }))
        : [],
    }));
}

/* ------------------------------------------------------------------- import */

/**
 * Parses an addon export. Pass the class's talent data when it is loaded and
 * the result carries a build code the calculator can open; without it the
 * character still imports and the code fills in on the next draw.
 */
export function parseCharacterExport(raw: string, cls?: ClassTalents): ImportResult {
  const text = stripPrefix(raw);
  if (!text) return { skipped: [], warnings: [], error: 'Nothing to read. Paste the export from the addon.' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      skipped: [],
      warnings: [],
      error: 'That is not JSON. Copy the whole box from the addon, starting at ' + EXPORT_PREFIX + '.',
    };
  }

  return parseCharacterValue(parsed, cls);
}

/** The same read, for a payload that has already been through JSON.parse. */
export function parseCharacterValue(parsed: unknown, cls?: ClassTalents): ImportResult {
  const skipped: ImportIssue[] = [];
  const warnings: string[] = [];

  if (!looksLikeCharacterExport(parsed)) {
    return { skipped, warnings, error: 'That JSON is not a character export from the sync addon.' };
  }

  const obj = parsed as Record<string, unknown>;
  const version = Math.round(num(obj.v));
  if (version > EXPORT_VERSION) {
    return {
      skipped,
      warnings,
      error:
        'That export came from a newer addon (version ' + version + ') than this site reads (' +
        EXPORT_VERSION + '). Update the site or export from an older addon.',
    };
  }
  if (version < 1) {
    return { skipped, warnings, error: 'That export has no version number, so it cannot be read safely.' };
  }

  const classId = str(obj.classId).toLowerCase() as ClassId;
  if (!(CLASS_IDS as readonly string[]).includes(classId)) {
    return { skipped, warnings, error: 'Unknown class: ' + str(obj.classId, '(none)') };
  }

  const tabs = readTabs(obj.talents);
  const sheet = readSheet(obj.stats);

  const equipped: Partial<Record<Slot, ItemRef>> = {};
  const rawEquipped = (obj.equipped && typeof obj.equipped === 'object' ? obj.equipped : {}) as Record<string, unknown>;
  for (const slot of SLOTS) {
    const entry = rawEquipped[slot];
    if (entry === undefined || entry === null) continue;
    const { item, issues } = readItem(entry, 'equipped', slot);
    skipped.push(...issues);
    if (item) equipped[slot] = item;
  }

  const readList = (value: unknown, where: 'bag' | 'bank'): ItemRef[] => {
    if (!Array.isArray(value)) return [];
    const out: ItemRef[] = [];
    for (const entry of value) {
      const { item, issues } = readItem(entry, where);
      skipped.push(...issues);
      if (item) out.push(item);
    }
    return out;
  };

  const bags = readList(obj.bags, 'bag');
  const bank = readList(obj.bank, 'bank');

  const skills: Record<string, number> = {};
  if (obj.skills && typeof obj.skills === 'object') {
    for (const [k, v] of Object.entries(obj.skills as Record<string, unknown>)) {
      const n = num(v);
      if (n !== 0) skills[k] = n;
    }
  }

  const source: CharacterExport = {
    v: version,
    addonVersion: str(obj.addonVersion, 'unknown'),
    generatedAt: Math.round(num(obj.generatedAt)),
    name: str(obj.name).trim() || 'Unnamed',
    realm: str(obj.realm).trim(),
    classId,
    level: Math.round(num(obj.level, 60)),
    race: str(obj.race),
    talents: tabs,
    stats: sheet,
    skills,
    equipped,
    bags,
    bank,
  };

  // From export version 2. An older addon simply has none, which is not the same
  // as a character who has learned nothing, so the field stays absent.
  if (Array.isArray(obj.professions)) {
    const professions = obj.professions
      .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object')
      .map((p) => ({ key: str(p.key), skill: Math.round(num(p.skill)) }))
      .filter((p) => p.key !== '' && p.skill > 0);
    if (professions.length) source.professions = professions;
  }

  const faction = str(obj.faction);
  if (faction) source.faction = faction;
  if (Array.isArray(obj.activeBuffs)) {
    source.activeBuffs = obj.activeBuffs.filter((b): b is string => typeof b === 'string');
  }
  if (obj.bankStale === true) source.bankStale = true;
  if (obj.partial === true) source.partial = true;

  // Only keep what this class could actually put on.
  const owned: ItemRef[] = [];
  for (const item of [...Object.values(equipped), ...bags, ...bank]) {
    if (!item) continue;
    const verdict = canUse(classId, item);
    if (verdict.usable) owned.push(item);
    else if (item.location.where === 'equipped') owned.push(item); // worn, so it is usable whatever the table says
    else skipped.push({ name: item.name, reason: verdict.reason ?? 'not usable' });
  }

  const character: Character = {
    source,
    classId,
    specId: specIdFromTabs(classId, tabs),
    build: cls ? buildCodeFromExport(classId, tabs, cls, source.level) : '',
    talentRanks: talentRanksFromExport(tabs),
    owned,
  };

  if (!Object.keys(equipped).length) warnings.push('No equipped gear came through, so the stat baseline is the sheet alone.');
  if (source.bankStale) warnings.push('The bank list is from an earlier visit and may be out of date.');
  if (source.partial) warnings.push('The addon could not read everything. Open the bank, wait for item data and export again.');
  if (source.activeBuffs?.length) {
    warnings.push(
      'You exported with ' + source.activeBuffs.length +
      ' buffs up, so the sheet already includes them. Export unbuffed for the cleanest result.',
    );
  }
  if (sheet.spellHit === undefined && sheet.hit === undefined) {
    warnings.push('The client reported no hit rating, so hit comes from gear alone.');
  }

  return { character, skipped, warnings };
}
