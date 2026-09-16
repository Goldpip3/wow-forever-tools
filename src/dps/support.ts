/** Which specs the simulator can run, said in words, from the registry. */

import { specModule, supportedSpecs } from './sim/specs';
import { CLASSES, specById } from '../shared/classes';

/**
 * The specs the simulator can run, as a sentence, read from the registry so it cannot fall
 * behind it. Grouped by class in the game's own class order: "Arms and Fury Warrior".
 */
export function supportedSpecsSentence(): string {
  const byClass = new Map<string, string[]>();
  for (const id of supportedSpecs()) {
    const spec = specById(id);
    const label = specModule(id)?.label;
    if (!spec || !label) continue;
    const names = byClass.get(spec.classId) ?? [];
    // 'Arms Warrior' and 'Fury Warrior' share a class, so they read 'Arms and Fury Warrior'.
    const suffix = ' ' + CLASSES[spec.classId].name;
    names.push(label.endsWith(suffix) ? label.slice(0, -suffix.length) : label);
    byClass.set(spec.classId, names);
  }
  const phrases = (Object.keys(CLASSES) as Array<keyof typeof CLASSES>)
    .filter((classId) => byClass.has(classId))
    .map((classId) => listOf(byClass.get(classId)!) + ' ' + CLASSES[classId].name);
  return listOf(phrases);
}

function listOf(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1];
}
