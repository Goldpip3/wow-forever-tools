import { describe, expect, it } from 'vitest';
import type { Character } from '../src/guild/api';
import { charactersOf, memberCount, searchCharacters, sortCharacters } from '../src/guild/list';
import type { Profession } from '../src/guild/professions';

function character(
  name: string,
  over: Partial<Character> & { professions?: Profession[] } = {},
): Character {
  return {
    id: over.id ?? name.length,
    userId: 'u1',
    displayName: 'Ava',
    name,
    ruleset: 'normal',
    classKey: 'warrior',
    specKey: null,
    roleKey: null,
    level: 60,
    isMain: false,
    professions: [],
    note: '',
    updatedBy: 'u1',
    updatedAt: 0,
    hasGear: false,
    ...over,
  };
}

describe('the order the list comes in', () => {
  it('puts mains before alts, then sorts by name', () => {
    const list = [
      character('Zeta'),
      character('Alpha'),
      character('Yankee', { isMain: true }),
      character('Bravo', { isMain: true }),
    ];
    expect(sortCharacters(list).map((c) => c.name)).toEqual(['Bravo', 'Yankee', 'Alpha', 'Zeta']);
  });

  it('does not reorder the array it was given', () => {
    const list = [character('Zeta'), character('Alpha')];
    sortCharacters(list);
    expect(list.map((c) => c.name)).toEqual(['Zeta', 'Alpha']);
  });

  it('sorts accented names where a reader expects them', () => {
    const list = [character('Zulu'), character('Zoe'), character('Zoé')];
    expect(sortCharacters(list).map((c) => c.name)).toEqual(['Zoe', 'Zoé', 'Zulu']);
  });
});

describe('searching', () => {
  const list = [
    character('Thrallsbane', { id: 1, isMain: true, displayName: 'Ava' }),
    character('Nimblefoot', { id: 2, classKey: 'rogue', displayName: 'Ava' }),
    character('Brightwell', {
      id: 3,
      classKey: 'priest',
      displayName: 'Rowan',
      userId: 'u2',
      professions: [{ key: 'tailoring', skill: 300 }],
    }),
    character('Thornwood', { id: 4, classKey: 'druid', displayName: 'Sol', userId: 'u3' }),
  ];

  it('gives everything back when nothing is typed', () => {
    expect(searchCharacters(list, '').length).toBe(4);
    expect(searchCharacters(list, '   ').length).toBe(4);
  });

  it('finds a character by the start of its name', () => {
    expect(searchCharacters(list, 'th').map((c) => c.name)).toEqual(['Thrallsbane', 'Thornwood']);
    expect(searchCharacters(list, 'thr').map((c) => c.name)).toEqual(['Thrallsbane']);
  });

  it('puts a name that starts with the query before one that merely contains it', () => {
    const found = searchCharacters(list, 'wood');
    expect(found[0].name).toBe('Thornwood');
  });

  it('finds a member by their Discord name', () => {
    expect(searchCharacters(list, 'rowan').map((c) => c.name)).toEqual(['Brightwell']);
  });

  it('finds everyone who has a profession', () => {
    expect(searchCharacters(list, 'tailoring').map((c) => c.name)).toEqual(['Brightwell']);
  });

  it('finds a class', () => {
    expect(searchCharacters(list, 'rogue').map((c) => c.name)).toEqual(['Nimblefoot']);
  });

  it('ignores case and accents', () => {
    const accented = [character('Zoë', { id: 9 })];
    expect(searchCharacters(accented, 'zoe').length).toBe(1);
    expect(searchCharacters(accented, 'ZOË').length).toBe(1);
  });

  it('answers with nothing when nothing matches', () => {
    expect(searchCharacters(list, 'qqq')).toEqual([]);
  });
});

describe('counting people rather than characters', () => {
  const list = [
    character('One', { id: 1, userId: 'u1' }),
    character('Two', { id: 2, userId: 'u1' }),
    character('Three', { id: 3, userId: 'u2' }),
  ];

  it('counts each member once', () => {
    expect(memberCount(list)).toBe(2);
  });

  it('gathers the characters one member plays, mains first', () => {
    const mine = [
      character('Alt', { id: 1, userId: 'u1' }),
      character('Main', { id: 2, userId: 'u1', isMain: true }),
      character('Theirs', { id: 3, userId: 'u2' }),
    ];
    expect(charactersOf(mine, 'u1').map((c) => c.name)).toEqual(['Main', 'Alt']);
  });
});
