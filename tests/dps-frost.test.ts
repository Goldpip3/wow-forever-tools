import { describe, expect, it } from 'vitest';

import { simulate, runIteration } from '../src/dps/sim/sim';
import { emptyStatSheet, type FightConfig, type SimConfig } from '../src/dps/sim/types';
import { mageFrost } from '../src/dps/sim/specs/mage-frost';
import { specModule, supportedSpecs } from '../src/dps/sim/specs';
import { FROSTBOLT } from '../src/dps/data/mage';

/**
 * The reference numbers here are worked out by hand, not read off a previous
 * run. Frostbolt averages 535 damage over a three second cast, so a fight where
 * nothing misses, nothing crits and mana never runs out has to come out at
 * exactly 535 over 3.
 */
const AVERAGE_HIT = (FROSTBOLT.minDamage + FROSTBOLT.maxDamage) / 2;

function trivialFight(over: Partial<FightConfig> = {}): FightConfig {
  return {
    duration: 300,
    iterations: 1,
    seed: 1,
    target: { level: 63, armor: 0, resistance: 0, behind: true, canParry: false, canBlock: false },
    buffs: [],
    debuffs: [],
    consumables: [],
    overrides: { forceSpellHit: 1, forceSpellCrit: 0, infiniteMana: true, forceAverageDamage: true },
    ...over,
  };
}

function config(talents: Record<string, number> = {}, over: Partial<SimConfig> = {}): SimConfig {
  const stats = emptyStatSheet(60);
  stats.mana = 100000;
  return { specId: 61, stats, talents, fight: trivialFight(), ...over };
}

describe('the registry', () => {
  it('has the frost mage in it', () => {
    expect(supportedSpecs()).toContain(61);
    expect(specModule(61)).toBe(mageFrost);
  });

  it('says nothing for a spec nobody has written yet', () => {
    // Protection Warrior: the tree exists, the simulation does not.
    expect(specModule(163)).toBeUndefined();
  });
});

describe('a frost mage with nothing on', () => {
  it('deals exactly one Frostbolt every three seconds', () => {
    const result = simulate(config(), mageFrost);
    expect(result.dps).toBeCloseTo(AVERAGE_HIT / 3, 9);
    expect(result.abilities[0]!.casts).toBe(100);
    expect(result.abilities[0]!.misses).toBe(0);
    expect(result.abilities[0]!.crits).toBe(0);
  });

  it('never starts a cast it cannot finish', () => {
    const cfg = config();
    cfg.fight.duration = 301;
    const result = simulate(cfg, mageFrost);
    // A hundred casts fit; the hundred and first would land at 303.
    expect(result.abilities[0]!.casts).toBe(100);
    expect(result.abilities[0]!.hits).toBe(100);
  });

  it('halves again when everything crits', () => {
    const cfg = config();
    cfg.fight.overrides!.forceSpellCrit = 1;
    const result = simulate(cfg, mageFrost);
    expect(result.dps).toBeCloseTo((AVERAGE_HIT * 1.5) / 3, 9);
  });

  it('picks up spell power at the spell coefficient', () => {
    const cfg = config();
    cfg.stats.spellPower = 500;
    const result = simulate(cfg, mageFrost);
    expect(result.dps).toBeCloseTo((AVERAGE_HIT + 500 * FROSTBOLT.coefficient) / 3, 9);
  });

  it('adds the school bonus on top of the general pool', () => {
    const cfg = config();
    cfg.stats.spellPower = 300;
    cfg.stats.frostPower = 200;
    const result = simulate(cfg, mageFrost);
    expect(result.dps).toBeCloseTo((AVERAGE_HIT + 500 * FROSTBOLT.coefficient) / 3, 9);
  });

  it('gives the same answer twice for the same seed', () => {
    const a = simulate(config(), mageFrost);
    const b = simulate(config(), mageFrost);
    expect(a.dps).toBe(b.dps);
  });
});

