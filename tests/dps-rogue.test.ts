import { describe, expect, it } from 'vitest';

import { simulate, AUTO_ATTACK_ID } from '../src/dps/sim/sim';
import { emptyStatSheet, type FightConfig, type SimConfig, type StatSheet } from '../src/dps/sim/types';
import { rogueCombat, ROGUE_AURAS } from '../src/dps/sim/specs/rogue-combat';
import { EVISCERATE, SLICE_AND_DICE, sliceDuration } from '../src/dps/data/rogue';
import { emptyMods } from '../src/dps/sim/spells';
import { specModule, supportedSpecs } from '../src/dps/sim/specs';
import { parseCharacterExport } from '../src/dps/importer';
import { SAMPLE_ROGUE_EXPORT } from '../src/dps/sample-rogue';
import { deriveStatSheet, effectsOn } from '../src/dps/stats';
import { Actor } from '../src/dps/sim/actor';
import * as K from '../src/dps/data/combat-constants';

/** Every band pinned so a swing can only do one thing. */
const ALWAYS = (band: 'hit' | 'crit') => {
  const zero = { miss: 0, dodge: 0, parry: 0, glance: 0, block: 0, crit: 0 };
  return band === 'hit' ? zero : { ...zero, crit: 100 };
};

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
    overrides: { forceAverageDamage: true, forceMeleeTable: ALWAYS('hit') },
    ...over,
  };
}

function sheet(over: Partial<StatSheet> = {}): StatSheet {
  const stats = emptyStatSheet(60);
  stats.weaponSkill = 300;
  stats.weapons = {
    main: { min: 100, max: 100, speed: 2.4, skill: 300, type: 'One-Handed Swords', twoHanded: false },
    off: { min: 100, max: 100, speed: 1.8, skill: 300, type: 'Daggers', twoHanded: false },
  };
  return { ...stats, ...over };
}

function config(talents: Record<string, number> = {}, over: Partial<SimConfig> = {}): SimConfig {
  return { specId: 181, stats: sheet(), talents, fight: fight(), ...over };
}

describe('the registry', () => {
  it('has the combat rogue in it', () => {
    expect(supportedSpecs()).toContain(181);
    expect(specModule(181)).toBe(rogueCombat);
  });
});

describe('the energy bar', () => {
  it('starts full and comes back in lumps rather than smoothly', () => {
    const actor = new Actor(sheet());
    expect(actor.energy.current).toBe(K.ENERGY_MAX.value);
    actor.spend('energy', 100, 0);
    expect(actor.energy.current).toBe(0);
    actor.gain('energy', K.ENERGY_PER_TICK.value);
    expect(actor.energy.current).toBe(20);
  });

  it('is widened by Vigor', () => {
    // The bar itself is what the talent moves. Whether that comes out as more
    // damage over a fixed length of fight depends on where the last finisher
    // lands, so the thing to check is the bar rather than the figure.
    const actor = new Actor(sheet());
    const mods = emptyMods();
    mods.flags.bonusEnergy = 10;
    rogueCombat.init!(actor, config({ Vigor: 2 }), mods);
    expect(actor.energy.max).toBe(K.ENERGY_MAX.value + 10);
    expect(actor.energy.current).toBe(actor.energy.max);

    const plain = new Actor(sheet());
    rogueCombat.init!(plain, config(), emptyMods());
    expect(plain.energy.max).toBe(K.ENERGY_MAX.value);
  });

  it('reports the seconds spent waiting for a tick', () => {
    const result = simulate(config(), rogueCombat);
    expect(result.resources.starvedFor).toBeGreaterThan(0);
    expect(result.resources.energySpent).toBeGreaterThan(0);
  });
});

