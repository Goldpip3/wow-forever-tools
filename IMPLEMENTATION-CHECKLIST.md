# Implementation checklist

For IMPROVEMENT-PLAN.md. Results recorded as run, not as launched.

## Step 0 — Baseline (2026-09-16)

- **HEAD:** `3615e13` "Add the Balance druid, the last of the damage specs". `master` is 14 commits ahead of `origin/master` (`9653eb9`).
- **Working tree:** 31 files modified and 9 untracked, all uncommitted. That includes the F01–F15 changes below. `src/raid/effects/*` changes are someone else's work and predate this plan; they are not part of it.
- **`npm test`:** passed, 39 files, 793 tests.
- **`npx tsc --noEmit`:** passed, no output.
- **`npm run build`:** passed. It warns that `/assets/fonts/ARIALN.TTF` didn't resolve at build time. That font is optional and the warning doesn't break the build.
- **Specs in the local registry (18):** Frost, Fire and Arcane Mage; Arms and Fury Warrior; Combat Rogue; Enhancement and Elemental Shaman; Retribution Paladin; Feral and Balance Druid; Beast Mastery, Marksmanship and Survival Hunter; Affliction, Demonology and Destruction Warlock; Shadow Priest.
- **Deployed:** https://wowforever.us/dps loads `assets/dps-Dsl4JC5n.js`.
  - It has 3 spec labels, Frost Mage, Arms Warrior and Fury Warrior, and still shows the old hand-written spec sentence. The local build has 12 distinct labels in that check; the pattern counts only two-word labels.
  - Live is behind local: it doesn't match HEAD and has none of the working-tree changes.
- **Findings already fixed before work started:** none among F01–F15. Each was reproduced or confirmed in the source first. The plan's earlier `tests/build.test.ts:509` assertion error was already fixed and wasn't touched again.

## Step 1 — Authentication state and tokens (F05)

- **Status:** done.
- **Files:** src/shared/session.ts, src/raid/main.ts, tests/session.test.ts.
- **Change:**
  - Signing in from a signed link now comes back to `#roster=<event>` with the token dropped, and the raid page reopens that event under the new session.
  - Sign-out failures, whether a server error or offline, keep the person signed in and say so on every page.
  - A confirmed sign-out clears the server and event lists and closes a roster the session alone opened. A pending save lands first.
  - A roster opened by a signed link stays open.
- **Checks:**
  - 5 new tests: the token never appears raw, encoded once or encoded twice; only the event is kept; an unusable event falls back to the explainer; a talent build comes back as it was; the save runs first and clean-up only on success.
  - 798 tests pass, the typecheck passes and the build passes.
  - Browser, with a fake API: sign-out with a 500 error and offline kept the roster and showed "Could not sign you out. Try again."; a pending save went out before the sign-out request; success closed the session roster; a signed-link roster stayed open; `#roster=777` with `signin=ok` opened roster mode.
- **Remaining:**
  - No real Discord sign-in.
  - The bot still accepts a full URL in `return_to`.
  - A signed-link roster whose editing permission came from the session only finds out at its next save, when the bot refuses it.

## Step 2 — Roster sessions and mode transitions (F02)

- **Status:** done.
- **Files:** src/raid/main.ts, src/raid/roster-mode.ts, tests/roster-mode.test.ts.
- **Change:**
  - Each opened event, the demo included, is now a `RosterSession` holding its access, state, saver, publish flag and whether it's closed. It replaces the old `access`, `saver` and `generation` variables and the stray `publishing` one.
  - The saver collects and records revisions on its own session's state. Callbacks check `isCurrent(session)`.
  - One `openSession` and `leaveRoster` path covers event to intro, event to demo, event to event and roster to planner.
  - On leaving, an unsaved edit is finished against the left event's own state; a failure says so in a message.
  - The demo has no access and no saver. `request()` refuses the event id `demo` or an empty one before any fetch, and publish refuses the demo.
  - A new signed link reloads only once the old link's pending save settles. `beforeunload` asks for confirmation while anything is unsaved; keepalive is documented as best effort.
- **Checks:**
  - 3 new tests: the demo sends zero requests; `hasUnsaved` is true while queued or in flight; a saver sends only its own state after the page moves on.
  - 801 tests pass, the typecheck passes and the build passes.
  - Browser, with deferred mocks:
    - A's held load landed after B opened and B stayed.
    - B's held save, released after A was opened and edited, carried only B's users; A's save carried only A's; A's screen was unchanged.
    - The demo after real events made zero requests.
    - A planner link survived a reload.
