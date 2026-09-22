/**
 * What this site needs from the bot, and how it says so when it is not there.
 *
 * The site and the bot deploy separately, so a page can be newer than the API it
 * is talking to or older. Before this, the symptom of that was a field that
 * silently would not save, or a request that answered 400 with a message about
 * something else. Now the page asks what is deployed and says which side is
 * behind.
 *
 * `/api/v4/version` needs no session, which is the point: it has to be able to
 * answer while signing in is what is broken.
 */

import { API_BASE } from './session';

/**
 * The route contract this site is written against, the `v4` in every path.
 *
 * It moves when a shape the site reads changes in a way this code cannot
 * survive. A new field does not move it.
 */
export const API_CONTRACT = 4;

export interface ApiIdentity {
  api: number;
  version: string;
  build: string;
  capabilities: readonly string[];
}

/** What the guild page cannot work without. */
export const GUILD_CAPABILITIES = ['characters'] as const;

let known: ApiIdentity | null = null;
let asked = false;

/** The last answer, without asking again. Null before the first one arrives. */
export function apiIdentity(): ApiIdentity | null {
  return known;
}

/** True when the bot has said it has this, and false while nobody has asked. */
export function hasCapability(name: string): boolean {
  return known?.capabilities.includes(name) ?? false;
}

/**
 * Read what the bot is, once.
 *
 * A failure resolves to null rather than throwing. Not knowing what is deployed
 * is a worse diagnostic than a version mismatch, but it is not itself an error
 * the reader can do anything about: the call that needed the API will say so.
 */
export async function loadApiIdentity(): Promise<ApiIdentity | null> {
  if (asked) return known;
  asked = true;
  try {
    const res = await fetch(API_BASE + '/api/v4/version', {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const parsed = (await res.json()) as Partial<ApiIdentity>;
    if (typeof parsed.api !== 'number') return null;
    known = {
      api: parsed.api,
      version: typeof parsed.version === 'string' ? parsed.version : 'unknown',
      build: typeof parsed.build === 'string' ? parsed.build : 'unknown',
      capabilities: Array.isArray(parsed.capabilities)
        ? parsed.capabilities.filter((c): c is string => typeof c === 'string')
        : [],
    };
    return known;
  } catch {
    return null;
  }
}

/**
 * Why this page and that bot cannot work together, or null when they can.
 *
 * Says which of the two is behind, because that decides who fixes it: an older
 * bot is a deploy the owner has not done, and an older page is a cache or a
 * Pages build that has not run.
 */
export function contractProblem(
  identity: ApiIdentity | null,
  needed: readonly string[] = [],
): string | null {
  // Nobody answered. The request that actually needed the API reports that.
  if (!identity) return null;

  if (identity.api < API_CONTRACT) {
    return (
      'The bot on this server answers API ' +
      identity.api +
      ' and this page is written for ' +
      API_CONTRACT +
      '. The bot has not been updated yet, so parts of this page will not work.'
    );
  }
  if (identity.api > API_CONTRACT) {
    return (
      'The bot on this server answers API ' +
      identity.api +
      ' and this page is written for ' +
      API_CONTRACT +
      '. Reload the page. If it says this again, the site has not been rebuilt yet.'
    );
  }

  const absent = needed.filter((name) => !identity.capabilities.includes(name));
  if (absent.length) {
    return (
      'This page needs ' +
      absent.join(' and ') +
      ', which the bot on this server does not have yet. Update the bot and reload.'
    );
  }
  return null;
}

/** Test seam: forget the cached answer. */
export function resetApiIdentity(): void {
  known = null;
  asked = false;
}
