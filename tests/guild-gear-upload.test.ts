import { describe, expect, it } from 'vitest';
import { EXPORT_PREFIX, SLOTS, STAT_KEYS } from '../src/dps/export-format';
import {
  MAX_PASTE_CHARS,
  SHEET_STAT_KEYS,
  sheetStats,
  talentTabs,
  wornItem,
  wornSet,
} from '../src/guild/gear-upload';
import { readPaste } from '../src/guild/paste';

/**
 * A canary is a string that has no business leaving the machine. Every test
 * here hides one somewhere in an export and then asserts it is not in what
 * would be sent.
 *
 * Dropping the bags and the bank was the first version of this, and it was not
 * enough: `equipped` and `talents` were forwarded whole, so anything nested
 * inside an item went with them.
 */
const CANARY = 'CANARY-do-not-send-this';

function exportOf(over: Record<string, unknown> = {}): string {
  return (
    EXPORT_PREFIX +
    JSON.stringify({
      v: 3,
      addonVersion: '1.3.0',
      generatedAt: 1_790_000_000,
      name: 'Thrallsbane',
      ruleset: 'normal',
      classId: 'warrior',
      level: 60,
      race: 'Orc',
      talents: [{ tab: 'Protection', points: 31, list: [] }],
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
      ...over,
    })
  );
}

function sentFor(over: Record<string, unknown> = {}): string {
  const result = readPaste(exportOf(over));
  if (!result.ok) throw new Error('the paste was refused: ' + result.error);
  return JSON.stringify(result.reading.upload);
}

describe('a canary hidden in an export', () => {
  it('does not survive an unknown field on an item', () => {
    const sent = sentFor({
      equipped: {
        head: { id: 1, name: 'Lionheart Helm', equipLoc: 'INVTYPE_HEAD', quality: 4, stats: {}, note: CANARY },
      },
    });
    expect(sent).not.toContain(CANARY);
    expect(sent).toContain('Lionheart Helm');
  });

  it('does not survive the raw item link, which nothing here reads', () => {
    const sent = sentFor({
      equipped: {
        head: { id: 1, name: 'Helm', equipLoc: 'INVTYPE_HEAD', quality: 4, stats: {}, link: '|cff0070dd|Hitem:1:' + CANARY },
      },
    });
    expect(sent).not.toContain(CANARY);
  });

  it('does not survive where an item was sitting', () => {
    const sent = sentFor({
      equipped: {
        head: {
          id: 1,
          name: 'Helm',
          equipLoc: 'INVTYPE_HEAD',
          quality: 4,
          stats: {},
          location: { where: 'bank', bag: 3, index: 7 },
        },
      },
    });
    expect(sent).not.toContain('bank');
    expect(sent).not.toContain('index');
  });

  it('does not survive an unknown stat key on an item', () => {
    const sent = sentFor({
      equipped: {
        head: { id: 1, name: 'Helm', equipLoc: 'INVTYPE_HEAD', quality: 4, stats: { strength: 10, [CANARY]: 5 } },
      },
    });
    expect(sent).not.toContain(CANARY);
    expect(sent).toContain('strength');
  });

  it('does not survive a slot this site does not know', () => {
    const sent = sentFor({
      equipped: {
        head: { id: 1, name: 'Helm', equipLoc: 'INVTYPE_HEAD', quality: 4, stats: {} },
        tabard: { id: 2, name: CANARY, equipLoc: 'INVTYPE_TABARD', quality: 1, stats: {} },
      },
    });
    expect(sent).not.toContain(CANARY);
  });

  it('does not survive a talent entry', () => {
    const sent = sentFor({
      talents: [
        {
          tab: 'Protection',
          points: 31,
          list: [{ name: 'Shield Slam', tier: 7, column: 2, rank: 1, max: 1, note: CANARY }],
          note: CANARY,
        },
      ],
    });
    expect(sent).not.toContain(CANARY);
    expect(sent).toContain('Shield Slam');
  });

  it('does not survive an unknown key on the character sheet', () => {
    const sent = sentFor({ stats: { strength: 200, [CANARY]: 1 } });
    expect(sent).not.toContain(CANARY);
  });

  it('does not survive the buff list or the weapon skills, which are not sent at all', () => {
    const sent = sentFor({ activeBuffs: [CANARY], skills: { [CANARY]: 300 } });
    expect(sent).not.toContain(CANARY);
  });
});

