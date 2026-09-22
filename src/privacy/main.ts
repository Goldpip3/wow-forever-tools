import { renderFooter, renderHeader } from '../shared/header';

const app = document.getElementById('app');
if (app) {
  renderHeader({ page: 'privacy' });
  app.innerHTML = `
    <h2 class="page-title">Privacy</h2>
    <p class="page-lead">Talent builds, hypothetical raid plans and gear simulations run in your browser.
      Discord sign-in and real event rosters use the Group Builder service at api.wowforever.us.</p>
    <section class="panel"><div class="panel__head">What stays on your device</div><div class="panel__body">
      <p>The tools use these browser storage entries:</p>
      <ul>
        <li><code>wf.builds</code> — saved talent builds</li>
        <li><code>wf.rosters</code> — saved hypothetical raid plans</li>
        <li><code>wf.characters</code> — characters you chose to save</li>
        <li><code>wf.prefs</code> — tool settings and preferences</li>
        <li><code>wf.reports</code> — your last 20 simulation reports</li>
        <li><code>wf.dps.current</code> — your current character draft, including imported bags and bank</li>
      </ul>
      <p>The addon gives you text to copy from the game. Importing it and running a simulation happen
        on this device. Clearing the browser’s site data removes these local saves; they have no server backup.</p>
      <p>During sign-in, <code>wf.signin.fragment</code> temporarily keeps your current tool link in this
        tab’s session storage so you can return to it. Roster access tokens are excluded from that storage.</p>
    </div></section>
    <section class="panel"><div class="panel__head">Discord and real event rosters</div><div class="panel__body">
      <p>Pages with a sign-in button ask the API whether you have a session. Signing in uses Discord
        and a session cookie. The site can then display your Discord identity, available servers,
        events and the permissions returned by the bot.</p>
      <p>Editing a real event roster sends its players, seating, selection decisions and loadouts to
        the API for saving. Publishing asks the bot to post the roster and notify participants in Discord.
        Clearing your browser’s storage does not delete those server records or Discord messages.
        Signing out ends your website session; it does not delete an event.</p>
      <p>Server retention and deletion are managed by the Group Builder operator. Ask your server’s
        event organiser to arrange changes or removal of event data; this website has no account-deletion control.</p>
    </div></section>
    <section class="panel"><div class="panel__head">Guild character profiles</div><div class="panel__body">
      <p>A character profile you save on the Guild page is stored by the API, not on this device.
        It holds the character name, realm, class, spec, role, level, professions and your note,
        and it records which Discord account it belongs to and who last changed it.
        Everyone in that Discord server can read it. An officer can create or change a profile for
        another member.</p>
      <p>Pasting an addon export on that page sends the equipped items, the character sheet stats,
        the talents, the race and the level. Bags and bank contents are removed before the paste is
        sent and are never stored. This is separate from the Gear and DPS page, where an export
        stays on your device.</p>
      <p>Deleting a character removes its profile and its stored gear. Removing the gear alone leaves
        the profile. Both are available to the profile’s owner and to server officers.</p>
    </div></section>
    <section class="panel"><div class="panel__head">Links you share</div><div class="panel__body">
      <p>Talent, planner, character and report links carry data in the link itself. Someone receiving
        one can read the information it contains. Check names and character details before sharing.</p>
      <p>A private roster link can grant access to a real event. Do not post it in a public bug report.
        The site sends its access token to the roster API when you use that link.</p>
    </div></section>
    <section class="panel"><div class="panel__head">Advertising and outside services</div><div class="panel__body">
      <p>The bug-report form opens GitHub with the text you entered when you choose Continue to GitHub.
        You review and submit it there. Submitted issues are public; remove private information before continuing.</p>
      <p>The site loads Google AdSense. Google and its partners may use cookies for advertising.
        See <a href="https://policies.google.com/technologies/partner-sites" target="_blank" rel="noopener">Google’s explanation of partner-site data</a>
        and <a href="https://www.google.com/settings/ads" target="_blank" rel="noopener">Google Ads Settings</a>.</p>
      <p>Display fonts load from Google Fonts. Discord avatars may load from Discord. Requests to
        these services, the hosting provider and the API expose connection information such as your
        IP address to the receiving service. Their logging and retention are separate from local tool storage.</p>
    </div></section>
    <section class="panel"><div class="panel__head">Changes</div><div class="panel__body">
      <p>Last updated 16 September 2026.</p>
    </div></section>
  `;
  app.appendChild(renderFooter());
}
