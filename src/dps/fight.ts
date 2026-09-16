/**
 * The fight the gear page starts with, and how a fight read from elsewhere is brought up
 * to date.
 *
 * Kept apart from the page so neither has a dead zone to trip over at startup, and so the
 * migration can be tested on its own. Migration only ever sees a fight that already passed
 * isFightShape: it fills in what an older fight predates and pulls numbers back inside what
 * the panel allows. It never has to guess at a wrong-shaped one.
 */

import { DEFAULT_BUFFS, DEFAULT_CONSUMABLES, buffById } from './data/buffs';
import type { FightConfig } from './sim/types';

/** Bumped when the shape of a fight changes in a way migrateFight has to know. */
export const FIGHT_VERSION = 2;

/** The limits the fight panel keeps to. */
export const FIGHT_LIMITS = { duration: [10, 1800], iterations: [1, 20000] } as const;

export function defaultFight(): FightConfig {
  return {
    v: FIGHT_VERSION,
    style: { kind: 'patchwerk' },
    duration: 300,
    iterations: 1000,
    seed: 20260915,
    target: { level: 63, armor: 0, resistance: 0, behind: true, canParry: false, canBlock: false },
    buffs: [...DEFAULT_BUFFS],
    debuffs: [],
    consumables: [...DEFAULT_CONSUMABLES],
  };
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(min, Math.min(max, Math.round(value)))
    : fallback;
}

/**
 * Reads a fight that was written down earlier, whether in a link or in this browser's
 * preferences. Anything the shape has gained since is filled in from the defaults rather
 * than arriving undefined.
 */
export function migrateFight(saved: Partial<FightConfig> | undefined): FightConfig {
  const base = defaultFight();
  if (!saved) return base;
  const merged: FightConfig = { ...base, ...saved, target: { ...base.target, ...saved.target } };
  // The same limits the fight panel keeps to. A link or an old preference that asks for
  // a million runs would otherwise freeze the tab on the next press of Run.
  merged.duration = clampNumber(merged.duration, ...FIGHT_LIMITS.duration, base.duration);
  merged.iterations = clampNumber(merged.iterations, ...FIGHT_LIMITS.iterations, base.iterations);
  // A buff this version no longer has is dropped rather than carried as an unknown id.
  for (const key of ['buffs', 'debuffs', 'consumables'] as const) {
    merged[key] = merged[key].filter((id) => !!buffById(id));
  }
  // Debug hooks that pin outcomes. Nothing on the page sets them, so nothing read in may.
  delete merged.overrides;
  // A fight written before styles existed was a Patchwerk fight, because that
  // was the only thing the engine could do.
  if (!merged.style) merged.style = { kind: 'patchwerk' };
  merged.v = FIGHT_VERSION;
  return merged;
}
