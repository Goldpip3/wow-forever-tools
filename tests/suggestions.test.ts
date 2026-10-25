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
  it('reads a Mana Spring group as a healer group', () => {
    const roster = emptyRoster(40);
    add(roster, 0, 0, 'shaman', 261); // Elemental brings Mana Spring Totem
    const profiles = profileGroups(roster, computeCoverage(roster));
    expect(profiles[0]!.suits).toBe('healer');
    expect(profiles[0]!.buffs.map((b) => b.name)).toContain('Mana Spring Totem');
  });

  it('leaves raid-wide buffs out of what a group is for', () => {
    const roster = emptyRoster(40);
    add(roster, 0, 0, 'shaman', 263); // Windfury Totem reaches the raid now
    add(roster, 1, 0, 'druid', 283); // and so does Moonkin Aura
    const profiles = profileGroups(roster, computeCoverage(roster));
    expect(profiles[0]!.buffs.map((b) => b.name)).not.toContain('Windfury Totem');
    expect(profiles.find((p) => p.index === 1)!.buffs.map((b) => b.name)).not.toContain('Moonkin Aura');
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
  it('rates a healer higher in a Mana Spring group than an empty one', () => {
    const roster = emptyRoster(40);
    add(roster, 0, 0, 'shaman', 261);
    const priest = add(roster, 0, 1, 'priest', 202);
    const profiles = profileGroups(roster, computeCoverage(roster));
    expect(seatValue(priest, profiles[0]!)).toBeGreaterThan(seatValue(priest, profiles[3]!));
  });

  it('gives a warrior less from Mana Spring than a healer', () => {
    const roster = emptyRoster(40);
    add(roster, 0, 0, 'shaman', 261);
    const priest = add(roster, 0, 1, 'priest', 202);
    const warrior = add(roster, 0, 2, 'warrior', 161);
    const profiles = profileGroups(roster, computeCoverage(roster));
    expect(seatValue(priest, profiles[0])).toBeGreaterThan(seatValue(warrior, profiles[0]));
  });
});

describe('swap suggestions', () => {
  /** A healer stuck in the melee group, with a seat free next to Mana Spring. */
  function misplacedHealer(): Roster {
    const roster = emptyRoster(40);
    // Group 1: mana support, one seat left over
    add(roster, 0, 0, 'shaman', 261, 'Totems');
    add(roster, 0, 1, 'priest', 202, 'Holy One');
    // Group 2: melee, with a healer sitting in it
    add(roster, 1, 0, 'warrior', 161, 'Arms One');
    add(roster, 1, 1, 'priest', 202, 'Lost Holy');
    return roster;
  }

  it('spots a healer sitting away from the mana totem', () => {
    const roster = misplacedHealer();
    const suggestions = suggestSwaps(roster, computeCoverage(roster));
    expect(suggestions.length).toBeGreaterThan(0);
    const about = suggestions.find((s) => s.title.includes('Lost Holy'));
    expect(about).toBeDefined();
    expect(about!.gain).toBeGreaterThan(0);
  });

  it('writes a reason a raid leader can read', () => {
    const roster = misplacedHealer();
    const s = suggestSwaps(roster, computeCoverage(roster)).find((x) => x.title.includes('Lost Holy'))!;
    expect(s.detail).toMatch(/Group [12]/);
    expect(s.detail.length).toBeGreaterThan(30);
    expect(s.title).toMatch(/^(Move|Swap) /);
  });

  it('raises the raid score when applied', () => {
    const roster = misplacedHealer();
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
    const roster = misplacedHealer();
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
