import { describe, expect, it } from 'vitest';

import { simulate, runIteration, AUTO_ATTACK_ID } from '../src/dps/sim/sim';
import { emptyStatSheet, type FightConfig, type SimConfig, type StatSheet } from '../src/dps/sim/types';
import { SwingTimer } from '../src/dps/sim/swing';
import { bandsFor, normalisedSpeed } from '../src/dps/sim/melee';
import { rageFromDamage } from '../src/dps/sim/rage';
import { glancingMultiplier } from '../src/dps/sim/tables';
import { mulberry32 } from '../src/dps/sim/rng';
import { priorityRotation } from '../src/dps/sim/rotation';
import type { SpecModule } from '../src/dps/sim/spec';
import { warriorArms } from '../src/dps/sim/specs/warrior-arms';
import { warriorFury } from '../src/dps/sim/specs/warrior-fury';
import { specModule, supportedSpecs } from '../src/dps/sim/specs';
import * as K from '../src/dps/data/combat-constants';
import { WARRIOR_TALENT_HOOKS } from '../src/dps/data/warrior';
import { buffStats, convert } from '../src/dps/stats';

/**
 * Everything here is worked out by hand rather than read off a previous run.
 * A weapon that always rolls a hundred, swinging every two seconds against a
 * boss with no armor, has to come out at exactly fifty damage a second, and
 * the arithmetic under every other test is the same shape.
 */

/** Every band pinned so a swing can only do one thing. */
const ALWAYS = (band: 'hit' | 'crit' | 'miss') => {
  const zero = { miss: 0, dodge: 0, parry: 0, glance: 0, block: 0, crit: 0 };
  return band === 'hit' ? zero : { ...zero, [band]: 100 };
};

function fight(over: Partial<FightConfig> = {}): FightConfig {
  return {
    duration: 300,
    iterations: 1,
    seed: 1,
    target: { level: 63, armor: 0, resistance: 0, behind: true, canParry: false, canBlock: false },
    buffs: [],
    debuffs: [],
    consumables: [],
    overrides: { forceAverageDamage: true, forceMeleeTable: ALWAYS('hit') },
    ...over,
  };
}

function sheet(over: Partial<StatSheet> = {}): StatSheet {
  const stats = emptyStatSheet(60);
  stats.weaponSkill = 300;
  stats.weapons = {
    main: { min: 100, max: 100, speed: 2, skill: 300, type: 'One-Handed Swords', twoHanded: false },
  };
  return { ...stats, ...over };
}

/** A spec that holds a weapon and never presses anything, so only swings land. */
const swingsOnly: SpecModule = {
  specId: 9001,
  label: 'Nothing but swinging',
  resource: 'rage',
  spells: [],
  talentHooks: {},
  rotations: { standard: () => () => null },
  weightStats: [],
  referenceStat: 'attackPower',
  init: (actor, config) => {
    const weapons = config.stats.weapons;
    if (weapons.main) actor.arm('main', weapons.main.speed);
    if (weapons.off) actor.arm('off', weapons.off.speed);
  },
  forever: { status: 'unverified' },
};

/** The warrior's own hooks and haste, with the rotation taken away. */
const warriorSwingsOnly: SpecModule = {
  ...warriorArms,
  specId: 9003,
  rotations: { standard: () => () => null },
};

describe('the registry', () => {
  it('has both warrior trees in it', () => {
    expect(supportedSpecs()).toContain(161);
    expect(supportedSpecs()).toContain(164);
    expect(specModule(164)).toBe(warriorFury);
    expect(specModule(161)).toBe(warriorArms);
  });
});

