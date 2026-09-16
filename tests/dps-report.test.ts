import { describe, expect, it } from 'vitest';

import { simulate, traceIteration } from '../src/dps/sim/sim';
import { AuraTracker } from '../src/dps/sim/auras';
import {
  REPORT_BUDGET, decodeReport, encodeReport, summarise, type Report,
} from '../src/dps/codec';
import { parseCharacterExport } from '../src/dps/importer';
import { SAMPLE_WARRIOR_EXPORT } from '../src/dps/sample-warrior';
import { SAMPLE_EXPORT } from '../src/dps/sample';
import { deriveStatSheet } from '../src/dps/stats';
import { specModule } from '../src/dps/sim/specs';
import { defaultsFor } from '../src/dps/data/buffs';
import type { FightConfig, SimConfig } from '../src/dps/sim/types';

function fightFor(over: Partial<FightConfig> = {}): FightConfig {
  const melee = defaultsFor('melee');
  return {
    duration: 180,
    iterations: 200,
    seed: 20260915,
    target: { level: 63, armor: 3000, resistance: 0, behind: true, canParry: false, canBlock: false },
    buffs: melee.buffs,
    debuffs: ['sunder-armor'],
    consumables: melee.consumables,
    ...over,
  };
}

const warrior = parseCharacterExport(SAMPLE_WARRIOR_EXPORT).character!;
const warriorSpec = specModule(warrior.specId)!;

function configFor(character: typeof warrior, fight: FightConfig): SimConfig {
  return {
    specId: character.specId,
    stats: deriveStatSheet(character, fight),
    talents: character.talentRanks,
    fight,
  };
}

describe('counting how long an aura was up', () => {
  it('reads fifteen seconds for a fifteen second aura applied once', () => {
    const auras = new AuraTracker();
    auras.apply('x', 10, { duration: 15 });
    auras.closeAll(300);
    expect(auras.uptimes().get('x')).toBe(15);
  });

  it('stops at the end of the fight rather than running past it', () => {
    const auras = new AuraTracker();
    auras.apply('x', 295, { duration: 15 });
    auras.closeAll(300);
    expect(auras.uptimes().get('x')).toBe(5);
  });

  it('counts a refresh as one stretch rather than two', () => {
    const auras = new AuraTracker();
    auras.apply('x', 0, { duration: 10 });
    auras.apply('x', 5, { duration: 10 });
    auras.closeAll(100);
    // Up from zero to fifteen, without the overlap being counted twice.
    expect(auras.uptimes().get('x')).toBe(15);
  });

  it('closes when the last stack is spent', () => {
    const auras = new AuraTracker();
    auras.apply('proc', 0, { duration: 60 });
    auras.consume('proc', 4);
    auras.closeAll(100);
    expect(auras.uptimes().get('proc')).toBe(4);
  });

  it('does not count the gap when it ran out and came back', () => {
    const auras = new AuraTracker();
    auras.apply('x', 0, { duration: 5 });
    auras.apply('x', 50, { duration: 5 });
    auras.closeAll(100);
    expect(auras.uptimes().get('x')).toBe(10);
  });
});

describe('the spread', () => {
  const fight = fightFor();
  const result = simulate(configFor(warrior, fight), warriorSpec);

  it('puts every run in a bucket and loses none of them', () => {
    const counted = result.histogram.bins.reduce((sum, n) => sum + n, 0);
    expect(counted).toBe(result.iterations);
  });

  it('spans the runs that actually happened', () => {
    expect(result.histogram.min).toBeLessThanOrEqual(result.dps);
    expect(result.histogram.max).toBeGreaterThanOrEqual(result.dps);
  });

  it('names the auras that were up, with Flurry among them', () => {
    expect(result.auras.length).toBeGreaterThan(0);
    const flurry = result.auras.find((a) => a.id === 'flurry');
    expect(flurry).toBeDefined();
    expect(flurry!.uptime).toBeGreaterThan(0);
    expect(flurry!.uptime).toBeLessThanOrEqual(result.duration);
  });
});

