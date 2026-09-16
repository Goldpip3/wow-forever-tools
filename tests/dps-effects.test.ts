import { describe, expect, it } from 'vitest';

import { ITEM_EFFECTS, effectsFor } from '../src/dps/data/item-effects';
import { SET_BONUSES, bonusesFor, setCounts, setStats } from '../src/dps/data/sets';
import { enumerate, planTopGear, swapsIn } from '../src/dps/topgear';
import { runTopGear } from '../src/dps/client';
import { simulate } from '../src/dps/sim/sim';
import { parseCharacterExport } from '../src/dps/importer';
import { SAMPLE_WARRIOR_EXPORT } from '../src/dps/sample-warrior';
import { deriveStatSheet, effectsOn } from '../src/dps/stats';
import { specModule } from '../src/dps/sim/specs';
import { defaultsFor } from '../src/dps/data/buffs';
import * as K from '../src/dps/data/combat-constants';
import type { ItemRef } from '../src/dps/export-format';
import type { FightConfig } from '../src/dps/sim/types';

const character = parseCharacterExport(SAMPLE_WARRIOR_EXPORT).character!;
const spec = specModule(character.specId)!;

function fight(over: Partial<FightConfig> = {}): FightConfig {
  const melee = defaultsFor('melee');
  return {
    duration: 300,
    iterations: 150,
    seed: 20260915,
    target: { level: 63, armor: 3000, resistance: 0, behind: true, canParry: false, canBlock: false },
    buffs: melee.buffs,
    debuffs: ['sunder-armor'],
    consumables: melee.consumables,
    ...over,
  };
}

function item(over: Partial<ItemRef> = {}): ItemRef {
  return {
    id: 1, name: 'A thing', equipLoc: 'INVTYPE_TRINKET', quality: 4, stats: {},
    location: { where: 'equipped', slot: 'trinket1' },
    ...over,
  };
}

describe('the catalogue', () => {
  it('ships empty, because Forever has published no items', () => {
    expect(Object.keys(ITEM_EFFECTS)).toEqual([]);
    expect(SET_BONUSES).toEqual([]);
  });
});

describe('reading an effect off a tooltip', () => {
  it('reads a trinket you press', () => {
    const { known, unknown } = effectsFor(item({
      effects: ['Use: Increases attack power by 300 for 20 sec.'],
    }));
    expect(unknown).toEqual([]);
    expect(known).toHaveLength(1);
    const effect = known[0]!;
    expect(effect.kind).toBe('use');
    if (effect.kind !== 'use') throw new Error('wrong kind');
    expect(effect.aura.duration).toBe(20);
    expect(effect.aura.stats).toEqual({ attackPower: 300 });
    expect(effect.cooldown).toBe(K.TRINKET_COOLDOWN.value);
  });

  it('reads a spell damage trinket the same way', () => {
    const { known } = effectsFor(item({
      effects: ['Use: Increases damage done by magical spells and effects by up to 175 for 15 sec.'],
    }));
    const effect = known[0]!;
    if (effect.kind !== 'use') throw new Error('wrong kind');
    expect(effect.aura.stats).toEqual({ spellPower: 175 });
  });

  it('reads a weapon that blasts what it hits', () => {
    const { known } = effectsFor(item({
      effects: ['Chance on hit: Blasts the target for 40 to 60 Fire damage.'],
    }));
    const effect = known[0]!;
    expect(effect.kind).toBe('proc');
    if (effect.kind !== 'proc') throw new Error('wrong kind');
    expect(effect.aura.damage).toEqual({ school: 'fire', min: 40, max: 60 });
  });

  it('skips an Equip line, because the addon already turned it into stats', () => {
    const { known, unknown } = effectsFor(item({
      effects: ['Equip: Increases your critical strike rating by 14.'],
    }));
    expect(known).toEqual([]);
    expect(unknown).toEqual([]);
  });

  it('says so rather than guessing when it cannot read one', () => {
    const line = 'Equip: Your melee attacks have a chance to summon a friendly murloc.';
    const { known, unknown } = effectsFor(item({ effects: [line] }));
    expect(known).toEqual([]);
    expect(unknown).toEqual([line]);
  });

  it('puts what it could not read into the notes, naming the item', () => {
    const odd = { ...character, source: { ...character.source, equipped: {
      ...character.source.equipped,
      trinket1: item({ id: 99, name: 'Puzzle Box', effects: ['Equip: Does something unheard of.'] }),
    } } };
    const { effectNotes } = effectsOn(odd);
    expect(effectNotes).toHaveLength(1);
    expect(effectNotes[0]).toContain('Puzzle Box');
    expect(effectNotes[0]).toContain('Does something unheard of');
  });
});

