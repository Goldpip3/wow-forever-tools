import { describe, expect, it } from 'vitest';

import { mulberry32, splitSeed } from '../src/dps/sim/rng';
import { EventQueue } from '../src/dps/sim/queue';
import {
  armorMultiplier,
  averageResist,
  defenseFor,
  dodgeChance,
  glancingChance,
  glancingMultiplier,
  meleeAttackTable,
  meleeCritChance,
  missChance,
  resolveWhite,
  resolveYellow,
  rollSpell,
  spellHitChance,
} from '../src/dps/sim/tables';
import { AuraTracker } from '../src/dps/sim/auras';
import { Actor } from '../src/dps/sim/actor';
import { simulate } from '../src/dps/sim/sim';
import { emptyStatSheet, type SimConfig } from '../src/dps/sim/types';
import type { SpecModule } from '../src/dps/sim/spec';

describe('the random number generator', () => {
  it('gives the same stream for the same seed', () => {
    const a = mulberry32(12345);
    const b = mulberry32(12345);
    for (let i = 0; i < 1000; i += 1) expect(a.next()).toBe(b.next());
  });

  it('gives a different stream for a different seed', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    const first = Array.from({ length: 20 }, () => a.next());
    const second = Array.from({ length: 20 }, () => b.next());
    expect(first).not.toEqual(second);
  });

  it('stays inside nought and one', () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 10000; i += 1) {
      const n = rng.next();
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(1);
    }
  });

  it('averages a half over a long run', () => {
    const rng = mulberry32(99);
    let sum = 0;
    const n = 100000;
    for (let i = 0; i < n; i += 1) sum += rng.next();
    expect(sum / n).toBeCloseTo(0.5, 2);
  });

  it('fires at about the rate it was asked for', () => {
    const rng = mulberry32(4242);
    let hits = 0;
    const n = 100000;
    for (let i = 0; i < n; i += 1) if (rng.chance(0.3)) hits += 1;
    expect(hits / n).toBeGreaterThan(0.29);
    expect(hits / n).toBeLessThan(0.31);
  });

  it('treats a certainty and an impossibility as such', () => {
    const rng = mulberry32(1);
    expect(rng.chance(0)).toBe(false);
    expect(rng.chance(1)).toBe(true);
    expect(rng.chance(-1)).toBe(false);
  });

  it('splits one seed into streams that do not march together', () => {
    const a = mulberry32(splitSeed(100, 0));
    const b = mulberry32(splitSeed(100, 1));
    const first = Array.from({ length: 10 }, () => a.next());
    const second = Array.from({ length: 10 }, () => b.next());
    expect(first).not.toEqual(second);
    // The same iteration of the same run has to repeat exactly.
    expect(splitSeed(100, 5)).toBe(splitSeed(100, 5));
  });
});

describe('the event queue', () => {
  it('comes out in time order however it went in', () => {
    const q = new EventQueue<string>();
    for (const [time, name] of [[5, 'e'], [1, 'a'], [9, 'g'], [3, 'c'], [2, 'b']] as const) {
      q.push(time, name);
    }
    const out: string[] = [];
    let ev = q.pop();
    while (ev) {
      out.push(ev.data);
      ev = q.pop();
    }
    expect(out).toEqual(['a', 'b', 'c', 'e', 'g']);
  });

  it('keeps insertion order when two things happen at once', () => {
    const q = new EventQueue<string>();
    q.push(1, 'first');
    q.push(1, 'second');
    q.push(1, 'third');
    expect(q.pop()!.data).toBe('first');
    expect(q.pop()!.data).toBe('second');
    expect(q.pop()!.data).toBe('third');
  });

  it('copes with pushing while popping', () => {
    const q = new EventQueue<number>();
    q.push(10, 10);
    q.push(20, 20);
    expect(q.pop()!.data).toBe(10);
    q.push(15, 15);
    q.push(5, 5);
    expect(q.pop()!.data).toBe(5);
    expect(q.pop()!.data).toBe(15);
    expect(q.pop()!.data).toBe(20);
    expect(q.pop()).toBeUndefined();
  });

  it('reports its size and empties on demand', () => {
    const q = new EventQueue<number>();
    expect(q.size).toBe(0);
    q.push(1, 1);
    q.push(2, 2);
    expect(q.size).toBe(2);
    expect(q.peek()!.data).toBe(1);
    q.clear();
    expect(q.size).toBe(0);
    expect(q.peek()).toBeUndefined();
  });
});

