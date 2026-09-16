import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { TalentData, Talent } from '../src/talents/types';
import { rankText } from '../src/talents/build';
import { AMBIGUOUS, SCALE_INDICES } from '../src/talents/scaling';

const DATA: TalentData = JSON.parse(
  readFileSync(resolve(__dirname, '../public/data/talents.generated.json'), 'utf8'),
);

/** The same stamping `loadTalentData` does in the browser. */
const ALL: Talent[] = [];
for (const [classKey, cls] of Object.entries(DATA.talents)) {
  for (const tree of cls.trees) {
    for (const talent of tree.talents) {
      talent.classKey = classKey;
      ALL.push(talent);
    }
  }
}

const NUMBER = /[0-9]+(?:\.[0-9]+)?/g;

function firstText(talent: Talent): string {
  if (Array.isArray(talent.desc)) return talent.desc[0] ?? '';
  const keys = Object.keys(talent.desc ?? {})
    .map(Number)
    .sort((a, b) => a - b);
  return (talent.desc as Record<string, string>)[String(keys[0])] ?? '';
}

function find(key: string): Talent | undefined {
  const [classKey, name] = key.split('|');
  return ALL.find((t) => t.classKey === classKey && t.name === name);
}

describe('curated scaling indices', () => {
  it('names a talent that exists, in the class it says', () => {
    const missing = Object.keys(SCALE_INDICES).filter((k) => !find(k));
    /* A rename upstream should fail here loudly rather than quietly stop applying, which
       would put the talent back to showing rank 1 at every rank with nobody noticing. */
    expect(missing, 'no longer in the data: ' + missing.join(', ')).toEqual([]);
  });

  it('points at numbers the sentence actually has', () => {
    for (const [key, idx] of Object.entries(SCALE_INDICES)) {
      const talent = find(key)!;
      const count = (firstText(talent).match(NUMBER) ?? []).length;
      for (const i of idx) {
        expect(i, key + ' index ' + i + ' of ' + count).toBeLessThan(count);
        expect(i, key).toBeGreaterThanOrEqual(0);
      }
      expect(new Set(idx).size, key + ' repeats an index').toBe(idx.length);
      expect(idx.length, key + ' is empty').toBeGreaterThan(0);
    }
  });

  it('only covers talents that needed it', () => {
    for (const key of Object.keys(SCALE_INDICES)) {
      const talent = find(key)!;
      // Upstream scaleIdx wins, so an entry here for one of those would never be read.
      expect(talent.scaleIdx ?? [], key + ' already has upstream scaleIdx').toEqual([]);
      const count = (firstText(talent).match(NUMBER) ?? []).length;
      // One number needs no help; build.ts handles that without this file.
      expect(count, key + ' has only one number').toBeGreaterThan(1);
    }
  });

  it('does not both curate and refuse the same talent', () => {
    const both = Object.keys(AMBIGUOUS).filter((k) => k in SCALE_INDICES);
    expect(both).toEqual([]);
  });

  it('gives every refusal a reason', () => {
    for (const [key, why] of Object.entries(AMBIGUOUS)) {
      expect(find(key), key + ' is not in the data').toBeTruthy();
      expect(why.length, key + ' has no reason').toBeGreaterThan(30);
    }
  });
});

describe('what the reader ends up seeing', () => {
  it('leaves only the talents we chose to leave showing one rank at every rank', () => {
    const stuck: string[] = [];
    for (const talent of ALL) {
      if (talent.max < 2) continue;
      const texts = new Set<string>();
      for (let r = 1; r <= talent.max; r += 1) texts.add(rankText(talent, r).text);
      if (texts.size === 1) stuck.push(talent.classKey + '|' + talent.name);
    }
    expect(stuck.sort()).toEqual(Object.keys(AMBIGUOUS).sort());
  });

  it('works out Restorative Totems, which is what started this', () => {
    const talent = find('Shaman|Restorative Totems')!;
    const mana = [1, 2, 3, 4, 5].map((r) => {
      const text = rankText(talent, r).text;
      return text.split('Mana Spring Totem by ')[1]?.split('%')[0];
    });
    expect(mana).toEqual(['5', '10', '15', '20', '25']);
  });

  it('still calls every worked-out rank an estimate', () => {
    for (const key of Object.keys(SCALE_INDICES)) {
      const talent = find(key)!;
      const read = Array.isArray(talent.desc)
        ? []
        : Object.keys(talent.desc ?? {}).map(Number);
      for (let r = 1; r <= talent.max; r += 1) {
        if (read.includes(r)) continue;
        const got = rankText(talent, r);
        expect(got.estimated, key + ' rank ' + r).toBe(true);
        expect(got.basis, key + ' rank ' + r).toBe('scaled');
      }
    }
  });

  it('leaves the numbers a talent point does not move alone', () => {
    // Bloodthrill scales its proc chance; the attack count and the duration are fixed.
    const talent = find('Warrior|Bloodthrill')!;
    for (let r = 1; r <= talent.max; r += 1) {
      const text = rankText(talent, r).text;
      expect(text, 'rank ' + r).toContain('for 1 attack');
      expect(text, 'rank ' + r).toContain('Lasts 6 sec');
    }
    expect(rankText(talent, 5).text).toContain('10% chance');
  });
});

describe('words agreeing with the numbers around them', () => {
  it('pluralises a counted noun when a rank scales past one', () => {
    const talent = find('Druid|Feral Instinct')!;
    expect(rankText(talent, 1).text).toContain('1 level higher');
    expect(rankText(talent, 2).text).toContain('2 levels higher');
    expect(rankText(talent, 3).text).toContain('3 levels higher');
  });

  it('uses an before eighty', () => {
    const talent = find('Druid|Natural Reaction')!;
    expect(rankText(talent, 2).text).toContain('a 40% chance');
    expect(rankText(talent, 4).text).toContain('an 80% chance');
    expect(rankText(talent, 5).text).toContain('a 100% chance');
  });

  it('leaves uncountable things alone', () => {
    const talent = find('Druid|Natural Reaction')!;
    // Rage is not counted in the plural, and the game writes sec at every value.
    for (let r = 1; r <= talent.max; r += 1) {
      expect(rankText(talent, r).text, 'rank ' + r).toContain('5 Rage');
    }
  });

  it('no talent in any class disagrees with its own numbers', () => {
    const counted =
      /\b([2-9]|[1-9][0-9]+)\s+(level|yard|attack|charge|time|point|enemy|target|stack|swing|orb|spell|second|minute|ability)\b/;
    const article = /\ba\s+(8|11|18|8[0-9])\b|\ban\s+([2-79]|[2-79][0-9]*)\b/;
    const bad: string[] = [];
    for (const talent of ALL) {
      for (let r = 1; r <= talent.max; r += 1) {
        const text = rankText(talent, r).text;
        const where = talent.classKey + '|' + talent.name + ' r' + r;
        const a = text.match(counted);
        if (a) bad.push(where + ': "' + a[0] + '"');
        const b = text.match(article);
        if (b) bad.push(where + ': "' + b[0] + '"');
      }
    }
    expect(bad).toEqual([]);
  });
});
