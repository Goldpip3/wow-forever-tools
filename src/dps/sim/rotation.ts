/**
 * What the player does next.
 *
 * A rotation is a function the engine calls whenever the character is free. It
 * gets a read-only view of the fight and returns one action, which keeps the
 * decision in the spec module and the timing in the engine.
 */

import type { Actor } from './actor';
import type { Rng } from './rng';
import type { FightConfig, Hand } from './types';

export interface RotationCtx {
  now: number;
  /** Seconds left in the fight, so a rotation can decline to start a long cast. */
  timeLeft: number;
  actor: Actor;
  fight: FightConfig;
  rng: Rng;
  /** What is in each bar right now. */
  rage: number;
  energy: number;
  comboPoints: number;
  /** Share of its mana the character still has, from nought to one. */
  manaPct: number;
  /**
   * The boss's health, as a share. The model has it falling evenly over the
   * fight, which is the only honest thing to do without a health number.
   */
  targetHealthPct: number;
  /** How many things are standing there. */
  targets: number;
  /** An aura on the character. */
  has(id: string): boolean;
  stacks(id: string): number;
  remaining(id: string): number;
  /** An aura on the boss. */
  onTarget(id: string): boolean;
  targetStacks(id: string): number;
  remainingOnTarget(id: string): number;
  /** Seconds until that hand comes round, or Infinity when it holds nothing. */
  swingIn(hand: Hand): number;
  /** Whether an ability is already waiting on the next swing of that hand. */
  queued(hand: Hand): boolean;
  /** Whether an ability's own cooldown is up, and whether it can be paid for. */
  ready(spellId: string): boolean;
  canAfford(spellId: string): boolean;
  /** Seconds until that cooldown is up, zero when it already is. */
  cooldownLeft(spellId: string): number;
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
  /** The condition in words, for the rotation the fight panel shows. */
  text?: string;
}

/**
 * The common shape: walk a list top to bottom and cast the first thing that is
 * off cooldown, affordable and allowed.
 */
/** A rotation as it is written down, rather than as it is compiled. */
export interface RotationLine {
  spellId: string;
  /** A condition in the small language, or nothing for always. */
  text?: string;
}

/** A spec's own rotation written out, which is what the editor starts from. */
export function linesOf(entries: PriorityEntry[]): RotationLine[] {
  return entries.map((entry) => (
    entry.text ? { spellId: entry.spellId, text: entry.text } : { spellId: entry.spellId }
  ));
}

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
