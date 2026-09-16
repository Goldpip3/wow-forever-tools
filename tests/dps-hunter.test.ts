import { describe, expect, it } from 'vitest';

import { simulate, AUTO_ATTACK_ID } from '../src/dps/sim/sim';
import { emptyStatSheet, type FightConfig, type SimConfig, type StatSheet } from '../src/dps/sim/types';
import {
  hunterBeastMastery, hunterMarksmanship, hunterSurvival, HUNTER_AURAS, SERPENT_STING_DOT_ID,
} from '../src/dps/sim/specs/hunter';
import { AMMO_DPS, ASPECT_OF_THE_HAWK, HUNTERS_MARK, SERPENT_STING } from '../src/dps/data/hunter';
import { meleeAttackTable } from '../src/dps/sim/tables';
import { specModule, supportedSpecs } from '../src/dps/sim/specs';
import { parseCharacterExport } from '../src/dps/importer';
import { SAMPLE_HUNTER_EXPORT } from '../src/dps/sample-hunter';
import { deriveStatSheet, effectsOn } from '../src/dps/stats';
import { defaultsFor } from '../src/dps/data/buffs';

const HIT = { miss: 0, dodge: 0, parry: 0, glance: 0, block: 0, crit: 0 };
const TARGET = { level: 63, armor: 0, resistance: 0, behind: false, canParry: true, canBlock: false };

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
    overrides: { forceAverageDamage: true, forceMeleeTable: HIT, infiniteMana: true },
    ...over,
  };
}

function hunter(): StatSheet {
  const stats = emptyStatSheet(60);
  stats.mana = 100000;
  stats.weapons = {
    ranged: { min: 100, max: 100, speed: 3, skill: 300, type: 'Bows', twoHanded: false },
  };
  return stats;
}

const run = (talents: Record<string, number>, over: Partial<FightConfig> = {}, apl?: SimConfig['apl']) =>
  simulate({ specId: 363, stats: hunter(), talents, fight: fight(over), apl }, hunterMarksmanship);

/** A shot with no attack power but what the hunter puts up before the pull. */
const AUTO_SHOT = 100 + AMMO_DPS * 3 + ((ASPECT_OF_THE_HAWK.rangedAttackPower + HUNTERS_MARK.rangedAttackPower) / 14) * 3;

describe('the registry', () => {
  it('has all three hunter trees in it', () => {
    for (const [id, module] of [[361, hunterBeastMastery], [363, hunterMarksmanship], [362, hunterSurvival]] as const) {
      expect(supportedSpecs()).toContain(id);
      expect(specModule(id)).toBe(module);
    }
  });
});

describe('a shot', () => {
  it('cannot be dodged, parried or glance', () => {
    const params = {
      skill: 300, defense: 315, hitPct: 0, critPct: 5, attackerLevel: 60, targetLevel: 63,
      canParry: true, behind: false,
    };
    const melee = meleeAttackTable(params);
    const shot = meleeAttackTable({ ...params, ranged: true });
    expect(melee.dodge).toBeGreaterThan(0);
    expect(melee.glance).toBeGreaterThan(0);
    expect(shot.dodge).toBe(0);
    expect(melee.parry).toBeGreaterThan(0);
    expect(shot.parry).toBe(0);
    expect(shot.glance).toBe(0);
    expect(shot.miss).toBe(melee.miss);
  });
});

describe('Auto Shot', () => {
  it('fires on the bow, with arrows, Aspect of the Hawk and Hunter\'s Mark', () => {
    const result = run({}, {}, [{ spellId: 'arcane-shot', text: 'time < 0' }]);
    const shots = result.abilities.find((a) => a.id === AUTO_ATTACK_ID.ranged)!;
    expect(shots.name).toBe('Ranged');
    expect(shots.casts).toBe(100);
    expect(shots.damage / shots.hits).toBeCloseTo(AUTO_SHOT, 6);
  });

  it('starts over after Aimed Shot, so a fight of nothing else fits fewer of them', () => {
    const plain = run({}, {}, [{ spellId: 'arcane-shot', text: 'time < 0' }]);
    const aimed = run({}, {}, [{ spellId: 'aimed-shot' }]);
    const autos = (r: typeof plain) => r.abilities.find((a) => a.id === AUTO_ATTACK_ID.ranged)!.casts;
    expect(autos(aimed)).toBeLessThan(autos(plain));
    // About every six seconds: three to cast, then a full three second Auto
    // Shot, which is one Auto Shot for each Aimed Shot rather than two.
    const casts = aimed.abilities.find((a) => a.id === 'aimed-shot')!.casts;
    expect(casts).toBeGreaterThanOrEqual(48);
    expect(autos(aimed)).toBe(casts);
  });

  it('is never pushed back by Sniper Shot when the rotation waits for it', () => {
    const plain = run({}, {}, [{ spellId: 'arcane-shot', text: 'time < 0' }]);
    const line = hunterMarksmanship.rotations.standard!({ 'Sniper Shot': 1 }).find((e) => e.spellId === 'sniper-shot')!;
    const sniping = run({ 'Sniper Shot': 1 }, {}, [{ spellId: 'sniper-shot', text: line.text }]);
    expect(sniping.abilities.find((a) => a.id === 'sniper-shot')!.casts).toBeGreaterThan(50);
    expect(sniping.abilities.find((a) => a.id === AUTO_ATTACK_ID.ranged)!.casts)
      .toBe(plain.abilities.find((a) => a.id === AUTO_ATTACK_ID.ranged)!.casts);
  });
});

