import { describe, expect, it } from 'vitest';

import { simulate } from '../src/dps/sim/sim';
import { emptyStatSheet, type FightConfig, type SimConfig, type StatSheet } from '../src/dps/sim/types';
import { BALANCE_AURAS, druidBalance } from '../src/dps/sim/specs/druid-balance';
import { MOONFIRE } from '../src/dps/data/druid';
import { specModule, supportedSpecs } from '../src/dps/sim/specs';
import { parseCharacterExport } from '../src/dps/importer';
import { SAMPLE_DRUID_BALANCE_EXPORT } from '../src/dps/sample-druid-balance';
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

const run = (talents: Record<string, number>, apl: SimConfig['apl'], over: Partial<FightConfig> = {}) =>
  simulate({ specId: 283, stats: caster(), talents, fight: fight(over), apl }, druidBalance);

const row = (r: ReturnType<typeof run>, id: string) => r.abilities.find((a) => a.id === id)!;

describe('the registry', () => {
  it('has Balance in it beside Feral', () => {
    expect(supportedSpecs()).toContain(283);
    expect(specModule(283)).toBe(druidBalance);
    expect(specModule(281)?.label).toBe('Feral Druid');
  });
});

describe('Eclipse', () => {
  it('makes the two Starfires after a Wrath faster', () => {
    const apl = [{ spellId: 'wrath', text: 'buff.eclipse.stacks < 1' }, { spellId: 'starfire' }];
    // A sixth of a second off each at one rank, half a second at three.
    const one = run({ Eclipse: 1 }, apl);
    const three = run({ Eclipse: 3 }, apl);
    expect(row(one, 'starfire').casts).toBeGreaterThanOrEqual(row(one, 'wrath').casts * 2 - 1);
    expect(row(three, 'starfire').casts).toBeGreaterThan(row(one, 'starfire').casts);
    expect(three.auras.some((a) => a.id === BALANCE_AURAS.eclipse)).toBe(true);
  });

  it('is what puts Wrath in the rotation', () => {
    const lines = (talents: Record<string, number>) => druidBalance.rotations.standard!(talents).map((e) => e.spellId);
    const without = run({}, undefined);
    const withIt = run({ Eclipse: 3 }, undefined);
    expect(lines({ Eclipse: 3 })).toContain('wrath');
    expect(without.abilities.find((a) => a.id === 'wrath')).toBeUndefined();
    expect(row(withIt, 'wrath').casts).toBeGreaterThan(0);
  });
});

describe("Nature's Splendor", () => {
  it('adds a tick to Moonfire', () => {
    const apl = [{ spellId: 'moonfire', text: 'not debuff.moonfire.up' }];
    const plain = run({}, apl, { duration: 12 });
    const longer = run({ "Nature's Splendor": 1 }, apl, { duration: 15 });
    expect(row(plain, 'moonfire-dot').hits).toBe(MOONFIRE.dot!.ticks);
    expect(row(longer, 'moonfire-dot').hits).toBe(MOONFIRE.dot!.ticks + 1);
  });
});

describe("Nature's Grace", () => {
  it('speeds up the cast after a critical strike', () => {
    const crits = { overrides: { forceAverageDamage: true, forceSpellHit: 1, forceSpellCrit: 1, infiniteMana: true } };
    const plain = run({}, [{ spellId: 'starfire' }], crits);
    const graced = run({ "Nature's Grace": 1 }, [{ spellId: 'starfire' }], crits);
    // Every Starfire after the first goes a tenth faster.
    expect(row(graced, 'starfire').casts).toBeGreaterThan(row(plain, 'starfire').casts * 1.08);
  });
});

describe('Moonkin Form', () => {
  it('adds three per cent crit, and not again when Moonkin Aura is ticked', () => {
    const apl = [{ spellId: 'starfire' }];
    const over = { overrides: { forceAverageDamage: true, forceSpellHit: 1, infiniteMana: true }, iterations: 200 };
    const plain = run({}, apl, over);
    const form = run({ 'Moonkin Form': 1 }, apl, over);
    const both = run({ 'Moonkin Form': 1 }, apl, { ...over, buffs: ['moonkin-aura'] });
    const rate = (r: typeof plain) => row(r, 'starfire').crits / row(r, 'starfire').hits;
    expect(rate(form) - rate(plain)).toBeGreaterThan(0.02);
    expect(rate(form) - rate(plain)).toBeLessThan(0.04);
    // Ticked as a raid buff, the three per cent comes in on the sheet instead,
    // which this hand-built sheet does not have, so the form adds nothing.
    expect(rate(both) - rate(plain)).toBeLessThan(0.01);
  });
});

describe('the sample balance druid', () => {
  const character = parseCharacterExport(SAMPLE_DRUID_BALANCE_EXPORT).character!;

  it('reads in whole as a Balance druid', () => {
    expect(character.classId).toBe('druid');
    expect(specModule(character.specId)?.label).toBe('Balance Druid');
  });

  it('keeps Moonfire and Insect Swarm up and weaves Wrath into Starfire', () => {
    const caster = defaultsFor('caster');
    const f = fight({ overrides: undefined, iterations: 30, buffs: caster.buffs, consumables: caster.consumables });
    const config: SimConfig = {
      specId: character.specId,
      stats: deriveStatSheet(character, f),
      talents: character.talentRanks,
      fight: f,
      ...effectsOn(character),
    };
    const result = simulate(config, druidBalance);
    const ids = result.abilities.map((a) => a.id);
    for (const id of ['moonfire-dot', 'insect-swarm-dot', 'wrath', 'starfire']) expect(ids).toContain(id);
    expect(result.dps).toBeGreaterThan(200);
  });
});
