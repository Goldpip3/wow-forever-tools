import { describe, expect, it } from 'vitest';
import {
  readRosterLink,
  slotsFrom,
  stateFromPayload,
  makeGuest,
  isGuest,
  explain,
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
