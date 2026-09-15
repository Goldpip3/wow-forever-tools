import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { TalentData } from '../src/talents/types';
import { parseCharacterExport } from '../src/dps/importer';
import { deriveStatSheet, baselineStats, equippedStats, buffStats, convert } from '../src/dps/stats';
import { deriveWeights, dpsPerPoint, isNoisy, normalise, weightTable } from '../src/dps/weights';
import { compareGear, overrideFor } from '../src/dps/compare';
import {
  bestLoadout, candidatesFor, itemScore, pairedSlot, rankSlot, upgrades, weaponChoice,
} from '../src/dps/gear';
import { mageFrost } from '../src/dps/sim/specs/mage-frost';
import type { FightConfig, SimConfig } from '../src/dps/sim/types';
import type { Character } from '../src/dps/types';

const here = resolve(fileURLToPath(import.meta.url), '..');
const RAW = readFileSync(resolve(here, 'fixtures/mage-frost.json'), 'utf8');
const DATA = JSON.parse(
  readFileSync(resolve(here, '../public/data/talents.generated.json'), 'utf8'),
) as TalentData;

const CHARACTER: Character = parseCharacterExport(RAW, DATA.talents.Mage!).character!;

function fight(over: Partial<FightConfig> = {}): FightConfig {
  return {
    duration: 180,
    iterations: 40,
    seed: 777,
    target: { level: 63, armor: 0, resistance: 0, behind: true, canParry: false, canBlock: false },
    buffs: [],
    debuffs: [],
    consumables: [],
    ...over,
  };
}

function configFor(f: FightConfig): SimConfig {
  return {
    specId: CHARACTER.specId,
    stats: deriveStatSheet(CHARACTER, f),
    talents: CHARACTER.talentRanks,
    fight: f,
  };
}

describe('the stat model', () => {
  it('adds up the equipped gear', () => {
    const gear = equippedStats(CHARACTER.source.equipped);
    expect(gear.intellect).toBe(237);
    expect(gear.spellPower).toBe(394);
    expect(gear.spellCrit).toBe(6);
    expect(gear.spellHit).toBe(3);
  });

  it('works the baseline out as the sheet minus the gear', () => {
    const base = baselineStats(CHARACTER.source);
    expect(base.intellect).toBe(CHARACTER.source.stats.intellect - 237);
    expect(base.spellPower).toBe(0);
    // The character sheet crit already includes what intellect gave it.
    expect(base.spellCrit).toBeCloseTo(CHARACTER.source.stats.spellCrit.frost! - 6, 6);
  });

  it('gives back the sheet when nothing is swapped or buffed', () => {
    const sheet = deriveStatSheet(CHARACTER, fight());
    expect(sheet.intellect).toBe(CHARACTER.source.stats.intellect);
    expect(sheet.spellPower).toBe(394);
    expect(sheet.spellCrit).toBeCloseTo(CHARACTER.source.stats.spellCrit.frost!, 6);
    expect(sheet.mana).toBe(CHARACTER.source.stats.mana);
  });

  it('moves only the difference when an item is swapped', () => {
    const better = CHARACTER.owned.find((i) => i.name === 'Crown of the Frozen Wastes')!;
    const sheet = deriveStatSheet(CHARACTER, fight(), { gearOverride: { head: better } });
    const before = deriveStatSheet(CHARACTER, fight());
    // The new crown has four more intellect and ten more spell damage.
    expect(sheet.intellect - before.intellect).toBe(4);
    expect(sheet.spellPower - before.spellPower).toBe(10);
  });

  it('turns new intellect into crit and mana through the class ratios', () => {
    const converted = convert('mage', { intellect: 59.5 });
    expect(converted.spellCrit).toBeCloseTo(1, 6);

    const better = CHARACTER.owned.find((i) => i.name === 'Crown of the Frozen Wastes')!;
    const after = deriveStatSheet(CHARACTER, fight(), { gearOverride: { head: better } });
    const before = deriveStatSheet(CHARACTER, fight());
    expect(after.mana - before.mana).toBeCloseTo(4 * 15, 6);
    expect(after.spellCrit - before.spellCrit).toBeCloseTo(4 / 59.5, 6);
  });

  it('adds a buff that was ticked', () => {
    const buffed = deriveStatSheet(CHARACTER, fight({ buffs: ['arcane-intellect'] }));
    const plain = deriveStatSheet(CHARACTER, fight());
    expect(buffed.intellect - plain.intellect).toBe(31);
  });

  it('refuses to count a buff that was already up at export time', () => {
    const { stats, skipped } = buffStats(['arcane-intellect'], ['Arcane Intellect']);
    expect(stats.intellect).toBeUndefined();
    expect(skipped).toEqual(['Arcane Intellect']);
  });

  it('pays out only once for two consumables that overwrite each other', () => {
    const both = buffStats(['flask-of-supreme-power', 'greater-arcane-elixir']);
    expect(both.stats.spellPower).toBe(150);
  });
});

