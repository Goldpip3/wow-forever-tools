/**
 * Who is signed in, for every page.
 *
 * This lives in shared/ rather than in the raid page because the account button is in the
 * header, and the header is on all four tools. Keeping it in src/raid meant the talent
 * calculator could not ask, so it drew no account at all while the planner drew a Sign in
 * button to somebody who was already signed in.
 *
 * The planner asks and renders; it never decides. Every flag here comes from the same
 * permissions code that gates the bot's own slash commands, so the two cannot disagree.
 */
import type { AccountView } from './header';
import { toast } from './toast';

/**
 * Where the bot lives. The one place the API's address appears.
 *
 * Override at build time with VITE_API_BASE when self-hosting; otherwise dev builds talk
 * to the bot running on the same machine and production talks to the deployed one.
 */
export const API_BASE: string =
  (import.meta.env.VITE_API_BASE as string | undefined) ??
  (import.meta.env.DEV ? 'http://localhost:3000' : 'https://api.wowforever.us');

export interface Me {
  user: { id: string; username: string; avatarUrl?: string };
  guilds: Array<{
    id: string;
    name: string;
    iconUrl?: string;
    role: 'admin' | 'manager' | 'assistant' | 'member';
    canCreate: boolean;
    canEditAny: boolean;
  }>;
}

let me: Me | null = null;
let asked = false;
const beforeHooks: Array<() => Promise<void>> = [];
const afterHooks: Array<() => void> = [];

/** Whoever is signed in right now, without asking again. */
export function currentUser(): Me | null {
  return me;
}

/**
 * Ask once who is signed in, and tell the page when the answer arrives.
 *
 * A 401 is the ordinary signed-out state rather than a failure, so it resolves to null
 * instead of throwing. Anything else that goes wrong resolves null too: not knowing who
 * you are is the same outcome either way, and every page has a sign-in button for it.
 */
