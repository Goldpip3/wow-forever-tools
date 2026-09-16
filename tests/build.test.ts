import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { TalentData, ClassTalents } from '../src/talents/types';
import {
  MAX_POINTS,
  addPoint,
  canAdd,
  buildLegal,
  canRemove,
  legalize,
  treeLegal,
  cellState,
  createBuild,
  levelNeeded,
  nextRowAt,
  pointsForLevel,
  pointsLeft,
  primaryTree,
  rankText,
  removePoint,
  resetAll,
  rowRequirement,
  totalSpent,
  treeTotal,
} from '../src/talents/build';
import { decode, decodeChecked, encode, encodeTrees, legalCode, parseCode } from '../src/talents/codec';

const DATA: TalentData = JSON.parse(
  readFileSync(resolve(__dirname, '../public/data/talents.generated.json'), 'utf8'),
);

const WARRIOR: ClassTalents = DATA.talents.Warrior!;
const EXAMPLE = 'warrior/60/05305213030510201-000000000000000000-0000000000000000000';

function treeIndex(cls: ClassTalents, name: string): number {
  return cls.trees.findIndex((t) => t.name === name);
}

function talentIndex(cls: ClassTalents, treeName: string, talentName: string): number {
  const tree = cls.trees[treeIndex(cls, treeName)]!;
  return tree.talents.findIndex((t) => t.name === talentName);
}

describe('point budget', () => {
  it('gives one point at level 10 and 51 at level 60', () => {
    expect(pointsForLevel(10)).toBe(1);
    expect(pointsForLevel(60)).toBe(MAX_POINTS);
    expect(pointsForLevel(40)).toBe(31);
    expect(pointsForLevel(9)).toBe(0);
  });

  it('never exceeds 51 even above level 60', () => {
    expect(pointsForLevel(70)).toBe(MAX_POINTS);
  });

  it('refuses a point once the level budget is spent', () => {
    const build = createBuild('warrior', WARRIOR, 10);
    const arms = treeIndex(WARRIOR, 'Arms');
    const deflection = talentIndex(WARRIOR, 'Arms', 'Deflection');
    expect(addPoint(WARRIOR, build, arms, deflection).ok).toBe(true);
    const second = addPoint(WARRIOR, build, arms, deflection);
    expect(second.ok).toBe(false);
    expect(second.reason).toMatch(/All points are spent/);
  });
});

describe('row unlocking', () => {
  it('requires five points per row', () => {
    expect(rowRequirement(1)).toBe(0);
    expect(rowRequirement(2)).toBe(5);
    expect(rowRequirement(7)).toBe(30);
  });

  it('locks a row-2 talent until five points sit in the tree', () => {
    const build = createBuild('warrior', WARRIOR, 60);
    const arms = treeIndex(WARRIOR, 'Arms');
    const row2 = WARRIOR.trees[arms]!.talents.findIndex((t) => t.row === 2);
    expect(canAdd(WARRIOR, build, arms, row2).ok).toBe(false);
    expect(cellState(WARRIOR, build, arms, row2)).toBe('locked');

    const deflection = talentIndex(WARRIOR, 'Arms', 'Deflection');
    for (let i = 0; i < 5; i += 1) addPoint(WARRIOR, build, arms, deflection);
    expect(treeTotal(build.ranks, arms)).toBe(5);
    expect(canAdd(WARRIOR, build, arms, row2).ok).toBe(true);
    expect(cellState(WARRIOR, build, arms, row2)).toBe('open');
  });

  it('reports the next locked row threshold', () => {
    const build = createBuild('warrior', WARRIOR, 60);
    const arms = treeIndex(WARRIOR, 'Arms');
    expect(nextRowAt(WARRIOR, build.ranks, arms)).toBe(5);
  });
});

