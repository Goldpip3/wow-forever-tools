/**
 * Roster mode: the planner editing a real Discord event.
 *
 * Planner mode invents people and travels entirely in the URL hash. Roster mode is
 * entered only by a signed link the bot DMs to a raid leader, holds real signups, and
 * writes back. This is the only file in the planner that touches the network.
 *
 * The contract is Group Builder's `/api/v4/events/:id/roster`. Three things about it are
 * easy to get wrong and are handled here rather than at the call sites:
 *
 *   - `roleKey` is lowercase (tank / healer / melee / ranged) and may be null.
 *   - GET returns `slots`; PUT answers with `slotCount`. Different names on purpose.
 *   - A published roster stays `status: "published"` through later saves. Editing does
 *     not put it back to draft, so nothing here may assume it does.
 */
import type { Player, Roster } from './types';
import { GROUP_COUNT, GROUP_SIZE } from './types';
import { emptyRoster } from './engine';
import { createPlayer } from './loadout';
import { specFromSignup, specKeyForSpecId } from './groupbuilder';

/**
 * Where the bot lives. The one place the API's address appears.
 *
 * Override at build time with VITE_API_BASE when self-hosting; otherwise dev builds talk
 * to the bot running on the same machine and production talks to the deployed one.
 */
export const API_BASE: string =
  (import.meta.env.VITE_API_BASE as string | undefined) ??
  (import.meta.env.DEV ? 'http://localhost:3000' : 'https://api.foreverraid.gg');

/* ------------------------------------------------------------------ the link */

export interface RosterLink {
  eventId: string;
  token: string;
}

/**
 * Read the event and the token out of the URL fragment.
 *
 * Both live in the fragment and neither is ever moved into a query string. A fragment is
 * not sent with the request, so the token stays out of server logs, proxy logs and
 * Referer headers; putting it in a query string once would undo that permanently. It is
 * likewise never written to a cookie or to localStorage.
 */
export function readRosterLink(hash: string = location.hash): RosterLink | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const eventId = params.get('roster');
  const token = params.get('t');
  if (!eventId || !token) return null;
  return { eventId, token };
}

/* ------------------------------------------------------------- what comes back */

export interface RosterEvent {
  id: string;
  title: string;
  /** Unix SECONDS. Multiply by 1000 before handing it to Date. */
  startTime: number;
  guildId: string;
  channelId: string;
  size: number;
}

export interface Signup {
  signupId: number;
  userId: string;
  name: string;
  classKey: string;
  specKey: string | null;
  /** tank | healer | melee | ranged, lowercase, or null when no spec was picked. */
  roleKey: string | null;
  /** What the member said: primary, late, tentative, bench, absence, queued. */
  status: string;
  position: number;
}

export type Decision = 'selected' | 'standby' | 'cut';

export interface SlotRow {
  signupId: number | null;
  userId: string;
  displayName: string;
  classKey: string;
  specKey: string | null;
  decision: Decision;
  groupIndex: number | null;
  slotIndex: number | null;
  loadout: Record<string, unknown>;
}

export interface StoredRoster {
  revision: number;
  status: string;
  publishedAt: number | null;
  slots: SlotRow[];
}

export interface RosterPayload {
  event: RosterEvent;
  signups: Signup[];
  roster: StoredRoster | null;
  permissions: { canEdit: boolean; canPublish: boolean };
}

export interface PublishResult {
  revision: number;
  selected: number;
  standby: number;
  cut: number;
  messageUrl: string;
  notified: number;
  couldNotDm: Array<{ userId: string; displayName: string }>;
  dmMode: string;
}

/* ---------------------------------------------------------------- the errors */

export type ApiFailure =
  | { kind: 'auth' }                                    // 401: token gone or expired
  | { kind: 'forbidden'; message: string }              // 403: wrong event, or role lost
  | { kind: 'missing'; message: string }                // 404
  | { kind: 'conflict'; currentRevision: number }       // 409: someone else saved first
  | { kind: 'invalid'; message: string; details: string[] }
  | { kind: 'network'; message: string };

