import { describe, expect, it } from 'vitest';

import { simulate } from '../src/dps/sim/sim';
import { emptyStatSheet, type FightConfig, type SimConfig, type StatSheet } from '../src/dps/sim/types';
import { IGNITE_ID, MAGE_AURAS, mageArcane, mageFire } from '../src/dps/sim/specs/mage-fire-arcane';
import { ARCANE_MISSILES, FIREBALL } from '../src/dps/data/mage-fire-arcane';
import { specModule, supportedSpecs } from '../src/dps/sim/specs';
import { parseCharacterExport } from '../src/dps/importer';
import { SAMPLE_MAGE_FIRE_EXPORT } from '../src/dps/sample-mage-fire';
import { deriveStatSheet, effectsOn } from '../src/dps/stats';
import { defaultsFor } from '../src/dps/data/buffs';

function fight(over: Partial<FightConfig> = {}): FightConfig {
  return {
    v: 2,
    style: { kind: 'patchwerk' },
    duration: 300,
    iterations: 1,
    seed: 1,
    target: { level: 63, armor: 0, resistance: 0, behind: false, canParry: true, canBlock: false },
    buffs: [],
    debuffs: [],
    consumables: [],
    overrides: { forceAverageDamage: true, forceSpellHit: 1, forceSpellCrit: 0, infiniteMana: true },
    ...over,
  };
}

function caster(): StatSheet {
  const stats = emptyStatSheet(60);
  stats.mana = 100000;
  return stats;
}

const fire = (talents: Record<string, number>, apl: SimConfig['apl'], over: Partial<FightConfig> = {}) =>
  simulate({ specId: 41, stats: caster(), talents, fight: fight(over), apl }, mageFire);
const arcane = (talents: Record<string, number>, apl: SimConfig['apl'], over: Partial<FightConfig> = {}) =>
  simulate({ specId: 81, stats: caster(), talents, fight: fight(over), apl }, mageArcane);

const crits = { overrides: { forceAverageDamage: true, forceSpellHit: 1, forceSpellCrit: 1, infiniteMana: true } };

describe('the registry', () => {
  it('has Fire and Arcane in it, and Frost is still its own', () => {
    expect(supportedSpecs()).toContain(41);
    expect(supportedSpecs()).toContain(81);
    expect(specModule(41)).toBe(mageFire);
    expect(specModule(81)).toBe(mageArcane);
    expect(specModule(61)?.label).toBe('Frost Mage');
  });
});

describe('damage over time', () => {
  it('is replaced by the next cast rather than stacking beside it', () => {
    // Fireball's burn ticks every two seconds and a Fireball lands every three
    // and a half, so each burn gets one tick in before the next replaces it.
    // Left running beside each other, there would be four for every bolt.
    const result = fire({}, [{ spellId: 'fireball' }]);
    const bolts = result.abilities.find((a) => a.id === 'fireball')!.casts;
    const ticks = result.abilities.find((a) => a.id === 'fireball-dot')!.hits;
    expect(ticks).toBe(bolts);
  });
});

describe('Fire', () => {
  it('Ignite burns for forty per cent of a critical strike over four seconds', () => {
    const result = fire({ Ignite: 5 }, [{ spellId: 'scorch' }], crits);
    const scorch = result.abilities.find((a) => a.id === 'scorch')!;
    const ignite = result.abilities.find((a) => a.id === IGNITE_ID)!;
    expect(ignite.name).toBe('Ignite');
    // Less the last burn, which the end of the fight cuts short.
    expect(ignite.damage / scorch.damage).toBeCloseTo(0.4, 1);
    expect(scorch.crits).toBe(scorch.hits);
  });

  it('Improved Scorch stacks to five and raises Fire damage by three per cent a stack', () => {
    const plain = fire({}, [{ spellId: 'fireball' }]);
    const scorched = fire(
      { 'Improved Scorch': 3 },
      [{ spellId: 'scorch', text: 'debuff.fire-vulnerability.stacks < 5' }, { spellId: 'fireball' }],
    );
    const per = (r: typeof plain) => {
      const t = r.abilities.find((a) => a.id === 'fireball')!;
      return t.damage / t.hits;
    };
    // Nearly every Fireball lands on five stacks; the first few do not.
    expect(per(scorched) / per(plain)).toBeGreaterThan(1.13);
    expect(per(scorched) / per(plain)).toBeLessThanOrEqual(1.15 + 1e-9);
    expect(scorched.auras.some((a) => a.id === MAGE_AURAS.fireVulnerability)).toBe(true);
  });

  it('Hot Streak takes a quarter off Pyroblast for each stack', () => {
    const apl = [
      { spellId: 'pyroblast', text: 'buff.hot-streak.stacks >= 3' },
      { spellId: 'scorch' },
    ];
    const result = fire({ 'Hot Streak': 1, Pyroblast: 1 }, apl, crits);
    const pyro = result.abilities.find((a) => a.id === 'pyroblast')!;
    // Three Scorches and a Pyroblast of a second and a half: six seconds a round.
    expect(pyro.casts).toBeGreaterThanOrEqual(48);
  });

  it('Combustion stops after four critical strikes', () => {
    const result = fire({ Combustion: 1 }, [{ spellId: 'combustion' }, { spellId: 'scorch' }], crits);
    const uptime = result.auras.find((a) => a.id === MAGE_AURAS.combustion)!.uptime;
    // Four Scorches a second and a half apart, twice in a five minute fight.
    expect(uptime).toBeLessThan(2 * 4 * 1.5 + 1);
  });

  it('Improved Fireball takes half a second off at five ranks', () => {
    const slow = fire({}, [{ spellId: 'fireball' }]);
    const fast = fire({ 'Improved Fireball': 5 }, [{ spellId: 'fireball' }]);
    expect(slow.abilities.find((a) => a.id === 'fireball')!.casts).toBe(Math.floor(300 / FIREBALL.castTime));
    expect(fast.abilities.find((a) => a.id === 'fireball')!.casts).toBe(100);
  });
});