describe('prerequisites', () => {
  it('blocks a talent whose prerequisite is not maxed', () => {
    const build = createBuild('warrior', WARRIOR, 60);
    const arms = treeIndex(WARRIOR, 'Arms');
    const tree = WARRIOR.trees[arms]!;
    const gatedIdx = tree.talents.findIndex((t) => !!t.req);
    expect(gatedIdx).toBeGreaterThanOrEqual(0);
    const gated = tree.talents[gatedIdx]!;
    const reqIdx = tree.talents.findIndex((t) => t.name === gated.req);

    // Fill the tree so rows are open but the prerequisite stays empty.
    const filler = talentIndex(WARRIOR, 'Arms', 'Deflection');
    for (let i = 0; i < 5; i += 1) addPoint(WARRIOR, build, arms, filler);
    while (treeTotal(build.ranks, arms) < rowRequirement(gated.row)) {
      const open = tree.talents.findIndex(
        (t, i) => i !== reqIdx && i !== gatedIdx && cellState(WARRIOR, build, arms, i) !== 'locked'
          && (build.ranks[arms]![i] ?? 0) < t.max,
      );
      if (open < 0) break;
      addPoint(WARRIOR, build, arms, open);
    }

    const blocked = canAdd(WARRIOR, build, arms, gatedIdx);
    expect(blocked.ok).toBe(false);
    expect(blocked.reason).toMatch(/Requires/);
  });

  it('refuses to unlearn a maxed prerequisite that something depends on', () => {
    const build = createBuild('warrior', WARRIOR, 60);
    const arms = treeIndex(WARRIOR, 'Arms');
    const tree = WARRIOR.trees[arms]!;
    const gatedIdx = tree.talents.findIndex((t) => !!t.req);
    const gated = tree.talents[gatedIdx]!;
    const reqIdx = tree.talents.findIndex((t) => t.name === gated.req)!;

    // Spend enough in the tree to reach the gated talent's row.
    const filler = talentIndex(WARRIOR, 'Arms', 'Deflection');
    for (let i = 0; i < 5; i += 1) addPoint(WARRIOR, build, arms, filler);
    for (let i = 0; i < tree.talents.length && treeTotal(build.ranks, arms) < rowRequirement(gated.row); i += 1) {
      while (
        treeTotal(build.ranks, arms) < rowRequirement(gated.row) &&
        addPoint(WARRIOR, build, arms, i).ok
      ) {
        /* keep filling */
      }
    }
    while ((build.ranks[arms]![reqIdx] ?? 0) < tree.talents[reqIdx]!.max) {
      if (!addPoint(WARRIOR, build, arms, reqIdx).ok) break;
    }
    expect(build.ranks[arms]![reqIdx]).toBe(tree.talents[reqIdx]!.max);

    addPoint(WARRIOR, build, arms, gatedIdx);
    expect(build.ranks[arms]![gatedIdx]).toBeGreaterThan(0);

    const blocked = canRemove(WARRIOR, build, arms, reqIdx);
    expect(blocked.ok).toBe(false);
    expect(blocked.reason).toMatch(/Unlearn it first/);
  });
});

