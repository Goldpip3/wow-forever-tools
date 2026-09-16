/**
 * A player sent over from the raid planner, and what the gear page may do with it.
 *
 * The link is untrusted like any other, so it is checked before anything reads it. Then it
 * is sorted, for the character that is loaded, into three lists: buffs this character's
 * kind of simulation reads, buffs the planner has that the simulator ticks but that do
 * nothing for this kind of character, and what the simulator does not model at all.
 *
 * Nothing is applied here. Talents are never applied at all: the sheet the addon exported
 * already reflects the talents the character has, and changing them while keeping that
 * sheet as the baseline would describe a character that does not exist.
 */

import { decompressFromEncodedURIComponent } from 'lz-string';
import { buffById, type BuffKind, type BuffRole } from './data/buffs';
import type { FightConfig } from './sim/types';
import { MAX_JSON_CHARS, MAX_LINK_CHARS, isRecord } from './validate';
import type { PlannerHandoff } from '../raid/handoff';

export type { PlannerHandoff };

const text = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max;
const texts = (v: unknown): v is string[] =>
  Array.isArray(v) && v.length <= 200 && v.every((s) => text(s, 100));

export function decodeHandoff(input: string): PlannerHandoff | null {
  const clean = (input ?? '').replace(/^#?h=/, '').trim();
  if (!clean || clean.length > MAX_LINK_CHARS) return null;
  let parsed: unknown;
  try {
    const json = decompressFromEncodedURIComponent(clean);
    if (!json || json.length > MAX_JSON_CHARS) return null;
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (!isRecord(parsed) || parsed.v !== 1) return null;
  if (!text(parsed.name, 100) || !text(parsed.classId, 20)) return null;
  if (typeof parsed.specId !== 'number' || !Number.isInteger(parsed.specId)) return null;
  if (typeof parsed.group !== 'number' || !Number.isInteger(parsed.group) || parsed.group < 1 || parsed.group > 8) return null;
  if (parsed.build !== undefined && !text(parsed.build, 200)) return null;
  if (!texts(parsed.simulated) || !texts(parsed.notSimulated)) return null;
  return parsed as unknown as PlannerHandoff;
}

export interface HandoffPlan {
  /** Buff ids to tick, by the fight list each belongs in. */
  apply: { buffs: string[]; debuffs: string[] };
  /** Names of simulated buffs that do nothing for this kind of character. */
  notForRole: string[];
  /** Names the simulator does not model, straight from the planner. */
  notSimulated: string[];
}

const LIST_FOR: Partial<Record<BuffKind, 'buffs' | 'debuffs'>> = { raid: 'buffs', debuff: 'debuffs' };

/** Sort a handoff's buffs for a character whose simulation reads `role` buffs. */
export function planHandoff(handoff: PlannerHandoff, role: BuffRole): HandoffPlan {
  const plan: HandoffPlan = { apply: { buffs: [], debuffs: [] }, notForRole: [], notSimulated: [...handoff.notSimulated] };
  for (const id of handoff.simulated) {
    const buff = buffById(id);
    const list = buff ? LIST_FOR[buff.kind] : undefined;
    if (!buff || !list) {
      plan.notSimulated.push(id);
      continue;
    }
    if (buff.roles && !buff.roles.includes(role)) plan.notForRole.push(buff.name);
    else plan.apply[list].push(id);
  }
  return plan;
}

/**
 * The fight with the planner's buffs and debuffs in place of the ones ticked now.
 * Consumables are the player's own choice and stay as they are.
 */
export function applyHandoff(fight: FightConfig, plan: HandoffPlan): FightConfig {
  return { ...fight, buffs: [...plan.apply.buffs], debuffs: [...plan.apply.debuffs] };
}
