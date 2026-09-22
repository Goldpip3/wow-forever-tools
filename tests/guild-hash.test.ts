import { describe, expect, it } from 'vitest';
import { guildHash, parseGuildHash } from '../src/guild/hash';

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