describe('deriving stat weights', () => {
  const result = deriveWeights(configFor(fight()), mageFrost, { iterations: 60 });

  it('values spell damage above nothing', () => {
    const sp = result.weights.find((w) => w.stat === 'spellPower')!;
    expect(sp.perPoint).toBeGreaterThan(0);
  });

  it('normalises the reference stat to one', () => {
    expect(result.reference).toBe('spellPower');
    const sp = result.weights.find((w) => w.stat === 'spellPower')!;
    expect(sp.normalised).toBeCloseTo(1, 9);
  });

  it('rates a point of crit and a point of hit above a point of spell damage', () => {
    const crit = result.weights.find((w) => w.stat === 'spellCrit')!;
    const hit = result.weights.find((w) => w.stat === 'spellHit')!;
    const sp = result.weights.find((w) => w.stat === 'spellPower')!;
    expect(crit.perPoint).toBeGreaterThan(sp.perPoint);
    expect(hit.perPoint).toBeGreaterThan(sp.perPoint);
  });

  it('finds stamina worth nothing to a mage', () => {
    const stamina = result.weights.find((w) => w.stat === 'stamina')!;
    expect(Math.abs(stamina.normalised)).toBeLessThan(0.01);
  });

  it('counts frost damage the same as general spell damage for this spec', () => {
    const frost = result.weights.find((w) => w.stat === 'frostPower')!;
    const sp = result.weights.find((w) => w.stat === 'spellPower')!;
    expect(frost.perPoint).toBeCloseTo(sp.perPoint, 6);
  });

  it('gives the same weights for the same seed', () => {
    const again = deriveWeights(configFor(fight()), mageFrost, { iterations: 60 });
    expect(again.weights.map((w) => w.perPoint)).toEqual(result.weights.map((w) => w.perPoint));
  });

  it('reports how well each weight is pinned down', () => {
    for (const weight of result.weights) expect(weight.stderr).toBeGreaterThanOrEqual(0);
  });

  it('says when hit has stopped paying', () => {
    // Fifteen points of hit on gear plus five from Elemental Precision is past
    // the seventeen it takes to cap against a boss.
    const cfg = configFor(fight());
    cfg.stats.spellHit = 15;
    const capped = deriveWeights(cfg, mageFrost, { iterations: 20 });
    const hit = capped.weights.find((w) => w.stat === 'spellHit')!;
    expect(hit.capped).toBe(true);
    expect(hit.perPoint).toBe(0);
    expect(capped.notes.join(' ')).toContain('capped');
  });

  it('measures only the part of a step that still helps', () => {
    const cfg = configFor(fight());
    // Talents give five, so gear hit of eleven and a half leaves half a point.
    cfg.stats.spellHit = 11.5;
    const partial = deriveWeights(cfg, mageFrost, { iterations: 20 });
    const hit = partial.weights.find((w) => w.stat === 'spellHit')!;
    expect(hit.capped).toBeUndefined();
    expect(hit.step).toBeLessThan(2);
    expect(hit.perPoint).toBeGreaterThan(0);
  });

  it('can be shown against a different stat', () => {
    const against = deriveWeights(configFor(fight()), mageFrost, {
      iterations: 40,
      reference: 'spellCrit',
    });
    const crit = against.weights.find((w) => w.stat === 'spellCrit')!;
    expect(crit.normalised).toBeCloseTo(1, 9);
  });

  it('renormalises in place without re-running anything', () => {
    const copy = deriveWeights(configFor(fight()), mageFrost, { iterations: 20 });
    normalise(copy.weights, 'intellect');
    expect(copy.weights.find((w) => w.stat === 'intellect')!.normalised).toBeCloseTo(1, 9);
  });

  it('lets an override replace a measured weight', () => {
    const table = weightTable(result, { stamina: 0.5 });
    expect(table.stamina).toBe(0.5);
    expect(table.spellPower).toBeCloseTo(1, 9);
  });

  it('flags a weight too uncertain to rank two close items', () => {
    expect(isNoisy({ stat: 'spirit', label: 'x', perPoint: 0.01, stderr: 0.02, normalised: 0, step: 1 })).toBe(true);
    expect(isNoisy({ stat: 'spellPower', label: 'x', perPoint: 1, stderr: 0.01, normalised: 1, step: 1 })).toBe(false);
  });
});

