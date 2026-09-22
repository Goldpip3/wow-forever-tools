import { describe, expect, it } from 'vitest';
import type { Character } from '../src/guild/api';
import { coverageOf, headline, joinWords, roleOf } from '../src/guild/coverage';
import type { Profession } from '../src/guild/professions';

function character(over: Partial<Character> & Pick<Character, 'id'>): Character {
  return {
    userId: 'u' + over.id,
    displayName: 'Someone',
    name: 'Name' + over.id,
    realm: '',
    classKey: 'warrior',
    specKey: null,
    roleKey: null,
    level: 60,
    isMain: false,
    professions: [],
    note: '',
    updatedBy: '',
    updatedAt: 0,
    hasGear: false,
    ...over,
  };
}

const prof = (key: string, skill: number | null = 300) => ({ key, skill }) as Profession;

describe('what job a character does', () => {
  it('takes the role that was chosen over the one the spec implies', () => {
    expect(roleOf(character({ id: 1, classKey: 'priest', specKey: 'shadow', roleKey: 'healer' }))).toBe('healer');
  });

  it('falls back to the spec', () => {
    expect(roleOf(character({ id: 2, classKey: 'warrior', specKey: 'prot_war' }))).toBe('tank');
    expect(roleOf(character({ id: 3, classKey: 'priest', specKey: 'holy_priest' }))).toBe('healer');
    expect(roleOf(character({ id: 4, classKey: 'mage', specKey: 'frost' }))).toBe('ranged');
  });

  it('tells the bear from the cat, which share one tree', () => {
    expect(roleOf(character({ id: 5, classKey: 'druid', specKey: 'guardian' }))).toBe('tank');
    expect(roleOf(character({ id: 6, classKey: 'druid', specKey: 'feral' }))).toBe('melee');
  });

  it('answers nothing when no spec was chosen', () => {
    expect(roleOf(character({ id: 7, classKey: 'paladin', specKey: null }))).toBeNull();
  });
});

describe('counting the gaps', () => {
  const guild = [
    character({ id: 1, userId: 'ava', classKey: 'warrior', specKey: 'prot_war', hasGear: true, professions: [prof('mining'), prof('blacksmithing', 285)] }),
    character({ id: 2, userId: 'ava', classKey: 'rogue', specKey: 'combat' }),
    character({ id: 3, userId: 'rowan', classKey: 'priest', specKey: 'holy_priest', professions: [prof('tailoring')] }),
    character({ id: 4, userId: 'kit', classKey: 'mage', specKey: 'frost', professions: [prof('mining', 150)] }),
  ];
  const c = coverageOf(guild);

  it('counts characters and the people behind them', () => {
    expect(c.characters).toBe(4);
    expect(c.members).toBe(3);
  });

  it('counts a profession by people, not by characters', () => {
    // Two of Ava's characters could both mine; that is still one miner.
    const mining = c.professions.find((p) => p.key === 'mining')!;
    expect(mining.characters).toBe(2);
    expect(mining.members).toBe(2);
    expect(mining.best).toBe(300);
  });

  it('names the professions nobody has at all', () => {
    const missing = c.missingProfessions.map((p) => p.key);
    expect(missing).toContain('enchanting');
    expect(missing).toContain('alchemy');
    expect(missing).not.toContain('mining');
  });

  it('lists every profession whether covered or not', () => {
    expect(c.professions).toHaveLength(12);
  });

  it('counts the roles', () => {
    expect(c.roles.find((r) => r.role === 'tank')!.characters).toBe(1);
    expect(c.roles.find((r) => r.role === 'healer')!.characters).toBe(1);
    expect(c.roles.find((r) => r.role === 'ranged')!.characters).toBe(1);
  });

  it('names the classes nobody plays', () => {
    expect(c.missingClasses).toContain('shaman');
    expect(c.missingClasses).not.toContain('warrior');
  });

  it('counts gear by character and by person', () => {
    expect(c.withoutGear).toBe(3);
    // Ava has gear on one of hers, so Ava is not a member without gear.
    expect(c.membersWithoutGear).toBe(2);
  });

  it('says nothing is missing for an empty guild rather than dividing by zero', () => {
    const empty = coverageOf([]);
    expect(empty.characters).toBe(0);
    expect(empty.members).toBe(0);
    expect(empty.missingProfessions).toHaveLength(12);
  });
});

describe('the one line at the top', () => {
  const full = coverageOf([
    character({ id: 1, classKey: 'warrior', specKey: 'prot_war', hasGear: true, professions: [prof('mining')] }),
  ]);

  it('leads with the people who have entered nothing', () => {
    expect(headline(full, 3)).toBe('3 raiders have not entered a character.');
    expect(headline(full, 1)).toBe('One raider has not entered a character.');
  });

  it('falls to the uncovered professions, naming them while there are few', () => {
    // Nine of twelve covered, so three are missing and all three fit in the line.
    const nearly = coverageOf([
      character({ id: 1, hasGear: true, professions: [
        prof('alchemy'), prof('blacksmithing'), prof('enchanting'), prof('engineering'),
        prof('herbalism'), prof('leatherworking'), prof('mining'), prof('skinning'),
        prof('tailoring'),
      ] }),
    ]);
    const line = headline(nearly, 0);
    expect(line).toContain('Nobody has');
    expect(line).toContain('Cooking');
    expect(line).toContain('and Fishing.');
  });

  it('counts them instead once there are too many to read', () => {
    expect(headline(coverageOf([]), 0)).toMatch(/^\d+ professions are not covered\.$/);
  });

  it('answers nothing when there is nothing to report', () => {
    const covered = coverageOf([
      character({
        id: 1,
        classKey: 'warrior',
        specKey: 'prot_war',
        hasGear: true,
        professions: [
          prof('alchemy'), prof('blacksmithing'), prof('enchanting'), prof('engineering'),
          prof('herbalism'), prof('leatherworking'), prof('mining'), prof('skinning'),
          prof('tailoring'), prof('cooking'), prof('first-aid'), prof('fishing'),
        ],
      }),
    ]);
    expect(headline(covered, 0)).toBeNull();
  });
});

describe('listing things the way somebody says them', () => {
  it('joins with an and', () => {
    expect(joinWords(['Alchemy'])).toBe('Alchemy');
    expect(joinWords(['Alchemy', 'Mining'])).toBe('Alchemy and Mining');
    expect(joinWords(['Alchemy', 'Mining', 'Tailoring'])).toBe('Alchemy, Mining and Tailoring');
  });

  it('answers empty for nothing', () => {
    expect(joinWords([])).toBe('');
  });
});
