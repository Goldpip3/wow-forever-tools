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
import { createPlayer, spreadChoices } from './loadout';
import { specFromSignup, specKeyForSpecId } from './groupbuilder';
import { API_BASE } from '../shared/session';

export { API_BASE };


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
  /** True for a /testcreate event, whose signups are fabricated. */
  isTest?: boolean;
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
  permissions: { canEdit: boolean; canPublish: boolean; canEditSettings?: boolean };
}

export interface PublishResult {
  revision: number;
  selected: number;
  standby: number;
  cut: number;
  messageUrl: string;
  notified: number;
  /** Real people with real accounts who heard nothing. Never fabricated signups. */
  couldNotDm: Array<{ userId: string; displayName: string }>;
  /**
   * Fabricated signups from a /testcreate event, which were deliberately not messaged.
   *
   * Always present, empty on a normal event. They are kept out of couldNotDm on purpose:
   * that list is the one place a publish admits somebody was not reached, and a leader
   * who learns to ignore it because it is usually fake names will ignore it on the night
   * it is real.
   */
  skippedTestAccounts: Array<{ userId: string; displayName: string }>;
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
  eventId: string,
  link: RosterLink | null,
  path: string,
  init?: { method: string; body: unknown; keepalive?: boolean },
): Promise<T> {
  // The demo has no event behind it. Nothing it does may reach the bot, whatever calls this.
  if (eventId === 'demo' || !eventId) {
    throw new ApiError({ kind: 'forbidden', message: 'The demo is never saved.' }, 'demo');
  }
  let res: Response;
  try {
    res = await fetch(API_BASE + '/api/v4/events/' + encodeURIComponent(eventId) + path, {
      method: init?.method ?? 'GET',
      /* The session cookie is on .wowforever.us while the API is on api.wowforever.us, so
         without this the browser sends nothing and every call is a 401 while the person is
         signed in. The API answers with Access-Control-Allow-Credentials against this
         exact origin. */
      credentials: 'include',
      headers: {
        ...(link ? { Authorization: 'Bearer ' + link.token } : {}),
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
  existing: Iterable<Player> = [],
): Player | null {
  const mapped = specFromSignup(source.classKey, source.specKey);
  if (!mapped) return null;
  /* Spread first, merge the saved loadout second: a pick the leader already made and the
     bot stored has to win over anything guessed here. */
  const player = spreadChoices(createPlayer(mapped.classId, mapped.specId), existing);
  player.id = playerIdFor(source.userId);
  player.name = name;
  if (mapped.role) player.role = mapped.role;
  if (loadout && typeof loadout === 'object') readSavedLoadout(player, loadout);
  player.discord = {
    userId: source.userId,
    signupId: source.signupId,
    signupStatus,
  };
  return player;
}

/**
 * What slotsFrom stores in a slot's loadout, besides the choice groups.
 *
 * The bot keeps `loadout` as an object it does not read, so the talent toggles and a
 * pasted build ride along under keys no choice group can have. Without them a toggle or a
 * build saved, reloaded and quietly came back off.
 */
const LOADOUT_TALENTS = '_talents';
const LOADOUT_BUILD = '_build';

function storedLoadout(player: Player): Record<string, unknown> {
  const out: Record<string, unknown> = { ...(player.loadout ?? {}) };
  if (Object.keys(player.talentToggles ?? {}).length) out[LOADOUT_TALENTS] = { ...player.talentToggles };
  if (player.build) out[LOADOUT_BUILD] = player.build;
  return out;
}

/** The reverse, keeping only values of the right shape, since the bot does not check them. */
function readSavedLoadout(player: Player, saved: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(saved)) {
    if (key === LOADOUT_TALENTS) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        for (const [id, on] of Object.entries(value)) {
          if (typeof on === 'boolean') player.talentToggles[id] = on;
        }
      }
    } else if (key === LOADOUT_BUILD) {
      if (typeof value === 'string' && value) player.build = value.slice(0, 200);
    } else if (Array.isArray(value) && value.every((v) => typeof v === 'string')) {
      player.loadout[key] = value;
    }
  }
}

/** A guest's synthetic id, which no Discord account can have. */
function isGuestId(userId: string): boolean {
  return userId.startsWith('guest:');
}

/**
 * Signups with a status where a class should be.
 *
 * Pressing Bench or Absence on the event post is a signup with no class at all, and the
 * bot stores the status in classKey. They are real people saying something real, so they
 * are not unreadable data: there is simply no spec to put in a seat.
 */
const STATUS_ONLY = new Set(['bench', 'absence', 'late', 'tentative', 'queued', 'primary']);

export function isStatusOnly(signup: { classKey: string }): boolean {
  return STATUS_ONLY.has(signup.classKey.toLowerCase());
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
  /** Signed up without a class at all, so there is nothing to seat. */
  statusOnly: Signup[];
}

/** Build the editing state from one GET. */
export function stateFromPayload(payload: RosterPayload): RosterState {
  const size = ([40, 20, 10] as const).includes(payload.event.size as 40 | 20 | 10)
    ? (payload.event.size as 40 | 20 | 10)
    : 40;
  const roster = emptyRoster(size);
  const pool: Player[] = [];
  const cut: Player[] = [];
  /* Everyone built so far, in the order they were built, so each new person can be moved
     off the choices their classmates already hold. */
  const everyone: Player[] = [];
  const unmapped: Signup[] = [];
  const statusOnly: Signup[] = [];

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
      // What the member said, from their signup. A guest never signed up, and anyone else
      // with no signup left has withdrawn; neither is the leader's decision about them.
      signup?.status ?? (isGuestId(slot.userId) ? 'guest' : 'withdrawn'),
      slot.loadout,
      everyone,
    );
    if (!player) {
      if (signup) unmapped.push(signup);
      continue;
    }
    everyone.push(player);
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
      undefined,
      everyone,
    );
    if (!player) {
      if (isStatusOnly(signup)) statusOnly.push(signup);
      else unmapped.push(signup);
      continue;
    }
    everyone.push(player);
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
    statusOnly,
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
      loadout: storedLoadout(player),
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