describe('spell hit', () => {
  it('is four per cent short against your own level', () => {
    expect(spellHitChance(60, 60)).toBe(96);
  });

  it('falls off a cliff against a raid boss', () => {
    expect(spellHitChance(60, 63)).toBe(83);
  });

  it('steps through the levels in between', () => {
    expect(spellHitChance(60, 61)).toBe(95);
    expect(spellHitChance(60, 62)).toBe(94);
  });

  it('never gets past ninety-nine however much hit you stack', () => {
    expect(spellHitChance(60, 63, 20)).toBe(99);
    expect(spellHitChance(60, 60, 50)).toBe(99);
  });

  it('adds gear hit to the base', () => {
    expect(spellHitChance(60, 63, 6)).toBe(89);
  });
});

describe('rolling a spell', () => {
  it('lands and crits at about the rates it was given', () => {
    const rng = mulberry32(2024);
    let miss = 0;
    let crit = 0;
    let hit = 0;
    const n = 200000;
    for (let i = 0; i < n; i += 1) {
      const outcome = rollSpell(83, 20, rng);
      if (outcome === 'miss') miss += 1;
      else if (outcome === 'crit') crit += 1;
      else hit += 1;
    }
    expect((miss / n) * 100).toBeCloseTo(17, 0);
    // Crit is rolled among the casts that landed.
    expect((crit / (crit + hit)) * 100).toBeCloseTo(20, 0);
  });

  it('never misses at a hundred and never crits at nought', () => {
    const rng = mulberry32(5);
    for (let i = 0; i < 100; i += 1) expect(rollSpell(100, 0, rng)).toBe('hit');
  });
});

