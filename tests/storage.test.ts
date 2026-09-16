import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  KEY_PREFS, hasStrings, patchJson, patchPrefs, readJson, readList, readPrefs, remove, writeJson,
} from '../src/shared/storage';

beforeEach(() => {
  const map = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('shared preferences', () => {
  it('turning comparison on keeps the simulator settings', () => {
    const dps = { fight: { duration: 180 }, rotation: { custom: ['Frostbolt'] }, overrides: { hit: 3 } };
    writeJson(KEY_PREFS, { dps });
    patchJson(KEY_PREFS, { compare: true });
    expect(readJson(KEY_PREFS, {})).toEqual({ dps, compare: true });
  });

  it('saving simulator settings keeps the comparison setting', () => {
    writeJson(KEY_PREFS, { compare: true, dps: { fight: { duration: 180 } } });
    patchJson(KEY_PREFS, { dps: { fight: { duration: 300 } } });
    expect(readJson(KEY_PREFS, {})).toEqual({ compare: true, dps: { fight: { duration: 300 } } });
  });

  it('replaces something stored that is not an object', () => {
    localStorage.setItem(KEY_PREFS, '[1,2]');
    patchJson(KEY_PREFS, { compare: false });
    expect(readJson(KEY_PREFS, {})).toEqual({ compare: false });
  });
});

describe('reading what storage holds, not what it claims to hold', () => {
  it('gives the fallback when a list was expected and something else is stored', () => {
    localStorage.setItem('wf.builds', '{"not":"a list"}');
    expect(readJson('wf.builds', [])).toEqual([]);
  });

  it('gives the fallback when an object was expected and a list is stored', () => {
    localStorage.setItem(KEY_PREFS, '[true]');
    expect(readJson(KEY_PREFS, {})).toEqual({});
  });

  it('gives the fallback for a value that fails its check', () => {
    localStorage.setItem('wf.dps.current', '42');
    expect(readJson<string | null>('wf.dps.current', null, (v): v is string => typeof v === 'string')).toBeNull();
  });

  it('keeps the good rows of a list and leaves out the broken ones', () => {
    localStorage.setItem('wf.rosters', JSON.stringify([
      { id: 'a', name: 'Raid', code: 'xyz' },
      null,
      { id: 'b', name: 7, code: 'xyz' },
      'junk',
    ]));
    const rows = readList('wf.rosters', (v): v is { id: string } => hasStrings(v, ['id', 'name', 'code']));
    expect(rows).toEqual([{ id: 'a', name: 'Raid', code: 'xyz' }]);
  });
});

describe('the preferences each page owns', () => {
  it('the talent page changing comparison leaves the gear page\'s settings exactly as they were', () => {
    const dps = { fight: { duration: 240, buffs: ['kings'] }, overrides: { 61: { hit: 12 } }, apl: { 61: [{ spellId: 'frostbolt' }] } };
    writeJson(KEY_PREFS, { dps, somethingOlder: 1 });
    expect(patchPrefs({ compare: true })).toBe(true);
    expect(patchPrefs({ compare: false })).toBe(true);
    expect(readPrefs()).toEqual({ compare: false, dps });
    // A key an older version wrote is kept, not migrated away.
    expect(readJson<Record<string, unknown>>(KEY_PREFS, {}).somethingOlder).toBe(1);
  });

  it('ignores a part of the wrong shape instead of handing it to the page', () => {
    localStorage.setItem(KEY_PREFS, JSON.stringify({ compare: 'yes', dps: [1, 2] }));
    expect(readPrefs()).toEqual({});
  });
});

describe('when the browser will not store anything', () => {
  it('reads the fallback when storage is blocked outright', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new DOMException('denied', 'SecurityError'); },
      setItem: () => { throw new DOMException('denied', 'SecurityError'); },
      removeItem: () => { throw new DOMException('denied', 'SecurityError'); },
    });
    expect(readJson('wf.builds', [])).toEqual([]);
    expect(readPrefs()).toEqual({});
    expect(writeJson('wf.builds', [1])).toBe(false);
    expect(patchPrefs({ compare: true })).toBe(false);
    expect(() => remove('wf.builds')).not.toThrow();
  });

  it('says it did not save when the quota is full', () => {
    const map = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: () => { throw new DOMException('full', 'QuotaExceededError'); },
      removeItem: (k: string) => void map.delete(k),
    });
    expect(writeJson('wf.dps.current', 'x'.repeat(10))).toBe(false);
    expect(patchPrefs({ compare: true })).toBe(false);
  });

  it('reads the fallback for JSON that does not parse', () => {
    localStorage.setItem(KEY_PREFS, '{not json');
    localStorage.setItem('wf.builds', '[1,');
    expect(readPrefs()).toEqual({});
    expect(readJson('wf.builds', [])).toEqual([]);
    expect(patchJson(KEY_PREFS, { compare: true })).toBe(true);
    expect(readPrefs()).toEqual({ compare: true });
  });
});
