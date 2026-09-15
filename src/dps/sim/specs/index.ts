/**
 * Every spec the simulator can run.
 *
 * One entry per file. A spec that is not here yet is not broken, it is just not
 * written: the page says so and falls back to the stat weights it can still
 * derive from nothing, rather than pretending to have an answer.
 */

import type { SpecModule } from '../spec';
import { mageFrost } from './mage-frost';

const MODULES: SpecModule[] = [mageFrost];

const BY_ID = new Map<number, SpecModule>(MODULES.map((m) => [m.specId, m]));

export function specModule(specId: number): SpecModule | undefined {
  return BY_ID.get(specId);
}

export function supportedSpecs(): number[] {
  return [...BY_ID.keys()];
}

export function isSupported(specId: number): boolean {
  return BY_ID.has(specId);
}

export type { SpecModule };
