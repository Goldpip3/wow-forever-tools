# Public beta readiness

Updated 16 September 2026. Local changes are not a deployment.

## Verification completed

- 890 existing and report-validation unit tests passed; the added feedback privacy test also passed (891 total).
- Production build and TypeScript check passed.
- 30 browser tests passed: 10 each in desktop Chromium, mobile Chromium and mobile WebKit emulation.
- Group Builder's 21 authentication and 46 roster tests passed against isolated test databases and mocked Discord calls.
- Real Discord delivery, game-client accuracy, physical phones, public deployment and tester invitations remain pending.

## Implemented

- Privacy text distinguishes local tools from Discord sessions and server-saved event rosters. Lists character drafts, reports and temporary sign-in storage. Removes unverified claims about consent delivery and server data collection.
- Report validation requires the chart bounds, ability values and resource values the renderer uses. Invalid links get recovery instructions.
- Beta label in the shared header, with simulation limitations beside damage results.
- Footer bug-report draft includes page path and simulator version, never the query or fragment. The visitor reviews and copies it; nothing is submitted automatically.
- Desktop Chromium, mobile Chromium and mobile WebKit browser projects; CI installs both browser engines.

## Feedback destination — configured

The default opens a prefilled issue at `https://github.com/Goldpip3/wow-forever-tools/issues/new`. Repository visibility and enabled issues were verified. Visitors review and submit on GitHub; an account is required and submitted issues are public. Long reports use clipboard fallback. `VITE_FEEDBACK_URL` remains an optional override.

## Real Discord acceptance test — pending designated event

Use a test guild/event with participants who expect test notifications. Record the event and tester roles privately, never commit its access token.

1. Sign in as its leader. Confirm the correct guild/event appears.
2. Seat a test participant, rename a guest, change a loadout, and wait for the saved indicator.
3. Reload and confirm every edit remains.
4. Make one more edit and immediately publish. Confirm the saved revision is the one posted in Discord.
5. Check selected/standby/cut messages and any failed-delivery names against the UI's counts.
6. Open the event as an ordinary member. Verify the server refuses leader-only writes, not merely that buttons are hidden.
7. Sign out, reload and confirm the session no longer grants access. Test the API rejecting the former session in the designated environment.
8. Confirm switching to demo/planner mode never writes to the live event.

Local auth/roster tests and mocked browser tests do not establish real OAuth, deployed permissions or Discord delivery.

## Game-client acceptance test — pending real export

1. Install the built addon in the actual supported game client and record its version/locale.
2. Remove active buffs. Open the bank, export with `/wfsync`, and import.
3. Compare class, level, spec, talents, equipped items, enchants and displayed stats against the game. Check bags/bank counts and repeat after reload.
4. Record target level, armour, buffs, fight duration and rotation for a reproducible combat test. Compare observed damage/ability breakdown with the simulation. Investigate differences; do not relabel estimates as verified from a sample alone.
5. Repeat a gear change and confirm the tool notices the changed item/stat. Record unsupported procs and set effects.

## Physical-device acceptance — pending devices

On an iPhone with Safari and an Android phone with Chrome: add/remove talent points by touch; open tooltips; import text; run and cancel a simulation; reload inventory; open a shared report; seat a roster participant; open/close dialogs; use the feedback draft. Check portrait/landscape, text zoom, keyboard coverage and horizontal scrolling. Emulated viewports are separate evidence, not a substitute.

## Small beta and deployment

After the above checks, deploy the reviewed changes and verify the public pages show the new beta label, privacy copy and feedback destination. Check invalid report recovery and a valid run on the deployed build.

Invite a few consenting players and one raid leader. Ask them to complete the flows without coaching; record task completion, unexpected results, device/browser and reproduction steps. Do not post invitations or publish an event without the intended destination and participants.

Advertising still loads AdSense. Verify the actual consent configuration in the publisher account before a broad launch; this source change does not configure that service.
