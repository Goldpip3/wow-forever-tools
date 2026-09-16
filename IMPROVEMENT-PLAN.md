# WoW Forever: review and implementation plan

Prepared 16 September 2026 for Claude Code, Codex, or a developer working in this repository.

## Purpose and execution instructions

Improve the reliability and usability of the existing talent calculator, raid planner, gear simulator, and Discord roster editor. Keep the existing Warcraft visual identity and framework-free architecture. The strongest product opportunity is carrying a character's build and actual raid buffs into gear analysis without re-entering them.

This document is a handoff, not a record of implemented fixes. Apart from this document, the reviewer made no lasting application or test edits. Temporary diagnostic tests used mocked networking and were removed after recording their results. The production build regenerated its normal outputs. No real roster was edited or published and no Discord messages were sent.

When implementing:

1. Work through the numbered steps in order. Finish and verify one step before starting the next. Each step should be a separately reviewable change.
2. First inspect the current diff and applicable repository instructions. Read `CLAUDE.md`, `WRITING.md`, `AUTH-SPEC.md`, `ROSTER-SPEC.md`, and `INTEGRATION.md`. Never overwrite existing work. Do not read or copy private local settings into reports.
3. Reproduce each finding against current code before changing it. This repository changed during the review. If a finding is already fixed, record evidence and skip that fix.
4. Keep an implementation checklist recording: step, status, files changed, checks run, remaining limitations. Report actual results, not only that commands were launched.
5. Do not rewrite the application, replace the framework, invent game data, or combine unrelated refactors with correctness fixes.
6. Preserve valid existing build/roster links. Migrate storage and report formats deliberately. Never silently reinterpret an old simulation as a newly calculated result.
7. The server remains the permission authority. Frontend guards improve behavior; they are not substitutes for API authorization. Do not auto-retry a conflict with a newer revision.
8. Verify network-writing behavior with mocks first. Use a designated test event for any later integration check. Production publishing/deployment is a separate action, not part of executing this review plan by default.

Paths below are relative to the repository root. Function names are the stable references; line numbers from an evolving workspace should not be treated as permanent.

## Review baseline and corrections to the initial review

- Reviewed the live homepage, talent calculator, sample mage simulation, raid planner, roster introduction, and demo roster. Inspected the talent layout at a 390 × 844 viewport. This was not a physical-phone or comprehensive assistive-technology test.
- Reviewed local state management, codecs, talent rules, gear selection, simulator configuration, stat accounting, and roster save/publish paths.
- Latest complete test run during the review: **531 tests passed across 24 files**. Type checking and **`npm run build` passed**. The build emitted a non-blocking warning for the optional `ARIALN.TTF` asset.
- Nine temporary diagnostic checks reproduced the behaviors documented below. These were observation checks that asserted current faulty behavior; they are not regression tests that prove the application correct. Implementing agents should write desired-behavior regressions.
- Last recorded commit: `2fa26d9` (“Correct the test count, which is four phases out of date”), with pre-existing uncommitted changes. Files continued changing during the review; rerun the baseline before implementation.
- **Resolved since the first review:** the TypeScript assertion error at the old `tests/build.test.ts:509` has been corrected. Do not apply the earlier proposed fix again.
- **Updated since the first review:** at the successful test/build checkpoint, the local simulator registry included Frost Mage, Arms Warrior, Fury Warrior, and Combat Rogue. Some UI text still listed only the first three. Additional Shaman modules appeared while the document was being finalized; those later changes were not covered by that checkpoint. Generate support text from the current registry rather than copying any fixed list from this review. Local support is not proof that every change is deployed.
- The initial refresh test on the live sample mage showed **21 items before refresh and 17 afterward**. The source still distinguishes a full local export from a trimmed link containing equipped items.

## Findings and evidence

Priority means implementation order, not a claim that an exploit or production incident occurred. “Source-confirmed” means the faulty code path is present; it does not mean it was exercised against a real Discord event.

