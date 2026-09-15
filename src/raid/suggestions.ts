import type { Coverage, Player, Roster } from './types';
import { GROUP_SIZE } from './types';
import { activeGroupCount, groupOf, specLabel } from './engine';
import {
  ARCHETYPE_LABEL,
  ARCHETYPE_ORDER,
  ROLE_ORDER,
  archetypeFor,
  bucketOf,
  roleOf,
  type Archetype,
  type RoleBucket,
} from '../shared/classes';

/**
 * How much a party buff category is worth to each kind of player, per point.
 * These are rough weights, not simulation output. They exist so the planner can
 * say "this seat is wasted" and rank one arrangement above another.
 */
const VALUE: Record<string, Partial<Record<Archetype, number>>> = {
  /* physical damage */
  'melee-attack-power': { melee: 10, tank: 5 },
  'ranged-attack-power': { 'ranged-physical': 10 },
  'extra-melee-attack': { melee: 12, tank: 3 },
  strength: { melee: 8, tank: 5 },
  agility: { melee: 7, tank: 5, 'ranged-physical': 8 },
  'melee-and-ranged-crit': { melee: 9, tank: 4, 'ranged-physical': 9 },

  /* spell damage and mana */
  'spell-crit': { caster: 10, healer: 3 },
  intellect: { caster: 6, healer: 5, 'ranged-physical': 2 },
  spirit: { caster: 4, healer: 6 },
  'mana-regen': { caster: 7, healer: 9, 'ranged-physical': 4 },
  'fire-damage': { caster: 4 },
  'nature-damage': { caster: 4 },
  'shadow-damage': { caster: 4 },

  /* survival */
  armor: { tank: 8, melee: 2 },
  'reduced-damage-taken': { tank: 9, melee: 2 },
  'holy-damage': { tank: 3 },
  stamina: { tank: 4, melee: 2, caster: 2, healer: 2, 'ranged-physical': 2 },
  'all-stats': { tank: 4, melee: 4, caster: 4, healer: 4, 'ranged-physical': 4 },

  /* threat: everyone but the tank wants less of it */
  'reduced-threat': { melee: 4, caster: 4, 'ranged-physical': 4 },
};

export interface SeatRef {
  group: number;
  slot: number;
}

export interface Suggestion {
  id: string;
  kind: 'move' | 'swap';
  /** One sentence a raid leader can act on. */
  title: string;
  detail: string;
  gain: number;
  from: SeatRef;
  to: SeatRef;
}

export interface GroupBuff {
  name: string;
  categories: string[];
}

export interface GroupProfile {
  index: number;
  /** Party buff categories live in this group. */
  categories: Set<string>;
  /** Which party buffs reach it. */
  buffs: GroupBuff[];
  counts: Record<Archetype, number>;
  /** The archetype this group's buffs favour, if any. */
  suits: Archetype | null;
  /** What most of the people in this group are, in the four raid roles. */
  dominant: RoleBucket | null;
}

/** What a group offers, and who it is set up for. */
export function profileGroups(roster: Roster, coverage: Coverage): GroupProfile[] {
  const active = activeGroupCount(roster.size);
  const out: GroupProfile[] = [];

  for (let g = 0; g < active; g += 1) {
    const categories = new Set<string>();
    const buffs: GroupBuff[] = [];
    for (const cov of coverage.byEffect.values()) {
      if (cov.effect.scope !== 'party' || !cov.groups[g]) continue;
      const scoring = cov.effect.categories.filter((cat) => VALUE[cat]);
      if (!scoring.length) continue;
      for (const cat of scoring) categories.add(cat);
      buffs.push({ name: cov.effect.name, categories: scoring });
    }

    const counts: Record<Archetype, number> = {
      tank: 0, melee: 0, 'ranged-physical': 0, caster: 0, healer: 0,
    };
    for (const player of roster.groups[g] ?? []) {
      if (player) counts[archetypeFor(player)] += 1;
    }

    // The group suits whichever archetype gets the most out of its buffs.
    let suits: Archetype | null = null;
    let best = 0;
    for (const arch of Object.keys(counts) as Archetype[]) {
      const score = [...categories].reduce((sum, cat) => sum + (VALUE[cat]?.[arch] ?? 0), 0);
      if (score > best) {
        best = score;
        suits = arch;
      }
    }

    // What the group mostly is, which is how raid leaders name their groups.
    const buckets: Record<RoleBucket, number> = { tank: 0, melee: 0, ranged: 0, healer: 0 };
    for (const arch of ARCHETYPE_ORDER) buckets[bucketOf(arch)] += counts[arch];
    let dominant: RoleBucket | null = null;
    let most = 0;
    for (const bucket of ROLE_ORDER) {
      if (buckets[bucket] > most) {
        most = buckets[bucket];
        dominant = bucket;
      }
    }

    out.push({ index: g, categories, buffs, counts, suits: best > 0 ? suits : null, dominant });
  }
  return out;
}