/**
 * A link, a session, or both.
 *
 * A signed link is one event for two hours; a session is the person, for a month. Both
 * authorise the same routes, and where both are present the server prefers the session,
 * because that is the one that can be revoked.
 */
export interface RosterAccess {
  eventId: string;
  link: RosterLink | null;
}

export function fetchRoster(access: RosterAccess): Promise<RosterPayload> {
  return request<RosterPayload>(access.eventId, access.link, '/roster');
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
  access: RosterAccess,
  slots: SlotRow[],
  revision: number | null,
  keepalive = false,
): Promise<{ revision: number; status: string; slotCount: number }> {
  const body: { slots: SlotRow[]; revision?: number } = { slots };
  if (revision !== null) body.revision = revision;
  return request(access.eventId, access.link, '/roster', { method: 'PUT', body, keepalive });
}

export async function publishRoster(
  access: RosterAccess,
  revision: number | null,
): Promise<PublishResult> {
  const body: { revision?: number } = {};
  if (revision !== null) body.revision = revision;
  return request<PublishResult>(access.eventId, access.link, '/roster/publish', { method: 'POST', body });
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
  /** A change the server has not accepted: queued, or the save carrying it failed. */
  private pending = false;
  private failed = false;
  private running: Promise<void> | null = null;

  constructor(
    private readonly access: RosterAccess,
    private readonly collect: () => { slots: SlotRow[]; revision: number | null },
    private readonly onRevision: (revision: number, status: string) => void,
    private readonly onState: (state: SaveState, detail?: ApiFailure) => void,
    private readonly delayMs = 1000,
  ) {}

  /** Call after any change the leader made. */
  queue(): void {
    if (this.disposed) return;
    this.pending = true;
    this.onState('dirty');
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => void this.run(), this.delayMs);
  }

  /** True while an edit has not been accepted: queued, in flight, or its save failed. */
  hasUnsaved(): boolean {
    return this.pending || this.inFlight;
  }

  /** Save now if anything is pending. Used when the tab is going away. */
  flush(keepalive = false): void {
    if (this.timer === null) return;
    window.clearTimeout(this.timer);
    this.timer = null;
    void this.run(keepalive);
  }

  /**
   * Save anything pending and wait until the server holds what is on screen.
   *
   * True once nothing is queued or in flight and the last save landed. False if a save
   * failed, which onState has already reported, or the saver was disposed. A save that
   * failed earlier is tried once more; a 409 cannot come round twice, because the
   * conflict handler disposes the saver.
   */
  async settle(): Promise<boolean> {
    while (!this.disposed) {
      if (this.running) {
        await this.running;
        if (this.failed) return false;
        continue;
      }
      if (!this.pending) return true;
      if (this.timer !== null) window.clearTimeout(this.timer);
      this.timer = null;
      await this.run();
      if (this.failed) return false;
    }
    return false;
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
  }

  private run(keepalive = false): Promise<void> {
    if (this.disposed) return Promise.resolve();
    this.timer = null;
    if (this.inFlight) {
      this.again = true;
      return this.running ?? Promise.resolve();
    }
    this.inFlight = true;
    this.pending = false;
    this.failed = false;
    this.running = this.save(keepalive);
    return this.running;
  }

  private async save(keepalive: boolean): Promise<void> {
    this.onState('saving');
    const { slots, revision } = this.collect();
    try {
      const res = await saveRoster(this.access, slots, revision, keepalive);
      this.onRevision(res.revision, res.status);
      // An edit made while this one was in flight is not saved yet, and saying so would lie.
      this.onState(this.pending || this.again ? 'dirty' : 'saved');
    } catch (err) {
      this.pending = true;
      this.failed = true;
      const failure = err instanceof ApiError
        ? err.failure
        : ({ kind: 'network', message: String(err) } as ApiFailure);
      this.onState('error', failure);
    } finally {
      this.inFlight = false;
      this.running = null;
      if (this.again && !this.disposed) {
        this.again = false;
        this.queue();
      }
    }
  }
}

