import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  readRosterLink,
  slotsFrom,
  stateFromPayload,
  makeGuest,
  isGuest,
  explain,
  Saver,
  publishWhenSaved,
  rosterCounts,
  snapshotOf,
  ApiError,
  fetchRoster,
  saveRoster,
  publishRoster,
  type RosterPayload,
  type Signup,
} from '../src/raid/roster-mode';
import { specFromSignup, specKeyForSpecId } from '../src/raid/groupbuilder';
import { GROUP_COUNT, GROUP_SIZE } from '../src/raid/types';

function signup(over: Partial<Signup> & { userId: string }): Signup {
  return {
    signupId: 1,
    name: 'Someone',
    classKey: 'hunter',
    specKey: 'bm',
    roleKey: 'ranged',
    status: 'primary',
    position: 1,
    ...over,
  };
}

function payload(over: Partial<RosterPayload> = {}): RosterPayload {
  return {
    event: {
      id: '1549477265039958172',
      title: 'What are you playing?',
      startTime: 1789063200,
      guildId: '1148995940930293900',
      channelId: 'c',
      size: 40,
    },
    signups: [],
    roster: null,
    permissions: { canEdit: true, canPublish: true },
    ...over,
  };
}

describe('the link', () => {
  it('reads the event and the token out of the fragment', () => {
    const link = readRosterLink('#roster=1549477265039958172&t=abc.def.ghi');
    expect(link).toEqual({ eventId: '1549477265039958172', token: 'abc.def.ghi' });
  });

  it('stays in planner mode when there is no roster key', () => {
    expect(readRosterLink('')).toBeNull();
    expect(readRosterLink('#')).toBeNull();
    // A planner roster code must never be mistaken for a roster link.
    expect(readRosterLink('#N4IgdghgtgpiBcIQBcCWAdgcwE4gFwgAcAXA')).toBeNull();
  });

  it('refuses a link with an event but no token', () => {
    expect(readRosterLink('#roster=123')).toBeNull();
  });
});

describe('reading a payload', () => {
  it('puts every signup in the pool when no roster has been saved', () => {
    const state = stateFromPayload(
      payload({
        signups: [
          signup({ userId: '1', name: 'Anna' }),
          signup({ userId: '2', name: 'Bob', classKey: 'priest', specKey: 'holy_priest' }),
        ],
      }),
    );
    expect(state.pool.map((p) => p.name)).toEqual(['Anna', 'Bob']);
    expect(state.roster.groups.flat().filter(Boolean)).toHaveLength(0);
    // No revision yet: the first save must omit it entirely.
    expect(state.revision).toBeNull();
  });

  it('seats people from a saved roster and keeps the revision', () => {
    const state = stateFromPayload(
      payload({
        signups: [signup({ userId: '1', name: 'Anna' })],
        roster: {
          revision: 3,
          status: 'draft',
          publishedAt: null,
          slots: [
            {
              signupId: 8, userId: '1', displayName: 'Anna', classKey: 'hunter',
              specKey: 'bm', decision: 'selected', groupIndex: 0, slotIndex: 1, loadout: {},
            },
          ],
        },
      }),
    );
    expect(state.revision).toBe(3);
    expect(state.roster.groups[0]![1]!.name).toBe('Anna');
    expect(state.pool).toHaveLength(0);
  });

  it('keeps a published roster published', () => {
    const state = stateFromPayload(
      payload({
        roster: { revision: 9, status: 'published', publishedAt: 1789000000, slots: [] },
      }),
    );
    expect(state.status).toBe('published');
  });

  it('keeps someone whose signup has been withdrawn, so the hole is visible', () => {
    const state = stateFromPayload(
      payload({
        signups: [],
        roster: {
          revision: 2, status: 'draft', publishedAt: null,
          slots: [{
            signupId: null, userId: '99', displayName: 'Ghost', classKey: 'mage',
            specKey: 'frost', decision: 'selected', groupIndex: 2, slotIndex: 0, loadout: {},
          }],
        },
      }),
    );
    const seated = state.roster.groups[2]![0]!;
    expect(seated.name).toBe('Ghost');
    expect(seated.discord?.signupStatus).toBe('withdrawn');
  });

  it('treats a signup with no spec as poolable rather than dropping the person', () => {
    const state = stateFromPayload(
      payload({ signups: [signup({ userId: '1', name: 'Unset', specKey: null, roleKey: null })] }),
    );
    expect(state.pool).toHaveLength(1);
    expect(state.unmapped).toHaveLength(0);
  });

  it('reports a class it cannot read instead of silently losing them', () => {
    const state = stateFromPayload(
      payload({ signups: [signup({ userId: '1', name: 'Odd', classKey: 'necromancer' })] }),
    );
    expect(state.pool).toHaveLength(0);
    expect(state.unmapped.map((s) => s.name)).toEqual(['Odd']);
  });
});

