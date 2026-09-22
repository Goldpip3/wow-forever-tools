/**
 * Ordering and filtering the character list.
 *
 * Pure, because these are the two things a reader notices immediately when they are
 * wrong: a search that misses the character they typed, and a list whose order changes
 * between visits.
 */

import type { Character } from './api';
import { professionName } from './professions';

/** Fold case and strip accents, so searching "zoe" finds Zoë. */
function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/**
 * Mains first, then character name.
 *
 * Not grouped by member: the question this page answers is "who is Thrallsbane", and a
 * list sorted by the Discord name is the wrong index for it.
 */
export function sortCharacters(list: readonly Character[]): Character[] {
  return [...list].sort((a, b) => {
    if (a.isMain !== b.isMain) return a.isMain ? -1 : 1;
    return fold(a.name).localeCompare(fold(b.name));
  });
}

/**
 * Everything matching what was typed.
 *
 * Matches the character name, the member's Discord name, the realm, the class and the
 * professions, because all five are things somebody types into a search box when they
 * are looking for a person. A character name that starts with the query comes first:
 * typing "th" should reach Thrallsbane before it reaches somebody whose note mentions it.
 */
export function searchCharacters(list: readonly Character[], query: string): Character[] {
  const wanted = fold(query.trim());
  if (!wanted) return sortCharacters(list);

  const scored: Array<{ character: Character; rank: number }> = [];
  for (const character of list) {
    const name = fold(character.name);
    const haystack = [
      character.name,
      character.displayName,
      character.realm,
      character.classKey,
      character.specKey ?? '',
      ...character.professions.map((p) => professionName(p.key)),
    ]
      .map(fold)
      .join(' ');

    if (name.startsWith(wanted)) scored.push({ character, rank: 0 });
    else if (name.includes(wanted)) scored.push({ character, rank: 1 });
    else if (haystack.includes(wanted)) scored.push({ character, rank: 2 });
  }

  return scored
    .sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      if (a.character.isMain !== b.character.isMain) return a.character.isMain ? -1 : 1;
      return fold(a.character.name).localeCompare(fold(b.character.name));
    })
    .map((s) => s.character);
}

/** How many people, as opposed to how many characters, the list covers. */
export function memberCount(list: readonly Character[]): number {
  return new Set(list.map((c) => c.userId)).size;
}

/** The characters one member plays, mains first. */
export function charactersOf(list: readonly Character[], userId: string): Character[] {
  return sortCharacters(list.filter((c) => c.userId === userId));
}