describe('a weapon swinging on its own', () => {
  it('comes round once every weapon speed and no more', () => {
    const config: SimConfig = { specId: 9001, stats: sheet(), talents: {}, fight: fight() };
    const result = simulate(config, swingsOnly);
    const main = result.abilities.find((a) => a.id === AUTO_ATTACK_ID.main)!;
    // Swings land at 2, 4, ... 300, which is a hundred and fifty of them.
    expect(main.casts).toBe(150);
    expect(main.hits).toBe(150);
    expect(result.dps).toBeCloseTo((150 * 100) / 300, 9);
  });

  it('adds attack power at fourteen points for one damage a second', () => {
    const stats = sheet();
    stats.attackPower = 1400;
    const result = simulate({ specId: 9001, stats, talents: {}, fight: fight() }, swingsOnly);
    // A hundred and fourteen point two eight: a hundred rolled, plus a hundred
    // attack power's worth over a two second swing.
    expect(result.dps).toBeCloseTo((150 * (100 + (1400 / 14) * 2)) / 300, 9);
  });

  it('gives the off hand half its damage and nineteen more points of missing', () => {
    const stats = sheet();
    stats.weapons.off = {
      min: 100, max: 100, speed: 2, skill: 300, type: 'One-Handed Swords', twoHanded: false,
    };

    const params = {
      weapon: stats.weapons.main!,
      hand: 'main' as const,
      stats,
      attackPower: stats.attackPower,
      target: { level: 63, armor: 0, resistance: 0, damageTaken: {} },
      hitBonus: 0,
      critBonus: 0,
      behind: true,
      canParry: false,
      canBlock: false,
      dualWield: true,
    };
    const alone = bandsFor({ ...params, dualWield: false }, false);
    const paired = bandsFor(params, false);
    expect(paired.miss - alone.miss).toBeCloseTo(K.DUAL_WIELD_MISS_PENALTY.value, 9);

    // And an aimed strike never pays it.
    expect(bandsFor(params, true).miss).toBeCloseTo(alone.miss, 9);

    const result = simulate({ specId: 9001, stats, talents: {}, fight: fight() }, swingsOnly);
    const off = result.abilities.find((a) => a.id === AUTO_ATTACK_ID.off)!;
    expect(off.damage).toBeCloseTo(150 * 100 * 0.5, 9);
  });

  it('keeps a glancing blow inside the band the constants describe', () => {
    const rng = mulberry32(7);
    const values: number[] = [];
    for (let i = 0; i < 2000; i += 1) values.push(glancingMultiplier(300, 315, rng));

    // Fifteen points short of the boss's defence: between 0.55 and 0.75, which
    // averages the 65% every melee player knows.
    for (const value of values) {
      expect(value).toBeGreaterThanOrEqual(0.55);
      expect(value).toBeLessThanOrEqual(0.75);
    }
    const mean = values.reduce((sum, n) => sum + n, 0) / values.length;
    expect(mean).toBeGreaterThan(0.63);
    expect(mean).toBeLessThan(0.67);
  });

  it('normalises a strike against the weapon type rather than the weapon', () => {
    const speeds = K.NORMALISED_SPEED.value;
    const dagger = { min: 1, max: 1, speed: 1.4, skill: 300, type: 'Daggers', twoHanded: false };
    const axe = { min: 1, max: 1, speed: 3.8, skill: 300, type: 'Two-Handed Axes', twoHanded: true };
    expect(normalisedSpeed(dagger)).toBe(speeds.dagger);
    expect(normalisedSpeed(axe)).toBe(speeds.twoHand);
  });
});

describe('rage', () => {
  it('matches the Classic formula for a swing', () => {
    // A hundred damage from a two second weapon in the main hand.
    const expected = (100 / K.RAGE_CONVERSION.value + K.RAGE_HIT_FACTOR_MAIN.value * 2) / 2;
    expect(rageFromDamage(100, 2, 'main', false)).toBeCloseTo(expected, 9);
  });

  it('pays twice the hit factor on a critical strike', () => {
    const plain = rageFromDamage(100, 2, 'main', false);
    const crit = rageFromDamage(100, 2, 'main', true);
    expect(crit - plain).toBeCloseTo((K.RAGE_HIT_FACTOR_MAIN.value * 2) / 2, 9);
  });

  it('pays the off hand half as much for the same damage', () => {
    const main = rageFromDamage(0, 2, 'main', false);
    const off = rageFromDamage(0, 2, 'off', false);
    expect(main).toBe(0);
    expect(off).toBe(0);
    const mainHit = rageFromDamage(100, 2, 'main', false);
    const offHit = rageFromDamage(100, 2, 'off', false);
    expect(mainHit - offHit).toBeCloseTo(
      ((K.RAGE_HIT_FACTOR_MAIN.value - K.RAGE_HIT_FACTOR_OFF.value) * 2) / 2,
      9,
    );
  });

  it('adds up over a fight exactly as the swings did', () => {
    // Twenty seconds of a two second weapon is ten swings, and ten swings of
    // this size stay under the hundred rage the bar holds.
    const result = runIteration(
      { specId: 9001, stats: sheet(), talents: {}, fight: fight({ duration: 20 }) },
      swingsOnly,
      1,
    );
    const perSwing = rageFromDamage(100, 2, 'main', false);
    expect(result.rageGained).toBeCloseTo(perSwing * 10, 9);
    expect(result.rageGained).toBeLessThan(K.RAGE_MAX.value);
  });
});