describe('the payload sent back', () => {
  function seated(count: number): ReturnType<typeof stateFromPayload> {
    const signups = Array.from({ length: count }, (_, i) =>
      signup({ userId: String(i + 1), signupId: i + 1, name: 'P' + (i + 1) }));
    const state = stateFromPayload(payload({ signups }));
    // Seat them all, filling group by group.
    let n = 0;
    for (let g = 0; g < GROUP_COUNT && n < count; g += 1) {
      for (let s = 0; s < GROUP_SIZE && n < count; s += 1) {
        state.roster.groups[g]![s] = state.pool.shift()!;
        n += 1;
      }
    }
    return state;
  }

  it('gives a selected slot both indexes and a standby slot neither', () => {
    const state = seated(3);
    state.pool.push(state.roster.groups[0]![2]!);
    state.roster.groups[0]![2] = null;

    const slots = slotsFrom(state);
    for (const slot of slots) {
      if (slot.decision === 'selected') {
        expect(typeof slot.groupIndex, slot.displayName).toBe('number');
        expect(typeof slot.slotIndex, slot.displayName).toBe('number');
      } else {
        expect(slot.groupIndex, slot.displayName).toBeNull();
        expect(slot.slotIndex, slot.displayName).toBeNull();
      }
    }
  });

  it('never repeats a userId or a seat', () => {
    const state = seated(12);
    state.cut.push(state.pool.shift() ?? state.roster.groups[1]![0]!);
    const slots = slotsFrom(state);

    const users = slots.map((s) => s.userId);
    expect(new Set(users).size).toBe(users.length);

    const seats = slots
      .filter((s) => s.decision === 'selected')
      .map((s) => s.groupIndex + ':' + s.slotIndex);
    expect(new Set(seats).size).toBe(seats.length);
  });

  it('sends everyone on every save, because a PUT replaces the whole set', () => {
    // Six signed up, five are seated, so one is left to cut.
    const state = seated(6);
    state.pool.push(state.roster.groups[1]![0]!);
    state.roster.groups[1]![0] = null;
    state.cut.push(state.pool.pop()!);
    const slots = slotsFrom(state);
    const everyone =
      state.roster.groups.flat().filter(Boolean).length + state.pool.length + state.cut.length;
    expect(slots).toHaveLength(everyone);
  });

  it('stays inside the 240 slot ceiling for a full 40-man', () => {
    expect(slotsFrom(seated(40)).length).toBeLessThanOrEqual(240);
  });

  it('writes back the spec key the signup came in with', () => {
    const state = stateFromPayload(
      payload({
        signups: [
          signup({ userId: '1', classKey: 'druid', specKey: 'guardian' }),
          signup({ userId: '2', classKey: 'druid', specKey: 'feral' }),
          signup({ userId: '3', classKey: 'shaman', specKey: 'resto_sham' }),
        ],
      }),
    );
    const byUser = new Map(slotsFrom(state).map((s) => [s.userId, s]));
    // Feral and Guardian share one talent tree, so the role is what tells them apart.
    expect(byUser.get('1')!.specKey).toBe('guardian');
    expect(byUser.get('2')!.specKey).toBe('feral');
    expect(byUser.get('3')!.specKey).toBe('resto_sham');
  });

  it('caps a display name at the hundred characters the server allows', () => {
    const state = stateFromPayload(
      payload({ signups: [signup({ userId: '1', name: 'x'.repeat(200) })] }),
    );
    expect(slotsFrom(state)[0]!.displayName).toHaveLength(100);
  });
});

