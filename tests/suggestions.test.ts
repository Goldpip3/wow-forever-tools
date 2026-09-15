import { describe, expect, it } from 'vitest';
import type { Player, Roster } from '../src/raid/types';
import { computeCoverage, emptyRoster } from '../src/raid/engine';
import { createPlayer } from '../src/raid/loadout';
import {
  applySuggestion,
  overview,
  profileGroups,
  raidScore,
  seatValue,
  suggestSwaps,
} from '../src/raid/suggestions';
import { archetypeFor, archetypeOf, roleOf } from '../src/shared/classes';
import type { ClassId } from '../src/shared/classes';
import { buildExport, asDiscordMessage } from '../src/raid/export';

function add(roster: Roster, group: number, slot: number, classId: ClassId, specId: number, name?: string): Player {
  const p = createPlayer(classId, specId, name);
  roster.groups[group]![slot] = p;
  return p;
}

describe('archetypes', () => {
  it('separates hunters from casters', () => {
    expect(archetypeOf('hunter', 363)).toBe('ranged-physical');
    expect(archetypeOf('mage', 61)).toBe('caster');
    expect(archetypeOf('priest', 203)).toBe('caster');
    expect(archetypeOf('druid', 283)).toBe('caster');
  });

  it('reads tanks, healers and melee from the spec role', () => {
    expect(archetypeOf('warrior', 163)).toBe('tank');
    expect(archetypeOf('warrior', 161)).toBe('melee');
    expect(archetypeOf('priest', 202)).toBe('healer');
    expect(archetypeOf('paladin', 383)).toBe('tank');
  });
});

describe('group profiles', () => {
  it('reads a Windfury group as a melee group', () => {
    const roster = emptyRoster(40);
    add(roster, 0, 0, 'shaman', 263); // Enhancement brings Windfury Totem
    const profiles = profileGroups(roster, computeCoverage(roster));
    expect(profiles[0]!.suits).toBe('melee');
    expect(profiles[0]!.buffs.map((b) => b.name)).toContain('Windfury Totem');
  });

  it('reads a Moonkin group as a caster group', () => {
    const roster = emptyRoster(40);
    add(roster, 1, 0, 'druid', 283); // Balance brings Moonkin Aura
    const profiles = profileGroups(roster, computeCoverage(roster));
    const g2 = profiles.find((p) => p.index === 1)!;
    expect(g2.buffs.map((b) => b.name)).toContain('Moonkin Aura');
  });

  it('counts who is in each group', () => {
    const roster = emptyRoster(40);
    add(roster, 0, 0, 'warrior', 161);
    add(roster, 0, 1, 'warrior', 164);
    add(roster, 0, 2, 'mage', 61);
    const profiles = profileGroups(roster, computeCoverage(roster));
    expect(profiles[0]!.counts.melee).toBe(2);
    expect(profiles[0]!.counts.caster).toBe(1);
  });
});

describe('seat value', () => {
  it('rates a melee player higher in a Windfury group than an empty one', () => {
    const roster = emptyRoster(40);
    add(roster, 0, 0, 'shaman', 263);
    const warrior = add(roster, 0, 1, 'warrior', 161);
    const profiles = profileGroups(roster, computeCoverage(roster));
    const melee = profiles[0]!;
    const empty = profiles[3]!;
    expect(seatValue(warrior, melee)).toBeGreaterThan(seatValue(warrior, empty));
  });

  it('gives a caster nothing from Windfury', () => {
    const roster = emptyRoster(40);
    add(roster, 0, 0, 'shaman', 263);
    const mage = add(roster, 0, 1, 'mage', 61);
    const warrior = add(roster, 0, 2, 'warrior', 161);
    const profiles = profileGroups(roster, computeCoverage(roster));
    expect(seatValue(warrior, profiles[0])).toBeGreaterThan(seatValue(mage, profiles[0]));
  });
});