describe('the run that came out in the middle', () => {
  const fight = fightFor();
  const config = configFor(warrior, fight);
  const result = simulate(config, warriorSpec);

  it('is a run that really happened, not an average of them', () => {
    expect(result.representative.index).toBeGreaterThanOrEqual(0);
    expect(result.representative.index).toBeLessThan(result.iterations);
    expect(Math.abs(result.representative.dps - result.dps)).toBeLessThan(result.dpsStdev);
  });

  it('replays to the same damage it reported', () => {
    const single = { ...config, fight: { ...fight, iterations: 1 } };
    const events = traceIteration(single, warriorSpec, result.representative.seed);
    const damage = events
      .filter((e) => e.kind === 'swing' || e.kind === 'land')
      .reduce((sum, e) => sum + (e.amount ?? 0), 0);

    // Deep Wounds ticks after the strike that caused it and is not a swing, so
    // the trace is a little short of the total rather than equal to it.
    expect(damage / fight.duration).toBeGreaterThan(result.representative.dps * 0.8);
    expect(damage / fight.duration).toBeLessThanOrEqual(result.representative.dps + 0.001);
  });

  it('replays identically twice', () => {
    const single = { ...config, fight: { ...fight, iterations: 1 } };
    const a = traceIteration(single, warriorSpec, result.representative.seed);
    const b = traceIteration(single, warriorSpec, result.representative.seed);
    expect(a.length).toBe(b.length);
    expect(a).toEqual(b);
  });

  it('writes down when the bar was full and when it was not', () => {
    const single = { ...config, fight: { ...fight, iterations: 1 } };
    const events = traceIteration(single, warriorSpec, result.representative.seed);
    const bar = events.filter((e) => e.kind === 'resource');
    expect(bar.length).toBeGreaterThan(10);
    for (const point of bar) {
      expect(point.value).toBeGreaterThanOrEqual(0);
      expect(point.value).toBeLessThanOrEqual(110);
    }
  });
});

describe('a link to a run', () => {
  function reportFor(exported: string, fight: FightConfig): Report {
    const character = parseCharacterExport(exported).character!;
    const spec = specModule(character.specId)!;
    const result = simulate(configFor(character, fight), spec);
    return { character: character.source, fight, summary: summarise(result) };
  }

  it('comes back out the way it went in', () => {
    const report = reportFor(SAMPLE_WARRIOR_EXPORT, fightFor());
    const decoded = decodeReport(encodeReport(report));
    expect(decoded).not.toBeNull();
    expect(decoded!.summary.dps).toBe(report.summary.dps);
    expect(decoded!.summary.abilities.length).toBe(report.summary.abilities.length);
    expect(decoded!.character.name).toBe('Sample');
    expect(decoded!.fight.duration).toBe(report.fight.duration);
  });

  it('drops the bags, because a link cannot carry a bank', () => {
    const report = reportFor(SAMPLE_WARRIOR_EXPORT, fightFor());
    const decoded = decodeReport(encodeReport(report))!;
    expect(decoded.character.bags).toEqual([]);
    expect(decoded.character.bank).toEqual([]);
    expect(Object.keys(decoded.character.equipped).length).toBeGreaterThan(10);
  });

  it('stays inside the budget for a warrior and for a mage', () => {
    for (const exported of [SAMPLE_WARRIOR_EXPORT, SAMPLE_EXPORT]) {
      const encoded = encodeReport(reportFor(exported, fightFor({ buffs: [], consumables: [], debuffs: [] })));
      expect(encoded.length).toBeLessThanOrEqual(REPORT_BUDGET);
    }
  });

  it('says no to something that is not one', () => {
    expect(decodeReport('')).toBeNull();
    expect(decodeReport('not a report')).toBeNull();
  });

  it('carries no notes, because they are rebuilt from the spec', () => {
    const report = reportFor(SAMPLE_WARRIOR_EXPORT, fightFor());
    expect('notes' in report.summary).toBe(false);
  });
});