describe('guests', () => {
  it('gets a unique synthetic id and no signup', () => {
    const taken = new Set(['guest:1']);
    const guest = makeGuest('mage', 61, 'Ringer', taken);
    expect(guest.discord).toEqual({ userId: 'guest:2', signupId: null, signupStatus: 'guest' });
    expect(isGuest(guest)).toBe(true);
  });

  it('is sent as a slot with a null signupId', () => {
    const state = stateFromPayload(payload());
    state.roster.groups[0]![0] = makeGuest('mage', 61, 'Ringer', new Set());
    const slots = slotsFrom(state);
    expect(slots).toHaveLength(1);
    expect(slots[0]!.signupId).toBeNull();
    expect(slots[0]!.decision).toBe('selected');
  });
});

describe('spec keys', () => {
  const ALL: Record<string, string[]> = {
    warrior: ['arms', 'fury', 'prot_war'],
    paladin: ['holy_pal', 'prot_pal', 'ret'],
    hunter: ['bm', 'mm', 'surv'],
    rogue: ['assa', 'combat', 'sub'],
    priest: ['disc', 'holy_priest', 'shadow'],
    shaman: ['ele', 'enh', 'resto_sham'],
    mage: ['arcane', 'fire', 'frost'],
    warlock: ['affli', 'demo', 'destro'],
    druid: ['balance', 'feral', 'guardian', 'resto_druid'],
  };

  it('round-trips all 28 of the contract keys', () => {
    for (const [classKey, specKeys] of Object.entries(ALL)) {
      for (const specKey of specKeys) {
        const mapped = specFromSignup(classKey, specKey);
        expect(mapped, classKey + '/' + specKey).not.toBeNull();
        expect(specKeyForSpecId(mapped!.specId, mapped!.role), classKey + '/' + specKey)
          .toBe(specKey);
      }
    }
  });

  it('covers exactly 28 specs and no more', () => {
    expect(Object.values(ALL).flat()).toHaveLength(28);
  });
});

describe('what the leader is told', () => {
  it('tells them to get a fresh link when the token has gone', () => {
    expect(explain({ kind: 'auth' })).toMatch(/\/roster/);
  });

  it('says their copy was stale on a conflict rather than blaming them', () => {
    expect(explain({ kind: 'conflict', currentRevision: 7 })).toMatch(/out of date/i);
  });

  it('passes the validation detail from the server straight through', () => {
    const text = explain({
      kind: 'invalid',
      message: 'Group 3 slot 2 has two players in it.',
      details: ['slots.4.slotIndex: duplicate'],
    });
    expect(text).toContain('Group 3 slot 2');
    expect(text).toContain('slots.4.slotIndex');
  });
});

describe('what a publish reports', () => {
  /**
   * couldNotDm is the one place a publish admits somebody was not reached, and the planner
   * shows it in red. Group Builder guarantees a fabricated signup appears in
   * skippedTestAccounts or nowhere, never in couldNotDm. The planner renders them as two
   * separate things so the guarantee is visible to the leader rather than merely true.
   */
  it('keeps skipped test accounts out of the unreachable list', () => {
    const result = {
      revision: 5,
      selected: 20,
      standby: 4,
      cut: 0,
      messageUrl: 'https://discord.com/channels/1/2/3',
      notified: 19,
      couldNotDm: [{ userId: '140665854328176640', displayName: 'Bob' }],
      skippedTestAccounts: [
        { userId: 'test:warrior:3', displayName: 'Tharivol' },
        { userId: 'test:mage:1', displayName: 'Emberly' },
      ],
      dmMode: 'selected+standby',
    };

    const ids = new Set(result.couldNotDm.map((p) => p.userId));
    for (const fake of result.skippedTestAccounts) {
      expect(ids.has(fake.userId), fake.displayName).toBe(false);
    }
    expect(result.couldNotDm).toHaveLength(1);
  });

  it('treats the field as always present, empty on a normal event', () => {
    // The bot guarantees the key exists, so nothing here should need an undefined check.
    const normal = { couldNotDm: [], skippedTestAccounts: [] };
    expect(Array.isArray(normal.skippedTestAccounts)).toBe(true);
    expect(normal.skippedTestAccounts).toHaveLength(0);
  });
});

