import type { ClassId } from '../shared/classes';
import { CLASSES, specById } from '../shared/classes';
import type { Player, PetKind } from './types';
import { CHOICE_LABELS, choiceGroupsForSpec, effectById, effectsForSpec } from './effects/index';

/** What a spec brings by default, so a fresh roster is already useful. */
const DEFAULT_CHOICES: Record<number, Record<string, string[]>> = {
  /* Paladin: Holy, Protection, Retribution */
  382: { 'paladin-aura': ['devotion-aura'], 'paladin-blessing': ['blessing-of-wisdom'] },
  383: { 'paladin-aura': ['devotion-aura'], 'paladin-blessing': ['blessing-of-kings'] },
  381: { 'paladin-aura': ['retribution-aura'], 'paladin-blessing': ['blessing-of-might'] },

  /* Shaman: Elemental, Restoration, Enhancement */
  261: {
    'shaman-earth': ['strength-of-earth-totem'],
    'shaman-air': ['grace-of-air-totem'],
    'shaman-water': ['mana-spring-totem'],
    'shaman-fire': ['fire-resistance-totem'],
  },
  262: {
    'shaman-earth': ['strength-of-earth-totem'],
    'shaman-air': ['grace-of-air-totem'],
    'shaman-water': ['mana-tide-totem'],
    'shaman-fire': ['fire-resistance-totem'],
  },
  263: {
    'shaman-earth': ['strength-of-earth-totem'],
    'shaman-air': ['windfury-totem'],
    'shaman-water': ['mana-spring-totem'],
    'shaman-fire': ['fire-resistance-totem'],
  },

  /* Warlock: Affliction, Demonology, Destruction */
  /* No default Bane: the only member of that group is Bane of Havoc, a Destruction talent.
     The old default named bane-of-agony, which is not an effect at all, so the group read
     as picked while nothing was. */
  302: { 'warlock-curse': ['curse-of-the-elements'], 'warlock-pet': ['blood-pact'] },
  303: { 'warlock-curse': ['curse-of-the-elements'], 'warlock-pet': ['blood-pact'] },
  301: { 'warlock-curse': ['curse-of-shadow'], 'warlock-pet': ['blood-pact'] },

  /* Hunter: Beast Mastery, Marksmanship, Survival */
  361: { 'hunter-sting': ['scorpid-sting'], 'hunter-pet': ['furious-howl'] },
  363: { 'hunter-sting': ['scorpid-sting'], 'hunter-pet': ['furious-howl'] },
  362: { 'hunter-sting': ['scorpid-sting'], 'hunter-pet': ['furious-howl'] },

  /* Rogue: Assassination, Combat, Subtlety */
  182: { 'rogue-poison': ['wound-poison', 'crippling-poison'] },
  181: { 'rogue-poison': ['wound-poison', 'crippling-poison'] },
  183: { 'rogue-poison': ['wound-poison', 'crippling-poison'] },

  /* Druid: Balance, Feral, Restoration */
  283: { 'druid-form': ['moonkin-form'] },
  281: { 'druid-form': ['leader-of-the-pack'] },
  282: {},
};

/** Talent-gated effects a spec is assumed to have taken until the player says otherwise. */
const DEFAULT_TALENTS: Record<number, string[]> = {
  /* Warrior */
  161: ['mortal-strike'],                                   // Arms
  164: ['piercing-howl'],                                   // Fury
  163: ['improved-shield-bash', 'concussion-blow'],         // Protection

  /* Paladin */
  381: ['repentance'],                                      // Retribution

  /* Hunter */
  361: ['intimidation', 'summon-hawk'],                     // Beast Mastery
  363: ['trueshot-aura'],                                   // Marksmanship
  362: ['scatter-shot'],                                    // Survival

  /* Rogue */
  182: ['mutilate'],                                        // Assassination
  181: ['improved-kick'],                                   // Combat
  183: ['hemorrhage'],                                      // Subtlety

  /* Priest */
  201: ['power-infusion'],                                  // Discipline
  202: ['prayer-of-mending'],                               // Holy
  203: ['vampiric-embrace', 'silence', 'shadow-weaving'],   // Shadow

  /* Shaman */
  263: ['stormstrike'],                                     // Enhancement
  262: ['mana-tide-totem'],                                 // Restoration

  /* Mage */
  81: ['improved-counterspell'],                            // Arcane
  41: ['improved-scorch'],                                  // Fire
  61: ['ice-block', 'winters-chill'],                       // Frost

  /* Warlock */
  301: ['improved-shadow-bolt'],                            // Destruction

  /* Druid */
  283: ['moonkin-form', 'insect-swarm'],                    // Balance
  281: ['leader-of-the-pack', 'feral-charge'],              // Feral
};

export function defaultLoadout(specId: number): Record<string, string[]> {
  const preset = DEFAULT_CHOICES[specId];
  return preset ? JSON.parse(JSON.stringify(preset)) : {};
}

export function defaultTalentToggles(specId: number): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const id of DEFAULT_TALENTS[specId] ?? []) out[id] = true;
  return out;
}

let seq = 0;