### F01 — Publish races the pending roster save — high

`src/raid/main.ts`, `doPublish`; `src/raid/roster-mode.ts`, `Saver.flush`.

Publishing calls `saver.flush()` and immediately sends the publish request with the current revision. `flush()` returns void and starts an asynchronous save. A diagnostic with a delayed mock response verified that it returns before the revision update. Publishing can therefore use the previous draft or encounter a revision conflict. The consequence depends on server request ordering; live notifications were not tested.

### F02 — Live roster state is not isolated from mode changes — high

`src/raid/main.ts`, `drawRosterIntro`, `enterDemoMode`, `enterRosterMode`, `startSaver`.

Entering the introduction leaves an existing saver/access context alive. Entering the demo replaces `rosterState` without disposing that saver or clearing `access`. The saver captures the old event access but collects the current global roster. Navigating from a real event to the introduction and then the demo can attempt to send demo rows to the previous event. Whether the API accepts those rows was not tested. Old fetch/save responses also lack a consistent event-generation guard.

### F03 — Some roster edits never queue a save — high

`src/raid/main.ts`, `handlers.onRename`, `openLoadout`.

Renaming calls `syncHash`, which deliberately does nothing in roster mode. Loadout/spec edits redraw and call `syncHash`, but do not call `rosterChanged`. Those edits may persist only incidentally when a later seating change queues a save. This contradicts the autosave behavior the interface presents.

### F04 — Real-roster seats use planner actions and incomplete permission guards — high

`src/raid/main.ts`, `openPicker`, shared handlers, `drawRoster`; `src/raid/render.ts`, `seatCard`, `renderGroups`; `src/raid/roster-mode.ts`, `slotsFrom`.

- In the live demo, clicking an empty seat's plus button opened the hypothetical-spec picker. Selecting Arms added “Arms Warrior” while the 17 existing signups stayed in the pool.
- That path uses `createPlayer`, not `makeGuest`. `slotsFrom` skips players without a Discord/guest identity. The screen can therefore show a filled seat that will not be serialized.
- The shared seat renderer has no edit-permission parameter. Name fields, dragging, removal, the picker, and loadout editing are still available through shared handlers even when the roster is read-only. This is a frontend integrity issue; no API authorization bypass was established.

### F05 — Sign-in moves fragment contents into a request query; sign-out hides failures — high

`src/shared/session.ts`, `beginSignIn`, `signOut`.

`beginSignIn` URL-encodes the complete `location.href` into `return_to`. From a signed roster URL, this moves its fragment token into the authentication request's query string, contrary to the repository's fragment-only token rule. The same mechanism can send a gear-report fragment to the API. Actual server logging was not inspected. `signOut` also clears the local user on an HTTP failure or network error even though the server cookie may remain active.

### F06 — Talent comparison overwrites simulator preferences — high

`src/talents/main.ts`, `onToggleCompare`; `src/shared/storage.ts`; `src/dps/main.ts`, preferences.

The calculator writes `{ compare }` over the entire `wf.prefs` object. Simulator fight settings, overrides, and custom rotations stored in that object are lost. Source-confirmed and still present after the initial review.

### F07 — Refresh drops unsaved inventory — medium

`src/dps/main.ts`, `syncHash`, `adopt`, `readHash`; `src/dps/codec.ts`, `trimForLink`.

The live sample's item count changed from 21 to 17 after refresh. Full bag/bank inventory exists in memory and explicitly saved characters, while the current URL is trimmed. There is no automatic full-current-character recovery on reload. Existing explicitly saved characters are not claimed to be deleted.

### F08 — Talent legality is not maintained — high

`src/talents/build.ts`, `canRemove`; `src/talents/codec.ts`, `decode`; `src/talents/main.ts`, level changes.