export async function loadUser(onChange: () => void): Promise<void> {
  if (asked) return;
  asked = true;
  try {
    const res = await fetch(API_BASE + '/api/v4/me', {
      // The cookie is on .wowforever.us and the API is on api.wowforever.us, so without
      // this the browser sends nothing and the answer is always "signed out".
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    me = res.ok ? ((await res.json()) as Me) : null;
  } catch {
    me = null;
  }
  onChange();
}

/**
 * Sign out, and say whether the server agreed.
 *
 * The cookie is the server's to clear. If the request fails the cookie may still be
 * good, so the page keeps showing the person as signed in rather than pretending.
 *
 * `everywhere` deletes every session the account has rather than this browser's:
 * for a shared machine, or a phone somebody no longer has. A session somewhere
 * else then stops being honoured on its next request instead of in thirty days.
 */
export async function signOut(everywhere = false): Promise<boolean> {
  // Work that only the session can save goes in first, while the session still exists.
  for (const hook of beforeHooks) {
    try {
      await hook();
    } catch {
      /* a page that could not finish its own work does not stop the person signing out */
    }
  }
  try {
    const res = await fetch(API_BASE + (everywhere ? '/api/v4/auth/signout-all' : '/api/v4/auth/signout'), {
      method: 'POST',
      credentials: 'include',
    });
    if (!res.ok) return false;
  } catch {
    return false;
  }
  me = null;
  asked = false;
  for (const hook of afterHooks) hook();
  return true;
}

export const SIGN_OUT_FAILED = 'Could not sign you out. Try again.';

/** Said before it happens, because it reaches browsers the reader is not sitting at. */
export const SIGN_OUT_EVERYWHERE_ASK =
  'Sign out of every browser and phone this account is signed in on? Anything half-typed in one of them is lost.';

/** Run before the sign-out request, e.g. to land a save the session authorises. */
export function beforeSignOut(hook: () => Promise<void>): void {
  beforeHooks.push(hook);
}

/**
 * Run once the server has confirmed the sign-out, and never when it has not.
 *
 * A page drops what belonged to the account here: its server and event lists, and any
 * roster the session alone was authorising. A roster opened by a signed link stays open,
 * because that link is its own authority and signing out does not revoke it.
 */
export function onSignedOut(hook: () => void): void {
  afterHooks.push(hook);
}

/** Where the fragment waits while the person is away at Discord. This tab only. */
const RETURN_KEY = 'wf.signin.fragment';

/** A signed roster link. Its token must never leave the fragment, not even for storage. */
function carriesToken(hash: string): boolean {
  return /(^#?|&)t=/.test(hash);
}

/**
 * The part of a fragment that may be kept while the person is away.
 *
 * A signed roster link keeps only its event, as `#roster=<id>`: that is not a secret, and
 * it lets the raid page reopen the same event under the new session. Anything else odd
 * about it drops to the roster explainer. Every other fragment is kept as it is.
 */
export function safeReturnFragment(hash: string): string {
  if (!carriesToken(hash)) return hash;
  const eventId = new URLSearchParams(hash.replace(/^#/, '')).get('roster') ?? '';
  return /^\d{1,25}$/.test(eventId) ? '#roster=' + eventId : '#roster';
}

/**
 * Start signing in.
 *
 * A top-level navigation, not a fetch: the redirect to Discord cannot happen inside XHR.
 * `return_to` brings the person back to the page they were on, and the bot ignores any
 * value not on this origin, so it cannot be used as an open redirect.
 *
 * The fragment is left off `return_to`. That value is a query string and a cookie on the
 * bot's side, and a fragment can hold a roster token or a whole gear report. It waits in
 * sessionStorage instead and is put back on return. A roster token is never kept: only
 * its event is, and the session is what authorises from here on.
 */
export function beginSignIn(returnTo: string = location.href): void {
  const url = new URL(returnTo, location.href);
  const hash = safeReturnFragment(url.hash);
  url.hash = '';
  try {
    sessionStorage.removeItem(RETURN_KEY);
    if (hash && hash !== '#') {
      sessionStorage.setItem(RETURN_KEY, JSON.stringify({ path: url.pathname + url.search, hash }));
    }
  } catch {
    /* storage blocked: they come back to the page without its fragment */
  }
  location.href = API_BASE + '/auth/discord?return_to=' + encodeURIComponent(url.toString());
}

export type SignInOutcome = 'ok' | 'cancelled' | 'expired' | 'failed';

/** Read and clear the result the callback leaves in the fragment, and put back what was there. */
export function takeSignInOutcome(): SignInOutcome | null {
  const match = /[#&]signin=(ok|cancelled|expired|failed)\b/.exec(location.hash);
  if (!match) return null;
  let cleaned = location.hash.replace(/[#&]signin=[a-z]+/, '').replace(/^&/, '#');
  const here = location.pathname + location.search;
  try {
    const saved = JSON.parse(sessionStorage.getItem(RETURN_KEY) ?? 'null') as
      | { path?: string; hash?: string }
      | null;
    sessionStorage.removeItem(RETURN_KEY);
    if ((cleaned === '' || cleaned === '#') && saved?.path === here && saved.hash) {
      cleaned = saved.hash;
    }
  } catch {
    /* nothing to put back */
  }
  history.replaceState(null, '', here + (cleaned === '#' ? '' : cleaned));
  return match[1] as SignInOutcome;
}

export const SIGN_IN_MESSAGE: Record<SignInOutcome, string> = {
  ok: 'Signed in.',
  cancelled: 'Sign-in cancelled.',
  expired: 'That took a little long, so the sign-in expired. Try again.',
  failed: 'Discord could not sign you in. Try again.',
};

const BASE = import.meta.env.BASE_URL ?? '/';
const href = (file: string) => (BASE.endsWith('/') ? BASE + file : `${BASE}/${file}`);

/**
 * What the header shows on the right.
 *
 * `redraw` is whatever repaints the page, so signing out updates the header wherever it
 * happened rather than only on the page that owns the account panel.
 */
export function accountView(redraw: () => void): AccountView {
  return {
    user: me ? { username: me.user.username, avatarUrl: me.user.avatarUrl } : null,
    rosterHref: href('raid.html') + '#roster',
    onSignIn: () => beginSignIn(),
    onSignOut: () => {
      void signOut().then((ok) => {
        toast(ok ? 'Signed out.' : SIGN_OUT_FAILED);
        redraw();
      });
    },
    onSignOutEverywhere: () => {
      if (!confirm(SIGN_OUT_EVERYWHERE_ASK)) return;
      void signOut(true).then((ok) => {
        toast(ok ? 'Signed out everywhere.' : SIGN_OUT_FAILED);
        redraw();
      });
    },
  };
}