- **Remaining:**
  - Leaving an event and reopening the same one while its old save is in flight can end in a 409. That's handled as usual, by reloading, never retrying.
  - Keepalive delivery on tab close isn't guaranteed.
  - There are still no unit tests that load `main.ts`.

## Step 3 — Serialize saving and publishing (F01)

- **Status:** done.
- **Files:** src/raid/roster-mode.ts, src/raid/main.ts, tests/roster-mode.test.ts.
- **Change:**
  - A new `publishWhenSaved` waits for every save, including one in flight and edits queued behind it. It stops if a save failed or anything is still unsaved.
  - It stops if the roster differs from the snapshot the confirmation counts came from. Otherwise it publishes at the last acknowledged revision.
  - A 409 on either request is returned as a failure and never retried. A second publish on the same state is refused as busy.
  - Edits are frozen while publishing: handlers check `rosterEditable()` and the seats are drawn read-only.
  - Seat counts on the confirmation come from `rosterCounts`, taken when it opens.
  - The saver reports "dirty" rather than "saved" when an edit arrived during the save.
- **Checks:**
  - 8 new tests, each checking exact request order and revisions:
    - slow save plus an edit during it: `PUT@3, PUT@4, POST@5`, never saved in between
    - nothing pending: `POST@3`
    - save fails with 500: `PUT@3` only
    - save conflict: `PUT@3` only, no retry
    - publish conflict: `POST@3` only
    - double press: one POST
    - roster changed after confirming: no POST
    - demo: no request
  - 809 tests pass, the typecheck passes and the build passes.
  - Browser, with a fake API and double-clicking Publish: `GET, PUT@3, POST@4`. While publishing, the seat buttons and pool dropdowns were gone and Publish was disabled; they came back afterwards.
- **Remaining:**
  - A "changed" abort asks the leader to confirm again; it doesn't open the confirmation for them.
  - No test against a real event.

## Step 4 — Every roster action persists the right person (F03, F04)

- **Status:** done.
- **Files:** src/raid/main.ts, src/raid/roster-mode.ts, src/raid/render.ts, src/raid/drawer.ts, src/styles/raid.css, tests/roster-mode.test.ts.
- **Change:**
  - **One edit path:** `update({ redraw })` records every edit in both modes. `rosterChanged` is gone, and rename uses `redraw: false`.
  - **Empty seats:** an empty real seat opens a chooser listing the pool and cut players, plus "Add a guest instead". It never offers a spec grid.
  - **Guests:** added guests get `spreadChoices`.
  - **Raid size:** seats outside the raid size have no + button, and the seat, move, pool and guest handlers refuse them.
  - **Read-only viewers:** a read-only seat keeps a cog that opens the loadout read-only. The drawer works on a copy and its controls are disabled.
  - **Saved extras:** talent toggles and a pasted build are now saved in the slot's `loadout` under `_talents` and `_build`, and checked on read. Before this they silently reset on reload.
  - **Guest status on reload:** a reloaded guest's status is `guest`, not `withdrawn`.
- **Checks:**
  - 5 new tests:
    - rename, spec, loadout, toggle and build survive a reload
    - badly shaped loadout values are dropped
    - every seat, guests included, reloads where it was
    - a guest keeps a stable id and status
    - tentative/selected, primary/cut and late/standby round-trip separately
  - 814 tests pass, the typecheck passes and the build passes.
  - Browser, with a fake API:
    - The chooser listed signups plus a guest button, and picking Lock saved it as selected at 1,2.
    - Rename only saved "Lockette"; changing only a loadout saved the new curse.
    - Group 5 in a 20-player raid had no + button.
    - For a viewer, no add, remove, drag, rename, pool, cut, seat-everyone, add-guest or suggestion controls were shown. The loadout opened with 0 enabled controls. Forcing a radio and a name on, and a synthetic drop, changed nothing and made 0 writes.
    - Two guest warlocks in the demo got different curses.
- **Remaining:** loadout extras rely on the bot storing `loadout` without checking it, which it does today.

## Step 5 — Preferences and full inventory (F06, F07)

