/** Class and spec reference data shared by the talent calculator and the raid planner. */

export const CLASS_IDS = [
  'warrior', 'paladin', 'hunter', 'rogue', 'priest',
  'shaman', 'mage', 'warlock', 'druid',
] as const;

export type ClassId = (typeof CLASS_IDS)[number];

export type Role = 'tank' | 'melee' | 'ranged' | 'healer';

export interface SpecInfo {
  /** Blizzard talent-tab id, also Wowhead's spec id. */
  id: number;
  /** Tree name exactly as it appears in the talent data. */
  name: string;
  /** Short label used in tight UI. */
  short: string;
  icon: string;
  role: Role;
}

export interface ClassInfo {
  id: ClassId;
  /** Display name, and the key used in the talent data file. */
  name: string;
  color: string;
  icon: string;
  specs: SpecInfo[];
}

export const CLASSES: Record<ClassId, ClassInfo> = {
  warrior: {
    id: 'warrior', name: 'Warrior', color: '#c69b6d', icon: 'class_warrior',
    specs: [
      { id: 161, name: 'Arms', short: 'Arms', icon: 'ability_rogue_eviscerate', role: 'melee' },
      { id: 164, name: 'Fury', short: 'Fury', icon: 'ability_warrior_innerrage', role: 'melee' },
      { id: 163, name: 'Protection', short: 'Prot', icon: 'ability_warrior_defensivestance', role: 'tank' },
    ],
  },
  paladin: {
    id: 'paladin', name: 'Paladin', color: '#f48cba', icon: 'class_paladin',
    specs: [
      { id: 382, name: 'Holy', short: 'Holy', icon: 'spell_holy_holybolt', role: 'healer' },
      { id: 383, name: 'Protection', short: 'Prot', icon: 'spell_holy_devotionaura', role: 'tank' },
      { id: 381, name: 'Retribution', short: 'Ret', icon: 'spell_holy_auraoflight', role: 'melee' },
    ],
  },
  hunter: {
    id: 'hunter', name: 'Hunter', color: '#aad372', icon: 'class_hunter',
    specs: [
      { id: 361, name: 'Beast Mastery', short: 'BM', icon: 'ability_hunter_beasttaming', role: 'ranged' },
      { id: 363, name: 'Marksmanship', short: 'MM', icon: 'ability_marksmanship', role: 'ranged' },
      { id: 362, name: 'Survival', short: 'Surv', icon: 'ability_hunter_swiftstrike', role: 'ranged' },
    ],
  },
  rogue: {
    id: 'rogue', name: 'Rogue', color: '#fff468', icon: 'class_rogue',
    specs: [
      { id: 182, name: 'Assassination', short: 'Assa', icon: 'ability_rogue_eviscerate', role: 'melee' },
      { id: 181, name: 'Combat', short: 'Combat', icon: 'ability_backstab', role: 'melee' },
      { id: 183, name: 'Subtlety', short: 'Sub', icon: 'ability_stealth', role: 'melee' },
    ],
  },
  priest: {
    id: 'priest', name: 'Priest', color: '#ffffff', icon: 'class_priest',
    specs: [
      { id: 201, name: 'Discipline', short: 'Disc', icon: 'spell_holy_wordfortitude', role: 'healer' },
      { id: 202, name: 'Holy', short: 'Holy', icon: 'spell_holy_holybolt', role: 'healer' },
      { id: 203, name: 'Shadow', short: 'Shadow', icon: 'spell_shadow_shadowwordpain', role: 'ranged' },
    ],
  },
  shaman: {
    id: 'shaman', name: 'Shaman', color: '#0070dd', icon: 'class_shaman',
    specs: [
      { id: 261, name: 'Elemental', short: 'Ele', icon: 'spell_nature_lightning', role: 'ranged' },
      { id: 263, name: 'Enhancement', short: 'Enh', icon: 'spell_nature_lightningshield', role: 'melee' },
      { id: 262, name: 'Restoration', short: 'Resto', icon: 'spell_nature_magicimmunity', role: 'healer' },
    ],
  },
  mage: {
    id: 'mage', name: 'Mage', color: '#3fc7eb', icon: 'class_mage',
    specs: [
      { id: 81, name: 'Arcane', short: 'Arcane', icon: 'spell_holy_magicalsentry', role: 'ranged' },
      { id: 41, name: 'Fire', short: 'Fire', icon: 'spell_fire_firebolt02', role: 'ranged' },
      { id: 61, name: 'Frost', short: 'Frost', icon: 'spell_frost_frostbolt02', role: 'ranged' },
    ],
  },
  warlock: {
    id: 'warlock', name: 'Warlock', color: '#8788ee', icon: 'class_warlock',
    specs: [
      { id: 302, name: 'Affliction', short: 'Aff', icon: 'spell_shadow_deathcoil', role: 'ranged' },
      { id: 303, name: 'Demonology', short: 'Demo', icon: 'spell_shadow_metamorphosis', role: 'ranged' },
      { id: 301, name: 'Destruction', short: 'Destro', icon: 'spell_shadow_rainoffire', role: 'ranged' },
    ],
  },
  druid: {
    id: 'druid', name: 'Druid', color: '#ff7c0a', icon: 'class_druid',
    specs: [
      { id: 283, name: 'Balance', short: 'Balance', icon: 'spell_nature_starfall', role: 'ranged' },
      { id: 281, name: 'Feral Combat', short: 'Feral', icon: 'ability_racial_bearform', role: 'melee' },
      { id: 282, name: 'Restoration', short: 'Resto', icon: 'spell_nature_healingtouch', role: 'healer' },
    ],
  },
};