describe('the melee table', () => {
  const boss = { attackerLevel: 60, targetLevel: 63, defense: defenseFor(63) };

  it('is the nine per cent miss everyone knows at three hundred skill', () => {
    expect(missChance(300, boss.defense)).toBeCloseTo(9, 5);
  });

  it('drops to six at three hundred and five', () => {
    expect(missChance(305, boss.defense)).toBeCloseTo(6, 5);
  });

  it('adds nineteen points for the off hand', () => {
    expect(missChance(300, boss.defense, 0, true)).toBeCloseTo(28, 5);
  });

  it('takes hit off the miss chance and never goes below nothing', () => {
    expect(missChance(300, boss.defense, 5)).toBeCloseTo(4, 5);
    expect(missChance(300, boss.defense, 50)).toBe(0);
  });

  it('dodges six and a half and glances forty against a boss', () => {
    expect(dodgeChance(300, boss.defense)).toBeCloseTo(6.5, 5);
    expect(glancingChance(300, boss.defense)).toBe(40);
  });

  it('does not glance at something your own level', () => {
    expect(glancingChance(300, defenseFor(60))).toBe(0);
  });

  it('takes crit off for the level difference', () => {
    expect(meleeCritChance(30, 60, 63)).toBeCloseTo(30 - 0.6 - 1.8, 5);
    expect(meleeCritChance(30, 60, 60)).toBe(30);
    expect(meleeCritChance(1, 60, 63)).toBe(0);
  });

  it('adds up to a hundred', () => {
    const table = meleeAttackTable({
      skill: 300, defense: boss.defense, hitPct: 0, critPct: 30,
      attackerLevel: 60, targetLevel: 63,
    });
    const total = table.miss + table.dodge + table.parry + table.glance + table.block + table.crit + table.hit;
    expect(total).toBeCloseTo(100, 6);
  });

  it('drops parry and block once you are behind it', () => {
    const table = meleeAttackTable({
      skill: 300, defense: boss.defense, hitPct: 0, critPct: 30,
      attackerLevel: 60, targetLevel: 63, behind: true, canBlock: true,
    });
    expect(table.parry).toBe(0);
    expect(table.block).toBe(0);
  });

  it('leaves no room for glancing on an aimed attack', () => {
    const table = meleeAttackTable(
      { skill: 300, defense: boss.defense, hitPct: 0, critPct: 30, attackerLevel: 60, targetLevel: 63 },
      true,
    );
    expect(table.glance).toBe(0);
  });

  it('squeezes crit out when the table is already full', () => {
    const table = meleeAttackTable({
      skill: 300, defense: boss.defense, hitPct: 0, critPct: 90,
      attackerLevel: 60, targetLevel: 63,
    });
    expect(table.hit).toBe(0);
    expect(table.crit).toBeLessThan(90);
  });

  it('rolls white swings at the rates the table says', () => {
    const table = meleeAttackTable({
      skill: 300, defense: boss.defense, hitPct: 0, critPct: 30,
      attackerLevel: 60, targetLevel: 63, behind: true,
    });
    const rng = mulberry32(31337);
    const counts: Record<string, number> = {};
    const n = 200000;
    for (let i = 0; i < n; i += 1) {
      const outcome = resolveWhite(table, rng);
      counts[outcome] = (counts[outcome] ?? 0) + 1;
    }
    expect(((counts.miss ?? 0) / n) * 100).toBeCloseTo(table.miss, 0);
    expect(((counts.dodge ?? 0) / n) * 100).toBeCloseTo(table.dodge, 0);
    expect(((counts.glance ?? 0) / n) * 100).toBeCloseTo(table.glance, 0);
    expect(counts.parry ?? 0).toBe(0);
  });

  it('never glances an aimed attack', () => {
    const table = meleeAttackTable(
      { skill: 300, defense: boss.defense, hitPct: 0, critPct: 30, attackerLevel: 60, targetLevel: 63 },
      true,
    );
    const rng = mulberry32(11);
    for (let i = 0; i < 20000; i += 1) expect(resolveYellow(table, rng)).not.toBe('glance');
  });

  it('keeps about two thirds of the damage on a glance at three hundred skill', () => {
    const rng = mulberry32(8);
    let sum = 0;
    const n = 20000;
    for (let i = 0; i < n; i += 1) sum += glancingMultiplier(300, boss.defense, rng);
    expect(sum / n).toBeCloseTo(0.65, 1);
  });

  it('barely dents a glance when the skill difference is small', () => {
    const rng = mulberry32(8);
    let sum = 0;
    const n = 20000;
    for (let i = 0; i < n; i += 1) sum += glancingMultiplier(305, boss.defense, rng);
    expect(sum / n).toBeGreaterThan(0.8);
  });
});

describe('armor and resistance', () => {
  it('takes nothing off when there is no armor', () => {
    expect(armorMultiplier(0, 60)).toBe(1);
  });

  it('takes about a third off against typical raid armor', () => {
    // 3000 armor against a level sixty attacker.
    expect(1 - armorMultiplier(3000, 60)).toBeCloseTo(3000 / (3000 + 400 + 85 * 60), 6);
  });

  it('never takes more than three quarters', () => {
    expect(1 - armorMultiplier(1000000, 60)).toBeCloseTo(0.75, 6);
  });

  it('resists nothing against a target with no resistance', () => {
    expect(averageResist(0, 60, 63)).toBe(0);
  });

  it('resists three quarters at the cap', () => {
    expect(averageResist(300, 60, 63)).toBeCloseTo(0.75, 6);
    expect(averageResist(9999, 60, 63)).toBeCloseTo(0.75, 6);
  });

  it('scales in between', () => {
    expect(averageResist(150, 60, 63)).toBeCloseTo(0.375, 6);
  });
});