- **Status:** done.
- **Files:** src/shared/storage.ts, src/dps/draft.ts (new), src/dps/main.ts, src/talents/main.ts, tests/storage.test.ts, tests/dps-link.test.ts.
- **Change:**
  - **Preferences:** a typed `SitePrefs` with `readPrefs` and `patchPrefs`. The talent page owns `compare` and the gear page owns `dps`; other keys are kept as they were.
  - **Draft module:** the draft is written only for a character that belongs on this device, meaning imported, loaded from a save, or recovered.
  - **Which character opens:**
    - A report opens what it holds.
    - A `#c=` link opens what it holds, and gets the draft's bags and bank only when the draft trimmed is exactly that link.
    - Opening someone else's link or report never overwrites the draft.
    - Clear removes the draft.
  - **Storage refusals:** if the browser refuses the draft or the settings, a notice appears once, after the import message. The page keeps working.
- **Checks:**
  - 10 new tests:
    - comparison changes leave the gear page's settings and older keys alone
    - badly shaped settings are ignored
    - blocked storage, a full quota and JSON that doesn't parse all fall back safely
    - the draft recovers for the device's own link
    - a shared link opens unmerged and leaves the draft untouched
    - a fresh browser opens a shared link
    - Clear works and a garbage link opens nothing
    - a malformed or refused draft falls back
  - 824 tests pass, the typecheck passes and the build passes.
  - Browser:
    - The mage showed 21 items, and 21 after a reload.
    - The friend's warrior link showed 17 items and left the draft unchanged; going back to the mage link showed 21.
    - Clear removed the draft and the hash.
    - With storage full, the import still worked and showed "This browser would not keep a copy of your bags and bank…".
    - I put the browser's data back afterwards.
- **Remaining:**
  - One draft per device.
  - The saved character, report and build lists still show the existing "would not let me save" message only for named saves.

## Step 6 — Legal talent builds at every entry point (F08)

- **Status:** done.
- **Files:** src/talents/build.ts, src/talents/codec.ts, src/raid/main.ts, tests/build.test.ts.
- **Decision:** an invalid build is repaired to the nearest legal one, never rejected silently, and the page always says how many points were left out.
- **Change:**
  - **Validator:** `treeLegal` now also refuses ranks that aren't whole numbers or are negative, and `legalize` rounds them down.
  - **Counting dropped points:** `decodeChecked` counts against the digits as written, so a clamped digit counts as dropped.
  - **`legalCode`:** returns a valid link exactly as written, short form included. An invalid one comes back rewritten, with the count.
  - **Raid planner:**
    - An `import=` link and a link pasted into the loadout panel both go through `legalCode` with a message.
    - A link for another class is removed from the player, with a message.
    - Builds that arrived before the talent data loaded are checked once it lands. Roster builds are only checked when the roster can be edited.
- **Checks:**
  - 5 new tests:
    - whole-number ranks
    - a clamped digit is counted
    - chained prerequisites (A→B→C in the data): removing A drops B and C, and every lower level stays legal
    - a spread-out build for every class round-trips unchanged, with `legalCode` returning the same string
    - a short valid link is kept as written and the level-10 link is rewritten with 4 dropped
  - 829 tests pass, the typecheck passes and the build passes.
  - Browser:
    - The talents page turned the level-10 link into 1 point and 0 left, with the message.
    - Removing Deflection was refused with "Improved Charge needs 5 points in the rows above it".
    - A raid `import=` of the same link showed "4 points … were left out".
    - Pasting a mage link onto a warrior removed it, with a message.
- **Remaining:** the planner URL codec doesn't carry `build` at all, and I didn't change that, per CLAUDE.md. A read-only roster's invalid build is shown as the bot stored it.

## Step 7 — Simulator stat accounting (F09)

- **Status:** done.
- **Files:** src/dps/stats.ts, src/dps/sim/sim.ts, tests/dps-stats.test.ts.
- **Change:**
  - **What the sheet measured:** a new `sheetReports` is the single list of stats the exported sheet actually measured, and the baseline uses it. Hit and spell hit count as measured only when present, so an explicit 0 stays authoritative. MP5, haste, feral attack power and weapon DPS are never measured, so they come from gear and buffs only.
  - **Buffs that were up at export:** such a buff used to be skipped entirely, which lost it for stats the sheet doesn't measure. Mana Spring Totem's MP5 is an example. It's now added for those stats only, and still skipped for measured ones, so it isn't counted twice.
  - **Mana regeneration:** the per-tick formula is extracted as `manaPerTick`, with the same maths; negative MP5 is clamped to 0.