/** What one player gets out of sitting in one group. */
export function seatValue(player: Player, profile: GroupProfile | undefined): number {
  if (!profile) return 0;
  const arch = archetypeFor(player);
  let total = 0;
  for (const cat of profile.categories) total += VALUE[cat]?.[arch] ?? 0;
  return total;
}

/** How much party-buff value the whole raid is currently picking up. */
export function raidScore(roster: Roster, profiles: GroupProfile[]): number {
  let total = 0;
  profiles.forEach((profile) => {
    for (const player of roster.groups[profile.index] ?? []) {
      if (player) total += seatValue(player, profile);
    }
  });
  return total;
}

/** The group's buffs that this player actually benefits from, best first. */
function helpfulBuffs(player: Player, profile: GroupProfile, max = 2): string[] {
  const arch = archetypeFor(player);
  return profile.buffs
    .map((buff) => ({
      name: buff.name,
      worth: buff.categories.reduce((sum, cat) => sum + (VALUE[cat]?.[arch] ?? 0), 0),
    }))
    .filter((b) => b.worth > 0)
    .sort((a, b) => b.worth - a.worth)
    .slice(0, max)
    .map((b) => b.name);
}

/**
 * Looks for seat changes that raise the raid's total. Compares every filled seat
 * against every other seat, empty or filled, and keeps the moves that gain most.
 *
 * The scoring only knows about party buffs, so it will never suggest breaking up
 * a tank or a healer for a damage gain. It also leaves group 1 tanks alone.
 */
export function suggestSwaps(roster: Roster, coverage: Coverage, limit = 6): Suggestion[] {
  const profiles = profileGroups(roster, coverage);
  const active = profiles.length;
  if (active < 2) return [];

  const seats: Array<SeatRef & { player: Player | null }> = [];
  for (let g = 0; g < active; g += 1) {
    for (let s = 0; s < GROUP_SIZE; s += 1) {
      seats.push({ group: g, slot: s, player: roster.groups[g]?.[s] ?? null });
    }
  }

  const byIndex = new Map(profiles.map((p) => [p.index, p]));
  const found: Suggestion[] = [];

  for (const a of seats) {
    if (!a.player) continue;
    const profileA = byIndex.get(a.group);
    const valueA = seatValue(a.player, profileA);

    for (const b of seats) {
      if (a.group === b.group) continue;
      const profileB = byIndex.get(b.group);

      if (!b.player) {
        // Plain move into an empty seat.
        const gain = seatValue(a.player, profileB) - valueA;
        if (gain <= 0) continue;
        found.push(buildSuggestion('move', a.player, null, a, b, profileA, profileB, gain));
      } else {
        // Swap two players. Count it once, from the lower seat.
        if (a.group > b.group || (a.group === b.group && a.slot > b.slot)) continue;
        const valueB = seatValue(b.player, profileB);
        const after = seatValue(a.player, profileB) + seatValue(b.player, profileA);
        const gain = after - (valueA + valueB);
        if (gain <= 0) continue;
        found.push(buildSuggestion('swap', a.player, b.player, a, b, profileA, profileB, gain));
      }
    }
  }

  found.sort((x, y) => y.gain - x.gain);

  // Do not suggest two changes that touch the same player or seat.
  const used = new Set<string>();
  const picked: Suggestion[] = [];
  for (const s of found) {
    const keys = [
      s.from.group + 'x' + s.from.slot,
      s.to.group + 'x' + s.to.slot,
    ];
    if (keys.some((k) => used.has(k))) continue;
    keys.forEach((k) => used.add(k));
    picked.push(s);
    if (picked.length >= limit) break;
  }

  return picked;
}

