import type {
  Coverage,
  Effect,
  EffectCoverage,
  Player,
  Provider,
  Roster,
  Warning,
} from './types';
import { GROUP_COUNT } from './types';
import { EFFECTS, effectById } from './effects/index';
import { CATEGORIES } from './categories';
import { CLASSES, specById } from '../shared/classes';

/**
 * 0 means no limit, which is the default. Classic capped a target at 16 debuffs;
 * Forever has not been shown to, so the planner does not invent one. Set a number
 * in the toolbar if you want to plan against a cap.
 */
export const DEFAULT_DEBUFF_CAP = 0;

/* ------------------------------------------------------------------ helpers */

export function emptyRoster(size: 40 | 20 | 10 = 40): Roster {
  return {
    size,
    groups: Array.from({ length: GROUP_COUNT }, () => Array.from({ length: 5 }, () => null)),
    bench: [],
    settings: { debuffCap: DEFAULT_DEBUFF_CAP },
  };
}

/** Groups that count toward a raid of this size: 8 for 40, 4 for 20, 2 for 10. */
export function activeGroupCount(size: number): number {
  return Math.max(1, Math.min(GROUP_COUNT, Math.ceil(size / 5)));
}

export function playersInRaid(roster: Roster): Player[] {
  const limit = activeGroupCount(roster.size);
  const out: Player[] = [];
  for (let g = 0; g < limit; g += 1) {
    for (const slot of roster.groups[g] ?? []) {
      if (slot) out.push(slot);
    }
  }
  return out;
}

export function groupOf(roster: Roster, playerId: string): number | null {
  for (let g = 0; g < roster.groups.length; g += 1) {
    if ((roster.groups[g] ?? []).some((p) => p?.id === playerId)) return g;
  }
  return null;
}

/* --------------------------------------------------------- provider matching */

/** Whether a player satisfies one provider entry of an effect. */
export function playerProvides(player: Player, effect: Effect, provider: Provider): boolean {
  if (provider.classId !== player.classId) return false;
  if (provider.specs && !provider.specs.includes(player.specId)) return false;

  // Talent gate: the manual toggle is the source of truth.
  if (provider.talent && player.talentToggles[effect.id] !== true) return false;

  // Choice gate: the player has to have picked this option in its group.
  if (provider.choice) {
    const picked = player.loadout[provider.choice.group] ?? [];
    if (!picked.includes(effect.id)) return false;
  }


  return true;
}

/**
 * Whether a player could provide this if they changed something they control: a
 * curse, an aura, which totem is down, which pet is out, a talent. Class and spec
 * are the only things they cannot change on the night.
 *
 * This is what separates "nobody here can do that" from "our Warlock is on a
 * different curse", which are very different problems for a raid leader.
 */
export function playerCouldProvide(player: Player, provider: Provider): boolean {
  if (provider.classId !== player.classId) return false;
  if (provider.specs && !provider.specs.includes(player.specId)) return false;
  return true;
}

export function couldProvide(effect: Effect, players: Player[]): Player[] {
  return players.filter((player) =>
    effect.providers.some((provider) => playerCouldProvide(player, provider)),
  );
}

export function providersOf(effect: Effect, players: Player[]): Player[] {
  return players.filter((player) =>
    effect.providers.some((provider) => playerProvides(player, effect, provider)),
  );
}

/* ------------------------------------------------------------------ coverage */

