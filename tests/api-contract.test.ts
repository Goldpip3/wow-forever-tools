import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  API_CONTRACT,
  apiIdentity,
  contractProblem,
  GUILD_CAPABILITIES,
  hasCapability,
  loadApiIdentity,
  resetApiIdentity,
  type ApiIdentity,
} from '../src/shared/api-contract';
import { BUILD_ID } from '../src/shared/build';
import { feedbackTemplate } from '../src/shared/feedback';

/**
 * The site and the bot deploy separately, so one of them is often behind. In
 * September 2026 the deployed guild form asked for a realm while the source
 * asked for a ruleset, and finding that out took reading git. These are the
 * checks that make the page say it instead.
 */

const identity = (over: Partial<ApiIdentity> = {}): ApiIdentity => ({
  api: API_CONTRACT,
  version: '0.1.0',
  build: 'a1a0e002336d',
  capabilities: ['characters', 'characters.ruleset', 'roster', 'docs'],
  ...over,
});

beforeEach(() => resetApiIdentity());
afterEach(() => {
  vi.unstubAllGlobals();
  resetApiIdentity();
});

describe('whether the two builds can work together', () => {
  it('says nothing when they agree', () => {
    expect(contractProblem(identity(), GUILD_CAPABILITIES)).toBeNull();
  });

  it('says the bot is behind, and which number each side speaks', () => {
    const problem = contractProblem(identity({ api: 3 }), GUILD_CAPABILITIES);
    expect(problem).toContain('API 3');
    expect(problem).toContain(String(API_CONTRACT));
    expect(problem).toContain('not been updated');
  });

  it('tells a reader on a stale page to reload, because that is their move', () => {
    const problem = contractProblem(identity({ api: 5 }), GUILD_CAPABILITIES);
    expect(problem).toContain('Reload');
  });

  it('names the capability the bot has not got rather than failing later', () => {
    const problem = contractProblem(identity({ capabilities: ['roster'] }), ['characters']);
    expect(problem).toContain('characters');
  });

  it('invents no problem when nobody answered', () => {
    // An unreachable API is reported by the request that needed it, with a
    // message about the thing the reader was trying to do.
    expect(contractProblem(null, GUILD_CAPABILITIES)).toBeNull();
  });
});

describe('asking what is deployed', () => {
  function answers(body: unknown, ok = true): void {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok, json: async () => body }) as unknown as Response),
    );
  }

  it('remembers the answer, and asks once', async () => {
    answers(identity());
    await loadApiIdentity();
    await loadApiIdentity();
    expect(apiIdentity()?.build).toBe('a1a0e002336d');
    expect(hasCapability('characters.ruleset')).toBe(true);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });

  it('holds nothing when the bot is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    expect(await loadApiIdentity()).toBeNull();
    expect(apiIdentity()).toBeNull();
    // Not knowing is not the same as knowing it lacks something.
    expect(hasCapability('characters')).toBe(false);
  });

  it('refuses an answer with no version in it', async () => {
    answers({ capabilities: ['characters'] });
    expect(await loadApiIdentity()).toBeNull();
  });

  it('drops capability entries that are not names', async () => {
    answers({ api: API_CONTRACT, capabilities: ['characters', 7, null] });
    const read = await loadApiIdentity();
    expect(read?.capabilities).toEqual(['characters']);
  });
});

describe('a bug report', () => {
  it('names the build it came from, so a fixed bug is not reported twice', () => {
    const report = feedbackTemplate('/guild.html', 'simrev');
    expect(report).toContain('Site build: ' + BUILD_ID);
    expect(report).toContain('Bot build: not asked');
  });

  it('names the bot build once the page has asked', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => identity() }) as unknown as Response),
    );
    await loadApiIdentity();
    expect(feedbackTemplate('/guild.html', 'simrev')).toContain('Bot build: a1a0e002336d (API 4)');
  });
});