export class ApiError extends Error {
  readonly failure: ApiFailure;
  constructor(failure: ApiFailure, message: string) {
    super(message);
    this.name = 'ApiError';
    this.failure = failure;
  }
}

/** A sentence to put in front of the leader for any failure. */
export function explain(failure: ApiFailure): string {
  switch (failure.kind) {
    case 'auth':
      return 'That link has expired. Run /roster on the event in Discord for a fresh one.';
    case 'forbidden':
      return failure.message ||
        'This link is not for this event, or you no longer have permission to edit it.';
    case 'missing':
      return failure.message || 'That event no longer exists.';
    case 'conflict':
      return 'Someone else saved this roster while you were editing. Your copy was out of date.';
    case 'invalid':
      return failure.details.length
        ? failure.message + ' (' + failure.details.join('; ') + ')'
        : failure.message;
    case 'network':
      return 'Could not reach the bot: ' + failure.message;
  }
}

async function request<T>(
  link: RosterLink,
  path: string,
  init?: { method: string; body: unknown; keepalive?: boolean },
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(API_BASE + '/api/v4/events/' + encodeURIComponent(link.eventId) + path, {
      method: init?.method ?? 'GET',
      headers: {
        Authorization: 'Bearer ' + link.token,
        ...(init ? { 'Content-Type': 'application/json' } : {}),
      },
      body: init ? JSON.stringify(init.body) : undefined,
      keepalive: init?.keepalive,
    });
  } catch (err) {
    throw new ApiError(
      { kind: 'network', message: err instanceof Error ? err.message : String(err) },
      'network',
    );
  }

  if (res.ok) return (await res.json()) as T;

  let payload: { error?: string; details?: string[]; currentRevision?: number } = {};
  try {
    payload = (await res.json()) as typeof payload;
  } catch {
    /* an error with no body is still an error */
  }
  const message = payload.error ?? res.statusText;

  if (res.status === 401) throw new ApiError({ kind: 'auth' }, message);
  if (res.status === 403) throw new ApiError({ kind: 'forbidden', message }, message);
  if (res.status === 404) throw new ApiError({ kind: 'missing', message }, message);
  if (res.status === 409) {
    throw new ApiError(
      { kind: 'conflict', currentRevision: payload.currentRevision ?? 0 },
      message,
    );
  }
  throw new ApiError(
    { kind: 'invalid', message, details: payload.details ?? [] },
    message,
  );
}

/* ------------------------------------------------- signups and slots <-> players */

/** Stable planner id for someone, so re-rendering does not lose a drag in progress. */
function playerIdFor(userId: string): string {
  return 'gb:' + userId;
}

function toPlayer(
  source: { userId: string; classKey: string; specKey: string | null; signupId: number | null },
  name: string,
  signupStatus: string,
  loadout?: Record<string, unknown>,
): Player | null {
  const mapped = specFromSignup(source.classKey, source.specKey);
  if (!mapped) return null;
  const player = createPlayer(mapped.classId, mapped.specId);
  player.id = playerIdFor(source.userId);
  player.name = name;
  if (mapped.role) player.role = mapped.role;
  if (loadout && typeof loadout === 'object') {
    player.loadout = { ...player.loadout, ...(loadout as Record<string, string[]>) };
  }
  player.discord = {
    userId: source.userId,
    signupId: source.signupId,
    signupStatus,
  };
  return player;
}

export interface RosterState {
  event: RosterEvent;
  permissions: { canEdit: boolean; canPublish: boolean };
  /** Seated players. Groups only; this is what "selected" means. */
  roster: Roster;
  /** Signed up and not seated. Standby unless the leader cuts them. */
  pool: Player[];
  /** Explicitly cut. Never messaged as standby. */
  cut: Player[];
  /** The revision last seen from the server, or null before the first save. */
  revision: number | null;
  /** Stays 'published' once published, through later saves. */
  status: string;
  publishedAt: number | null;
  /** Signups whose class or spec the planner does not recognise. */
  unmapped: Signup[];
}

