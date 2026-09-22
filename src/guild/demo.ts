/**
 * The offline sample, at #demo.
 *
 * Roster mode has one for the same reason: the real page needs a Discord account, a
 * server the bot is in, and members who have filled anything in. None of that can be
 * arranged to look at the interface, and the browser tests run with the network shut off.
 *
 * Deliberately an awkward guild rather than a tidy one: two members have no professions
 * entered, one character has no spec, one has gear from an old export and the rest have
 * none, so every empty state on the page has something to draw.
 */

import type { Character, CharacterDetail, CharacterList, Gear } from './api';

const NOW = 1_790_000_000;
const DAY = 86_400;

const YOU = 'demo-you';

function character(over: Partial<Character> & Pick<Character, 'id' | 'name' | 'classKey'>): Character {
  return {
    userId: 'demo-' + over.id,
    displayName: 'Someone',
    ruleset: 'normal',
    specKey: null,
    roleKey: null,
    level: 60,
    isMain: false,
    professions: [],
    note: '',
    updatedBy: 'demo',
    updatedAt: NOW - 3 * DAY,
    hasGear: false,
    ...over,
  };
}

const CHARACTERS: Character[] = [
  character({
    id: 1,
    name: 'Thrallsbane',
    displayName: 'Ava',
    userId: YOU,
    classKey: 'warrior',
    specKey: 'prot_war',
    roleKey: 'tank',
    isMain: true,
    professions: [
      { key: 'mining', skill: 300 },
      { key: 'blacksmithing', skill: 295 },
      { key: 'first-aid', skill: 300 },
    ],
    note: 'Main tank. Has the Onyxia cloak.',
    hasGear: true,
    updatedAt: NOW - DAY,
  }),
  character({
    id: 2,
    name: 'Nimblefoot',
    displayName: 'Ava',
    userId: YOU,
    classKey: 'rogue',
    specKey: 'combat',
    roleKey: 'melee',
    professions: [{ key: 'engineering', skill: 300 }],
    note: 'Alt, geared enough for Molten Core trash.',
  }),
  character({
    id: 3,
    name: 'Brightwell',
    displayName: 'Rowan',
    classKey: 'priest',
    specKey: 'holy_priest',
    roleKey: 'healer',
    isMain: true,
    // No enchanter anywhere in the sample, on purpose: a profession nobody has is
    // the thing the leader's panel exists to point at.
    professions: [{ key: 'tailoring', skill: 300 }],
    hasGear: true,
  }),
  character({
    id: 4,
    name: 'Stormcaller',
    displayName: 'Kit',
    classKey: 'shaman',
    specKey: 'resto_sham',
    roleKey: 'healer',
    isMain: true,
    professions: [{ key: 'alchemy', skill: 300 }],
    note: 'Flasks on request, give a day’s notice.',
  }),
  character({
    id: 5,
    name: 'Emberlyn',
    displayName: 'Kit',
    classKey: 'mage',
    specKey: 'frost',
    roleKey: 'ranged',
    professions: [{ key: 'cooking', skill: 225 }],
  }),
  character({
    id: 6,
    name: 'Gravemourn',
    displayName: 'Sol',
    classKey: 'warlock',
    specKey: 'affli',
    roleKey: 'ranged',
    isMain: true,
    // Nothing entered: the profession panel has to say so rather than look broken.
    professions: [],
  }),
  character({
    id: 7,
    name: 'Ironbark',
    displayName: 'Wren',
    classKey: 'druid',
    specKey: 'guardian',
    roleKey: 'tank',
    isMain: true,
    professions: [
      { key: 'herbalism', skill: 300 },
      { key: 'leatherworking', skill: 300 },
    ],
  }),
  character({
    id: 8,
    name: 'Quickshot',
    displayName: 'Wren',
    classKey: 'hunter',
    specKey: 'mm',
    roleKey: 'ranged',
    professions: [{ key: 'skinning', skill: 300 }],
  }),
  character({
    id: 9,
    name: 'Dawnhammer',
    displayName: 'Bel',
    classKey: 'paladin',
    // No spec chosen, which the list has to render without a gap where a name goes.
    specKey: null,
    isMain: true,
    professions: [{ key: 'fishing', skill: 150 }],
    level: 58,
  }),
  character({
    id: 10,
    name: 'Zoë',
    displayName: 'Mir',
    classKey: 'priest',
    specKey: 'shadow',
    roleKey: 'ranged',
    isMain: true,
    professions: [],
    level: 47,
    note: 'Levelling. Not ready for raids yet.',
  }),
];