export function computeCoverage(roster: Roster): Coverage {
  const players = playersInRaid(roster);
  const limit = activeGroupCount(roster.size);
  const byEffect = new Map<string, EffectCoverage>();
  const warnings: Warning[] = [];

  /* ---------------------------------------------- who provides what, per group */
  for (const effect of EFFECTS) {
    const provs = providersOf(effect, players);
    const groups = Array.from({ length: GROUP_COUNT }, () => false);
    for (const player of provs) {
      const g = groupOf(roster, player.id);
      if (g !== null && g < limit) groups[g] = true;
    }
    byEffect.set(effect.id, {
      effect,
      providers: provs,
      possibleBy: provs.length ? [] : couldProvide(effect, players),
      groups,
      covered: provs.length > 0,
    });
  }

  /* ------------------------------------------------------------- exclusivity */
  for (const cov of byEffect.values()) {
    if (!cov.covered) continue;
    const clashing: string[] = [];
    for (const otherId of cov.effect.exclusiveWith ?? []) {
      const other = byEffect.get(otherId);
      if (!other?.covered) continue;
      clashing.push(otherId);

      if (cov.effect.scope === 'party') {
        // Only a clash when both land on the same group.
        const shared = cov.groups.map((on, i) => on && other.groups[i]).filter(Boolean).length;
        if (shared > 0) {
          const where = cov.groups
            .map((on, i) => (on && other.groups[i] ? 'Group ' + (i + 1) : null))
            .filter(Boolean)
            .join(', ');
          if (cov.effect.id < otherId) {
            warnings.push({
              level: 'warn',
              title: cov.effect.name + ' and ' + other.effect.name + ' do not stack',
              detail:
                'Both are in ' + where + '. Only the stronger one applies, so split them across groups.',
            });
          }
        }
      } else if (cov.effect.id < otherId) {
        warnings.push({
          level: 'info',
          title: cov.effect.name + ' and ' + other.effect.name + ' do not stack',
          detail:
            'Only the stronger one applies to the target, so one of those players can do something else.',
        });
      }
    }
    if (clashing.length) cov.overriddenBy = clashing;
  }

  /* ------------------------------------------------------------ category rolls */
  const categoryCounts = new Map<string, number>();
  const categoryEffects = new Map<string, EffectCoverage[]>();
  for (const cat of CATEGORIES) {
    categoryCounts.set(cat.id, 0);
    categoryEffects.set(cat.id, []);
  }
  for (const cov of byEffect.values()) {
    if (!cov.covered) continue;
    for (const catId of cov.effect.categories) {
      const list = categoryEffects.get(catId);
      if (!list) continue;
      list.push(cov);
    }
  }
  for (const [catId, list] of categoryEffects) {
    const people = new Set<string>();
    for (const cov of list) for (const p of cov.providers) people.add(p.id);
    categoryCounts.set(catId, people.size);
    list.sort((a, b) => a.effect.name.localeCompare(b.effect.name));
  }

  /* ------------------------------------------------------------- debuff slots */
  // One slot per distinct debuff on the boss, whoever applies it. Effects that
  // overwrite each other, like Sunder Armor and Expose Armor, share a slot.
  let debuffSlotsUsed = 0;
  const countedDebuffs = new Set<string>();
  for (const cov of byEffect.values()) {
    if (!cov.covered) continue;
    if (cov.effect.scope !== 'target') continue;
    const slots = cov.effect.debuffSlots ?? 1;
    if (slots <= 0) continue;
    if ((cov.effect.exclusiveWith ?? []).some((id) => countedDebuffs.has(id))) continue;
    countedDebuffs.add(cov.effect.id);
    debuffSlotsUsed += slots;
  }

  const cap = roster.settings.debuffCap ?? DEFAULT_DEBUFF_CAP;
  if (cap > 0 && debuffSlotsUsed > cap) {
    warnings.push({
      level: 'error',
      title: 'Over the debuff slot limit',
      detail:
        debuffSlotsUsed +
        ' debuffs on the target, against the ' +
        cap +
        ' you set as the limit. Something would drop off the target. Cut a damage-over-time effect, or raise the limit.',
    });
  }

  /* ---------------------------------------------------------- choice warnings */
  warnings.push(...choiceWarnings(roster, players, byEffect, limit));

  /* -------------------------------------------------- missing party coverage */
  warnings.push(...partyGapWarnings(byEffect, limit));

  /* --------------------------------------------------------- unverified notes */
  const unverified = [...byEffect.values()].filter(
    (c) => c.covered && (c.effect.forever.status === 'unverified' || c.effect.forever.status === 'removed'),
  );
  if (unverified.length) {
    warnings.push({
      level: 'info',
      title: unverified.length + ' effects in this raid are not confirmed for Forever',
      detail:
        unverified
          .slice(0, 8)
          .map((c) => c.effect.name)
          .join(', ') +
        (unverified.length > 8 ? ' and others' : '') +
        '. They were read from Classic or from demo footage, so treat them as provisional until the beta lands.',
    });
  }

  return {
    byEffect,
    categoryCounts,
    categoryEffects,
    warnings,
    debuffSlotsUsed,
    debuffCap: cap,
    playerCount: players.length,
  };
}

/* ----------------------------------------------------------- choice checking */

