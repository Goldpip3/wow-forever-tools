import type { Archetype, ClassId } from '../shared/classes';

/** Where an effect lands. */
export type Scope =
  | 'raid'   // one caster covers the whole raid
  | 'party'  // covers the caster's own group of five
  | 'target' // a debuff on the boss, costs a debuff slot
  | 'self';  // personal only, listed for information

export type ForeverStatus = 'same' | 'changed' | 'new' | 'removed' | 'unverified';

export type EffectKind = 'buff' | 'debuff' | 'other' | 'list';

/** Pets that carry a raid-relevant effect. */
export type PetKind = 'imp' | 'voidwalker' | 'succubus' | 'felhunter' | 'wolf' | 'bat' | 'owl';

export interface TalentGate {
  /** Tree name exactly as it appears in the talent data, e.g. 'Marksmanship'. */
  tree: string;
  /** Talent name exactly as it appears in the talent data. */
  name: string;
  minRank?: number;
}

/** A choice a player makes that excludes their other options in the same group. */
export interface ChoiceRef {
  group: string;
  /** How many of this group one player can run at once. */
  limit: number;
}

export interface Provider {
  classId: ClassId;
  /** Spec ids that can provide it; omit for every spec of the class. */
  specs?: number[];
  talent?: TalentGate;
  pet?: PetKind;
  choice?: ChoiceRef;
}

export interface Effect {
  id: string;
  name: string;
  icon: string;
  kind: EffectKind;
  categories: string[];
  scope: Scope;
  providers: Provider[];
  /** Effect ids that overwrite or cancel this one rather than stacking with it. */
  exclusiveWith?: string[];
  /** Debuff slots consumed on the boss. Defaults to 1 for target scope. */
  debuffSlots?: number;
  values?: { classic?: string; forever?: string };
  forever: { status: ForeverStatus; note?: string };
}

/* ------------------------------------------------------------------- roster */

export interface Player {
  id: string;
  name: string;
  classId: ClassId;
  specId: number;
  /**
   * Overrides the archetype derived from the spec. A Feral Druid signed up as a
   * bear tank shares the Feral Combat tree with a cat, so the source has to say
   * which one it is.
   */
  role?: Archetype;
  /** Talent build code, when one was pasted in. */
  build?: string;
  /** Chosen effect ids per choice group, e.g. { 'paladin-blessing': ['bok'] }. */
  loadout: Record<string, string[]>;
  /** Manual overrides for talent gates: effectId -> has it. */
  talentToggles: Record<string, boolean>;
  /**
   * Set only in roster mode, where a seat holds a real person who signed up in
   * Discord and will be messaged when the roster is published. Its absence is what
   * makes a seat hypothetical, so planner mode never sets it.
   *
   * `signupStatus` is what the member said — primary, late, tentative, bench,
   * absence, queued — and is not the leader's decision about them. The two
   * vocabularies are deliberately separate; never map one onto the other.
   */
  discord?: {
    userId: string;
    signupId: number | null;
    signupStatus: string;
  };
}

export const GROUP_COUNT = 8;
export const GROUP_SIZE = 5;

export type RaidSize = 40 | 20 | 10;

export interface RosterSettings {
  debuffCap: number;
}

export interface Roster {
  size: RaidSize;
  /** groups[groupIndex][slotIndex], null for an empty slot. */
  groups: Array<Array<Player | null>>;
  bench: Player[];
  settings: RosterSettings;
}

/* ---------------------------------------------------------------- coverage */

export interface EffectCoverage {
  effect: Effect;
  /** Players who provide it, excluding the bench. */
  providers: Player[];
  /**
   * Players who could provide it by changing a curse, aura, totem, pet or talent.
   * Only filled when nobody is providing it, so the UI can say "available" rather
   * than "missing" when the raid simply has not assigned it.
   */
  possibleBy: Player[];
  /** For party scope: which of the eight groups have it. */
  groups: boolean[];
  covered: boolean;
  /** Set when another active effect overwrites this one. */
  overriddenBy?: string[];
}

export type WarningLevel = 'error' | 'warn' | 'info';

export interface Warning {
  level: WarningLevel;
  title: string;
  detail: string;
  /** Group index when the warning is about one group. */
  group?: number;
}

export interface Coverage {
  byEffect: Map<string, EffectCoverage>;
  /** Category id -> number of distinct players providing anything in it. */
  categoryCounts: Map<string, number>;
  /** Category id -> the effects in it that at least one player provides. */
  categoryEffects: Map<string, EffectCoverage[]>;
  warnings: Warning[];
  debuffSlotsUsed: number;
  debuffCap: number;
  playerCount: number;
}
