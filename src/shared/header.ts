import { iconImg } from './icons';

/** The site mark, the same on every page. */
export const SITE_ICON = 'achievement_boss_onyxia';

/**
 * The mark and the name never change, on any page.
 *
 * They used to carry the current tool's name and a line of live state — the roster
 * summary on the planner, the class on the calculator — which meant the left of the bar
 * rewrote itself on every page and every click. A site mark that moves is not a site
 * mark. It says the same thing everywhere now, and the page says what it is in its own
 * heading.
 */
const SITE_TITLE = 'WoW Forever Tools';
const SITE_TAGLINE = 'Talents, raid composition and gear for Forever';

export interface HeaderOptions {
  /** Rendered on the right of the header, after the tool links. */
  nav?: HTMLElement[];
  /** Which page is current, so its nav link can be marked. */
  page: 'home' | 'talents' | 'raid' | 'dps' | 'roster' | 'privacy';
  /** Who is signed in, when the page knows. Omitted entirely on pages that never ask. */
  account?: AccountView;
}

function el(tag: string, cls?: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

const BASE = import.meta.env.BASE_URL ?? '/';
const href = (file: string) => (BASE.endsWith('/') ? BASE + file : `${BASE}/${file}`);

/**
 * Fill the sticky bar at the top of the window.
 *
 * The <header> itself is in the page's HTML rather than created here, for two reasons: it
 * has to span the window, so it cannot live inside the content column that every page
 * clears on re-render, and it has to exist when the document first paints, or the view
 * transition in base.css captures a page with no bar on it and the header appears to
 * flash in. This fills that element and hands it back.
 */
export function renderHeader(opts: HeaderOptions): HTMLElement {
  const header = document.getElementById('site-header') ?? document.createElement('header');
  header.className = 'site-header';
  header.replaceChildren();

  /* Its own container, not the page's .wrap. Three pages give .wrap three different
     widths — 1180, 1320 and full bleed — so a bar built on it sat somewhere different on
     every page and appeared to jump as you moved between tools. */
  const inner = document.createElement('div');
  inner.className = 'site-header__inner';

  // The mark and title go home, so every page has a way back to the front.
  const home = document.createElement('a');
  home.className = 'site-header__home';
  home.href = href('index.html');
  home.title = 'Back to the front page';

  const mark = document.createElement('div');
  mark.className = 'site-header__mark';
  mark.appendChild(iconImg(SITE_ICON, 'Onyxia'));
  home.appendChild(mark);

  const titles = document.createElement('div');
  titles.className = 'site-header__titles';
  const h1 = document.createElement('h1');
  h1.className = 'site-header__title';
  h1.textContent = SITE_TITLE;
  const sub = document.createElement('p');
  sub.className = 'site-header__sub';
  sub.textContent = SITE_TAGLINE;
  titles.append(h1, sub);
  home.appendChild(titles);
  inner.appendChild(home);

  const nav = document.createElement('nav');
  nav.className = 'site-header__nav';

  // Four tools and no Home button: the mark and the name are the way back to the front,
  // which is where every site on the web puts it.
  const links: Array<[HeaderOptions['page'], string, string]> = [
    ['talents', 'Talents', href('talents.html')],
    ['raid', 'Raid planner', href('raid.html')],
    ['dps', 'Gear & DPS', href('dps.html')],
    ['roster', 'Roster', href('raid.html') + '#roster'],
  ];
  for (const [page, label, url] of links) {
    const a = document.createElement('a');
    a.className = `btn${opts.page === page ? ' btn--on' : ''}`;
    a.href = url;
    a.textContent = label;
    nav.appendChild(a);
  }
  for (const el of opts.nav ?? []) nav.appendChild(el);

  inner.appendChild(nav);

  /* Third column, so the tools stay centred whatever is on either side of them. */
  const right = el('div', 'site-header__acct');
  if (opts.account) right.appendChild(accountButton(opts.account));
  inner.appendChild(right);

  header.appendChild(inner);
  return header;
}

export function renderFooter(): HTMLElement {
  const footer = document.createElement('footer');
  footer.className = 'site-footer';
  footer.innerHTML = `
    <p>Fan-made and not affiliated with Blizzard Entertainment. Icons and art are Blizzard’s.</p>
    <p>WoW Forever is new and the numbers can lag the live game. Anything marked
      <span class="pill pill--unverified">unverified</span> has not been confirmed yet.</p>
    <p><a href="${href('privacy.html')}">Privacy</a></p>
  `;
  return footer;
}

/* ---------------------------------------------------------------- account */

/**
 * The Discord account button in the top right of every page.
 *
 * It sits opposite the mark on purpose: the name on the left says what the site is, this
 * says who you are, and the tools sit between them. Signed out it is one button. Signed in
 * it is your avatar and a menu, which is where sign-out and anything account-shaped goes,
 * rather than spending a slot in the tool row on each.
 *
 * The header cannot fetch anything itself — it is drawn before any page decides what it
 * is doing, and `shared/` has no business talking to the API. Each page hands in what it
 * already knows, and passes nothing at all on the pages that never ask.
 */
export interface AccountView {
  user?: { username: string; avatarUrl?: string } | null;
  onSignIn?: () => void;
  onSignOut?: () => void;
  /** Where the account menu sends someone who wants their servers and events. */
  rosterHref?: string;
}

function accountButton(view: AccountView): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'acctbtn';

  if (!view.user) {
    const signIn = document.createElement('button');
    signIn.className = 'btn acctbtn__in';
    signIn.textContent = 'Sign in';
    signIn.title = 'Sign in with Discord to see your servers and their events';
    signIn.addEventListener('click', () => view.onSignIn?.());
    wrap.appendChild(signIn);
    return wrap;
  }

  const toggle = document.createElement('button');
  toggle.className = 'btn acctbtn__toggle';
  toggle.setAttribute('aria-haspopup', 'menu');
  toggle.setAttribute('aria-expanded', 'false');
  if (view.user.avatarUrl) {
    const img = document.createElement('img');
    img.className = 'acctbtn__avatar';
    img.src = view.user.avatarUrl;
    img.alt = '';
    toggle.appendChild(img);
  }
  toggle.appendChild(el('span', 'acctbtn__name', view.user.username));
  toggle.appendChild(el('span', 'acctbtn__caret', '▾'));
  wrap.appendChild(toggle);

  const menu = document.createElement('div');
  menu.className = 'acctmenu';
  menu.hidden = true;
  menu.setAttribute('role', 'menu');

  const item = (label: string, onPick: () => void): HTMLElement => {
    const button = document.createElement('button');
    button.className = 'acctmenu__item';
    button.setAttribute('role', 'menuitem');
    button.textContent = label;
    button.addEventListener('click', () => {
      close();
      onPick();
    });
    return button;
  };

  menu.appendChild(el('div', 'acctmenu__who', 'Signed in as ' + view.user.username));

  const rosters = document.createElement('a');
  rosters.className = 'acctmenu__item';
  rosters.setAttribute('role', 'menuitem');
  rosters.href = view.rosterHref ?? '#roster';
  rosters.textContent = 'Your servers and events';
  menu.appendChild(rosters);

  menu.appendChild(item('Sign out', () => view.onSignOut?.()));
  wrap.appendChild(menu);

  function close(): void {
    menu.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
    document.removeEventListener('click', onAway, true);
    document.removeEventListener('keydown', onKey, true);
  }
  function onAway(ev: Event): void {
    if (!wrap.contains(ev.target as Node)) close();
  }
  function onKey(ev: KeyboardEvent): void {
    if (ev.key === 'Escape') close();
  }
  toggle.addEventListener('click', () => {
    if (menu.hidden) {
      menu.hidden = false;
      toggle.setAttribute('aria-expanded', 'true');
      // Captured, so a click anywhere else closes it before that click does its own work.
      document.addEventListener('click', onAway, true);
      document.addEventListener('keydown', onKey, true);
    } else {
      close();
    }
  });

  return wrap;
}
