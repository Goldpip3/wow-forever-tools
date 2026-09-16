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
      stampClasses(data);
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

/**
 * Write each talent's class onto it, once, as the data comes in.
 *
 * Nothing upstream carries it, and by the time a talent reaches a tooltip it has been
 * passed down far enough that the class is no longer in scope. Anything that needs to
 * identify a talent needs both, because two names are shared between classes.
 */
function stampClasses(data: TalentData): void {
  for (const [classKey, cls] of Object.entries(data.talents ?? {})) {
    for (const tree of cls.trees ?? []) {
      for (const talent of tree.talents ?? []) talent.classKey = classKey;
    }
  }
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
