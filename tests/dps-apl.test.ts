import { describe, expect, it } from 'vitest';

import { AplError, check, compile, condition, parse, variableNames } from '../src/dps/sim/apl';
import { linesOf } from '../src/dps/sim/rotation';
import { supportedSpecs, specModule } from '../src/dps/sim/specs';
import { simulate, AUTO_ATTACK_ID } from '../src/dps/sim/sim';
import { parseCharacterExport } from '../src/dps/importer';
import { SAMPLE_WARRIOR_EXPORT } from '../src/dps/sample-warrior';
import { deriveStatSheet } from '../src/dps/stats';
import type { RotationCtx } from '../src/dps/sim/rotation';
import type { FightConfig, SimConfig } from '../src/dps/sim/types';

const character = parseCharacterExport(SAMPLE_WARRIOR_EXPORT).character!;
const spec = specModule(character.specId)!;

/** A fight seen from inside, with everything at nothing unless it is set. */
function ctx(over: Partial<RotationCtx> = {}): RotationCtx {
  return {
    now: 0,
    timeLeft: 300,
    rage: 0,
    energy: 0,
    comboPoints: 0,
    manaPct: 1,
    targetHealthPct: 1,
    targets: 1,
    has: () => false,
    stacks: () => 0,
    remaining: () => 0,
    onTarget: () => false,
    targetStacks: () => 0,
    remainingOnTarget: () => 0,
    swingIn: () => 1,
    queued: () => false,
    ready: () => true,
    canAfford: () => true,
    cooldownLeft: () => 0,
    ...over,
  } as RotationCtx;
}

function fight(over: Partial<FightConfig> = {}): FightConfig {
  return {
    v: 2,
    style: { kind: 'patchwerk' },
    duration: 300,
    iterations: 60,
    seed: 20260915,
    target: { level: 63, armor: 3000, resistance: 0, behind: true, canParry: false, canBlock: false },
    buffs: [],
    debuffs: [],
    consumables: [],
    ...over,
  };
}

function configFor(f: FightConfig): SimConfig {
  return {
    specId: character.specId,
    stats: deriveStatSheet(character, f),
    talents: character.talentRanks,
    fight: f,
  };
}

describe('reading a condition', () => {
  it('compares a bar to a number', () => {
    const run = condition('rage > 45');
    expect(run(ctx({ rage: 50 }))).toBe(true);
    expect(run(ctx({ rage: 45 }))).toBe(false);
  });

  it('knows every comparison', () => {
    expect(condition('rage >= 45')(ctx({ rage: 45 }))).toBe(true);
    expect(condition('rage <= 45')(ctx({ rage: 45 }))).toBe(true);
    expect(condition('rage = 45')(ctx({ rage: 45 }))).toBe(true);
    expect(condition('rage != 45')(ctx({ rage: 45 }))).toBe(false);
    expect(condition('rage < 45')(ctx({ rage: 44 }))).toBe(true);
  });

  it('joins with and, or and not', () => {
    const run = condition('rage > 20 and target_health_pct < 0.2');
    expect(run(ctx({ rage: 30, targetHealthPct: 0.1 }))).toBe(true);
    expect(run(ctx({ rage: 30, targetHealthPct: 0.5 }))).toBe(false);

    expect(condition('rage > 90 or energy > 50')(ctx({ energy: 60 }))).toBe(true);
    expect(condition('not rage > 20')(ctx({ rage: 10 }))).toBe(true);
  });

  it('takes brackets where the order matters', () => {
    const loose = condition('rage > 10 or rage > 5 and energy > 100');
    const tight = condition('(rage > 10 or rage > 5) and energy > 100');
    expect(loose(ctx({ rage: 20, energy: 0 }))).toBe(true);
    expect(tight(ctx({ rage: 20, energy: 0 }))).toBe(false);
  });

  it('treats a bare name as whether it is there at all', () => {
    const run = condition('buff.flurry.up');
    expect(run(ctx({ has: (id) => id === 'flurry' }))).toBe(true);
    expect(run(ctx())).toBe(false);
  });

  it('reads a buff, a debuff, a cooldown and a swing', () => {
    expect(condition('buff.x.stacks >= 3')(ctx({ stacks: () => 3 }))).toBe(true);
    expect(condition('debuff.y.remains < 4')(ctx({ remainingOnTarget: () => 2 }))).toBe(true);
    expect(condition('cooldown.z.ready')(ctx({ cooldownLeft: () => 0 }))).toBe(true);
    expect(condition('cooldown.z.ready')(ctx({ cooldownLeft: () => 3 }))).toBe(false);
    expect(condition('swing.main.remains < 0.5')(ctx({ swingIn: () => 0.2 }))).toBe(true);
  });

  it('reads a talent rank from the build, not from the fight', () => {
    const run = condition('talent.flurry >= 4', { talents: { Flurry: 4 } });
    expect(run(ctx())).toBe(true);
    expect(condition('talent.flurry >= 4', { talents: {} })(ctx())).toBe(false);
  });
});

