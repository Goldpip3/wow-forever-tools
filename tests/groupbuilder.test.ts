import { describe, expect, it } from 'vitest';
import { looksLikeGroupBuilder, readSignups, rosterFromSignups } from '../src/raid/groupbuilder';
import { archetypeFor } from '../src/shared/classes';
import { playersInRaid } from '../src/raid/engine';
import { decodeRoster, encodeRoster } from '../src/raid/codec';

/** The shape Group Builder's v4 API returns. */
const API_EVENT = {
  id: '123',
  title: 'Molten Core',
  templateId: 'wow_classic',
  signUps: [
    { id: 1, userId: 'u1', name: 'Bob', className: 'Warrior', specName: 'Fury', roleName: 'Melee', status: 'primary', position: 1 },
    { id: 2, userId: 'u2', name: 'Alice', className: 'Priest', specName: 'Holy', roleName: 'Healer', status: 'primary', position: 2 },
    { id: 3, userId: 'u3', name: 'Cleo', className: 'Druid', specName: 'Guardian', roleName: 'Tank', status: 'primary', position: 3 },
    { id: 4, userId: 'u4', name: 'Dane', className: 'Druid', specName: 'Feral', roleName: 'Melee', status: 'primary', position: 4 },
    { id: 5, userId: 'u5', name: 'Eve', className: 'Mage', specName: 'Frost', roleName: 'Ranged', status: 'bench', position: 5 },
    { id: 6, userId: 'u6', name: 'Finn', className: 'absence', status: 'absence', position: 6 },
  ],
};

/** The shape Group Builder stores internally. */
const INTERNAL_ROWS = [
  { displayName: 'Bob', classKey: 'warrior', specKey: 'fury', status: 'primary', position: 1 },
  { displayName: 'Cleo', classKey: 'druid', specKey: 'guardian', status: 'primary', position: 2 },
  { displayName: 'Rex', classKey: 'shaman', specKey: 'resto_sham', status: 'primary', position: 3 },
  { displayName: 'Zed', classKey: 'paladin', specKey: 'prot_pal', status: 'late', position: 4 },
];

describe('recognising the payload', () => {
  it('accepts an event object and a bare array', () => {
    expect(looksLikeGroupBuilder(API_EVENT)).toBe(true);
    expect(looksLikeGroupBuilder(INTERNAL_ROWS)).toBe(true);
  });

  it('rejects anything else', () => {
    expect(looksLikeGroupBuilder({ hello: 'world' })).toBe(false);
    expect(looksLikeGroupBuilder([1, 2, 3])).toBe(false);
    expect(looksLikeGroupBuilder(null)).toBe(false);
  });
});

describe('reading the v4 API shape', () => {
  it('maps class and spec display names onto specs', () => {
    const { players } = readSignups(API_EVENT);
    const bob = players.find((p) => p.name === 'Bob')!;
    expect(bob.classId).toBe('warrior');
    expect(bob.specId).toBe(164);

    const alice = players.find((p) => p.name === 'Alice')!;
    expect(alice.classId).toBe('priest');
    expect(alice.specId).toBe(202);
  });

  it('puts a bear Druid with the tanks and a cat with the melee', () => {
    const { players } = readSignups(API_EVENT);
    const bear = players.find((p) => p.name === 'Cleo')!;
    const cat = players.find((p) => p.name === 'Dane')!;
    expect(bear.specId).toBe(281);
    expect(cat.specId).toBe(281);
    expect(archetypeFor(bear)).toBe('tank');
    expect(archetypeFor(cat)).toBe('melee');
  });

  it('benches a bench signup instead of seating them', () => {
    const { players, bench } = readSignups(API_EVENT);
    expect(players.map((p) => p.name)).not.toContain('Eve');
    expect(bench.map((p) => p.name)).toContain('Eve');
  });

  it('skips an absence and says why', () => {
    const { skipped } = readSignups(API_EVENT);
    const finn = skipped.find((s) => s.name === 'Finn');
    expect(finn).toBeDefined();
    expect(finn!.reason).toMatch(/class|absence/);
  });

  it('keeps the event title', () => {
    expect(readSignups(API_EVENT).title).toBe('Molten Core');
  });
});