- **Checks:**
  - 9 new tests:
    - explicit 0 spell hit stays 0; missing spell hit with 3 on gear gives 3
    - measured totals stay authoritative
    - no gear-only stat goes below 0 when its item comes off
    - haste on gear counts once, on and off
    - an exported Mana Spring gives MP5 20 with a 10 MP5 item, while exported Arcane Intellect isn't added again
    - a 59.5 intellect swap gives exactly +59.5 intellect, +1 crit and +892.5 mana
    - by hand: 10 MP5 is 4 mana a tick; 250 spirit on a mage is 75 per 2 seconds, so 79 a tick outside the five-second rule and 15.25 inside it; the item gives 4 a tick on and 0 off, 360 over a 3-minute fight
  - 838 tests pass, with no recorded DPS test changed; the typecheck passes and the build passes.
- **Remaining:**
  - `stats.ts` and `sim.ts` changed, so the simulator version changes and reports saved before this open as made by an earlier version.
  - No browser check, because no sample carries these stats.

## Step 8 — Reproducible results and consistent invalidation (F10, F13 results)

- **Status:** done.
- **Files:** src/dps/config.ts (new), src/dps/client.ts, src/dps/compare.ts, src/dps/main.ts, tests/dps-report-inputs.test.ts.
- **Change:**
  - **One config builder:** `simConfig({ character, fight, rotation, apl, loadout })` builds every run's config. `configFor` (runs, replay, reports, weights), `planCompare` (swaps and drops) and top gear's loadouts all go through it.
  - **Invalidation:** `clearResults` moves `inputsVersion` on. Each run records the version it started under, and `finished()` drops an answer if the inputs moved.
  - **Weight overrides:** changing one now also clears top gear and drops, which were ranked with the old weights.
  - **Reports:** a report uses its own written rotation and never the device's. A version 2 report shows the spec's own rotation, with a note that the simulator and written rotation weren't recorded, and no timeline.
- **Checks:**
  - 2 new tests:
    - Warrior with a written rotation and the Heart of the Ram trinket: replaying the representative seed through the builder gives the recorded DPS to 6 decimal places, and the timeline is identical. Without the rotation or the trinket it differs.
    - `planCompare` base and swap configs, and `configFor`, match `simConfig` exactly.
  - 840 tests pass, the typecheck passes and the build passes.
  - Browser, with the device's saved rotation set to 2 lines:
    - A v3 report with a 7-line written rotation showed 7 lines marked as edited, with a timeline, and left the device setting unchanged.
    - A v2 report showed the spec's own 8 lines, the provenance note and no timeline.
    - A weight override removed the top-gear results.
    - Changing the fight while weights were running: nothing appeared.
    - I put the browser's data back afterwards.
- **Remaining:**
  - A trinket aura's id includes a global counter, so two builds of the same config differ in that id; the simulation is unaffected.
  - The late-completion check waited 4 seconds.

## Step 9 — Gear combination identity and legality (F11)

- **Status:** done. The F11 work already covered symmetric dedupe only when the mirror is buildable, `sameItem` versus `itemKey`, spare copies, unique rules, kind-based `swapsIn` and `'offhand' in loadout`.
- **Files:** src/dps/topgear.ts, src/dps/render-topgear.ts, tests/dps-topgear.test.ts.
- **Change:**
  - The worn pair is kept in its worn order and its mirror is the arrangement dropped. Before, rings worn "out of order", with copies of both owned, lost the worn loadout to a sim-identical pair of bag copies, which showed as two swaps.
  - The top-gear panel now says weapons aren't part of the search and every combination keeps what the character is holding.
- **Checks:**
  - 3 new tests, on top of F11's 10 and F12's 4:
    - worn 300/100 with spares of both: 300/100 is present, 100/300 is absent, and exactly one loadout is unchanged, using the worn objects
    - a ring moved across fingers is reported as 2 swaps
    - `{ finger1: null }` means taking it off, while `{}` means no change
  - Already covered by F11: the asymmetric 200/100 case, no physical ring on two fingers, two owned copies, unique rules, enchant and suffix swaps, and a two-hander with an emptied off hand.
  - 843 tests pass, the typecheck passes and the build passes; the build contains the scope label.
- **Remaining:** weapons stay out of the combination search, which the panel now says.

## Step 10 — Bound gear-search work (F12)