describe('scoring gear', () => {
  const weights = weightTable(deriveWeights(configFor(fight()), mageFrost, { iterations: 60 }));

  it('scores an item by its stats through the weights', () => {
    const crown = CHARACTER.owned.find((i) => i.name === 'Crown of the Frozen Wastes')!;
    const circlet = CHARACTER.source.equipped.head!;
    expect(itemScore(crown, weights)).toBeGreaterThan(itemScore(circlet, weights));
  });

  it('ignores a stat the weights say nothing about', () => {
    const sash = CHARACTER.owned.find((i) => i.name === 'Sash of Mending')!;
    // The healing on it is worth nothing to a damage build.
    const score = itemScore(sash, weights);
    const withoutHealing = itemScore({ ...sash, stats: { ...sash.stats, healing: 0 } }, weights);
    expect(score).toBeCloseTo(withoutHealing, 9);
  });

  it('ranks the planted upgrade above what is equipped', () => {
    const head = rankSlot(CHARACTER, 'head', weights);
    expect(head.best?.item.name).toBe('Crown of the Frozen Wastes');
    expect(head.best!.gain).toBeGreaterThan(0);
  });

  it('prefers more spell damage to more intellect on the belt', () => {
    const waist = rankSlot(CHARACTER, 'waist', weights);
    expect(waist.candidates[0]!.item.name).toBe('Cord of Absolute Zero');
    expect(waist.candidates.map((c) => c.item.name)).toContain('Sash of Mending');
  });

  it('leaves a slot alone when nothing owned beats it', () => {
    const chest = rankSlot(CHARACTER, 'chest', weights);
    expect(chest.best).toBeUndefined();
  });

  it('lists the upgrades biggest first', () => {
    const list = upgrades(CHARACTER, weights);
    expect(list.length).toBeGreaterThan(0);
    for (let i = 1; i < list.length; i += 1) expect(list[i - 1]!.gain).toBeGreaterThanOrEqual(list[i]!.gain);
    expect(list[0]!.to.name).toBeTruthy();
  });

  it('will not offer the second copy of a unique ring', () => {
    // The bank holds another Band of Endless Winter, which is already worn.
    const other = candidatesFor(CHARACTER, 'finger2');
    expect(other.some((i) => i.name === 'Band of Endless Winter')).toBe(false);
  });

  it('never offers the ring already on your other hand', () => {
    // Two rings are two rings; moving one across a hand is not an upgrade.
    const names = candidatesFor(CHARACTER, 'finger1').map((i) => i.name);
    expect(names).not.toContain('Signet of the Cold Star');
    const others = candidatesFor(CHARACTER, 'trinket2').map((i) => i.name);
    expect(others).not.toContain('Heart of the Glacier');
  });

  it('does not list a worn item as an upgrade for its paired slot', () => {
    const list = upgrades(CHARACTER, weights);
    const worn = new Set(
      Object.values(CHARACTER.source.equipped).map((i) => i!.name),
    );
    for (const upgrade of list) expect(worn.has(upgrade.to.name)).toBe(false);
  });

  it('offers the bank trinket for the weaker trinket slot', () => {
    const names = candidatesFor(CHARACTER, 'trinket2').map((i) => i.name);
    expect(names).toContain('Talisman of Ephemeral Power');
  });

  it('knows which slots are paired', () => {
    expect(pairedSlot('finger1')).toBe('finger2');
    expect(pairedSlot('trinket2')).toBe('trinket1');
    expect(pairedSlot('mainhand')).toBe('offhand');
    expect(pairedSlot('head')).toBeNull();
  });

  it('keeps the one-handed pair when there is no two-hander to beat it', () => {
    const choice = weaponChoice(CHARACTER, weights);
    expect(choice.twoHandScore).toBe(0);
    expect(choice.oneHandScore).toBeGreaterThan(0);
    expect(choice.mainhand?.name).toBe('Rime-Etched Blade');
  });

  it('takes the two-hander when it beats a hand and a half', () => {
    const staff = {
      ...CHARACTER.source.equipped.mainhand!,
      id: 999001,
      name: 'Staff of the Deep Freeze',
      equipLoc: 'INVTYPE_2HWEAPON',
      subType: 'Staves',
      stats: { intellect: 40, spellPower: 120, spellCrit: 2 },
      location: { where: 'bank' as const },
    };
    const withStaff: Character = { ...CHARACTER, owned: [...CHARACTER.owned, staff] };
    const choice = weaponChoice(withStaff, weights);
    expect(choice.twoHandScore).toBeGreaterThan(choice.oneHandScore);
    expect(choice.upgrade?.to.name).toBe('Staff of the Deep Freeze');

    const loadout = bestLoadout(withStaff, weights);
    expect(loadout.mainhand?.name).toBe('Staff of the Deep Freeze');
    expect(loadout.offhand).toBeUndefined();
  });

  it('builds a best loadout that takes every upgrade it found', () => {
    const loadout = bestLoadout(CHARACTER, weights);
    expect(loadout.head?.name).toBe('Crown of the Frozen Wastes');
    expect(loadout.waist?.name).toBe('Cord of Absolute Zero');
    expect(loadout.chest?.name).toBe('Robes of the Frozen Veil');
  });
});