/* ----------------------------------------------------------------- publishing */

export interface PublishCounts {
  seated: number;
  standby: number;
  cut: number;
}

/** What the confirmation says: seated, left in the pool as standby, and cut. */
export function rosterCounts(state: RosterState): PublishCounts {
  return {
    seated: state.roster.groups.flat().filter(Boolean).length,
    standby: state.pool.length,
    cut: state.cut.length,
  };
}

/** The roster exactly as it would be sent, to tell whether it moved after the leader confirmed. */
export function snapshotOf(state: RosterState): string {
  return JSON.stringify(slotsFrom(state));
}

export type PublishOutcome =
  | { kind: 'published'; result: PublishResult }
  /** A save failed. The saver has reported it; nothing was published. */
  | { kind: 'not-saved' }
  /** The roster is not what the leader confirmed. Nothing was published. */
  | { kind: 'changed' }
  /** A publish for this roster is already under way. */
  | { kind: 'busy' }
  | { kind: 'failed'; failure: ApiFailure };

const publishingStates = new WeakSet<RosterState>();

/**
 * Publish a roster only once every edit to it has been saved, and only if it is still the
 * roster the leader confirmed.
 *
 * In order: wait for the saver to land everything, an in-flight save and the edits queued
 * behind it included; stop if any of that failed; stop if the rows now differ from the
 * `confirmed` snapshot the counts on the confirmation came from; then publish at the
 * revision the last save was acknowledged at. A 409 on either request comes back as a
 * failure and is never retried here. The page freezes edits for the duration, so the
 * snapshot cannot move once this has started.
 */
