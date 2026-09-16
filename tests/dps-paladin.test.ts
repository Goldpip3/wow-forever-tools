import { describe, expect, it } from 'vitest';

import { simulate, AUTO_ATTACK_ID } from '../src/dps/sim/sim';
import { emptyStatSheet, type FightConfig, type SimConfig, type StatSheet } from '../src/dps/sim/types';
import { paladinRetribution, PALADIN_AURAS, SEAL_HIT_ID } from '../src/dps/sim/specs/paladin-retribution';
import { HAMMER_OF_WRATH } from '../src/dps/data/paladin';
import { specModule, supportedSpecs } from '../src/dps/sim/specs';
import { parseCharacterExport } from '../src/dps/importer';
import { SAMPLE_PALADIN_EXPORT } from '../src/dps/sample-paladin';
import { deriveStatSheet, effectsOn } from '../src/dps/stats';
import { defaultsFor } from '../src/dps/data/buffs';

const HIT = { miss: 0, dodge: 0, parry: 0, glance: 0, block: 0, crit: 0 };

function fight(over: Partial<FightConfig> = {}): FightConfig {
  return {
    v: 2,
    style: { kind: 'patchwerk' },
    duration: 300,
    iterations: 1,
    seed: 1,
    target: { level: 63, armor: 0, resistance: 0, behind: true, canParry: false, canBlock: false },
    buffs: [],
    debuffs: [],
    consumables: [],
    overrides: { forceAverageDamage: true, forceMeleeTable: HIT, forceSpellHit: 1, forceSpellCrit: 0, infiniteMana: true },
    ...over,
  };
}

function paladin(): StatSheet {
  const stats = emptyStatSheet(60);
  stats.mana = 100000;
  stats.weapons = {
    main: { min: 300, max: 300, speed: 3, skill: 300, type: 'Two-Handed Swords', twoHanded: true },
  };
  return stats;
}

const run = (talents: Record<string, number>, over: Partial<FightConfig> = {}, apl?: SimConfig['apl']) =>
  simulate({ specId: 381, stats: paladin(), talents, fight: fight(over), apl }, paladinRetribution);

describe('the registry', () => {
  it('has Retribution in it', () => {
    expect(supportedSpecs()).toContain(381);
    expect(specModule(381)).toBe(paladinRetribution);
  });
});

describe('Seal of Command', () => {
  it('fires about seven times a minute, as Holy that armor does not touch', () => {
    const armored = { level: 63, armor: 3000, resistance: 0, behind: true, canParry: false, canBlock: false };
    const result = run({ 'Seal of Command': 1 }, { iterations: 60, target: armored }, [{ spellId: 'seal-of-command' }]);
    const seal = result.abilities.find((a) => a.id === SEAL_HIT_ID)!;
    expect(seal.name).toBe('Seal of Command, from swings');
    const perMinute = seal.casts / 5;
    expect(perMinute).toBeGreaterThan(6);
    expect(perMinute).toBeLessThan(8);
    // Seventy per cent of a 300 swing, with no armor taken off.
    expect(seal.damage / seal.hits).toBeCloseTo(210, 6);
  });

  it('is not pressed without the talent', () => {
    const result = run({});
    expect(result.abilities.find((a) => a.id === 'seal-of-command')).toBeUndefined();
    expect(result.abilities.find((a) => a.id === SEAL_HIT_ID)).toBeUndefined();
  });
});

describe('Judgement', () => {
  it('leaves the seal up and comes back in ten seconds, nine with Improved Judgement', () => {
    const talents = { 'Seal of Command': 1 };
    const apl = paladinRetribution.rotations.standard!(talents).slice(0, 2);
    const plain = run({ 'Seal of Command': 1 }, {}, apl);
    const improved = run({ 'Seal of Command': 1, 'Improved Judgement': 1 }, {}, apl);
    expect(plain.abilities.find((a) => a.id === 'judgement')!.casts).toBe(30);
    // Nine seconds would be thirty-four; refreshing the seal on the global cooldown
    // now and then holds one back a moment.
    expect(improved.abilities.find((a) => a.id === 'judgement')!.casts).toBeGreaterThanOrEqual(32);
    // One seal, refreshed with two seconds left: Judgement never took it away.
    expect(plain.abilities.find((a) => a.id === 'seal-of-command')!.casts).toBe(Math.ceil(300 / 28));
    expect(plain.auras.find((a) => a.id === PALADIN_AURAS.seal)!.uptime).toBeGreaterThan(299);
  });
});

describe('Hammer of Wrath', () => {
  it('only goes out in the last fifth of the fight', () => {
    const result = run({}, {}, [{ spellId: 'hammer-of-wrath' }]);
    const hammer = result.abilities.find((a) => a.id === 'hammer-of-wrath')!;
    expect(hammer.casts).toBeGreaterThan(0);
    expect(hammer.casts).toBeLessThanOrEqual(Math.ceil(60 / HAMMER_OF_WRATH.cooldown!) + 1);
  });

  it('is instant with both ranks of Instrument of Law', () => {
    const slow = run({}, {}, [{ spellId: 'hammer-of-wrath' }]);
    const fast = run({ 'Instrument of Law': 2 }, {}, [{ spellId: 'hammer-of-wrath' }]);
    expect(fast.abilities.find((a) => a.id === 'hammer-of-wrath')!.casts)
      .toBeGreaterThanOrEqual(slow.abilities.find((a) => a.id === 'hammer-of-wrath')!.casts);
    // Swinging never stops for it either way; an instant does not clip a swing.
    expect(fast.abilities.find((a) => a.id === AUTO_ATTACK_ID.main)!.casts).toBe(100);
  });
});

describe('Vengeance', () => {
  it('stacks on crits and raises Physical damage', () => {
    const crits = { ...HIT, crit: 100 };
    const over = { overrides: { forceAverageDamage: true, forceMeleeTable: crits, infiniteMana: true } };
    const plain = run({}, over, []);
    const avenged = run({ Vengeance: 3 }, over, []);
    // Five stacks of three per cent, less the first few swings spent building them.
    expect(avenged.dps / plain.dps).toBeGreaterThan(1.14);
    expect(avenged.dps / plain.dps).toBeLessThanOrEqual(1.15);
    expect(avenged.auras.some((a) => a.id === PALADIN_AURAS.vengeance)).toBe(true);
  });
});

describe('the sample paladin', () => {
  const character = parseCharacterExport(SAMPLE_PALADIN_EXPORT).character!;

  it('reads in whole as a Retribution paladin with a two-hander', () => {
    expect(character.classId).toBe('paladin');
    expect(specModule(character.specId)?.label).toBe('Retribution Paladin');
    const stats = deriveStatSheet(character, fight({ overrides: undefined }));
    expect(stats.weapons.main?.twoHanded).toBe(true);
  });

  it('swings, seals, judges and strikes', () => {
    const melee = defaultsFor('melee');
    const f = fight({
      overrides: undefined, iterations: 30, buffs: melee.buffs, consumables: melee.consumables,
      target: { level: 63, armor: 3000, resistance: 0, behind: true, canParry: false, canBlock: false },
    });
    const config: SimConfig = {
      specId: character.specId,
      stats: deriveStatSheet(character, f),
      talents: character.talentRanks,
      fight: f,
      ...effectsOn(character),
    };
    const result = simulate(config, paladinRetribution);
    const ids = result.abilities.map((a) => a.id);
    for (const id of [AUTO_ATTACK_ID.main, SEAL_HIT_ID, 'judgement', 'holy-strike']) expect(ids).toContain(id);
    expect(result.dps).toBeGreaterThan(100);
  });
});
