import { describe, expect, it } from 'vitest';

import { simulate, AUTO_ATTACK_ID } from '../src/dps/sim/sim';
import { emptyStatSheet, type FightConfig, type SimConfig, type StatSheet } from '../src/dps/sim/types';
import { shamanEnhancement } from '../src/dps/sim/specs/shaman-enhancement';
import { shamanElemental } from '../src/dps/sim/specs/shaman-elemental';
import { SHAMAN_AURAS } from '../src/dps/sim/specs/shaman';
import {
  CHAIN_LIGHTNING, LIGHTNING_BOLT, SHAMAN_TALENT_HOOKS, WINDFURY_WEAPON,
  shockCooldown, windfuryAttackPower,
} from '../src/dps/data/shaman';
import { emptyMods } from '../src/dps/sim/spells';
import { specModule, supportedSpecs } from '../src/dps/sim/specs';
import { parseCharacterExport } from '../src/dps/importer';
import { SAMPLE_SHAMAN_EXPORT } from '../src/dps/sample-shaman';
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

function caster(over: Partial<StatSheet> = {}): StatSheet {
  const stats = emptyStatSheet(60);
  stats.mana = 100000;
  return { ...stats, ...over };
}

function fighter(): StatSheet {
  const stats = caster();
  stats.weapons = {
    main: { min: 300, max: 300, speed: 3, skill: 300, type: 'Two-Handed Maces', twoHanded: true },
  };
  return stats;
}

describe('the registry', () => {
  it('has both shaman trees in it', () => {
    expect(supportedSpecs()).toContain(261);
    expect(supportedSpecs()).toContain(263);
    expect(specModule(263)).toBe(shamanEnhancement);
    expect(specModule(261)).toBe(shamanElemental);
  });
});

describe('Lightning Bolt', () => {
  it('casts in two and a half seconds, which is what the class notes read off the demo', () => {
    expect(LIGHTNING_BOLT.castTime).toBe(2.5);
    // A bolt with nothing else on the list lands every two and a half seconds.
    const result = simulate(
      { specId: 261, stats: caster(), talents: {}, fight: fight(), apl: [{ spellId: 'lightning-bolt' }] },
      shamanElemental,
    );
    expect(result.abilities.find((a) => a.id === 'lightning-bolt')!.casts).toBe(120);
    expect(result.dps).toBeCloseTo((120 * (LIGHTNING_BOLT.minDamage + LIGHTNING_BOLT.maxDamage) / 2) / 300, 6);
  });

  it('is shortened by Elemental Alacrity', () => {
    const result = simulate(
      {
        specId: 261, stats: caster(), talents: { 'Elemental Alacrity': 3 }, fight: fight(),
        apl: [{ spellId: 'lightning-bolt' }],
      },
      shamanElemental,
    );
    // 2.5 less 0.51 is 1.99, so a hundred and fifty of them fit.
    expect(result.abilities.find((a) => a.id === 'lightning-bolt')!.casts).toBe(150);
  });

  it('goes off a second time at half damage with Lightning Overload', () => {
    const result = simulate(
      {
        specId: 261, stats: caster(), talents: { 'Lightning Overload': 3 },
        fight: { ...fight(), iterations: 40, overrides: { forceSpellHit: 1, forceSpellCrit: 0, infiniteMana: true } },
        apl: [{ spellId: 'lightning-bolt' }],
      },
      shamanElemental,
    );
    const bolts = result.abilities.find((a) => a.id === 'lightning-bolt')!;
    const again = result.abilities.find((a) => a.id === 'lightning-bolt-echo')!;
    expect(again.name).toBe('Lightning Bolt, again');
    // Nine per cent of the bolts, give or take the dice.
    expect(again.casts / bolts.casts).toBeGreaterThan(0.05);
    expect(again.casts / bolts.casts).toBeLessThan(0.13);
    // Each one is half a bolt.
    expect(again.damage / again.hits).toBeCloseTo((bolts.damage / bolts.hits) / 2, -1);
  });

  it('is sped up by Rage of the Farseer while it is up', () => {
    const plain = simulate(
      { specId: 261, stats: caster(), talents: {}, fight: fight(), apl: [{ spellId: 'lightning-bolt' }] },
      shamanElemental,
    );
    const hasted = simulate(
      {
        specId: 261, stats: caster(), talents: { 'Rage of the Farseer': 1 }, fight: fight(),
        apl: [{ spellId: 'rage-of-the-farseer' }, { spellId: 'lightning-bolt' }],
      },
      shamanElemental,
    );
    expect(hasted.abilities.find((a) => a.id === 'lightning-bolt')!.casts)
      .toBeGreaterThan(plain.abilities.find((a) => a.id === 'lightning-bolt')!.casts);
  });
});

describe('Chain Lightning', () => {
  it('keeps seventy per cent of the last hit on each jump', () => {
    const cleave = fight({ style: { kind: 'cleave', targets: 3 } });
    const single = simulate(
      { specId: 261, stats: caster(), talents: {}, fight: fight(), apl: [{ spellId: 'chain-lightning' }] },
      shamanElemental,
    );
    const three = simulate(
      { specId: 261, stats: caster(), talents: {}, fight: cleave, apl: [{ spellId: 'chain-lightning' }] },
      shamanElemental,
    );
    const one = single.abilities.find((a) => a.id === 'chain-lightning')!.damage;
    const all = three.abilities.find((a) => a.id === 'chain-lightning')!.damage;
    expect(all / one).toBeCloseTo(1 + 0.7 + 0.49, 6);
    expect(CHAIN_LIGHTNING.aoe?.maxTargets).toBe(3);
  });
});