- **Status:** done.
- **Files:** src/dps/topgear.ts, src/dps/gear.ts, src/dps/client.ts, src/dps/pool.ts, src/dps/main.ts, src/dps/render-topgear.ts, tests/dps-topgear.test.ts.
- **Change:**
  - **Plan cache:** the top-gear plan is cached by character, weight table and shortlist size, so a redraw doesn't re-plan. Counting still stops just past the 2,000 cap.
  - **Cancellable preparation:** `runTopGear` hands the page a turn after planning, after picking the shortlist and every 100 configs, and stops with `cancelled` if Stop was pressed.
  - **Search over legal units:** `bestLoadouts` now walks units, with each ring or trinket pair as one unit of wearable, deduplicated pairs, and the sort is stable.
    - Before, when the best-scoring rings or trinkets were in the bank, the search spent its whole budget on one ring on two fingers and returned only the worn outfit. The browser run showed "best of the 1 combinations tried".
  - **Items with no bag position:** `sameItem` only treats the very same record as one item, where it used to treat every such bank item as one.
  - **Result disclosure:** `TopGearResult.capped` drives a note: "These are the best of the 2,000 combinations tried. More were possible, so one that was not tried could still do better."
  - **Time estimate:** covers both passes, (1+n)×first + (1+min(5,n))×final, divided by the pool's real worker count and per-worker rate, or the last whole run's rate before any is measured.
- **Checks:**
  - 5 new tests:
    - estimate arithmetic, including workers and fewer than 5 finalists
    - the capped shortlist is identical on repeat
    - cancelling during preparation rejects `cancelled` with no progress reported, in under 5 seconds
    - progress keeps a constant total, never exceeds it and ends on it with 2 loadouts: (1+2)×50 + (1+2)×60
    - a bank of unplaced top-scoring items still gives 2,000 loadouts, one of them the worn outfit, never a ring twice, with two bank rings together allowed
  - Existing bounded tests still pass: planning a huge bank takes under 2 seconds and `bestLoadouts` under 3 seconds.
  - 848 tests pass, the typecheck passes and the build passes.
  - Browser, with the sample mage plus 112 bank items at 5 per slot:
    - The estimate said "about 21 seconds", and the capped run took 15 seconds.
    - The results showed the disclosure and 12 rows.
    - Stop pressed right after starting ended the run with no result.
    - Planning and drawing took 19 ms, and a cached redraw 4 ms.
    - I put the browser's data back afterwards.
- **Remaining:**
  - The capped choice still ranks by per-item score, without set bonuses.
  - Picking the capped shortlist runs synchronously, up to about 100k heap steps, before the next checkpoint.

## Step 11 — Validate reports, preferences and imported state (F13 input boundary)

- **Status:** done.
- **Files:** src/dps/validate.ts (new), src/dps/fight.ts (new), src/dps/codec.ts, src/dps/main.ts, tests/dps-validate.test.ts.
- **Change:**
  - **Validators in `validate.ts`:** `isCharacterShape`, `isFightShape`, `isRotationLines` and `isReportShape`, with no new dependency.
    - Numbers must be finite and within hard bounds: duration 1–36,000, iterations 1–10,000,000.
    - Class ids are checked, and lists must be arrays with capped lengths.
    - Every summary field the page reads is checked, and rotation lines are checked.
  - **Link decoding:** a shared `unpack` caps link text at 200,000 characters and decompressed JSON at 2,000,000, and returns null on corrupt input.
    - `decodeCharacter` now validates the character.
    - `decodeReport` refuses unknown versions and validates before migrating version 2.
  - **Preferences:** `readDpsPrefs` keeps each part of the saved settings that is the right shape and drops each part that isn't, with overrides limited to real stats and finite values.
  - **Fight migration:** `migrateFight` and `defaultFight` moved to `fight.ts` so they can be tested. They clamp numbers to the panel's limits, drop retired buff ids and remove the debug hooks, and only run on a fight that passed validation.
- **Checks:**
  - 26 new tests:
    - current and version 2 reports open
    - 18 malformed reports around a good character are refused, including buffs as a string, an unknown style, 1e6 seconds, 1e12 or 0 iterations, bad ability, aura and histogram values, a bad rotation or 10,000 rotation lines, and bad talents, class or bank
    - versions 0, 1, 4, `'3'` and null are refused
    - 9 corrupt or oversized inputs return null without throwing
    - wrong-shaped character links are refused
    - migration clamps 5 seconds to 10 and 1e6 runs to 20,000, fills in style and target, and drops retired buffs and the debug hooks
    - null, list, string and number preferences read as nothing, and each bad part is dropped on its own
  - 874 tests pass, the typecheck passes and the build passes.
  - Browser:
    - With the sample mage loaded (21 items), a corrupt report link, a corrupt character link and a bad pasted export each showed their message and left the mage as it was.
    - Saved settings with a broken fight reloaded at the default 300 seconds with no error.
    - I put the browser's data back afterwards.
