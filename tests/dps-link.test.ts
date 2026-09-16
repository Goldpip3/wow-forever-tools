import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { decodeCharacter, encodeCharacter, fullCharacterFor } from '../src/dps/codec';
import { clearDraft, openCharacterLink, readDraft, writeDraft } from '../src/dps/draft';
import { parseCharacterExport } from '../src/dps/importer';
import { SAMPLE_EXPORT } from '../src/dps/sample';
import { SAMPLE_WARRIOR_EXPORT } from '../src/dps/sample-warrior';

const mage = parseCharacterExport(SAMPLE_EXPORT).character!.source;
const warrior = parseCharacterExport(SAMPLE_WARRIOR_EXPORT).character!.source;
const carried = (c: { bags: unknown[]; bank: unknown[] }) => c.bags.length + c.bank.length;

describe('reloading a character link', () => {
  it('the sample has bags or bank for the link to lose', () => {
    expect(carried(mage)).toBeGreaterThan(0);
    expect(carried(decodeCharacter(encodeCharacter(mage, { trim: true }))!)).toBe(0);
  });

  it('gets the bags and bank back from the copy this device kept', () => {
    const link = encodeCharacter(mage, { trim: true });
    const restored = fullCharacterFor(link, encodeCharacter(mage));
    expect(restored).not.toBeNull();
    expect(carried(restored!)).toBe(carried(mage));
    expect(restored).toEqual(decodeCharacter(encodeCharacter(mage)));
  });

  it('opens a different character exactly as its link says', () => {
    const link = encodeCharacter(warrior, { trim: true });
    expect(fullCharacterFor(link, encodeCharacter(mage))).toBeNull();
  });

  it('opens as the link says when nothing was kept or it is unreadable', () => {
    const link = encodeCharacter(mage, { trim: true });
    expect(fullCharacterFor(link, null)).toBeNull();
    expect(fullCharacterFor(link, 'not a character')).toBeNull();
  });
});

describe('the draft kept on this device', () => {
  let map: Map<string, string>;
  beforeEach(() => {
    map = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, String(v)),
      removeItem: (k: string) => void map.delete(k),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('brings the bags and bank back when the link is this device\'s own character', () => {
    expect(writeDraft(mage)).toBe(true);
    const opened = openCharacterLink(encodeCharacter(mage, { trim: true }))!;
    expect(opened.recovered).toBe(true);
    expect(carried(opened.source)).toBe(carried(mage));
  });

  it('opens a shared character as shared, with none of this device\'s inventory added', () => {
    writeDraft(mage);
    const opened = openCharacterLink(encodeCharacter(warrior, { trim: true }))!;
    expect(opened.recovered).toBe(false);
    expect(opened.source.name).toBe(warrior.name);
    expect(carried(opened.source)).toBe(0);
    // The owner's draft is untouched by having looked at it.
    expect(readDraft()).toBe(encodeCharacter(mage));
  });

  it('opens a shared link on a fresh browser with nothing kept', () => {
    const opened = openCharacterLink(encodeCharacter(mage, { trim: true }))!;
    expect(opened.recovered).toBe(false);
    expect(opened.source.name).toBe(mage.name);
    expect(Object.keys(opened.source.equipped).length).toBeGreaterThan(0);
  });

  it('is gone after Clear, and a link that does not read opens nothing', () => {
    writeDraft(mage);
    clearDraft();
    expect(readDraft()).toBeNull();
    expect(openCharacterLink('garbage')).toBeNull();
  });

  it('falls back safely when the draft in storage is not a string, or storage refuses it', () => {
    map.set('wf.dps.current', JSON.stringify({ not: 'a draft' }));
    expect(readDraft()).toBeNull();
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new DOMException('full', 'QuotaExceededError'); },
      removeItem: () => { throw new Error('blocked'); },
    });
    expect(writeDraft(mage)).toBe(false);
    expect(readDraft()).toBeNull();
    expect(() => clearDraft()).not.toThrow();
    expect(openCharacterLink(encodeCharacter(mage, { trim: true }))!.recovered).toBe(false);
  });
});