- Live reproduction: spend 5 points in Deflection, add 1 point in Improved Charge, then remove 1 Deflection point. The calculator accepts 4 points in the first row while retaining the second-row talent. It counts points in the dependent row toward its own requirement.
- Diagnostic reproduction: decoding `warrior/10/05000000000000000-000000000000000000-0000000000000000000` produces **−4 points left**. Decoding clamps individual ranks but does not enforce the level budget, row gates, or prerequisites.
- Level reduction and downstream raid imports should be validated through the same rules, rather than patched independently.

### F09 — Equipped regeneration and absent hit values are miscounted — high

`src/dps/stats.ts`, `baselineStats`, `deriveStatSheet`; `src/dps/importer.ts`, `readSheet`.

With buffs removed in an isolated fixture, an equipped item carrying 10 MP5 produced **0 MP5** in the simulated sheet. Removing that item produced **−10 MP5**. The baseline starts MP5 at zero, subtracts equipped MP5, then adds the same gear back. A second diagnostic removed the exported spell-hit field and supplied 3 spell hit on gear; the resolved sheet still reported **0**, despite the importer saying gear supplies missing hit. This is accounting evidence, independent of uncertain Forever spell tuning.

### F10 — Simulation, replay, and saved reports use different inputs — high

`src/dps/main.ts`, `replayMiddle`, `reportFor`, `openReport`; `src/dps/client.ts`, `configFor`; `src/dps/codec.ts`, `Report`.

The normal run includes custom rotation rules and `effectsOn(character)`. Replay reconstructs a separate configuration without those fields. Reports do not store custom rotation rules; opening one adopts the receiving device's saved rules. Reports also lack an explicit engine/data revision, so a historical summary can be displayed next to a timeline recalculated by newer code.

### F11 — Gear search drops valid combinations and misidentifies swaps — high

`src/dps/topgear.ts`, `allowed`, `swapsIn`, `valid`; `src/dps/gear.ts`, `candidatesFor`.

- A diagnostic using asymmetric ring choices (`finger1`: worn 200 or 300; `finger2`: worn 100 or 300) loses the original 200/100 pair because lexical ordering removes it even though its reverse is not available in those lists.
- `swapsIn` compares item IDs only. The same ID with a changed enchant is reported as no swap; the UI can then label it “What you are wearing”. Suffix differences need the same treatment.
- `valid` uses nullish fallback for overrides: an explicit `offhand: null` is treated as the old offhand, rejecting a two-hander plus an intentionally empty offhand.
- Test owned-copy multiplicity as part of the fix: candidate deduplication and physical-item identity must distinguish two owned copies from equipping the same physical ring twice.

### F12 — Gear-search limits apply after expensive enumeration — high for large inventories

`src/dps/topgear.ts`, `countCombinations`; `src/dps/main.ts`, `draw`; `src/dps/client.ts`, `runTopGear`.

The UI fully enumerates combinations to count them during rendering. Execution expands the complete generator into an array before slicing to `TOP_GEAR_CAP` (2,000). Thus the cap does not bound preparation time or memory. With many slots, the theoretical product grows exponentially. This control-flow issue is source-confirmed; an intentionally huge browser-freezing test was not run. The first 2,000 enumeration-order combinations are not necessarily the strongest 2,000, and “Try them all” does not explain the cap. The final progress total also omits the baseline rerun and assumes five finalists even when fewer exist.

### F13 — Input shapes and derived results need stronger boundaries — medium

`src/shared/storage.ts`, `readJson`; `src/dps/codec.ts`, `decodeReport`; `src/dps/main.ts`, fight and rotation handlers.

A diagnostic confirmed that `[2, { character: {}, summary: {} }]` is accepted by the report decoder. Later character parsing rejects this particular empty character, but the decoder itself does not validate the fight/result structures used after a valid character loads. Storage parsing similarly trusts the requested TypeScript type. Fight changes clear basic results but leave `topGear` and drop results stored; measuring new weights makes those old results visible again. Result invalidation is duplicated and inconsistent across controls.

### F14 — Touch and keyboard operation are incomplete — medium

