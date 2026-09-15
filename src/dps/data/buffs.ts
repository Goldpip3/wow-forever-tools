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
import type { StatBlock } from '../export-format';

export type BuffKind = 'raid' | 'debuff' | 'consumable';

export interface BuffDef {
  id: string;
  name: string;
  kind: BuffKind;
  icon: string;
  /** Flat stats it adds. */
  stats: StatBlock;
  /** Who brings it, in plain words, for the checkbox label. */
  from?: string;
  /** Buffs that overwrite this one; the stronger of the two is kept. */
  exclusiveWith?: string[];
  forever: { status: ForeverStatus; note?: string };
}

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
    forever: unverified(),
  },
  {
    id: 'blessing-of-kings',
    name: 'Blessing of Kings',
    kind: 'raid',
    icon: 'spell_magic_greaterblessingofkings',
    from: 'Paladin',
    stats: {},
    forever: unverified(
      'Kings raises every stat by a tenth. The site does not model percentage buffs yet, ' +
        'so this one is listed but adds nothing.',
    ),
  },
  {
    id: 'mana-spring-totem',
    name: 'Mana Spring Totem',
    kind: 'raid',
    icon: 'spell_nature_manaregentotem',
    from: 'Shaman, in your group',
    stats: { mp5: 10 },
    forever: unverified(),
  },
  {
    id: 'moonkin-aura',
    name: 'Moonkin Aura',
    kind: 'raid',
    icon: 'spell_nature_moonglow',
    from: 'Balance Druid, in your group',
    stats: { spellCrit: 3 },
    forever: unverified(),
  },

  {
    id: 'mage-armor',
    name: 'Mage Armor',
    kind: 'raid',
    icon: 'spell_magearmor',
    from: 'Yourself, instead of Ice Armor',
    stats: {},
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
    forever: unverified(),
  },
  {
    id: 'greater-arcane-elixir',
    name: 'Greater Arcane Elixir',
    kind: 'consumable',
    icon: 'inv_potion_25',
    stats: { spellPower: 35 },
    exclusiveWith: ['flask-of-supreme-power'],
    forever: unverified(),
  },
  {
    id: 'elixir-of-greater-intellect',
    name: 'Elixir of Greater Intellect',
    kind: 'consumable',
    icon: 'inv_potion_45',
    stats: { intellect: 25 },
    forever: unverified(),
  },
  {
    id: 'brilliant-wizard-oil',
    name: 'Brilliant Wizard Oil',
    kind: 'consumable',
    icon: 'inv_potion_105',
    stats: { spellPower: 36, spellCrit: 1 },
    forever: unverified(),
  },
  {
    id: 'runn-tum-tuber-surprise',
    name: 'Runn Tum Tuber Surprise',
    kind: 'consumable',
    icon: 'inv_misc_food_63',
    stats: { intellect: 10 },
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
    forever: unverified(
      'Raises shadow and arcane damage taken by a tenth. Percentage debuffs on the target ' +
        'are not modelled yet, so this adds nothing.',
    ),
  },
  {
    id: 'curse-of-the-elements',
    name: 'Curse of the Elements',
    kind: 'debuff',
    icon: 'spell_shadow_chilltouch',
    from: 'Warlock',
    stats: {},
    forever: unverified(
      'Raises fire and frost damage taken by a tenth and lowers those resistances. ' +
        'Percentage debuffs are not modelled yet, so this adds nothing.',
    ),
  },
];

const BY_ID = new Map(BUFFS.map((b) => [b.id, b]));

export function buffById(id: string): BuffDef | undefined {
  return BY_ID.get(id);
}

export function buffsOfKind(kind: BuffKind): BuffDef[] {
  return BUFFS.filter((b) => b.kind === kind);
}

/** What a caster would usually have up, as a sensible starting tick set. */
export const DEFAULT_BUFFS = [
  'arcane-intellect',
  'mark-of-the-wild',
  'power-word-fortitude',
  'divine-spirit',
];

export const DEFAULT_CONSUMABLES = ['flask-of-supreme-power', 'brilliant-wizard-oil'];