- **Remaining:** the raid and talent pages' imports (planner hash, Group Builder `#gb=`) weren't reworked in this step. Their saved lists already go through `readList`.

## Step 12 — Usable without dragging or right-clicking (F14)

- **Status:** done for viewport checks. Not checked on a physical phone.
- **Files:** src/shared/focus.ts (new), src/raid/main.ts, src/raid/render.ts, src/talents/main.ts, src/talents/render.ts, src/home/main.ts, src/styles/tokens.css, src/styles/base.css, src/styles/home.css.
- **Change:**
  - **Focus kept on redraw:** the raid and talent pages put focus back on the same control after every redraw, matched by `data-focus-key` (talent cell, seat, player cog or move button, pool row by position) or by name.
  - **Dialogs:** every raid dialog and the loadout drawer takes focus on its first choice and gives it back on close, including to the + that replaces a removed player.
  - **Moving a seated player:** a new ⇄ button opens a group chooser listing groups with free seats, plus "Back to the pool" in roster mode. Focus follows the player to the new seat.
  - **Talent cells:** they tell screen readers that Enter adds a point and Delete takes one back.
  - **Focus ring:** a gold `:focus-visible` ring on every page.
  - **Secondary text colour:** `--muted` went from #8a8a8a to #a0a0a0. Measured first: the old colour was 4.38:1 on `--panel2`, and the new one is 5.79:1 there, 7.16:1 on `--bg` and 4.83:1 on #333.
  - **Header:** at 900px and below it's two rows, with the four tools on one line. It measured 160 → 80px at 390px and 164 → 97px at 768px; 69px at 1280px is unchanged.
  - **Home page:** its full-width hero used 50vw, so the page scrolled 5px sideways by a desktop scrollbar's width at every width. The scrollbar width is now measured and taken off.
