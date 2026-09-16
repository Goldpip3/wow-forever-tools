import { describe, expect, it } from 'vitest';

import { simulate, AUTO_ATTACK_ID } from '../src/dps/sim/sim';
import { emptyStatSheet, type FightConfig, type SimConfig, type StatSheet } from '../src/dps/sim/types';
import {
  druidFeral, DRUID_AURAS, RAKE_BLEED_ID, RIP_BLEED_ID, TIGERS_FURY_HIT_ID,
} from '../src/dps/sim/specs/druid-feral';
import { CAT_FORM, CAT_PAWS, RIP } from '../src/dps/data/druid';
import { specModule, supportedSpecs } from '../src/dps/sim/specs';
import { parseCharacterExport } from '../src/dps/importer';
import { SAMPLE_DRUID_EXPORT } from '../src/dps/sample-druid';
import { deriveStatSheet, effectsOn } from '../src/dps/stats';
import { defaultsFor } from '../src/dps/data/buffs';

const HIT = { miss: 0, dodge: 0, parry: 0, glance: 0, block: 0, crit: 0 };
const TARGET = { level: 63, armor: 0, resistance: 0, behind: true, canParry: false, canBlock: false };

function fight(over: Partial<FightConfig> = {}): FightConfig {
  return {
    v: 2,
    style: { kind: 'patchwerk' },
    duration: 300,
    iterations: 1,
    seed: 1,
    target: TARGET,
    buffs: [],
    debuffs: [],
    consumables: [],
    overrides: { forceAverageDamage: true, forceMeleeTable: HIT },
    ...over,
  };
}

/** A druid holding a slow two-hander, which the paws should ignore. */
function druid(): StatSheet {
  const stats = emptyStatSheet(60);
  stats.weapons = {
    main: { min: 500, max: 500, speed: 3.6, skill: 300, type: 'Staves', twoHanded: true },
  };
  return stats;
}

const run = (talents: Record<string, number>, over: Partial<FightConfig> = {}, apl?: SimConfig['apl']) =>
  simulate({ specId: 281, stats: druid(), talents, fight: fight(over), apl }, druidFeral);

describe('the registry', () => {
  it('has Feral in it', () => {
    expect(supportedSpecs()).toContain(281);
    expect(specModule(281)).toBe(druidFeral);
  });
});

describe('Cat Form', () => {
  it('swings the paws once a second, whatever is equipped', () => {
    const result = run({}, {}, [{ spellId: 'claw', text: 'energy > 200' }]);
    const swings = result.abilities.find((a) => a.id === AUTO_ATTACK_ID.main)!;
    expect(swings.casts).toBe(300);
    // Forty to sixty, plus the form's own attack power over a one second paw.
    const ap = CAT_FORM.flat;
    expect(swings.damage / swings.hits).toBeCloseTo((CAT_PAWS.min + CAT_PAWS.max) / 2 + ap / 14, 6);
  });

  it('turns agility into attack power', () => {
    const plain = run({}, {}, [{ spellId: 'claw', text: 'energy > 200' }]);
    const agile = simulate(
      {
        specId: 281, stats: { ...druid(), agility: 140 }, talents: {}, fight: fight(),
        apl: [{ spellId: 'claw', text: 'energy > 200' }],
      },
      druidFeral,
    );
    const per = (r: typeof plain) => {
      const s = r.abilities.find((a) => a.id === AUTO_ATTACK_ID.main)!;
      return s.damage / s.hits;
    };
    expect(per(agile) - per(plain)).toBeCloseTo(140 / 14, 6);
  });
});

describe('Shred', () => {
  it('is only pressed from behind', () => {
    const behind = run({});
    const facing = run({}, { target: { ...TARGET, behind: false } });
    expect(behind.abilities.find((a) => a.id === 'shred')!.casts).toBeGreaterThan(0);
    expect(facing.abilities.find((a) => a.id === 'shred')).toBeUndefined();
    expect(facing.abilities.find((a) => a.id === 'claw')!.casts).toBeGreaterThan(0);
    // From behind, Claw never spends the energy Shred was waiting for.
    expect(behind.abilities.find((a) => a.id === 'claw')).toBeUndefined();
  });
});