describe('frost talents', () => {
  it('Improved Frostbolt fits more casts into the fight', () => {
    const result = simulate(config({ 'Improved Frostbolt': 5 }), mageFrost);
    expect(result.abilities[0]!.casts).toBe(120);
    expect(result.dps).toBeCloseTo(AVERAGE_HIT / 2.5, 9);
  });

  it('Ice Shards doubles a critical strike rather than adding half', () => {
    const cfg = config({ 'Ice Shards': 5 });
    cfg.fight.overrides!.forceSpellCrit = 1;
    const result = simulate(cfg, mageFrost);
    expect(result.dps).toBeCloseTo((AVERAGE_HIT * 2) / 3, 9);
  });

  it('Ice Shards does nothing at all without a critical strike', () => {
    const plain = simulate(config(), mageFrost).dps;
    const shards = simulate(config({ 'Ice Shards': 5 }), mageFrost).dps;
    expect(shards).toBeCloseTo(plain, 9);
  });

  it('Piercing Ice adds two per cent a rank to frost damage', () => {
    const result = simulate(config({ 'Piercing Ice': 3 }), mageFrost);
    expect(result.dps).toBeCloseTo((AVERAGE_HIT * 1.06) / 3, 9);
  });

  it('Frost Channeling makes Frostbolt cheaper', () => {
    const cheap = config({ 'Frost Channeling': 3 });
    cheap.fight.overrides!.infiniteMana = false;
    cheap.stats.mana = 10000;
    const dear = config();
    dear.fight.overrides!.infiniteMana = false;
    dear.stats.mana = 10000;
    expect(simulate(cheap, mageFrost).resources.manaSpent)
      .toBeLessThan(simulate(dear, mageFrost).resources.manaSpent);
  });

  it('Elemental Precision lands more of them', () => {
    const withHit = config({ 'Elemental Precision': 5 });
    delete withHit.fight.overrides!.forceSpellHit;
    withHit.fight.iterations = 200;
    const without = config();
    delete without.fight.overrides!.forceSpellHit;
    without.fight.iterations = 200;
    expect(simulate(withHit, mageFrost).dps).toBeGreaterThan(simulate(without, mageFrost).dps);
  });
});

describe('missing', () => {
  it('loses about seventeen per cent against a boss', () => {
    const cfg = config();
    delete cfg.fight.overrides!.forceSpellHit;
    cfg.fight.iterations = 500;
    const result = simulate(cfg, mageFrost);
    const expected = (AVERAGE_HIT / 3) * 0.83;
    // Three standard errors is a wide enough net to never flake.
    expect(Math.abs(result.dps - expected)).toBeLessThan(3 * result.dpsStderr + 0.5);
  });

  it('counts the misses it took', () => {
    const cfg = config();
    delete cfg.fight.overrides!.forceSpellHit;
    cfg.fight.iterations = 200;
    const result = simulate(cfg, mageFrost);
    const frostbolt = result.abilities.find((a) => a.id === 'frostbolt')!;
    expect(frostbolt.misses / frostbolt.casts).toBeCloseTo(0.17, 1);
  });
});

describe('running out of mana', () => {
  it('says when it happened and does less as a result', () => {
    const cfg = config();
    cfg.fight.overrides!.infiniteMana = false;
    cfg.stats.mana = 2000;
    cfg.stats.spirit = 0;
    const result = simulate(cfg, mageFrost);

    expect(result.resources.oomAt).toBeDefined();
    // A gem and a potion stretch it, but it still runs dry well inside the fight.
    expect(result.resources.oomAt!).toBeLessThan(120);
    expect(result.dps).toBeLessThan(AVERAGE_HIT / 3);
    expect(result.resources.timeIdle).toBeGreaterThan(0);
  });

  it('reaches for a mana gem before it is empty', () => {
    const cfg = config();
    cfg.fight.overrides!.infiniteMana = false;
    cfg.stats.mana = 4000;
    const result = simulate(cfg, mageFrost);
    expect(result.abilities.some((a) => a.id === 'mana-gem')).toBe(true);
  });

  it('spends Evocation on a fight long enough to want it', () => {
    const cfg = config();
    cfg.fight.overrides!.infiniteMana = false;
    cfg.stats.mana = 4000;
    cfg.stats.spirit = 200;
    const result = simulate(cfg, mageFrost);
    expect(result.abilities.some((a) => a.id === 'evocation')).toBe(true);
  });

  it('never bothers with a potion while the tank is still full', () => {
    const cfg = config();
    cfg.fight.overrides!.infiniteMana = false;
    cfg.stats.mana = 500000;
    const result = simulate(cfg, mageFrost);
    expect(result.abilities.some((a) => a.id === 'mana-potion')).toBe(false);
  });
});