export async function publishWhenSaved(
  access: RosterAccess,
  state: RosterState,
  saver: Saver | null,
  confirmed: string,
): Promise<PublishOutcome> {
  if (isDemo(state)) {
    return { kind: 'failed', failure: { kind: 'forbidden', message: 'The demo is never published.' } };
  }
  if (publishingStates.has(state)) return { kind: 'busy' };
  publishingStates.add(state);
  try {
    if (saver && !(await saver.settle())) return { kind: 'not-saved' };
    if (saver?.hasUnsaved()) return { kind: 'not-saved' };
    if (snapshotOf(state) !== confirmed) return { kind: 'changed' };
    try {
      const result = await publishRoster(access, state.revision);
      state.revision = result.revision;
      state.status = 'published';
      return { kind: 'published', result };
    } catch (err) {
      const failure = err instanceof ApiError
        ? err.failure
        : ({ kind: 'network', message: String(err) } as ApiFailure);
      return { kind: 'failed', failure };
    }
  } finally {
    publishingStates.delete(state);
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

/* ------------------------------------------------------------------- the demo */

/**
 * A roster to look at without a bot, a Discord account or a network.
 *
 * Roster mode is otherwise unreachable until somebody has installed Group Builder, made
 * an event and collected signups, which is a lot to ask of a person who only wants to see
 * whether the tool is worth the trouble. `#roster=demo` runs the whole interface against
 * made-up signups held in this file.
 *
 * The seventeen below are not a tidy raid on purpose. There are three tanks and only two
 * healers, nobody has brought a Shaman for Windfury, and several people signed up late or
 * as a maybe, so the pool, the buff panel and the warnings all have something to say the
 * moment it opens.
 */
const DEMO_SIGNUPS: Array<[string, string, string | null, string, string]> = [
  ['Grimbald', 'warrior', 'prot_war', 'tank', 'primary'],
  ['Thornhoof', 'druid', 'guardian', 'tank', 'primary'],
  ['Sanctia', 'paladin', 'prot_pal', 'tank', 'tentative'],
  ['Redwake', 'warrior', 'arms', 'melee', 'primary'],
  ['Morrik', 'warrior', 'fury', 'melee', 'primary'],
  ['Sliphand', 'rogue', 'combat', 'melee', 'primary'],
  ['Nettlebrand', 'rogue', 'assa', 'melee', 'late'],
  ['Ashfen', 'druid', 'feral', 'melee', 'primary'],
  ['Quillan', 'hunter', 'mm', 'ranged', 'primary'],
  ['Brackwater', 'hunter', 'bm', 'ranged', 'bench'],
  ['Emberly', 'mage', 'fire', 'ranged', 'primary'],
  ['Hollowmere', 'mage', 'frost', 'ranged', 'primary'],
  ['Vessk', 'warlock', 'destro', 'ranged', 'primary'],
  ['Dreadnall', 'warlock', 'affli', 'ranged', 'tentative'],
  ['Silentbell', 'priest', 'shadow', 'ranged', 'primary'],
  ['Lucentia', 'priest', 'holy_priest', 'healer', 'primary'],
  ['Wrenbough', 'druid', 'resto_druid', 'healer', 'late'],
];

/** The demo event, built fresh each time so nothing carries over between visits. */
export function demoPayload(): RosterPayload {
  const inTwoDays = Math.floor(Date.now() / 1000) + 60 * 60 * 48;
  return {
    event: {
      id: 'demo',
      title: 'Demo raid — Molten Core',
      // Rounded to the hour so it reads like a scheduled raid rather than a timestamp.
      startTime: inTwoDays - (inTwoDays % 3600),
      guildId: 'demo',
      channelId: 'demo',
      size: 40,
    },
    signups: DEMO_SIGNUPS.map(([name, classKey, specKey, roleKey, status], i) => ({
      signupId: i + 1,
      userId: 'demo:' + (i + 1),
      name,
      classKey,
      specKey,
      roleKey,
      status,
      position: i + 1,
    })),
    roster: null,
    permissions: { canEdit: true, canPublish: false },
  };
}

/** True for the demo event, which must never reach the network. */
export function isDemo(state: RosterState): boolean {
  return state.event.id === 'demo';
}

/* ------------------------------------------------------------- command docs */

/**
 * The bot's own description of its commands and how to set it up.
 *
 * Generated from the command builders, so it cannot drift from what the bot actually
 * accepts. The roster page had the setup steps written out by hand and three command
 * names changed underneath it within a day, which is the drift this exists to stop.
 *
 * Public and unauthenticated: no token goes near this call. It is an enhancement, never a
 * dependency — the page renders its own steps first and corrects them if this arrives.
 */
export interface CommandDoc {
  name: string;
  description: string;
  adminOnly: boolean;
  subcommands: Array<{ name: string; description: string }>;
  options: Array<{ name: string; description: string; required: boolean }>;
}

export interface CommandDocs {
  commands: CommandDoc[];
  guide: {
    setup: Array<{ title: string; body: string; link?: string }>;
    signingUp: string[];
    running: string[];
    gotchas: Array<{ problem: string; answer: string }>;
  };
  /** Unix seconds. */
  generatedAt: number;
}

/** Resolves to null rather than throwing: a page must not break because docs are down. */
export async function fetchCommandDocs(): Promise<CommandDocs | null> {
  try {
    const res = await fetch(API_BASE + '/api/v4/docs/commands', {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as CommandDocs;
    if (!Array.isArray(data.commands) || !data.guide) return null;
    return data;
  } catch {
    return null;
  }
}


/** Open events in a guild, for the picker. Authorised by the session, not a link. */
export interface GuildEvent {
  id: string;
  title: string;
  /** Unix seconds. */
  startTime: number;
  status: string;
  channelId: string;
  leaderId: string;
  isTest: boolean;
  signups: number;
  canEdit: boolean;
}

/** How far back the event list reaches. Matches the `days` the API accepts. */
export const EVENT_WINDOW_DAYS = 30;

export async function fetchGuildEvents(guildId: string): Promise<GuildEvent[]> {
  /* No status filter. Asking only for open events hid every raid that had already
     run, which made its roster unreachable from here even though the roster still
     existed and somebody was still seating it. The window does the narrowing
     instead, and the row says which events have ended. */
  const res = await fetch(
    API_BASE +
      '/api/v4/guilds/' +
      encodeURIComponent(guildId) +
      '/events?days=' +
      EVENT_WINDOW_DAYS,
    { credentials: 'include', headers: { Accept: 'application/json' } },
  );
  if (!res.ok) throw new ApiError({ kind: 'network', message: String(res.status) }, 'events');
  const data = (await res.json()) as { events?: GuildEvent[] };
  return data.events ?? [];
}