/** Build the editing state from one GET. */
export function stateFromPayload(payload: RosterPayload): RosterState {
  const size = ([40, 20, 10] as const).includes(payload.event.size as 40 | 20 | 10)
    ? (payload.event.size as 40 | 20 | 10)
    : 40;
  const roster = emptyRoster(size);
  const pool: Player[] = [];
  const cut: Player[] = [];
  const unmapped: Signup[] = [];

  const signupByUser = new Map(payload.signups.map((s) => [s.userId, s]));
  const placed = new Set<string>();

  // A saved roster wins: it is the leader's arrangement, and it may hold people whose
  // signup has since been withdrawn, which has to stay visible rather than vanish.
  for (const slot of payload.roster?.slots ?? []) {
    const signup = signupByUser.get(slot.userId);
    const player = toPlayer(
      {
        userId: slot.userId,
        classKey: slot.classKey,
        specKey: slot.specKey,
        signupId: slot.signupId,
      },
      slot.displayName,
      signup?.status ?? 'withdrawn',
      slot.loadout,
    );
    if (!player) {
      if (signup) unmapped.push(signup);
      continue;
    }
    placed.add(slot.userId);
    if (slot.decision === 'selected' && slot.groupIndex !== null && slot.slotIndex !== null) {
      const g = slot.groupIndex;
      const s = slot.slotIndex;
      if (g >= 0 && g < GROUP_COUNT && s >= 0 && s < GROUP_SIZE && !roster.groups[g]![s]) {
        roster.groups[g]![s] = player;
        continue;
      }
      // A seat the server accepted but this build cannot show: keep the person.
      pool.push(player);
    } else if (slot.decision === 'cut') {
      cut.push(player);
    } else {
      pool.push(player);
    }
  }

  for (const signup of payload.signups) {
    if (placed.has(signup.userId)) continue;
    const player = toPlayer(
      {
        userId: signup.userId,
        classKey: signup.classKey,
        specKey: signup.specKey,
        signupId: signup.signupId,
      },
      signup.name,
      signup.status,
    );
    if (!player) {
      unmapped.push(signup);
      continue;
    }
    pool.push(player);
  }

  pool.sort((a, b) => a.name.localeCompare(b.name));

  return {
    event: payload.event,
    permissions: payload.permissions,
    roster,
    pool,
    cut,
    revision: payload.roster?.revision ?? null,
    status: payload.roster?.status ?? 'draft',
    publishedAt: payload.roster?.publishedAt ?? null,
    unmapped,
  };
}

/**
 * Flatten the state into the payload the server wants.
 *
 * The whole roster goes on every save: a PUT replaces the previous set wholesale, so
 * anything left out is deleted. The server also rejects a selected slot without both
 * indexes, a standby or cut slot with either of them, a repeated userId and a repeated
 * seat, so those invariants are produced here rather than hoped for.
 */
export function slotsFrom(state: RosterState): SlotRow[] {
  const rows: SlotRow[] = [];
  const seen = new Set<string>();

  const push = (player: Player, decision: Decision, g: number | null, s: number | null) => {
    const discord = player?.discord;
    if (!discord || seen.has(discord.userId)) return;
    seen.add(discord.userId);
    rows.push({
      signupId: discord.signupId,
      userId: discord.userId,
      displayName: player.name.slice(0, 100),
      classKey: player.classId,
      specKey: specKeyOf(player),
      decision,
      groupIndex: decision === 'selected' ? g : null,
      slotIndex: decision === 'selected' ? s : null,
      loadout: player.loadout ?? {},
    });
  };

  for (let g = 0; g < GROUP_COUNT; g += 1) {
    for (let s = 0; s < GROUP_SIZE; s += 1) {
      const player = state.roster.groups[g]?.[s];
      if (player) push(player, 'selected', g, s);
    }
  }
  for (const player of state.cut) push(player, 'cut', null, null);
  for (const player of state.pool) push(player, 'standby', null, null);

  return rows;
}

/** The signup spec key for a player, recovered from its planner spec id. */
function specKeyOf(player: Player): string | null {
  return specKeyForSpecId(player.specId, player.role);
}