describe('auras', () => {
  it('goes up and comes down', () => {
    const auras = new AuraTracker();
    auras.apply('x', 10, { duration: 5 });
    expect(auras.has('x', 12)).toBe(true);
    expect(auras.remaining('x', 12)).toBe(3);
    expect(auras.has('x', 15)).toBe(false);
    expect(auras.has('x', 16)).toBe(false);
  });

  it('stacks up to its limit and no further', () => {
    const auras = new AuraTracker();
    for (let i = 0; i < 10; i += 1) auras.apply('chill', 1, { duration: 15, maxStacks: 5 });
    expect(auras.stacks('chill', 2)).toBe(5);
  });

  it('refreshes the duration when it is reapplied', () => {
    const auras = new AuraTracker();
    auras.apply('x', 0, { duration: 10 });
    auras.apply('x', 8, { duration: 10 });
    expect(auras.has('x', 15)).toBe(true);
    expect(auras.remaining('x', 10)).toBe(8);
  });

  it('spends a stack at a time', () => {
    const auras = new AuraTracker();
    auras.apply('proc', 0, { duration: 15, maxStacks: 2, stacks: 2 });
    expect(auras.consume('proc', 1)).toBe(true);
    expect(auras.stacks('proc', 1)).toBe(1);
    expect(auras.consume('proc', 1)).toBe(true);
    expect(auras.has('proc', 1)).toBe(false);
    expect(auras.consume('proc', 1)).toBe(false);
  });

  it('reports nothing for an aura that has run out', () => {
    const auras = new AuraTracker();
    auras.apply('x', 0, { duration: 5, maxStacks: 3, stacks: 3 });
    expect(auras.stacks('x', 6)).toBe(0);
    expect(auras.remaining('x', 6)).toBe(0);
    expect(auras.active(6)).toEqual([]);
  });
});

/* ---------------------------------------------------------- energy and combo */

/**
 * The warrior does not use energy, so the engine's half of it is exercised here
 * with a spec invented for the purpose: a hundred in the bar, twenty back every
 * tick, and a finisher that spends what has been banked.
 */
