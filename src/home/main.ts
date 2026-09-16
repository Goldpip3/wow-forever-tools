import { renderHeader, renderFooter } from '../shared/header';
import { accountView, loadUser } from '../shared/session';
import { CLASS_LIST } from '../shared/classes';
import { iconImg } from '../shared/icons';

const BASE = import.meta.env.BASE_URL ?? '/';
const href = (file: string) => (BASE.endsWith('/') ? BASE + file : `${BASE}/${file}`);

function el(tag: string, cls?: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

function hero(): HTMLElement {
  const section = el('section', 'hero');
  const h2 = el('h2', 'hero__title', 'Talents, raid buffs and gear for WoW Forever');
  const lead = el(
    'p',
    'hero__lead',
    'Forever’s trees are not Classic’s, and nothing has been datamined yet. Everything here was read off the BlizzCon demo, and the guesses are marked as guesses. The calculator covers all nine classes. The raid planner works out which buffs a group actually covers, and which ones only look covered.',
  );
  const actions = el('div', 'hero__actions');

  const talents = document.createElement('a');
  talents.className = 'btn btn--gold btn--big';
  talents.href = href('talents.html');
  talents.textContent = 'Open the talent calculator';

  const raid = document.createElement('a');
  raid.className = 'btn btn--big';
  raid.href = href('raid.html');
  raid.textContent = 'Open the raid planner';

  const dps = document.createElement('a');
  dps.className = 'btn btn--big';
  dps.href = href('dps.html');
  dps.textContent = 'Open the gear tool';

  actions.append(talents, raid, dps);

  /* The cinematic runs behind the headline. It is decoration and nothing else: no sound,
     no controls, out of the tab order and hidden from screen readers. The poster is also
     set as a background on the section in home.css, so the still is what shows wherever
     the video does not play — a phone, reduced motion, or a browser that refuses to
     autoplay — rather than a black rectangle. */
  const video = document.createElement('video');
  video.className = 'hero__video';
  video.autoplay = true;
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.preload = 'metadata';
  video.poster = href('assets/video/hero-poster.jpg');
  video.tabIndex = -1;
  video.setAttribute('aria-hidden', 'true');
  const mp4 = document.createElement('source');
  mp4.src = href('assets/video/hero.mp4');
  mp4.type = 'video/mp4';
  video.appendChild(mp4);

  // Two gradients: heaviest on the left where the text sits, and along the bottom so the
  // section hands off to the page colour instead of stopping at an edge.
  const scrim = el('div', 'hero__scrim');

  const inner = el('div', 'hero__inner');
  inner.append(h2, lead, actions);

  section.classList.add('hero--video');
  section.append(video, scrim, inner);
  return section;
}

function classStrip(): HTMLElement {
  const section = el('section');
  section.appendChild(el('div', 'section-label', 'Jump straight to a class'));
  const grid = el('div', 'home-classes');
  for (const c of CLASS_LIST) {
    const a = document.createElement('a');
    a.className = 'home-class';
    a.href = `${href('talents.html')}#${c.id}/60/`;
    a.appendChild(iconImg(c.icon, c.name));
    const span = el('span', '', c.name);
    span.style.color = c.color;
    a.appendChild(span);
    grid.appendChild(a);
  }
  section.appendChild(grid);
  return section;
}

interface FeatureCard {
  title: string;
  lead: string;
  points: string[];
  cta: { label: string; url: string };
}

function features(): HTMLElement {
  const cards: FeatureCard[] = [
    {
      title: 'Talent calculator',
      lead: 'Fifty-one points, level 10 to 60, every tree for every class.',
      points: [
        'Turn on Compare to Classic and each talent shows its old version beside the new one, tagged changed, moved or new.',
        'Each tree lists what was cut from it entirely.',
        'Racials for all ten races, including both Skyborne lines, and the new class abilities.',
        'Share a build with a link, or save it on this device.',
      ],
      cta: { label: 'Build a spec', url: href('talents.html') },
    },
    {
      title: 'Raid planner',
      lead: 'Eight groups of five, by name and spec, with the buff maths done for you.',
      points: [
        'Every buff and debuff shown with its icon, marked covered or missing, and who brings it.',
        'Knows what overlaps: Leader of the Pack against Moonkin Aura, Sunder against Expose Armor.',
        'Counts debuff slots on the boss so nothing silently falls off.',
        'Reads your signups straight out of a Discord signup bot.',
      ],
      cta: { label: 'Build a raid', url: href('raid.html') },
    },
    {
      title: 'Gear and DPS',
      lead: 'Import your character from the game and find out what your gear is actually worth.',
      points: [
        'A small addon reads your character sheet, your bags and your bank, and hands you a string to paste here.',
        'The fight runs thousands of times, so the damage number comes with the spread around it.',
        'Stat weights are measured from those runs rather than guessed, and you can override any of them.',
        'Every slot is ranked against what you already own, and the top swaps can be re-simulated to confirm.',
      ],
      cta: { label: 'Analyse your gear', url: href('dps.html') },
    },
  ];

  const wrap = el('div', 'home-cards');
  for (const card of cards) {
    const box = el('div', 'home-card');
    box.appendChild(el('h3', '', card.title));
    box.appendChild(el('p', '', card.lead));
    const ul = document.createElement('ul');
    for (const point of card.points) {
      const li = document.createElement('li');
      li.textContent = point;
      ul.appendChild(li);
    }
    box.appendChild(ul);
    const a = document.createElement('a');
    a.className = 'btn btn--gold';
    a.href = card.cta.url;
    a.textContent = card.cta.label;
    box.appendChild(a);
    wrap.appendChild(box);
  }
  return wrap;
}

function smartSection(): HTMLElement {
  const panel = el('section', 'panel');
  panel.appendChild(el('div', 'panel__head', 'It tells you what to change'));
  const body = el('div', 'panel__body');
  body.appendChild(
    el(
      'p',
      '',
      'The planner scores every seat. It knows Windfury Totem is worth a great deal to a melee player and nothing at all to a mage, so it can spot someone sitting in the wrong group and say so in plain words:',
    ),
  );

  const quote = el('blockquote', 'quote');
  quote.textContent =
    'Frost Mage moves to Group 6, where Moonkin Aura and Mana Spring Totem actually help them. Holy Priest takes the seat in Group 4.';
  body.appendChild(quote);

  body.appendChild(
    el(
      'p',
      '',
      'Each suggestion carries the size of the gain and a button that applies it. Seats getting nothing from their group are marked, and hovering one names the buffs being wasted.',
    ),
  );
  panel.appendChild(body);
  return panel;
}

function dataNote(): HTMLElement {
  const panel = el('section', 'panel');
  panel.appendChild(el('div', 'panel__head', 'Where the numbers come from'));
  const body = el('div', 'panel__body');
  body.innerHTML = `
    <p>WoW Forever was announced at BlizzCon 2026 and the beta has only just opened, so nothing here
       is final. The talent, racial and ability numbers were read off the demo footage frame by
       frame.</p>
    <p>Anything the demo did not confirm carries an
       <span class="pill pill--unverified">unverified</span> tag, and the raid planner lists every
       unverified effect your composition relies on. When something is confirmed or contradicted,
       the tag changes rather than the number quietly moving.</p>
  `;
  panel.appendChild(body);
  return panel;
}

function render(): void {
  const app = document.getElementById('app');
  if (!app) return;
  app.replaceChildren();

  renderHeader({ page: 'home', account: accountView(render) });

  app.appendChild(hero());
  app.appendChild(features());
  app.appendChild(smartSection());
  app.appendChild(classStrip());
  app.appendChild(dataNote());
  app.appendChild(renderFooter());
}

render();

/* Ask once who is signed in, and repaint the header when the answer lands. */
void loadUser(render);