describe('reading the internal shape', () => {
  it('maps every spec key', () => {
    const { players } = readSignups(INTERNAL_ROWS);
    expect(players).toHaveLength(4);
    const byName = Object.fromEntries(players.map((p) => [p.name, p]));
    expect(byName.Bob!.specId).toBe(164);
    expect(byName.Cleo!.specId).toBe(281);
    expect(archetypeFor(byName.Cleo!)).toBe('tank');
    expect(byName.Rex!.specId).toBe(262);
    expect(byName.Zed!.specId).toBe(383);
  });

  it('treats a late signup as playing', () => {
    const { players } = readSignups(INTERNAL_ROWS);
    expect(players.map((p) => p.name)).toContain('Zed');
  });

  it('covers every spec key in the WoW Classic template', () => {
    const keys = [
      'arms', 'fury', 'prot_war', 'holy_pal', 'prot_pal', 'ret',
      'bm', 'mm', 'surv', 'assa', 'combat', 'sub',
      'disc', 'holy_priest', 'shadow', 'ele', 'enh', 'resto_sham',
      'arcane', 'fire', 'frost', 'affli', 'demo', 'destro',
      'balance', 'feral', 'guardian', 'resto_druid',
    ];
    const classFor: Record<string, string> = {
      arms: 'warrior', fury: 'warrior', prot_war: 'warrior',
      holy_pal: 'paladin', prot_pal: 'paladin', ret: 'paladin',
      bm: 'hunter', mm: 'hunter', surv: 'hunter',
      assa: 'rogue', combat: 'rogue', sub: 'rogue',
      disc: 'priest', holy_priest: 'priest', shadow: 'priest',
      ele: 'shaman', enh: 'shaman', resto_sham: 'shaman',
      arcane: 'mage', fire: 'mage', frost: 'mage',
      affli: 'warlock', demo: 'warlock', destro: 'warlock',
      balance: 'druid', feral: 'druid', guardian: 'druid', resto_druid: 'druid',
    };
    const rows = keys.map((k, i) => ({
      displayName: k,
      classKey: classFor[k],
      specKey: k,
      status: 'primary',
      position: i,
    }));
    const { players, skipped } = readSignups(rows);
    expect(skipped).toEqual([]);
    expect(players).toHaveLength(keys.length);
    // Nothing fell back to a class default: every key resolved on its own.
    const distinctSpecs = new Set(players.map((p) => p.classId + ':' + p.specId + ':' + (p.role ?? '')));
    expect(distinctSpecs.size).toBe(keys.length);
  });
});

describe('seating an import', () => {
  it('fills groups in signup order', () => {
    const { roster, players } = rosterFromSignups(API_EVENT, 40);
    expect(playersInRaid(roster)).toHaveLength(players.length);
    expect(roster.groups[0]![0]!.name).toBe('Bob');
    expect(roster.groups[0]![1]!.name).toBe('Alice');
  });

  it('keeps the bench on the roster', () => {
    const { roster } = rosterFromSignups(API_EVENT, 40);
    expect(roster.bench.map((p) => p.name)).toContain('Eve');
  });

  it('benches the overflow past the raid size', () => {
    const rows = Array.from({ length: 14 }, (_, i) => ({
      displayName: 'P' + i,
      classKey: 'warrior',
      specKey: 'arms',
      status: 'primary',
      position: i,
    }));
    const { roster, skipped } = rosterFromSignups(rows, 10);
    expect(playersInRaid(roster)).toHaveLength(10);
    expect(roster.bench).toHaveLength(4);
    expect(skipped.filter((s) => s.reason.includes('benched'))).toHaveLength(4);
  });

  it('survives the round trip through a share link', () => {
    const { roster } = rosterFromSignups(API_EVENT, 40);
    const back = decodeRoster(encodeRoster(roster))!;
    const bear = playersInRaid(back).find((p) => p.name === 'Cleo')!;
    expect(bear.specId).toBe(281);
    // The bear/cat distinction has to survive the link, or the seating advice breaks.
    expect(archetypeFor(bear)).toBe('tank');
    expect(back.bench.map((p) => p.name)).toContain('Eve');
  });
});
