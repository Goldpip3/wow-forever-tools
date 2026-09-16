import { describe, expect, it } from 'vitest';
import { compressToEncodedURIComponent } from 'lz-string';

import {
  SIM_REVISION, decodeCharacter, decodeReport, encodeCharacter, encodeReport, summarise, trimForLink, type Report,
} from '../src/dps/codec';
import { migrateFight, FIGHT_LIMITS } from '../src/dps/fight';
import { configFor } from '../src/dps/client';
import { parseCharacterExport } from '../src/dps/importer';
import { SAMPLE_WARRIOR_EXPORT } from '../src/dps/sample-warrior';
import { simulate } from '../src/dps/sim/sim';
import { specModule } from '../src/dps/sim/specs';
import type { FightConfig } from '../src/dps/sim/types';
import { MAX_LINK_CHARS, isCharacterShape, isFightShape, readDpsPrefs } from '../src/dps/validate';

const warrior = parseCharacterExport(SAMPLE_WARRIOR_EXPORT).character!;
const fight: FightConfig = {
  duration: 60, iterations: 10, seed: 5,
  target: { level: 63, armor: 3000, resistance: 0, behind: true, canParry: false, canBlock: false },
  buffs: [], debuffs: [], consumables: [],
};
const summary = summarise(simulate(configFor(warrior, fight, 'standard'), specModule(warrior.specId)!));
const pack = (v: unknown) => compressToEncodedURIComponent(JSON.stringify(v));

/** A current report as plain JSON, to break one part of at a time. */
function current(): any {
  return JSON.parse(JSON.stringify({
    character: trimForLink(warrior.source), fight, rotation: 'standard', engine: SIM_REVISION, summary,
  } satisfies Report));
}

describe('reports that are the right shape', () => {
  it('opens a current report and an older version-2 one', () => {
    expect(decodeReport(encodeReport(current()))).not.toBeNull();
    const old = current();
    delete old.engine;
    expect(decodeReport(pack([2, old]))).not.toBeNull();
  });
});

describe('reports that are not, even with a good character inside', () => {
  const broken: Array<[string, (r: any) => void]> = [
    ['buffs as a string', (r) => (r.fight.buffs = 'kings')],
    ['a buff id that is not text', (r) => (r.fight.buffs = [7])],
    ['a target that is a list', (r) => (r.fight.target = [])],
    ['a movement style with no timing', (r) => (r.fight.style = { kind: 'movement' })],
    ['a style nobody wrote', (r) => (r.fight.style = { kind: 'teleport' })],
    ['a million-second fight', (r) => (r.fight.duration = 1e6)],
    ['a trillion runs', (r) => (r.fight.iterations = 1e12)],
    ['no runs at all', (r) => (r.fight.iterations = 0)],
    ['an ability whose damage is text', (r) => (r.summary.abilities[0].damage = 'lots')],
    ['an aura with no uptime', (r) => (r.summary.auras = [{ id: 'x', name: 'X', uptime: null }])],
    ['histogram bins that are not numbers', (r) => (r.summary.histogram.bins = ['a'])],
    ['summary iterations of zero', (r) => (r.summary.iterations = 0)],
    ['a rotation line with no spell', (r) => (r.apl = [{ text: 'always' }])],
    ['a rotation of ten thousand lines', (r) => (r.apl = Array.from({ length: 10000 }, () => ({ spellId: 'x' })))],
    ['a rotation name that is a number', (r) => (r.rotation = 3)],
    ['talents that are not a list', (r) => (r.character.talents = {})],
    ['a class that does not exist', (r) => (r.character.classId = 'bard')],
    ['a bank that is not a list', (r) => (r.character.bank = 'full')],
  ];
  for (const [what, breakIt] of broken) {
    it('refuses ' + what, () => {
      const r = current();
      breakIt(r);
      expect(decodeReport(pack([3, r]))).toBeNull();
    });
  }

  it('refuses versions it does not know, old or new', () => {
    for (const version of [0, 1, 4, '3', null]) expect(decodeReport(pack([version, current()]))).toBeNull();
    expect(decodeReport(pack(current()))).toBeNull();
  });
});

describe('text that is not a link at all', () => {
  it('gives nothing back, without throwing, for corrupt or oversized input', () => {
    const inputs = [
      '', '#', 'not a link', '%%%%', 'N4Ig'.repeat(10), encodeReport(current()).slice(0, 40),
      'x'.repeat(MAX_LINK_CHARS + 1),
      compressToEncodedURIComponent('{"half": '),
      pack('just a string'),
    ];
    for (const text of inputs) {
      expect(() => decodeReport(text)).not.toThrow();
      expect(decodeReport(text)).toBeNull();
      expect(decodeCharacter(text)).toBeNull();
    }
  });

  it('refuses a character link whose character is the wrong shape', () => {
    expect(decodeCharacter(encodeCharacter(warrior.source))).not.toBeNull();
    expect(decodeCharacter(pack([1, { classId: 'warrior' }]))).toBeNull();
    expect(decodeCharacter(pack([1, { ...warrior.source, equipped: [] }]))).toBeNull();
    expect(decodeCharacter(pack([2, warrior.source]))).toBeNull();
    expect(isCharacterShape({ ...warrior.source, level: 1e9 })).toBe(false);
  });
});

describe('migration, only for what passed', () => {
  it('pulls believable but out-of-panel numbers back inside the panel', () => {
    const f = { ...fight, duration: 5, iterations: 1_000_000 };
    expect(isFightShape(f)).toBe(true);
    const m = migrateFight(f);
    expect(m.duration).toBe(FIGHT_LIMITS.duration[0]);
    expect(m.iterations).toBe(FIGHT_LIMITS.iterations[1]);
  });

  it('fills in what an older fight predates, drops retired buffs and the debug hooks', () => {
    const old = { duration: 200, iterations: 500, seed: 1, buffs: ['arcane-intellect', 'a-buff-that-was-removed'], debuffs: [], consumables: [], overrides: { infiniteMana: true } } as unknown as FightConfig;
    const m = migrateFight(old);
    expect(m.style).toEqual({ kind: 'patchwerk' });
    expect(m.target.level).toBe(63);
    expect(m.buffs).toEqual(['arcane-intellect']);
    expect(m.overrides).toBeUndefined();
  });
});

describe('the gear page\'s saved preferences', () => {
  it('reads nothing from null, a list or a string', () => {
    for (const raw of [null, undefined, [], 'prefs', 7]) expect(readDpsPrefs(raw)).toEqual({});
  });

  it('keeps each good part and drops each bad one on its own', () => {
    const prefs = readDpsPrefs({
      fight: { ...fight, buffs: 'kings' },
      rotation: 'standard',
      role: 'healer',
      overrides: { 61: { spellPower: 1.2, hit: 'lots', made_up: 3 }, bogus: { hit: 1 } },
      apl: { 61: [{ spellId: 'frostbolt' }], 62: [{ text: 'no spell' }], nope: [] },
    });
    expect(prefs.fight).toBeUndefined();
    expect(prefs.rotation).toBe('standard');
    expect(prefs.role).toBeUndefined();
    expect(prefs.overrides).toEqual({ 61: { spellPower: 1.2 } });
    expect(prefs.apl).toEqual({ 61: [{ spellId: 'frostbolt' }] });
  });
});