describe('combo points', () => {
  it('are earned by a strike and spent by a finisher', () => {
    const result = simulate(config(), rogueCombat);
    const sinister = result.abilities.find((a) => a.id === 'sinister-strike')!;
    const eviscerate = result.abilities.find((a) => a.id === 'eviscerate');
    const slice = result.abilities.find((a) => a.id === 'slice-and-dice')!;

    expect(sinister.casts).toBeGreaterThan(0);
    expect(slice.casts).toBeGreaterThan(0);
    // Without Seal Fate or Ruthlessness every point came from a Sinister
    // Strike, and every finisher needed at least one, so there cannot be more
    // finishers than strikes.
    const finishers = (eviscerate?.casts ?? 0) + slice.casts;
    expect(finishers).toBeLessThanOrEqual(sinister.casts);
  });

  it('never bank more than five', () => {
    const actor = new Actor(sheet());
    for (let i = 0; i < 20; i += 1) actor.addCombo(1, K.COMBO_POINT_MAX.value);
    expect(actor.comboPoints).toBe(K.COMBO_POINT_MAX.value);
  });

  it('make a finisher worth more the more of them there are', () => {
    // Eviscerate reads no weapon damage at all: its whole damage is the points.
    const scale = EVISCERATE.comboDamage!;
    expect(scale.min).toBeGreaterThan(0);
    // The Classic rank nine total at five points, which is what the note says.
    expect(scale.min * 5).toBeCloseTo(225, 0);
    expect(scale.max * 5).toBeCloseTo(675, 0);
  });

  it('are given back by Seal Fate on a critical strike', () => {
    // Slice and Dice is taken out of the rotation so that the extra points can
    // only show up as extra Eviscerates rather than as a longer buff.
    const apl = [
      { spellId: 'eviscerate', text: 'combo >= 5' },
      { spellId: 'sinister-strike' },
    ];
    const allCrits = fight({
      overrides: { forceAverageDamage: true, forceMeleeTable: ALWAYS('crit') },
    });

    const plain = simulate({ ...config(), fight: allCrits, apl }, rogueCombat);
    const sealed = simulate({ ...config({ 'Seal Fate': 5 }), fight: allCrits, apl }, rogueCombat);

    const evisOf = (r: typeof plain) => r.abilities.find((a) => a.id === 'eviscerate')!.casts;

    // Every strike crits, so at five ranks every one gives a second point:
    // five points arrive in three strikes rather than five.
    expect(evisOf(sealed)).toBeGreaterThan(evisOf(plain));
    expect(sealed.dps).toBeGreaterThan(plain.dps);
  });
});

describe('Slice and Dice', () => {
  it('lasts longer for every point it spent', () => {
    const mods = emptyMods();
    expect(sliceDuration(1, mods)).toBe(SLICE_AND_DICE.base);
    expect(sliceDuration(5, mods)).toBe(SLICE_AND_DICE.base + SLICE_AND_DICE.perPoint * 4);
  });

  it('is lengthened by the talent', () => {
    const mods = emptyMods();
    mods.flags.sliceDuration = 0.45;
    expect(sliceDuration(5, mods)).toBeCloseTo((9 + 12) * 1.45, 6);
  });

  it('speeds the weapons up while it is on', () => {
    const result = simulate(config(), rogueCombat);
    const slice = result.auras.find((a) => a.id === ROGUE_AURAS.sliceAndDice);
    expect(slice).toBeDefined();
    expect(slice!.uptime).toBeGreaterThan(200);

    // More swings than a rogue with no energy to keep it up would get.
    const swings = result.abilities.find((a) => a.id === AUTO_ATTACK_ID.main)!.casts;
    expect(swings).toBeGreaterThan(300 / 2.4);
  });
});

describe('the sample rogue', () => {
  const character = parseCharacterExport(SAMPLE_ROGUE_EXPORT).character!;

  it('reads in whole, with a sword and a dagger', () => {
    expect(character.classId).toBe('rogue');
    expect(specModule(character.specId)?.label).toBe('Combat Rogue');

    const f = fight({ overrides: undefined, iterations: 30 });
    const stats = deriveStatSheet(character, f);
    expect(stats.weapons.main?.type).toBe('One-Handed Swords');
    expect(stats.weapons.off?.type).toBe('Daggers');
  });

  it('deals damage with both hands and its finishers', () => {
    const f = fight({ overrides: undefined, iterations: 30, target: { level: 63, armor: 3000, resistance: 0, behind: true, canParry: false, canBlock: false } });
    const result = simulate(
      {
        specId: character.specId,
        stats: deriveStatSheet(character, f),
        talents: character.talentRanks,
        fight: f,
        ...effectsOn(character),
      },
      rogueCombat,
    );

    const ids = result.abilities.map((a) => a.id);
    expect(ids).toContain(AUTO_ATTACK_ID.main);
    expect(ids).toContain(AUTO_ATTACK_ID.off);
    expect(ids).toContain('sinister-strike');
    expect(ids).toContain('eviscerate');
    expect(result.dps).toBeGreaterThan(100);
    expect(result.resources.rageGained).toBe(0);
  });

  it('says out loud that its poisons are missing', () => {
    const f = fight({ overrides: undefined, iterations: 1 });
    const result = simulate(
      {
        specId: character.specId,
        stats: deriveStatSheet(character, f),
        talents: character.talentRanks,
        fight: f,
      },
      rogueCombat,
    );
    expect(result.notes.some((n) => n.includes('Poisons are not simulated'))).toBe(true);
  });
});