describe('the frost procs', () => {
  it("Winter's Chill raises the crit rate it was asked about", () => {
    const base = config({ "Winter's Chill": 5 });
    delete base.fight.overrides!.forceSpellCrit;
    base.stats.spellCrit = 10;
    base.fight.iterations = 200;
    const withChill = simulate(base, mageFrost);

    const plain = config();
    delete plain.fight.overrides!.forceSpellCrit;
    plain.stats.spellCrit = 10;
    plain.fight.iterations = 200;
    const without = simulate(plain, mageFrost);

    const chillRate = withChill.abilities[0]!.crits / withChill.abilities[0]!.hits;
    const plainRate = without.abilities[0]!.crits / without.abilities[0]!.hits;
    expect(chillRate).toBeGreaterThan(plainRate);
    // Five stacks is ten points on top of the ten the character already has.
    expect(chillRate).toBeGreaterThan(0.15);
  });

  it('Arcane Concentration saves mana without changing the casts', () => {
    const free = config({ 'Arcane Concentration': 5 });
    free.fight.overrides!.infiniteMana = false;
    free.stats.mana = 100000;
    const paid = config();
    paid.fight.overrides!.infiniteMana = false;
    paid.stats.mana = 100000;

    const a = simulate(free, mageFrost);
    const b = simulate(paid, mageFrost);
    expect(a.resources.manaSpent).toBeLessThan(b.resources.manaSpent);
    expect(a.abilities[0]!.casts).toBe(b.abilities[0]!.casts);
  });

  it('leaves Ice Lance out of the rotation until its numbers are known', () => {
    const result = simulate(config({ 'Ice Lance': 1 }), mageFrost);
    expect(result.abilities.some((a) => a.id === 'ice-lance')).toBe(false);
  });
});

describe('the result', () => {
  it('reports a spread across iterations once anything is random', () => {
    const cfg = config();
    delete cfg.fight.overrides!.forceSpellHit;
    delete cfg.fight.overrides!.forceAverageDamage;
    cfg.fight.iterations = 200;
    const result = simulate(cfg, mageFrost);
    expect(result.dpsStdev).toBeGreaterThan(0);
    expect(result.dpsStderr).toBeLessThan(result.dpsStdev);
    expect(result.iterations).toBe(200);
  });

  it('has no spread at all when nothing is left to chance', () => {
    const cfg = config();
    cfg.fight.iterations = 20;
    const result = simulate(cfg, mageFrost);
    expect(result.dpsStdev).toBeCloseTo(0, 9);
  });

  it('shares the damage out across the abilities that dealt it', () => {
    const result = simulate(config(), mageFrost);
    const share = result.abilities.reduce((sum, a) => sum + a.share, 0);
    expect(share).toBeCloseTo(1, 9);
  });

  it('warns that the numbers are a Classic baseline', () => {
    const result = simulate(config(), mageFrost);
    expect(result.notes.join(' ')).toContain('unverified for Forever');
  });

  it('reports progress as it goes', () => {
    const seen: number[] = [];
    const cfg = config();
    cfg.fight.iterations = 100;
    simulate(cfg, mageFrost, { onProgress: (p) => seen.push(p.done), progressEvery: 25 });
    expect(seen).toEqual([25, 50, 75, 100]);
  });
});

describe('one iteration on its own', () => {
  it('is what the run averages over', () => {
    const cfg = config();
    const single = runIteration(cfg, mageFrost, 1);
    expect(single.damage / cfg.fight.duration).toBeCloseTo(AVERAGE_HIT / 3, 9);
  });
});
