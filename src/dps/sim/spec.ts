/**
 * What a spec has to provide for the engine to run it.
 *
 * The engine knows about casts, swings, cooldowns, resources and rolls. It
 * knows nothing about Frostbolt or Bloodthirst. Everything class-shaped lives
 * behind this interface, so adding a spec means writing one file and
 * registering it.
 */

import type { ForeverStatus } from '../../raid/types';
import type { BuffRole } from '../data/buffs';
import type { School, StatKey } from '../export-format';
import type { Actor } from './actor';
import type { Rng } from './rng';
import type { PriorityEntry } from './rotation';
import type { ResourceKind, SpellDef, SpellMods, TalentHook } from './spells';
import type { Hand, Outcome, SimConfig, StatSheet, WeaponStats } from './types';

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
  /**
   * Resolve this spell a second time at a share of its damage, rolled on its
   * own. Lightning Overload is why it exists. Only offered for spells.
   */
  echo?(multiplier: number): void;
}

/** A weapon coming round, or an aimed strike resolving against one. */
export interface SwingEvent extends LandEvent {
  hand: Hand;
  /** True for a swing that arrived on its own rather than one you pressed. */
  white: boolean;
  weapon: WeaponStats;
  /**
   * Start a bleed from this strike. Deep Wounds is why it exists: a talent can
   * put damage over time on the target without any ability declaring it.
   */
  bleed(id: string, total: number, ticks: number, interval: number): void;
  /**
   * Take one more main-hand swing now, with some attack power on top for that
   * swing alone. Windfury is why the bonus exists; a sword proc passes nothing.
   */
  extraAttack(bonusAttackPower?: number, id?: string): void;
  /**
   * Deal damage that rides on this swing without being a swing, such as Seal
   * of Command. It rolls its own critical strike and is billed to its own row.
   */
  procDamage(id: string, amount: number, school: School): void;
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

export interface ResourceTickEvent {
  kind: ResourceKind;
  actor: Actor;
  now: number;
  /** The dice, for anything on the heartbeat that fires on a chance. */
  rng: Rng;
  mods: SpellMods;
}

export interface ManaRegen {
  /** Mana every two seconds, once the five second rule has let go. */
  per2s: number;
  /** The share of that which keeps flowing while spending mana. */
  castingFraction: number;
}

/** A stance or a form: a damage profile the character chooses before the pull. */
export interface StanceOption {
  id: string;
  label: string;
  mods: (mods: SpellMods) => void;
}

export interface SpecModule {
  specId: number;
  /** For the rotation picker, e.g. 'Frost Mage'. */
  label: string;
  spells: SpellDef[];
  /** Which bar this spec pays out of. Mana unless it says otherwise. */
  resource?: ResourceKind;
  /** Which half of the buff list is worth offering in the fight settings. */
  buffRole?: BuffRole;
  /** Keyed by the talent name exactly as the talent data spells it. */
  talentHooks: Record<string, TalentHook>;
  /**
   * Named rotations, as priority lists. The engine compiles them once per run,
   * which is also what lets the fight panel show one and let it be edited: the
   * list is the rotation, rather than a closure nobody can read.
   */
  rotations: Record<string, (talents: Record<string, number>) => PriorityEntry[]>;
  /** Plain labels for the rotation picker. */
  rotationLabels?: Record<string, string>;
  weightStats: WeightStat[];
  /** The stat other weights are shown relative to. */
  referenceStat: StatKey;
  /** Stances the fight settings can pick between, when the spec has any. */
  stance?: { label: string; options: StanceOption[] };

  /** Mana coming back on its own. */
  manaRegen?(stats: StatSheet, mods: SpellMods): ManaRegen;

  /**
   * Mods that come from the fight settings rather than from the talent tree,
   * worked out once for the whole run. Anything that needs the actor belongs
   * in init instead, because init runs again for every iteration.
   */
  configure?(config: SimConfig, mods: SpellMods): void;

  /** Anything to set up at the start of a fight, such as arming the weapons. */
  init?(actor: Actor, config: SimConfig, mods: SpellMods): void;

  /** What this cast actually costs, for a proc that makes one free. */
  costFor?(event: CostEvent): number;

  /** Extra percentage points of crit for this cast, from a debuff or a proc. */
  critBonusFor?(event: CritEvent): number;

  /**
   * A damage multiplier that can change during the fight, which a talent
   * folded into the mods before it started cannot. Death Wish lives here.
   */
  damageBonusFor?(event: CritEvent): number;

  /** The moment a cast begins, after its cost was paid. Consume procs here. */
  onCastStart?(event: CastEvent): void;

  /** After any cast finishes, whether or not it dealt damage. */
  onCastFinish?(event: CastEvent): void;

  /** After a damaging spell resolves, for procs and stacking debuffs. */
  onLand?(event: LandEvent): void;

  /**
   * After a weapon connects or fails to, both hands, every outcome. Flurry,
   * Unbridled Wrath and anything that watches a dodge hang here.
   */
  onSwing?(event: SwingEvent): void;

  /** A rage or energy heartbeat, for a talent that trickles the bar back. */
  onResourceTick?(event: ResourceTickEvent): void;

  /**
   * Hands this strike should also land with, beyond the one it names. Raging
   * Blows is why it exists: a talent, not the ability, is what decides that
   * Whirlwind reaches the off hand too.
   */
  extraHandsFor?(spellId: string, mods: SpellMods, actor: Actor): Hand[];

  /** How much faster than written a cast goes right now, one being no change. */
  castSpeedFor?(actor: Actor, now: number, mods: SpellMods): number;

  /** The haste this spec has going right now, as a multiplier on swing speed. */
  hasteFor?(actor: Actor, now: number, mods: SpellMods): number;

  forever: { status: ForeverStatus; note?: string };
  /** Names for tallies that are not abilities, such as a bleed a talent starts. */
  extraNames?: Record<string, string>;
  /** Anything the reader should know about this spec's model in particular. */
  notes?: string[];
  /**
   * Talents this spec knows about by name but does not model, with the reason.
   * The run lists the ones the character actually took, so a build is never
   * quietly worth more than the number says.
   */
  unmodelledTalents?: Record<string, string>;
  /**
   * Talents where part of what they do is modelled and part is not, with the
   * reason. Weaponmaster and Hack and Slash are both: which branch applies
   * depends on the weapon in your hand, and one branch of each is an extra
   * attack, which is a proc. Kept apart from the list above so that neither a
   * hook nor a note can be quietly forgotten.
   */
  partlyModelledTalents?: Record<string, string>;
}