describe('publishing waits for the save', () => {
  type Pending = { body: { revision?: number }; resolve: (r: Response) => void };

  function setup() {
    const calls: Pending[] = [];
    vi.stubGlobal('window', { setTimeout, clearTimeout });
    vi.stubGlobal(
      'fetch',
      (_url: string, init: { body: string }) =>
        new Promise<Response>((resolve) => calls.push({ body: JSON.parse(init.body), resolve })),
    );
    const state = { revision: 3 as number | null };
    const states: string[] = [];
    const saver = new Saver(
      { eventId: '1', link: { eventId: '1', token: 't' } },
      () => ({ slots: [], revision: state.revision }),
      (revision) => (state.revision = revision),
      (s) => states.push(s),
      10_000,
    );
    const ok = (json: unknown) => new Response(JSON.stringify(json), { status: 200 });
    return { calls, state, states, saver, ok };
  }

  afterEach(() => vi.unstubAllGlobals());

  it('saves a queued edit and resolves only once the new revision is in', async () => {
    const { calls, state, saver, ok } = setup();
    saver.queue();
    let settled: boolean | undefined;
    const done = saver.settle().then((v) => (settled = v));
    await Promise.resolve();
    expect(calls).toHaveLength(1);
    expect(calls[0].body.revision).toBe(3);
    await new Promise((r) => setTimeout(r, 5));
    expect(settled).toBeUndefined();
    calls[0].resolve(ok({ revision: 4, status: 'draft', slotCount: 0 }));
    await done;
    expect(settled).toBe(true);
    expect(state.revision).toBe(4);
  });

  it('waits for a save already in flight and the edit made during it', async () => {
    const { calls, state, saver, ok } = setup();
    saver.queue();
    saver.flush();
    saver.queue();
    const done = saver.settle();
    calls[0].resolve(ok({ revision: 4, status: 'draft', slotCount: 0 }));
    await new Promise((r) => setTimeout(r, 5));
    expect(calls).toHaveLength(2);
    expect(calls[1].body.revision).toBe(4);
    calls[1].resolve(ok({ revision: 5, status: 'draft', slotCount: 0 }));
    expect(await done).toBe(true);
    expect(state.revision).toBe(5);
  });

  it('does not let the publish go ahead when the save fails', async () => {
    const { calls, states, saver } = setup();
    saver.queue();
    const done = saver.settle();
    await Promise.resolve();
    calls[0].resolve(new Response(JSON.stringify({ currentRevision: 9 }), { status: 409 }));
    expect(await done).toBe(false);
    expect(states).toContain('error');
    expect(calls).toHaveLength(1);
  });

  it('resolves at once with nothing to save', async () => {
    const { calls, saver } = setup();
    expect(await saver.settle()).toBe(true);
    expect(calls).toHaveLength(0);
  });
});

describe('the demo never reaches the network', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('refuses to fetch, save or publish the demo event, before any request is made', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', async () => {
      calls += 1;
      return new Response('{}', { status: 200 });
    });
    const demo = { eventId: 'demo', link: null };
    await expect(fetchRoster(demo)).rejects.toBeInstanceOf(ApiError);
    await expect(saveRoster(demo, [], 1)).rejects.toBeInstanceOf(ApiError);
    await expect(publishRoster(demo, 1)).rejects.toBeInstanceOf(ApiError);
    await expect(saveRoster({ eventId: '', link: null }, [], 1)).rejects.toBeInstanceOf(ApiError);
    expect(calls).toBe(0);
  });
});

describe('a saver finishing after its roster was left', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('says it has unsaved work while an edit is queued or in flight, and not after', async () => {
    const calls: Array<(r: Response) => void> = [];
    vi.stubGlobal('window', { setTimeout, clearTimeout });
    vi.stubGlobal('fetch', () => new Promise<Response>((resolve) => calls.push(resolve)));
    const saver = new Saver({ eventId: '1', link: null }, () => ({ slots: [], revision: 1 }), () => {}, () => {}, 10_000);
    expect(saver.hasUnsaved()).toBe(false);
    saver.queue();
    expect(saver.hasUnsaved()).toBe(true);
    const done = saver.settle();
    await Promise.resolve();
    expect(saver.hasUnsaved()).toBe(true);
    calls[0]!(new Response(JSON.stringify({ revision: 2, status: 'draft', slotCount: 0 }), { status: 200 }));
    expect(await done).toBe(true);
    expect(saver.hasUnsaved()).toBe(false);
  });

  it('carries only the state it was given, whatever the page moves on to', async () => {
    const bodies: Array<{ slots: Array<{ userId: string }> }> = [];
    vi.stubGlobal('window', { setTimeout, clearTimeout });
    vi.stubGlobal('fetch', async (_u: string, init: { body: string }) => {
      bodies.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ revision: 2, status: 'draft', slotCount: 1 }), { status: 200 });
    });
    const eventA = stateFromPayload(payload({ signups: [signup({ userId: 'a1', name: 'Alpha' })] }));
    eventA.roster.groups[0]![0] = eventA.pool.shift()!;
    // The page's own roster variable, which a saver must never read.
    let page = eventA;
    const saver = new Saver({ eventId: '1', link: null }, () => ({ slots: slotsFrom(eventA), revision: eventA.revision }), () => {}, () => {}, 10_000);
    saver.queue();
    page = stateFromPayload(payload({ signups: [signup({ userId: 'b1', name: 'Bravo' })] }));
    page.roster.groups[0]![0] = page.pool.shift()!;
    expect(await saver.settle()).toBe(true);
    expect(bodies).toHaveLength(1);
    expect(bodies[0]!.slots.map((s) => s.userId)).toEqual(['a1']);
  });
});

