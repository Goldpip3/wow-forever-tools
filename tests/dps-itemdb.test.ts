import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  buildDatabase, hasItemDatabase, resolveItem, toItemRef, type ItemDatabaseFile,
} from '../src/dps/itemdb';
import { groupDrops, planDrops } from '../src/dps/droptimizer';
import { runDroptimizer } from '../src/dps/client';
import { candidatesFor } from '../src/dps/gear';
import { parseCharacterExport } from '../src/dps/importer';
import { SAMPLE_WARRIOR_EXPORT } from '../src/dps/sample-warrior';
import { SAMPLE_EXPORT } from '../src/dps/sample';
import type { FightConfig } from '../src/dps/sim/types';

const FILE: ItemDatabaseFile = JSON.parse(
  readFileSync(resolve(__dirname, 'fixtures/items.small.json'), 'utf8'),
);

const db = buildDatabase(FILE);
const warrior = parseCharacterExport(SAMPLE_WARRIOR_EXPORT).character!;
const mage = parseCharacterExport(SAMPLE_EXPORT).character!;

/** A warrior's weights, roughly: strength is two attack power, crit is worth a lot. */
const weights = { attackPower: 1, strength: 2, agility: 1.8, crit: 30, hit: 38, stamina: 0 };

function fight(over: Partial<FightConfig> = {}): FightConfig {
  return {
    v: 2,
    style: { kind: 'patchwerk' },
    duration: 120,
    iterations: 40,
    seed: 20260915,
    target: { level: 63, armor: 3000, resistance: 0, behind: true, canParry: false, canBlock: false },
    buffs: [],
    debuffs: [],
    consumables: [],
    ...over,
  };
}

describe('what ships', () => {
  it('is a list read out of the client, which says so, rather than a guessed one', () => {
    const file = JSON.parse(readFileSync(resolve(__dirname, '../public/data/items.json'), 'utf8'));
    expect(file.source).toMatch(/client tables/);
    expect(file.source).toMatch(/build /);
  });

  it('says there is no database when there is none', () => {
    expect(hasItemDatabase(null)).toBe(false);
    expect(hasItemDatabase(db)).toBe(true);
  });
});

describe('a list, once there is one', () => {
  it('finds an item by its id and credits whoever published it', () => {
    expect(db.get(800001)?.name).toBe('Warblade of the Hidden Vale');
    expect(db.get(999)).toBeUndefined();
    expect(db.source).toContain('fixture');
  });

  it('groups by where it comes from', () => {
    const grouped = db.bySource();
    expect([...grouped.keys()].sort()).toEqual(['The Hidden Vale', 'The Sunken Hold', 'Vendors']);
    expect(grouped.get('The Hidden Vale')!.get('The Keeper')!).toHaveLength(2);
  });

  it('turns a database row into the item shape the rest of the site reads', () => {
    const item = toItemRef(db.get(800001)!);
    expect(item.location.where).toBe('database');
    expect(item.weapon?.hands).toBe('main');
    // Weapon damage per second is worked out here the way the importer does it.
    expect(item.stats.weaponDps).toBeCloseTo((138 + 231) / 2 / 2.7, 2);
    expect(item.setName).toBeUndefined();
    expect(toItemRef(db.get(800002)!).setName).toBe('Vale Regalia');
  });

  it('is accepted by the gear list like anything else', () => {
    const item = toItemRef(db.get(800002)!);
    const owned = { ...warrior, owned: [...warrior.owned, item] };
    const heads = candidatesFor(owned, 'head');
    expect(heads.some((c) => c.id === 800002)).toBe(true);
  });

  it('lets a tooltip win where the two disagree', () => {
    const scanned = { ...toItemRef(db.get(800002)!), location: { where: 'bag' as const } };
    scanned.stats = { ...scanned.stats, strength: 99 };
    scanned.enchant = 12345;

    const merged = resolveItem(scanned, db);
    // What the scan read stays; what it did not know is filled in.
    expect(merged.stats.strength).toBe(99);
    expect(merged.enchant).toBe(12345);
    expect(merged.setName).toBe('Vale Regalia');
    expect(merged.location.where).toBe('bag');
  });
});

describe('what to go and get', () => {
  it('leaves out what the class cannot wear', () => {
    const plan = planDrops(warrior, db, weights);
    const names = plan.candidates.map((c) => c.item.name);
    expect(names).not.toContain('Robes of Quiet Study');
    expect(names).toContain('Helm of the Hidden Vale');
  });

  it('offers a caster the cloth and not the plate', () => {
    const plan = planDrops(mage, db, { spellPower: 1, intellect: 0.5 });
    const names = plan.candidates.map((c) => c.item.name);
    expect(names).toContain('Robes of Quiet Study');
    expect(names).not.toContain('Helm of the Hidden Vale');
  });

  it('leaves out what is far worse than what is already on', () => {
    const plan = planDrops(warrior, db, weights);
    expect(plan.candidates.map((c) => c.item.name)).not.toContain('Trinket of Small Consequence');
  });

  it('leaves out what you already own', () => {
    const owned = { ...warrior, owned: [...warrior.owned, toItemRef(db.get(800002)!)] };
    const plan = planDrops(owned, db, weights);
    expect(plan.candidates.map((c) => c.item.name)).not.toContain('Helm of the Hidden Vale');
  });

  it('only looks where it was asked to', () => {
    const plan = planDrops(warrior, db, weights, ['The Sunken Hold']);
    expect(plan.candidates.every((c) => c.zone === 'The Sunken Hold')).toBe(true);
    expect(plan.candidates.length).toBeGreaterThan(0);
  });

  it('names every zone it knows, for the picker', () => {
    expect(planDrops(warrior, db, weights).zones).toEqual(
      ['The Hidden Vale', 'The Sunken Hold', 'Vendors'],
    );
  });

  it('keeps the grouping stable', () => {
    const rows = [
      { zone: 'A', boss: 'One' },
      { zone: 'B', boss: 'Two' },
      { zone: 'A', boss: 'One' },
      { zone: 'A', boss: 'Three' },
    ];
    const grouped = groupDrops(rows);
    expect(grouped.map((z) => z.zone)).toEqual(['A', 'B']);
    expect(grouped[0]!.bosses.map((b) => b.boss)).toEqual(['One', 'Three']);
    expect(grouped[0]!.bosses[0]!.rows).toHaveLength(2);
  });

  it('simulates the ones it kept and reports only what helps', async () => {
    const result = await runDroptimizer(warrior, fight(), db, weights, { iterations: 40 });
    expect(result.baseDps).toBeGreaterThan(0);
    for (const drop of result.drops) {
      expect(drop.deltaDps).toBeGreaterThan(0);
      expect(drop.zone).toBeTruthy();
      expect(drop.boss).toBeTruthy();
    }
    // Biggest first.
    for (let i = 1; i < result.drops.length; i += 1) {
      expect(result.drops[i - 1]!.deltaDps).toBeGreaterThanOrEqual(result.drops[i]!.deltaDps);
    }
  });
});