describe('Arcane', () => {
  it('Arcane Missiles is five missiles, each rolled on its own', () => {
    const result = arcane({}, [{ spellId: 'arcane-missiles' }]);
    const missiles = result.abilities.find((a) => a.id === 'arcane-missiles')!;
    expect(missiles.casts).toBe(60);
    expect(missiles.hits).toBe(300);
    expect(missiles.damage / missiles.hits).toBeCloseTo(ARCANE_MISSILES.maxDamage / 5, 6);
  });

  it('Arcane Blast raises the next other spell and then its stacks are gone', () => {
    const apl = [
      { spellId: 'arcane-blast', text: 'buff.arcane-blast.stacks < 2' },
      { spellId: 'arcane-missiles' },
    ];
    const result = arcane({ 'Arcane Blast': 1 }, apl);
    const missiles = result.abilities.find((a) => a.id === 'arcane-missiles')!;
    // Two stacks before every Missiles, so each missile is a fifth larger.
    expect(missiles.damage / missiles.hits).toBeCloseTo((ARCANE_MISSILES.maxDamage / 5) * 1.2, 6);
  });

  it('Missile Barrage halves the next Missiles and makes it free', () => {
    const apl = [
      { spellId: 'arcane-missiles', text: 'buff.missile-barrage.up' },
      { spellId: 'arcane-blast' },
    ];
    const without = arcane({ 'Arcane Blast': 1 }, apl, { iterations: 20 });
    const withIt = arcane({ 'Arcane Blast': 1, 'Missile Barrage': 1 }, apl, { iterations: 20 });
    expect(without.abilities.find((a) => a.id === 'arcane-missiles')).toBeUndefined();
    expect(withIt.abilities.find((a) => a.id === 'arcane-missiles')!.casts).toBeGreaterThan(10);
  });

  it('Arcane Power adds thirty per cent while it lasts', () => {
    // Fourteen seconds, so both Missiles that land do so inside the fifteen.
    const plain = arcane({}, [{ spellId: 'arcane-missiles' }], { duration: 14 });
    const powered = arcane(
      { 'Arcane Power': 1 },
      [{ spellId: 'arcane-power' }, { spellId: 'arcane-missiles' }],
      { duration: 14 },
    );
    expect(powered.dps / plain.dps).toBeCloseTo(1.3, 6);
  });
});

describe('the sample fire mage', () => {
  const character = parseCharacterExport(SAMPLE_MAGE_FIRE_EXPORT).character!;

  it('reads in whole as a Fire mage', () => {
    expect(character.classId).toBe('mage');
    expect(specModule(character.specId)?.label).toBe('Fire Mage');
  });

  it('casts Fireball, keeps Scorch up, ignites and runs its mana down', () => {
    const caster = defaultsFor('caster');
    const f = fight({ overrides: undefined, iterations: 30, buffs: caster.buffs, consumables: caster.consumables });
    const config: SimConfig = {
      specId: character.specId,
      stats: deriveStatSheet(character, f),
      talents: character.talentRanks,
      fight: f,
      ...effectsOn(character),
    };
    const result = simulate(config, mageFire);
    const ids = result.abilities.map((a) => a.id);
    for (const id of ['fireball', 'scorch', IGNITE_ID, 'combustion']) expect(ids).toContain(id);
    expect(result.dps).toBeGreaterThan(200);
  });
});