describe('removing points', () => {
  /** 6 in row 1, 5 in row 2, 1 in row 3: row 3 needs 10 above it, row 2 needs 5. */
  function twelvePointArms() {
    const build = createBuild('warrior', WARRIOR, 60);
    const arms = treeIndex(WARRIOR, 'Arms');
    const tree = WARRIOR.trees[arms]!;
    const row1 = talentIndex(WARRIOR, 'Arms', 'Deflection');
    const spare = talentIndex(WARRIOR, 'Arms', 'Improved Heroic Strike');
    for (let i = 0; i < 5; i += 1) addPoint(WARRIOR, build, arms, row1);
    addPoint(WARRIOR, build, arms, spare);
    // Improved Tactical Mastery: row 2, max 5, and Anger Management below it depends on it.
    const row2 = talentIndex(WARRIOR, 'Arms', 'Improved Tactical Mastery');
    for (let i = 0; i < 5; i += 1) addPoint(WARRIOR, build, arms, row2);
    expect(treeTotal(build.ranks, arms)).toBe(11);
    const row3 = tree.talents.findIndex(
      (t) => t.row === 3 && (!t.req || t.req === tree.talents[row2]!.name),
    );
    expect(addPoint(WARRIOR, build, arms, row3).ok).toBe(true);
    expect(treeTotal(build.ranks, arms)).toBe(12);
    return { build, arms, row1, spare, row2, row3 };
  }

  it('refuses a removal that would strand points in a lower row', () => {
    const { build, arms, row1, spare } = twelvePointArms();
    // The spare point goes: row 1 still holds 5, and rows 1 and 2 still hold the 10 row 3 needs.
    expect(removePoint(WARRIOR, build, arms, spare).ok).toBe(true);
    // One more from row 1 leaves row 2 with 4 above it. Row 2's own points do not count.
    const blocked = canRemove(WARRIOR, build, arms, row1);
    expect(blocked.ok).toBe(false);
    expect(blocked.reason).toMatch(/needs 5 points/);
  });

  it('allows a removal once the rows below are empty again', () => {
    const { build, arms, row1, spare, row2, row3 } = twelvePointArms();
    removePoint(WARRIOR, build, arms, spare);
    expect(canRemove(WARRIOR, build, arms, row1).ok).toBe(false);
    removePoint(WARRIOR, build, arms, row3);
    for (let i = 0; i < 5; i += 1) expect(removePoint(WARRIOR, build, arms, row2).ok).toBe(true);
    expect(canRemove(WARRIOR, build, arms, row1).ok).toBe(true);
  });

  it('resets everything to zero', () => {
    const build = createBuild('warrior', WARRIOR, 60);
    const arms = treeIndex(WARRIOR, 'Arms');
    addPoint(WARRIOR, build, arms, talentIndex(WARRIOR, 'Arms', 'Deflection'));
    resetAll(build);
    expect(totalSpent(build.ranks)).toBe(0);
  });
});

describe('build code round trip', () => {
  it('decodes the reference Arms build to 31 points', () => {
    const build = decode(WARRIOR, EXAMPLE)!;
    expect(build).not.toBeNull();
    expect(build.classKey).toBe('warrior');
    expect(build.level).toBe(60);
    const arms = treeIndex(WARRIOR, 'Arms');
    expect(treeTotal(build.ranks, arms)).toBe(31);
    expect(totalSpent(build.ranks)).toBe(31);
    expect(pointsLeft(build)).toBe(20);
    expect(levelNeeded(build)).toBe(40);
  });

  it('re-encodes to the identical string', () => {
    const build = decode(WARRIOR, EXAMPLE)!;
    expect(encode(build)).toBe(EXAMPLE);
  });

  it('reads the reference build as Arms', () => {
    const build = decode(WARRIOR, EXAMPLE)!;
    const primary = primaryTree(WARRIOR, build)!;
    expect(primary.tree.name).toBe('Arms');
    expect(primary.points).toBe(31);
  });

  it('puts the right ranks on the right talents', () => {
    const build = decode(WARRIOR, EXAMPLE)!;
    const arms = treeIndex(WARRIOR, 'Arms');
    const at = (name: string) => build.ranks[arms]![talentIndex(WARRIOR, 'Arms', name)];
    expect(at('Improved Heroic Strike')).toBe(0);
    expect(at('Deflection')).toBe(5);
    expect(at('Improved Rend')).toBe(3);
    expect(at('Mortal Strike')).toBe(1);
  });

  it('writes one digit per talent in each tree', () => {
    const build = decode(WARRIOR, EXAMPLE)!;
    const segments = encodeTrees(build).split('-');
    expect(segments).toHaveLength(WARRIOR.trees.length);
    WARRIOR.trees.forEach((tree, i) => {
      expect(segments[i]!.length).toBe(tree.talents.length);
    });
  });

  it('accepts a full talentsforever.com URL', () => {
    const parsed = parseCode('https://talentsforever.com/' + EXAMPLE);
    expect(parsed?.classKey).toBe('warrior');
    expect(parsed?.level).toBe(60);
    expect(parsed?.trees[0]).toBe('05305213030510201');
  });

  it('accepts our own hash form', () => {
    const parsed = parseCode('#' + EXAMPLE);
    expect(parsed?.classKey).toBe('warrior');
  });

  it('accepts a class-only code and defaults to level 60', () => {
    const parsed = parseCode('druid');
    expect(parsed?.classKey).toBe('druid');
    expect(parsed?.level).toBe(60);
    expect(parsed?.trees).toEqual([]);
  });

  it('rejects an unknown class', () => {
    expect(parseCode('deathknight/60/000')).toBeNull();
    expect(parseCode('')).toBeNull();
  });

  it('clamps a digit above a talent maximum', () => {
    const arms = treeIndex(WARRIOR, 'Arms');
    const first = WARRIOR.trees[arms]!.talents[0]!;
    const build = decode(WARRIOR, 'warrior/60/9')!;
    expect(build.ranks[arms]![0]).toBe(first.max);
  });

  it('round-trips every class at full points', () => {
    for (const [key, cls] of Object.entries(DATA.talents)) {
      const classKey = key.toLowerCase();
      const build = createBuild(classKey, cls, 60);
      const treeIdx = 0;
      let guard = 0;
      while (pointsLeft(build) > 0 && guard < 200) {
        guard += 1;
        const idx = cls.trees[treeIdx]!.talents.findIndex(
          (t, i) => (build.ranks[treeIdx]![i] ?? 0) < t.max && canAdd(cls, build, treeIdx, i).ok,
        );
        if (idx < 0) break;
        addPoint(cls, build, treeIdx, idx);
      }
      const code = encode(build);
      const back = decode(cls, code)!;
      expect(back.ranks, key).toEqual(build.ranks);
    }
  });
});

