/**
 * The only file on the guild page that talks to the network.
 *
 * Everything is authorised by the session cookie. There is no link-and-token path here:
 * unlike a roster, a character list is not something a leader hands out, so a signed-in
 * account is the only way in.
 */

import type { Slot } from '../dps/export-format';
import { API_BASE } from '../shared/session';
import type { SheetStatKey, TalentTab, WornItem } from './gear-upload';
import type { Profession } from './professions';

export interface Character {
  id: number;
  userId: string;
  displayName: string;
  name: string;
  /** One of Forever's four rulesets, or null when nobody has said. */
  ruleset: string | null;
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

/**
 * The gear as it comes back, which is what was stored and no more.
 *
 * The narrow item and talent shapes are the ones gear-upload.ts builds. A row
 * written by an older build can hold wider items than these; the extra fields
 * are simply not read, which is the same as the sheet never having drawn them.
 */
export interface Gear {
  addonVersion: string;
  /** When the addon wrote the export, not when it was pasted. */
  generatedAt: number;
  race: string;
  level: number | null;
  stats: Partial<Record<SheetStatKey, number>>;
  equipped: Partial<Record<Slot, WornItem>>;
  talents: TalentTab[];
}

export interface Attendance {
  events: number;
  present: number;
  late: number;
  absent: number;
  last: number | null;
}

/** A raider the server expects to have a character. */
export interface Raider {
  userId: string;
  displayName: string;
}

/** Somebody in the Discord server, found by name. */
export interface FoundMember {
  userId: string;
  displayName: string;
}

export interface CharacterList {
  guild: { id: string; name: string };
  you: {
    userId: string;
    /** May edit anybody's character: the manager role. */
    isOfficer: boolean;
    /** Runs the guild, and is the only one sent what is missing. */
    isLeader: boolean;
  };
  characters: Character[];
  /**
   * Who has filed nothing, sent to a leader only and absent for everybody else.
   *
   * `configured` is false when the server has never named a raider role, which is
   * not the same as nobody raiding. The page has to tell those apart, or it
   * accuses a server of neglecting a list it never made.
   */
  missing?: { configured: boolean; raiders: number; without: Raider[] };
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
  ruleset: string | null;
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
  /** The page dropped this request itself. Nothing to show anybody. */
  readonly aborted: boolean;

  constructor(message: string, status: number, details: string[] = [], aborted = false) {
    super(message);
    this.name = 'GuildApiError';
    this.status = status;
    this.details = details;
    this.aborted = aborted;
  }
}

/**
 * How long a read may take before the page stops waiting.
 *
 * Without this a request to a bot that is up but wedged never settles, and the
 * page says "One moment" for as long as the tab is open.
 */
export const REQUEST_TIMEOUT_MS = 15_000;

/** The page abandoned this request: navigation, or the timeout above. */
function abortError(reason: string): GuildApiError {
  return new GuildApiError(reason, 0, [], true);
}

/**
 * The caller signal and a timeout, as one.
 *
 * `AbortSignal.any` is recent enough that a browser without it should still get
 * the timeout rather than an exception, so it falls back to whichever it has.
 */
function withTimeout(signal: AbortSignal | undefined): AbortSignal | undefined {
  const timeout = typeof AbortSignal.timeout === 'function'
    ? AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    : undefined;
  if (!signal) return timeout;
  if (!timeout) return signal;
  return typeof AbortSignal.any === 'function' ? AbortSignal.any([signal, timeout]) : signal;
}

interface Call {
  method?: string;
  body?: unknown;
  /** Dropped when the page moves on. A read carries one; a write does not. */
  signal?: AbortSignal;
}

async function request<T>(path: string, init?: Call): Promise<T> {
  let res: Response;
  try {
    res = await fetch(API_BASE + path, {
      method: init?.method ?? 'GET',
      signal: withTimeout(init?.signal),
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
    /* An abort is not a failure to report: either the page moved on, in which
       case nobody is waiting for this, or it timed out, which has its own
       sentence. */
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw abortError('The page stopped waiting for the bot.');
    }
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      throw new GuildApiError(
        'The bot took too long to answer. It may be busy; try again.',
        0,
      );
    }
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

/**
 * Enough of a shape check to know the page can read what came back.
 *
 * Not a schema: the fields the page walks, so an answer from something that is
 * not this API reads as an error rather than as a list of undefineds that throws
 * three frames later.
 */
function isCharacterList(value: unknown): value is CharacterList {
  if (!value || typeof value !== 'object') return false;
  const list = value as Partial<CharacterList>;
  if (!list.guild || typeof list.guild.id !== 'string') return false;
  if (!list.you || typeof list.you.userId !== 'string') return false;
  return Array.isArray(list.characters);
}

function isCharacterDetail(value: unknown): value is CharacterDetail {
  if (!value || typeof value !== 'object') return false;
  const detail = value as Partial<CharacterDetail>;
  if (!detail.character || typeof detail.character.id !== 'number') return false;
  return !!detail.permissions && !!detail.attendance;
}

const UNREADABLE =
  'The bot answered with something this page could not read. It may be a newer build than this page.';

export async function fetchCharacters(
  guildId: string,
  signal?: AbortSignal,
): Promise<CharacterList> {
  const answer = await request<unknown>(base(guildId), { signal });
  if (!isCharacterList(answer)) throw new GuildApiError(UNREADABLE, 0);
  return answer;
}

export async function fetchCharacter(
  guildId: string,
  id: number,
  signal?: AbortSignal,
): Promise<CharacterDetail> {
  const answer = await request<unknown>(base(guildId) + '/' + id, { signal });
  if (!isCharacterDetail(answer)) throw new GuildApiError(UNREADABLE, 0);
  return answer;
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

/**
 * Members of the server whose name starts with what was typed.
 *
 * Officers only, and the bot refuses it from anybody else. Two letters at
 * least: this is a lookup for filing one character, not a way to read a
 * server roster.
 */
export async function searchMembers(
  guildId: string,
  query: string,
  signal?: AbortSignal,
): Promise<FoundMember[]> {
  const answer = await request<{ members?: unknown }>(
    '/api/v4/guilds/' + encodeURIComponent(guildId) + '/members?q=' + encodeURIComponent(query),
    { signal },
  );
  if (!Array.isArray(answer.members)) return [];
  return answer.members.filter(
    (m): m is FoundMember =>
      !!m && typeof m === 'object' && typeof (m as FoundMember).userId === 'string',
  );
}