describe('an item, field by field', () => {
  it('keeps what the sheet and the tooltip draw', () => {
    const item = wornItem({
      id: 19019,
      name: 'Thunderfury, Blessed Blade of the Windseeker',
      icon: 'inv_sword_39',
      quality: 5,
      ilvl: 80,
      subType: 'One-Handed Swords',
      unique: true,
      setName: '',
      stats: { agility: 5, stamina: 8 },
      weapon: { min: 82, max: 153, speed: 1.9, type: 'One-Handed Swords', hands: 'one' },
      effects: ['Chance on hit: Blasts your enemy with lightning.'],
    });
    expect(item).toEqual({
      id: 19019,
      name: 'Thunderfury, Blessed Blade of the Windseeker',
      icon: 'inv_sword_39',
      quality: 5,
      ilvl: 80,
      subType: 'One-Handed Swords',
      unique: true,
      stats: { agility: 5, stamina: 8 },
      weapon: { min: 82, max: 153, speed: 1.9 },
      effects: ['Chance on hit: Blasts your enemy with lightning.'],
    });
  });

  it('refuses an item with no name, because a square with a number is not readable', () => {
    expect(wornItem({ id: 5, quality: 4, stats: {} })).toBeNull();
    expect(wornItem(null)).toBeNull();
    expect(wornItem([1, 2])).toBeNull();
  });

  it('drops a stat that is not a finite number', () => {
    const item = wornItem({
      id: 1,
      name: 'Helm',
      quality: 4,
      stats: { strength: Number.NaN, agility: Number.POSITIVE_INFINITY, stamina: 12 },
    });
    expect(item?.stats).toEqual({ stamina: 12 });
  });

  it('bounds the effect lines rather than storing an essay', () => {
    const item = wornItem({
      id: 1,
      name: 'Helm',
      quality: 4,
      stats: {},
      effects: Array.from({ length: 50 }, () => 'x'.repeat(2000)),
    });
    expect(item?.effects).toHaveLength(12);
    expect(item?.effects?.[0]).toHaveLength(240);
  });

  it('drops a weapon line that is missing a number rather than half-drawing it', () => {
    const item = wornItem({ id: 1, name: 'Sword', quality: 4, stats: {}, weapon: { min: 10 } });
    expect(item?.weapon).toBeUndefined();
  });
});

describe('the lists this page is written against', () => {
  it('covers the seventeen slots the sheet draws, and no others', () => {
    const worn = Object.fromEntries(
      SLOTS.map((slot) => [slot, { id: 1, name: slot, quality: 1, stats: {} }]),
    );
    expect(Object.keys(wornSet(worn))).toHaveLength(17);
  });

  it('keeps every sheet stat key it names and nothing else', () => {
    const everything = Object.fromEntries([...SHEET_STAT_KEYS, 'something'].map((k) => [k, 1]));
    expect(Object.keys(sheetStats(everything)).sort()).toEqual([...SHEET_STAT_KEYS].sort());
  });

  it('names only stats the tooltip can draw', () => {
    // Every item stat key has to be one statLines() walks, or it is stored and
    // never seen, which is the thing this whole file is about.
    const item = wornItem({
      id: 1,
      name: 'Helm',
      quality: 4,
      stats: Object.fromEntries(STAT_KEYS.map((k) => [k, 3])),
    });
    expect(Object.keys(item?.stats ?? {})).toHaveLength(STAT_KEYS.length);
  });
});

describe('talents', () => {
  it('keeps the trees and their picks', () => {
    expect(
      talentTabs([
        { tab: 'Protection', points: 31, list: [{ name: 'Toughness', tier: 3, column: 1, rank: 5, max: 5 }] },
      ]),
    ).toEqual([
      { tab: 'Protection', points: 31, list: [{ name: 'Toughness', tier: 3, column: 1, rank: 5, max: 5 }] },
    ]);
  });

  it('drops a pick with a number outside the talent grid', () => {
    const tabs = talentTabs([
      { tab: 'Arms', points: 5, list: [{ name: 'Nowhere', tier: 99, column: 1, rank: 1, max: 1 }] },
    ]);
    expect(tabs[0]?.list).toEqual([]);
  });

  it('answers empty for anything that is not a list of trees', () => {
    expect(talentTabs(undefined)).toEqual([]);
    expect(talentTabs('Protection')).toEqual([]);
    expect(talentTabs([null, 3])).toEqual([]);
  });
});

describe('the size of a paste', () => {
  it('refuses one longer than an export can be, before parsing any of it', () => {
    const result = readPaste('x'.repeat(MAX_PASTE_CHARS + 1));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('/wfsync');
  });

  it('still reads a real export, which is nowhere near that', () => {
    expect(readPaste(exportOf()).ok).toBe(true);
  });
});