/* ------------------------------------------------------------------ the calls */

export function fetchRoster(link: RosterLink): Promise<RosterPayload> {
  return request<RosterPayload>(link, '/roster');
}

/**
 * Save a draft.
 *
 * `revision` is omitted only on the very first save, when GET returned roster:null.
 * Otherwise the revision last seen goes up and the one that comes back is stored. A 409
 * means someone else saved in between; it is raised to the caller and never retried
 * here, because retrying with the server's revision is exactly the silent overwrite the
 * revision exists to prevent.
 */
export async function saveRoster(
  link: RosterLink,
  slots: SlotRow[],
  revision: number | null,
  keepalive = false,
): Promise<{ revision: number; status: string; slotCount: number }> {
  const body: { slots: SlotRow[]; revision?: number } = { slots };
  if (revision !== null) body.revision = revision;
  return request(link, '/roster', { method: 'PUT', body, keepalive });
}

export async function publishRoster(
  link: RosterLink,
  revision: number | null,
): Promise<PublishResult> {
  const body: { revision?: number } = {};
  if (revision !== null) body.revision = revision;
  return request<PublishResult>(link, '/roster/publish', { method: 'POST', body });
}

/* ------------------------------------------------------------------ the saver */

export type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

/**
 * Holds the pending save.
 *
 * Every change marks the roster dirty and restarts a one second timer, so a run of drags
 * costs one request. A save already in flight is allowed to finish and any change made
 * during it schedules the next one, so the server never sees two writes racing from this
 * tab. The tab going away flushes immediately with keepalive, because a debounce that
 * loses the last drag on a closed tab is worse than no debounce.
 */
export class Saver {
  private timer: number | null = null;
  private inFlight = false;
  private again = false;
  private disposed = false;

  constructor(
    private readonly link: RosterLink,
    private readonly collect: () => { slots: SlotRow[]; revision: number | null },
    private readonly onRevision: (revision: number, status: string) => void,
    private readonly onState: (state: SaveState, detail?: ApiFailure) => void,
    private readonly delayMs = 1000,
  ) {}

  /** Call after any change the leader made. */
  queue(): void {
    if (this.disposed) return;
    this.onState('dirty');
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => void this.run(), this.delayMs);
  }

  /** Save now if anything is pending. Used when the tab is going away. */
  flush(keepalive = false): void {
    if (this.timer === null) return;
    window.clearTimeout(this.timer);
    this.timer = null;
    void this.run(keepalive);
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
  }

  private async run(keepalive = false): Promise<void> {
    if (this.disposed) return;
    this.timer = null;
    if (this.inFlight) {
      this.again = true;
      return;
    }
    this.inFlight = true;
    this.onState('saving');
    const { slots, revision } = this.collect();
    try {
      const res = await saveRoster(this.link, slots, revision, keepalive);
      this.onRevision(res.revision, res.status);
      this.onState('saved');
    } catch (err) {
      const failure = err instanceof ApiError
        ? err.failure
        : ({ kind: 'network', message: String(err) } as ApiFailure);
      this.onState('error', failure);
    } finally {
      this.inFlight = false;
      if (this.again && !this.disposed) {
        this.again = false;
        this.queue();
      }
    }
  }
}

/* ------------------------------------------------------------------- guests */

/**
 * A player the leader added who never signed up.
 *
 * They get a synthetic id so the payload's "one userId at most once" rule still holds,
 * and a null signupId. The bot never DMs them, because there is no Discord account
 * behind the id.
 */
export function makeGuest(
  classId: Player['classId'],
  specId: number,
  name: string,
  taken: Set<string>,
): Player {
  let n = 1;
  while (taken.has('guest:' + n)) n += 1;
  const userId = 'guest:' + n;
  const player = createPlayer(classId, specId);
  player.id = playerIdFor(userId);
  player.name = name.trim().slice(0, 100) || 'Guest ' + n;
  player.discord = { userId, signupId: null, signupStatus: 'guest' };
  return player;
}

export function isGuest(player: Player): boolean {
  return !!player.discord && player.discord.userId.startsWith('guest:');
}