describe('Rapid Fire', () => {
  it('shoots forty per cent faster for fifteen seconds', () => {
    const plain = run({}, {}, [{ spellId: 'arcane-shot', text: 'time < 0' }]);
    const rapid = run({}, {}, [{ spellId: 'rapid-fire' }]);
    const autos = (r: typeof plain) => r.abilities.find((a) => a.id === AUTO_ATTACK_ID.ranged)!.casts;
    // Fifteen seconds at 2.14 instead of 3 is two more shots.
    expect(autos(rapid) - autos(plain)).toBe(2);
    expect(rapid.auras.find((a) => a.id === HUNTER_AURAS.rapidFire)!.uptime).toBeCloseTo(15, 6);
  });
});

describe('Arcane Shot', () => {
  it('ignores armor and comes back sooner with Improved Arcane Shot', () => {
    const armored = { ...TARGET, armor: 3000 };
    const plain = run({}, { target: armored }, [{ spellId: 'arcane-shot' }]);
    const shot = plain.abilities.find((a) => a.id === 'arcane-shot')!;
    expect(shot.damage / shot.hits).toBeCloseTo(183, 6);
    expect(shot.casts).toBeLessThanOrEqual(50);
    const improved = run({ 'Improved Arcane Shot': 5 }, {}, [{ spellId: 'arcane-shot' }]);
    // Four and a half seconds rather than six.
    expect(improved.abilities.find((a) => a.id === 'arcane-shot')!.casts).toBeGreaterThanOrEqual(66);
  });
});

describe('Serpent Sting', () => {
  it('ticks 555 over fifteen seconds, six per cent more a rank of Improved Stings', () => {
    const apl = [{ spellId: 'serpent-sting', text: 'not debuff.serpent-sting.up' }];
    const plain = run({}, {}, apl);
    const improved = run({ 'Improved Stings': 3 }, {}, apl);
    const tick = (r: typeof plain) => {
      const t = r.abilities.find((a) => a.id === SERPENT_STING_DOT_ID)!;
      return t.damage / t.hits;
    };
    expect(tick(plain)).toBeCloseTo(SERPENT_STING.damage / SERPENT_STING.ticks, 6);
    expect(tick(improved) / tick(plain)).toBeCloseTo(1.18, 6);
  });
});

describe('the pet choice', () => {
  it('gives Lone Wolf only without a pet, and Focused Fire only with one', () => {
    const apl = [{ spellId: 'arcane-shot', text: 'time < 0' }];
    const talents = { 'Lone Wolf': 1, 'Focused Fire': 2 };
    const base = run({}, {}, apl).dps;
    const pet = run(talents, { stance: 'pet' }, apl).dps;
    const lone = run(talents, { stance: 'lone' }, apl).dps;
    expect(pet / base).toBeCloseTo(1.02, 6);
    expect(lone / base).toBeCloseTo(1.2, 6);
  });
});

describe('the sample hunter', () => {
  const character = parseCharacterExport(SAMPLE_HUNTER_EXPORT).character!;

  it('reads in whole as a Marksmanship hunter with a bow', () => {
    expect(character.classId).toBe('hunter');
    expect(specModule(character.specId)?.label).toBe('Marksmanship Hunter');
    const stats = deriveStatSheet(character, fight({ overrides: undefined }));
    expect(stats.weapons.ranged?.type).toBe('Bows');
  });

  it('shoots, aims, stings and snipes', () => {
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
    const result = simulate(config, hunterMarksmanship);
    const ids = result.abilities.map((a) => a.id);
    for (const id of [AUTO_ATTACK_ID.ranged, 'aimed-shot', 'multi-shot', SERPENT_STING_DOT_ID, 'sniper-shot']) {
      expect(ids).toContain(id);
    }
    expect(result.dps).toBeGreaterThan(100);
  });
});