describe('rank text', () => {
  it('returns the exact text for a rank that was read off the demo', () => {
    const arms = treeIndex(WARRIOR, 'Arms');
    const deflection = WARRIOR.trees[arms]!.talents[talentIndex(WARRIOR, 'Arms', 'Deflection')]!;
    expect(rankText(deflection, 1).text).toMatch(/Parry chance by 1%/);
    expect(rankText(deflection, 5).text).toMatch(/Parry chance by 5%/);
    expect(rankText(deflection, 5).estimated).toBe(false);
  });

  it('scales the numbers on a rank the demo never showed, and says it guessed', () => {
    // Wand Specialization is the reported case: two ranks, only the first one read, so
    // rank 2 used to repeat rank 1's "13%" and looked like the click had done nothing.
    const priest: ClassTalents = DATA.talents.Priest!;
    const disc = priest.trees[treeIndex(priest, 'Discipline')]!;
    const wand = disc.talents[talentIndex(priest, 'Discipline', 'Wand Specialization')]!;

    const one = rankText(wand, 1);
    const two = rankText(wand, 2);
    expect(one.text).toMatch(/Wands by 13%/);
    expect(one.estimated).toBe(false);
    expect(two.text).toMatch(/Wands by 26%/);
    expect(two.estimated).toBe(true);
  });

  it('scales only the numbers listed in scaleIdx', () => {
    const talent = {
      name: 'Test',
      max: 3,
      row: 1,
      col: 1,
      icon: 'x',
      desc: { '1': 'Slows the target by 15% for 1.5 sec and costs 20 Mana.' },
      scaleIdx: [0],
    } as unknown as Parameters<typeof rankText>[0];

    // The 15% triples; the duration and the cost are left exactly as they were.
    expect(rankText(talent, 3).text).toBe('Slows the target by 45% for 1.5 sec and costs 20 Mana.');
  });

  it('scales from the nearest read rank, not always the lowest', () => {
    const talent = {
      name: 'Test',
      max: 6,
      row: 1,
      col: 1,
      icon: 'x',
      desc: { '1': 'Deals 10 damage.', '4': 'Deals 40 damage.' },
      scaleIdx: [0],
    } as unknown as Parameters<typeof rankText>[0];

    // Rank 5 is one step from rank 4, five steps from rank 1.
    expect(rankText(talent, 5).text).toBe('Deals 50 damage.');
  });

  it('leaves the text alone when nothing is marked as scaling', () => {
    const arms = treeIndex(WARRIOR, 'Arms');
    const tree = WARRIOR.trees[arms]!;
    const sparse = tree.talents.find(
      (t) => !Array.isArray(t.desc) && t.max > 1 && !t.scaleIdx?.length,
    );
    if (!sparse) return;
    const known = Object.keys(sparse.desc as Record<string, string>)[0]!;
    const guess = rankText(sparse, sparse.max);
    expect(guess.estimated).toBe(true);
    expect(guess.text).toBe((sparse.desc as Record<string, string>)[known]);
  });
});

