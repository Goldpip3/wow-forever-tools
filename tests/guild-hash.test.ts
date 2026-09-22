import { afterEach, describe, expect, it, vi } from 'vitest';
import { guildHash, parseGuildHash, writeGuildHash } from '../src/guild/hash';

describe('reading the address bar', () => {
  it('takes a server on its own', () => {
    expect(parseGuildHash('#guild=900000000000000001')).toEqual({
      guildId: '900000000000000001',
      characterId: null,
      demo: false,
    });
  });

  it('takes a server and a character', () => {
    expect(parseGuildHash('#guild=900000000000000001&c=42')).toEqual({
      guildId: '900000000000000001',
      characterId: 42,
      demo: false,
    });
  });

  it('reads the sample', () => {
    expect(parseGuildHash('#demo').demo).toBe(true);
  });

  it('answers empty for a bare page', () => {
    expect(parseGuildHash('')).toEqual({ guildId: null, characterId: null, demo: false });
  });

  it('drops a server id that is not a snowflake', () => {
    // Whatever comes out of here is pasted into a request path.
    for (const bad of ['#guild=../admin', '#guild=abc', '#guild=', '#guild=' + '9'.repeat(26)]) {
      expect(parseGuildHash(bad).guildId).toBeNull();
    }
  });

  it('drops a character id that is not a positive whole number', () => {
    for (const bad of ['#guild=1&c=0', '#guild=1&c=-3', '#guild=1&c=abc', '#guild=1&c=1.5']) {
      expect(parseGuildHash(bad).characterId).toBeNull();
    }
  });
});

describe('writing it back', () => {
  it('round-trips a server and a character', () => {
    const state = { guildId: '900000000000000001', characterId: 7, demo: false };
    expect(parseGuildHash(guildHash(state))).toEqual(state);
  });

  it('leaves the character off when none is open', () => {
    expect(guildHash({ guildId: '12345', characterId: null, demo: false })).toBe('#guild=12345');
  });

  it('writes nothing when no server is chosen', () => {
    expect(guildHash({ guildId: null, characterId: 7, demo: false })).toBe('');
  });

  it('writes the sample without a server, but keeps the open character', () => {
    expect(guildHash({ guildId: '12345', characterId: 7, demo: true })).toBe('#demo&c=7');
    expect(guildHash({ guildId: '12345', characterId: null, demo: true })).toBe('#demo');
  });

  it('round-trips a sample profile, so reloading one stays on it', () => {
    const state = { guildId: null, characterId: 7, demo: true };
    expect(parseGuildHash(guildHash(state))).toEqual(state);
  });
});

describe('which entries the Back button walks', () => {
  function page(hash: string) {
    const calls: Array<{ how: string; url: string }> = [];
    vi.stubGlobal('location', { pathname: '/guild.html', search: '', hash });
    vi.stubGlobal('history', {
      pushState: (_s: unknown, _t: string, url: string) => calls.push({ how: 'push', url }),
      replaceState: (_s: unknown, _t: string, url: string) => calls.push({ how: 'replace', url }),
    });
    return calls;
  }

  afterEach(() => vi.unstubAllGlobals());

  it('pushes when told to, so a profile is a place to come back from', () => {
    const calls = page('#guild=12345');
    writeGuildHash({ guildId: '12345', characterId: 7, demo: false }, 'push');
    expect(calls).toEqual([{ how: 'push', url: '/guild.html#guild=12345&c=7' }]);
  });

  it('replaces by default, because a search is not a place', () => {
    const calls = page('#guild=12345');
    writeGuildHash({ guildId: '12345', characterId: 7, demo: false });
    expect(calls[0]?.how).toBe('replace');
  });

  it('writes nothing at all when the address already says this', () => {
    // Otherwise every redraw would add an entry, and Back would do nothing
    // visible for as long as somebody kept typing in the search box.
    const calls = page('#guild=12345&c=7');
    writeGuildHash({ guildId: '12345', characterId: 7, demo: false }, 'push');
    expect(calls).toEqual([]);
  });
});
