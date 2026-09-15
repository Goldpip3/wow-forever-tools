import type { Player, Roster } from './types';
import { GROUP_SIZE } from './types';
import { emptyRoster } from './engine';
import { createPlayer } from './loadout';
import type { Archetype, ClassId } from '../shared/classes';
import { CLASS_IDS } from '../shared/classes';

/**
 * Bridge to Group Builder, the Discord signup bot.
 *
 * Group Builder collects who is coming; this planner decides where they sit. Its
 * plan lists the "comp tool" as out of scope, so the two halves meet here.
 *
 * Both of its shapes are accepted:
 *   - the internal row:  { displayName, classKey, specKey, status }
 *   - the v4 API row:    { name, className, specName, roleName, status }
 * and either a bare array, a { signUps: [...] } object, or a whole event object.
 */

interface SpecMapping {
  specId: number;
  /** Set when the signup key says more about the role than the talent tree does. */
  role?: Archetype;
}

/** Group Builder's spec keys, from templates/wow_classic.json. */
const BY_SPEC_KEY: Record<string, SpecMapping> = {
  arms: { specId: 161 },
  fury: { specId: 164 },
  prot_war: { specId: 163 },

  holy_pal: { specId: 382 },
  prot_pal: { specId: 383 },
  ret: { specId: 381 },

  bm: { specId: 361 },
  mm: { specId: 363 },
  surv: { specId: 362 },

  assa: { specId: 182 },
  combat: { specId: 181 },
  sub: { specId: 183 },

  disc: { specId: 201 },
  holy_priest: { specId: 202 },
  shadow: { specId: 203 },

  ele: { specId: 261 },
  enh: { specId: 263 },
  resto_sham: { specId: 262 },

  arcane: { specId: 81 },
  fire: { specId: 41 },
  frost: { specId: 61 },

  affli: { specId: 302 },
  demo: { specId: 303 },
  destro: { specId: 301 },

  balance: { specId: 283 },
  // Feral Combat covers both cat and bear. Group Builder splits them, and that
  // split is worth keeping: a bear belongs with the tanks when seating groups.
  feral: { specId: 281, role: 'melee' },
  guardian: { specId: 281, role: 'tank' },
  resto_druid: { specId: 282 },
};

/** Display names from the v4 API, keyed by class then spec. */
const BY_CLASS_AND_NAME: Record<string, Record<string, SpecMapping>> = {
  warrior: { arms: { specId: 161 }, fury: { specId: 164 }, protection: { specId: 163 }, prot: { specId: 163 } },
  paladin: { holy: { specId: 382 }, protection: { specId: 383 }, prot: { specId: 383 }, retribution: { specId: 381 }, ret: { specId: 381 } },
  hunter: {
    'beast mastery': { specId: 361 }, beastmastery: { specId: 361 }, bm: { specId: 361 },
    marksmanship: { specId: 363 }, mm: { specId: 363 }, survival: { specId: 362 }, surv: { specId: 362 },
  },
  rogue: { assassination: { specId: 182 }, assa: { specId: 182 }, combat: { specId: 181 }, subtlety: { specId: 183 }, sub: { specId: 183 } },
  priest: {
    discipline: { specId: 201 }, disc: { specId: 201 }, holy: { specId: 202 },
    shadow: { specId: 203 }, 'shadow magic': { specId: 203 },
  },
  shaman: {
    elemental: { specId: 261 }, 'elemental combat': { specId: 261 }, ele: { specId: 261 },
    enhancement: { specId: 263 }, enh: { specId: 263 },
    restoration: { specId: 262 }, resto: { specId: 262 },
  },
  mage: { arcane: { specId: 81 }, fire: { specId: 41 }, frost: { specId: 61 } },
  warlock: {
    affliction: { specId: 302 }, affli: { specId: 302 },
    demonology: { specId: 303 }, demo: { specId: 303 },
    destruction: { specId: 301 }, destro: { specId: 301 },
  },
  druid: {
    balance: { specId: 283 },
    feral: { specId: 281, role: 'melee' }, 'feral combat': { specId: 281, role: 'melee' },
    guardian: { specId: 281, role: 'tank' }, bear: { specId: 281, role: 'tank' },
    restoration: { specId: 282 }, resto: { specId: 282 },
  },
};

/** The first spec of each class, used when a signup names no spec at all. */
const DEFAULT_SPEC: Record<ClassId, number> = {
  warrior: 161, paladin: 381, hunter: 361, rogue: 181, priest: 202,
  shaman: 261, mage: 61, warlock: 302, druid: 283,
};

/** Statuses that mean "this person is playing", as opposed to bench or absent. */
const PLAYING = new Set(['primary', 'late', 'queued']);

