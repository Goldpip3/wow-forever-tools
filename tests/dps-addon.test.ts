/**
 * The addon, run without a game.
 *
 * There is no Forever client to install it in, so the next best thing is to
 * load the real Lua files into a Lua virtual machine, stub the handful of WoW
 * functions they call, and check that what comes out is something the importer
 * can read. That covers the part most likely to rot: the contract between the
 * two halves.
 *
 * What it cannot check is whether the game words its tooltips the way the
 * harness does. The first real export will settle that.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lauxlib, lua, lualib, to_jsstring, to_luastring } from 'fengari';

import type { TalentData } from '../src/talents/types';
import { EXPORT_PREFIX } from '../src/dps/export-format';
import { ADDON_INFO } from '../src/dps/addon-info';
import { parseCharacterExport } from '../src/dps/importer';

const here = resolve(fileURLToPath(import.meta.url), '..');
const ADDON_DIR = resolve(here, '../addon/WoWForeverSync').replace(/\\/g, '/');
const HARNESS = readFileSync(resolve(here, 'fixtures/addon-harness.lua'), 'utf8');

const DATA = JSON.parse(
  readFileSync(resolve(here, '../public/data/talents.generated.json'), 'utf8'),
) as TalentData;

/** Loads the addon in a Lua virtual machine and returns the string it exports. */
function runAddon(): string {
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);

  lua.lua_pushstring(L, to_luastring(ADDON_DIR));
  lua.lua_setglobal(L, to_luastring('ADDON_DIR'));

  const loaded = lauxlib.luaL_loadbuffer(L, to_luastring(HARNESS), null, to_luastring('harness'));
  if (loaded !== lua.LUA_OK) {
    throw new Error('The addon would not parse: ' + to_jsstring(lua.lua_tostring(L, -1)));
  }

  const ran = lua.lua_pcall(L, 0, lua.LUA_MULTRET, 0);
  if (ran !== lua.LUA_OK) {
    throw new Error('The addon threw while running: ' + to_jsstring(lua.lua_tostring(L, -1)));
  }

  lua.lua_getglobal(L, to_luastring('RESULT'));
  const result = to_jsstring(lua.lua_tostring(L, -1));
  lua.lua_pop(L, 1);
  return result;
}

const EXPORTED = runAddon();

describe('the addon', () => {
  it('loads and produces an export', () => {
    expect(EXPORTED.startsWith(EXPORT_PREFIX)).toBe(true);
    expect(EXPORTED.length).toBeGreaterThan(200);
  });

  it('writes JSON the site accepts', () => {
    const result = parseCharacterExport(EXPORTED, DATA.talents.Mage!);
    expect(result.error).toBeUndefined();
    expect(result.character).toBeDefined();
  });

  it('gets the character right', () => {
    const c = parseCharacterExport(EXPORTED, DATA.talents.Mage!).character!;
    expect(c.classId).toBe('mage');
    expect(c.source.name).toBe('Frostweaver');
    expect(c.source.level).toBe(60);
    expect(c.source.race).toBe('Human');
  });

  it('reads the character sheet off the game', () => {
    const sheet = parseCharacterExport(EXPORTED).character!.source.stats;
    expect(sheet.intellect).toBe(382);
    expect(sheet.mana).toBe(6643);
    expect(sheet.spellPower.frost).toBe(394);
    expect(sheet.spellHit).toBe(3);
    expect(sheet.mainhand).toEqual({ min: 44, max: 82, speed: 2.2 });
  });

  it('pulls the stats off a tooltip the way the game words it', () => {
    const head = parseCharacterExport(EXPORTED).character!.source.equipped.head!;
    expect(head.name).toBe('Icecrown Circlet');
    expect(head.stats).toMatchObject({
      intellect: 24,
      stamina: 17,
      spirit: 9,
      spellPower: 30,
      spellCrit: 1,
      mp5: 6,
      armor: 65,
    });
    // Resistance has to be told apart from a plain stat line.
    expect(head.resistances).toEqual({ arcane: 10 });
  });

  it('reads a weapon, its speed and the skill it grants', () => {
    const weapon = parseCharacterExport(EXPORTED).character!.source.equipped.mainhand!;
    expect(weapon.weapon).toMatchObject({ min: 44, max: 82, speed: 2.2, hands: 'main' });
    expect(weapon.weaponSkill).toEqual({ Swords: 4 });
    // Worked out by the importer rather than sent.
    expect(weapon.stats.weaponDps).toBeCloseTo(28.64, 2);
  });

  it('keeps the enchant from the item link', () => {
    const head = parseCharacterExport(EXPORTED).character!.source.equipped.head!;
    expect(head.enchant).toBe(2504);
  });

  it('reads the bags, with what it could not parse kept as text', () => {
    const bags = parseCharacterExport(EXPORTED).character!.source.bags;
    expect(bags).toHaveLength(1);
    const crown = bags[0]!;
    expect(crown.name).toBe('Crown of the Frozen Wastes');
    expect(crown.stats.frostPower).toBe(40);
    expect(crown.stats.spellHit).toBe(1);
    expect(crown.unique).toBe(true);
    expect(crown.setName).toBe('Frostweave Regalia');
    expect(crown.effects).toEqual(['Use: Restores 500 mana.']);
    expect(crown.location).toMatchObject({ where: 'bag', bag: 0, index: 3 });
  });

  it('sends talents the site can turn into a build code', () => {
    const c = parseCharacterExport(EXPORTED, DATA.talents.Mage!).character!;
    expect(c.talentRanks['Improved Frostbolt']).toBe(5);
    expect(c.talentRanks["Winter's Chill"]).toBe(5);
    expect(c.build.startsWith('mage/60/')).toBe(true);
  });

  it('sends weapon skills', () => {
    const skills = parseCharacterExport(EXPORTED).character!.source.skills;
    expect(skills.Swords).toBe(300);
    // The header row is not a skill.
    expect(skills['Weapon Skills']).toBeUndefined();
  });

  it('says the bank was never read rather than pretending it is empty', () => {
    const source = parseCharacterExport(EXPORTED).character!.source;
    expect(source.bank).toEqual([]);
  });
});

