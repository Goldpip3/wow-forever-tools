/**
 * A record of one fight, second by second.
 *
 * The thousand-run average says what your character is worth. It says nothing
 * about what actually happened: when the swings landed, how long the bar sat
 * empty, whether the cooldown you pressed at the start was ever up again. That
 * needs one fight rather than a thousand, written down as it went.
 *
 * Nothing is stored in a result. The seeds make a trace reproducible, so the
 * report panel picks the iteration whose damage came out closest to the middle
 * and runs that one again with a sink attached. The events it gets back are the
 * events the original run produced, because the dice were the same dice.
 */

import type { Outcome } from './types';

export type TraceKind =
  /** An ability was started and paid for. */
  | 'cast'
  /** A spell resolved. */
  | 'land'
  /** A weapon connected, or failed to. */
  | 'swing'
  | 'aura-on'
  | 'aura-off'
  /** What was in the bar at this moment. */
  | 'resource'
  /** A cooldown began, so the bar can show when it comes back. */
  | 'cooldown';

export interface TraceEvent {
  /** Seconds into the fight. */
  t: number;
  kind: TraceKind;
  id: string;
  /** Damage, for a land or a swing. */
  amount?: number;
  outcome?: Outcome;
  /** The level of a bar, or the seconds a cooldown will take. */
  value?: number;
  stacks?: number;
}

/**
 * Where trace events go. An array is the whole implementation; it is an
 * interface so the engine can be handed nothing and skip the work entirely.
 */
export interface TraceSink {
  push(event: TraceEvent): void;
}

export function collectTrace(): TraceEvent[] & TraceSink {
  return [] as TraceEvent[] & TraceSink;
}
