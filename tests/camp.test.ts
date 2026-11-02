import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { compressToEncodedURIComponent } from 'lz-string';
import {
  BASIC_CAMPFIRE_SLOTS,
  CAMP_OBJECTS,
  campObjectFor,
  campSuggestions,
  cleanCampPicks,
  readCampPicks,
  writeCampPicks,
} from '../src/raid/camp';
import { effectById } from '../src/raid/effects/index';
import { activeGroupCount, computeCoverage, emptyRoster } from '../src/raid/engine';
import { createPlayer } from '../src/raid/loadout';
import { decodeRoster, encodeRoster, packRoster } from '../src/raid/codec';
import { isProfessionKey } from '../src/guild/professions';
import { bestCampObjects } from '../src/raid/suggestions';
import type { Roster } from '../src/raid/types';
import type { ClassId } from '../src/shared/classes';

const ICON_DIR = resolve(__dirname, '../public/assets/icons');

function add(roster: Roster, group: number, slot: number, classId: ClassId, specId: number, name?: string) {
  const p = createPlayer(classId, specId, name);
  roster.groups[group]![slot] = p;
  return p;
}

describe('camp catalog', () => {
  it('has a unique id for every object', () => {
    const ids = CAMP_OBJECTS.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('names a planner effect that exists for every object that replaces one', () => {
    const bad = CAMP_OBJECTS.filter((o) => o.replaces && !effectById(o.replaces)).map((o) => o.id);
    expect(bad).toEqual([]);
  });

  it('stands in for each class buff at most once', () => {
    const replaced = CAMP_OBJECTS.map((o) => o.replaces).filter(Boolean);
    expect(new Set(replaced).size).toBe(replaced.length);
  });

  it('uses a profession the guild page knows', () => {
    expect(CAMP_OBJECTS.filter((o) => !isProfessionKey(o.profession)).map((o) => o.id)).toEqual([]);
  });

  it('has a downloaded icon for every object', () => {
    const missing = CAMP_OBJECTS.filter((o) => !existsSync(resolve(ICON_DIR, o.icon + '.jpg'))).map((o) => o.id);
    expect(missing).toEqual([]);
  });

  it('carries Blizzard text, or a labelled estimate where there is none', () => {
    const bare = CAMP_OBJECTS.filter((o) => !o.text && !o.estimate?.source).map((o) => o.id);
    expect(bare).toEqual([]);
    for (const o of CAMP_OBJECTS) if (o.estimate) expect(o.estimate.source, o.id).toMatch(/\S/);
  });

  it('names the class buff in the text of every object Blizzard published', () => {
    for (const o of CAMP_OBJECTS) {
      if (!o.text || !o.replaces) continue;
      expect(o.text, o.id).toContain(effectById(o.replaces)!.name);
    }
  });

  it('looks an object up by the buff it replaces', () => {
    expect(campObjectFor('mark-of-the-wild')?.id).toBe('enchanted-lute');
    expect(campObjectFor('battle-shout')).toBeUndefined();
  });

  it('drops ids it does not know and keeps catalog order', () => {
    expect(cleanCampPicks(['mana-well', 'nonsense', 'first-aid-kit', 'mana-well', 7])).toEqual([
      'first-aid-kit',
      'mana-well',
    ]);
    expect(cleanCampPicks(undefined)).toEqual([]);
  });
});

describe('camp coverage', () => {
  it('covers Power Word: Fortitude from a First Aid Kit when no Priest is seated', () => {
    const roster = emptyRoster(20);
    add(roster, 0, 0, 'warrior', 161);
    roster.settings.camp = ['first-aid-kit'];
    const cov = computeCoverage(roster).byEffect.get('power-word-fortitude')!;
    expect(cov.covered).toBe(true);
    expect(cov.campObject).toBe('first-aid-kit');
    expect(cov.providers).toEqual([]);
    expect(cov.possibleBy).toEqual([]);
    expect(cov.groups.slice(0, activeGroupCount(20)).every(Boolean)).toBe(true);
  });

  it('calls the kit wasted when a Priest is seated, and says so once', () => {
    const roster = emptyRoster(10);
    add(roster, 0, 0, 'priest', 202, 'Benedict');
    roster.settings.camp = ['first-aid-kit'];
    const coverage = computeCoverage(roster);
    const cov = coverage.byEffect.get('power-word-fortitude')!;
    expect(cov.campWasted).toBe('first-aid-kit');
    expect(cov.campObject).toBeUndefined();
    const notes = coverage.warnings.filter((w) => w.title.startsWith('First Aid Kit'));
    expect(notes).toHaveLength(1);
    expect(notes[0]!.level).toBe('info');
    expect(notes[0]!.detail).toContain('Benedict');
  });

  it('changes nothing for the tent and the reagent bot', () => {
    const roster = emptyRoster(10);
    add(roster, 0, 0, 'warrior', 161);
    const before = computeCoverage(roster);
    roster.settings.camp = ['camp-tent', 'reagent-bot'];
    const after = computeCoverage(roster);
    for (const [id, cov] of before.byEffect) expect(after.byEffect.get(id)!.covered, id).toBe(cov.covered);
  });

  it('warns when more objects are ticked than a Basic Campfire holds', () => {
    const roster = emptyRoster(10);
    roster.settings.camp = CAMP_OBJECTS.slice(0, BASIC_CAMPFIRE_SLOTS).map((o) => o.id);
    expect(computeCoverage(roster).warnings.some((w) => /on a fire that holds/.test(w.title))).toBe(false);
    roster.settings.camp = CAMP_OBJECTS.slice(0, BASIC_CAMPFIRE_SLOTS + 1).map((o) => o.id);
    const warn = computeCoverage(roster).warnings.find((w) => /on a fire that holds/.test(w.title));
    expect(warn?.level).toBe('warn');
  });

  it('ignores an object id it does not know', () => {
    const roster = emptyRoster(10);
    roster.settings.camp = ['a-campfire-that-does-not-exist'];
    expect(() => computeCoverage(roster)).not.toThrow();
  });

  it('never says a camp buff does not stack with a player', () => {
    const roster = emptyRoster(40);
    add(roster, 0, 0, 'warrior', 161);
    roster.settings.camp = CAMP_OBJECTS.map((o) => o.id);
    const coverage = computeCoverage(roster);
    const campCovered = [...coverage.byEffect.values()].filter((c) => c.campObject).map((c) => c.effect.name);
    const stacking = coverage.warnings.filter((w) => /do not stack/.test(w.title));
    for (const w of stacking) for (const name of campCovered) expect(w.title).not.toContain(name);
  });
});

describe('camp suggestions', () => {
  it('recommends a Fishing Bowl when nobody can bring Blessing of Kings', () => {
    const roster = emptyRoster(10);
    add(roster, 0, 0, 'warrior', 161);
    const kings = campSuggestions(computeCoverage(roster)).find((s) => s.object.id === 'fishing-bowl');
    expect(kings?.state).toBe('missing');
  });

  it('says a Paladin could switch when one is on another blessing', () => {
    const roster = emptyRoster(10);
    const pal = add(roster, 0, 0, 'paladin', 382);
    pal.loadout['paladin-blessing'] = ['blessing-of-might'];
    const kings = campSuggestions(computeCoverage(roster)).find((s) => s.object.id === 'fishing-bowl');
    expect(kings?.state).toBe('available');
  });

  it('stops suggesting an object once it is ticked', () => {
    const roster = emptyRoster(10);
    add(roster, 0, 0, 'warrior', 161);
    roster.settings.camp = ['fishing-bowl'];
    expect(campSuggestions(computeCoverage(roster)).some((s) => s.object.id === 'fishing-bowl')).toBe(false);
  });
});

describe('camp picks in the link', () => {
  it('reads a link made before camp picks existed', () => {
    const old = compressToEncodedURIComponent(
      JSON.stringify([1, 40, 0, [[0, 0, 'Ragnar', 'warrior', 161, [], [], []]], []]),
    );
    const back = decodeRoster(old)!;
    expect(back).not.toBeNull();
    expect(back.settings.camp).toEqual([]);
    expect(back.groups[0]![0]!.name).toBe('Ragnar');
  });

  it('carries camp picks through the link and drops unknown ones', () => {
    const roster = emptyRoster(10);
    add(roster, 0, 0, 'warrior', 161);
    roster.settings.camp = ['enchanted-lute', 'mana-well', 'bogus'];
    expect(decodeRoster(encodeRoster(roster))!.settings.camp).toEqual(['mana-well', 'enchanted-lute']);
  });

  it('packs a roster with no picks exactly as before', () => {
    const roster = emptyRoster(10);
    add(roster, 0, 0, 'warrior', 161);
    expect(packRoster(roster)).toHaveLength(5);
  });
});

describe('camp picks in roster mode', () => {
  beforeEach(() => {
    const map = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, String(v)),
      removeItem: (k: string) => void map.delete(k),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('keeps picks per event', () => {
    expect(writeCampPicks('1234', ['mana-well', 'nope'])).toBe(true);
    expect(readCampPicks('1234')).toEqual(['mana-well']);
    expect(readCampPicks('5678')).toEqual([]);
  });

  it('never stores anything for the demo', () => {
    expect(writeCampPicks('demo', ['mana-well'])).toBe(false);
    expect(readCampPicks('demo')).toEqual([]);
    expect(localStorage.getItem('wf.camp.demo')).toBeNull();
  });

  it('reads junk in storage as no picks', () => {
    localStorage.setItem('wf.camp.99', '{"x":1}');
    expect(readCampPicks('99')).toEqual([]);
  });
});

describe('the best camp objects for a raid', () => {
  it('picks three, best first, and only for buffs nobody brings', () => {
    const roster = emptyRoster(10);
    add(roster, 0, 0, 'warrior', 163, 'Tank');
    add(roster, 0, 1, 'warrior', 164, 'Fury1');
    add(roster, 0, 2, 'warrior', 164, 'Fury2');
    add(roster, 0, 3, 'rogue', 181, 'Rogue1');
    add(roster, 0, 4, 'rogue', 181, 'Rogue2');
    add(roster, 1, 0, 'priest', 202, 'Healer');
    const best = bestCampObjects(roster, computeCoverage(roster), 3);
    expect(best).toHaveLength(3);
    expect(best.map((b) => b.object.id)).not.toContain('first-aid-kit'); // the Priest brings Fortitude
    for (let i = 1; i < best.length; i += 1) expect(best[i - 1]!.worth).toBeGreaterThanOrEqual(best[i]!.worth);
    // A melee raid wants melee buffs ahead of Intellect.
    expect(best.map((b) => b.object.id)).not.toContain('incense-candle');
    expect(best[0]!.helps.find((h) => h.archetype === 'melee')?.n).toBe(4);
  });

  it('wants mana and Intellect for a caster raid', () => {
    const roster = emptyRoster(10);
    for (let i = 0; i < 4; i += 1) add(roster, 0, i, 'warlock', 302, 'Lock' + i);
    add(roster, 1, 0, 'paladin', 381, 'Holy');
    roster.groups[1]![0]!.loadout['paladin-blessing'] = ['blessing-of-kings'];
    const ids = bestCampObjects(roster, computeCoverage(roster), 3).map((b) => b.object.id);
    expect(ids).toContain('incense-candle');
    expect(ids).not.toContain('sharpening-wheel');
    expect(ids).not.toContain('fishing-bowl'); // the Paladin brings Kings
  });

  it('keeps an object it recommends after it is ticked', () => {
    const roster = emptyRoster(10);
    add(roster, 0, 0, 'warrior', 164, 'Fury');
    const before = bestCampObjects(roster, computeCoverage(roster), 3).map((b) => b.object.id);
    roster.settings.camp = before;
    expect(bestCampObjects(roster, computeCoverage(roster), 3).map((b) => b.object.id)).toEqual(before);
  });

  it('has nothing to say about an empty raid', () => {
    const roster = emptyRoster(10);
    expect(bestCampObjects(roster, computeCoverage(roster), 3)).toEqual([]);
  });
});
