/**
 * The one way a set of inputs becomes something the simulator runs.
 *
 * An ordinary run, the replay of its middle fight, a swap being checked, the stat weights,
 * top gear and the drop list all build their configs here, from inputs handed in whole.
 * Nothing is read from the page. Two paths that built their own used to drift apart: the
 * replay left out the trinkets and the written rotation, so the fight it drew was not the
 * fight that was run.
 */

import type { ItemRef, Slot } from './export-format';
import type { RotationLine } from './sim/rotation';
import type { FightConfig, SimConfig } from './sim/types';
import { deriveStatSheet, effectsOn } from './stats';
import type { Character } from './types';

export interface SimInputs {
  character: Character;
  fight: FightConfig;
  /** Which of the spec's own rotations. */
  rotation?: string;
  /** A rotation somebody wrote, which replaces the spec's own. Empty or null means none. */
  apl?: RotationLine[] | null;
  /** Items put on or taken off against what is worn, for a swap or a loadout. */
  loadout?: Partial<Record<Slot, ItemRef | null>>;
}

export function simConfig(inputs: SimInputs): SimConfig {
  const { character, fight, rotation, apl, loadout } = inputs;
  return {
    specId: character.specId,
    stats: deriveStatSheet(character, fight, loadout ? { gearOverride: loadout } : {}),
    talents: character.talentRanks,
    fight,
    ...(rotation ? { rotation } : {}),
    ...(apl?.length ? { apl } : {}),
    ...effectsOn(character, loadout),
  };
}
