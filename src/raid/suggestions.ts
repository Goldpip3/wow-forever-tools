import type { Coverage, Player, Roster } from './types';
import { GROUP_SIZE } from './types';
import { activeGroupCount, groupOf, specLabel } from './engine';
import { effectsForSpec } from './effects/index';
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

/* ---------------------------------------------------------------- seat everyone */

/**
 * What a player's own party buffs are worth to each kind of player around them.
 *
 * Derived from the catalog rather than from a list of specs, so an Enhancement Shaman
 * counts as something melee want because Windfury and Strength of Earth are worth
 * something to melee, not because anybody wrote "shamans go with melee" down.
 */
function givesTo(player: Player): Partial<Record<Archetype, number>> {
  const out: Partial<Record<Archetype, number>> = {};
  for (const effect of effectsForSpec(player.classId, player.specId)) {
    if (effect.scope !== 'party') continue;
    // Only what this player has actually got selected, so an unpicked totem counts for
    // nothing and a Paladin is judged on the aura they are really running.
    const chosen = Object.values(player.loadout).flat();
    const gated = effect.providers.some(
      (p) => p.classId === player.classId && (p.choice || p.talent || p.pet),
    );
    if (gated && !chosen.includes(effect.id) && !player.talentToggles[effect.id]) continue;
    for (const cat of effect.categories) {
      for (const [arch, worth] of Object.entries(VALUE[cat] ?? {})) {
        out[arch as Archetype] = (out[arch as Archetype] ?? 0) + (worth ?? 0);
      }
    }
  }
  return out;
}

/** Whoever this player's party buffs help most, which is who they should sit with. */
function servesArchetype(player: Player): Archetype | null {
  let best: Archetype | null = null;
  let most = 0;
  for (const [arch, worth] of Object.entries(givesTo(player))) {
    if ((worth ?? 0) > most) {
      most = worth ?? 0;
      best = arch as Archetype;
    }
  }
  return best;
}

/**
 * Seat everyone waiting, putting party buffs where they are worth something.
 *
 * Party buffs only reach the caster's own group, so the arrangement is the whole game: an
 * Enhancement Shaman among five casters is a Windfury Totem nobody swings with. This sorts
 * players into blocks of the same kind, gives each block a contiguous run of groups, and
 * deals the buff carriers out first so two Shamans land in two different melee groups
 * rather than both in the first.
 *
 * It is a starting arrangement, not an answer. The leader drags from here, which is why it
 * fills seats in a legible order instead of chasing the last point of a score.
 *
 * Returns who was seated and who was left, since a pool can be larger than the raid.
 */
export function seatAll(
  roster: Roster,
  waiting: Player[],
): { seated: Player[]; left: Player[] } {
  const active = activeGroupCount(roster.size);

  const free: Array<{ group: number; slot: number }> = [];
  for (let g = 0; g < active; g += 1) {
    for (let s = 0; s < GROUP_SIZE; s += 1) {
      if (!roster.groups[g]?.[s]) free.push({ group: g, slot: s });
    }
  }
  if (!free.length) return { seated: [], left: [...waiting] };

  /* Whoever is already seated decides what each group is for, so Add all fills in around
     a leader's existing arrangement instead of arguing with it. */
  const claimed = new Map<number, Archetype>();
  for (let g = 0; g < active; g += 1) {
    const counts: Record<string, number> = {};
    for (const player of roster.groups[g] ?? []) {
      if (player) counts[archetypeFor(player)] = (counts[archetypeFor(player)] ?? 0) + 1;
    }
    let top: Archetype | null = null;
    let most = 0;
    for (const [arch, n] of Object.entries(counts)) {
      if (n > most) {
        most = n;
        top = arch as Archetype;
      }
    }
    if (top) claimed.set(g, top);
  }

  const take = waiting.slice(0, free.length);
  const left = waiting.slice(free.length);

  // Tanks sit with melee: they are hit by the same party buffs and there are never enough
  // of them to fill a group of their own.
  const blockOf = (arch: Archetype): Archetype => (arch === 'tank' ? 'melee' : arch);

  const blocks = new Map<Archetype, Player[]>();
  for (const player of take) {
    const key = blockOf(archetypeFor(player));
    if (!blocks.has(key)) blocks.set(key, []);
    blocks.get(key)!.push(player);
  }

  /* Carriers first inside a block, so dealing round-robin spreads them one per group. A
     player who buffs somebody else's block is sorted into that block instead. */
  for (const [key, list] of blocks) {
    list.sort((a, b) => {
      const aFor = servesArchetype(a) === key ? 1 : 0;
      const bFor = servesArchetype(b) === key ? 1 : 0;
      if (aFor !== bFor) return bFor - aFor;
      return archetypeFor(a).localeCompare(archetypeFor(b));
    });
  }

  const seatsByGroup = new Map<number, Array<{ group: number; slot: number }>>();
  for (const seat of free) {
    if (!seatsByGroup.has(seat.group)) seatsByGroup.set(seat.group, []);
    seatsByGroup.get(seat.group)!.push(seat);
  }

  const seated: Player[] = [];
  const order = ARCHETYPE_ORDER.map(blockOf).filter((a, i, all) => all.indexOf(a) === i);

  for (const key of order) {
    const list = blocks.get(key) ?? [];
    if (!list.length) continue;

    /* Groups this block may use: ones already mostly this kind first, then whatever is
       still free, so a block stays together rather than scattering. */
    const mine = [...seatsByGroup.keys()]
      .filter((g) => seatsByGroup.get(g)!.length)
      .sort((a, b) => {
        const aMine = claimed.get(a) === key ? 0 : 1;
        const bMine = claimed.get(b) === key ? 0 : 1;
        if (aMine !== bMine) return aMine - bMine;
        return a - b;
      });

    const need = Math.ceil(list.length / GROUP_SIZE);
    const using = mine.slice(0, Math.max(1, need));

    // Round-robin, so the carriers at the front of the list land in different groups.
    let i = 0;
    for (const player of list) {
      let placed = false;
      for (let tries = 0; tries < using.length && !placed; tries += 1) {
        const g = using[(i + tries) % using.length]!;
        const seat = seatsByGroup.get(g)?.pop();
        if (!seat) continue;
        roster.groups[seat.group]![seat.slot] = player;
        seated.push(player);
        placed = true;
      }
      if (!placed) {
        // The block's own groups filled up; take the next free seat anywhere.
        const spare = [...seatsByGroup.values()].find((list2) => list2.length)?.pop();
        if (!spare) {
          left.push(player);
          continue;
        }
        roster.groups[spare.group]![spare.slot] = player;
        seated.push(player);
      }
      i += 1;
    }
  }

  return { seated, left };
}
