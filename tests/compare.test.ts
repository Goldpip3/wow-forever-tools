import { describe, expect, it } from 'vitest';
import {
  MAX_COMPARE,
  compareWarnings,
  encodeCompareHash,
  isCompareHash,
  parseCompareHash,
  summarise,
  type CompareEntry,
} from '../src/raid/compare';
import { computeCoverage, emptyRoster } from '../src/raid/engine';
import { createPlayer } from '../src/raid/loadout';
import { encodeRoster } from '../src/raid/codec';
import { readRosterLink } from '../src/raid/roster-mode';
import type { Roster } from '../src/raid/types';
import type { ClassId } from '../src/shared/classes';

function raid(size: 10 | 20 | 40, people: Array<[ClassId, number, string?]>): Roster {
  const roster = emptyRoster(size);
  people.forEach(([classId, specId, name], i) => {
    roster.groups[Math.floor(i / 5)]![i % 5] = createPlayer(classId, specId, name);
  });
  return roster;
}

function entry(name: string, roster: Roster): CompareEntry {
  return { name, code: encodeRoster(roster), roster };
}

describe('the compare link', () => {
  const a = raid(10, [['warrior', 161, 'Ragnar'], ['priest', 202, 'Benedict']]);
  const b = raid(10, [['mage', 61, 'Jaina'], ['druid', 282]]);

  it('round-trips names and codes, whatever is in the name', () => {
    const names = ['Tuesday. Group 1', 'Odd: name', 'a,b', '&roster=1&t=abc', 'Two  spaces'];
    for (const name of names) {
      const hash = encodeCompareHash([
        { name, code: encodeRoster(a) },
        { name: 'Other', code: encodeRoster(b) },
      ]);
      const back = parseCompareHash('#' + hash);
      expect(back.map((e) => e.name), name).toEqual([name.trim(), 'Other']);
      expect(back[0]!.roster.groups[0]![0]!.name).toBe('Ragnar');
      expect(back[1]!.roster.groups[0]![0]!.name).toBe('Jaina');
    }
  });

  it('never reads as a signed roster link', () => {
    const hash = '#' + encodeCompareHash([
      { name: '&roster=1&t=abc', code: encodeRoster(a) },
      { name: 'x', code: encodeRoster(b) },
    ]);
    expect(readRosterLink(hash)).toBeNull();
    expect(/^#?roster/.test(hash)).toBe(false);
    expect(isCompareHash(hash)).toBe(true);
  });

  it('drops an entry that does not decode and keeps the rest', () => {
    const back = parseCompareHash('cmp=Good:' + encodeRoster(a) + ',Bad:not-a-code,Also:' + encodeRoster(b));
    expect(back.map((e) => e.name)).toEqual(['Good', 'Also']);
  });

  it('stops at four and names an unnamed roster', () => {
    const code = encodeRoster(a);
    const back = parseCompareHash('cmp=' + Array.from({ length: 6 }, () => ':' + code).join(','));
    expect(back).toHaveLength(MAX_COMPARE);
    expect(back[0]!.name).toBe('Raid 1');
    expect(back[3]!.name).toBe('Raid 4');
  });

  it('refuses a name over forty characters', () => {
    const long = 'x'.repeat(41);
    const back = parseCompareHash('cmp=' + long + ':' + encodeRoster(a) + ',ok:' + encodeRoster(b));
    expect(back.map((e) => e.name)).toEqual(['ok']);
  });

  it('reads nothing from a hash that is not a compare link', () => {
    expect(parseCompareHash('#' + encodeRoster(a))).toEqual([]);
  });
});

describe('warnings across raids', () => {
  it('flags the same player in two raids', () => {
    const a = raid(10, [['warrior', 161, 'Ragnar']]);
    const b = raid(10, [['warrior', 161, ' ragnar ']]);
    const w = compareWarnings([entry('Tuesday', a), entry('Thursday', b)]);
    expect(w.some((x) => x.level === 'warn' && x.title === 'Ragnar is in Tuesday and Thursday')).toBe(true);
  });

  it('does not treat two made-up default names as one person', () => {
    const a = raid(10, [['warrior', 161]]);
    const b = raid(10, [['warrior', 161]]);
    expect(compareWarnings([entry('A', a), entry('B', b)]).filter((x) => x.level === 'warn')).toEqual([]);
  });

  it('flags a class with none in one raid and three in another', () => {
    const a = raid(10, [['priest', 202, 'P1'], ['priest', 202, 'P2'], ['priest', 202, 'P3']]);
    const b = raid(10, [['warrior', 161, 'W1']]);
    const w = compareWarnings([entry('Tuesday', a), entry('Thursday', b)]);
    expect(w.some((x) => x.title === 'No Priests in Thursday, 3 in Tuesday')).toBe(true);
  });

  it('is quiet when the raids share nobody and no class is lopsided', () => {
    const a = raid(10, [['warrior', 161, 'W1'], ['priest', 202, 'P1']]);
    const b = raid(10, [['warrior', 161, 'W2'], ['priest', 202, 'P2']]);
    expect(compareWarnings([entry('A', a), entry('B', b)])).toEqual([]);
  });
});

describe('one raid summarised', () => {
  it('counts seats, roles, classes, missing buffs and camp picks', () => {
    const roster = raid(10, [['warrior', 161, 'Ragnar'], ['priest', 202, 'Benedict']]);
    roster.settings.camp = ['enchanted-lute', 'first-aid-kit'];
    const e = entry('Tuesday', roster);
    const s = summarise(e, computeCoverage(roster));
    expect(s.seated).toBe(2);
    expect(s.size).toBe(10);
    expect(s.classes.find((c) => c.classId === 'priest')!.n).toBe(1);
    expect(s.roles.healer).toBe(1);
    expect(s.missing.some((c) => c.effect.id === 'mark-of-the-wild')).toBe(false);
    expect(s.missing.some((c) => c.effect.id === 'arcane-intellect')).toBe(true);
    expect(s.camp.map((c) => [c.object.id, c.state])).toEqual([
      ['first-aid-kit', 'wasted'],
      ['enchanted-lute', 'covers'],
    ]);
  });
});
