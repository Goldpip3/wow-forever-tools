/**
 * Which server the page is looking at.
 *
 * Pulled out of the drawing code because it is the one decision on this page that can be
 * wrong in a way nobody notices: a stale link naming a server the reader has since left
 * would otherwise send a request for characters they may not read, and the bot's refusal
 * would arrive as an error rather than as a picker.
 */

export interface PickableGuild {
  id: string;
  name: string;
}

/**
 * Settle on a server, given what the link asked for and what the account can see.
 *
 * Nothing is chosen when there are several and the link named none: guessing which
 * guild somebody meant and quietly showing the wrong roster is worse than asking.
 */
export function chooseGuild(guilds: readonly PickableGuild[], wanted: string | null): string | null {
  if (wanted && guilds.some((g) => g.id === wanted)) return wanted;
  // One server is not a choice, so do not make them make it.
  if (guilds.length === 1) return guilds[0].id;
  return null;
}

/** Whether a character id still belongs to the server now being shown. */
export function keepCharacter(
  previousGuildId: string | null,
  nextGuildId: string | null,
  characterId: number | null,
): number | null {
  if (characterId === null) return null;
  return previousGuildId === nextGuildId ? characterId : null;
}