export function createPlayer(classId: ClassId, specId: number, name?: string): Player {
  seq += 1;
  const spec = specById(specId);
  return {
    id: 'p' + Date.now().toString(36) + seq.toString(36),
    name: name ?? (spec ? spec.short + ' ' + CLASSES[classId].name : CLASSES[classId].name),
    classId,
    specId,
    loadout: defaultLoadout(specId),
    talentToggles: defaultTalentToggles(specId),
  };
}

/**
 * Whether a duplicate pick in this group is wasted.
 *
 * Judged by scope rather than by a list of group names, so it stays right as the catalog
 * changes: a raid buff or a debuff on the boss lands once however many people cast it, so a
 * second Warlock on the curse the first already has adds nothing. Party-scope groups are
 * deliberately excluded — two Paladins running Devotion Aura in two different groups is two
 * groups covered, not a mistake, and every totem works the same way.
 */
function wastedWhenDuplicated(options: Array<{ id: string }>): boolean {
  return options.every((o) => {
    const scope = effectById(o.id)?.scope;
    return scope === 'raid' || scope === 'target';
  });
}

function needsTalent(classId: ClassId, effectId: string): boolean {
  const effect = effectById(effectId);
  return !!effect?.providers.some((p) => p.classId === classId && p.talent);
}

/**
 * Move a newly added player off the picks their classmates already have.
 *
 * Drop in a second Warlock and they take the next curse rather than doubling up on the
 * first one's. This runs at the moment the player is created, before anyone has opened
 * their loadout, so it can only ever change an untouched default — it cannot overwrite a
 * choice the leader made.
 *
 * `createPlayer` cannot do this itself because it is also called where there is no roster
 * to read: building a list from Discord signups, or seeding one player from a pasted talent
 * link. Call this wherever a player joins a roster.
 */
export function spreadChoices(player: Player, existing: Iterable<Player>): Player {
  const classmates: Player[] = [];
  for (const other of existing) {
    if (other && other.classId === player.classId && other.id !== player.id) classmates.push(other);
  }
  if (!classmates.length) return player;

  for (const choice of choicesFor(player)) {
    if (choice.limit !== 1) continue;
    if (!wastedWhenDuplicated(choice.options)) continue;

    const taken = new Set<string>();
    for (const mate of classmates) {
      for (const id of mate.loadout[choice.group] ?? []) taken.add(id);
    }

    const current = (player.loadout[choice.group] ?? [])[0];
    if (current && !taken.has(current)) continue;

    /* Catalog order, so the second Warlock takes the next curse that actually matters
       rather than the next one alphabetically. Talent-gated options are skipped: handing
       someone a curse they may not have talented is a worse guess than leaving it be. */
    const free = choice.options.find((o) => !taken.has(o.id) && !needsTalent(player.classId, o.id));
    if (free) player.loadout[choice.group] = [free.id];
  }
  return player;
}

/** Choice groups this player has to pick from, with their options and current picks. */
export interface ChoiceOption {
  group: string;
  label: string;
  limit: number;
  options: Array<{ id: string; name: string; icon: string; selected: boolean }>;
}

export function choicesFor(player: Player): ChoiceOption[] {
  const groups = choiceGroupsForSpec(player.classId, player.specId);
  const out: ChoiceOption[] = [];
  for (const [group, effects] of groups) {
    const picked = player.loadout[group] ?? [];
    let limit = 1;
    for (const e of effects) {
      const p = e.providers.find((x) => x.classId === player.classId && x.choice?.group === group);
      if (p?.choice) limit = p.choice.limit;
    }
    out.push({
      group,
      label: CHOICE_LABELS[group] ?? group,
      limit,
      options: effects.map((e) => ({
        id: e.id,
        name: e.name,
        icon: e.icon,
        selected: picked.includes(e.id),
      })),
    });
  }
  return out.sort((a, b) => a.label.localeCompare(b.label));
}

/** Talent-gated effects this spec could bring, for the manual toggles. */
export function talentGatedFor(player: Player): Array<{ id: string; name: string; icon: string; on: boolean }> {
  const seen = new Map<string, { id: string; name: string; icon: string; on: boolean }>();
  for (const effect of effectsForSpec(player.classId, player.specId)) {
    const gated = effect.providers.some(
      (p) =>
        p.classId === player.classId &&
        (!p.specs || p.specs.includes(player.specId)) &&
        p.talent,
    );
    if (!gated) continue;
    seen.set(effect.id, {
      id: effect.id,
      name: effect.name,
      icon: effect.icon,
      on: player.talentToggles[effect.id] === true,
    });
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Pet-gated effects, shown with the pet they need. */
export function petGatedFor(player: Player): Array<{ id: string; name: string; icon: string; pet: PetKind }> {
  const out: Array<{ id: string; name: string; icon: string; pet: PetKind }> = [];
  for (const effect of effectsForSpec(player.classId, player.specId)) {
    for (const p of effect.providers) {
      if (p.classId !== player.classId) continue;
      if (p.specs && !p.specs.includes(player.specId)) continue;
      if (!p.pet) continue;
      out.push({ id: effect.id, name: effect.name, icon: effect.icon, pet: p.pet });
    }
  }
  return out;
}

export function effectName(id: string): string {
  return effectById(id)?.name ?? id;
}
