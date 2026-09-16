/**
 * Taking one planned player over to the gear page.
 *
 * The planner knows what a player gets from the rest of the raid: the raid-wide buffs, the
 * party buffs of their group and the debuffs on the boss. The gear page knows how to
 * simulate some of those. This writes down, for one player, which of them the simulator has
 * a matching buff for and which it does not, and nothing else. The gear page shows that
 * list and ticks nothing until the person asks it to.
 *
 * It carries no network call and nothing personal: a spec, a talent link if one was pasted,
 * and effect ids.
 */

import { compressToEncodedURIComponent } from 'lz-string';
import type { Coverage, Player, Roster } from './types';
import { activeGroupCount } from './engine';

/**
 * Planner effect id to the gear page's buff id, where the two describe the same thing.
 * Anything missing here is listed as not simulated rather than guessed at.
 */
export const SIM_BUFF_FOR: Readonly<Record<string, string>> = {
  'arcane-intellect': 'arcane-intellect',
  'mark-of-the-wild': 'mark-of-the-wild',
  'power-word-fortitude': 'power-word-fortitude',
  'divine-spirit': 'divine-spirit',
  'blessing-of-kings': 'blessing-of-kings',
  'blessing-of-might': 'blessing-of-might',
  'mana-spring-totem': 'mana-spring-totem',
  'moonkin-form': 'moonkin-aura',
  'battle-shout': 'battle-shout',
  'strength-of-earth-totem': 'strength-of-earth',
  'grace-of-air-totem': 'grace-of-air',
  'windfury-totem': 'windfury-totem',
  'trueshot-aura': 'trueshot-aura',
  'curse-of-shadow': 'curse-of-shadow',
  'curse-of-the-elements': 'curse-of-the-elements',
  'sunder-armor': 'sunder-armor',
  'faerie-fire': 'faerie-fire',
};

export interface PlannerHandoff {
  v: 1;
  name: string;
  classId: string;
  specId: number;
  /** One-based, as the planner shows it. */
  group: number;
  /** The talent link pasted on the player, shown on the gear page but never applied there. */
  build?: string;
  /** Gear-page buff ids this player gets from the raid, buffs and debuffs together. */
  simulated: string[];
  /** Names of what this player gets that the simulator has nothing for. */
  notSimulated: string[];
}

/** Where a player sits, or null when they are not in a seat the raid uses. */
function groupOf(roster: Roster, playerId: string): number | null {
  const active = activeGroupCount(roster.size);
  for (let g = 0; g < active; g += 1) {
    if ((roster.groups[g] ?? []).some((p) => p?.id === playerId)) return g;
  }
  return null;
}

/**
 * What this player gets from the raid as it stands: raid buffs that are up, their group's
 * party buffs, and the boss's debuffs. An effect another one overwrites is left out, since
 * only the stronger applies. Self buffs are the player's own business and not the raid's.
 */
export function handoffFor(roster: Roster, coverage: Coverage, player: Player): PlannerHandoff | null {
  const group = groupOf(roster, player.id);
  if (group === null) return null;
  const simulated = new Set<string>();
  const notSimulated = new Set<string>();

  for (const cov of coverage.byEffect.values()) {
    const { effect } = cov;
    if (effect.kind !== 'buff' && effect.kind !== 'debuff') continue;
    if (!cov.covered || cov.overriddenBy?.length) continue;
    const reaches =
      effect.scope === 'raid' || effect.scope === 'target' || (effect.scope === 'party' && !!cov.groups[group]);
    if (!reaches) continue;
    const sim = SIM_BUFF_FOR[effect.id];
    if (sim) simulated.add(sim);
    else notSimulated.add(effect.name);
  }

  return {
    v: 1,
    name: player.name,
    classId: player.classId,
    specId: player.specId,
    group: group + 1,
    ...(player.build ? { build: player.build } : {}),
    simulated: [...simulated].sort(),
    notSimulated: [...notSimulated].sort(),
  };
}

/** A link to the gear page carrying one player's handoff. */
export function handoffLink(handoff: PlannerHandoff, dpsPage: string): string {
  return dpsPage + '#h=' + compressToEncodedURIComponent(JSON.stringify(handoff));
}
