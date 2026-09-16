/**
 * Raid buffs, boss debuffs and consumables the fight settings can switch on.
 *
 * These add to the stats the addon reported, so anything already up when the
 * export ran would be counted twice. The importer lists what was active and the
 * page warns about it; the honest way to use this panel is to export unbuffed.
 *
 * Classic values, unverified for Forever. The raid planner's catalog in
 * src/raid/effects is the fuller list; this one carries only what changes a
 * number the simulator reads.
 */

import type { ForeverStatus } from '../../raid/types';
import type { School, StatBlock, StatKey } from '../export-format';

export type BuffKind = 'raid' | 'debuff' | 'consumable';

export interface BuffDef {
  id: string;
  name: string;
  kind: BuffKind;
  icon: string;
  /** Flat stats it adds. */
  stats: StatBlock;
  /**
   * Stats it raises by a share rather than a number. Kings is the reason this
   * exists: it multiplies what you already have, so it has to be applied after
   * the gear and before the class conversions.
   */
  multipliers?: Partial<Record<StatKey, number>>;
  /** How much more of each school the target takes, one being no change. */
  damageTaken?: Partial<Record<School, number>>;
  /** Armor taken off the target, which several debuffs do additively. */
  targetArmor?: number;
  /** Who brings it, in plain words, for the checkbox label. */
  from?: string;
  /** Who it is worth anything to, so a warrior is not offered Arcane Intellect. */
  roles?: BuffRole[];
  /** Buffs that overwrite this one; the stronger of the two is kept. */
  exclusiveWith?: string[];
  forever: { status: ForeverStatus; note?: string };
}

/** Broad strokes, only fine enough to decide which checkboxes to show. */
export type BuffRole = 'caster' | 'melee';

const unverified = (note?: string) =>
  (note ? { status: 'unverified' as const, note } : { status: 'unverified' as const });

