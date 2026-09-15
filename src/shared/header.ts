import { iconImg } from './icons';

/** The site mark, the same on every page. */
export const SITE_ICON = 'achievement_boss_onyxia';

export interface HeaderOptions {
  title: string;
  subtitle: string;
  /** Rendered on the right of the header. */
  nav?: HTMLElement[];
  /** Which page is current, so its nav link can be marked. */
  page: 'home' | 'talents' | 'raid' | 'dps';
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

  // Contents line up with the page under the bar, which is why there is a wrap in here.
  const inner = document.createElement('div');
  inner.className = 'wrap';

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
  h1.textContent = opts.title;
  const sub = document.createElement('p');
  sub.className = 'site-header__sub';
  sub.textContent = opts.subtitle;
  titles.append(h1, sub);
  home.appendChild(titles);
  inner.appendChild(home);

  const nav = document.createElement('nav');
  nav.className = 'site-header__nav';

  const links: Array<[HeaderOptions['page'], string, string]> = [
    ['home', 'Home', href('index.html')],
    ['talents', 'Talents', href('talents.html')],
    ['raid', 'Raid planner', href('raid.html')],
    ['dps', 'Gear & DPS', href('dps.html')],
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
  `;
  return footer;
}