describe('a bar that ticks rather than trickles', () => {
  const builder: SpecModule = {
    specId: 9101,
    label: 'A bar and a finisher',
    resource: 'energy',
    spells: [
      {
        id: 'jab', name: 'Jab', school: 'physical', kind: 'melee', resource: 'energy',
        castTime: 0, cost: 40, minDamage: 0, maxDamage: 0, coefficient: 0,
        combo: { generates: 1 },
        weapon: { hand: 'main', multiplier: 1, flat: 0, normalised: false },
        forever: { status: 'unverified' },
      },
    ],
    talentHooks: {},
    rotations: { standard: () => [{ spellId: 'jab' }] },
    weightStats: [],
    referenceStat: 'attackPower',
    init: (actor, config) => {
      const main = config.stats.weapons.main;
      if (main) actor.arm('main', main.speed);
    },
    forever: { status: 'unverified' },
  };

  function config(duration: number): SimConfig {
    const stats = emptyStatSheet(60);
    stats.weaponSkill = 300;
    stats.weapons = {
      main: { min: 10, max: 10, speed: 2, skill: 300, type: 'Daggers', twoHanded: false },
    };
    return {
      specId: 9101,
      stats,
      talents: {},
      fight: {
        duration,
        iterations: 1,
        seed: 1,
        target: { level: 63, armor: 0, resistance: 0, behind: true, canParry: false, canBlock: false },
        buffs: [], debuffs: [], consumables: [],
        overrides: {
          forceAverageDamage: true,
          forceMeleeTable: { miss: 0, dodge: 0, parry: 0, glance: 0, block: 0, crit: 0 },
        },
      },
    };
  }

  it('spends what it has and then waits for the tick', () => {
    // A hundred energy pays for two Jabs at once, then twenty arrives every two
    // seconds, so a third is affordable four seconds in.
    const result = simulate(config(10), builder);
    const jab = result.abilities.find((a) => a.id === 'jab')!;
    expect(jab.casts).toBe(4);
    expect(result.resources.energySpent).toBe(160);
  });

  it('reports the seconds it spent waiting on an empty bar', () => {
    const result = simulate(config(10), builder);
    expect(result.resources.starvedFor).toBeGreaterThan(0);
  });

  it('caps combo points rather than letting them run away', () => {
    const actor = new Actor(emptyStatSheet(60));
    for (let i = 0; i < 10; i += 1) actor.addCombo(1);
    expect(actor.comboPoints).toBe(5);
    expect(actor.spendCombo()).toBe(5);
    expect(actor.comboPoints).toBe(0);
  });

  it('never lets a bar go below nothing or above its top', () => {
    const actor = new Actor(emptyStatSheet(60));
    expect(actor.rage.current).toBe(0);
    actor.gain('rage', 250);
    expect(actor.rage.current).toBe(100);
    expect(actor.rage.gained).toBe(100);
    expect(actor.spend('rage', 150, 0)).toBe(false);
    expect(actor.rage.starvedAt).toBe(0);
    expect(actor.spend('rage', 40, 1)).toBe(true);
    expect(actor.rage.current).toBe(60);
  });
});

/* ------------------------------------------------------------ extra attacks */

describe('an extra attack', () => {
  const alwaysAgain: SpecModule = {
    specId: 9102,
    label: 'Swings twice every time',
    resource: 'rage',
    spells: [],
    talentHooks: {},
    rotations: { standard: () => [] },
    weightStats: [{ stat: 'attackPower', step: 100 }],
    referenceStat: 'attackPower',
    init: (actor, config) => {
      const main = config.stats.weapons.main;
      if (main) actor.arm('main', main.speed);
    },
    onSwing: (event) => {
      if (event.outcome !== 'miss') event.extraAttack(140);
    },
    forever: { status: 'unverified' },
  };

  function config(): SimConfig {
    const stats = emptyStatSheet(60);
    stats.weapons = {
      main: { min: 100, max: 100, speed: 2, skill: 300, type: 'One-Handed Maces', twoHanded: false },
    };
    return {
      specId: 9102,
      stats,
      talents: {},
      fight: {
        duration: 300,
        iterations: 1,
        seed: 1,
        target: { level: 63, armor: 0, resistance: 0, behind: true, canParry: false, canBlock: false },
        buffs: [], debuffs: [], consumables: [],
        overrides: {
          forceAverageDamage: true,
          forceMeleeTable: { miss: 0, dodge: 0, parry: 0, glance: 0, block: 0, crit: 0 },
        },
      },
    };
  }

  it('happens once per swing and never sets off another', () => {
    const result = simulate(config(), alwaysAgain);
    const swings = result.abilities.find((a) => a.id === 'auto-main')!;
    const extra = result.abilities.find((a) => a.id === 'extra-attack')!;
    // A hundred and fifty swings, each followed by exactly one more.
    expect(swings.casts).toBe(150);
    expect(extra.casts).toBe(150);
  });

  it('carries its attack power for that swing alone', () => {
    const result = simulate(config(), alwaysAgain);
    const swings = result.abilities.find((a) => a.id === 'auto-main')!;
    const extra = result.abilities.find((a) => a.id === 'extra-attack')!;
    // A hundred and forty attack power over a two second weapon is twenty more.
    expect(swings.damage / swings.hits).toBeCloseTo(100, 6);
    expect(extra.damage / extra.hits).toBeCloseTo(120, 6);
  });
});