describe('every talent, every rank', () => {
  const CLASSES = Object.entries(DATA.talents) as Array<[string, ClassTalents]>;

  it('gives Genesis a different figure at all five ranks', () => {
    const druid = DATA.talents.Druid!;
    const balance = druid.trees[treeIndex(druid, 'Balance')]!;
    const genesis = balance.talents[talentIndex(druid, 'Balance', 'Genesis')]!;
    const texts = [1, 2, 3, 4, 5].map((r) => rankText(genesis, r).text);
    expect(texts[0]).toMatch(/by 1%/);
    expect(texts[4]).toMatch(/by 5%/);
    expect(new Set(texts).size).toBe(5);
  });

  it('never claims a rank was scaled when it was not', () => {
    // 'unknown' means the text on screen belongs to another rank, and the tooltip has to
    // say so. 'scaled' means figures were worked out. Getting these the wrong way round
    // is what made every rank of Genesis read 1%.
    const wrong: string[] = [];
    for (const [cls, data] of CLASSES) {
      for (const tree of data.trees) {
        for (const talent of tree.talents) {
          for (let r = 1; r <= talent.max; r += 1) {
            const got = rankText(talent, r);
            const isRead = got.basis === 'read';
            if (isRead !== !got.estimated) wrong.push(`${cls} ${talent.name} r${r}`);
          }
        }
      }
    }
    expect(wrong).toEqual([]);
  });

  it('leaves a multi-number talent alone rather than guessing which figure moves', () => {
    const warrior = WARRIOR;
    const fury = warrior.trees[treeIndex(warrior, 'Fury')]!;
    const idx = fury.talents.findIndex((t) => t.name === 'Unbridled Wrath');
    if (idx < 0) return;
    const talent = fury.talents[idx]!;
    const got = rankText(talent, talent.max);
    // "a 12% chance to generate 1 additional Rage" — the chance moves, the Rage does not,
    // and nothing in the data says which, so it must not invent an answer.
    expect(got.basis).toBe('unknown');
    expect(got.estimated).toBe(true);
  });

  it('scales a talent that carries exactly one number', () => {
    let checked = 0;
    for (const [, data] of CLASSES) {
      for (const tree of data.trees) {
        for (const talent of tree.talents) {
          if (talent.max < 2 || Array.isArray(talent.desc)) continue;
          const keys = Object.keys(talent.desc);
          if (keys.length !== 1 || talent.scaleIdx?.length) continue;
          const known = Number(keys[0]);
          const base = (talent.desc as Record<string, string>)[keys[0]!]!;
          if ((base.match(/\d+(?:\.\d+)?/g) ?? []).length !== 1) continue;
          // Probe a rank that is not the one the demo showed; at the known rank there is
          // nothing to work out, which is why Reverence reads as 'read' at its max.
          const probe = known === talent.max ? talent.max - 1 : talent.max;
          const got = rankText(talent, probe);
          expect(got.basis, talent.name).toBe('scaled');
          expect(got.text, talent.name).not.toBe(base);
          checked += 1;
        }
      }
    }
    expect(checked).toBeGreaterThan(30);
  });
});