describe('swap suggestions', () => {
  /** A melee player stuck in the caster group, with a seat free next to Windfury. */
  function misplacedMelee(): Roster {
    const roster = emptyRoster(40);
    // Group 1: melee support, one seat left over
    add(roster, 0, 0, 'shaman', 263, 'Totems');
    add(roster, 0, 1, 'warrior', 161, 'Arms One');
    // Group 2: caster support, with a warrior sitting in it
    add(roster, 1, 0, 'druid', 283, 'Boomie');
    add(roster, 1, 1, 'warrior', 164, 'Lost Fury');
    return roster;
  }

  it('spots a melee player sitting in the caster group', () => {
    const roster = misplacedMelee();
    const suggestions = suggestSwaps(roster, computeCoverage(roster));
    expect(suggestions.length).toBeGreaterThan(0);
    const about = suggestions.find((s) => s.title.includes('Lost Fury'));
    expect(about).toBeDefined();
    expect(about!.gain).toBeGreaterThan(0);
  });

  it('writes a reason a raid leader can read', () => {
    const roster = misplacedMelee();
    const s = suggestSwaps(roster, computeCoverage(roster)).find((x) => x.title.includes('Lost Fury'))!;
    expect(s.detail).toMatch(/Group [12]/);
    expect(s.detail.length).toBeGreaterThan(30);
    expect(s.title).toMatch(/^(Move|Swap) /);
  });

  it('raises the raid score when applied', () => {
    const roster = misplacedMelee();
    const before = raidScore(roster, profileGroups(roster, computeCoverage(roster)));
    const s = suggestSwaps(roster, computeCoverage(roster))[0]!;
    applySuggestion(roster, s);
    const after = raidScore(roster, profileGroups(roster, computeCoverage(roster)));
    expect(after).toBeGreaterThan(before);
  });

  it('suggests nothing when everyone already sits well', () => {
    const roster = emptyRoster(10);
    add(roster, 0, 0, 'shaman', 263);
    add(roster, 0, 1, 'warrior', 161);
    add(roster, 0, 2, 'warrior', 164);
    add(roster, 0, 3, 'rogue', 181);
    add(roster, 0, 4, 'warrior', 163);
    const suggestions = suggestSwaps(roster, computeCoverage(roster));
    for (const s of suggestions) expect(s.gain).toBeGreaterThan(0);
  });

  it('never returns a suggestion that does not help', () => {
    const roster = emptyRoster(40);
    for (let g = 0; g < 4; g += 1) {
      add(roster, g, 0, 'warrior', 161);
      add(roster, g, 1, 'mage', 61);
    }
    for (const s of suggestSwaps(roster, computeCoverage(roster))) {
      expect(s.gain).toBeGreaterThan(0);
    }
  });

  it('does not reuse the same seat in two suggestions', () => {
    const roster = emptyRoster(40);
    add(roster, 0, 0, 'shaman', 263);
    add(roster, 1, 0, 'druid', 283);
    add(roster, 1, 1, 'warrior', 161);
    add(roster, 1, 2, 'warrior', 164);
    add(roster, 2, 0, 'mage', 61);
    const seats = new Set<string>();
    for (const s of suggestSwaps(roster, computeCoverage(roster))) {
      for (const seat of [s.from, s.to]) {
        const key = seat.group + 'x' + seat.slot;
        expect(seats.has(key)).toBe(false);
        seats.add(key);
      }
    }
  });

  it('moves a player into an empty seat without losing anyone', () => {
    const roster = misplacedMelee();
    const before = roster.groups.flat().filter(Boolean).length;
    const s = suggestSwaps(roster, computeCoverage(roster))[0]!;
    applySuggestion(roster, s);
    expect(roster.groups.flat().filter(Boolean).length).toBe(before);
  });
});

