/** Mirrors the shape of public/data/talents.generated.json (sourced from talentsforever.com). */

export type ClassicStatus = 'same' | 'changed' | 'moved' | 'new';

export interface ClassicRef {
  status: ClassicStatus;
  tree?: string;
  row?: number;
  col?: number;
  max?: number;
  text?: string;
  renamed?: string;
  moved?: boolean;
}

export interface Talent {
  name: string;
  max: number;
  /** 1-based, 1..7 */
  row: number;
  /** 1-based, 1..4 */
  col: number;
  passive?: boolean;
  icon: string;
  /** Either one string per rank, or a sparse map of rank -> text when only some ranks were read. */
  desc: string[] | Record<string, string>;
  /** false when some rank texts were scaled rather than read from the demo. */
  complete?: boolean;
  /** Ranks whose text was confirmed on screen. */
  confirmed?: number[];
  /** Name of the talent that must be maxed first. */
  req?: string;
  reqText?: string;
  cost?: string;
  fixed?: string[];
  scaleIdx?: number[];
  /**
   * Which class's tree this came from, stamped on load rather than present upstream.
   *
   * Two talent names are used by two classes each - Vengeance by Paladin and Druid,
   * Dual Wield Specialization by Warrior and Rogue - so a name alone cannot identify one.
   */
  classKey?: string;
  classic?: ClassicRef;
}

export interface RemovedTalent {
  name: string;
  max?: number;
  text?: string;
  row?: number;
  icon?: string;
}

export interface Tree {
  name: string;
  /** Blizzard talent-tab id; doubles as the background image id and Wowhead spec id. */
  bg: number;
  icon: string;
  talents: Talent[];
  removed?: RemovedTalent[];
}

export interface ClassTalents {
  icon: string;
  source?: string;
  trees: Tree[];
}

export interface RaceInfo {
  race: string;
  icon: string;
  classes: string[];
  /** [name, text, icon] */
  abilities: Array<[string, string, string]>;
}

export interface LegacyTree {
  name: string;
  icon: string;
  /** [name, maxRank, text, icon] */
  perks: Array<[string, number, string, string]>;
}

export interface ChangelogEntry {
  date: string;
  title: string;
  text: string;
}

export interface TalentData {
  generated: string;
  imported: string;
  license: string;
  attribution: string;
  source: string;
  talents: Record<string, ClassTalents>;
  spell_desc: Record<string, unknown>;
  racials: Record<string, Record<string, RaceInfo>>;
  class_racials?: Record<string, unknown>;
  class_abilities: Record<string, Array<[string, string, string]>>;
  legacy: { note: string; trees: LegacyTree[] };
  changelog: ChangelogEntry[];
}
