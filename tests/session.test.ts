import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  beforeSignOut, beginSignIn, currentUser, loadUser, onSignedOut, safeReturnFragment, signOut, takeSignInOutcome,
} from '../src/shared/session';

function fakeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, String(v)),
    removeItem: (k) => void map.delete(k),
    clear: () => map.clear(),
    key: (i) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  };
}

/** A page at `url`. Setting href records where the page was sent. */
function at(url: string) {
  const u = new URL(url);
  const page = {
    sentTo: '',
    get href() {
      return u.toString();
    },
    set href(v: string) {
      page.sentTo = v;
    },
    get pathname() {
      return u.pathname;
    },
    get search() {
      return u.search;
    },
    get hash() {
      return u.hash;
    },
  };
  vi.stubGlobal('location', page);
  vi.stubGlobal('history', {
    replaceState: (_s: unknown, _t: string, next: string) => {
      const n = new URL(next, u);
      u.pathname = n.pathname;
      u.search = n.search;
      u.hash = n.hash;
    },
  });
  return page;
}

beforeEach(() => vi.stubGlobal('sessionStorage', fakeStorage()));
afterEach(() => vi.unstubAllGlobals());

describe('signing in', () => {
  it('never puts a roster token into the query string or storage', () => {
    const page = at('https://wowforever.us/raid.html#roster=123&t=secret-token');
    beginSignIn();
    const returnTo = new URL(page.sentTo).searchParams.get('return_to')!;
    expect(page.sentTo).not.toContain('secret-token');
    expect(returnTo).toBe('https://wowforever.us/raid.html');
    // Only the event is kept while they are away, never the token.
    expect(sessionStorage.getItem('wf.signin.fragment')).not.toContain('secret-token');
  });

  it('keeps any other fragment out of the request and puts it back on return', () => {
    const page = at('https://wowforever.us/dps.html?x=1#r=a-long-gear-report');
    beginSignIn();
    expect(page.sentTo).not.toContain('gear-report');
    expect(new URL(page.sentTo).searchParams.get('return_to')).toBe('https://wowforever.us/dps.html?x=1');

    // The bot sends them back to return_to with the outcome appended.
    at('https://wowforever.us/dps.html?x=1#signin=ok');
    expect(takeSignInOutcome()).toBe('ok');
    expect(location.hash).toBe('#r=a-long-gear-report');
    expect(sessionStorage.getItem('wf.signin.fragment')).toBeNull();
  });

  it('does not put a fragment back on a different page', () => {
    at('https://wowforever.us/talents.html#mage-123');
    beginSignIn();
    at('https://wowforever.us/dps.html#signin=cancelled');
    expect(takeSignInOutcome()).toBe('cancelled');
    expect(location.hash).toBe('');
  });
});

describe('signing out', () => {
  async function signedIn() {
    vi.stubGlobal('fetch', async () =>
      new Response(JSON.stringify({ user: { id: '1', username: 'Leader' }, guilds: [] }), { status: 200 }),
    );
    await loadUser(() => {});
    expect(currentUser()?.user.username).toBe('Leader');
  }

  it('stays signed in when the server refuses', async () => {
    await signedIn();
    vi.stubGlobal('fetch', async () => new Response('', { status: 500 }));
    expect(await signOut()).toBe(false);
    expect(currentUser()).not.toBeNull();
  });

  it('stays signed in when the request never arrives', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('offline');
    });
    expect(await signOut()).toBe(false);
    expect(currentUser()).not.toBeNull();
  });

  it('signs out when the server agrees', async () => {
    vi.stubGlobal('fetch', async () => new Response(null, { status: 204 }));
    expect(await signOut()).toBe(true);
    expect(currentUser()).toBeNull();
  });
});

describe('a signed roster token and the sign-in round trip', () => {
  const TOKEN = 'tok_secret+/=%20value';

  /** Every way the token could turn up in a URL: as typed, encoded once, encoded twice. */
  const forms = [TOKEN, encodeURIComponent(TOKEN), encodeURIComponent(encodeURIComponent(TOKEN))];

  it('never appears in the sign-in URL, raw or encoded', () => {
    const page = at('https://wowforever.us/raid.html#roster=1549477265039958172&t=' + encodeURIComponent(TOKEN));
    beginSignIn();
    for (const form of forms) expect(page.sentTo).not.toContain(form);
    expect(page.sentTo).not.toContain('t%3D');
    expect(decodeURIComponent(decodeURIComponent(page.sentTo))).not.toContain(TOKEN);
  });

  it('keeps only the event while away, and comes back to it', () => {
    at('https://wowforever.us/raid.html#roster=1549477265039958172&t=' + encodeURIComponent(TOKEN));
    beginSignIn();
    const kept = sessionStorage.getItem('wf.signin.fragment')!;
    for (const form of forms) expect(kept).not.toContain(form);

    at('https://wowforever.us/raid.html#signin=ok');
    expect(takeSignInOutcome()).toBe('ok');
    expect(location.hash).toBe('#roster=1549477265039958172');
  });

  it('drops to the roster explainer when the link names no usable event', () => {
    expect(safeReturnFragment('#roster=../../x&t=abc')).toBe('#roster');
    expect(safeReturnFragment('#t=abc')).toBe('#roster');
    expect(safeReturnFragment('#mage/60/')).toBe('#mage/60/');
  });

  it('brings a talent build back as it was', () => {
    at('https://wowforever.us/talents.html#warrior/60/05305213030510201');
    beginSignIn();
    at('https://wowforever.us/talents.html#signin=ok');
    takeSignInOutcome();
    expect(location.hash).toBe('#warrior/60/05305213030510201');
  });
});

describe('what a page hears about signing out', () => {
  it('runs the page\'s last save first, and the clean-up only once the server agrees', async () => {
    const order: string[] = [];
    beforeSignOut(async () => void order.push('save'));
    onSignedOut(() => order.push('clean up'));

    vi.stubGlobal('fetch', async () => {
      order.push('request');
      return new Response('', { status: 500 });
    });
    expect(await signOut()).toBe(false);
    expect(order).toEqual(['save', 'request']);

    order.length = 0;
    vi.stubGlobal('fetch', async () => {
      order.push('request');
      throw new TypeError('offline');
    });
    expect(await signOut()).toBe(false);
    expect(order).toEqual(['save', 'request']);

    order.length = 0;
    vi.stubGlobal('fetch', async () => {
      order.push('request');
      return new Response(null, { status: 204 });
    });
    expect(await signOut()).toBe(true);
    expect(order).toEqual(['save', 'request', 'clean up']);
  });
});

describe('signing out everywhere', () => {
  it('asks a different route, so one browser is not the same as every browser', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      calls.push(String(url));
      return new Response(null, { status: 204 });
    });

    await signOut();
    await signOut(true);

    expect(calls[0]).toContain('/api/v4/auth/signout');
    expect(calls[0]).not.toContain('signout-all');
    expect(calls[1]).toContain('/api/v4/auth/signout-all');
  });

  it('keeps the person signed in here when the server refuses', async () => {
    vi.stubGlobal('fetch', async () => new Response('', { status: 500 }));
    expect(await signOut(true)).toBe(false);
  });
});