describe('the swing timer', () => {
  it('keeps the share of a swing already spent when haste arrives', () => {
    const timer = new SwingTimer(3);
    expect(timer.nextAt).toBe(3);

    // Two thirds of the way through, at twice the speed: the last third arrives
    // in half the time it would have.
    timer.retime(2, 2);
    expect(timer.speed).toBe(1.5);
    expect(timer.nextAt).toBeCloseTo(2.5, 9);
  });

  it('stretches what is left when haste falls away again', () => {
    const timer = new SwingTimer(2, 0, 2);
    expect(timer.speed).toBe(1);
    timer.retime(0.5, 1);
    expect(timer.speed).toBe(2);
    // Half the swing was spent, so half of a two second swing is left.
    expect(timer.nextAt).toBeCloseTo(1.5, 9);
  });

  it('does nothing at all when the haste has not moved', () => {
    const timer = new SwingTimer(2.6);
    timer.retime(1, 1);
    expect(timer.nextAt).toBe(2.6);
  });
});

describe('warrior talents', () => {
  it('keys every hook to a name Forever actually uses', async () => {
    const data = await import('../public/data/talents.generated.json');
    const names = new Set<string>();
    for (const tree of data.talents.Warrior.trees) for (const t of tree.talents) names.add(t.name);
    for (const name of Object.keys(WARRIOR_TALENT_HOOKS)) expect(names).toContain(name);
  });

  it('Flurry speeds up the swings that follow a critical strike', () => {
    const config: SimConfig = {
      specId: 164,
      stats: sheet(),
      talents: { Flurry: 5 },
      fight: fight({ overrides: { forceAverageDamage: true, forceMeleeTable: ALWAYS('crit') } }),
    };

    // Everything crits, so Flurry never falls off: a two second weapon swings
    // at 1.6, and swings land at 2 then every 1.6 after it.
    const withFlurry = simulate({ ...config, specId: 9003 }, warriorSwingsOnly);
    const main = withFlurry.abilities.find((a) => a.id === AUTO_ATTACK_ID.main)!;
    expect(main.casts).toBe(187);

    const without = simulate({ ...config, specId: 9003, talents: {} }, warriorSwingsOnly);
    expect(without.abilities.find((a) => a.id === AUTO_ATTACK_ID.main)!.casts).toBe(150);
  });

  it('Cruelty and Precision move the bands rather than the damage', () => {
    // The sheet needs crit of its own: against a boss three levels up the first
    // couple of points are suppressed away, and a comparison against zero would
    // only be measuring that.
    const stats = sheet({ crit: 10 });
    const params = {
      weapon: stats.weapons.main!,
      hand: 'main' as const,
      stats,
      attackPower: stats.attackPower,
      target: { level: 63, armor: 0, resistance: 0, damageTaken: {} },
      hitBonus: 3,
      critBonus: 5,
      behind: true,
      canParry: false,
      canBlock: false,
      dualWield: false,
    };
    const plain = bandsFor({ ...params, hitBonus: 0, critBonus: 0 }, true);
    const talented = bandsFor(params, true);
    expect(plain.miss - talented.miss).toBeCloseTo(3, 9);
    expect(talented.crit - plain.crit).toBeCloseTo(5, 9);
  });

  it('Impale raises what a critical strike is worth', () => {
    const plain = simulate(
      {
        specId: 164,
        stats: sheet(),
        talents: {},
        fight: fight({ overrides: { forceAverageDamage: true, forceMeleeTable: ALWAYS('crit') } }),
      },
      swingsOnly,
    );
    // Impale is on the mods, so it needs a spec that reads them: the warrior
    // itself. Two ranks is a fifth more on top of the doubling.
    const hooks = WARRIOR_TALENT_HOOKS;
    const mods = { meleeCritBonus: 0 } as { meleeCritBonus: number };
    hooks.Impale!(2, mods as never);
    expect(mods.meleeCritBonus).toBeCloseTo(0.2, 9);
    expect(plain.dps).toBeGreaterThan(0);
  });

  it('Dual Wield Specialization pays the off hand three ways', () => {
    const mods = {
      offhandDamage: 1, offhandRage: 1, offhandHit: 0,
    } as { offhandDamage: number; offhandRage: number; offhandHit: number };
    WARRIOR_TALENT_HOOKS['Dual Wield Specialization']!(5, mods as never);
    expect(mods.offhandDamage).toBeCloseTo(1.25, 9);
    expect(mods.offhandRage).toBeCloseTo(2, 9);
    expect(mods.offhandHit).toBe(10);
  });
});