/**
 * Reads a zip without a library: walk the local headers from the front, since
 * that is all this one has and the packer wrote it in order.
 */
function readZip(buffer: Buffer): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  let at = 0;
  while (at + 30 <= buffer.length && buffer.readUInt32LE(at) === 0x04034b50) {
    const compressedSize = buffer.readUInt32LE(at + 18);
    const nameLength = buffer.readUInt16LE(at + 26);
    const extraLength = buffer.readUInt16LE(at + 28);
    const name = buffer.subarray(at + 30, at + 30 + nameLength).toString('utf8');
    const start = at + 30 + nameLength + extraLength;
    out.set(name, inflateRawSync(buffer.subarray(start, start + compressedSize)));
    at = start + compressedSize;
  }
  return out;
}

describe('the packaged addon', () => {
  const zipPath = resolve(here, '../public/downloads/' + ADDON_INFO.name + '.zip');
  const zip = readFileSync(zipPath);
  const entries = readZip(zip);

  it('matches what the page says it is handing out', () => {
    expect(zip.length).toBe(ADDON_INFO.bytes);
    expect(entries.size).toBe(ADDON_INFO.files);
    expect(ADDON_INFO.file).toBe('downloads/' + ADDON_INFO.name + '.zip');
  });

  it('puts everything inside the addon folder, which is what the game needs', () => {
    for (const name of entries.keys()) {
      expect(name.startsWith(ADDON_INFO.name + '/')).toBe(true);
    }
  });

  it('carries exactly the files in the repository, byte for byte', () => {
    // A stale zip would hand people an addon that does not match the site.
    const sourceDir = resolve(here, '../addon/' + ADDON_INFO.name);
    const sources = readdirSync(sourceDir).sort();
    expect([...entries.keys()].sort()).toEqual(sources.map((n) => ADDON_INFO.name + '/' + n));

    for (const name of sources) {
      const onDisk = readFileSync(resolve(sourceDir, name));
      expect(entries.get(ADDON_INFO.name + '/' + name)!.equals(onDisk)).toBe(true);
    }
  });

  it('declares the version the table of contents declares', () => {
    const toc = readFileSync(resolve(here, '../addon/' + ADDON_INFO.name + '/' + ADDON_INFO.name + '.toc'), 'utf8');
    expect(toc).toContain('## Version: ' + ADDON_INFO.version);
    expect(toc).toContain('## Interface: ' + ADDON_INFO.interfaceVersion);
  });
});
