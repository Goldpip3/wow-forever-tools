import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchCharacter, fetchCharacters, GuildApiError } from '../src/guild/api';

/**
 * What the page does with an answer it did not expect.
 *
 * Three things used to go wrong here. A request the page had moved on from still
 * counted, so the answer for one server could replace another. An answer with
 * the wrong shape was walked as though it were right, and threw three frames
 * later somewhere unrelated. And a request to a bot that was up but wedged never
 * settled at all.
 */

const GUILD = '900000000000000001';

const listAnswer = {
  guild: { id: GUILD, name: 'Nightfall' },
  you: { userId: '1', isOfficer: false, isLeader: false },
  characters: [],
};

const detailAnswer = {
  character: { id: 7, name: 'Thrallsbane' },
  gear: null,
  attendance: { events: 0, present: 0, late: 0, absent: 0, last: null },
  permissions: { canEdit: false },
};

function answers(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  const spy = vi.fn(async (_url: string, _call?: { signal?: AbortSignal }) => ({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => body,
  }) as unknown as Response);
  vi.stubGlobal('fetch', spy);
  return spy;
}

afterEach(() => vi.unstubAllGlobals());

describe('a read that lands', () => {
  it('gives back the list', async () => {
    answers(listAnswer);
    await expect(fetchCharacters(GUILD)).resolves.toEqual(listAnswer);
  });

  it('carries the signal, so navigation can drop it', async () => {
    const spy = answers(listAnswer);
    const controller = new AbortController();
    await fetchCharacters(GUILD, controller.signal);
    expect(spy.mock.calls[0]?.[1]?.signal).toBeDefined();
  });
});

describe('a read the page gave up on', () => {
  it('says it was aborted rather than that the bot is offline', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new DOMException('aborted', 'AbortError');
    });

    const error = await fetchCharacters(GUILD).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GuildApiError);
    expect((error as GuildApiError).aborted).toBe(true);
  });

  it('says the bot was slow when it ran out of time, and that is not an abort', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new DOMException('timed out', 'TimeoutError');
    });

    const error = (await fetchCharacters(GUILD).catch((e: unknown) => e)) as GuildApiError;
    expect(error.aborted).toBe(false);
    expect(error.message).toContain('too long');
  });

  it('says the bot is unreachable for anything else', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('failed to fetch');
    });

    const error = (await fetchCharacters(GUILD).catch((e: unknown) => e)) as GuildApiError;
    expect(error.aborted).toBe(false);
    expect(error.message).toContain('Could not reach the bot');
  });
});

describe('an answer the page cannot read', () => {
  it('refuses a list with no characters in it at all', async () => {
    answers({ guild: { id: GUILD }, you: { userId: '1' } });
    await expect(fetchCharacters(GUILD)).rejects.toThrow('could not read');
  });

  it('refuses a list from something that is not this API', async () => {
    answers({ message: 'hello' });
    await expect(fetchCharacters(GUILD)).rejects.toThrow('could not read');
  });

  it('refuses a profile with no character on it', async () => {
    answers({ gear: null });
    await expect(fetchCharacter(GUILD, 7)).rejects.toThrow('could not read');
  });

  it('takes a profile that has what the page walks', async () => {
    answers(detailAnswer);
    await expect(fetchCharacter(GUILD, 7)).resolves.toEqual(detailAnswer);
  });
});

describe('an answer that is an error', () => {
  it('shows the sentence the bot wrote', async () => {
    answers({ error: 'Thrallsbane is already registered to Ava.' }, { ok: false, status: 409 });
    const error = (await fetchCharacters(GUILD).catch((e: unknown) => e)) as GuildApiError;
    expect(error.status).toBe(409);
    expect(error.message).toContain('already registered');
  });

  it('says to sign in again on a 401, which the bot does not word itself', async () => {
    answers({}, { ok: false, status: 401 });
    const error = (await fetchCharacters(GUILD).catch((e: unknown) => e)) as GuildApiError;
    expect(error.message).toContain('Sign in again');
  });
});