`src/talents/main.ts`, pointer handlers; `src/shared/tooltip.ts`; `src/raid/render.ts`, seats and pool rows.

Talent removal is exposed through right-click/Shift-click, with no explicit touch decrement control. Tooltips listen to pointer events rather than keyboard focus. Pool rows offer drag-and-drop and Cut/Put back, but no individual keyboard-accessible placement action. The phone-width layout stacks correctly, but the tall header and small secondary text reduce working space. Physical touch behavior and full focus order still require device testing.

### F15 — Onboarding and documentation drift — medium/low

`src/dps/render-sim.ts`, `renderUnsupported`; `src/dps/sim/specs/index.ts`; `src/raid/main.ts`, roster introduction; `README.md`; `.github/workflows`.

The supported-spec sentence omits Combat Rogue. Roster introduction text offers direct sign-in but also says it opens from Discord rather than here. README descriptions of architecture, data contents, simulator limitations and debuff defaults need reconciliation with current code. The reviewed workflow directory contains addon release automation, but no checked-in general site test/build workflow. External Cloudflare checks were not inspected.

## Ordered implementation steps

### Step 0 — Establish the current baseline

**Covers:** all findings; especially the resolved build issue.

- Record commit and existing modifications. Re-read functions named in each finding; update obsolete findings instead of reproducing old patches.
- Run `npm test`, `npx tsc --noEmit`, and `npm run build` separately and record their outcomes. Do not attribute the optional font warning to a build failure.
- Record the actual supported-spec registry and which version is deployed. Do not assume local and live match.

**Complete when:** there is a reproducible baseline and an explicit list of already-resolved findings. Do not start a broad refactor to fix an unrelated failing baseline.

### Step 1 — Keep authentication state and tokens safe

**Covers:** F05. **Files:** `src/shared/session.ts`, associated header/account behavior and new focused tests.

- Build authentication return destinations without serializing private fragment contents into the API query. Return to a safe page/event route; do not persist the signed token in cookies or localStorage to work around this.
- Treat non-success HTTP status and network failure during sign-out as failures. Keep account state truthful and offer retry.
- On confirmed sign-out, clear account-specific cached lists and exit or make session-authorized roster editing read-only. Define signed-link behavior separately; do not assume a revoked session revokes an independently valid link.

**Verify:** fake signed token never appears, raw or encoded, in an outgoing authentication URL; ordinary talent/gear navigation still recovers safely; successful, failed and offline sign-out produce correct UI. No real credentials are needed.

### Step 2 — Isolate each roster session and every mode transition

**Covers:** F02. **Files:** `src/raid/main.ts`, `src/raid/roster-mode.ts`.

- Give each opened event an owned session object containing access, roster state, saver, and generation ID. Saver callbacks must capture that event's state, not mutable page globals.
- Add one transition/disposal path used by real event → introduction, real event → demo, event A → event B, and roster → planner.
- Cancel or ignore stale fetch/save callbacks. Set demo access/saver to null explicitly and add a defensive guard that prevents demo save/publish requests.
- Handle pending edits before navigation deliberately. Do not promise that keepalive guarantees delivery: an in-flight request, browser limits, or connectivity can still prevent it.

**Verify:** deferred mocked responses for A never alter B; editing a demo after visiting a real event sends zero writes; leaving during a pending save never collects another event's state. Keep ordinary planner URL behavior unchanged.

### Step 3 — Serialize saving and publishing

**Covers:** F01. **Depends on:** Step 2.

- Implement an awaitable “save until current edits are acknowledged” operation, including an existing in-flight save and edits queued while it ran.
- Publish only after that operation succeeds, using its acknowledged revision. A failed save must prevent publication.
- Freeze edits during the publish transaction, or explicitly capture and publish a stable snapshot. The confirmation counts must refer to that snapshot.
- Preserve 409 conflict handling without automatic overwrite. Avoid showing “saved” while a later local edit is still pending.