- **Checks, browser viewport only (programmatic focus and events, since the pane window had no OS focus and real key presses didn't arrive):**
  - Talents: focusing a cell and pressing it three times gave 3 points; Delete gave 2; a press with Take points back on gave 1. Focus stayed on the cell every time, with a gold outline.
  - Talent tooltips: a focus event showed the tooltip and Escape hid it.
  - Demo roster:
    - "Seat in…" seated Ashfen in group 1, and focus moved to the next pool row, Brackwater.
    - ⇄ opened with focus on "Group 2 (5 free)", and moving to group 3 kept focus on Ashfen's ⇄.
    - The loadout drawer took focus and Escape gave it back to the cog.
    - "Back to the pool" left focus on that seat's +.
  - Horizontal overflow at 390, 768 and 1280px on home, talents, planner, demo roster, roster intro, gear with the sample, and privacy: 0 everywhere after the fix. The nav fits one row with no clipped labels.
  - 874 tests pass, the typecheck passes and the build passes. There are no automated tests for focus handling.
- **Remaining:**
  - No physical phone, screen reader or real Tab-order test.
  - Real Enter and Tab keys weren't delivered in this environment.

## Step 13 — Onboarding and the planner-to-gear handoff (F15, product suggestions)

- **Status:** done.
- **Files:**
  - New: src/raid/handoff.ts, src/dps/handoff.ts, src/dps/render-handoff.ts, src/dps/support.ts.
  - Changed: src/dps/main.ts, src/dps/render.ts, src/dps/render-sim.ts, src/raid/drawer.ts, src/raid/main.ts, src/raid/render.ts, README.md, ROSTER-SPEC.md, tests/handoff.test.ts.
- **Change:**
  - **Gear page first visit:**
    - The panel is now "Try a sample, or paste your export", listing the specs from the registry and the samples. It comes before the addon install steps.
    - A results panel now shows the simulator version, or says the version wasn't recorded, and that numbers are Classic values unverified for Forever.
  - **Raid empty states:** an empty raid now says "Nobody is seated yet, so there is nothing to check." and "Seat at least two players and this suggests swaps between groups." instead of all clear.
  - **Roster setup steps:** they say the bot checks you may edit the event, mention signing in and picking the event as the other route, and mention the row buttons.
  - **Handoff:**
    - A seated player's loadout drawer links to the gear page with the raid, party and boss-debuff effects that reach them. Only effects actually covered are included, and overwritten ones are left out.
    - The gear page shows three lists, "Would tick", "Does nothing for a melee character or caster", and "Not simulated", plus a note when the loaded spec differs.
    - Nothing is ticked until "Tick these buffs" is pressed, which replaces raid buffs and debuffs and keeps consumables.
    - Talents are never applied, and a note says why.
    - The link is validated and removed from the address.
  - **Docs:** README has the new modules and a handoff section. ROSTER-SPEC documents `_talents`/`_build` in `loadout` and the publish transaction.
- **Checks:**
  - 8 new tests:
    - every mapped id exists on both sides
    - a melee group with Windfury versus a caster group with Mana Spring, and raid-wide Arcane Intellect in both
    - a warrior's plan leaves Arcane Intellect off by role while a mage's ticks it
    - Leader of the Pack stays listed as not simulated
    - a benched player has no handoff
    - the link round-trips, and garbage, group 99 or a string list is refused
    - applying keeps consumables
    - a Battle Shout up at export adds no attack power, and adds some when it wasn't
  - 882 tests pass, the typecheck passes and the build passes.
  - Browser:
    - The first gear panel is the sample panel, with all 18 specs named. The warrior sample loaded with no account.
    - An empty planner showed the new empty-state texts.
    - Sample raid Fury Warrior (group 2): 9 would-tick buffs including Windfury and Sunder, 5 off by role, 16 not simulated. Ticking replaced them, kept consumables and showed the not-doubled note.
    - Frost Mage (group 4): Arcane Intellect, the curses and Divine Spirit would tick; Might, Faerie Fire, Sunder and Trueshot stay off.
    - A warrior loaded with the mage's link showed "The planner has this player as Frost Mage. The character loaded is Fury Warrior…".
    - The version line read "Simulator version c03a4469b81c, this page's own…".
    - I put the browser's data back afterwards.
- **Remaining:**
  - The handoff covers the 17 planner effects that map to a simulator buff. Everything else is listed as not simulated.
  - No handoff back from the gear page to the planner.

## Step 14 — Release gates and final evidence

- **Status:** done. Not committed, not deployed.
- **Files:** .github/workflows/site.yml, playwright.config.ts (new), e2e/smoke.e2e.ts (new), package.json and package-lock.json (`@playwright/test` 1.63.0, `typecheck` and `e2e` scripts), tsconfig.json, .gitignore, CLAUDE.md, src/raid/main.ts.
- **CI, `site.yml`:** runs on push and pull request, separate from `release.yml`.
  - Job `check`: `npm ci`, `npm run typecheck`, `npm test`, `npm run build`.
  - Job `smoke`, after `check`: `npm ci`, installs Playwright Chromium, builds, then `npm run e2e`, keeping traces on failure.
  - Node 22 with the npm cache. It hasn't run on GitHub yet.
- **Smoke suite:** 7 Chromium tests against `vite preview` of `dist/`. Every outside request is refused and the bot's API is mocked.
  - Talent Compare keeps the gear page's settings (240 seconds).
  - A reload keeps the bags and bank (21 items).
  - The level-10 link is repaired with its message, and the illegal Deflection removal is refused.
  - A run on real Web Workers (`typeof Worker` is `function`) shows a timeline and version. It reopens as a report in a fresh browser, and a character link opens there too.
  - Stop on a 20,000-run fight ends with no result.
  - A worker script returning 404 fails the run visibly instead of hanging.
  - A mocked roster sends `GET, PUT@3, POST@4` with a slow save, and the demo afterwards sends 0 requests.
- **Bug found by the suite:** after publishing, the result dialog stayed open over the page when leaving the roster and blocked it. `leaveRoster` now closes dialogs.
- **Final run, after the last change:**
  - `npm run typecheck` passed.
  - `npm test` passed: 41 files, 882 tests.
  - `npm run build` passed.
  - `npm run e2e` passed: 7 tests.
- **Diff check:**
  - No generated files are tracked: `dist/` and `test-results/` are ignored, and the addon zip in `public/` is unchanged.
  - No real credentials. The e2e test uses the fake token `smoke-token`.
  - `.claude/settings.local.json` wasn't read or touched.
  - **Not this work:** the `src/raid/effects/*` diffs (quote-style reformatting, about 1,165 lines) were already in the working tree before step 0. Review or commit them separately.

## Optional font warning

- **Status:** done.
- **Change:** `ARIALN.TTF` was never in `public/assets/fonts`, so its `url()` in `fonts.css` was a failed request for every visitor without Arial Narrow installed, and a warning on every build.
  - `fonts.css` now uses only an installed Arial Narrow and otherwise falls through `--font-narrow` to Alegreya.
  - README.md and `public/assets/fonts/README.txt` are updated to match.
- **Checks:**
  - The build no longer warns, and nothing in `src/`, `public/` or `dist/` refers to `ARIALN`.
  - New smoke test: a talent counter's font family is `WoW Narrow…Alegreya…`, and no font request for ARIALN is made.
  - Final gates after this change: typecheck passed, 882 unit tests passed, build passed with no warnings, 8 e2e tests passed.

## Explicitly unverified or deferred (from the plan)

Not attempted in this work, and not to be inferred from anything above:

- **The bot's API:** authorisation, token lifetime and revocation, OAuth callback checks, response headers, session cookie attributes, idempotency and Discord delivery. Only `return_to` handling and the roster token lifetime were read in the Group Builder source; nothing else was reviewed. Test in a designated environment; frontend flags prove nothing about server safety.
- **Game accuracy:** actual Forever combat tuning, the addon in a real client, localisation, and full item, set and proc coverage. Lua harnesses and deterministic tests don't establish in-game accuracy. Confirmed and unverified labels were kept, and no data was invented.
- **Combat maths review:** every spec's combat maths, stat weights under percentage multipliers, school-specific crit and weapon-skill bonuses across items. This needs a separate evidence-backed mechanics review now that stat accounting is fixed.
- **Devices and assistive tech:** physical phones, screen readers, cross-browser coverage beyond Chromium, performance on real devices, and any measured effect of the design changes on use.

## Remaining limitations, all steps

- **Not run for real:** no real Discord sign-in, event, publish or physical-phone test. Roster behaviour is proven against mocks. The new CI workflow hasn't run on GitHub.
- **Bot:** it still accepts a full URL in `return_to`, and the saved talent toggles and build rely on it storing `loadout` unread.
- **Talents in the raid planner:** planner share links still don't carry player builds (the codec is unchanged, per CLAUDE.md), and a read-only roster's invalid build is shown as stored.
- **Reports and replay:** reports from before step 8 open without a timeline, and trinket aura ids differ between builds of the same config.
- **Gear search:**
  - The capped top-gear choice ranks by per-item score, without set bonuses.
  - Weapons stay outside the combination search.
  - Picking the capped shortlist is synchronous up to about 100k steps.
- **Local storage:** one character draft per device, and named saves only show the existing "would not let me save" message when storage is full.
- **Keyboard and phone:** keyboard checks used programmatic focus and events, with no screen reader or real Tab order. A player can't move straight from one seat to another group by keyboard; the ⇄ dialog covers it.
- **Planner-to-gear handoff:** it maps 17 planner effects; the rest are listed as not simulated. Talents are never transferred.
- **Raid page imports:** the planner hash and `#gb=` imports weren't reworked under step 11.

## Findings

| Step | Status | Files | Checks | Limitations |
|---|---|---|---|---|
| F01 publish waits for save | done | roster-mode.ts, raid/main.ts | 4 tests, fake network | no live event |
| F02 roster state isolated | done | raid/main.ts | browser, fake network | no unit test (DOM) |
| F03 rename/loadout save | done | raid/main.ts | browser, fake network | no unit test |
| F04 real seats, read-only | done | raid/main.ts, raid/render.ts | browser, demo and read-only | server remains authority |
| F05 sign-in fragment, sign-out | done | session.ts, 3 page mains | 6 tests, browser | bot still accepts full URLs |
| F06 prefs overwrite | done | storage.ts, talents, dps | 3 tests, browser | lost prefs not recoverable |
| F07 reload keeps inventory | done | dps/codec.ts, dps/main.ts, storage.ts | 4 tests, browser 21→21 | one character kept |
| F08 talent legality | done | talents/build.ts, codec.ts, main.ts | 6 tests, browser | raid imports not validated |
| F09 MP5/hit accounting | done | dps/stats.ts | 4 tests | haste gear now counts too |
| F10 report inputs, version | done | client.ts, codec.ts, dps/main.ts, vite.config.ts | 6 tests, browser | old reports never replay |
| F11 gear pairs, swaps | done | topgear.ts, gear.ts | 10 tests | weapons not combined |
| F12 gear-search cap | done | topgear.ts, client.ts, render-topgear.ts | 4 tests, browser | capped choice ignores sets |
| F13 input shapes, invalidation | done | storage.ts, codec.ts, dps/main.ts, talents, raid | 9 tests, browser | fight clamp not unit tested |
| F14 touch and keyboard | done | talents, tooltip.ts, raid, base.css, raid.css | browser | no device or screen-reader test |
| F15 docs drift, CI | done | render-sim.ts, raid/main.ts, README.md, site.yml | 3 tests | workflow not yet run |