describe('overview', () => {
  it('buckets players by archetype and counts empty seats', () => {
    const roster = emptyRoster(10);
    add(roster, 0, 0, 'warrior', 163, 'Tanky');
    add(roster, 0, 1, 'priest', 202, 'Healer');
    add(roster, 0, 2, 'mage', 61, 'Caster');
    add(roster, 0, 3, 'hunter', 363, 'Hunter');
    add(roster, 0, 4, 'rogue', 181, 'Stabby');
    const view = overview(roster);
    expect(view.counts.tank).toBe(1);
    expect(view.counts.healer).toBe(1);
    expect(view.counts.melee).toBe(1);
    // A hunter and a mage are both Ranged DPS to a raid leader, even though the
    // scoring underneath still tells them apart.
    expect(view.counts.ranged).toBe(2);
    expect(view.emptySeats).toBe(5);
    expect(view.players.tank[0]!.player.name).toBe('Tanky');
    expect(view.players.ranged.map((r) => r.player.name).sort()).toEqual(['Caster', 'Hunter']);
  });

  it('still separates hunters from casters for the seating advice', () => {
    const roster = emptyRoster(10);
    const hunter = add(roster, 0, 0, 'hunter', 363, 'Hunter');
    const mage = add(roster, 0, 1, 'mage', 61, 'Caster');
    expect(roleOf(hunter)).toBe('ranged');
    expect(roleOf(mage)).toBe('ranged');
    expect(archetypeFor(hunter)).toBe('ranged-physical');
    expect(archetypeFor(mage)).toBe('caster');
  });
});

describe('export for other tools', () => {
  function sample(): Roster {
    const roster = emptyRoster(40);
    add(roster, 0, 0, 'warrior', 163, 'Shieldwall');
    add(roster, 0, 1, 'shaman', 263, 'Totems');
    add(roster, 1, 0, 'mage', 61, 'Frosty');
    add(roster, 1, 1, 'priest', 202, 'Mender');
    return roster;
  }

  it('produces a stable JSON shape', () => {
    const roster = sample();
    const data = buildExport(roster, computeCoverage(roster), 'https://example.test/raid.html');
    expect(data.version).toBe(1);
    expect(data.size).toBe(40);
    expect(data.players).toHaveLength(4);
    expect(data.players[0]!.name).toBe('Shieldwall');
    expect(data.players[0]!.group).toBe(1);
    expect(data.roles.Tanks).toBe(1);
    expect(data.roles.Healers).toBe(1);
    expect(data.link).toMatch(/^https:\/\/example\.test\/raid\.html#/);
    // No limit by default: Forever has not been shown to cap debuffs on a target.
    expect(data.debuffs.cap).toBe(0);
    expect(data.categories.length).toBeGreaterThan(40);
  });

  it('separates covered buffs from missing ones', () => {
    const roster = sample();
    const data = buildExport(roster, computeCoverage(roster), 'https://example.test/');
    const coveredIds = data.buffs.covered.map((b) => b.id);
    const missingIds = data.buffs.missing.map((b) => b.id);
    expect(coveredIds).toContain('arcane-intellect');
    expect(missingIds).toContain('blessing-of-kings');
    expect(coveredIds.some((id) => missingIds.includes(id))).toBe(false);
  });

  it('names the providers of each covered buff', () => {
    const roster = sample();
    const data = buildExport(roster, computeCoverage(roster), 'https://example.test/');
    const ai = data.buffs.covered.find((b) => b.id === 'arcane-intellect')!;
    expect(ai.providers).toEqual(['Frosty']);
  });

  it('writes a Discord message with groups, slots and a link', () => {
    const roster = sample();
    const text = asDiscordMessage(roster, computeCoverage(roster), 'https://example.test/raid.html');
    expect(text).toContain('**Group 1**');
    expect(text).toContain('Shieldwall');
    expect(text).toContain('Debuffs on the target');
    expect(text).toContain('https://example.test/raid.html#');
    expect(text.split('\n').length).toBeGreaterThan(5);
  });

  it('keeps the Discord message small enough for one chat post', () => {
    const roster = emptyRoster(40);
    let n = 0;
    for (let g = 0; g < 8; g += 1) {
      for (let s = 0; s < 5; s += 1) {
        n += 1;
        add(roster, g, s, 'warrior', 161, 'Player ' + n);
      }
    }
    const text = asDiscordMessage(roster, computeCoverage(roster), 'https://example.test/');
    expect(text.length).toBeLessThan(4000);
  });
});
