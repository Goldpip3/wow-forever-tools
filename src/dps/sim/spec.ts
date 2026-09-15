/**
 * What a spec has to provide for the engine to run it.
 *
 * The engine knows about casts, cooldowns, mana and rolls. It knows nothing
 * about Frostbolt. Everything class-shaped lives behind this interface, so
 * adding a spec means writing one file and registering it.
 */

import type { ForeverStatus } from '../../raid/types';
import type { School, StatKey } from '../export-format';
import type { Actor } from './actor';
import type { Rng } from './rng';
import type { Rotation } from './rotation';
import type { SpellDef, SpellMods, TalentHook } from './spells';
import type { Outcome, SimConfig, StatSheet } from './types';

/** A stat the weight pass will nudge, and how far to nudge it. */
export interface WeightStat {
  stat: StatKey;
  /** Points to add. Large enough to lift the answer out of the noise. */
  step: number;
}

export interface CastEvent {
  spellId: string;
  now: number;
  actor: Actor;
  rng: Rng;
  mods: SpellMods;
  stats: StatSheet;
}

export interface LandEvent extends CastEvent {
  school: School;
  outcome: Outcome;
  amount: number;
}

export interface CostEvent {
  spellId: string;
  baseCost: number;
  actor: Actor;
  now: number;
}

export interface CritEvent {
  spellId: string;
  school: School;
  actor: Actor;
  now: number;
  mods: SpellMods;
}

export interface ManaRegen {
  /** Mana every two seconds, once the five second rule has let go. */
  per2s: number;
  /** The share of that which keeps flowing while spending mana. */
  castingFraction: number;
}

export interface SpecModule {
  specId: number;
  /** For the rotation picker, e.g. 'Frost Mage'. */
  label: string;
  spells: SpellDef[];
  /** Keyed by the talent name exactly as the talent data spells it. */
  talentHooks: Record<string, TalentHook>;
  /** Named rotations, built once per run from the character's talents. */
  rotations: Record<string, (talents: Record<string, number>) => Rotation>;
  /** Plain labels for the rotation picker. */
  rotationLabels?: Record<string, string>;
  weightStats: WeightStat[];
  /** The stat other weights are shown relative to. */
  referenceStat: StatKey;

  /** Mana coming back on its own. */
  manaRegen?(stats: StatSheet, mods: SpellMods): ManaRegen;

  /** Anything to set up at the start of a fight, such as a swing timer. */
  init?(actor: Actor, config: SimConfig, mods: SpellMods): void;

  /** What this cast actually costs, for a proc that makes one free. */
  costFor?(event: CostEvent): number;

  /** Extra percentage points of crit for this cast, from a debuff or a proc. */
  critBonusFor?(event: CritEvent): number;

  /** The moment a cast begins, after its mana was paid. Consume procs here. */
  onCastStart?(event: CastEvent): void;

  /** After any cast finishes, whether or not it dealt damage. */
  onCastFinish?(event: CastEvent): void;

  /** After a damaging spell resolves, for procs and stacking debuffs. */
  onLand?(event: LandEvent): void;

  forever: { status: ForeverStatus; note?: string };
  /** Anything the reader should know about this spec's model in particular. */
  notes?: string[];
}