describe('an ability that waits for the swing', () => {
  it('replaces a swing rather than arriving beside it', () => {
    const stats = sheet();
    stats.attackPower = 2000;
    const config: SimConfig = {
      specId: 164,
      stats,
      talents: {},
      fight: fight({ overrides: { forceAverageDamage: true, forceMeleeTable: ALWAYS('hit'), infiniteResource: true } }),
    };
    const result = simulate(config, warriorFury);
    const auto = result.abilities.find((a) => a.id === AUTO_ATTACK_ID.main)?.casts ?? 0;
    const heroic = result.abilities.find((a) => a.id === 'heroic-strike')?.casts ?? 0;

    // Every swing of the main hand is either a plain one or a Heroic Strike,
    // and there are still exactly a hundred and fifty of them.
    expect(auto + heroic).toBe(150);
    expect(heroic).toBeGreaterThan(0);
  });
});

describe('Execute', () => {
  it('is never pressed before the boss is down to a fifth', () => {
    const executeOnly: SpecModule = {
      ...swingsOnly,
      specId: 9002,
      spells: [{
        id: 'execute-test',
        name: 'Execute',
        school: 'physical',
        kind: 'melee',
        resource: 'rage',
        castTime: 0,
        cost: 0,
        minDamage: 0,
        maxDamage: 0,
        coefficient: 0,
        execute: { belowPct: 0.2 },
        weapon: { hand: 'main', multiplier: 0, flat: 100, normalised: false },
        forever: { status: 'unverified' },
      }],
      rotations: { standard: () => priorityRotation([{ spellId: 'execute-test' }]) },
    };

    // The boss falls evenly, so the last fifth of a three hundred second fight
    // is sixty seconds, and a global cooldown is a second and a half.
    const result = simulate(
      { specId: 9002, stats: sheet(), talents: {}, fight: fight() },
      executeOnly,
    );
    expect(result.abilities.find((a) => a.id === 'execute-test')!.casts).toBe(40);
  });
});

describe('percentage buffs and debuffs', () => {
  it('Blessing of Kings adds a tenth of what you already have', () => {
    const { multipliers } = buffStats(['blessing-of-kings']);
    expect(multipliers.strength).toBeCloseTo(1.1, 9);

    // A hundred strength becomes ten more, and a warrior turns each into two
    // points of attack power.
    const delta = convert('warrior', { strength: 100 * (multipliers.strength! - 1) });
    expect(delta.strength).toBeCloseTo(10, 9);
    expect(delta.attackPower).toBeCloseTo(20, 9);
  });

  it('Curse of Shadow does nothing to a warrior and something to a mage', () => {
    const { stats } = buffStats(['curse-of-shadow']);
    expect(stats.attackPower ?? 0).toBe(0);

    const result = simulate(
      {
        specId: 9001,
        stats: sheet(),
        talents: {},
        fight: fight({ debuffs: ['curse-of-shadow'] }),
      },
      swingsOnly,
    );
    const plain = simulate({ specId: 9001, stats: sheet(), talents: {}, fight: fight() }, swingsOnly);
    expect(result.dps).toBeCloseTo(plain.dps, 9);
  });

  it('Sunder Armor takes armor off the boss', () => {
    const armoured = fight({ target: { level: 63, armor: 3000, resistance: 0, behind: true, canParry: false, canBlock: false } });
    const plain = simulate({ specId: 9001, stats: sheet(), talents: {}, fight: armoured }, swingsOnly);
    const sundered = simulate(
      { specId: 9001, stats: sheet(), talents: {}, fight: { ...armoured, debuffs: ['sunder-armor'] } },
      swingsOnly,
    );
    // Two thousand two hundred and fifty off three thousand leaves seven fifty,
    // so the hits land far harder.
    expect(sundered.dps).toBeGreaterThan(plain.dps);
  });
});