describe('publishing after saving', () => {
  type Step = { method: string; revision: number | null; resolve: (r: Response) => void };

  /**
   * A bot that answers only when told to, and a log of what reached it in order. Each
   * request records the revision it carried, so a test can check the whole sequence.
   */
  function bot() {
    const log: Step[] = [];
    vi.stubGlobal('window', { setTimeout, clearTimeout });
    vi.stubGlobal('fetch', (_url: string, init: { method: string; body: string }) =>
      new Promise<Response>((resolve) => {
        const body = JSON.parse(init.body) as { revision?: number };
        log.push({ method: init.method, revision: body.revision ?? null, resolve });
      }),
    );
    const ok = (json: unknown) => new Response(JSON.stringify(json), { status: 200 });
    const saved = (revision: number) => ok({ revision, status: 'draft', slotCount: 1 });
    const published = (revision: number) =>
      ok({ revision, selected: 1, standby: 1, cut: 0, messageUrl: '', notified: 1, couldNotDm: [], skippedTestAccounts: [], dmMode: 'dm' });
    const tick = () => new Promise((r) => setTimeout(r, 0));
    const order = () => log.map((s) => s.method + '@' + s.revision);
    return { log, saved, published, tick, order };
  }

  /** An event at revision 3 with two signups, one of them seated. */
  function event() {
    const state = stateFromPayload(payload({
      signups: [signup({ userId: 'u1', name: 'One' }), signup({ userId: 'u2', name: 'Two' })],
    }));
    state.revision = 3;
    state.roster.groups[0]![0] = state.pool.shift()!;
    const states: string[] = [];
    const saver = new Saver(
      { eventId: '42', link: null },
      () => ({ slots: slotsFrom(state), revision: state.revision }),
      (revision, status) => {
        state.revision = revision;
        state.status = status;
      },
      (s) => states.push(s),
      10_000,
    );
    const seatTheOther = () => {
      state.roster.groups[0]![1] = state.pool.shift()!;
      saver.queue();
    };
    return { state, saver, states, seatTheOther, access: { eventId: '42', link: null } };
  }

  afterEach(() => vi.unstubAllGlobals());

  it('waits out a slow save and the edit made during it, then publishes at the last acknowledged revision', async () => {
    const { log, saved, published, tick, order } = bot();
    const { state, saver, states, seatTheOther, access } = event();

    saver.queue();
    saver.flush(); // the first save leaves at revision 3 and hangs
    await tick();
    seatTheOther(); // a second edit while it is in flight
    const confirmed = snapshotOf(state);
    const outcome = publishWhenSaved(access, state, saver, confirmed);
    await tick();
    expect(order()).toEqual(['PUT@3']);

    log[0]!.resolve(saved(4));
    await tick();
    await tick();
    // The first save landing is not "saved": the second edit is still waiting.
    expect(states).not.toContain('saved');
    expect(order()).toEqual(['PUT@3', 'PUT@4']);

    log[1]!.resolve(saved(5));
    await tick();
    await tick();
    expect(order()).toEqual(['PUT@3', 'PUT@4', 'POST@5']);

    log[2]!.resolve(published(6));
    const result = await outcome;
    expect(result.kind).toBe('published');
    expect(state.revision).toBe(6);
    expect(state.status).toBe('published');
    expect(states[states.length - 1]).toBe('saved');
  });

  it('publishes straight away when nothing is waiting to be saved', async () => {
    const { log, published, tick, order } = bot();
    const { state, saver, access } = event();
    const outcome = publishWhenSaved(access, state, saver, snapshotOf(state));
    await tick();
    expect(order()).toEqual(['POST@3']);
    log[0]!.resolve(published(4));
    expect((await outcome).kind).toBe('published');
  });

  it('does not publish when the save fails', async () => {
    const { log, tick, order } = bot();
    const { state, saver, states, seatTheOther, access } = event();
    seatTheOther();
    const outcome = publishWhenSaved(access, state, saver, snapshotOf(state));
    await tick();
    log[0]!.resolve(new Response('{"error":"boom"}', { status: 500 }));
    expect((await outcome).kind).toBe('not-saved');
    expect(order()).toEqual(['PUT@3']);
    expect(states).toContain('error');
  });

  it('does not publish, or retry, when the save meets a conflict', async () => {
    const { log, tick, order } = bot();
    const { state, saver, seatTheOther, access } = event();
    seatTheOther();
    const outcome = publishWhenSaved(access, state, saver, snapshotOf(state));
    await tick();
    log[0]!.resolve(new Response('{"currentRevision":9}', { status: 409 }));
    expect((await outcome).kind).toBe('not-saved');
    await tick();
    expect(order()).toEqual(['PUT@3']);
    expect(state.revision).toBe(3);
  });

  it('reports a conflict on the publish itself without trying again', async () => {
    const { log, tick, order } = bot();
    const { state, saver, access } = event();
    const outcome = publishWhenSaved(access, state, saver, snapshotOf(state));
    await tick();
    log[0]!.resolve(new Response('{"currentRevision":9}', { status: 409 }));
    const result = await outcome;
    expect(result).toEqual({ kind: 'failed', failure: { kind: 'conflict', currentRevision: 9 } });
    expect(order()).toEqual(['POST@3']);
    expect(state.status).not.toBe('published');
  });

  it('sends one publish for two presses', async () => {
    const { log, published, tick, order } = bot();
    const { state, saver, access } = event();
    const confirmed = snapshotOf(state);
    const first = publishWhenSaved(access, state, saver, confirmed);
    const second = publishWhenSaved(access, state, saver, confirmed);
    expect((await second).kind).toBe('busy');
    await tick();
    log[0]!.resolve(published(4));
    expect((await first).kind).toBe('published');
    expect(order()).toEqual(['POST@3']);
  });

  it('does not publish a roster that moved after the leader confirmed its counts', async () => {
    const { log, saved, tick, order } = bot();
    const { state, saver, seatTheOther, access } = event();
    const confirmed = snapshotOf(state);
    expect(rosterCounts(state)).toEqual({ seated: 1, standby: 1, cut: 0 });
    seatTheOther();
    const outcome = publishWhenSaved(access, state, saver, confirmed);
    await tick();
    log[0]!.resolve(saved(4));
    expect((await outcome).kind).toBe('changed');
    expect(order()).toEqual(['PUT@3']);
  });

  it('never publishes the demo', async () => {
    const { order } = bot();
    const demo = stateFromPayload(payload({ event: { ...payload().event, id: 'demo' } }));
    const result = await publishWhenSaved({ eventId: 'demo', link: null }, demo, null, snapshotOf(demo));
    expect(result.kind).toBe('failed');
    expect(order()).toEqual([]);
  });
});

