import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { buildDatabase, toItemRef, UNSOURCED, type ItemDatabaseFile } from '../src/dps/itemdb';
import { slotsFor } from '../src/dps/export-format';
import { canUse } from '../src/dps/proficiency';

const __dirname = dirname(fileURLToPath(import.meta.url));
const file = JSON.parse(
  readFileSync(resolve(__dirname, '../public/data/items.json'), 'utf8'),
) as ItemDatabaseFile;

const db = buildDatabase(file);
const item = (id: number) => db.get(id);

describe('the shipped item list', () => {
  it('says where it came from and which build it was read out of', () => {
    expect(file.v).toBe(1);
    expect(file.source).toMatch(/build \d+\.\d+\.\d+\.\d+/);
    expect(file.items.length).toBeGreaterThan(5000);
  });

  it('is nothing but equippable items, each with a slot the site understands', () => {
    for (const entry of file.items) {
      expect(entry.name, String(entry.id)).toBeTruthy();
      expect(entry.equipLoc, entry.name).toMatch(/^INVTYPE_/);
      for (const value of Object.values(entry.stats)) expect(Number.isFinite(value)).toBe(true);
    }
    // Most of them go somewhere; bags, tabards and shirts are the rest.
    const wearable = file.items.filter((entry) => slotsFor(entry.equipLoc).length > 0);
    expect(wearable.length / file.items.length).toBeGreaterThan(0.9);
  });
});

/**
 * The client stores a budget rather than a finished item, so these check the
 * arithmetic against tooltips that have read the same way since Classic. If
 * Forever rebalances one of them these will fail, which is the point: the
 * number moved and somebody should look.
 */
describe('the numbers the importer works out', () => {
  it('gets Sulfuras right, damage and stats both', () => {
    const sulfuras = item(17182)!;
    expect(sulfuras.name).toBe('Sulfuras, Hand of Ragnaros');
    expect(sulfuras.weapon).toEqual({ min: 223, max: 372, speed: 3.7, type: 'Two-Handed Maces' });
    expect(sulfuras.stats.strength).toBe(12);
    expect(sulfuras.stats.stamina).toBe(12);
    expect(sulfuras.resistances?.fire).toBe(30);
  });

  it('turns a crit rating into the per cent the tooltip shows', () => {
    const helm = item(12640)!;
    expect(helm.name).toBe('Lionheart Helm');
    expect(helm.stats.strength).toBe(18);
    expect(helm.stats.crit).toBe(2);
  });

  it('spends a smaller budget on a ring than on a chest', () => {
    // Same percentage, different slot: the budget column is what separates them.
    const rings = file.items.filter((i) => i.equipLoc === 'INVTYPE_FINGER' && i.ilvl === 60);
    const chests = file.items.filter((i) => i.equipLoc === 'INVTYPE_CHEST' && i.ilvl === 60);
    const most = (list: typeof file.items) =>
      Math.max(...list.map((i) => Math.max(0, ...Object.values(i.stats))));
    expect(most(rings)).toBeLessThan(most(chests));
  });

  it('keeps resistances apart from stats', () => {
    const thunderfury = item(19019)!;
    expect(thunderfury.stats.agility).toBe(5);
    expect(thunderfury.resistances).toEqual({ fire: 8, nature: 9 });
  });
});

describe('what the client tables do not have', () => {
  it('says nothing about where anything drops, so the lists band by item level', () => {
    expect(file.items.some((entry) => entry.source)).toBe(false);
    const grouped = db.bySource();
    expect([...grouped.keys()]).toEqual([UNSOURCED]);
    expect([...grouped.get(UNSOURCED)!.keys()].every((band) => band.startsWith('Item level'))).toBe(true);
  });

  it('carries no tooltip text, which is what an addon export still adds', () => {
    expect(file.items.some((entry) => entry.effects?.length)).toBe(false);
  });
});

describe('an item off the list', () => {
  it('becomes the same shape the addon sends, and proficiency reads it', () => {
    const ref = toItemRef(item(17182)!);
    expect(ref.location).toEqual({ where: 'database' });
    expect(canUse('warrior', ref).usable).toBe(true);
    expect(canUse('mage', ref).usable).toBe(false);
  });

  it('knows which set a tier piece belongs to', () => {
    const sets = file.sets ?? [];
    expect(sets.length).toBeGreaterThan(100);
    const withPieces = sets.find((set) => set.itemIds.length >= 5)!;
    for (const id of withPieces.itemIds) {
      const piece = item(id);
      if (piece) expect(piece.set).toBe(withPieces.name);
    }
  });
});