describe('Rip', () => {
  it('bleeds for 222 a point over twelve seconds, and is not refreshed while it runs', () => {
    const result = run({});
    const rip = result.abilities.find((a) => a.id === RIP_BLEED_ID)!;
    expect(rip.name).toBe('Rip, over time');
    const casts = result.abilities.find((a) => a.id === 'rip')!.casts;
    // Five points every time, in six ticks.
    expect(rip.damage / rip.hits).toBeCloseTo((RIP.perPoint * 5) / RIP.ticks, 6);
    expect(casts).toBeLessThanOrEqual(Math.ceil(300 / 12));
    expect(result.auras.some((a) => a.id === DRUID_AURAS.rip)).toBe(true);
  });

  it('keeps Rake up alongside it', () => {
    const result = run({});
    expect(result.abilities.find((a) => a.id === RAKE_BLEED_ID)!.damage).toBeGreaterThan(0);
  });
});

describe('the talents', () => {
  it('Berserk makes nearly every combo point strike a critical one', () => {
    const plain = simulate(
      {
        specId: 281, stats: druid(), talents: { Berserk: 1 }, fight: fight({ overrides: { forceAverageDamage: true } }),
        apl: [{ spellId: 'berserk' }, { spellId: 'claw', text: 'buff.berserk.up' }],
      },
      druidFeral,
    );
    const claw = plain.abilities.find((a) => a.id === 'claw')!;
    // A strike that got past the boss's dodge crits unless the table ran out of
    // room, which against a level 63 boss is most of them rather than all.
    expect(claw.crits / claw.hits).toBeGreaterThan(0.75);
  });

  it("King of the Jungle hands energy back through Tiger's Fury, which adds forty a hit", () => {
    const apl = [{ spellId: 'tigers-fury', text: 'not buff.tigers-fury.up' }, { spellId: 'claw' }];
    const without = run({}, {}, apl);
    const withIt = run({ 'King of the Jungle': 3 }, {}, apl);
    const claws = (r: typeof without) => r.abilities.find((a) => a.id === 'claw')?.casts ?? 0;
    expect(claws(withIt)).toBeGreaterThan(claws(without));
    const fury = withIt.abilities.find((a) => a.id === TIGERS_FURY_HIT_ID)!;
    expect(fury.damage / fury.hits).toBeCloseTo(40, 6);
  });

  it('Rend and Tear only helps while something bleeds', () => {
    const apl = [{ spellId: 'claw' }];
    const plain = run({}, {}, apl);
    const torn = run({ 'Rend and Tear': 5 }, {}, apl);
    expect(torn.dps).toBeCloseTo(plain.dps, 6);
  });

  it('Predatory Instincts raises what a pressed strike crits for and not a swing', () => {
    const crits = { overrides: { forceAverageDamage: true, forceMeleeTable: { ...HIT, crit: 100 } } };
    const apl = [{ spellId: 'claw' }];
    const plain = run({}, crits, apl);
    const sharp = run({ 'Predatory Instincts': 2 }, crits, apl);
    const swing = (r: typeof plain) => r.abilities.find((a) => a.id === AUTO_ATTACK_ID.main)!.damage;
    const claw = (r: typeof plain) => r.abilities.find((a) => a.id === 'claw')!.damage;
    expect(swing(sharp)).toBeCloseTo(swing(plain), 6);
    expect(claw(sharp) / claw(plain)).toBeCloseTo(2.2 / 2, 6);
  });
});

describe('the sample druid', () => {
  const character = parseCharacterExport(SAMPLE_DRUID_EXPORT).character!;

  it('reads in whole as a Feral druid', () => {
    expect(character.classId).toBe('druid');
    expect(specModule(character.specId)?.label).toBe('Feral Druid');
  });

  it('claws, shreds, bleeds and bites', () => {
    const melee = defaultsFor('melee');
    const f = fight({
      overrides: undefined, iterations: 30, buffs: melee.buffs, consumables: melee.consumables,
      target: { ...TARGET, armor: 3000 },
    });
    const config: SimConfig = {
      specId: character.specId,
      stats: deriveStatSheet(character, f),
      talents: character.talentRanks,
      fight: f,
      ...effectsOn(character),
    };
    const result = simulate(config, druidFeral);
    const ids = result.abilities.map((a) => a.id);
    for (const id of [AUTO_ATTACK_ID.main, 'shred', RIP_BLEED_ID, 'ferocious-bite']) expect(ids).toContain(id);
    expect(result.dps).toBeGreaterThan(100);
  });
});