describe('a trinket in a fight', () => {
  it('is pressed, and the damage goes up because of it', () => {
    const f = fight();
    const stats = deriveStatSheet(character, f);
    const base = { specId: character.specId, stats, talents: character.talentRanks, fight: f };

    const withIt = simulate({ ...base, ...effectsOn(character) }, spec);
    const without = simulate(base, spec);

    expect(withIt.dps).toBeGreaterThan(without.dps);
    // The sample warrior carries one, at three hundred attack power for twenty
    // seconds on a three minute cooldown: twice in a five minute fight.
    const uptime = withIt.auras.find((a) => a.name === 'Heart of the Ram');
    expect(uptime).toBeDefined();
    expect(uptime!.uptime).toBeGreaterThan(30);
    expect(uptime!.uptime).toBeLessThanOrEqual(40);
  });

  it('takes its stats back off when it runs out', () => {
    // A fight too short to press it twice: the attack power cannot still be
    // there at the end, or every later swing would be wrong.
    const f = fight({ duration: 60, iterations: 40 });
    const stats = deriveStatSheet(character, f);
    const result = simulate(
      { specId: character.specId, stats, talents: character.talentRanks, fight: f, ...effectsOn(character) },
      spec,
    );
    const uptime = result.auras.find((a) => a.name === 'Heart of the Ram')!;
    expect(uptime.uptime).toBeCloseTo(20, 0);
  });
});

describe('sets', () => {
  it('counts the pieces of each one', () => {
    const counts = setCounts([
      item({ id: 1, setName: 'Oath' }),
      item({ id: 2, setName: 'Oath' }),
      item({ id: 3, setName: 'Other' }),
      item({ id: 4 }),
    ]);
    expect(counts.get('Oath')).toBe(2);
    expect(counts.get('Other')).toBe(1);
  });

  it('gives nothing while the catalogue is empty', () => {
    expect(bonusesFor([item({ setName: 'Oath' }), item({ setName: 'Oath' })])).toEqual([]);
    expect(setStats([item({ setName: 'Oath' })])).toEqual({});
  });
});

describe('trying the combinations', () => {
  const weights = { attackPower: 1, strength: 2, agility: 1.8, crit: 30, hit: 38 };

  it('shortlists a few per slot and counts what that comes to', () => {
    const plan = planTopGear(character, weights, 3);
    expect(plan.choices.length).toBeGreaterThan(0);
    // Every shortlist starts with what is already worn.
    for (const choice of plan.choices) expect(choice.options.length).toBeGreaterThan(1);
    // The count is what will really be run, which is at most the product: a
    // pair of rings is unordered, so half of those arrangements never happen.
    const product = plan.choices.reduce((total, choice) => total * choice.options.length, 1);
    expect(plan.combinations).toBeLessThanOrEqual(product);
    expect(plan.combinations).toBe([...enumerate(plan.choices)].length);
  });

  it('always includes the loadout you already have', () => {
    const plan = planTopGear(character, weights, 3);
    const all = [...enumerate(plan.choices)];
    const unchanged = all.filter((loadout) => swapsIn(character, loadout).length === 0);
    expect(unchanged).toHaveLength(1);
  });

  it('never puts the same unique ring on both fingers', () => {
    const unique = item({ id: 500, name: 'One of a kind', equipLoc: 'INVTYPE_FINGER', unique: true });
    const choices = [
      { slot: 'finger1' as const, options: [null, unique] },
      { slot: 'finger2' as const, options: [null, unique] },
    ];
    for (const loadout of enumerate(choices)) {
      const both = loadout.finger1?.id === 500 && loadout.finger2?.id === 500;
      expect(both).toBe(false);
    }
  });

  it('runs them and puts the best first', async () => {
    const result = await runTopGear(character, fight({ iterations: 60 }), weights, {
      perSlot: 2,
      iterations: 40,
      finalIterations: 60,
    });

    expect(result.entries.length).toBeGreaterThan(1);
    expect(result.baseDps).toBeGreaterThan(0);
    for (let i = 1; i < result.entries.length; i += 1) {
      expect(result.entries[i - 1]!.delta).toBeGreaterThanOrEqual(result.entries[i]!.delta);
    }
    // The five at the top were run again properly rather than only ranked.
    expect(result.entries.filter((e) => e.confirmed).length).toBeGreaterThan(0);
  });
});
