import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { ClassTalents, TalentData } from '../src/talents/types';
import { createBuild, type BuildState } from '../src/talents/build';
import { dataKeyFor, decodeChecked, encode, legalCode } from '../src/talents/codec';
import { layoutBefore70425 } from '../src/talents/layout-70009';

const DATA: TalentData = JSON.parse(
  readFileSync(resolve(__dirname, '../public/data/talents.generated.json'), 'utf8'),
);

/** A build in a given layout, its ranks given by tree and talent name. */
function buildIn(cls: ClassTalents, classKey: string, ranks: Record<string, Record<string, number>>): BuildState {
  const build = createBuild(classKey, cls, 60);
  cls.trees.forEach((tree, t) => {
    for (const [name, rank] of Object.entries(ranks[tree.name] ?? {})) {
      const i = tree.talents.findIndex((x) => x.name === name);
      if (i < 0) throw new Error(name + ' is not in ' + tree.name);
      build.ranks[t]![i] = rank;
    }
  });
  return build;
}

function rankOf(cls: ClassTalents, build: BuildState, treeName: string, talent: string): number {
  const t = cls.trees.findIndex((x) => x.name === treeName);
  return build.ranks[t]![cls.trees[t]!.talents.findIndex((x) => x.name === talent)]!;
}

const now = (key: string) => DATA.talents[dataKeyFor(key)]!;
const then = (key: string) => layoutBefore70425(dataKeyFor(key))!;

describe('a link made before build 1.60.1.70425', () => {
  it('keeps the old trees for exactly the six classes whose layout changed', () => {
    for (const key of ['warrior', 'priest', 'shaman', 'mage', 'warlock', 'druid']) {
      expect(then(key).trees.map((t) => t.name), key).toEqual(now(key).trees.map((t) => t.name));
    }
    for (const key of ['paladin', 'hunter', 'rogue']) expect(layoutBefore70425(dataKeyFor(key)), key).toBeNull();
  });

  it('moves a Fury warrior by talent name, which the tree length gives away', () => {
    const old = buildIn(then('warrior'), 'warrior', {
      Arms: { 'Improved Heroic Strike': 3, Deflection: 2 },
      Fury: {
        'Booming Voice': 3, Cruelty: 5, 'Unbridled Wrath': 5, 'Blood Craze': 2,
        Enrage: 5, 'Dual Wield Specialization': 5, 'Improved Execute': 2, 'Death Wish': 1, Flurry: 1,
      },
    });
    const cls = now('warrior');
    const got = decodeChecked(cls, encode(old))!;
    expect(got.migrated).toBe(true);
    expect(got.dropped).toBe(0);
    expect(rankOf(cls, got.build, 'Fury', 'Cruelty')).toBe(5);
    expect(rankOf(cls, got.build, 'Fury', 'Dual Wield Specialization')).toBe(5);
    expect(rankOf(cls, got.build, 'Fury', 'Improved Execute')).toBe(2);
    expect(rankOf(cls, got.build, 'Fury', 'Flurry')).toBe(1);
    expect(rankOf(cls, got.build, 'Arms', 'Deflection')).toBe(2);
  });

  it('drops the points on a talent that is gone and says how many', () => {
    // Affliction kept its length, so this is caught by the old rules fitting and the new not.
    const old = buildIn(then('warlock'), 'warlock', {
      Affliction: { Suppression: 5, 'Improved Corruption': 5, Malediction: 5 },
    });
    const cls = now('warlock');
    const got = decodeChecked(cls, encode(old))!;
    expect(got.migrated).toBe(true);
    expect(got.dropped).toBe(5);
    expect(rankOf(cls, got.build, 'Affliction', 'Improved Corruption')).toBe(5);
    expect(rankOf(cls, got.build, 'Affliction', 'Grim Reach')).toBe(0);
  });

  it('carries a renamed talent to its new name', () => {
    const old = buildIn(then('mage'), 'mage', {
      Fire: { 'Improved Fireball': 5, Incineration: 3, Ignite: 5, Pyroblast: 1, 'Burning Soul': 1, 'Hot Streak': 1 },
    });
    const cls = now('mage');
    const got = decodeChecked(cls, encode(old))!;
    expect(got.migrated).toBe(true);
    expect(rankOf(cls, got.build, 'Fire', 'Heating Up')).toBe(1);
    expect(rankOf(cls, got.build, 'Fire', 'Ignite')).toBe(5);
  });

  it('is rewritten by legalCode, so the raid planner stores the new link', () => {
    const old = buildIn(then('druid'), 'druid', { 'Feral Combat': { Ferocity: 5, 'Heart of the Wild': 5 } });
    const cls = now('druid');
    const got = legalCode(cls, encode(old))!;
    expect(got.migrated).toBe(true);
    expect(got.code).not.toBe(encode(old));
    expect(decodeChecked(cls, got.code)!.migrated).toBeUndefined();
  });
});

describe('a link made since', () => {
  it('is never moved, in any class whose trees changed', () => {
    for (const key of ['warrior', 'priest', 'shaman', 'mage', 'warlock', 'druid']) {
      const cls = now(key);
      // Five points in the first talent of every tree that takes them, which is legal.
      const build = createBuild(key, cls, 60);
      cls.trees.forEach((tree, t) => {
        const first = tree.talents.findIndex((x) => x.row === 1 && x.max === 5 && !x.req);
        if (first >= 0) build.ranks[t]![first] = 5;
      });
      const got = decodeChecked(cls, encode(build))!;
      expect(got.migrated, key).toBeUndefined();
      expect(got.dropped, key).toBe(0);
    }
  });

  it('wins when a link fits both, which is the case nothing can tell apart', () => {
    // Restoration swapped Totemic Focus and Tidal Focus, both five ranks, one row apart.
    const cls = now('shaman');
    const build = buildIn(cls, 'shaman', { Restoration: { 'Tidal Focus': 5, 'Totemic Focus': 5 } });
    expect(decodeChecked(cls, encode(build))!.migrated).toBeUndefined();
  });
});
