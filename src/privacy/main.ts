import { renderFooter, renderHeader } from '../shared/header';

/**
 * The privacy page.
 *
 * It exists because the site shows ads, and AdSense requires a page that says what the
 * ad cookies do. But it is written to be read rather than to satisfy a checklist: every
 * claim on it is checkable against the code, and the storage keys it names are the four
 * in shared/storage.ts. If that list grows, this page grows with it — a policy that has
 * drifted from what the site does is worse than no policy at all.
 */

const UPDATED = '15 September 2026';

function el(tag: string, cls?: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** A titled block in the same panel frame the rest of the site uses. */
function panel(title: string, html: string): HTMLElement {
  const section = el('section', 'panel');
  section.appendChild(el('div', 'panel__head', title));
  const body = el('div', 'panel__body');
  body.innerHTML = html;
  section.appendChild(body);
  return section;
}

function intro(): HTMLElement {
  const section = el('section');
  section.appendChild(el('h2', 'page-title', 'Privacy'));
  section.appendChild(
    el(
      'p',
      'page-lead',
      'This is a static site. There is no account to make, no database behind it, and nothing you ' +
        'build here is sent to a server of ours — there is no server of ours. What follows is what ' +
        'that actually means, and what the two outside services the site loads can see.',
    ),
  );
  return section;
}

function render(): void {
  const app = document.getElementById('app');
  if (!app) return;
  app.replaceChildren();

  renderHeader({ page: 'privacy' });

  app.appendChild(intro());

  app.appendChild(
    panel(
      'What stays on your device',
      `
      <p>Everything you make here is written to your browser’s own storage and stays there. Four
         keys, and that is the whole list:</p>
      <ul>
        <li><code>wf.builds</code> — talent builds you chose to save</li>
        <li><code>wf.rosters</code> — raid rosters you chose to save</li>
        <li><code>wf.characters</code> — characters you imported from the game</li>
        <li><code>wf.prefs</code> — interface preferences, such as whether Compare to Classic is on</li>
      </ul>
      <p>None of it is uploaded anywhere. The gear addon only puts text on your clipboard; the
         import then happens inside this page. Clearing your browser’s site data deletes all four,
         and nothing here can bring them back, because no copy exists anywhere else.</p>
      <p>A shared build link carries the build inside the link itself rather than pointing at a
         record on a server. Sending one is the only way any of this travels, and only because you
         chose to send it.</p>
    `,
    ),
  );

  app.appendChild(
    panel(
      'Advertising',
      `
      <p>The site carries ads through Google AdSense, which is what pays for hosting it.</p>
      <ul>
        <li>Google and its partners use cookies to serve ads based on your visits to this site and
            to other sites on the internet.</li>
        <li>You can turn off personalised advertising in
            <a href="https://www.google.com/settings/ads" rel="noopener" target="_blank">Google Ads Settings</a>,
            and opt out of other participating vendors at
            <a href="https://www.aboutads.info/choices/" rel="noopener" target="_blank">aboutads.info/choices</a>.</li>
        <li>How Google handles data from sites that use its services is described at
            <a href="https://policies.google.com/technologies/partner-sites" rel="noopener" target="_blank">policies.google.com/technologies/partner-sites</a>.</li>
      </ul>
      <p>If you are in the EEA, the UK or Switzerland, you are asked for consent before a
         personalised advertising cookie is set, and you can change that answer at any time.
         Declining does not lock you out of anything — every tool on this site works the same
         either way.</p>
    `,
    ),
  );

  app.appendChild(
    panel(
      'Fonts',
      `
      <p>Two of the display faces come from Google Fonts, which means your browser requests them
         from <code>fonts.googleapis.com</code> and <code>fonts.gstatic.com</code>. Like any
         request to any server, that tells Google your IP address and which page asked. WoW’s own
         two fonts are served from this domain and tell nobody anything.</p>
    `,
    ),
  );

  app.appendChild(
    panel(
      'What the site does not do',
      `
      <p>There is no analytics, no tag manager, no tracking pixel and no profile of you kept by
         us. Nothing is sold or shared, because nothing is collected to sell. Apart from the ads
         and the fonts above, the only requests this site makes are for its own data files, from
         this domain.</p>
    `,
    ),
  );

  app.appendChild(
    panel(
      'Changes',
      `
      <p>Last updated ${UPDATED}. If what the site does changes, this page changes with it and the
         date above moves.</p>
    `,
    ),
  );

  app.appendChild(renderFooter());
}

render();