describe('the shocks', () => {
  it('share one cooldown, shortened by Reverberation', () => {
    const mods = emptyMods();
    expect(shockCooldown(mods)).toBe(6);
    SHAMAN_TALENT_HOOKS.Reverberation!(5, mods);
    expect(shockCooldown(mods)).toBe(5);

    // Pressing one holds the other: never more shocks than the cooldown allows.
    const result = simulate(
      {
        specId: 261, stats: caster(), talents: {}, fight: fight(),
        apl: [{ spellId: 'earth-shock' }, { spellId: 'flame-shock' }, { spellId: 'lightning-bolt' }],
      },
      shamanElemental,
    );
    const earth = result.abilities.find((a) => a.id === 'earth-shock')?.casts ?? 0;
    const flame = result.abilities.find((a) => a.id === 'flame-shock')?.casts ?? 0;
    expect(earth + flame).toBeLessThanOrEqual(Math.ceil(300 / 6) + 1);
    expect(flame).toBe(0);
  });
});

describe('Flame Shock', () => {
  it('is left to finish before it is cast again, so no tick is thrown away', () => {
    const line = shamanElemental.rotations.standard!({}).find((e) => e.spellId === 'flame-shock')!;
    const result = simulate(
      {
        specId: 261, stats: caster(), talents: {}, fight: fight(),
        apl: [{ spellId: 'flame-shock', text: line.text }, { spellId: 'lightning-bolt' }],
      },
      shamanElemental,
    );
    const casts = result.abilities.find((a) => a.id === 'flame-shock')!.casts;
    const ticks = result.abilities.find((a) => a.id === 'flame-shock-dot')!.hits;
    // Four ticks each, less whatever the end of the fight cuts off the last.
    expect(ticks).toBeGreaterThanOrEqual(casts * 4 - 4);
  });
});

describe('Windfury Weapon', () => {
  it('carries more attack power with Elemental Weapons, rank by rank as the tree gives it', () => {
    const mods = emptyMods();
    expect(windfuryAttackPower(mods)).toBe(WINDFURY_WEAPON.attackPower);
    SHAMAN_TALENT_HOOKS['Elemental Weapons']!(3, mods);
    expect(windfuryAttackPower(mods)).toBeCloseTo(WINDFURY_WEAPON.attackPower * 1.4, 6);
    const two = emptyMods();
    SHAMAN_TALENT_HOOKS['Elemental Weapons']!(2, two);
    expect(windfuryAttackPower(two)).toBeCloseTo(WINDFURY_WEAPON.attackPower * 1.27, 6);
  });

  it('takes an extra swing on about a fifth of the swings that land', () => {
    const result = simulate(
      {
        specId: 263, stats: fighter(), talents: {},
        fight: { ...fight(), iterations: 60 },
        apl: [],
      },
      shamanEnhancement,
    );
    const swings = result.abilities.find((a) => a.id === AUTO_ATTACK_ID.main)!;
    const windfury = result.abilities.find((a) => a.id === 'windfury')!;
    expect(windfury.name).toBe('Windfury Weapon');
    expect(windfury.casts / swings.casts).toBeGreaterThan(0.15);
    expect(windfury.casts / swings.casts).toBeLessThan(0.25);
    // Three hundred and fifteen attack power over a three second weapon.
    expect(windfury.damage / windfury.hits).toBeCloseTo(300 + (315 / 14) * 3, 6);
  });
});

describe('Stormstrike', () => {
  it('makes the target take a fifth more Nature damage', () => {
    const plain = simulate(
      { specId: 263, stats: fighter(), talents: {}, fight: fight(), apl: [{ spellId: 'earth-shock' }] },
      shamanEnhancement,
    );
    const struck = simulate(
      {
        specId: 263, stats: fighter(), talents: { Stormstrike: 1 }, fight: fight(),
        apl: [{ spellId: 'stormstrike' }, { spellId: 'earth-shock' }],
      },
      shamanEnhancement,
    );
    const esPlain = plain.abilities.find((a) => a.id === 'earth-shock')!;
    const esStruck = struck.abilities.find((a) => a.id === 'earth-shock')!;
    expect(esStruck.damage / esStruck.hits).toBeGreaterThan(esPlain.damage / esPlain.hits);
    expect(struck.auras.some((a) => a.id === SHAMAN_AURAS.stormstrike)).toBe(true);
  });

  it('is not pressed by a shaman who did not take the talent', () => {
    const result = simulate(
      { specId: 263, stats: fighter(), talents: {}, fight: fight() },
      shamanEnhancement,
    );
    expect(result.abilities.find((a) => a.id === 'stormstrike')).toBeUndefined();
  });
});

describe('the sample shaman', () => {
  const character = parseCharacterExport(SAMPLE_SHAMAN_EXPORT).character!;

  it('reads in whole as an Enhancement shaman with a two-hander', () => {
    expect(character.classId).toBe('shaman');
    expect(specModule(character.specId)?.label).toBe('Enhancement Shaman');
    const stats = deriveStatSheet(character, fight({ overrides: undefined }));
    expect(stats.weapons.main?.twoHanded).toBe(true);
  });

  it('swings, strikes, shocks and Windfuries', () => {
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
    const result = simulate(config, shamanEnhancement);
    const ids = result.abilities.map((a) => a.id);
    for (const id of [AUTO_ATTACK_ID.main, 'windfury', 'stormstrike', 'earth-shock']) expect(ids).toContain(id);
    expect(result.dps).toBeGreaterThan(100);
    expect(result.notes.some((n) => n.startsWith('Maelstrom Weapon:'))).toBe(true);
  });
});
