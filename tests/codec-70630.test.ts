import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { ClassTalents, TalentData } from '../src/talents/types';
import { createBuild, type BuildState } from '../src/talents/build';
import { dataKeyFor, decodeChecked, encode, legalCode } from '../src/talents/codec';
import { layoutBefore70425 } from '../src/talents/layout-70009';
import { layoutBefore70630 } from '../src/talents/layout-70425';

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
  const i = cls.trees[t]!.talents.findIndex((x) => x.name === talent);
  if (i < 0) throw new Error(talent + ' is not in ' + treeName);
  return build.ranks[t]![i]!;
}

const now = (key: string) => DATA.talents[dataKeyFor(key)]!;
const then = (key: string) => layoutBefore70630(dataKeyFor(key))!;

describe('a link made on the trees of build 1.60.1.70425', () => {
  it('keeps those trees for exactly the four classes whose layout changed', () => {
    for (const key of ['paladin', 'hunter', 'mage', 'druid']) {
      expect(then(key).trees.map((t) => t.name), key).toEqual(now(key).trees.map((t) => t.name));
    }
    for (const key of ['warrior', 'rogue', 'priest', 'shaman', 'warlock']) {
      expect(layoutBefore70630(dataKeyFor(key)), key).toBeNull();
    }
  });

  it('follows a Paladin talent into the tree it moved to', () => {
    const old = buildIn(then('paladin'), 'paladin', {
      Holy: { 'Divine Strength': 5, 'Divine Intellect': 5 },
      Retribution: { Benediction: 5, 'Improved Judgement': 2, 'Holy Conduit': 2, Conviction: 1 },
    });
    const cls = now('paladin');
    const got = decodeChecked(cls, encode(old))!;
    expect(got.migrated).toBe('1.60.1.70630');
    expect(rankOf(cls, got.build, 'Holy', 'Divine Strength')).toBe(5);
    expect(rankOf(cls, got.build, 'Protection', 'Divine Intellect')).toBe(5);
    expect(rankOf(cls, got.build, 'Retribution', 'Benediction')).toBe(5);
    // Holy Conduit is a Holy talent now, on row 3, and five Holy points do not open it.
    expect(rankOf(cls, got.build, 'Holy', 'Holy Conduit')).toBe(0);
    expect(got.dropped).toBe(2);
  });

  it('reads Furor and Heart of the Wild right either way, since they swapped slots as well as trees', () => {
    const old = buildIn(then('druid'), 'druid', {
      'Feral Combat': { Ferocity: 5, 'Heart of the Wild': 5 },
      Restoration: { Furor: 5 },
    });
    const cls = now('druid');
    const got = decodeChecked(cls, encode(old))!;
    expect(got.dropped).toBe(0);
    expect(rankOf(cls, got.build, 'Feral Combat', 'Furor')).toBe(5);
    expect(rankOf(cls, got.build, 'Restoration', 'Heart of the Wild')).toBe(5);
  });

  it('carries Improved Fireball to Accelerant and drops Arcane Focus', () => {
    const old = buildIn(then('mage'), 'mage', {
      Arcane: { 'Arcane Focus': 3 },
      Fire: { 'Improved Fireball': 5 },
    });
    const cls = now('mage');
    const got = decodeChecked(cls, encode(old))!;
    expect(got.migrated).toBe('1.60.1.70630');
    expect(got.dropped).toBe(3);
    expect(rankOf(cls, got.build, 'Fire', 'Accelerant')).toBe(5);
  });

  it('takes ranks a talent no longer has as left out', () => {
    const old = buildIn(then('mage'), 'mage', {
      Fire: { Incineration: 3, 'Improved Fireball': 5, Ignite: 5, Impact: 3, 'Flame Throwing': 2, Pyroblast: 1, 'Burning Soul': 3, 'Master of Elements': 3, 'Critical Mass': 5 },
    });
    const cls = now('mage');
    const got = decodeChecked(cls, encode(old))!;
    expect(rankOf(cls, got.build, 'Fire', 'Critical Mass')).toBe(3);
    expect(got.dropped).toBe(2);
  });

  it('moves Improved Revive Pet back off Pathfinding when only the old rules fit', () => {
    const old = buildIn(then('hunter'), 'hunter', {
      'Beast Mastery': { 'Deadly Aspects': 5, 'Improved Revive Pet': 2 },
    });
    const cls = now('hunter');
    const got = legalCode(cls, encode(old))!;
    expect(got.migrated).toBe('1.60.1.70630');
    const back = decodeChecked(cls, got.code)!.build;
    expect(rankOf(cls, back, 'Beast Mastery', 'Improved Revive Pet')).toBe(2);
    expect(rankOf(cls, back, 'Beast Mastery', 'Pathfinding')).toBe(0);
  });

  it('reads Pathfinding as Improved Revive Pet when both rules fit, which nothing can tell apart', () => {
    const old = buildIn(then('hunter'), 'hunter', {
      'Beast Mastery': { 'Deadly Aspects': 5, Pathfinding: 2 },
    });
    const cls = now('hunter');
    const got = decodeChecked(cls, encode(old))!;
    expect(got.migrated).toBeUndefined();
    expect(rankOf(cls, got.build, 'Beast Mastery', 'Improved Revive Pet')).toBe(2);
  });

  it('goes straight to the current trees from the trees before build 1.60.1.70425', () => {
    const before = layoutBefore70425('Mage')!;
    const old = buildIn(before, 'mage', {
      Fire: { 'Improved Fireball': 5, Incineration: 3, Ignite: 5, Pyroblast: 1, 'Burning Soul': 1, 'Hot Streak': 1 },
    });
    const cls = now('mage');
    const got = decodeChecked(cls, encode(old))!;
    expect(got.migrated).toBe('1.60.1.70425');
    expect(rankOf(cls, got.build, 'Fire', 'Accelerant')).toBe(5);
    expect(rankOf(cls, got.build, 'Fire', 'Heating Up')).toBe(1);
  });
});

describe('a link made on the current trees', () => {
  it('is never moved, in any class whose trees changed', () => {
    for (const key of ['paladin', 'hunter', 'mage', 'druid']) {
      const cls = now(key);
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
});
