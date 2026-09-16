import { describe, expect, it } from 'vitest';

import { simulate } from '../src/dps/sim/sim';
import { emptyStatSheet, type FightConfig, type SimConfig, type StatSheet } from '../src/dps/sim/types';
import {
  WARLOCK_AURAS, warlockAffliction, warlockDemonology, warlockDestruction,
} from '../src/dps/sim/specs/warlock';
import { CORRUPTION, SHADOW_BOLT } from '../src/dps/data/warlock';
import { specModule, supportedSpecs } from '../src/dps/sim/specs';
import { parseCharacterExport } from '../src/dps/importer';
import { SAMPLE_WARLOCK_EXPORT } from '../src/dps/sample-warlock';
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
  simulate({ specId: 302, stats: caster(), talents, fight: fight(over), apl }, warlockAffliction);

const ticksOf = (r: ReturnType<typeof run>, id: string) => r.abilities.find((a) => a.id === id)?.hits ?? 0;

describe('the registry', () => {
  it('has all three warlock trees in it', () => {
    for (const [id, module] of [[302, warlockAffliction], [303, warlockDemonology], [301, warlockDestruction]] as const) {
      expect(supportedSpecs()).toContain(id);
      expect(specModule(id)).toBe(module);
    }
  });
});

describe('damage over time', () => {
  it('does not go on when the spell misses', () => {
    const apl = [{ spellId: 'corruption', text: 'not debuff.corruption.up' }];
    const hit = run({}, apl);
    const missed = run({}, apl, { overrides: { forceAverageDamage: true, forceSpellHit: 0, infiniteMana: true } });
    expect(ticksOf(hit, 'corruption-dot')).toBeGreaterThan(0);
    expect(ticksOf(missed, 'corruption-dot')).toBe(0);
    expect(missed.abilities.find((a) => a.id === 'corruption')!.misses).toBeGreaterThan(0);
  });

  it('shows on the target, so Corruption is only recast once it runs out', () => {
    const result = run({}, [{ spellId: 'corruption', text: 'not debuff.corruption.up' }, { spellId: 'shadow-bolt' }]);
    const casts = result.abilities.find((a) => a.id === 'corruption')!.casts;
    // Six ticks every time, less the end of the fight.
    expect(ticksOf(result, 'corruption-dot')).toBeGreaterThanOrEqual(casts * CORRUPTION.dot!.ticks - 6);
  });

  it('Malediction raises the ticks and not the hit that started them', () => {
    const apl = [{ spellId: 'immolate', text: 'not debuff.immolate.up' }, { spellId: 'shadow-bolt' }];
    const plain = run({}, apl);
    const cursed = run({ Malediction: 5 }, apl);
    const per = (r: typeof plain, id: string) => {
      const t = r.abilities.find((a) => a.id === id)!;
      return t.damage / t.hits;
    };
    expect(per(cursed, 'immolate-dot') / per(plain, 'immolate-dot')).toBeCloseTo(1.05, 6);
    expect(per(cursed, 'immolate') / per(plain, 'immolate')).toBeCloseTo(1, 6);
  });
});

describe('Corruption', () => {
  it('is instant with five ranks of Improved Corruption', () => {
    const slow = run({}, [{ spellId: 'corruption' }]);
    const fast = run({ 'Improved Corruption': 5 }, [{ spellId: 'corruption' }]);
    // Two seconds a cast, or a global cooldown of a second and a half.
    expect(slow.abilities.find((a) => a.id === 'corruption')!.casts).toBe(150);
    expect(fast.abilities.find((a) => a.id === 'corruption')!.casts).toBe(200);
  });
});