function buildSuggestion(
  kind: 'move' | 'swap',
  playerA: Player,
  playerB: Player | null,
  a: SeatRef,
  b: SeatRef,
  profileA: GroupProfile | undefined,
  profileB: GroupProfile | undefined,
  gain: number,
): Suggestion {
  const archA = ARCHETYPE_LABEL[archetypeFor(playerA)];
  const gainsFor = profileB ? helpfulBuffs(playerA, profileB) : [];
  const groupA = 'Group ' + (a.group + 1);
  const groupB = 'Group ' + (b.group + 1);

  if (kind === 'move') {
    const why = gainsFor.length
      ? groupB + ' has ' + listWords(gainsFor) + ', and there is an empty seat there.'
      : groupB + ' suits them better and has an empty seat.';
    return {
      id: 'm' + a.group + a.slot + b.group + b.slot,
      kind,
      title: 'Move ' + playerA.name + ' to ' + groupB,
      detail:
        playerA.name +
        ' is a ' +
        specLabel(playerA) +
        ' sitting in ' +
        groupA +
        '. ' +
        why +
        ' ' +
        archA +
        ' get more out of that group.',
      gain,
      from: a,
      to: b,
    };
  }

  const bWants = playerB && profileA ? helpfulBuffs(playerB, profileA) : [];
  const first =
    playerA.name +
    ' moves to ' +
    groupB +
    (gainsFor.length ? ', where ' + listWords(gainsFor) + ' actually help them' : '') +
    '.';
  const second = playerB
    ? ' ' +
      playerB.name +
      ' takes the seat in ' +
      groupA +
      (bWants.length ? ' and picks up ' + listWords(bWants) : '') +
      '.'
    : '';

  return {
    id: 's' + a.group + a.slot + b.group + b.slot,
    kind,
    title: 'Swap ' + playerA.name + ' with ' + (playerB?.name ?? 'someone'),
    detail: first + second,
    gain,
    from: a,
    to: b,
  };
}

function listWords(items: string[]): string {
  if (items.length === 1) return items[0]!;
  if (items.length === 2) return items[0] + ' and ' + items[1];
  return items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1];
}

/** Applies a suggestion to the roster in place. */
export function applySuggestion(roster: Roster, s: Suggestion): void {
  const from = roster.groups[s.from.group]?.[s.from.slot] ?? null;
  const to = roster.groups[s.to.group]?.[s.to.slot] ?? null;
  if (!from) return;
  roster.groups[s.to.group]![s.to.slot] = from;
  roster.groups[s.from.group]![s.from.slot] = to;
}

/* --------------------------------------------------------------- the overview */

export interface RosterOverview {
  counts: Record<RoleBucket, number>;
  players: Record<RoleBucket, Array<{ player: Player; group: number }>>;
  bench: Player[];
  /** Groups with no one in them that still count toward the raid size. */
  emptySeats: number;
}

export function overview(roster: Roster): RosterOverview {
  const counts: Record<RoleBucket, number> = { tank: 0, melee: 0, ranged: 0, healer: 0 };
  const players: Record<RoleBucket, Array<{ player: Player; group: number }>> = {
    tank: [], melee: [], ranged: [], healer: [],
  };

  const active = activeGroupCount(roster.size);
  let filled = 0;
  for (let g = 0; g < active; g += 1) {
    for (const player of roster.groups[g] ?? []) {
      if (!player) continue;
      filled += 1;
      const bucket = roleOf(player);
      counts[bucket] += 1;
      players[bucket].push({ player, group: groupOf(roster, player.id) ?? g });
    }
  }

  return {
    counts,
    players,
    bench: roster.bench,
    emptySeats: active * GROUP_SIZE - filled,
  };
}