describe('when it will not read', () => {
  it('says which names there are', () => {
    let message = '';
    try {
      condition('energetic > 5');
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toContain('"energetic" is not something I can look at');
    for (const name of ['rage', 'energy', 'time_left']) expect(message).toContain(name);
  });

  it('objects to a comparison with nothing after it', () => {
    expect(() => condition('rage >')).toThrow(AplError);
    expect(check('rage >')).toContain('needs a number');
  });

  it('objects to a bracket left open', () => {
    expect(check('(rage > 5')).toContain('never closed');
  });

  it('objects to an empty condition', () => {
    expect(() => parse('   ')).toThrow(AplError);
  });

  it('is happy with nothing at all, which means always', () => {
    expect(check('')).toBeNull();
  });

  it('names more than one variable in its help', () => {
    expect(variableNames().length).toBeGreaterThan(8);
  });
});

describe('every spec ships a rotation this can read', () => {
  it('parses each line of each one', () => {
    for (const specId of supportedSpecs()) {
      const module = specModule(specId)!;
      for (const name of Object.keys(module.rotations)) {
        const lines = linesOf(module.rotations[name]!({ Flurry: 5, 'Improved Berserker Rage': 2 }));
        for (const line of lines) {
          const problem = check(line.text ?? '', { talents: { Flurry: 5 } });
          expect(problem, module.label + ' / ' + line.spellId + ': ' + line.text).toBeNull();
        }
      }
    }
  });

  it('agrees with the closure the spec wrote by hand', () => {
    // Every default line carries both a predicate and the words for it. They
    // have to mean the same thing, or the editor would be showing a lie.
    const entries = spec.rotations.standard!(character.talentRanks);
    for (const entry of entries) {
      if (!entry.when || !entry.text) continue;
      const written = compile(parse(entry.text), { talents: character.talentRanks });
      for (let i = 0; i < 200; i += 1) {
        const state = ctx({
          rage: Math.random() * 100,
          timeLeft: Math.random() * 300,
          targetHealthPct: Math.random(),
        });
        expect(written(state), entry.spellId + ': ' + entry.text).toBe(entry.when(state));
      }
    }
  });
});

describe('a rotation somebody wrote themselves', () => {
  it('replaces the spec\'s own', () => {
    const f = fight();
    const base = configFor(f);
    const plain = simulate(base, spec);

    // Bloodthirst taken out entirely: the damage has to fall.
    const without = simulate(
      { ...base, apl: [{ spellId: 'whirlwind' }, { spellId: 'heroic-strike', text: 'rage > 45' }] },
      spec,
    );
    expect(without.abilities.find((a) => a.id === 'bloodthirst')).toBeUndefined();
    expect(without.dps).toBeLessThan(plain.dps);
  });

  it('skips a line it cannot read rather than stopping the run', () => {
    const f = fight();
    const result = simulate(
      {
        ...configFor(f),
        apl: [{ spellId: 'bloodthirst', text: 'nonsense >' }, { spellId: 'whirlwind' }],
      },
      spec,
    );
    // The broken line is dropped; the rest of the rotation still runs.
    expect(result.dps).toBeGreaterThan(0);
    expect(result.abilities.find((a) => a.id === 'whirlwind')).toBeDefined();
  });

  it('honours a condition that never comes true', () => {
    const result = simulate(
      { ...configFor(fight()), apl: [{ spellId: 'bloodthirst', text: 'rage > 500' }] },
      spec,
    );
    expect(result.abilities.find((a) => a.id === 'bloodthirst')).toBeUndefined();
  });
});

describe('what the fight looks like', () => {
  it('takes swings away when you have to move', () => {
    const still = simulate(configFor(fight()), spec);
    const moving = simulate(
      configFor(fight({ style: { kind: 'movement', every: 60, for: 10 } })),
      spec,
    );

    const swingsStill = still.abilities.find((a) => a.id === AUTO_ATTACK_ID.main)!.casts;
    const swingsMoving = moving.abilities.find((a) => a.id === AUTO_ATTACK_ID.main)!.casts;

    // Ten seconds in every sixty is a sixth of the fight spent out of range.
    expect(swingsMoving).toBeLessThan(swingsStill);
    expect(swingsMoving / swingsStill).toBeGreaterThan(0.75);
    expect(swingsMoving / swingsStill).toBeLessThan(0.95);
    expect(moving.dps).toBeLessThan(still.dps);
  });

  it('says in the notes that the movement is on a timer', () => {
    const result = simulate(
      configFor(fight({ style: { kind: 'movement', every: 45, for: 5 } })),
      spec,
    );
    expect(result.notes.some((n) => n.includes('Moving for 5 seconds every 45'))).toBe(true);
  });

  it('sends Whirlwind at more than one thing and nothing else', () => {
    const one = simulate(configFor(fight()), spec);
    const three = simulate(configFor(fight({ style: { kind: 'cleave', targets: 3 } })), spec);

    const wwOne = one.abilities.find((a) => a.id === 'whirlwind')!;
    const wwThree = three.abilities.find((a) => a.id === 'whirlwind')!;
    const btOne = one.abilities.find((a) => a.id === 'bloodthirst')!;
    const btThree = three.abilities.find((a) => a.id === 'bloodthirst')!;

    // Whirlwind reaches up to four; Bloodthirst reaches one whatever is there.
    expect(wwThree.damage / wwOne.damage).toBeGreaterThan(2.5);
    expect(btThree.damage / btOne.damage).toBeCloseTo(1, 0);
  });

  it('is a Patchwerk fight when nothing says otherwise', () => {
    const plain = simulate(configFor(fight()), spec);
    const explicit = simulate(configFor(fight({ style: { kind: 'patchwerk' } })), spec);
    expect(plain.dps).toBe(explicit.dps);
  });
});
