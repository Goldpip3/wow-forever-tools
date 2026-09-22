import { describe, expect, it } from 'vitest';
import {
  MAX_PRIMARY_PROFESSIONS,
  PRIMARY_PROFESSIONS,
  PROFESSIONS,
  PROFESSION_KEYS,
  SECONDARY_PROFESSIONS,
  isPrimary,
  professionIcon,
  professionName,
  professionProblem,
  sortProfessions,
  type Profession,
} from '../src/guild/professions';

describe('the list itself', () => {
  it('names and pictures every key', () => {
    for (const key of PROFESSION_KEYS) {
      expect(PROFESSIONS[key].name.length).toBeGreaterThan(0);
      expect(PROFESSIONS[key].icon).toMatch(/^[a-z0-9_]+$/);
    }
  });

  it('has no key in both groups', () => {
    for (const key of PRIMARY_PROFESSIONS) {
      expect(SECONDARY_PROFESSIONS as readonly string[]).not.toContain(key);
    }
  });

  it('holds the nine primaries and three secondaries the game has', () => {
    expect(PRIMARY_PROFESSIONS).toHaveLength(9);
    expect(SECONDARY_PROFESSIONS).toHaveLength(3);
  });

  it('tells a primary from a secondary', () => {
    expect(isPrimary('mining')).toBe(true);
    expect(isPrimary('cooking')).toBe(false);
    expect(isPrimary('nonsense')).toBe(false);
  });

  it('gives back an unknown key rather than throwing', () => {
    expect(professionName('nonsense')).toBe('nonsense');
    expect(professionIcon('nonsense')).toBe('');
  });

  it('spells First Aid the way the game does', () => {
    expect(professionName('first-aid')).toBe('First Aid');
  });
});

describe('what the form will not send', () => {
  const p = (key: string, skill: number | null = 300): Profession =>
    ({ key, skill }) as Profession;

  it('accepts two primaries and every secondary', () => {
    expect(
      professionProblem([
        p('mining'),
        p('blacksmithing'),
        p('cooking'),
        p('first-aid'),
        p('fishing'),
      ]),
    ).toBeUndefined();
  });

  it('refuses a third primary and says how many are allowed', () => {
    const problem = professionProblem([p('mining'), p('blacksmithing'), p('alchemy')]);
    expect(problem).toContain(String(MAX_PRIMARY_PROFESSIONS));
  });

  it('refuses the same profession twice, naming it', () => {
    expect(professionProblem([p('mining'), p('mining', 100)])).toContain('Mining');
  });

  it('refuses a skill the game does not go up to', () => {
    expect(professionProblem([p('mining', 450)])).toContain('300');
    expect(professionProblem([p('mining', 0)])).toBeDefined();
  });

  it('allows a profession with no number', () => {
    expect(professionProblem([p('herbalism', null)])).toBeUndefined();
  });

  it('allows an empty list', () => {
    expect(professionProblem([])).toBeUndefined();
  });
});

describe('the order they are shown in', () => {
  it('puts primaries first, each group alphabetical', () => {
    const list: Profession[] = [
      { key: 'fishing', skill: 100 },
      { key: 'tailoring', skill: 300 },
      { key: 'cooking', skill: 225 },
      { key: 'alchemy', skill: 300 },
    ];
    expect(sortProfessions(list).map((x) => x.key)).toEqual([
      'alchemy',
      'tailoring',
      'cooking',
      'fishing',
    ]);
  });

  it('leaves the list it was given alone', () => {
    const list: Profession[] = [
      { key: 'fishing', skill: 100 },
      { key: 'alchemy', skill: 300 },
    ];
    sortProfessions(list);
    expect(list[0].key).toBe('fishing');
  });
});
