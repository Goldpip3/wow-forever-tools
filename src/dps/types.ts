import type { ClassId } from '../shared/classes';
import type { CharacterExport, ItemRef } from './export-format';

/** An imported character, ready for the stat model and the simulator. */
export interface Character {
  /** Exactly what the addon sent, kept whole so nothing is lost on a re-save. */
  source: CharacterExport;
  classId: ClassId;
  specId: number;
  /**
   * Talent code in the shape src/talents/codec.ts parses, so the summary can
   * link straight into the talent calculator. Empty when the talent data had
   * not loaded at import time.
   */
  build: string;
  /** Talent name to rank, which is what the spec modules read. */
  talentRanks: Record<string, number>;
  /** Equipped, bags and bank together, filtered to what this class can use. */
  owned: ItemRef[];
}

export interface ImportIssue {
  name: string;
  reason: string;
}

export interface ImportResult {
  character?: Character;
  /** Items and rows that were read but not kept, each with the reason. */
  skipped: ImportIssue[];
  /** Things worth saying out loud that did not stop the import. */
  warnings: string[];
  /** Set when nothing could be read at all. */
  error?: string;
}
