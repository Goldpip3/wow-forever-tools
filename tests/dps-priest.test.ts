import { describe, expect, it } from 'vitest';

import { simulate } from '../src/dps/sim/sim';
import { emptyStatSheet, type FightConfig, type SimConfig, type StatSheet } from '../src/dps/sim/types';
import { PRIEST_AURAS, priestShadow } from '../src/dps/sim/specs/priest-shadow';
import { MIND_FLAY, SHADOW_WORD_PAIN } from '../src/dps/data/priest';
import { specModule, supportedSpecs } from '../src/dps/sim/specs';
import { parseCharacterExport } from '../src/dps/importer';
import { SAMPLE_PRIEST_EXPORT } from '../src/dps/sample-priest';
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
  simulate({ specId: 203, stats: caster(), talents, fight: fight(over), apl }, priestShadow);

const row = (r: ReturnType<typeof run>, id: string) => r.abilities.find((a) => a.id === id)!;

describe('the registry', () => {
  it('has Shadow in it', () => {
    expect(supportedSpecs()).toContain(203);
    expect(specModule(203)).toBe(priestShadow);
  });
});

describe('Shadow Word: Pain', () => {
  it('runs two ticks longer with Improved Shadow Word: Pain, each worth what the others are', () => {
    const apl = [{ spellId: 'shadow-word-pain', text: 'not debuff.shadow-word-pain.up' }];
    const plain = run({}, apl, { duration: 18 });
    const longer = run({ 'Improved Shadow Word: Pain': 2 }, apl, { duration: 24 });
    const tick = SHADOW_WORD_PAIN.dot!.damage / SHADOW_WORD_PAIN.dot!.ticks;
    expect(row(plain, 'shadow-word-pain-dot').hits).toBe(6);
    expect(row(longer, 'shadow-word-pain-dot').hits).toBe(8);
    expect(row(longer, 'shadow-word-pain-dot').damage / 8).toBeCloseTo(tick, 6);
  });
});

describe('Mind Blast', () => {
  it('comes back two and a half seconds sooner with Improved Mind Blast', () => {
    const plain = run({}, [{ spellId: 'mind-blast' }]);
    const improved = run({ 'Improved Mind Blast': 5 }, [{ spellId: 'mind-blast' }]);
    expect(row(plain, 'mind-blast').casts).toBeLessThanOrEqual(38);
    expect(row(improved, 'mind-blast').casts).toBeGreaterThan(row(plain, 'mind-blast').casts + 10);
  });
});

describe('Mind Flay', () => {
  it('is three ticks, and only for a priest with the talent', () => {
    const rotation = priestShadow.rotations.standard!;
    const withFlay = simulate(
      { specId: 203, stats: caster(), talents: { 'Mind Flay': 1 }, fight: fight() },
      priestShadow,
    );
    const without = simulate({ specId: 203, stats: caster(), talents: {}, fight: fight() }, priestShadow);
    const flay = row(withFlay, 'mind-flay');
    expect(flay.hits).toBe(flay.casts * 3);
    expect(flay.damage / flay.hits).toBeCloseTo(MIND_FLAY.maxDamage / 3, 6);
    expect(without.abilities.find((a) => a.id === 'mind-flay')).toBeUndefined();
    expect(row(without, 'smite').casts).toBeGreaterThan(0);
    expect(rotation({}).some((e) => e.spellId === 'smite')).toBe(true);
  });
});

describe('Shadowform', () => {
  it('adds a tenth to Shadow damage, halves the cost and doubles the critical bonus', () => {
    const apl = [{ spellId: 'mind-blast' }];
    const plain = run({}, apl);
    const form = run({ Shadowform: 1 }, apl);
    expect(row(form, 'mind-blast').damage / row(plain, 'mind-blast').damage).toBeCloseTo(1.1, 6);
    const crits = { overrides: { forceAverageDamage: true, forceSpellHit: 1, forceSpellCrit: 1, infiniteMana: true } };
    const plainCrit = run({}, apl, crits);
    const formCrit = run({ Shadowform: 1 }, apl, crits);
    // Half again becomes twice, and the tenth on top.
    expect(row(formCrit, 'mind-blast').damage / row(plainCrit, 'mind-blast').damage).toBeCloseTo((2 / 1.5) * 1.1, 6);
  });
});

describe('Shadow Weaving', () => {
  it('stacks to five on the priest and raises Shadow damage by two per cent a stack', () => {
    const apl = [{ spellId: 'mind-blast' }];
    const plain = run({}, apl);
    const woven = run({ 'Shadow Weaving': 3 }, apl);
    const ratio = row(woven, 'mind-blast').damage / row(plain, 'mind-blast').damage;
    expect(ratio).toBeGreaterThan(1.09);
    expect(ratio).toBeLessThanOrEqual(1.1 + 1e-9);
    expect(woven.auras.some((a) => a.id === PRIEST_AURAS.shadowWeaving)).toBe(true);
  });
});

describe('the sample priest', () => {
  const character = parseCharacterExport(SAMPLE_PRIEST_EXPORT).character!;

  it('reads in whole as a Shadow priest', () => {
    expect(character.classId).toBe('priest');
    expect(specModule(character.specId)?.label).toBe('Shadow Priest');
  });

  it('keeps Pain up, blasts and flays', () => {
    const caster = defaultsFor('caster');
    const f = fight({ overrides: undefined, iterations: 30, buffs: caster.buffs, consumables: caster.consumables });
    const config: SimConfig = {
      specId: character.specId,
      stats: deriveStatSheet(character, f),
      talents: character.talentRanks,
      fight: f,
      ...effectsOn(character),
    };
    const result = simulate(config, priestShadow);
    const ids = result.abilities.map((a) => a.id);
    for (const id of ['shadow-word-pain-dot', 'mind-blast', 'mind-flay']) expect(ids).toContain(id);
    expect(result.dps).toBeGreaterThan(200);
  });
});
