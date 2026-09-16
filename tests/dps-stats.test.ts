import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { TalentData } from '../src/talents/types';
import { parseCharacterExport } from '../src/dps/importer';
import { deriveStatSheet, sheetReports } from '../src/dps/stats';
import { manaPerTick } from '../src/dps/sim/sim';
import { CONVERSIONS, spiritRegenPer2s } from '../src/dps/data/conversions';
import type { FightConfig } from '../src/dps/sim/types';

const here = resolve(fileURLToPath(import.meta.url), '..');
const RAW = JSON.parse(readFileSync(resolve(here, 'fixtures/mage-frost.json'), 'utf8'));
const DATA = JSON.parse(
  readFileSync(resolve(here, '../public/data/talents.generated.json'), 'utf8'),
) as TalentData;

const fight: FightConfig = {
  duration: 180,
  iterations: 1,
  seed: 1,
  target: { level: 63, armor: 0, resistance: 0, behind: true, canParry: false, canBlock: false },
  buffs: [],
  debuffs: [],
  consumables: [],
};

/** The fixture with one change made to a fresh copy of it. */
function character(change: (raw: any) => void) {
  const raw = structuredClone(RAW);
  change(raw);
  return parseCharacterExport(JSON.stringify(raw), DATA.talents.Mage!).character!;
}

const firstSlot = Object.keys(RAW.equipped)[0]!;

describe('stats the character sheet has no line for', () => {
  it('counts mana per five on an equipped item once', () => {
    const wearing = character((raw) => {
      raw.equipped[firstSlot].stats = { ...raw.equipped[firstSlot].stats, mp5: 10 };
    });
    expect(deriveStatSheet(wearing, fight).mp5).toBe(10);
  });

  it('has none once that item comes off', () => {
    const wearing = character((raw) => {
      raw.equipped[firstSlot].stats = { ...raw.equipped[firstSlot].stats, mp5: 10 };
    });
    const bare = deriveStatSheet(wearing, fight, { gearOverride: { [firstSlot]: null } });
    expect(bare.mp5).toBe(0);
  });

  it('counts spell hit from gear when the export had no hit figure', () => {
    const noApi = character((raw) => {
      delete raw.stats.spellHit;
    });
    expect(noApi.source.stats.spellHit).toBeUndefined();
    // The fixture's gear carries 3 spell hit between it.
    expect(deriveStatSheet(noApi, fight).spellHit).toBe(3);
  });

  it('still reads spell hit off the sheet when the export has it', () => {
    const withApi = character((raw) => {
      raw.stats.spellHit = 5;
    });
    expect(deriveStatSheet(withApi, fight).spellHit).toBe(5);
  });
});