describe('Nightfall', () => {
  it('makes a Shadow Bolt instant after a Corruption tick sets it off', () => {
    const apl = [{ spellId: 'corruption', text: 'not debuff.corruption.up' }, { spellId: 'shadow-bolt' }];
    const plain = run({}, apl, { iterations: 20 });
    const trance = run({ Nightfall: 2 }, apl, { iterations: 20 });
    const bolts = (r: typeof plain) => r.abilities.find((a) => a.id === 'shadow-bolt')!.casts;
    expect(bolts(trance)).toBeGreaterThan(bolts(plain));
    expect(trance.auras.some((a) => a.id === WARLOCK_AURAS.shadowTrance)).toBe(true);
  });
});

describe('Conflagrate', () => {
  it('takes Immolate off the target, so its remaining ticks never land', () => {
    const apl = [
      { spellId: 'immolate', text: 'not debuff.immolate.up' },
      { spellId: 'conflagrate', text: 'debuff.immolate.up' },
      { spellId: 'shadow-bolt' },
    ];
    const plain = run({}, [apl[0]!, apl[2]!]);
    const burnt = run({ Conflagrate: 1 }, apl);
    const perCast = (r: typeof plain) =>
      ticksOf(r, 'immolate-dot') / r.abilities.find((a) => a.id === 'immolate')!.casts;
    // Five ticks a cast when left alone. Conflagrate comes back every ten
    // seconds, so about every other Immolate is burnt up after its first tick.
    expect(perCast(plain)).toBeGreaterThan(4.5);
    expect(perCast(burnt)).toBeLessThan(perCast(plain) - 1.5);
  });
});

describe('the demon choice', () => {
  it('gives a sacrificed Imp fifteen per cent Shadow and an Imp that is out nothing for Shadow', () => {
    const apl = [{ spellId: 'shadow-bolt' }];
    const talents = { 'Demonic Sacrifice': 1, 'Master Demonologist': 5 };
    const base = run({}, apl).dps;
    const out = run(talents, apl, { stance: 'imp' }).dps;
    const sacrificed = run(talents, apl, { stance: 'imp-sacrificed' }).dps;
    const succubus = run(talents, apl, { stance: 'succubus' }).dps;
    expect(out / base).toBeCloseTo(1, 6);
    expect(sacrificed / base).toBeCloseTo(1.15, 6);
    expect(succubus / base).toBeCloseTo(1.1, 6);
  });

  it('only counts Demonic Knowledge with a demon out', () => {
    const apl = [{ spellId: 'shadow-bolt' }];
    const out = run({ 'Demonic Knowledge': 3 }, apl, { stance: 'imp' });
    const gone = run({ 'Demonic Knowledge': 3 }, apl, { stance: 'imp-sacrificed' });
    const base = run({}, apl);
    const per = (r: typeof base) => {
      const t = r.abilities.find((a) => a.id === 'shadow-bolt')!;
      return t.damage / t.hits;
    };
    expect(per(gone)).toBeCloseTo(per(base), 6);
    expect(per(out) - per(base)).toBeCloseTo(60 * 0.99 * SHADOW_BOLT.coefficient, 6);
  });
});

describe('the sample warlock', () => {
  const character = parseCharacterExport(SAMPLE_WARLOCK_EXPORT).character!;

  it('reads in whole as an Affliction warlock', () => {
    expect(character.classId).toBe('warlock');
    expect(specModule(character.specId)?.label).toBe('Affliction Warlock');
  });

  it('keeps its curses up and bolts between', () => {
    const caster = defaultsFor('caster');
    const f = fight({ overrides: undefined, iterations: 30, buffs: caster.buffs, consumables: caster.consumables });
    const config: SimConfig = {
      specId: character.specId,
      stats: deriveStatSheet(character, f),
      talents: character.talentRanks,
      fight: f,
      ...effectsOn(character),
    };
    const result = simulate(config, warlockAffliction);
    const ids = result.abilities.map((a) => a.id);
    for (const id of ['corruption-dot', 'bane-of-agony-dot', 'immolate-dot', 'shadow-bolt', 'life-tap']) {
      expect(ids).toContain(id);
    }
    expect(result.dps).toBeGreaterThan(200);
  });
});