describe('ranks between two read ranks', () => {
  /* Maelstrom Weapon's shape: rank 1 and rank 5 read, three numbers in the sentence, only
     one of which moves. The old code copied whichever read rank was nearer, so rank 3 read
     4% and rank 4 read 20%. */
  const maelstrom = {
    name: 'Maelstrom Weapon',
    max: 5,
    row: 1,
    col: 1,
    icon: 'x',
    desc: {
      '1': 'reduce the cast time of your next Lightning Bolt by 4%. Stacks up to 5 times. Lasts 30 sec.',
      '5': 'reduce the cast time of your next Lightning Bolt by 20%. Stacks up to 5 times. Lasts 30 sec.',
    },
  } as unknown as Parameters<typeof rankText>[0];

  it('reads straight across instead of copying the nearer end', () => {
    expect(rankText(maelstrom, 2).text).toContain('by 8%');
    expect(rankText(maelstrom, 3).text).toContain('by 12%');
    expect(rankText(maelstrom, 4).text).toContain('by 16%');
  });

  it('leaves the numbers that do not move between the two ranks alone', () => {
    for (const rank of [2, 3, 4]) {
      const text = rankText(maelstrom, rank).text;
      expect(text, 'rank ' + rank).toContain('Stacks up to 5 times');
      expect(text, 'rank ' + rank).toContain('Lasts 30 sec');
    }
  });

  it('calls the filled-in ranks estimates and the read ones read', () => {
    expect(rankText(maelstrom, 1).basis).toBe('read');
    expect(rankText(maelstrom, 5).basis).toBe('read');
    for (const rank of [2, 3, 4]) {
      expect(rankText(maelstrom, rank).basis, 'rank ' + rank).toBe('scaled');
      expect(rankText(maelstrom, rank).estimated, 'rank ' + rank).toBe(true);
    }
  });

  it('refuses when the two ranks are not the same sentence', () => {
    const reworded = {
      name: 'Reworded',
      max: 3,
      row: 1,
      col: 1,
      icon: 'x',
      desc: {
        '1': 'Increases damage by 5% for 8 sec.',
        '3': 'Now also silences the target for 3 sec and costs 12 Rage.',
      },
    } as unknown as Parameters<typeof rankText>[0];
    /* Nothing lines up between the two, and neither end carries a single unambiguous
       number to fall back on, so this stays an admitted gap rather than a guess. */
    expect(rankText(reworded, 2).basis).toBe('unknown');
  });

  it('fixes the real Maelstrom Weapon in the shipped data', () => {
    const tree = DATA.talents.Shaman!.trees.find((t) => t.name === 'Enhancement')!;
    const talent = tree.talents.find((t) => t.name === 'Maelstrom Weapon');
    if (!talent) return; // the talent may be renamed by a later import
    // Split rather than a regex: an escape that does not survive the file is exactly how
    // this repo has broken patterns before.
    const percents = [1, 2, 3, 4, 5].map((r) => {
      const after = rankText(talent, r).text.split(' by ').pop() ?? '';
      return after.split('%')[0];
    });
    expect(percents).toEqual(['4', '8', '12', '16', '20']);
  });
});

describe('what actually ships in the data file', () => {
  it('does not carry the level 38 spellbook any more', () => {
    /* It had one reader, the section under Talents, and that section is gone. 18 KB of a
       373 KB file that every visitor downloaded and nothing opened. This fails loudly if a
       re-import puts it back, because the importer is the only thing stopping it. */
    expect('spellbooks' in (DATA as object)).toBe(false);
  });

  it('still carries what the raid tooltips read', () => {
    // spell_desc is a different key and is what puts real game text in the drawer.
    expect(Object.keys(DATA.spell_desc ?? {}).length).toBeGreaterThan(100);
  });

  it('still carries everything the Talents page draws', () => {
    expect(Object.keys(DATA.talents).length).toBe(9);
    expect(DATA.racials).toBeTruthy();
    expect(DATA.class_abilities).toBeTruthy();
    expect(DATA.legacy?.trees?.length).toBeGreaterThan(0);
  });
});

