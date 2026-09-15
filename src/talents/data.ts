import type { ClassTalents, TalentData } from './types';
import { dataUrl } from '../shared/icons';
import { dataKeyFor } from './codec';

let cache: TalentData | null = null;
let inflight: Promise<TalentData> | null = null;

export async function loadTalentData(): Promise<TalentData> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = fetch(dataUrl('talents.generated.json'))
    .then((res) => {
      if (!res.ok) throw new Error('Talent data failed to load (' + res.status + ')');
      return res.json() as Promise<TalentData>;
    })
    .then((data) => {
      cache = data;
      inflight = null;
      return data;
    })
    .catch((err) => {
      inflight = null;
      throw err;
    });
  return inflight;
}

export function classTalents(data: TalentData, classKey: string): ClassTalents | undefined {
  return data.talents[dataKeyFor(classKey)];
}

export function spellbookFor(data: TalentData, classKey: string) {
  return data.spellbooks?.[dataKeyFor(classKey)];
}

export function classAbilities(data: TalentData, classKey: string) {
  return data.class_abilities?.[dataKeyFor(classKey)] ?? [];
}
