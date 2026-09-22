/**
 * The professions, as the game names them.
 *
 * Mirrors the list the bot validates against. The two have to agree, so if one gains a
 * profession the other has to gain it in the same commit; a key the bot refuses would
 * otherwise reach a member as "that character could not be saved" with nothing to act on.
 */

export const PRIMARY_PROFESSIONS = [
  'alchemy',
  'blacksmithing',
  'enchanting',
  'engineering',
  'herbalism',
  'leatherworking',
  'mining',
  'skinning',
  'tailoring',
] as const;

export const SECONDARY_PROFESSIONS = ['cooking', 'first-aid', 'fishing'] as const;

export const PROFESSION_KEYS = [...PRIMARY_PROFESSIONS, ...SECONDARY_PROFESSIONS] as const;
export type ProfessionKey = (typeof PROFESSION_KEYS)[number];

/**
 * Each profession's display name and its icon in one table.
 *
 * Written as `icon: '...'` because scripts/collect-effect-icons.mjs reads that shape
 * out of the source to decide which icons to fetch. A name it cannot see is an icon
 * that never downloads, and the page falls back to a question mark.
 */
export const PROFESSIONS: Record<ProfessionKey, { name: string; icon: string }> = {
  alchemy: { name: 'Alchemy', icon: 'trade_alchemy' },
  blacksmithing: { name: 'Blacksmithing', icon: 'trade_blacksmithing' },
  enchanting: { name: 'Enchanting', icon: 'trade_engraving' },
  engineering: { name: 'Engineering', icon: 'trade_engineering' },
  herbalism: { name: 'Herbalism', icon: 'trade_herbalism' },
  leatherworking: { name: 'Leatherworking', icon: 'trade_leatherworking' },
  mining: { name: 'Mining', icon: 'trade_mining' },
  skinning: { name: 'Skinning', icon: 'inv_misc_pelt_wolf_01' },
  tailoring: { name: 'Tailoring', icon: 'trade_tailoring' },
  cooking: { name: 'Cooking', icon: 'inv_misc_food_15' },
  'first-aid': { name: 'First Aid', icon: 'spell_holy_sealofsacrifice' },
  fishing: { name: 'Fishing', icon: 'trade_fishing' },
};

/** The icon for a profession, or the question mark when the key is unknown. */
export function professionIcon(key: string): string {
  return isProfessionKey(key) ? PROFESSIONS[key].icon : '';
}

/** The highest a profession goes in this version. */
export const MAX_PROFESSION_SKILL = 300;

/** Two primaries, which is what the game allows. */
export const MAX_PRIMARY_PROFESSIONS = 2;

export interface Profession {
  key: ProfessionKey;
  /** Null when somebody names the profession but not the number. */
  skill: number | null;
}

export function isPrimary(key: string): key is (typeof PRIMARY_PROFESSIONS)[number] {
  return (PRIMARY_PROFESSIONS as readonly string[]).includes(key);
}

export function isProfessionKey(key: string): key is ProfessionKey {
  return (PROFESSION_KEYS as readonly string[]).includes(key);
}

export function professionName(key: string): string {
  return isProfessionKey(key) ? PROFESSIONS[key].name : key;
}

/**
 * What is wrong with a set of professions, or nothing.
 *
 * Checked here as well as on the bot so the form can say so before a round trip. The
 * bot's answer is the one that decides; this one is the one that is quick.
 */
export function professionProblem(list: readonly Profession[]): string | undefined {
  const seen = new Set<string>();
  for (const p of list) {
    if (seen.has(p.key)) return `${professionName(p.key)} is listed twice.`;
    seen.add(p.key);
    if (p.skill !== null && (p.skill < 1 || p.skill > MAX_PROFESSION_SKILL)) {
      return `${professionName(p.key)} goes up to ${MAX_PROFESSION_SKILL}.`;
    }
  }
  const primaries = list.filter((p) => isPrimary(p.key)).length;
  if (primaries > MAX_PRIMARY_PROFESSIONS) {
    return `A character can learn ${MAX_PRIMARY_PROFESSIONS} primary professions, not ${primaries}.`;
  }
  return undefined;
}

/** Primaries first, then secondaries, each group alphabetical, as the game lists them. */
export function sortProfessions(list: readonly Profession[]): Profession[] {
  return [...list].sort((a, b) => {
    if (isPrimary(a.key) !== isPrimary(b.key)) return isPrimary(a.key) ? -1 : 1;
    return professionName(a.key).localeCompare(professionName(b.key));
  });
}
