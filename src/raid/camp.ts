/**
 * Camp objects: what professions put down at a campfire, and which class buff each stands in for.
 *
 * Forever's camping system lets anyone sitting at a fire for a minute pick up an hour-long buff
 * from every object placed there. Blizzard says the buffs "are variants of buffs normally
 * provided by specific classes and are exclusive with them", so a camp only helps where the raid
 * is missing that class buff, and adds nothing where somebody already brings it.
 *
 * These are not `Effect`s. Nobody seated provides them, and everything that reads an effect's
 * providers assumes a class. The engine reads this list on its own instead.
 *
 * The text on each object is Blizzard's, word for word, from the post named in CAMP_SOURCE: it
 * is the only game text there is for them so far. The Lodestone is not in that post, so it has
 * no text and its numbers are labelled as read off the beta client by fan sites.
 */

import type { Coverage, EffectCoverage, Roster } from './types';
import { PROFESSIONS, type ProfessionKey } from '../guild/professions';
import { readJson, writeJson, KEY_CAMP_PREFIX } from '../shared/storage';

export type CampObjectId =
  | 'first-aid-kit'
  | 'fishing-bowl'
  | 'mana-well'
  | 'sharpening-wheel'
  | 'enchanted-lute'
  | 'incense-candle'
  | 'camp-chair'
  | 'faction-banner'
  | 'lodestone'
  | 'camp-tent'
  | 'reagent-bot';

export interface CampObject {
  id: CampObjectId;
  name: string;
  profession: ProfessionKey;
  /** Profession skill the object is learned at. */
  skill: number;
  icon: string;
  /** Blizzard's recipe text, word for word. Null where Blizzard has not published any. */
  text: string | null;
  /** The planner effect it is exclusive with. Null where no class buff does the same thing. */
  replaces: string | null;
  /**
   * The planner's buff categories this object raises, for ranking which objects help a raid
   * most. The Camp Chair's crit covers attacks as well as spells, which Moonkin Aura does not,
   * so this is the object's own list rather than its class buff's.
   */
  raises: string[];
  /**
   * Other planner effects that make this object pointless when a player brings one. The Camp
   * Chair replaces Moonkin Aura, and Leader of the Pack is the same 3% aura, so a Feral Druid
   * leaves the chair nothing to do.
   */
  blockedBy?: string[];
  /** A figure fan sites read off the beta client. Always shown as not verified. */
  estimate?: { text: string; source: string };
}

export const CAMP_SOURCE = {
  label: 'Blizzard, "Gather Around the Campfire in World of Warcraft: Forever", 21 October 2026',
  url: 'https://worldofwarcraft.blizzard.com/en-us/news/24301516',
};

/** Blizzard's sentence on how camp buffs and class buffs combine, quoted as it stands. */
export const CAMP_EXCLUSIVE_QUOTE =
  'These effects are variants of buffs normally provided by specific classes and are exclusive with them.';

/** Objects a Basic Campfire holds. Cooks learn fires for five and ten. */
export const BASIC_CAMPFIRE_SLOTS = 3;
export const UPGRADED_CAMPFIRE_SLOTS = [5, 10] as const;

const icon = (key: ProfessionKey) => PROFESSIONS[key].icon;

export const CAMP_OBJECTS: readonly CampObject[] = [
  {
    id: 'first-aid-kit',
    name: 'First Aid Kit',
    profession: 'first-aid',
    skill: 20,
    icon: icon('first-aid'),
    text:
      'Unpacks a First Aid Kit that allows you and others sitting nearby to gain 3-56 increased ' +
      'Stamina (level dependent), exclusive with Power Word: Fortitude.',
    replaces: 'power-word-fortitude',
    raises: ['stamina'],
  },
  {
    id: 'fishing-bowl',
    name: 'Fishing Bowl',
    profession: 'fishing',
    skill: 20,
    icon: icon('fishing'),
    text:
      'Places a small Fishing Bowl that allows you and others sitting nearby to gain 8% ' +
      'increased stats, exclusive with Blessing of Kings.',
    replaces: 'blessing-of-kings',
    raises: ['all-stats'],
  },
  {
    id: 'mana-well',
    name: 'Mana Well',
    profession: 'alchemy',
    skill: 20,
    icon: icon('alchemy'),
    text:
      'Constructs a Mana Well that allows you and others sitting nearby to regenerate 10-29 Mana ' +
      'every 5 seconds (level dependent), mutually exclusive with Blessing of Wisdom.',
    replaces: 'blessing-of-wisdom',
    raises: ['mana-regen'],
  },
  {
    id: 'sharpening-wheel',
    name: 'Sharpening Wheel',
    profession: 'blacksmithing',
    skill: 20,
    icon: icon('blacksmithing'),
    text:
      'Constructs a Sharpening Wheel that grants you and others sitting nearby 6-34 increased ' +
      'Strength (level dependent), mutually exclusive with Strength of Earth Totem.',
    replaces: 'strength-of-earth-totem',
    raises: ['strength'],
  },
  {
    id: 'enchanted-lute',
    name: 'Enchanted Lute',
    profession: 'enchanting',
    skill: 20,
    icon: icon('enchanting'),
    text:
      'Summons an Enchanted Lute that allows you and others sitting nearby to gain 28-260 Armor, ' +
      '0-13 increase to all stats, and 0-22 increase to all resistances (level dependent), ' +
      'mutually exclusive with Mark of the Wild.',
    replaces: 'mark-of-the-wild',
    // Its 0-13 to all stats is small next to Kings' 8%, so it ranks on its armor.
    raises: ['armor'],
    estimate: { text: '308 Armor at level 60', source: 'endgametools.com, from the beta client' },
  },
  {
    id: 'incense-candle',
    name: 'Incense Candle',
    profession: 'herbalism',
    skill: 20,
    icon: icon('herbalism'),
    text:
      'Ignites an Incense Candle that allows you and others sitting nearby to gain 2-25 increased ' +
      'Intellect (level dependent), mutually exclusive with Arcane Intellect.',
    replaces: 'arcane-intellect',
    raises: ['intellect'],
  },
  {
    id: 'camp-chair',
    name: 'Camp Chair',
    profession: 'skinning',
    skill: 20,
    icon: icon('skinning'),
    text:
      'Assembles a Camp Chair that allows you and others sitting nearby to gain 2% increased ' +
      'critical strike chance with all spells and attacks, exclusive with Moonkin Aura.',
    replaces: 'moonkin-form',
    blockedBy: ['leader-of-the-pack'],
    raises: ['spell-crit', 'melee-and-ranged-crit'],
  },
  {
    id: 'faction-banner',
    name: 'Faction Banner',
    profession: 'tailoring',
    skill: 20,
    icon: icon('tailoring'),
    text:
      'Unrolls a Faction Banner that allows you and other members of your faction sitting nearby ' +
      'to gain 14-32 increased Spirit (level dependent), mutually exclusive with Divine Spirit.',
    replaces: 'divine-spirit',
    raises: ['spirit'],
  },
  {
    id: 'lodestone',
    name: 'Lodestone',
    profession: 'mining',
    skill: 20,
    icon: icon('mining'),
    text: null,
    replaces: 'blessing-of-might',
    raises: ['melee-attack-power'],
    estimate: {
      text: '12 to 90 melee attack power by level, 90 from level 52, exclusive with Blessing of Might',
      source: 'endgametools.com and wowhandbook.com, from the beta client',
    },
  },
  {
    id: 'camp-tent',
    name: 'Camp Tent',
    profession: 'leatherworking',
    skill: 20,
    icon: icon('leatherworking'),
    text:
      'Builds a Camp Tent that allows you and others sitting nearby to increase Rested experience ' +
      'by 5% of a level. No effect if Rested experience already exceeds that value.',
    replaces: null,
    raises: [],
  },
  {
    id: 'reagent-bot',
    name: 'Reagent Bot',
    profession: 'engineering',
    skill: 20,
    icon: icon('engineering'),
    text: 'Summons a Reagent Bot that allows you and others nearby to purchase reagents.',
    replaces: null,
    raises: [],
  },
];