**Verify:** mock a slow first save, a second edit during it, failed save, conflict, double publish click, and publish without pending edits. Assert exact request order and revisions, not just calls made. No POST may occur before all intended edits are saved.

### Step 4 — Make every roster action persist the right person

**Covers:** F03, F04. **Depends on:** Steps 2–3.

- Route rename, spec, talent-toggle, loadout, move, remove and suggestion changes through one mutation/dirty path.
- Pass editability into seats, drawers and suggestions, and guard mutation handlers too. Read-only inspection should still work.
- In roster mode, an empty seat must choose an existing signup or explicitly create a guest with `makeGuest`; never create an untracked hypothetical player.
- Respect active raid size and preserve signup status independently from selected/standby/cut decisions. Apply `spreadChoices` on relevant joins as required by repository guidance.

**Verify:** rename-only and loadout-only edits trigger a save; every filled real-roster seat survives `slotsFrom`/reload; a viewer cannot locally mutate through any control; a guest has a stable synthetic identity; selected/standby/cut and the signup's original status round-trip separately.

### Step 5 — Preserve preferences and full inventory

**Covers:** F06, F07. **Files:** `src/shared/storage.ts`, `src/talents/main.ts`, `src/dps/main.ts`, codecs.

- Introduce a small typed preference patch helper or clearly separated preference keys. Preserve existing saved settings during migration.
- Automatically save a full current-character draft locally, separately from named saves and share links. Keep inventory out of shared URLs.
- Define precedence: an explicit incoming shared character/report opens what was shared; an ordinary reload may recover the matching full local draft. Never silently merge unrelated inventory into a shared character.
- Clear removes the current draft. Storage denial/quota exhaustion must produce a useful notice without crashing or claiming success.

**Verify:** changing comparison does not alter DPS preferences; full inventory survives reload; a shared link opens correctly on a fresh browser; local saved characters remain available; blocked storage and invalid stored JSON have safe fallbacks.

### Step 6 — Enforce legal talent builds at every entry point

**Covers:** F08. **Files:** talent rules/codec/main and raid talent-import adapters.

- Create one validator for integer ranks, maximum ranks, level budget, prerequisite chains, and points in earlier rows needed by later rows.
- Use it after proposed removals and level changes, and on decoded/imported builds. Decide explicitly whether an invalid import is rejected or repaired with a visible explanation; never present it as valid silently.
- Keep existing valid URL formats compatible. Share rule checks between editing and import paths.

**Verify:** the Deflection/Improved Charge reproduction refuses the invalid removal; a level-ten five-point code cannot render as a valid negative-budget build; chained prerequisites and level reduction remain legal; representative valid builds from every class round-trip unchanged.

### Step 7 — Correct simulator stat accounting

**Covers:** F09. **Files:** `src/dps/stats.ts`, importer/export types if necessary, stat tests.

- Explicitly distinguish totals measured on the character sheet from stats supplied only by equipment. Do not subtract equipped stats from an absent sheet total as if absence meant zero.
- Preserve the distinction between an explicit zero hit value and a missing hit API result. Use the appropriate gear fallback only for missing values.
- Correct MP5 so equipped regeneration contributes to the baseline and removing it removes that contribution without creating negative regeneration.
- Audit other gear-only fields using the same accounting pattern, including haste. Keep already-exported buffs from being counted twice.

**Verify:** 10 equipped MP5 yields 10 without buffs; removing that sole MP5 item yields 0; missing sheet spell hit with 3 on gear yields 3; explicit measured totals remain authoritative; swaps still apply primary-stat conversions once. Check a hand-calculated mana regeneration scenario independent of recorded DPS outputs.

### Step 8 — Make simulation results reproducible and invalidate them consistently

**Covers:** F10 and the result-state portion of F13. **Files:** DPS controller, client, codec, comparison/report modules.

