import { describe, expect, it } from 'vitest';

import { parseCharacterExport } from '../src/dps/importer';
import { SAMPLE_EXPORT } from '../src/dps/sample';
import { SAMPLE_WARRIOR_EXPORT } from '../src/dps/sample-warrior';
import { deriveStatSheet } from '../src/dps/stats';
import { simulate } from '../src/dps/sim/sim';
import { specModule } from '../src/dps/sim/specs';
import { DEFAULT_BUFFS, DEFAULT_CONSUMABLES, defaultsFor } from '../src/dps/data/buffs';
import type { FightConfig } from '../src/dps/sim/types';

/**
 * The number the sample mage comes out at, pinned.
 *
 * It is here to catch the change nobody meant to make. When the melee engine
 * went in, every part of the loop moved and this figure did not shift by a
 * single digit, which is the only way to know a caster was left alone. If a
 * change to the model moves it on purpose, move the number here in the same
 * commit and say why in the message.
 */
const SAMPLE_MAGE_DPS = 389.0250469287;

function fightFor(buffs: string[], consumables: string[]): FightConfig {
  return {
    duration: 300,
    iterations: 200,
    seed: 20260915,
    target: { level: 63, armor: 0, resistance: 0, behind: true, canParry: false, canBlock: false },
    buffs,
    debuffs: [],
    consumables,
  };
}

function run(exported: string, fight: FightConfig) {
  const character = parseCharacterExport(exported).character!;
  const spec = specModule(character.specId)!;
  const stats = deriveStatSheet(character, fight);
  return simulate({ specId: character.specId, stats, talents: character.talentRanks, fight }, spec);
}

describe('the sample mage', () => {
  it('still comes out where it always has', () => {
    const result = run(SAMPLE_EXPORT, fightFor([...DEFAULT_BUFFS], [...DEFAULT_CONSUMABLES]));
    expect(result.dps).toBeCloseTo(SAMPLE_MAGE_DPS, 6);
  });

  it('gives the same answer twice', () => {
    const fight = fightFor([...DEFAULT_BUFFS], [...DEFAULT_CONSUMABLES]);
    expect(run(SAMPLE_EXPORT, fight).dps).toBe(run(SAMPLE_EXPORT, fight).dps);
  });
});

describe('the sample warrior', () => {
  const melee = defaultsFor('melee');

  it('reads in whole, with both weapons found', () => {
    const imported = parseCharacterExport(SAMPLE_WARRIOR_EXPORT);
    expect(imported.error).toBeUndefined();
    expect(imported.skipped).toEqual([]);
    const character = imported.character!;
    expect(character.classId).toBe('warrior');
    expect(specModule(character.specId)?.label).toBe('Fury Warrior');

    const stats = deriveStatSheet(character, fightFor(melee.buffs, melee.consumables));
    expect(stats.weapons.main?.speed).toBe(2.6);
    expect(stats.weapons.off?.speed).toBe(2.5);
    expect(stats.weapons.main?.skill).toBe(300);
  });

  it('swings both hands and earns rage doing it', () => {
    const result = run(SAMPLE_WARRIOR_EXPORT, fightFor(melee.buffs, melee.consumables));
    const ids = result.abilities.map((a) => a.id);
    expect(ids).toContain('auto-main');
    expect(ids).toContain('auto-off');
    expect(ids).toContain('bloodthirst');
    expect(result.resources.rageGained).toBeGreaterThan(0);
    expect(result.resources.manaSpent).toBe(0);
    expect(result.dps).toBeGreaterThan(50);
  });

  it('gives the same answer twice', () => {
    const fight = fightFor(melee.buffs, melee.consumables);
    expect(run(SAMPLE_WARRIOR_EXPORT, fight).dps).toBe(run(SAMPLE_WARRIOR_EXPORT, fight).dps);
  });
});