export const CLASS_LIST: ClassInfo[] = CLASS_IDS.map((id) => CLASSES[id]);

/** Every spec id in the order the raid palette shows them. */
export const ALL_SPECS: Array<SpecInfo & { classId: ClassId }> = CLASS_LIST.flatMap((c) =>
  c.specs.map((s) => ({ ...s, classId: c.id })),
);

const SPEC_BY_ID = new Map<number, SpecInfo & { classId: ClassId }>(
  ALL_SPECS.map((s) => [s.id, s]),
);

export function specById(id: number): (SpecInfo & { classId: ClassId }) | undefined {
  return SPEC_BY_ID.get(id);
}

/** 'Warrior' -> 'warrior'. Returns undefined for anything unknown. */
export function classIdFromName(name: string): ClassId | undefined {
  const lower = name.toLowerCase() as ClassId;
  return CLASS_IDS.includes(lower) ? lower : undefined;
}

export function classInfo(id: ClassId): ClassInfo {
  return CLASSES[id];
}

/**
 * A finer split than Role for composition advice. Hunters sit in the ranged
 * column but want physical buffs, so they get their own archetype.
 */
export type Archetype = 'tank' | 'melee' | 'ranged-physical' | 'caster' | 'healer';

export function archetypeOf(classId: ClassId, specId: number): Archetype {
  const spec = specById(specId);
  const role = spec?.role ?? 'melee';
  if (role === 'tank') return 'tank';
  if (role === 'healer') return 'healer';
  if (role === 'melee') return 'melee';
  return classId === 'hunter' ? 'ranged-physical' : 'caster';
}

export const ARCHETYPE_LABEL: Record<Archetype, string> = {
  tank: 'Tanks',
  melee: 'Melee',
  'ranged-physical': 'Hunters',
  caster: 'Casters',
  healer: 'Healers',
};

export const ARCHETYPE_ORDER: Archetype[] = ['tank', 'melee', 'ranged-physical', 'caster', 'healer'];

/** Archetype for a player, honouring an explicit override when the source set one. */
export function archetypeFor(p: { classId: ClassId; specId: number; role?: Archetype }): Archetype {
  return p.role ?? archetypeOf(p.classId, p.specId);
}

/**
 * The four buckets a raid leader actually thinks in. Archetype stays finer than
 * this on purpose: hunters and casters both sit in Ranged DPS, but they want
 * different buffs, so the seating advice keeps them apart underneath.
 */
export type RoleBucket = 'tank' | 'melee' | 'ranged' | 'healer';

export const ROLE_ORDER: RoleBucket[] = ['tank', 'melee', 'ranged', 'healer'];

export const ROLE_LABEL: Record<RoleBucket, string> = {
  tank: 'Tanks',
  melee: 'Melee DPS',
  ranged: 'Ranged DPS',
  healer: 'Healers',
};

/** Shorter, for tight headers. */
export const ROLE_SHORT: Record<RoleBucket, string> = {
  tank: 'Tanks',
  melee: 'Melee',
  ranged: 'Ranged',
  healer: 'Healers',
};

export function bucketOf(archetype: Archetype): RoleBucket {
  if (archetype === 'ranged-physical' || archetype === 'caster') return 'ranged';
  return archetype;
}

export function roleOf(p: { classId: ClassId; specId: number; role?: Archetype }): RoleBucket {
  return bucketOf(archetypeFor(p));
}