describe('measured totals and gear-only stats, kept apart', () => {
  const withMp5 = (raw: any, n: number) => {
    raw.equipped[firstSlot].stats = { ...raw.equipped[firstSlot].stats, mp5: n };
  };

  it('keeps an explicit zero hit as measured, whatever the gear says', () => {
    const zero = character((raw) => {
      raw.stats.spellHit = 0;
    });
    expect(sheetReports(zero.source).has('spellHit')).toBe(true);
    expect(deriveStatSheet(zero, fight).spellHit).toBe(0);
    const absent = character((raw) => {
      delete raw.stats.spellHit;
    });
    expect(sheetReports(absent.source).has('spellHit')).toBe(false);
    expect(deriveStatSheet(absent, fight).spellHit).toBe(3);
  });

  it('keeps every measured total authoritative when nothing is swapped or buffed', () => {
    const plain = character(() => {});
    const sheet = deriveStatSheet(plain, fight);
    const src = plain.source.stats;
    expect(sheet.intellect).toBe(src.intellect);
    expect(sheet.spirit).toBe(src.spirit);
    expect(sheet.spellHit).toBe(src.spellHit);
    expect(sheet.spellCrit).toBeCloseTo(src.spellCrit.frost!, 6);
  });

  it('never goes below nothing for a gear-only stat when the only source comes off', () => {
    const wearing = character((raw) => withMp5(raw, 10));
    const bare = deriveStatSheet(wearing, fight, { gearOverride: { [firstSlot]: null } });
    for (const key of ['mp5', 'haste', 'feralAttackPower', 'weaponDps'] as const) {
      expect(bare[key] ?? 0, key).toBeGreaterThanOrEqual(0);
    }
  });

  it('counts haste on gear once, on and off', () => {
    const hasty = character((raw) => {
      raw.equipped[firstSlot].stats = { ...raw.equipped[firstSlot].stats, haste: 2 };
    });
    expect(deriveStatSheet(hasty, fight).haste).toBe(2);
    expect(deriveStatSheet(hasty, fight, { gearOverride: { [firstSlot]: null } }).haste ?? 0).toBe(0);
  });

  it('adds a buff that was up at export only where the sheet did not already measure it', () => {
    // Mana Spring Totem gives mana per five, which the sheet has no line for.
    const exported = character((raw) => {
      withMp5(raw, 10);
      raw.activeBuffs = ['Mana Spring Totem', 'Arcane Intellect'];
    });
    const ticked = { ...fight, buffs: ['mana-spring-totem', 'arcane-intellect'] };
    const sheet = deriveStatSheet(exported, ticked);
    expect(sheet.mp5).toBe(20);
    // Arcane Intellect is intellect, which the sheet measured with the buff up: not again.
    expect(sheet.intellect).toBe(exported.source.stats.intellect);
    // Ticked without having been up, the totem counts exactly once too.
    const notUp = character((raw) => withMp5(raw, 10));
    expect(deriveStatSheet(notUp, ticked).mp5).toBe(20);
  });

  it('applies a swap\'s primary stat conversions once', () => {
    const plain = character(() => {});
    const slotItem = plain.source.equipped[firstSlot as keyof typeof plain.source.equipped]!;
    const better = { ...slotItem, stats: { ...slotItem.stats, intellect: (slotItem.stats.intellect ?? 0) + 59.5 } };
    const before = deriveStatSheet(plain, fight);
    const after = deriveStatSheet(plain, fight, { gearOverride: { [firstSlot]: better } });
    expect(after.intellect - before.intellect).toBeCloseTo(59.5, 6);
    // A mage turns 59.5 intellect into one per cent spell crit and 15 mana a point, once.
    expect(after.spellCrit - before.spellCrit).toBeCloseTo(59.5 / CONVERSIONS.mage.intPerSpellCrit, 6);
    expect(after.mana - before.mana).toBeCloseTo(59.5 * CONVERSIONS.mage.manaPerInt, 6);
  });
});

describe('mana regeneration, worked out by hand', () => {
  it('pays ten mana per five as four mana every two-second tick, casting or not', () => {
    const noSpirit = { per2s: 0, castingFraction: 0 };
    expect(manaPerTick(noSpirit, 10, false)).toBe(4);
    expect(manaPerTick(noSpirit, 10, true)).toBe(4);
    expect(manaPerTick(noSpirit, 0, true)).toBe(0);
  });

  it('adds spirit at its full rate outside the five-second rule and its fraction inside it', () => {
    // A mage with 250 spirit: 250 / 4 + 12.5 = 75 mana every two seconds from spirit.
    const per2s = spiritRegenPer2s('mage', 250);
    expect(per2s).toBe(75);
    const regen = { per2s, castingFraction: 0.15 };
    expect(manaPerTick(regen, 10, false)).toBe(79); // 75 + 4
    expect(manaPerTick(regen, 10, true)).toBeCloseTo(15.25, 10); // 75 * 0.15 + 4
  });

  it('turns an item with 10 mana per five into 4 mana a tick, and nothing once it is off', () => {
    const wearing = character((raw) => {
      raw.equipped[firstSlot].stats = { ...raw.equipped[firstSlot].stats, mp5: 10 };
    });
    const none = { per2s: 0, castingFraction: 0 };
    const on = deriveStatSheet(wearing, fight);
    const off = deriveStatSheet(wearing, fight, { gearOverride: { [firstSlot]: null } });
    expect(manaPerTick(none, on.mp5, true)).toBe(4);
    expect(manaPerTick(none, off.mp5, true)).toBe(0);
    // Over a three-minute fight that is 90 ticks, 360 mana, all of it from the item.
    expect(90 * manaPerTick(none, on.mp5, true)).toBe(360);
  });
});