function choiceWarnings(
  roster: Roster,
  players: Player[],
  byEffect: Map<string, EffectCoverage>,
  limit: number,
): Warning[] {
  const out: Warning[] = [];

  /* Paladins: each one hands out one blessing per class, so distinct blessings matter. */
  const paladins = players.filter((p) => p.classId === 'paladin');
  if (paladins.length) {
    const chosen = new Set<string>();
    for (const p of paladins) for (const id of p.loadout['paladin-blessing'] ?? []) chosen.add(id);
    if (chosen.size < paladins.length) {
      out.push({
        level: 'warn',
        title: 'Paladin blessings are doubled up',
        detail:
          paladins.length +
          ' Paladins are only covering ' +
          chosen.size +
          ' different blessings. Give each of them a different one to get more out of the raid.',
      });
    }
    const auras = new Set<string>();
    for (const p of paladins) for (const id of p.loadout['paladin-aura'] ?? []) auras.add(id);
    if (!auras.size) {
      out.push({
        level: 'warn',
        title: 'No Paladin aura is running',
        detail: 'Every Paladin should have an aura selected. Open a Paladin and pick one.',
      });
    }
  }

  /* Shamans: one totem per element per group, so an empty element is a gap. */
  const shamans = players.filter((p) => p.classId === 'shaman');
  for (const shaman of shamans) {
    const missing: string[] = [];
    for (const [group, label] of [
      ['shaman-earth', 'earth'],
      ['shaman-air', 'air'],
      ['shaman-water', 'water'],
      ['shaman-fire', 'fire'],
    ] as const) {
      if (!(shaman.loadout[group] ?? []).length) missing.push(label);
    }
    if (missing.length) {
      out.push({
        level: 'info',
        title: shaman.name + ' has no ' + missing.join(', ') + ' totem set',
        detail: 'That totem slot is doing nothing for the group.',
        group: groupOf(roster, shaman.id) ?? undefined,
      });
    }
  }

  /* Warlocks: one curse per Warlock, and duplicates are wasted. */
  const warlocks = players.filter((p) => p.classId === 'warlock');
  if (warlocks.length > 1) {
    const counts = new Map<string, number>();
    for (const w of warlocks) {
      for (const id of w.loadout['warlock-curse'] ?? []) {
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
    }
    for (const [id, n] of counts) {
      if (n > 1) {
        out.push({
          level: 'warn',
          title: n + ' Warlocks are casting ' + (effectById(id)?.name ?? id),
          detail: 'Only one lands on the target. Move the others onto a different curse.',
        });
      }
    }
  }

  /* Hunters: only one sting sticks per Hunter, and duplicates are wasted. */
  const hunters = players.filter((p) => p.classId === 'hunter');
  if (hunters.length > 1) {
    const counts = new Map<string, number>();
    for (const h of hunters) {
      for (const id of h.loadout['hunter-sting'] ?? []) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    for (const [id, n] of counts) {
      if (n > 1 && id !== 'serpent-sting') {
        out.push({
          level: 'info',
          title: n + ' Hunters are using ' + (effectById(id)?.name ?? id),
          detail: 'Only one sting lands on the target at a time. Spread them out.',
        });
      }
    }
  }

  /* Druids: the two crit auras are mutually exclusive, and both are worth having somewhere. */
  const lotp = byEffect.get('leader-of-the-pack');
  const moonkin = byEffect.get('moonkin-form');
  if (lotp?.covered && moonkin?.covered) {
    const overlap = lotp.groups
      .map((on, i) => (on && moonkin.groups[i] && i < limit ? i + 1 : 0))
      .filter(Boolean);
    if (!overlap.length) {
      out.push({
        level: 'info',
        title: 'Both crit auras are running in different groups',
        detail: 'Leader of the Pack and Moonkin Aura do not stack, so keeping them apart is right.',
      });
    }
  }

  return out;
}

/* --------------------------------------------------------- party gap checking */

/** Party buffs worth flagging when a group is missing them. */
const KEY_PARTY_BUFFS = [
  'battle-shout',
  'devotion-aura',
  'strength-of-earth-totem',
  'windfury-totem',
  'grace-of-air-totem',
  'mana-spring-totem',
  'blood-pact',
];

function partyGapWarnings(byEffect: Map<string, EffectCoverage>, limit: number): Warning[] {
  const out: Warning[] = [];
  for (const id of KEY_PARTY_BUFFS) {
    const cov = byEffect.get(id);
    if (!cov?.covered) continue;
    const missing: number[] = [];
    for (let g = 0; g < limit; g += 1) {
      if (!cov.groups[g]) missing.push(g + 1);
    }
    if (missing.length && missing.length < limit) {
      out.push({
        level: 'info',
        title: cov.effect.name + ' is missing from ' + (missing.length === 1 ? 'a group' : missing.length + ' groups'),
        detail: 'Groups ' + missing.join(', ') + ' do not have it. It only reaches the caster group.',
      });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ rosters */

export function rosterSummary(roster: Roster): string {
  const players = playersInRaid(roster);
  const byClass = new Map<string, number>();
  for (const p of players) byClass.set(p.classId, (byClass.get(p.classId) ?? 0) + 1);
  if (!players.length) return 'Click a seat to add your first player';
  const parts = [...byClass.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([c, n]) => n + ' ' + CLASSES[c as keyof typeof CLASSES].name);
  return players.length + ' of ' + roster.size + '  ·  ' + parts.join(', ');
}

export function specLabel(player: Player): string {
  const spec = specById(player.specId);
  return spec ? spec.name + ' ' + CLASSES[player.classId].name : CLASSES[player.classId].name;
}