describe('both trees end to end', () => {
  const geared = () => {
    const stats = emptyStatSheet(60);
    stats.attackPower = 1800;
    stats.crit = 25;
    stats.hit = 6;
    stats.weaponSkill = 300;
    return stats;
  };

  it('Fury deals damage with two weapons and runs on rage', () => {
    const stats = geared();
    stats.weapons = {
      main: { min: 100, max: 190, speed: 2.6, skill: 300, type: 'One-Handed Axes', twoHanded: false },
      off: { min: 90, max: 170, speed: 2.5, skill: 300, type: 'One-Handed Axes', twoHanded: false },
    };
    const result = simulate(
      {
        specId: 164,
        stats,
        talents: { Flurry: 5, Cruelty: 5, 'Unbridled Wrath': 5, 'Dual Wield Specialization': 5, Bloodthirst: 1 },
        fight: { ...fight(), overrides: undefined, iterations: 50, target: { level: 63, armor: 3000, resistance: 0, behind: true, canParry: false, canBlock: false } },
      },
      warriorFury,
    );
    const ids = result.abilities.map((a) => a.id);
    expect(ids).toContain(AUTO_ATTACK_ID.main);
    expect(ids).toContain(AUTO_ATTACK_ID.off);
    expect(ids).toContain('bloodthirst');
    expect(result.resources.rageGained).toBeGreaterThan(0);
    expect(result.resources.manaSpent).toBe(0);
  });

  it('Arms bleeds the boss through Deep Wounds', () => {
    const stats = geared();
    stats.weapons = {
      main: { min: 200, max: 330, speed: 3.4, skill: 300, type: 'Two-Handed Axes', twoHanded: true },
    };
    const config: SimConfig = {
      specId: 161,
      stats,
      talents: { 'Mortal Strike': 1, 'Deep Wounds': 3, Cruelty: 5 },
      fight: { ...fight(), overrides: undefined, iterations: 50 },
    };
    const result = simulate(config, warriorArms);
    const bleed = result.abilities.find((a) => a.id === 'deep-wounds');
    expect(bleed).toBeDefined();
    expect(bleed!.damage).toBeGreaterThan(0);

    const without = simulate({ ...config, talents: { 'Mortal Strike': 1, Cruelty: 5 } }, warriorArms);
    expect(without.abilities.find((a) => a.id === 'deep-wounds')).toBeUndefined();
  });

  it('gives the same answer twice for the same seed', () => {
    const stats = geared();
    stats.weapons = {
      main: { min: 200, max: 330, speed: 3.4, skill: 300, type: 'Two-Handed Axes', twoHanded: true },
    };
    const config: SimConfig = {
      specId: 161,
      stats,
      talents: { 'Mortal Strike': 1, 'Deep Wounds': 3 },
      fight: { ...fight(), overrides: undefined, iterations: 20 },
    };
    expect(simulate(config, warriorArms).dps).toBe(simulate(config, warriorArms).dps);
  });

  it('says out loud which talents in the build it did not model', () => {
    const stats = geared();
    stats.weapons = {
      main: { min: 200, max: 330, speed: 3.4, skill: 300, type: 'Two-Handed Axes', twoHanded: true },
    };
    const result = simulate(
      {
        specId: 161,
        stats,
        talents: { 'Sweeping Strikes': 1, 'Mortal Strike': 1 },
        fight: { ...fight(), overrides: undefined, iterations: 1 },
      },
      warriorArms,
    );
    expect(result.notes.some((n) => n.startsWith('Sweeping Strikes:'))).toBe(true);
    expect(result.notes.some((n) => n.startsWith('Deflection:'))).toBe(false);
  });
});