export const BUFFS: BuffDef[] = [
  /* ------------------------------------------------------------ raid buffs */
  {
    id: 'arcane-intellect',
    name: 'Arcane Intellect',
    kind: 'raid',
    icon: 'spell_holy_magicalsentry',
    from: 'Mage',
    stats: { intellect: 31 },
    roles: ['caster'],
    forever: unverified(),
  },
  {
    id: 'mark-of-the-wild',
    name: 'Mark of the Wild',
    kind: 'raid',
    icon: 'spell_nature_regeneration',
    from: 'Druid',
    stats: { strength: 12, agility: 12, stamina: 12, intellect: 12, spirit: 12, armor: 285 },
    forever: unverified(),
  },
  {
    id: 'power-word-fortitude',
    name: 'Power Word: Fortitude',
    kind: 'raid',
    icon: 'spell_holy_wordfortitude',
    from: 'Priest',
    stats: { stamina: 54 },
    forever: unverified(),
  },
  {
    id: 'divine-spirit',
    name: 'Divine Spirit',
    kind: 'raid',
    icon: 'spell_holy_divinespirit',
    from: 'Discipline Priest',
    stats: { spirit: 40 },
    roles: ['caster'],
    forever: unverified(),
  },
  {
    id: 'blessing-of-kings',
    name: 'Blessing of Kings',
    kind: 'raid',
    icon: 'spell_magic_greaterblessingofkings',
    from: 'Paladin',
    stats: {},
    multipliers: {
      strength: 1.1, agility: 1.1, stamina: 1.1, intellect: 1.1, spirit: 1.1,
    },
    forever: unverified('Raises every primary stat by a tenth, applied to your gear and buffs.'),
  },
  {
    id: 'mana-spring-totem',
    name: 'Mana Spring Totem',
    kind: 'raid',
    icon: 'spell_nature_manaregentotem',
    from: 'Shaman, in your group',
    stats: { mp5: 10 },
    roles: ['caster'],
    forever: unverified(),
  },
  {
    id: 'moonkin-aura',
    name: 'Moonkin Aura',
    kind: 'raid',
    icon: 'spell_nature_moonglow',
    from: 'Balance Druid, in your group',
    stats: { spellCrit: 3 },
    roles: ['caster'],
    forever: unverified(),
  },

  {
    id: 'mage-armor',
    name: 'Mage Armor',
    kind: 'raid',
    icon: 'spell_magearmor',
    from: 'Yourself, instead of Ice Armor',
    stats: {},
    roles: ['caster'],
    forever: {
      status: 'unverified',
      note:
        'Mage Armor is in the spellbook the demo showed, but not what Forever’s version does. ' +
        'Modelled as the Classic three tenths of spirit regeneration continuing while you cast, ' +
        'which is why it changes the mana stats so much.',
    },
  },

  /* ------------------------------------------------------------- consumables */
  {
    id: 'flask-of-supreme-power',
    name: 'Flask of Supreme Power',
    kind: 'consumable',
    icon: 'inv_potion_41',
    stats: { spellPower: 150 },
    exclusiveWith: ['greater-arcane-elixir'],
    roles: ['caster'],
    forever: unverified(),
  },
  {
    id: 'greater-arcane-elixir',
    name: 'Greater Arcane Elixir',
    kind: 'consumable',
    icon: 'inv_potion_25',
    stats: { spellPower: 35 },
    exclusiveWith: ['flask-of-supreme-power'],
    roles: ['caster'],
    forever: unverified(),
  },
  {
    id: 'elixir-of-greater-intellect',
    name: 'Elixir of Greater Intellect',
    kind: 'consumable',
    icon: 'inv_potion_45',
    stats: { intellect: 25 },
    roles: ['caster'],
    forever: unverified(),
  },
  {
    id: 'brilliant-wizard-oil',
    name: 'Brilliant Wizard Oil',
    kind: 'consumable',
    icon: 'inv_potion_105',
    stats: { spellPower: 36, spellCrit: 1 },
    roles: ['caster'],
    forever: unverified(),
  },
  {
    id: 'runn-tum-tuber-surprise',
    name: 'Runn Tum Tuber Surprise',
    kind: 'consumable',
    icon: 'inv_misc_food_63',
    stats: { intellect: 10 },
    roles: ['caster'],
    forever: unverified(),
  },

  /* ---------------------------------------------------------- boss debuffs */
  {
    id: 'curse-of-shadow',
    name: 'Curse of Shadow',
    kind: 'debuff',
    icon: 'spell_shadow_curseofachimonde',
    from: 'Warlock',
    stats: {},
    damageTaken: { shadow: 1.1, arcane: 1.1 },
    roles: ['caster'],
    forever: unverified('Raises shadow and arcane damage taken by a tenth.'),
  },
  {
    id: 'curse-of-the-elements',
    name: 'Curse of the Elements',
    kind: 'debuff',
    icon: 'spell_shadow_chilltouch',
    from: 'Warlock',
    stats: {},
    damageTaken: { fire: 1.1, frost: 1.1 },
    roles: ['caster'],
    forever: unverified(
      'Raises fire and frost damage taken by a tenth. It lowers those resistances too, which ' +
        'only shows up here when you have given the boss some.',
    ),
  },

  /* ----------------------------------------------------------- melee buffs */
  {
    id: 'battle-shout',
    name: 'Battle Shout',
    kind: 'raid',
    icon: 'ability_warrior_battleshout',
    from: 'Warrior',
    roles: ['melee'],
    stats: { attackPower: 232 },
    forever: unverified('Rank 7 at the Classic value.'),
  },
  {
    id: 'blessing-of-might',
    name: 'Blessing of Might',
    kind: 'raid',
    icon: 'spell_holy_fistofjustice',
    from: 'Paladin',
    roles: ['melee'],
    stats: { attackPower: 222 },
    forever: unverified('Rank 7 at the Classic value.'),
  },
  {
    id: 'strength-of-earth',
    name: 'Strength of Earth Totem',
    kind: 'raid',
    icon: 'spell_nature_earthbindtotem',
    from: 'Shaman, in your group',
    roles: ['melee'],
    stats: { strength: 77 },
    forever: unverified(),
  },
  {
    id: 'grace-of-air',
    name: 'Grace of Air Totem',
    kind: 'raid',
    icon: 'spell_nature_invisibilitytotem',
    from: 'Shaman, in your group',
    roles: ['melee'],
    stats: { agility: 77 },
    forever: unverified(),
  },
  {
    id: 'trueshot-aura',
    name: 'Trueshot Aura',
    kind: 'raid',
    icon: 'ability_trueshot',
    from: 'Marksmanship Hunter',
    roles: ['melee'],
    stats: { attackPower: 100 },
    forever: unverified(),
  },
  {
    id: 'warchiefs-blessing',
    name: "Warchief's Blessing",
    kind: 'raid',
    icon: 'spell_arcane_teleportorgrimmar',
    from: 'A world buff, Horde side',
    roles: ['melee'],
    stats: { haste: 15 },
    forever: unverified(
      'Fifteen per cent attack speed. The health and the rage it also gives change nothing ' +
        'the simulator reads.',
    ),
  },
  {
    id: 'windfury-totem',
    name: 'Windfury Totem',
    kind: 'raid',
    icon: 'spell_nature_windfury',
    from: 'Shaman, in your group',
    roles: ['melee'],
    stats: {},
    forever: unverified(
      'Windfury is an extra attack on a chance to proc, and procs are not simulated yet, ' +
        'so this is listed and adds nothing.',
    ),
  },

  /* --------------------------------------------------- melee consumables */
  {
    id: 'elixir-of-the-mongoose',
    name: 'Elixir of the Mongoose',
    kind: 'consumable',
    icon: 'inv_potion_32',
    roles: ['melee'],
    stats: { agility: 25, crit: 2 },
    forever: unverified(),
  },
  {
    id: 'juju-power',
    name: 'Juju Power',
    kind: 'consumable',
    icon: 'inv_misc_monsterscales_11',
    roles: ['melee'],
    stats: { strength: 30 },
    exclusiveWith: ['smoked-desert-dumplings'],
    forever: unverified(),
  },
  {
    id: 'smoked-desert-dumplings',
    name: 'Smoked Desert Dumplings',
    kind: 'consumable',
    icon: 'inv_misc_food_64',
    roles: ['melee'],
    stats: { strength: 20 },
    exclusiveWith: ['juju-power'],
    forever: unverified(),
  },
  {
    id: 'winterfall-firewater',
    name: 'Winterfall Firewater',
    kind: 'consumable',
    icon: 'inv_potion_92',
    roles: ['melee'],
    stats: { attackPower: 35 },
    forever: unverified(),
  },
  {
    id: 'juju-flurry',
    name: 'Juju Flurry',
    kind: 'consumable',
    icon: 'inv_misc_monsterscales_07',
    roles: ['melee'],
    stats: { haste: 3 },
    forever: unverified('Three per cent attack speed for twenty seconds, modelled as if it were up all fight.'),
  },

  /* ------------------------------------------------- armor off the boss */
  {
    id: 'sunder-armor',
    name: 'Sunder Armor',
    kind: 'debuff',
    icon: 'ability_warrior_sunder',
    from: 'Warrior, five stacks',
    roles: ['melee'],
    stats: {},
    targetArmor: 2250,
    forever: unverified('Five stacks, assumed up from the pull.'),
  },
  {
    id: 'faerie-fire',
    name: 'Faerie Fire',
    kind: 'debuff',
    icon: 'spell_nature_faeriefire',
    from: 'Druid',
    roles: ['melee'],
    stats: {},
    targetArmor: 505,
    forever: unverified(),
  },
  {
    id: 'curse-of-recklessness',
    name: 'Curse of Recklessness',
    kind: 'debuff',
    icon: 'spell_shadow_unholystrength',
    from: 'Warlock',
    roles: ['melee'],
    stats: {},
    targetArmor: 640,
    forever: unverified(),
  },
];

