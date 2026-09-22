/**
 * Forever's rulesets, which replaced realms.
 *
 * Blizzard went realmless: there is no realm-selection screen and no realm names.
 * Instead a character is created under one of four rulesets and stays there, and
 * players cannot move between them without making a new character. Cross-ruleset
 * grouping, dungeons and raids do not happen.
 *
 * That makes this the field a raid leader actually needs. A realm never decided
 * who could raid together, because connected realms and cross-realm groups had
 * long since stopped it mattering. A ruleset does.
 *
 * Mirrors the list the bot validates against, the same standing rule the
 * professions follow: a key the bot refuses reaches a member as "that character
 * could not be saved" with nothing to act on.
 */

export const RULESETS = ['normal', 'pvp', 'roleplaying', 'hardcore'] as const;
export type Ruleset = (typeof RULESETS)[number];

export const RULESET_NAMES: Record<Ruleset, string> = {
  normal: 'Normal',
  pvp: 'PvP',
  roleplaying: 'Roleplaying',
  hardcore: 'Hardcore',
};

/** Blizzard's own one-line descriptions, for the picker's hint. */
export const RULESET_NOTES: Record<Ruleset, string> = {
  normal: 'The baseline game.',
  pvp: 'Contested territory carries open-world conflict.',
  roleplaying: 'Leans into the fantasy.',
  hardcore: 'Death is permanent.',
};

/**
 * Hardcore is announced for after launch rather than with it.
 *
 * Listed so a character already on it reads correctly, and kept out of the picker
 * until it exists, so nobody files a character on a ruleset they cannot be on.
 */
export const LIVE_RULESETS: readonly Ruleset[] = ['normal', 'pvp', 'roleplaying'];

export function isRuleset(value: string): value is Ruleset {
  return (RULESETS as readonly string[]).includes(value);
}

/** The ruleset's proper name, or null when nobody has said which. */
export function rulesetName(value: string | null): string | null {
  if (!value) return null;
  return isRuleset(value) ? RULESET_NAMES[value] : value;
}
