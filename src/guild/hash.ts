/**
 * What the address bar carries on the guild page.
 *
 * `#guild=<serverId>` and `#guild=<serverId>&c=<characterId>`, so a profile can be
 * pasted into Discord and opened on the right server. Nothing secret goes in here: the
 * session cookie is what authorises every read, and a fragment is the one part of a URL
 * that is safe to pass around only because it never reaches a server log.
 *
 * `#demo` is the offline sample, which belongs to no server at all.
 */

export interface GuildHash {
  guildId: string | null;
  characterId: number | null;
  demo: boolean;
}

/** Discord snowflakes are digits, and nothing else may reach a request path. */
function cleanId(raw: string | null): string | null {
  return raw && /^\d{1,25}$/.test(raw) ? raw : null;
}

export function parseGuildHash(hash: string): GuildHash {
  const body = hash.replace(/^#/, '');
  if (body === 'demo') return { guildId: null, characterId: null, demo: true };

  const params = new URLSearchParams(body);
  const character = Number(params.get('c'));
  return {
    guildId: cleanId(params.get('guild')),
    characterId: Number.isInteger(character) && character > 0 ? character : null,
    demo: params.has('demo'),
  };
}

export function guildHash(state: GuildHash): string {
  // The sample keeps its open character too, so reloading a sample profile does not
  // bounce the reader back to the list.
  if (state.demo) return state.characterId ? '#demo&c=' + state.characterId : '#demo';
  if (!state.guildId) return '';
  const base = '#guild=' + state.guildId;
  return state.characterId ? base + '&c=' + state.characterId : base;
}

/**
 * Put the state in the address bar.
 *
 * Opening a profile pushes, so Back returns to the list the reader came from.
 * This used to replace, on the grounds that Back should leave the page rather
 * than walk through every character somebody glanced at; that made Back leave
 * the site from a profile, which is not what a reader expects from a page that
 * looks like a list and a detail.
 *
 * Everything else replaces: a search, a server change, opening the form. None of
 * those is a place to come back to.
 */
export function writeGuildHash(state: GuildHash, mode: 'push' | 'replace' = 'replace'): void {
  const next = guildHash(state);
  if (next === location.hash) return;
  const url = location.pathname + location.search + next;
  if (mode === 'push') history.pushState(null, '', url);
  else history.replaceState(null, '', url);
}
