import { describe, expect, it } from 'vitest';
import type { Player, Roster } from '../src/raid/types';
import { GROUP_SIZE } from '../src/raid/types';
import { computeCoverage, emptyRoster, activeGroupCount } from '../src/raid/engine';
import { createPlayer, spreadChoices } from '../src/raid/loadout';
import { profileGroups, raidScore, seatAll, seatValue } from '../src/raid/suggestions';
import { archetypeFor, type ClassId } from '../src/shared/classes';

/** A realistic 40-man's worth of signups, in the order people happen to sign up. */
const COMP: Array<[ClassId, number]> = [
  ['warrior', 163], ['warrior', 163], ['warrior', 163],
  ['warrior', 161], ['warrior', 164], ['warrior', 161], ['warrior', 164],
  ['warrior', 161], ['warrior', 164], ['warrior', 161],
  ['rogue', 181], ['rogue', 181], ['rogue', 182], ['rogue', 183], ['rogue', 181],
  ['druid', 281], ['druid', 283], ['druid', 282], ['druid', 282],
  ['shaman', 263], ['shaman', 263], ['shaman', 261], ['shaman', 262], ['shaman', 262],
  ['paladin', 383], ['paladin', 382], ['paladin', 382], ['paladin', 381],
  ['priest', 202], ['priest', 202], ['priest', 201], ['priest', 203],
  ['mage', 61], ['mage', 61], ['mage', 41], ['mage', 81],
  ['hunter', 363], ['hunter', 361], ['hunter', 362],
  ['warlock', 302],
];

function pool(): Player[] {
  const out: Player[] = [];
  for (const [classId, specId] of COMP) {
    out.push(spreadChoices(createPlayer(classId, specId), out));
  }
  return out;
}

function score(roster: Roster): number {
  return raidScore(roster, profileGroups(roster, computeCoverage(roster)));
}

/** Seats with no party buff that does anything for them — the red ! on the page. */
function wasted(roster: Roster): number {
  const profiles = profileGroups(roster, computeCoverage(roster));
  const byIndex = new Map(profiles.map((p) => [p.index, p]));
  let count = 0;
  for (let g = 0; g < activeGroupCount(roster.size); g += 1) {
    const profile = byIndex.get(g);
    if (!profile || !profile.buffs.length) continue;
    for (const player of roster.groups[g] ?? []) {
      if (player && seatValue(player, profile) === 0) count += 1;
    }
  }
  return count;
}

/** What the old import did: fill seats in signup order. */
function seatInOrder(roster: Roster, players: Player[]): void {
  players.forEach((player, i) => {
    const g = Math.floor(i / GROUP_SIZE);
    const s = i % GROUP_SIZE;
    if (roster.groups[g]) roster.groups[g]![s] = player;
  });
}

describe('seating everyone at once', () => {
  it('seats everybody when there is room', () => {
    const roster = emptyRoster(40);
    const waiting = pool();
    const { seated, left } = seatAll(roster, waiting);
    expect(seated).toHaveLength(40);
    expect(left).toEqual([]);
    expect(roster.groups.flat().filter(Boolean)).toHaveLength(40);
  });

  it('seats nobody twice', () => {
    const roster = emptyRoster(40);
    seatAll(roster, pool());
    const ids = roster.groups.flat().filter(Boolean).map((p) => p!.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('picks up more party buffs than seating in signup order', () => {
    const mine = emptyRoster(40);
    seatAll(mine, pool());

    const theirs = emptyRoster(40);
    seatInOrder(theirs, pool());

    expect(score(mine)).toBeGreaterThan(score(theirs));
  });

  it('leaves fewer people getting nothing from their group', () => {
    const mine = emptyRoster(40);
    seatAll(mine, pool());

    const theirs = emptyRoster(40);
    seatInOrder(theirs, pool());

    expect(wasted(mine)).toBeLessThan(wasted(theirs));
  });

  it('keeps melee and casters apart rather than mixing every group', () => {
    const roster = emptyRoster(40);
    seatAll(roster, pool());
    let pure = 0;
    for (let g = 0; g < activeGroupCount(roster.size); g += 1) {
      const kinds = new Set(
        (roster.groups[g] ?? []).filter(Boolean).map((p) => {
          const a = archetypeFor(p!);
          return a === 'tank' ? 'melee' : a;
        }),
      );
      if (kinds.size === 1) pure += 1;
    }
    // Not every group can be pure with a comp this ragged, but most should be.
    expect(pure).toBeGreaterThanOrEqual(4);
  });

  it('fills around people the leader has already seated', () => {
    const roster = emptyRoster(40);
    const waiting = pool();
    const pinned = waiting[0]!;
    roster.groups[3]![2] = pinned;
    const rest = waiting.slice(1);

    const { seated } = seatAll(roster, rest);
    expect(roster.groups[3]![2]).toBe(pinned);
    expect(seated).not.toContain(pinned);
    expect(roster.groups.flat().filter(Boolean)).toHaveLength(40);
  });

  it('hands back whoever did not fit instead of dropping them', () => {
    const roster = emptyRoster(10);
    const waiting = pool();
    const { seated, left } = seatAll(roster, waiting);
    expect(seated).toHaveLength(10);
    expect(left).toHaveLength(30);
    expect([...seated, ...left]).toHaveLength(waiting.length);
  });

  it('does nothing when every seat is taken', () => {
    const roster = emptyRoster(40);
    seatAll(roster, pool());
    const extra = pool().slice(0, 3);
    const { seated, left } = seatAll(roster, extra);
    expect(seated).toEqual([]);
    expect(left).toHaveLength(3);
  });

  it('puts the two Enhancement Shamans in different groups', () => {
    const roster = emptyRoster(40);
    seatAll(roster, pool());
    const groups = [];
    for (let g = 0; g < 8; g += 1) {
      for (const player of roster.groups[g] ?? []) {
        if (player?.specId === 263) groups.push(g);
      }
    }
    expect(groups).toHaveLength(2);
    // Windfury only reaches one group, so two in one group is one wasted totem.
    expect(groups[0]).not.toBe(groups[1]);
  });
});
