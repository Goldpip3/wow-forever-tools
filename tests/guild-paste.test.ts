import { describe, expect, it } from 'vitest';
import { EXPORT_PREFIX, EXPORT_VERSION } from '../src/dps/export-format';
import { namesDiffer, readPaste, readProfessions, readRuleset } from '../src/guild/paste';

/** The smallest export that passes the shape check. */
function exportOf(over: Record<string, unknown> = {}): string {
  return (
    EXPORT_PREFIX +
    JSON.stringify({
      v: 2,
      addonVersion: '1.2.0',
      generatedAt: 1_790_000_000,
      name: 'Thrallsbane',
      realm: 'Nightslayer',
      classId: 'warrior',
      level: 60,
      race: 'Orc',
      talents: [{ tab: 'Arms', points: 31, list: [] }],
      stats: { strength: 200 },
      skills: { Swords: 300 },
      equipped: {
        head: {
          id: 12640,
          name: 'Lionheart Helm',
          equipLoc: 'INVTYPE_HEAD',
          quality: 4,
          stats: { strength: 18 },
          location: { where: 'equipped' },
        },
      },
      bags: [{ id: 1, equipLoc: 'INVTYPE_HEAD', stats: {}, location: { where: 'bag' } }],
      bank: [{ id: 2, equipLoc: 'INVTYPE_HEAD', stats: {}, location: { where: 'bank' } }],
      ...over,
    })
  );
}

describe('what gets sent', () => {
  it('reads a whole export', () => {
    const result = readPaste(exportOf());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.reading.name).toBe('Thrallsbane');
    expect(result.reading.ruleset).toBeNull();
    expect(result.reading.classId).toBe('warrior');
    expect(result.reading.level).toBe(60);
    expect(result.reading.upload.equipped.head?.name).toBe('Lionheart Helm');
  });

  it('never sends the bags or the bank', () => {
    const result = readPaste(exportOf());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const sent = JSON.stringify(result.reading.upload);
    expect(sent).not.toContain('bags');
    expect(sent).not.toContain('bank');
    expect(Object.keys(result.reading.upload).sort()).toEqual([
      'addonVersion',
      'equipped',
      'generatedAt',
      'level',
      'name',
      'professions',
      'race',
      'ruleset',
      'stats',
      'talents',
      'v',
    ]);
  });

  it('keeps only the numbers out of the sheet', () => {
    const result = readPaste(exportOf({ stats: { strength: 200, note: 'hello', agility: 1.5 } }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.reading.upload.stats).toEqual({ strength: 200, agility: 1.5 });
  });

  it('takes the paste with or without its prefix, and out of a code fence', () => {
    const body = exportOf().slice(EXPORT_PREFIX.length);
    expect(readPaste(body).ok).toBe(true);
    expect(readPaste('```\n' + exportOf() + '\n```').ok).toBe(true);
    expect(readPaste('  ' + exportOf() + '  ').ok).toBe(true);
  });

  it('notices when the addon said the read was incomplete', () => {
    const result = readPaste(exportOf({ partial: true }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.reading.partial).toBe(true);
  });
});

describe('what it refuses, and what it says', () => {
  it('refuses an empty box, and says where to get one', () => {
    const result = readPaste('   ');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('/wfsync');
  });

  it('refuses something that is not JSON, naming the prefix to look for', () => {
    const result = readPaste('hello there');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain(EXPORT_PREFIX);
  });

  it('refuses JSON that is not a character', () => {
    const result = readPaste(JSON.stringify({ hello: 'world' }));
    expect(result.ok).toBe(false);
  });

  it('refuses an export from an addon newer than this site reads', () => {
    const result = readPaste(exportOf({ v: EXPORT_VERSION + 1 }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain(String(EXPORT_VERSION + 1));
  });

  it('still reads version 1, which has no professions', () => {
    const result = readPaste(exportOf({ v: 1, professions: undefined }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Absent is not the same as "has learned none", and the page says so.
    expect(result.reading.professions).toEqual([]);
  });
});

describe('the professions the addon now sends', () => {
  it('reads them off a version 2 export', () => {
    const result = readPaste(
      exportOf({
        professions: [
          { key: 'mining', skill: 300 },
          { key: 'blacksmithing', skill: 285 },
        ],
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.reading.professions).toEqual([
      { key: 'mining', skill: 300 },
      { key: 'blacksmithing', skill: 285 },
    ]);
  });

  it('drops a key this site does not know', () => {
    expect(readProfessions([{ key: 'poisons', skill: 300 }])).toEqual([]);
  });

  it('drops a repeat', () => {
    expect(readProfessions([{ key: 'mining', skill: 300 }, { key: 'mining', skill: 1 }])).toEqual([
      { key: 'mining', skill: 300 },
    ]);
  });

  it('keeps the profession but drops a skill outside the game’s range', () => {
    expect(readProfessions([{ key: 'mining', skill: 9000 }])).toEqual([
      { key: 'mining', skill: null },
    ]);
  });

  it('answers empty for anything that is not a list', () => {
    expect(readProfessions(undefined)).toEqual([]);
    expect(readProfessions('mining')).toEqual([]);
    expect(readProfessions([null, 3, 'x'])).toEqual([]);
  });
});

describe('checking the paste is of this character', () => {
  it('says nothing when the names match, whatever the capitals', () => {
    expect(namesDiffer('Thrallsbane', 'thrallsbane')).toBe(false);
    expect(namesDiffer('Thrallsbane', 'Thrallsbane')).toBe(false);
  });

  it('flags a different character', () => {
    expect(namesDiffer('Thrallsbane', 'Nimblefoot')).toBe(true);
  });

  it('does not flag an export that carries no name', () => {
    expect(namesDiffer('Thrallsbane', '')).toBe(false);
  });
});

describe('the ruleset, which Forever has instead of realms', () => {
  it('reads each of the four Blizzard named, however it is cased', () => {
    for (const [sent, expected] of [
      ['normal', 'normal'],
      ['PvP', 'pvp'],
      ['Roleplaying', 'roleplaying'],
      ['HARDCORE', 'hardcore'],
    ]) {
      expect(readRuleset(sent)).toBe(expected);
    }
  });

  it('drops a realm name, which is what the client actually offers', () => {
    // GetRealmName still answers on Forever, with a backend pool string like
    // "Classic Beta PvP 2" that changes between sessions. Storing it would claim
    // an identity the client does not have.
    expect(readRuleset('Classic Beta PvP 2')).toBeNull();
    expect(readRuleset('Nightslayer')).toBeNull();
  });

  it('drops anything that is not a string', () => {
    for (const bad of [undefined, null, 3, {}, []]) expect(readRuleset(bad)).toBeNull();
  });

  it('comes through a paste', () => {
    const result = readPaste(exportOf({ v: 3, ruleset: 'pvp' }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.reading.ruleset).toBe('pvp');
    expect(result.reading.upload.ruleset).toBe('pvp');
  });

  it('is absent rather than guessed when the export has none', () => {
    const result = readPaste(exportOf({ v: 3 }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.reading.ruleset).toBeNull();
  });
});
