import { describe, expect, it } from 'vitest';
import type { Character } from '../src/guild/api';
import {
  draftChanged,
  draftFor,
  draftProblem,
  inputFrom,
  type EditorDraft,
} from '../src/guild/draft';

/**
 * The form used to keep its values in its own fields and read them back on save.
 * A refused save redrew the form from the stored character, so the redraw that
 * showed the refusal also threw away everything typed since — including whatever
 * the bot was objecting to. These cover the values living somewhere a redraw
 * cannot reach.
 */

const character: Character = {
  id: 7,
  userId: '100000000000000001',
  displayName: 'Ava',
  name: 'Thrallsbane',
  ruleset: 'pvp',
  classKey: 'warrior',
  specKey: 'prot_war',
  roleKey: 'tank',
  level: 60,
  isMain: true,
  professions: [{ key: 'mining', skill: 300 }],
  note: 'Tanking Molten Core.',
  updatedBy: '100000000000000001',
  updatedAt: 1_790_000_000,
  hasGear: true,
};

describe('opening the form', () => {
  it('starts empty for a new character, on a class the picker shows', () => {
    const draft = draftFor(null);
    expect(draft.name).toBe('');
    expect(draft.level).toBe('');
    expect(draft.ruleset).toBeNull();
    expect(draft.classKey).toBe('warrior');
    expect(draft.professions).toEqual([]);
  });

  it('starts from the character being edited', () => {
    const draft = draftFor(character);
    expect(draft.name).toBe('Thrallsbane');
    expect(draft.ruleset).toBe('pvp');
    expect(draft.level).toBe('60');
    expect(draft.isMain).toBe(true);
    expect(draft.note).toBe('Tanking Molten Core.');
  });

  it('copies the professions rather than holding the character ones', () => {
    const draft = draftFor(character);
    draft.professions[0]!.skill = 1;
    expect(character.professions[0]!.skill).toBe(300);
  });
});

describe('what gets sent', () => {
  it('trims the name and the note, which people paste with spaces on', () => {
    const draft = { ...draftFor(character), name: '  Thrallsbane  ', note: ' hello ' };
    const input = inputFrom(draft);
    expect(input.name).toBe('Thrallsbane');
    expect(input.note).toBe('hello');
  });

  it('turns the typed level into a number, and an empty one into nothing', () => {
    expect(inputFrom({ ...draftFor(character), level: '60' }).level).toBe(60);
    expect(inputFrom({ ...draftFor(character), level: '   ' }).level).toBeNull();
  });

  it('keeps a half-typed level as it was typed, not as a number', () => {
    // "6" on the way to "60" is not the number six, and it is not nothing
    // either. The draft holds what is in the field.
    const draft = { ...draftFor(null), level: '6' };
    expect(draft.level).toBe('6');
    expect(inputFrom(draft).level).toBe(6);
  });
});

describe('what the form answers before the bot does', () => {
  const draft = (over: Partial<EditorDraft> = {}): EditorDraft => ({
    ...draftFor(null),
    name: 'Ana',
    ...over,
  });

  it('is happy with a name of two to twelve letters', () => {
    expect(draftProblem(draft())).toBeNull();
    expect(draftProblem(draft({ name: 'Ana Forever' }))).toBeNull();
    expect(draftProblem(draft({ name: 'Zoë' }))).toBeNull();
  });

  it('asks for a name at all, and says which field', () => {
    const problem = draftProblem(draft({ name: '   ' }));
    expect(problem?.field).toBe('name');
    expect(problem?.message).toContain('name');
  });

  it('refuses a name the bot would refuse, rather than spending a round trip', () => {
    expect(draftProblem(draft({ name: 'A' }))?.field).toBe('name');
    expect(draftProblem(draft({ name: 'Ana F0rever' }))?.field).toBe('name');
    expect(draftProblem(draft({ name: 'Ana  Forever' }))?.field).toBe('name');
    expect(draftProblem(draft({ name: 'Ana Forever Ironhand' }))?.field).toBe('name');
  });

  it('refuses a level that is not a level', () => {
    expect(draftProblem(draft({ level: '0' }))?.field).toBe('level');
    expect(draftProblem(draft({ level: '101' }))?.field).toBe('level');
    expect(draftProblem(draft({ level: '6.5' }))?.field).toBe('level');
    expect(draftProblem(draft({ level: 'sixty' }))?.field).toBe('level');
    expect(draftProblem(draft({ level: '' }))).toBeNull();
  });

  it('passes the profession rules on, naming the professions', () => {
    const problem = draftProblem(
      draft({
        professions: [
          { key: 'mining', skill: 300 },
          { key: 'herbalism', skill: 300 },
          { key: 'skinning', skill: 300 },
        ],
      }),
    );
    expect(problem?.field).toBe('professions');
  });
});

describe('whether anything has been typed', () => {
  it('says no when the form is as it opened', () => {
    const base = draftFor(character);
    expect(draftChanged({ ...base }, base)).toBe(false);
  });

  it('notices a changed field, including one that was only emptied', () => {
    const base = draftFor(character);
    expect(draftChanged({ ...base, note: '' }, base)).toBe(true);
    expect(draftChanged({ ...base, level: '59' }, base)).toBe(true);
    expect(draftChanged({ ...base, professions: [] }, base)).toBe(true);
  });

  it('notices an owner picked for somebody else', () => {
    const base = draftFor(null);
    expect(draftChanged({ ...base, ownerId: '100000000000000002' }, base)).toBe(true);
  });
});
