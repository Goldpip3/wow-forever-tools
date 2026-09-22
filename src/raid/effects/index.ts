import type { Effect } from "../types";
import { WARRIOR_EFFECTS } from "./warrior";
import { PALADIN_EFFECTS } from "./paladin";
import { HUNTER_EFFECTS } from "./hunter";
import { ROGUE_EFFECTS } from "./rogue";
import { PRIEST_EFFECTS } from "./priest";
import { SHAMAN_EFFECTS } from "./shaman";
import { MAGE_EFFECTS } from "./mage";
import { WARLOCK_EFFECTS } from "./warlock";
import { DRUID_EFFECTS } from "./druid";

export const EFFECTS: Effect[] = [
  ...WARRIOR_EFFECTS,
  ...PALADIN_EFFECTS,
  ...HUNTER_EFFECTS,
  ...ROGUE_EFFECTS,
  ...PRIEST_EFFECTS,
  ...SHAMAN_EFFECTS,
  ...MAGE_EFFECTS,
  ...WARLOCK_EFFECTS,
  ...DRUID_EFFECTS,
];

const BY_ID = new Map(EFFECTS.map((e) => [e.id, e]));

export function effectById(id: string): Effect | undefined {
  return BY_ID.get(id);
}

/** Every effect a given class could ever provide. */
export function effectsForClass(classId: string): Effect[] {
  return EFFECTS.filter((e) => e.providers.some((p) => p.classId === classId));
}

/** Every effect a given spec could provide, ignoring talent and pet gates. */
export function effectsForSpec(classId: string, specId: number): Effect[] {
  return EFFECTS.filter((e) =>
    e.providers.some(
      (p) => p.classId === classId && (!p.specs || p.specs.includes(specId)),
    ),
  );
}

/** Choice groups a spec has to pick from, e.g. which aura or which totems. */
export function choiceGroupsForSpec(
  classId: string,
  specId: number,
): Map<string, Effect[]> {
  const groups = new Map<string, Effect[]>();
  for (const effect of EFFECTS) {
    for (const p of effect.providers) {
      if (p.classId !== classId) continue;
      if (p.specs && !p.specs.includes(specId)) continue;
      if (!p.choice) continue;
      const list = groups.get(p.choice.group) ?? [];
      list.push(effect);
      groups.set(p.choice.group, list);
    }
  }
  return groups;
}

export const CHOICE_LABELS: Record<string, string> = {
  "paladin-aura": "Aura",
  "paladin-blessing": "Blessing",
  "shaman-earth": "Earth totem",
  "shaman-air": "Air totem",
  "shaman-water": "Water totem",
  "shaman-fire": "Fire totem",
  "warlock-curse": "Curse",
  "warlock-bane": "Bane",
  "warlock-pet": "Pet",
  "hunter-sting": "Sting",
  "rogue-poison": "Poisons",
  "hunter-pet": "Pet",
  "druid-form": "Form and stance",
};

export {
  WARRIOR_EFFECTS,
  PALADIN_EFFECTS,
  HUNTER_EFFECTS,
  ROGUE_EFFECTS,
  PRIEST_EFFECTS,
  SHAMAN_EFFECTS,
  MAGE_EFFECTS,
  WARLOCK_EFFECTS,
  DRUID_EFFECTS,
};