- Extract one pure simulation configuration builder used by ordinary runs, representative replay, comparisons, weights, top gear and drops where applicable. Pass the full inputs explicitly.
- Save custom rotations plus engine/data revision metadata in reports. Maintain an explicit migration path for old version-2 links; label missing provenance and avoid claiming an exact historical replay when inputs cannot be recovered.
- Create one invalidation operation clearing or marking stale all affected results: DPS, timeline, weights, confirmed swaps, top gear and drops. Tie results to an input fingerprint if that makes the boundary clearer.
- Store the run's input snapshot, not mutable UI state sampled after it finishes. Ignore late completions from cancelled runs.

**Verify:** a custom-rotation character with an item effect reproduces the representative iteration; a report opened on a device with different preferences uses the report's inputs; changing fight, gear, buffs or rotation prevents old recommendations resurfacing after new weights; older reports remain readable with honest limitations.

### Step 9 — Correct gear combination identity and legality

**Covers:** F11. **Files:** `src/dps/topgear.ts`, `src/dps/gear.ts`, comparison/identity helpers.

- Enumerate valid paired choices before deduplicating symmetric equivalent loadouts, or construct pairs directly. Do not discard a pair unless its equivalent is actually represented.
- Separate physical ownership identity from item-variant identity. Use enough information to preserve enchant/suffix differences and the count of identical owned copies.
- Make `swapsIn` describe every simulated change. Distinguish no override (`undefined`) from intentionally empty (`null`) for weapon slots.
- Keep the current equipment represented. If weapons remain outside top-gear optimization, label that scope instead of implying the entire outfit was optimized.

**Verify:** reversed-ID equipped rings remain a candidate; the same physical item is not worn twice; two owned nonunique copies can be used; unique rules hold; enchant/suffix changes appear in instructions; two-hander plus cleared offhand is legal.

### Step 10 — Bound gear-search work before rendering or allocation

**Covers:** F12. **Depends on:** Step 9.

- Remove exhaustive counting from `draw`. Cache planning by relevant inputs and calculate an upper bound or a bounded count.
- Stream or otherwise bound enumeration before allocating the result set. Include preparation in cancellation behavior; worker-based simulation alone does not solve main-thread preparation stalls.
- Use a documented deterministic shortlist strategy when the search is capped. Preserve the current outfit and disclose that the best result is among evaluated candidates, not a proof of global optimality.
- Display both estimated and actually evaluated counts honestly. Calculate the final progress denominator from the baseline plus actual finalist jobs. Use real worker concurrency for timing estimates where available.

**Verify:** a synthetic large-inventory plan has bounded preparation time/memory and a usable cancel action; no full spread precedes the cap; candidate selection is deterministic; progress never exceeds 100% and finishes at 100%, including fewer-than-five finalist cases. Start benchmarks with bounded fixtures rather than deliberately freezing a browser.

### Step 11 — Validate reports, preferences and imported state

**Covers:** the input-boundary portion of F13.

- Parse untrusted data as `unknown` and validate the minimal shape required before changing active state. Small explicit validators are sufficient; a new schema dependency is optional, not a requirement.
- Check finite bounded numeric fields, valid supported IDs, arrays, report summaries, rotation records, and sensible payload sizes. Handle malformed compressed input with a recoverable error.
- Keep validation distinct from migration. An older valid object can migrate; a wrong-shaped object should not be trusted because JSON parsing succeeded.

**Verify:** valid old/current fixtures, malformed shapes with a valid character, null preferences, invalid array fields, unsupported versions, extreme iteration/duration values, and corrupt compressed strings. An invalid import must leave the prior working state intact.

### Step 12 — Make primary workflows usable without dragging or right-clicking

**Covers:** F14. **Depends on:** correct mutation and talent-rule paths.

- Add explicit add/remove talent controls usable by touch and keyboard. Reuse the legality checks rather than creating a second editing path.
- Add individual “seat/move to group and seat” controls for roster members, with drag-and-drop as an additional convenience.
- Show relevant tooltips on keyboard focus; support dismissal and restore focus after actions. Avoid full-page redraws losing focus or unfinished text where a smaller update is practical.
- Test 390px, tablet and desktop layouts. Reduce header height and improve secondary-text contrast while preserving themed headings. Measure contrast before selecting colors.

