/**
 * Every made-up character the page can load, in one list.
 *
 * One per class that has a simulation, because each class exercises a different
 * half of the engine and loading the wrong one leaves most of the page untried.
 */

import { SAMPLE_EXPORT } from './sample';
import { SAMPLE_DRUID_EXPORT } from './sample-druid';
import { SAMPLE_DRUID_BALANCE_EXPORT } from './sample-druid-balance';
import { SAMPLE_HUNTER_EXPORT } from './sample-hunter';
import { SAMPLE_MAGE_FIRE_EXPORT } from './sample-mage-fire';
import { SAMPLE_PALADIN_EXPORT } from './sample-paladin';
import { SAMPLE_PRIEST_EXPORT } from './sample-priest';
import { SAMPLE_ROGUE_EXPORT } from './sample-rogue';
import { SAMPLE_SHAMAN_EXPORT } from './sample-shaman';
import { SAMPLE_WARLOCK_EXPORT } from './sample-warlock';
import { SAMPLE_WARRIOR_EXPORT } from './sample-warrior';

export interface Sample {
  key: string;
  /** What the picker says, e.g. 'A frost mage'. */
  label: string;
  text: string;
}

export const SAMPLES: Sample[] = [
  { key: 'mage', label: 'A frost mage', text: SAMPLE_EXPORT },
  { key: 'warrior', label: 'A fury warrior', text: SAMPLE_WARRIOR_EXPORT },
  { key: 'rogue', label: 'A combat rogue', text: SAMPLE_ROGUE_EXPORT },
  { key: 'shaman', label: 'An enhancement shaman', text: SAMPLE_SHAMAN_EXPORT },
  { key: 'paladin', label: 'A retribution paladin', text: SAMPLE_PALADIN_EXPORT },
  { key: 'druid', label: 'A feral druid', text: SAMPLE_DRUID_EXPORT },
  { key: 'hunter', label: 'A marksmanship hunter', text: SAMPLE_HUNTER_EXPORT },
  { key: 'mage-fire', label: 'A fire mage', text: SAMPLE_MAGE_FIRE_EXPORT },
  { key: 'warlock', label: 'An affliction warlock', text: SAMPLE_WARLOCK_EXPORT },
  { key: 'priest', label: 'A shadow priest', text: SAMPLE_PRIEST_EXPORT },
  { key: 'druid-balance', label: 'A balance druid', text: SAMPLE_DRUID_BALANCE_EXPORT },
];

export function sampleByKey(key: string): Sample | undefined {
  return SAMPLES.find((s) => s.key === key);
}
