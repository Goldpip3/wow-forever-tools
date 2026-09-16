/**
 * What a trinket does when you press it, and what a weapon does when it lands.
 *
 * Two sources, in that order. A catalogue keyed by item id, which is where a
 * confirmed Forever effect goes and which ships empty because Forever has
 * confirmed none. And the text the addon scanned off your own tooltip, which is
 * real data from your own game rather than a guess, read here with a handful of
 * patterns.
 *
 * Anything neither one recognises is not silently ignored. It comes back as an
 * unknown line, the run turns it into a note naming the item, and the damage
 * figure is honestly short rather than quietly wrong.
 */

import type { School, StatBlock } from '../export-format';
import type { ForeverStatus } from '../../raid/types';
import type { ItemRef } from '../export-format';
import { TRINKET_COOLDOWN } from './combat-constants';

/** What sets a proc off. */
export type Trigger = 'melee-hit' | 'melee-crit' | 'spell-hit' | 'any-damage';

export interface EffectAura {
  id: string;
  /** Seconds. */
  duration: number;
  /** Stats it adds while it is up. */
  stats?: StatBlock;
  /** Damage it deals instead, for a weapon that blasts what it hits. */
  damage?: { school: School; min: number; max: number };
}

export type ItemEffect =
  | {
      kind: 'proc';
      trigger: Trigger;
      /** A flat chance per landing, from nought to one. */
      chance?: number;
      /** Or a rate per minute, which is scaled by the weapon's speed. */
      ppm?: number;
      /** Seconds it cannot fire again for. */
      icd?: number;
      aura: EffectAura;
    }
  | { kind: 'use'; cooldown: number; shareGroup?: 'trinket'; aura: EffectAura }
  | { kind: 'extra-attacks'; trigger: 'melee-hit'; chance?: number; ppm?: number; count: number };

export interface EffectDef {
  effects: ItemEffect[];
  forever: { status: ForeverStatus; note?: string };
}

/**
 * Effects confirmed for a Forever item, by item id.
 *
 * Empty on purpose. Forever has published no item list, and a guessed one would
 * be worse than none: a trinket modelled at the wrong numbers moves every gear
 * comparison that includes it. When the real list exists, entries go here and
 * they take precedence over anything read off a tooltip.
 */
export const ITEM_EFFECTS: Record<number, EffectDef> = {};

/* ----------------------------------------------------------------- reading */

/** A stat name as a tooltip writes it, and the key the site keeps it under. */
const STAT_WORDS: Array<[RegExp, keyof StatBlock]> = [
  [/attack power/i, 'attackPower'],
  [/strength/i, 'strength'],
  [/agility/i, 'agility'],
  [/intellect/i, 'intellect'],
  [/spirit/i, 'spirit'],
  [/stamina/i, 'stamina'],
  [/haste|attack speed/i, 'haste'],
];

function statFromWords(words: string, amount: number): StatBlock | null {
  for (const [pattern, key] of STAT_WORDS) {
    if (pattern.test(words)) return { [key]: amount };
  }
  return null;
}

const SCHOOL_WORDS: Record<string, School> = {
  fire: 'fire', frost: 'frost', nature: 'nature', shadow: 'shadow',
  arcane: 'arcane', holy: 'holy',
};

let auraSeq = 0;
const auraId = (item: ItemRef, what: string) => {
  auraSeq += 1;
  return 'item-' + item.id + '-' + what + '-' + auraSeq;
};

/**
 * One tooltip line, read as far as it can be.
 *
 * The patterns are deliberately narrow. A line that nearly matches is better
 * reported as unknown than guessed at, because a wrong number here is invisible
 * and a missing one is in the notes.
 */
function readLine(item: ItemRef, line: string): ItemEffect | null {
  // Use: Increases attack power by 300 for 20 sec.
  const useStat = /^Use:.*?\bby (?:up to )?(\d+)\b.*?for (\d+) sec/i.exec(line);
  if (useStat) {
    const amount = Number(useStat[1]);
    const duration = Number(useStat[2]);
    const spell = /spell|magical|damage done by/i.test(line)
      ? ({ spellPower: amount } as StatBlock)
      : statFromWords(line, amount);
    if (spell) {
      return {
        kind: 'use',
        cooldown: TRINKET_COOLDOWN.value,
        shareGroup: 'trinket',
        aura: { id: auraId(item, 'use'), duration, stats: spell },
      };
    }
  }

  // Chance on hit: Increases attack power by 250 for 10 sec.
  const procStat = /^(?:Equip: )?Chance on hit:.*?\bby (?:up to )?(\d+)\b.*?for (\d+) sec/i.exec(line);
  if (procStat) {
    const stats = statFromWords(line, Number(procStat[1]));
    if (stats) {
      return {
        kind: 'proc',
        trigger: 'melee-hit',
        ppm: 1,
        aura: { id: auraId(item, 'proc'), duration: Number(procStat[2]), stats },
      };
    }
  }

  // Chance on hit: Blasts the target for 40 to 60 Fire damage.
  const procDamage = /^(?:Equip: )?Chance on hit:.*?(\d+) to (\d+) (\w+) damage/i.exec(line);
  if (procDamage) {
    const school = SCHOOL_WORDS[procDamage[3]!.toLowerCase()];
    if (school) {
      return {
        kind: 'proc',
        trigger: 'melee-hit',
        ppm: 1,
        aura: {
          id: auraId(item, 'blast'),
          duration: 0,
          damage: { school, min: Number(procDamage[1]), max: Number(procDamage[2]) },
        },
      };
    }
  }

  return null;
}

/** Lines the addon sends that are already stats, so nothing is missing. */
const ALREADY_COUNTED = /^Equip: (Increases|Improves|Restores|Increased)/i;

export interface ItemEffects {
  known: ItemEffect[];
  /** Lines nothing could be made of, which the run reports rather than drops. */
  unknown: string[];
}

export function effectsFor(item: ItemRef): ItemEffects {
  const catalogued = ITEM_EFFECTS[item.id];
  if (catalogued) return { known: catalogued.effects, unknown: [] };

  const known: ItemEffect[] = [];
  const unknown: string[] = [];

  for (const line of item.effects ?? []) {
    // A plain Equip line is already in the item's stats: the addon read it off
    // the same tooltip and turned it into numbers.
    if (ALREADY_COUNTED.test(line) && !/chance on hit/i.test(line)) continue;

    const effect = readLine(item, line);
    if (effect) known.push(effect);
    else unknown.push(line);
  }

  return { known, unknown };
}

/** Every effect on a set of worn items, with what could not be read. */
export function effectsForLoadout(items: ItemRef[]): {
  effects: Array<{ item: ItemRef; effect: ItemEffect }>;
  unknown: Array<{ item: ItemRef; line: string }>;
} {
  const effects: Array<{ item: ItemRef; effect: ItemEffect }> = [];
  const unknown: Array<{ item: ItemRef; line: string }> = [];

  for (const item of items) {
    const read = effectsFor(item);
    for (const effect of read.known) effects.push({ item, effect });
    for (const line of read.unknown) unknown.push({ item, line });
  }

  return { effects, unknown };
}