const BY_ID = new Map(BUFFS.map((b) => [b.id, b]));

export function buffById(id: string): BuffDef | undefined {
  return BY_ID.get(id);
}

export function buffsOfKind(kind: BuffKind): BuffDef[] {
  return BUFFS.filter((b) => b.kind === kind);
}

/**
 * The ones worth showing to this kind of character. A buff with no role at all
 * is worth something to everyone, so it always shows.
 */
export function buffsFor(kind: BuffKind, role: BuffRole): BuffDef[] {
  return BUFFS.filter((b) => b.kind === kind && (!b.roles || b.roles.includes(role)));
}

/** What a caster would usually have up, as a sensible starting tick set. */
export const DEFAULT_BUFFS = [
  'arcane-intellect',
  'mark-of-the-wild',
  'power-word-fortitude',
  'divine-spirit',
];

export const DEFAULT_CONSUMABLES = ['flask-of-supreme-power', 'brilliant-wizard-oil'];

const DEFAULTS: Record<BuffRole, { buffs: string[]; consumables: string[] }> = {
  caster: { buffs: DEFAULT_BUFFS, consumables: DEFAULT_CONSUMABLES },
  melee: {
    buffs: ['battle-shout', 'mark-of-the-wild', 'power-word-fortitude', 'blessing-of-might', 'strength-of-earth'],
    consumables: ['elixir-of-the-mongoose', 'juju-power', 'winterfall-firewater'],
  },
};

/** A starting tick set that suits the character, so nobody starts with the wrong list. */
export function defaultsFor(role: BuffRole): { buffs: string[]; consumables: string[] } {
  const picked = DEFAULTS[role];
  return { buffs: [...picked.buffs], consumables: [...picked.consumables] };
}
