/**
 * What the character form holds while somebody is filling it in.
 *
 * The form used to keep its values in the DOM and read them back on save. That
 * works until a save is refused: `save()` redraws, `renderEditor` rebuilds every
 * field from the character as it was stored, and everything typed since is gone —
 * along with whatever the bot was complaining about, which is the one thing the
 * person needed to see and fix. A network failure did the same.
 *
 * So the values live here instead, and the form draws them. A redraw is then a
 * redraw of what is in hand rather than a reset to what is saved.
 *
 * `level` is a string on purpose. It is what was typed, and "6" on the way to
 * "60" is not the number six, nor is it nothing.
 */

import type { Character, CharacterInput } from './api';
import { professionProblem, type Profession } from './professions';

export interface EditorDraft {
  /** The Discord account this is being filed for, or null for the person filling it in. */
  ownerId: string | null;
  name: string;
  ruleset: string | null;
  classKey: string;
  specKey: string | null;
  roleKey: string | null;
  /** As typed, not as parsed. */
  level: string;
  isMain: boolean;
  professions: Profession[];
  note: string;
}

/** The form as it opens: an existing character, or an empty one. */
export function draftFor(character: Character | null): EditorDraft {
  if (!character) {
    return {
      ownerId: null,
      name: '',
      ruleset: null,
      classKey: 'warrior',
      specKey: null,
      roleKey: null,
      level: '',
      isMain: false,
      professions: [],
      note: '',
    };
  }
  return {
    ownerId: null,
    name: character.name,
    ruleset: character.ruleset,
    classKey: character.classKey,
    specKey: character.specKey,
    roleKey: character.roleKey,
    level: character.level === null ? '' : String(character.level),
    isMain: character.isMain,
    professions: character.professions.map((p) => ({ ...p })),
    note: character.note,
  };
}

/** What the API is sent. The owner travels separately, because only a create takes one. */
export function inputFrom(draft: EditorDraft): CharacterInput {
  const level = draft.level.trim();
  return {
    name: draft.name.trim(),
    ruleset: draft.ruleset,
    classKey: draft.classKey,
    specKey: draft.specKey,
    roleKey: draft.roleKey,
    level: level === '' ? null : Number(level),
    isMain: draft.isMain,
    professions: draft.professions,
    note: draft.note.trim(),
  };
}

/**
 * What is wrong with it, said here so an obvious mistake does not cost a round
 * trip. The bot checks all of it again, and its answer is the one that decides.
 *
 * Names the field as well as the fault, so the form can put focus on it.
 */
export interface DraftProblem {
  field: 'name' | 'level' | 'professions';
  message: string;
}

export function draftProblem(draft: EditorDraft): DraftProblem | null {
  const name = draft.name.trim();
  if (!name) {
    return { field: 'name', message: 'A character needs a name.' };
  }
  // The bot's own pattern: two to twelve letters, and optionally a surname after
  // one space. Accents are letters; digits and punctuation are not.
  if (!/^\p{L}{2,12}( \p{L}{2,12})?$/u.test(name)) {
    return {
      field: 'name',
      message:
        'A character name is 2 to 12 letters, and may have a surname after a single space.',
    };
  }

  const level = draft.level.trim();
  if (level !== '') {
    const parsed = Number(level);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
      return { field: 'level', message: 'A level is a whole number from 1 to 100.' };
    }
  }

  const professions = professionProblem(draft.professions);
  if (professions) return { field: 'professions', message: professions };

  return null;
}

/** Whether anything has been changed since the form opened. */
export function draftChanged(draft: EditorDraft, original: EditorDraft): boolean {
  return JSON.stringify(draft) !== JSON.stringify(original);
}

/** Said before anything is thrown away, never after. */
export const DISCARD_ASK = 'Leave this form? What you have typed is not saved.';