describe('talent legality', () => {
  const arms = treeIndex(WARRIOR, 'Arms');
  const deflection = talentIndex(WARRIOR, 'Arms', 'Deflection');
  const charge = talentIndex(WARRIOR, 'Arms', 'Improved Charge');

  it('a row-two point does not hold its own row open', () => {
    const build = createBuild('warrior', WARRIOR, 60);
    for (let i = 0; i < 5; i += 1) addPoint(WARRIOR, build, arms, deflection);
    expect(addPoint(WARRIOR, build, arms, charge).ok).toBe(true);
    const blocked = removePoint(WARRIOR, build, arms, deflection);
    expect(blocked.ok).toBe(false);
    expect(blocked.reason).toMatch(/Improved Charge needs 5 points/);
    expect(build.ranks[arms]![deflection]).toBe(5);
    expect(buildLegal(WARRIOR, build).ok).toBe(true);
  });

  it('a link at level 10 cannot spend five points', () => {
    const { build, dropped } = decodeChecked(
      WARRIOR,
      'warrior/10/05000000000000000-000000000000000000-0000000000000000000',
    )!;
    expect(pointsLeft(build)).toBe(0);
    expect(dropped).toBe(4);
    expect(buildLegal(WARRIOR, build).ok).toBe(true);
  });

  it('a link that skips the first row loses the stranded talent', () => {
    // One point in Improved Charge and nothing above it.
    const { build, dropped } = decodeChecked(WARRIOR, 'warrior/60/00010000000000000-000000000000000000-0000000000000000000')!;
    expect(build.ranks[arms]![charge]).toBe(0);
    expect(dropped).toBe(1);
  });

  it('a link missing a prerequisite loses the talent that needs it', () => {
    // 11 in row 1 and 3 in Improved Tactical Mastery: row 3 is open, but Anger Management
    // needs Improved Tactical Mastery maxed.
    const { build, dropped } = decodeChecked(WARRIOR, 'warrior/60/3530301')!;
    expect(build.ranks[arms]![talentIndex(WARRIOR, 'Arms', 'Anger Management')]).toBe(0);
    expect(build.ranks[arms]![talentIndex(WARRIOR, 'Arms', 'Improved Tactical Mastery')]).toBe(3);
    expect(dropped).toBe(1);
    expect(buildLegal(WARRIOR, build).ok).toBe(true);
  });

  it('leaves a legal link exactly as it was', () => {
    const { build, dropped } = decodeChecked(WARRIOR, EXAMPLE)!;
    expect(dropped).toBe(0);
    expect(encode(build)).toBe(EXAMPLE);
  });

  it('lowering the level trims to a legal build', () => {
    const build = decode(WARRIOR, EXAMPLE)!;
    build.level = 20;
    const trimmed = legalize(WARRIOR, build).build;
    expect(pointsLeft(trimmed)).toBe(0);
    expect(buildLegal(WARRIOR, trimmed).ok).toBe(true);
  });
});