const BY_ID = new Map<string, CampObject>(CAMP_OBJECTS.map((o) => [o.id, o]));
const BY_EFFECT = new Map<string, CampObject>(
  CAMP_OBJECTS.filter((o) => o.replaces).map((o) => [o.replaces as string, o]),
);

export function campObjectById(id: string): CampObject | undefined {
  return BY_ID.get(id);
}

/** The camp object that stands in for this planner effect, if there is one. */
export function campObjectFor(effectId: string): CampObject | undefined {
  return BY_EFFECT.get(effectId);
}

export function isCampObjectId(id: unknown): id is CampObjectId {
  return typeof id === 'string' && BY_ID.has(id);
}

/** Picks that exist, once each, in catalog order. Anything else is dropped. */
export function cleanCampPicks(ids: readonly unknown[] | null | undefined): CampObjectId[] {
  const wanted = new Set((ids ?? []).filter(isCampObjectId));
  return CAMP_OBJECTS.filter((o) => wanted.has(o.id)).map((o) => o.id);
}

/** "A Fishing Bowl", "An Enchanted Lute". */
export function withArticle(name: string): string {
  return (/^[AEIOU]/i.test(name) ? 'An ' : 'A ') + name;
}

/** "Enchanting 20". */
export function campSkillLabel(object: CampObject): string {
  return PROFESSIONS[object.profession].name + ' ' + object.skill;
}

export interface CampSuggestion {
  object: CampObject;
  effect: EffectCoverage;
  /** 'missing': nobody here can bring it. 'available': somebody could, and is set to something else. */
  state: 'missing' | 'available';
}

/** Class buffs nobody brings that a camp object could stand in for, in catalog order. */
export function campSuggestions(coverage: Coverage): CampSuggestion[] {
  const out: CampSuggestion[] = [];
  for (const object of CAMP_OBJECTS) {
    if (!object.replaces) continue;
    const cov = coverage.byEffect.get(object.replaces);
    if (!cov || cov.covered) continue;
    out.push({ object, effect: cov, state: cov.possibleBy.length ? 'available' : 'missing' });
  }
  return out;
}

/** What each ticked object does for this raid. */
export function campStates(
  roster: Roster,
  coverage: Coverage,
): Array<{ object: CampObject; state: 'covers' | 'wasted' | 'other' }> {
  return cleanCampPicks(roster.settings.camp).map((id) => {
    const object = campObjectById(id)!;
    const cov = object.replaces ? coverage.byEffect.get(object.replaces) : undefined;
    const state = cov?.campObject === id ? 'covers' : cov?.campWasted === id ? 'wasted' : 'other';
    return { object, state };
  });
}

/* ------------------------------------------------------- roster mode, on this device */

/*
 * The bot has no field for camp picks, so in roster mode they stay in this browser, one list
 * per event. The demo never reads or writes: its picks live only as long as the page.
 */

export function readCampPicks(eventId: string): CampObjectId[] {
  if (!eventId || eventId === 'demo') return [];
  return cleanCampPicks(readJson<unknown[]>(KEY_CAMP_PREFIX + eventId, []));
}

export function writeCampPicks(eventId: string, picks: readonly string[]): boolean {
  if (!eventId || eventId === 'demo') return false;
  return writeJson(KEY_CAMP_PREFIX + eventId, cleanCampPicks(picks));
}
