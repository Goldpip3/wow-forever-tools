/**
 * What the player does next.
 *
 * A rotation is a function the engine calls whenever the character is free. It
 * gets a read-only view of the fight and returns one action, which keeps the
 * decision in the spec module and the timing in the engine.
 */

import type { Actor } from './actor';
import type { Rng } from './rng';
import type { FightConfig } from './types';

export interface RotationCtx {
  now: number;
  /** Seconds left in the fight, so a rotation can decline to start a long cast. */
  timeLeft: number;
  actor: Actor;
  fight: FightConfig;
  rng: Rng;
  /** An aura on the character. */
  has(id: string): boolean;
  stacks(id: string): number;
  /** An aura on the boss. */
  onTarget(id: string): boolean;
  targetStacks(id: string): number;
  remainingOnTarget(id: string): number;
  /** Whether a spell's own cooldown is up, and whether the mana is there. */
  ready(spellId: string): boolean;
  canAfford(spellId: string): boolean;
}

export type Action =
  | { kind: 'cast'; spellId: string }
  /** Nothing useful right now; look again at this time. */
  | { kind: 'wait'; until: number };

export type Rotation = (ctx: RotationCtx) => Action | null;

/** One line of a priority list: cast this, when the condition allows. */
export interface PriorityEntry {
  spellId: string;
  when?: (ctx: RotationCtx) => boolean;
}

/**
 * The common shape: walk a list top to bottom and cast the first thing that is
 * off cooldown, affordable and allowed.
 */
export function priorityRotation(entries: PriorityEntry[]): Rotation {
  return (ctx) => {
    for (const entry of entries) {
      if (!ctx.ready(entry.spellId)) continue;
      if (!ctx.canAfford(entry.spellId)) continue;
      if (entry.when && !entry.when(ctx)) continue;
      return { kind: 'cast', spellId: entry.spellId };
    }
    return null;
  };
}
