import { describe, expect, it } from 'vitest';
import { compressToEncodedURIComponent } from 'lz-string';

import { configFor } from '../src/dps/client';
import { simConfig } from '../src/dps/config';
import { planCompare } from '../src/dps/compare';
import {
  SIM_REVISION, decodeReport, encodeReport, sameEngine, summarise, type Report,
} from '../src/dps/codec';
import type { FightConfig } from '../src/dps/sim/types';
import { parseCharacterExport } from '../src/dps/importer';
import { SAMPLE_WARRIOR_EXPORT } from '../src/dps/sample-warrior';
import { runIteration, simulate, traceIteration } from '../src/dps/sim/sim';
import { specModule } from '../src/dps/sim/specs';
import { effectsOn } from '../src/dps/stats';
import { linesOf, type RotationLine } from '../src/dps/sim/rotation';

const warrior = parseCharacterExport(SAMPLE_WARRIOR_EXPORT).character!;
const spec = specModule(warrior.specId)!;
const fight: FightConfig = {
  duration: 120,
  iterations: 20,
  seed: 42,
  target: { level: 63, armor: 3000, resistance: 0, behind: true, canParry: false, canBlock: false },
  buffs: [],
  debuffs: [],
  consumables: [],
};

/** The spec's own rotation with its first line removed: a rotation somebody wrote. */
function written(): RotationLine[] {
  const own = linesOf(Object.values(spec.rotations)[0]!(warrior.talentRanks));
  return own.slice(1);
}

function report(over: Partial<Report> = {}): Report {
  const result = simulate(configFor(warrior, fight, 'standard'), spec);
  return { character: warrior.source, fight, rotation: 'standard', summary: summarise(result), ...over };
}

describe('the build knows which simulator it carries', () => {
  it('has a revision, taken from the simulator files at build time', () => {
    expect(SIM_REVISION).toMatch(/^[0-9a-f]{12}$/);
  });
});

describe('a report records what the run used', () => {
  it('keeps a written rotation and the simulator it came from', () => {
    const apl = written();
    const decoded = decodeReport(encodeReport(report({ apl, engine: SIM_REVISION })))!;
    expect(decoded.apl).toEqual(apl);
    expect(decoded.engine).toBe(SIM_REVISION);
    expect(sameEngine(decoded)).toBe(true);
  });

  it('is not replayed by a different simulator', () => {
    const decoded = decodeReport(encodeReport(report({ engine: '000000000000' })))!;
    expect(sameEngine(decoded)).toBe(false);
  });

  it('still opens a report from before the simulator was recorded, but never as current', () => {
    const old = compressToEncodedURIComponent(JSON.stringify([2, report()]));
    const decoded = decodeReport(old)!;
    expect(decoded).not.toBeNull();
    expect(decoded.engine).toBeUndefined();
    expect(decoded.apl).toBeUndefined();
    expect(sameEngine(decoded)).toBe(false);
  });
});

describe('a replay is the fight that was run', () => {
  it('carries the written rotation and the worn trinkets, as the run did', () => {
    const apl = written();
    const config = configFor(warrior, fight, 'standard', apl);
    expect(config.apl).toEqual(apl);
    expect(config.effects?.map((e) => e.name)).toEqual(effectsOn(warrior).effects.map((e) => e.name));
    expect(config.effects?.length).toBeGreaterThan(0);
  });

  it('a written rotation changes the replayed fight, so leaving it out would show a different one', () => {
    const seed = 7;
    const single = { ...fight, iterations: 1 };
    const own = traceIteration(configFor(warrior, single, 'standard'), spec, seed);
    const theirs = traceIteration(configFor(warrior, single, 'standard', written()), spec, seed);
    expect(JSON.stringify(theirs)).not.toBe(JSON.stringify(own));
  });
});

describe('a report link that is not really one', () => {
  const pack = (value: unknown) => compressToEncodedURIComponent(JSON.stringify(value));
  const good = () => JSON.parse(JSON.stringify(report({ engine: SIM_REVISION }))) as any;

  it('refuses an empty character and summary', () => {
    expect(decodeReport(pack([2, { character: {}, summary: {} }]))).toBeNull();
    expect(decodeReport(pack([3, { character: {}, summary: {} }]))).toBeNull();
  });

  it('refuses a fight whose parts are the wrong kind', () => {
    const bad = good();
    bad.fight.buffs = 'all of them';
    expect(decodeReport(pack([3, bad]))).toBeNull();
    const worse = good();
    worse.fight.iterations = '1e9';
    expect(decodeReport(pack([3, worse]))).toBeNull();
  });

  it('refuses a summary missing what the page draws', () => {
    const bad = good();
    delete bad.summary.representative;
    expect(decodeReport(pack([3, bad]))).toBeNull();
    const worse = good();
    worse.summary.dps = 'lots';
    expect(decodeReport(pack([3, worse]))).toBeNull();
  });

  it('refuses a written rotation that is not a list of lines', () => {
    const bad = good();
    bad.apl = [{ text: 'no spell' }];
    expect(decodeReport(pack([3, bad]))).toBeNull();
  });

  it('still opens a real one', () => {
    expect(decodeReport(pack([3, good()]))).not.toBeNull();
  });
});

describe('one config builder for every kind of run', () => {
  const single = { ...fight, iterations: 1 };
  /** One iteration replayed from its seed, the way the timeline replays it, as damage per second. */
  const dpsOf = (config: ReturnType<typeof simConfig>, seed: number) =>
    runIteration(config, spec, seed).damage / config.fight.duration;

  it('replays the representative fight of a run with a written rotation and a trinket, exactly', () => {
    const apl = written();
    const inputs = { character: warrior, fight: { ...fight, iterations: 30 }, rotation: 'standard', apl };
    const config = simConfig(inputs);
    expect(config.effects?.length).toBeGreaterThan(0);
    expect(config.apl).toEqual(apl);

    const result = simulate(config, spec);
    const rep = result.representative;
    const replay = simConfig({ ...inputs, fight: single });
    expect(dpsOf(replay, rep.seed)).toBeCloseTo(rep.dps, 6);
    // The timeline drawn from the same config is that fight, event for event, every time.
    expect(traceIteration(replay, spec, rep.seed)).toEqual(traceIteration(simConfig({ ...inputs, fight: single }), spec, rep.seed));

    // Leaving out either input is a different fight, which is what the replay used to draw.
    expect(dpsOf(simConfig({ ...inputs, fight: single, apl: null }), rep.seed)).not.toBeCloseTo(rep.dps, 6);
    expect(dpsOf({ ...replay, effects: [] }, rep.seed)).not.toBeCloseTo(rep.dps, 6);
  });

  it('builds the same config for a checked swap as for the run and top gear', () => {
    const apl = written();
    const plan = planCompare(warrior, fight, [{ slot: 'trinket1', item: null }], fight.iterations, 'standard', apl);
    // Functions dropped, and the numbered id each build gives a trinket's aura evened out.
    const strip = (c: object) =>
      JSON.stringify(c, (_k, v) => (typeof v === 'function' ? undefined : v)).replace(/-use-\d+/g, '-use-n');
    expect(strip(plan.base)).toBe(strip(simConfig({ character: warrior, fight, rotation: 'standard', apl })));
    expect(strip(plan.swaps[0]!.config)).toBe(
      strip(simConfig({ character: warrior, fight, rotation: 'standard', apl, loadout: { trinket1: null } })),
    );
    expect(strip(configFor(warrior, fight, 'standard', apl))).toBe(strip(simConfig({ character: warrior, fight, rotation: 'standard', apl })));
  });
});