describe('every edit to a real roster survives a save and a reload', () => {
  /** What the bot would hand back after storing these rows. */
  function reload(state: ReturnType<typeof stateFromPayload>, signups: Signup[]) {
    return stateFromPayload(payload({
      signups,
      roster: { revision: 2, status: 'draft', publishedAt: null, slots: JSON.parse(JSON.stringify(slotsFrom(state))) },
    }));
  }
  const seatedIds = (state: ReturnType<typeof stateFromPayload>) =>
    state.roster.groups.flatMap((g, gi) => g.map((p, si) => (p ? gi + ':' + si + ':' + p.discord!.userId : null))).filter(Boolean);

  it('keeps a rename, a spec, a loadout pick, a talent toggle and a pasted build', () => {
    const signups = [signup({ userId: 'u1', name: 'Hunter', classKey: 'hunter', specKey: 'bm' })];
    const state = stateFromPayload(payload({ signups }));
    const player = state.pool.shift()!;
    state.roster.groups[1]![2] = player;
    player.name = 'Renamed';
    player.loadout['hunter-aspect'] = ['aspect-of-the-pack'];
    player.talentToggles['trueshot-aura'] = true;
    player.build = 'hunter/60/05';

    const back = reload(state, signups);
    const again = back.roster.groups[1]![2]!;
    expect(again.name).toBe('Renamed');
    expect(again.loadout['hunter-aspect']).toEqual(['aspect-of-the-pack']);
    expect(again.talentToggles['trueshot-aura']).toBe(true);
    expect(again.build).toBe('hunter/60/05');
    // The extras travel under their own keys and never turn into a choice group.
    expect(Object.keys(again.loadout)).not.toContain('_talents');
    expect(Object.keys(again.loadout)).not.toContain('_build');
  });

  it('drops loadout values of the wrong shape rather than trusting them', () => {
    const signups = [signup({ userId: 'u1' })];
    const state = stateFromPayload(payload({
      signups,
      roster: { revision: 1, status: 'draft', publishedAt: null, slots: [{
        signupId: 1, userId: 'u1', displayName: 'X', classKey: 'hunter', specKey: 'bm',
        decision: 'selected', groupIndex: 0, slotIndex: 0,
        loadout: { good: ['a'], bad: 'nope', worse: [1, 2], _talents: { t: 'yes', u: false }, _build: 7 },
      }] },
    }));
    const p = state.roster.groups[0]![0]!;
    expect(p.loadout.good).toEqual(['a']);
    expect(p.loadout.bad).toBeUndefined();
    expect(p.loadout.worse).toBeUndefined();
    expect(p.talentToggles).toEqual(expect.objectContaining({ u: false }));
    expect(p.talentToggles.t).toBeUndefined();
    expect(p.build).toBeUndefined();
  });

  it('puts every filled seat back where it was, guests included', () => {
    const signups = [signup({ userId: 'u1' }), signup({ userId: 'u2', name: 'Two' }), signup({ userId: 'u3', name: 'Three' })];
    const state = stateFromPayload(payload({ signups }));
    state.roster.groups[0]![0] = state.pool.shift()!;
    state.roster.groups[3]![4] = state.pool.shift()!;
    state.roster.groups[7]![1] = makeGuest('mage', 61, 'Ringer', new Set());
    const before = seatedIds(state);
    expect(slotsFrom(state).filter((s) => s.decision === 'selected')).toHaveLength(before.length);
    expect(seatedIds(reload(state, signups))).toEqual(before);
  });

  it('gives a guest the same identity after a reload, and still calls them a guest', () => {
    const state = stateFromPayload(payload());
    const guest = makeGuest('mage', 61, 'Ringer', new Set(['guest:1']));
    state.roster.groups[0]![0] = guest;
    const again = reload(state, []).roster.groups[0]![0]!;
    expect(again.discord).toEqual({ userId: 'guest:2', signupId: null, signupStatus: 'guest' });
    expect(again.id).toBe(guest.id);
    // A second guest does not take the first one's id.
    const taken = new Set(['guest:2']);
    expect(makeGuest('priest', 201, 'Another', taken).discord!.userId).toBe('guest:1');
  });

  it('keeps what each member said apart from what the leader decided', () => {
    const signups = [
      signup({ userId: 'late', status: 'late' }),
      signup({ userId: 'tent', name: 'Tent', status: 'tentative' }),
      signup({ userId: 'prim', name: 'Prim', status: 'primary' }),
    ];
    const state = stateFromPayload(payload({ signups }));
    const take = (id: string) => {
      const at = state.pool.findIndex((p) => p.discord!.userId === id);
      return state.pool.splice(at, 1)[0]!;
    };
    state.roster.groups[0]![0] = take('tent'); // tentative, selected
    state.cut.push(take('prim'));               // primary, cut
    // 'late' stays in the pool: late, standby

    const rows = Object.fromEntries(slotsFrom(state).map((r) => [r.userId, r.decision]));
    expect(rows).toEqual({ tent: 'selected', prim: 'cut', late: 'standby' });

    const back = reload(state, signups);
    const status = (p: { discord?: { userId: string; signupStatus: string } }) => [p.discord!.userId, p.discord!.signupStatus];
    expect(status(back.roster.groups[0]![0]!)).toEqual(['tent', 'tentative']);
    expect(back.cut.map(status)).toEqual([['prim', 'primary']]);
    expect(back.pool.map(status)).toEqual([['late', 'late']]);
    expect(Object.fromEntries(slotsFrom(back).map((r) => [r.userId, r.decision]))).toEqual(rows);
  });
});
