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

export async function signOut(): Promise<void> {
  try {
    await fetch(API_BASE + '/api/v4/auth/signout', { method: 'POST', credentials: 'include' });
  } catch {
    /* the cookie is the server's to clear; a failure here is not worth interrupting */
  }
  me = null;
  asked = false;
}

/**
 * Start signing in.
 *
 * A top-level navigation, not a fetch: the redirect to Discord cannot happen inside XHR.
 * `return_to` brings the person back to the page they were on, and the bot ignores any
 * value not on this origin, so it cannot be used as an open redirect.
 */
export function beginSignIn(returnTo: string = location.href): void {
  location.href = API_BASE + '/auth/discord?return_to=' + encodeURIComponent(returnTo);
}

export type SignInOutcome = 'ok' | 'cancelled' | 'expired' | 'failed';

/** Read and clear the result the callback leaves in the fragment. */
export function takeSignInOutcome(): SignInOutcome | null {
  const match = /[#&]signin=(ok|cancelled|expired|failed)\b/.exec(location.hash);
  if (!match) return null;
  const cleaned = location.hash.replace(/[#&]signin=[a-z]+/, '').replace(/^&/, '#');
  history.replaceState(
    null,
    '',
    location.pathname + location.search + (cleaned === '#' ? '' : cleaned),
  );
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
      void signOut().then(redraw);
    },
  };
}