**Verify:** keyboard-only talent allocation/removal and individual roster seating; visible focus; sensible focus after mutations and dialogs; no horizontal page overflow at tested widths. Record physical-phone checks separately from viewport-only checks.

### Step 13 — Improve onboarding, then connect the tools

**Covers:** F15 and the original product suggestions. **Depends on:** correctness steps above.

- Generate supported-spec text from the registry. Put support status and sample buttons before addon installation instructions.
- Reconcile roster sign-in/setup instructions with actual routes. Replace misleading empty-state success messages such as an empty raid being described as having every player in the right group.
- Update README/contracts where implementation changed; preserve attribution and uncertainty labels. Add visible data/version provenance where it helps interpret results.
- Design a small explicit handoff from a planner member to gear simulation: selected build, supported spec, raid/party buffs, debuffs, and unsupported mappings. Keep it a user action; do not silently apply every raid effect.
- Imported character-sheet talents and buffs may already be reflected in exported stats. Do not change talents while pretending the sheet baseline remains correct. Initially transfer only inputs the simulator can model consistently; explain unsupported changes.

**Verify:** sample-first onboarding works without an account; support lists include all registered specs; a melee party and a caster party transfer different appropriate inputs; already-exported buffs are not doubled; unknown effects remain visibly unsupported.

### Step 14 — Add release gates and finish with evidence

- Add general pull-request checks for tests, type checking and the production build, separate from addon releases. Follow the existing runtime/lockfile requirements.
- Add a small browser smoke suite for the highest-value gaps: preference preservation, inventory refresh, talent legality, report reopen, and mocked roster save/publish/mode transitions. Pure unit tests currently do not cover enough controller behavior.
- Validate worker-enabled execution in a browser; the unit-test pool fallback does not test browser worker startup/failure/cancellation. Add a fresh-browser link check.
- Run the full checks once the final changes are in place, then inspect the diff for unintended data, generated files and unrelated edits. A green run before subsequent changes is not final verification.
- Deliver the implementation checklist, remaining limitations, and reviewable changes. Deploy only under the user's separate deployment instruction or existing explicit authorization.

**Complete when:** all accepted fixes have desired-behavior regressions or documented UI verification, the final build passes, and the handoff records what remains unsupported.

## Explicitly unverified or deferred

- API implementation: authorization, token lifetime/revocation, OAuth callback validation, response headers, session cookie attributes, idempotency and Discord delivery semantics. The API repository was not reviewed. Validate in a designated test environment; do not infer safety from frontend flags.
- Actual Forever combat tuning, addon behavior in a real game client, localization, and complete item/set/proc coverage. Lua harnesses and deterministic tests do not establish in-game accuracy. Preserve confirmed/unverified status; do not invent missing data to fill panels.
- Detailed combat math for every supported spec, stat-weight behavior under percentage multipliers, school-specific crit interpretation, and weapon-skill bonuses across all equipped items. These deserve a separate evidence-backed mechanics review after accounting fixes.
- Full physical-mobile, screen-reader and cross-browser coverage; realistic device performance limits; measured conversion/retention effects of design changes.
- Optional font asset warning: either supply the intended optional asset or remove its stale file reference and verify fallback. This is not a reason to delay correctness work.

## Suggested instruction to give the implementing agent

Read `IMPROVEMENT-PLAN.md` and the repository instructions. Revalidate Step 0 against the current working tree, preserving existing changes. Then implement the numbered steps in order, one reviewable change at a time, with the completion checks listed for each step. Mark already-fixed findings as resolved with evidence rather than applying them again. Use mocked networking for roster tests and do not publish real rosters or deploy the website as part of this task. Maintain a checklist of completed steps, tests, and remaining limitations.
