import type { Effect } from './types';
import type { TalentData } from '../talents/types';
import { rankText } from '../talents/build';
import { CLASSES, type ClassId } from '../shared/classes';
import { classicTextFor } from './classic-text';

/**
 * The real in-game text for an effect, rather than a summary written here.
 *
 * Two sources, both already imported with the talent data:
 *   - talents[Class].trees[].talents[]  for anything behind a talent
 *   - spell_desc['Class|Spell|Rank']    for anything off the spellbook
 *
 * Each spell_desc entry carries the Forever text in `d`, the Classic text in `cd`
 * when the two differ, the cost and cast lines in `l`, and where it was read from
 * in `src`. Nothing is paraphrased on the way through.
 */

export interface SpellText {
  /** Cost, range, cast time: the grey lines under the name in game. */
  lines: Array<[string, string]>;
  /** The tooltip body as the game words it. */
  text: string;
  /** The Classic wording, when Forever changed it. */
  classic?: string;
  rank?: string;
  level?: string;
  /** 'demo' when read off BlizzCon footage, 'classic' when carried over. */
  source?: string;
}

interface SpellDescEntry {
  l?: Array<[string, string]>;
  d?: string;
  cd?: string;
  cs?: string;
  r?: string;
  lv?: string;
  s?: string;
  src?: string;
}

let bySpell = new Map<string, SpellDescEntry>();
let byTalent = new Map<string, { text: string; classic?: string; estimated: boolean }>();
let ready = false;

/** Highest rank wins, so a tooltip shows the values a level 60 actually has. */
function rankNumber(key: string): number {
  const m = /Rank (\d+)/.exec(key);
  return m ? Number(m[1]) : 0;
}

export function initSpellText(data: TalentData): void {
  bySpell = new Map();
  byTalent = new Map();

  for (const [key, value] of Object.entries(data.spell_desc ?? {})) {
    const parts = key.split('|');
    if (parts.length < 2) continue;
    const index = parts[0] + '|' + parts[1];
    const existing = bySpell.get(index);
    if (!existing || rankNumber(key) >= rankNumber(index)) {
      bySpell.set(index, value as SpellDescEntry);
    }
  }

  for (const [className, cls] of Object.entries(data.talents ?? {})) {
    for (const tree of cls.trees ?? []) {
      for (const talent of tree.talents ?? []) {
        const top = rankText(talent, talent.max);
        byTalent.set(className + '|' + tree.name + '|' + talent.name, {
          text: top.text,
          classic: talent.classic?.status !== 'new' ? talent.classic?.text : undefined,
          estimated: top.estimated,
        });
      }
    }
  }

  ready = true;
}

export function spellTextReady(): boolean {
  return ready;
}

/** The game's own words for this effect, or null when the data has nothing. */
export function lookupEffectText(effect: Effect): SpellText | null {
  if (!ready) return null;

  // A talent says exactly which tree and name to look under.
  for (const provider of effect.providers) {
    if (!provider.talent) continue;
    const className = CLASSES[provider.classId as ClassId]?.name;
    if (!className) continue;
    const hit = byTalent.get(className + '|' + provider.talent.tree + '|' + provider.talent.name);
    if (hit?.text) {
      return {
        lines: [],
        text: hit.text,
        classic: hit.classic,
        source: hit.estimated ? 'estimated' : undefined,
      };
    }
  }

  // Otherwise match the effect name against that class's spellbook.
  for (const provider of effect.providers) {
    const className = CLASSES[provider.classId as ClassId]?.name;
    if (!className) continue;
    const entry = bySpell.get(className + '|' + effect.name);
    if (entry?.d) {
      return {
        lines: entry.l ?? [],
        text: entry.d,
        classic: entry.cs === 'changed' ? entry.cd : undefined,
        rank: entry.r || undefined,
        level: entry.lv || undefined,
        source: entry.s,
      };
    }
  }

  // Nothing in the Forever data: fall back to the Classic tooltip, and say so.
  const classic = classicTextFor(effect.id);
  if (classic) {
    return {
      lines: classic.lines ?? [],
      text: classic.text,
      rank: classic.rank,
      source: 'classic',
    };
  }

  return null;
}
