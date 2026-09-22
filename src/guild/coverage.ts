/**
 * What the guild is missing.
 *
 * The list answers "who is Thrallsbane". This answers the other question a guild
 * leader has, which is "what have we not got" — no enchanter, four people who never
 * pasted their gear, nobody holding a tank spec.
 *
 * All of it is counted from the character list the page already fetched, except who
 * has filed nothing at all, which needs the server's raider roster and so comes from
 * the bot. Pure, because a miscount here is an accusation.
 */

import { CLASSES, type ClassId, type Role } from '../shared/classes';
import type { Character } from './api';
import { classIdOf, specNameOf } from './render';
import {
  PRIMARY_PROFESSIONS,
  SECONDARY_PROFESSIONS,
  professionName,
  type ProfessionKey,
} from './professions';

export interface ProfessionCoverage {
  key: ProfessionKey;
  name: string;
  /** How many characters have it at all. */
  characters: number;
  /** How many people, which is the number that matters for "can anyone make this". */
  members: number;
  /** The best skill anybody has, or null when nobody gave a number. */
  best: number | null;
}

export interface RoleCoverage {
  role: Role;
  characters: number;
  members: number;
}

export interface Coverage {
  characters: number;
  members: number;
  /** Characters with no addon export behind them. */
  withoutGear: number;
  /** People whose characters all lack gear. */
  membersWithoutGear: number;
  /** Every profession, covered or not, in the game's order. */
  professions: ProfessionCoverage[];
  /** The ones nobody in the server has at all. */
  missingProfessions: ProfessionCoverage[];
  roles: RoleCoverage[];
  /** Classes nobody plays, which is how a raid finds out it has no Shaman. */
  missingClasses: ClassId[];
}

/** The role a character fills: what was chosen, or what the spec implies. */
export function roleOf(character: Character): Role | null {
  const declared = character.roleKey;
  if (declared === 'tank' || declared === 'healer' || declared === 'melee' || declared === 'ranged') {
    return declared;
  }
  const classId = classIdOf(character.classKey);
  if (!classId || !character.specKey) return null;
  // specNameOf already goes through the bot's key mapping, so this stays in step
  // with what the profile shows rather than guessing a second time.
  const name = specNameOf(character.classKey, character.specKey);
  if (!name) return null;
  const bare = name.replace(/ \((cat|bear)\)$/, '');
  const spec = CLASSES[classId].specs.find((s) => s.name === bare);
  if (!spec) return null;
  // Feral Combat is one tree and two jobs; the bot's key is the only thing that
  // says which, and the profile has already resolved it into the name.
  if (name.endsWith('(bear)')) return 'tank';
  if (name.endsWith('(cat)')) return 'melee';
  return spec.role;
}

const ALL_PROFESSIONS = [...PRIMARY_PROFESSIONS, ...SECONDARY_PROFESSIONS] as const;
const ROLES: Role[] = ['tank', 'healer', 'melee', 'ranged'];

export function coverageOf(characters: readonly Character[]): Coverage {
  const members = new Set(characters.map((c) => c.userId));

  const professions: ProfessionCoverage[] = ALL_PROFESSIONS.map((key) => {
    const having = characters.filter((c) => c.professions.some((p) => p.key === key));
    const skills = having
      .map((c) => c.professions.find((p) => p.key === key)?.skill)
      .filter((s): s is number => typeof s === 'number');
    return {
      key,
      name: professionName(key),
      characters: having.length,
      members: new Set(having.map((c) => c.userId)).size,
      best: skills.length ? Math.max(...skills) : null,
    };
  });

  const roles: RoleCoverage[] = ROLES.map((role) => {
    const playing = characters.filter((c) => roleOf(c) === role);
    return { role, characters: playing.length, members: new Set(playing.map((c) => c.userId)).size };
  });

  const played = new Set(characters.map((c) => classIdOf(c.classKey)).filter(Boolean) as ClassId[]);
  const missingClasses = (Object.keys(CLASSES) as ClassId[]).filter((id) => !played.has(id));

  const withGear = new Set(characters.filter((c) => c.hasGear).map((c) => c.userId));

  return {
    characters: characters.length,
    members: members.size,
    withoutGear: characters.filter((c) => !c.hasGear).length,
    membersWithoutGear: [...members].filter((id) => !withGear.has(id)).length,
    professions,
    missingProfessions: professions.filter((p) => p.characters === 0),
    roles,
    missingClasses,
  };
}

/**
 * The one-line summary, or null when there is nothing to complain about.
 *
 * Deliberately says the worst thing rather than everything: a leader opening the
 * page wants the headline, and the panel underneath has the rest.
 */
export function headline(coverage: Coverage, missingMembers: number): string | null {
  if (missingMembers > 0) {
    return missingMembers === 1
      ? 'One raider has not entered a character.'
      : missingMembers + ' raiders have not entered a character.';
  }
  if (coverage.missingProfessions.length) {
    const names = coverage.missingProfessions.map((p) => p.name);
    if (names.length <= 3) return 'Nobody has ' + joinWords(names) + '.';
    return names.length + ' professions are not covered.';
  }
  if (coverage.withoutGear > 0) {
    return coverage.withoutGear === 1
      ? 'One character has no gear pasted.'
      : coverage.withoutGear + ' characters have no gear pasted.';
  }
  return null;
}

/** "Alchemy, Mining and Tailoring", the way somebody would say it out loud. */
export function joinWords(words: readonly string[]): string {
  if (words.length <= 1) return words[0] ?? '';
  return words.slice(0, -1).join(', ') + ' and ' + words[words.length - 1];
}