describe('one set of rules at every way in', () => {
  const arms = treeIndex(WARRIOR, 'Arms');

  it('refuses ranks that are not whole points', () => {
    const tree = WARRIOR.trees[arms]!;
    const ranks = tree.talents.map(() => 0);
    ranks[talentIndex(WARRIOR, 'Arms', 'Deflection')] = 1.5;
    expect(treeLegal(tree, ranks).ok).toBe(false);
    ranks[talentIndex(WARRIOR, 'Arms', 'Deflection')] = -1;
    expect(treeLegal(tree, ranks).ok).toBe(false);
    const build = { classKey: 'warrior', level: 60, ranks: WARRIOR.trees.map((t) => t.talents.map(() => 0)) };
    build.ranks[arms]![talentIndex(WARRIOR, 'Arms', 'Deflection')] = 2.7;
    const fixed = legalize(WARRIOR, build).build;
    expect(fixed.ranks[arms]![talentIndex(WARRIOR, 'Arms', 'Deflection')]).toBe(2);
    expect(buildLegal(WARRIOR, fixed).ok).toBe(true);
  });

  it('counts a digit past a talent\'s maximum among the points left out', () => {
    const first = WARRIOR.trees[arms]!.talents[0]!;
    const checked = decodeChecked(WARRIOR, 'warrior/60/9')!;
    expect(checked.build.ranks[arms]![0]).toBe(first.max);
    expect(checked.dropped).toBe(9 - first.max);
  });

  /** Every talent whose prerequisite has a prerequisite of its own, in every class. */
  function chains() {
    const out: Array<{ cls: ClassTalents; key: string; tree: number; path: number[] }> = [];
    for (const [key, cls] of Object.entries(DATA.talents)) {
      cls.trees.forEach((tree, t) => {
        const byName = new Map(tree.talents.map((x, i) => [x.name, i]));
        tree.talents.forEach((talent, c) => {
          const b = talent.req ? byName.get(talent.req) : undefined;
          const a = b !== undefined && tree.talents[b]!.req ? byName.get(tree.talents[b]!.req!) : undefined;
          if (a !== undefined && b !== undefined) out.push({ cls, key: key.toLowerCase(), tree: t, path: [a, b, c] });
        });
      });
    }
    return out;
  }

  /** The cheapest legal way to the end of a chain: fill rows top down, then the chain itself. */
  function buildTo(cls: ClassTalents, key: string, t: number, target: number) {
    const build = createBuild(key, cls, 60);
    const tree = cls.trees[t]!;
    for (let guard = 0; guard < 200 && (build.ranks[t]![target] ?? 0) < tree.talents[target]!.max; guard += 1) {
      const next = tree.talents
        .map((_, i) => i)
        .sort((x, y) => tree.talents[x]!.row - tree.talents[y]!.row)
        .find((i) => canAdd(cls, build, t, i).ok && (i === target || tree.talents[i]!.row <= tree.talents[target]!.row));
      if (next === undefined) break;
      addPoint(cls, build, t, next);
    }
    return build;
  }

  it('follows chained prerequisites, in a link and when the level drops', () => {
    const found = chains();
    expect(found.length).toBeGreaterThan(0);
    let reached = 0;
    for (const { cls, key, tree, path } of found) {
      const [a, b, c] = path as [number, number, number];
      const build = buildTo(cls, key, tree, c);
      if ((build.ranks[tree]![c] ?? 0) === 0) continue;
      reached += 1;
      expect(buildLegal(cls, build).ok, key + ' ' + cls.trees[tree]!.talents[c]!.name).toBe(true);

      // The first link of the chain missing from a link loses everything after it.
      const broken = { ...build, ranks: build.ranks.map((r) => [...r]) };
      broken.ranks[tree]![a] = 0;
      const fixed = legalize(cls, broken).build;
      expect(buildLegal(cls, fixed).ok).toBe(true);
      expect(fixed.ranks[tree]![b]).toBe(0);
      expect(fixed.ranks[tree]![c]).toBe(0);

      // A level too low for the whole chain keeps a legal part of it.
      const spent = build.ranks.flat().reduce((x, y) => x + y, 0);
      for (let level = 10; level < 9 + spent; level += 3) {
        const cut = legalize(cls, { ...build, level }).build;
        expect(buildLegal(cls, cut).ok, key + ' at ' + level).toBe(true);
        if (cut.ranks[tree]![c]) expect(cut.ranks[tree]![b]).toBe(cls.trees[tree]!.talents[b]!.max);
      }
    }
    expect(reached).toBeGreaterThan(0);
  });

  it('round-trips a spread-out legal build from every class unchanged', () => {
    for (const [key, cls] of Object.entries(DATA.talents)) {
      const classKey = key.toLowerCase();
      const build = createBuild(classKey, cls, 60);
      // Deterministic but uneven: walk the trees in turn, taking the n-th open talent.
      let n = 7;
      for (let guard = 0; pointsLeft(build) > 0 && guard < 500; guard += 1) {
        const t = guard % cls.trees.length;
        const open = cls.trees[t]!.talents.map((_, i) => i).filter((i) => canAdd(cls, build, t, i).ok);
        if (!open.length) continue;
        n = (n * 31 + 17) % 97;
        addPoint(cls, build, t, open[n % open.length]!);
      }
      expect(buildLegal(cls, build).ok, key).toBe(true);
      const code = encode(build);
      const checked = decodeChecked(cls, code)!;
      expect(checked.dropped, key).toBe(0);
      expect(checked.build.ranks, key).toEqual(build.ranks);
      expect(legalCode(cls, code), key).toEqual({ code, dropped: 0 });
    }
  });

  it('keeps a short valid link exactly as written, and rewrites an invalid one', () => {
    expect(legalCode(WARRIOR, 'warrior/60/05')).toEqual({ code: 'warrior/60/05', dropped: 0 });
    const fixed = legalCode(WARRIOR, 'warrior/10/05000000000000000-000000000000000000-0000000000000000000')!;
    expect(fixed.dropped).toBe(4);
    expect(fixed.code).toBe('warrior/10/01000000000000000-000000000000000000-0000000000000000000');
  });
});