export interface GroupBuilderSignup {
  /** Internal shape. */
  displayName?: string;
  classKey?: string;
  specKey?: string;
  /** v4 API shape. */
  name?: string;
  className?: string;
  specName?: string;
  roleName?: string;
  status?: string;
  position?: number;
  userId?: string;
}

export interface GroupBuilderEvent {
  title?: string;
  templateId?: string;
  templateKey?: string;
  signUps?: GroupBuilderSignup[];
  signups?: GroupBuilderSignup[];
}

export type GroupBuilderPayload = GroupBuilderEvent | GroupBuilderSignup[];

function norm(value: string | undefined | null): string {
  return (value ?? '').trim().toLowerCase().replace(/[\s_-]+/g, ' ');
}

function classOf(signup: GroupBuilderSignup): ClassId | null {
  const raw = norm(signup.classKey ?? signup.className);
  if (!raw) return null;
  const direct = raw.replace(/\s+/g, '');
  return (CLASS_IDS as readonly string[]).includes(direct) ? (direct as ClassId) : null;
}

function specOf(classId: ClassId, signup: GroupBuilderSignup): SpecMapping | null {
  const key = norm(signup.specKey).replace(/\s+/g, '_');
  if (key && BY_SPEC_KEY[key]) return BY_SPEC_KEY[key];

  const byName = BY_CLASS_AND_NAME[classId] ?? {};
  const name = norm(signup.specName ?? signup.specKey);
  if (name && byName[name]) return byName[name];

  // Last resort: a spec name that starts with a known one, e.g. "Frost Fire".
  if (name) {
    const hit = Object.keys(byName).find((k) => name.startsWith(k) || k.startsWith(name));
    if (hit) return byName[hit]!;
  }
  return null;
}

export interface ImportResult {
  players: Player[];
  bench: Player[];
  /** Signups that could not be read, with the reason. */
  skipped: Array<{ name: string; reason: string }>;
  title?: string;
}

/** Turns a Group Builder payload into players, without seating them. */
export function readSignups(payload: GroupBuilderPayload): ImportResult {
  const event = Array.isArray(payload) ? { signUps: payload } : payload;
  const rows = event.signUps ?? event.signups ?? [];
  const players: Player[] = [];
  const bench: Player[] = [];
  const skipped: ImportResult['skipped'] = [];

  const ordered = [...rows].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

  for (const row of ordered) {
    const name = (row.displayName ?? row.name ?? '').trim();
    const status = norm(row.status) || 'primary';

    const classId = classOf(row);
    if (!classId) {
      // Status-only rows (absence, tentative) use the status as the class key.
      const label = row.classKey ?? row.className ?? '(no class)';
      skipped.push({ name: name || '(unnamed)', reason: 'not a playable class: ' + label });
      continue;
    }

    const mapping = specOf(classId, row);
    const specId = mapping?.specId ?? DEFAULT_SPEC[classId];
    const player = createPlayer(classId, specId, name || undefined);
    if (mapping?.role) player.role = mapping.role;

    if (status === 'absence' || status === 'tentative') {
      skipped.push({ name: name || '(unnamed)', reason: status });
      continue;
    }
    if (status === 'bench' || !PLAYING.has(status)) bench.push(player);
    else players.push(player);
  }

  return {
    players,
    bench,
    skipped,
    title: Array.isArray(payload) ? undefined : payload.title,
  };
}

/**
 * Seats an import into a roster, keeping signup order. Tanks and healers are
 * spread across groups first so the planner has something sensible to improve on.
 */
export function rosterFromSignups(
  payload: GroupBuilderPayload,
  size: 40 | 20 | 10 = 40,
): ImportResult & { roster: Roster } {
  const result = readSignups(payload);
  const roster = emptyRoster(size);
  roster.bench = result.bench;

  const capacity = Math.ceil(size / GROUP_SIZE) * GROUP_SIZE;
  const seated = result.players.slice(0, capacity);
  const overflow = result.players.slice(capacity);
  for (const player of overflow) {
    roster.bench.push(player);
    result.skipped.push({ name: player.name, reason: 'no seat left, benched' });
  }

  seated.forEach((player, i) => {
    const g = Math.floor(i / GROUP_SIZE);
    const s = i % GROUP_SIZE;
    roster.groups[g]![s] = player;
  });

  return { ...result, roster };
}

/** Rough check that a pasted blob looks like Group Builder output. */
export function looksLikeGroupBuilder(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some((v) => v && typeof v === 'object' && ('classKey' in v || 'className' in v));
  }
  if (value && typeof value === 'object') {
    const obj = value as GroupBuilderEvent;
    return Array.isArray(obj.signUps) || Array.isArray(obj.signups);
  }
  return false;
}
