/**
 * The only file on the guild page that talks to the network.
 *
 * Everything is authorised by the session cookie. There is no link-and-token path here:
 * unlike a roster, a character list is not something a leader hands out, so a signed-in
 * account is the only way in.
 */

import type { ItemRef, Slot } from '../dps/export-format';
import { API_BASE } from '../shared/session';
import type { Profession } from './professions';

export interface Character {
  id: number;
  userId: string;
  displayName: string;
  name: string;
  realm: string;
  classKey: string;
  specKey: string | null;
  roleKey: string | null;
  level: number | null;
  isMain: boolean;
  professions: Profession[];
  note: string;
  updatedBy: string;
  updatedAt: number;
  hasGear: boolean;
}

export interface Gear {
  addonVersion: string;
  /** When the addon wrote the export, not when it was pasted. */
  generatedAt: number;
  race: string;
  level: number | null;
  stats: Record<string, number>;
  equipped: Partial<Record<Slot, ItemRef>>;
  talents: unknown[];
}

export interface Attendance {
  events: number;
  present: number;
  late: number;
  absent: number;
  last: number | null;
}

export interface CharacterList {
  guild: { id: string; name: string };
  you: { userId: string; isOfficer: boolean };
  characters: Character[];
}

export interface CharacterDetail {
  character: Character;
  gear: Gear | null;
  attendance: Attendance;
  permissions: { canEdit: boolean };
}

/** What the form sends. The owner never moves, so it is not in here. */
export interface CharacterInput {
  name: string;
  realm: string;
  classKey: string;
  specKey: string | null;
  roleKey: string | null;
  level: number | null;
  isMain: boolean;
  professions: Profession[];
  note: string;
}

/**
 * A failure with something the reader can do about it.
 *
 * The bot writes these messages and they are meant to be shown as they arrive: it is the
 * side that knows whose character a name belongs to.
 */
export class GuildApiError extends Error {
  readonly status: number;
  readonly details: string[];

  constructor(message: string, status: number, details: string[] = []) {
    super(message);
    this.name = 'GuildApiError';
    this.status = status;
    this.details = details;
  }
}

async function request<T>(path: string, init?: { method: string; body?: unknown }): Promise<T> {
  let res: Response;
  try {
    res = await fetch(API_BASE + path, {
      method: init?.method ?? 'GET',
      /* The cookie is on .wowforever.us and the API on api.wowforever.us, so without this
         the browser sends nothing and every call answers 401 to somebody who is signed in. */
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...(init?.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch (err) {
    throw new GuildApiError(
      'Could not reach the bot. It may be offline; try again in a minute.',
      0,
      [err instanceof Error ? err.message : String(err)],
    );
  }

  if (res.status === 204) return undefined as T;
  if (res.ok) return (await res.json()) as T;

  let payload: { error?: string; details?: string[] } = {};
  try {
    payload = (await res.json()) as typeof payload;
  } catch {
    /* an error with no body is still an error */
  }

  throw new GuildApiError(
    payload.error ??
      (res.status === 401
        ? 'Sign in again. Your session has run out.'
        : 'That did not work. Try again.'),
    res.status,
    payload.details ?? [],
  );
}

const base = (guildId: string) => '/api/v4/guilds/' + encodeURIComponent(guildId) + '/characters';

export function fetchCharacters(guildId: string): Promise<CharacterList> {
  return request<CharacterList>(base(guildId));
}

export function fetchCharacter(guildId: string, id: number): Promise<CharacterDetail> {
  return request<CharacterDetail>(base(guildId) + '/' + id);
}

/** `userId` is only accepted from an officer; the bot refuses it from anyone else. */
export function createCharacter(
  guildId: string,
  input: CharacterInput & { userId?: string },
): Promise<{ character: Character }> {
  return request(base(guildId), { method: 'POST', body: input });
}

export function saveCharacter(
  guildId: string,
  id: number,
  input: CharacterInput,
): Promise<{ character: Character }> {
  return request(base(guildId) + '/' + id, { method: 'PUT', body: input });
}

export function deleteCharacter(guildId: string, id: number): Promise<{ ok: boolean }> {
  return request(base(guildId) + '/' + id, { method: 'DELETE' });
}

export function saveGear(guildId: string, id: number, payload: unknown): Promise<{ gear: Gear }> {
  return request(base(guildId) + '/' + id + '/gear', { method: 'PUT', body: payload });
}

export function deleteGear(guildId: string, id: number): Promise<{ ok: boolean }> {
  return request(base(guildId) + '/' + id + '/gear', { method: 'DELETE' });
}