describe('confirming a swap with the simulator', () => {
  const weights = weightTable(deriveWeights(configFor(fight()), mageFrost, { iterations: 40 }));

  it('agrees with the score about which way the swap goes', () => {
    const crown = CHARACTER.owned.find((i) => i.name === 'Crown of the Frozen Wastes')!;
    const compared = compareGear(CHARACTER, fight({ iterations: 80 }), mageFrost, [
      { slot: 'head', item: crown },
    ]);
    const scoreGain = rankSlot(CHARACTER, 'head', weights).best!.gain;

    expect(compared.results[0]!.deltaDps).toBeGreaterThan(0);
    expect(Math.sign(compared.results[0]!.deltaDps)).toBe(Math.sign(scoreGain));
  });

  it('lands close to what the score predicted, once the score is put into damage', () => {
    // A score is counted in spell-damage-equivalents, so it has to be scaled
    // before it means anything. Scaled, it should agree with the simulator.
    const derived = deriveWeights(configFor(fight({ iterations: 120 })), mageFrost, { iterations: 120 });
    const table = weightTable(derived);
    const scale = dpsPerPoint(derived);
    expect(scale).toBeGreaterThan(0);

    const crown = CHARACTER.owned.find((i) => i.name === 'Crown of the Frozen Wastes')!;
    const predicted = rankSlot(CHARACTER, 'head', table).best!.gain * scale;
    const measured = compareGear(CHARACTER, fight({ iterations: 300 }), mageFrost, [
      { slot: 'head', item: crown },
    ]).results[0]!;

    expect(Math.abs(predicted - measured.deltaDps)).toBeLessThan(
      Math.max(1, 0.35 * Math.abs(measured.deltaDps)),
    );
  });

  it('measures no change at all when the swap puts back what was there', () => {
    const worn = CHARACTER.source.equipped.head!;
    const compared = compareGear(CHARACTER, fight({ iterations: 20 }), mageFrost, [
      { slot: 'head', item: worn },
    ]);
    expect(compared.results[0]!.deltaDps).toBeCloseTo(0, 9);
  });

  it('loses damage when an item comes off and nothing replaces it', () => {
    const compared = compareGear(CHARACTER, fight({ iterations: 20 }), mageFrost, [
      { slot: 'head', item: null },
    ]);
    expect(compared.results[0]!.deltaDps).toBeLessThan(0);
  });

  it('takes the off hand off for a two-hander', () => {
    const staff = {
      ...CHARACTER.source.equipped.mainhand!,
      id: 999002,
      name: 'Staff of Testing',
      equipLoc: 'INVTYPE_2HWEAPON',
    };
    const override = overrideFor({ slot: 'mainhand', item: staff });
    expect(override.offhand).toBeNull();

    const compared = compareGear(CHARACTER, fight({ iterations: 20 }), mageFrost, [
      { slot: 'mainhand', item: staff },
    ]);
    expect(compared.results[0]!.clearedOffhand).toBe(true);
  });

  it('reports a baseline the swaps are measured against', () => {
    const compared = compareGear(CHARACTER, fight({ iterations: 20 }), mageFrost, []);
    expect(compared.baseDps).toBeGreaterThan(0);
    expect(compared.results).toHaveLength(0);
  });
});

describe('the fixture character as a whole', () => {
  it('does a believable amount of damage for its gear', () => {
    const cfg = configFor(fight({ iterations: 100 }));
    const sheet = cfg.stats;
    expect(sheet.spellPower).toBe(394);
    expect(sheet.spellHit).toBe(3);

    const weights = deriveWeights(cfg, mageFrost, { iterations: 60 });
    // A mid-raid frost mage in Classic sits somewhere in the hundreds.
    expect(weights.baseDps).toBeGreaterThan(250);
    expect(weights.baseDps).toBeLessThan(900);
  });
});
