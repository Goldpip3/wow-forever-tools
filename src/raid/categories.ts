/** The 48 categories Wowhead's Classic raid composition tool tracks, in its four meta groups. */

export type MetaCategory = 'Buffs' | 'Debuffs' | 'Other' | 'Lists';

export interface Category {
  id: string;
  name: string;
  meta: MetaCategory;
}

export const CATEGORIES: Category[] = [
  /* -------------------------------------------------------------- Buffs */
  { id: 'stamina', name: 'Stamina', meta: 'Buffs' },
  { id: 'strength', name: 'Strength', meta: 'Buffs' },
  { id: 'agility', name: 'Agility', meta: 'Buffs' },
  { id: 'intellect', name: 'Intellect', meta: 'Buffs' },
  { id: 'spirit', name: 'Spirit', meta: 'Buffs' },
  { id: 'all-stats', name: 'All Stats', meta: 'Buffs' },
  { id: 'melee-attack-power', name: 'Melee Attack Power', meta: 'Buffs' },
  { id: 'ranged-attack-power', name: 'Ranged Attack Power', meta: 'Buffs' },
  { id: 'melee-and-ranged-crit', name: 'Melee and Ranged Crit', meta: 'Buffs' },
  { id: 'spell-crit', name: 'Spell Crit', meta: 'Buffs' },
  { id: 'extra-melee-attack', name: 'Extra Melee Attack', meta: 'Buffs' },
  { id: 'armor', name: 'Armor', meta: 'Buffs' },
  { id: 'reduced-damage-taken', name: 'Reduced Damage Taken', meta: 'Buffs' },
  { id: 'reduced-threat', name: 'Reduced Threat', meta: 'Buffs' },
  { id: 'mana-regen', name: 'Mana Regen', meta: 'Buffs' },
  { id: 'holy-damage', name: 'Holy Damage', meta: 'Buffs' },
  { id: 'fire-damage', name: 'Fire Damage', meta: 'Buffs' },
  { id: 'shadow-damage', name: 'Shadow Damage', meta: 'Buffs' },
  { id: 'fire-resist', name: 'Fire Resist', meta: 'Buffs' },
  { id: 'frost-resist', name: 'Frost Resist', meta: 'Buffs' },
  { id: 'nature-resist', name: 'Nature Resist', meta: 'Buffs' },
  { id: 'shadow-resist', name: 'Shadow Resist', meta: 'Buffs' },
  { id: 'arcane-resist', name: 'Arcane Resist', meta: 'Buffs' },

  /* ------------------------------------------------------------ Debuffs */
  { id: 'reduced-armor', name: 'Reduced Armor', meta: 'Debuffs' },
  { id: 'reduced-melee-attack-power', name: 'Reduced Melee Attack Power', meta: 'Debuffs' },
  { id: 'physical-damage-taken', name: 'Physical Damage Taken', meta: 'Debuffs' },
  { id: 'reduced-attack-speed', name: 'Reduced Attack Speed', meta: 'Debuffs' },
  { id: 'reduced-hit-chance', name: 'Reduced Hit Chance', meta: 'Debuffs' },
  { id: 'increased-fire-damage-taken', name: 'Increased Fire Damage Taken', meta: 'Debuffs' },
  { id: 'increased-frost-damage-taken', name: 'Increased Frost Damage Taken', meta: 'Debuffs' },
  { id: 'increased-shadow-damage-taken', name: 'Increased Shadow Damage Taken', meta: 'Debuffs' },
  { id: 'increased-arcane-damage-taken', name: 'Increased Arcane Damage Taken', meta: 'Debuffs' },
  { id: 'increased-nature-damage-taken', name: 'Increased Nature Damage Taken', meta: 'Debuffs' },
  { id: 'reduced-fire-resistance', name: 'Reduced Fire Resistance', meta: 'Debuffs' },
  { id: 'reduced-frost-resistance', name: 'Reduced Frost Resistance', meta: 'Debuffs' },
  { id: 'reduced-shadow-resistance', name: 'Reduced Shadow Resistance', meta: 'Debuffs' },
  { id: 'reduced-arcane-resistance', name: 'Reduced Arcane Resistance', meta: 'Debuffs' },
  { id: 'increased-chance-to-be-crit-by-frost', name: 'Increased Chance to be Crit by Frost Spell', meta: 'Debuffs' },
  { id: 'reduced-casting-speed', name: 'Reduced Casting Speed', meta: 'Debuffs' },

  /* -------------------------------------------------------------- Other */
  { id: 'interrupts', name: 'Interrupts', meta: 'Other' },
  { id: 'silences', name: 'Silences', meta: 'Other' },
  { id: 'offensive-magic-dispels', name: 'Offensive Magic Dispels', meta: 'Other' },
  { id: 'offensive-enrage-dispels', name: 'Offensive Enrage Dispels', meta: 'Other' },
  { id: 'friendly-magic-dispels', name: 'Friendly Magic Dispels', meta: 'Other' },
  { id: 'friendly-curse-dispels', name: 'Friendly Curse Dispels', meta: 'Other' },
  { id: 'friendly-poison-dispels', name: 'Friendly Poison Dispels', meta: 'Other' },
  { id: 'friendly-disease-dispels', name: 'Friendly Disease Dispels', meta: 'Other' },
  { id: 'battle-resurrections', name: 'Battle Resurrections', meta: 'Other' },

  /* -------------------------------------------------------------- Lists */
  { id: 'external-cooldowns', name: 'External Cooldowns', meta: 'Lists' },
  { id: 'immunities', name: 'Immunities', meta: 'Lists' },
  { id: 'in-combat-cc', name: 'In-Combat Crowd Control', meta: 'Lists' },
  { id: 'out-of-combat-cc', name: 'Out-of-Combat Crowd Control', meta: 'Lists' },
  { id: 'misc-utility', name: 'Miscellaneous Utility', meta: 'Lists' },
];

export const META_ORDER: MetaCategory[] = ['Buffs', 'Debuffs', 'Other', 'Lists'];

const BY_ID = new Map(CATEGORIES.map((c) => [c.id, c]));

export function category(id: string): Category | undefined {
  return BY_ID.get(id);
}

export function categoriesIn(meta: MetaCategory): Category[] {
  return CATEGORIES.filter((c) => c.meta === meta);
}

export function categoryName(id: string): string {
  return BY_ID.get(id)?.name ?? id;
}