/** One old export, so the gear panel and its "this is not current" note both show. */
const GEAR: Record<number, Gear> = {
  1: {
    addonVersion: '1.1.0',
    generatedAt: NOW - 12 * DAY,
    race: 'Orc',
    level: 60,
    stats: { strength: 219, agility: 121, stamina: 340, armor: 6220 },
    equipped: {
      head: { id: 12640, name: 'Lionheart Helm', equipLoc: 'INVTYPE_HEAD', quality: 4, ilvl: 63, icon: 'inv_helmet_21', stats: { strength: 18, agility: 16 }, location: { where: 'equipped' } },
      neck: { id: 18404, name: 'Onyxia Tooth Pendant', equipLoc: 'INVTYPE_NECK', quality: 3, ilvl: 62, icon: 'inv_jewelry_necklace_13', stats: { agility: 12, stamina: 12 }, location: { where: 'equipped' } },
      shoulder: { id: 16963, name: 'Bloodfang Spaulders', equipLoc: 'INVTYPE_SHOULDER', quality: 4, ilvl: 76, icon: 'inv_shoulder_15', stats: { agility: 23, stamina: 20 }, location: { where: 'equipped' } },
      back: { id: 18541, name: 'Puissant Cape', equipLoc: 'INVTYPE_CLOAK', quality: 3, ilvl: 63, icon: 'inv_misc_cape_11', stats: { stamina: 14 }, location: { where: 'equipped' } },
      chest: { id: 16966, name: 'Bloodfang Chestpiece', equipLoc: 'INVTYPE_CHEST', quality: 4, ilvl: 76, icon: 'inv_chest_chain_15', stats: { agility: 28, stamina: 26 }, location: { where: 'equipped' } },
      wrist: { id: 19866, name: 'Wristguards of Stability', equipLoc: 'INVTYPE_WRIST', quality: 3, ilvl: 63, icon: 'inv_bracer_09', stats: { strength: 24 }, location: { where: 'equipped' } },
      hands: { id: 16965, name: 'Bloodfang Gloves', equipLoc: 'INVTYPE_HAND', quality: 4, ilvl: 76, icon: 'inv_gauntlets_23', stats: { agility: 21, stamina: 18 }, location: { where: 'equipped' } },
      waist: { id: 19137, name: 'Onslaught Girdle', equipLoc: 'INVTYPE_WAIST', quality: 4, ilvl: 71, icon: 'inv_belt_27', stats: { strength: 31, stamina: 11 }, location: { where: 'equipped' } },
      legs: { id: 16962, name: 'Bloodfang Pants', equipLoc: 'INVTYPE_LEGS', quality: 4, ilvl: 76, icon: 'inv_pants_08', stats: { agility: 30, stamina: 28 }, location: { where: 'equipped' } },
      feet: { id: 16965, name: 'Chromatic Boots', equipLoc: 'INVTYPE_FEET', quality: 4, ilvl: 71, icon: 'inv_boots_plate_05', stats: { strength: 20, stamina: 20 }, location: { where: 'equipped' } },
      finger1: { id: 17063, name: 'Band of Accuria', equipLoc: 'INVTYPE_FINGER', quality: 4, ilvl: 75, icon: 'inv_jewelry_ring_16', stats: { strength: 16 }, location: { where: 'equipped' } },
      trinket1: { id: 12930, name: 'Briarwood Reed', equipLoc: 'INVTYPE_TRINKET', quality: 3, ilvl: 60, icon: 'inv_misc_branch_01', stats: {}, location: { where: 'equipped' } },
      mainhand: { id: 17182, name: 'Sulfuras, Hand of Ragnaros', equipLoc: 'INVTYPE_2HWEAPON', quality: 5, ilvl: 80, icon: 'inv_hammer_unique_sulfuras', stats: { strength: 30, stamina: 30 }, weapon: { min: 223, max: 372, speed: 3.7, type: 'Mace', hands: 'two' }, location: { where: 'equipped' } },
      // finger2, offhand and ranged are deliberately missing, so the empty squares draw.
    },
    talents: [],
  },
  3: {
    addonVersion: '1.0.0',
    generatedAt: NOW - 40 * DAY,
    race: 'Human',
    level: 60,
    stats: { intellect: 240, spirit: 180, stamina: 190 },
    equipped: {
      head: { id: 16919, name: 'Robes of Transcendence', equipLoc: 'INVTYPE_CHEST', quality: 4, ilvl: 76, icon: 'inv_chest_cloth_38', stats: { intellect: 30 }, location: { where: 'equipped' } },
      mainhand: { id: 17103, name: 'Aurastone Hammer', equipLoc: 'INVTYPE_WEAPON', quality: 4, ilvl: 71, icon: 'inv_hammer_10', stats: { intellect: 12 }, weapon: { min: 61, max: 114, speed: 2.9, type: 'Mace', hands: 'main' }, location: { where: 'equipped' } },
    },
    talents: [],
  },
};

export function demoList(): CharacterList {
  return {
    guild: { id: 'demo', name: 'The Sample Guild' },
    you: { userId: YOU, isOfficer: true, isLeader: true },
    /* Two raiders in the sample have filed nothing, so the leader's panel has
       something to report rather than drawing an empty success state. */
    missing: {
      configured: true,
      raiders: 8,
      without: [
        { userId: 'demo-11', displayName: 'Fen' },
        { userId: 'demo-12', displayName: 'Quill' },
      ],
    },
    characters: CHARACTERS.map((c) => ({ ...c })),
  };
}

export function demoCharacter(id: number): CharacterDetail | null {
  const character = CHARACTERS.find((c) => c.id === id);
  if (!character) return null;
  return {
    character: { ...character },
    gear: GEAR[id] ? { ...GEAR[id] } : null,
    // Ava has raided; most of the sample has not, so the panel shows both states.
    attendance:
      character.userId === YOU
        ? { events: 14, present: 12, late: 1, absent: 1, last: NOW - 4 * DAY }
        : { events: 0, present: 0, late: 0, absent: 0, last: null },
    // Everything is editable in the sample, and nothing is ever sent.
    permissions: { canEdit: true },
  };
}
