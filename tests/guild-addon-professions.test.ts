import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EXPORT_VERSION } from '../src/dps/export-format';
import { PROFESSIONS, PROFESSION_KEYS } from '../src/guild/professions';

/**
 * The addon and the site each hold the twelve professions, and they have to agree.
 *
 * A key the addon sends that the site does not know is silently dropped on the way in,
 * which reads as a profession that will not save however many times somebody tries. So
 * the Lua table is read off disk and compared rather than trusted.
 */

const LUA = readFileSync(resolve(__dirname, '../addon/WoWForeverSync/export.lua'), 'utf8');

/** The `['Skill Name'] = 'key',` rows out of the addon's PROFESSIONS table. */
function addonProfessions(): Map<string, string> {
  const block = /local PROFESSIONS = \{([\s\S]*?)\n\}/.exec(LUA);
  if (!block) throw new Error('PROFESSIONS table not found in export.lua');
  const rows = new Map<string, string>();
  for (const line of block[1].split('\n')) {
    const match = /\['([^']+)'\]\s*=\s*'([^']+)'/.exec(line);
    if (match) rows.set(match[1], match[2]);
  }
  return rows;
}

describe('the addon and the site agree on the professions', () => {
  const addon = addonProfessions();

  it('reads twelve of them out of the addon', () => {
    expect(addon.size).toBe(12);
  });

  it('sends only keys the site knows', () => {
    for (const key of addon.values()) {
      expect(PROFESSION_KEYS as readonly string[]).toContain(key);
    }
  });

  it('covers every key the site knows', () => {
    const sent = new Set(addon.values());
    for (const key of PROFESSION_KEYS) expect(sent.has(key)).toBe(true);
  });

  it('names each one the way the site does, which is the way the game does', () => {
    // The addon matches on the in-game skill name, so the two spellings are the
    // same string and a change to one has to be a change to both.
    for (const [gameName, key] of addon) {
      expect(PROFESSIONS[key as keyof typeof PROFESSIONS].name).toBe(gameName);
    }
  });
});

describe('the export version moves with the format', () => {
  it('matches the version the addon writes', () => {
    const match = /export\.VERSION = (\d+)/.exec(LUA);
    expect(match).toBeTruthy();
    expect(Number(match![1])).toBe(EXPORT_VERSION);
  });

  it('keeps professions out of the weapon skills, which they are not', () => {
    // readSkills skips anything in PROFESSIONS, or Blacksmithing would arrive as a
    // weapon skill and be scored as one.
    expect(LUA).toContain('not PROFESSIONS[name]');
  });
});

describe('professions read on both engines', () => {
  /**
   * Forever reports interface 16001 but is the retail client underneath, where
   * GetNumSkillLines and GetSkillLineInfo do not exist. The first version of this
   * feature used only those, so professions came back empty for every Forever
   * player while working perfectly on Classic Era.
   */
  it('keeps the skill-list path, which is how Classic Era holds them', () => {
    expect(LUA).toContain('function professionsFromSkillLines()');
    expect(LUA).toContain('GetNumSkillLines');
    expect(LUA).toContain('GetSkillLineInfo');
  });

  it('keeps the slot path, which is the only one Forever has', () => {
    expect(LUA).toContain('function professionsFromSlots()');
    expect(LUA).toContain('GetProfessions');
    expect(LUA).toContain('GetProfessionInfo');
  });

  it('chooses between them on whether the API is there, not on a version number', () => {
    // GetBuildInfo returns 16001 for Forever, so any "is this the modern client"
    // test on that number reads as Classic and takes the wrong path.
    expect(LUA).toContain("if type(GetNumSkillLines) == 'function' then return professionsFromSkillLines() end");
    expect(LUA).toContain("if type(GetProfessions) == 'function' then return professionsFromSlots() end");
    expect(LUA).not.toMatch(/GetBuildInfo[\s\S]{0,200}professionsFrom/);
  });

  it('walks profession slots by position, because an empty one is a gap', () => {
    // ipairs would stop at the first nil and lose everything after it, which for
    // somebody with one profession and Cooking is most of the answer.
    const slots = /function professionsFromSlots\(\)([\s\S]*?)\nend/.exec(LUA);
    expect(slots).toBeTruthy();
    expect(slots![1]).not.toContain('ipairs');
    expect(slots![1]).toContain('for i = 1,');
  });

  it('reports which path it took in the diagnostics', () => {
    // The bug was invisible until somebody asked why the field was empty.
    expect(LUA).toContain('professions via ');
  });

  it('probes both APIs, so diag names the missing one', () => {
    const probes = /local PROBES = \{([\s\S]*?)\n\}/.exec(LUA);
    expect(probes).toBeTruthy();
    for (const fn of ['GetNumSkillLines', 'GetSkillLineInfo', 'GetProfessions', 'GetProfessionInfo']) {
      expect(probes![1]).toContain(`'${fn}'`);
    }
  });
});
