# Guild usability, privacy, and functionality execution plan

Review date: September 21, 2026 (America/New_York).

## Instructions to the implementing bot

Implement this plan in dependency order, with separate reviewable changes for each phase. Work in both repositories where required:

- Website: `C:/Users/colom/Claude Projects/WoW Forever`
- API/Discord bot: `C:/Users/colom/Claude Projects/Group Builder`

First read each repository's applicable instructions and inspect its current state. Preserve unrelated work. Revalidate the findings below against the current revision before changing anything. Do not replace functionality that already works. Keep the existing visual identity, and improve the member journey before adding administrative complexity.

This document is a plan, not authorization to post messages to Discord, change production permissions, delete real member data, or deploy. Implement and test using synthetic data and an explicitly designated test server. Prepare migrations, rollout instructions, and rollback before production review. Never include production member data or secrets in screenshots, fixtures, logs, or PRs.

Ship phases 0–2 as the first release. Build phases 3–4 incrementally behind feature flags. Each feature must have a usable member flow, backend authorization, privacy behavior, and acceptance tests before it is considered finished.

## What was reviewed and what is known

The live homepage, signed-out Guild and Roster pages, sample guild directory, sample character profile, and sample editor were inspected. The local website guild/session code and the local Group Builder character routes, services, session handling, and web server were read. Seven existing website test files passed: 98 tests total. These are targeted tests, not a full build or end-to-end validation.

No real Discord account was signed in, no live guild data was changed, and no Discord message was sent. Production API configuration, authenticated production behavior, and physical mobile devices were not verified. Local backend findings do not prove the production server runs the same revision.

### Confirmed findings

| Priority | Finding | Evidence and implication |
|---|---|---|
| P0 | Live website and local source differ | The live sample editor asks for REALM and says names are 2–12 letters. Local `src/guild/render.ts` uses rulesets, a 25-character name field, and surname guidance. Establish deployment provenance before assuming a local fix is live. |
| P0 | Gear privacy validation is too permissive | Website `readPaste()` forwards `equipped` and talent objects substantially intact. Bot `gearPutSchema` accepts arbitrary equipped keys and unknown nested objects, then stores them. Top-level bags/bank are omitted, but extra private data nested inside allowed containers can survive. |
| P0 | Ads execute on a page holding guild data | `guild.html` includes AdSense. External JavaScript executing in the page is a trust boundary for DOM data and fragments. This is an exposure surface, not evidence that Google collected guild data. |
| P1 | Failed saves discard the draft | `save()` redraws before awaiting the API. `renderEditor()` reconstructs fields from the original character or defaults; `keepFocus()` only preserves focus. A failed write returns a reset form. Gear paste text is also lost on redraw. |
| P1 | Officer onboarding contradicts the UI promise | `knownPeople()` only includes owners who already have characters. The officer owner picker cannot select a member filing their first character. The backend supports creating for another current member. |
| P1 | Imports can leave inconsistent data | `pasteGear()` updates level/professions only when blank, checks name mismatch but not class/ruleset mismatch, and saves gear and profile in separate requests. Gear can succeed while the profile update fails. |
| P1 | Broad member visibility is the current policy | The bot returns account-level attendance on every authorized character detail request. List responses contain owner Discord IDs, display names, and last-editor IDs. The UI automatically links alts with “Also plays.” There are no per-field visibility choices in the current contract. |
| P1 | Async responses can outlive navigation | Guild list/detail requests have no cancellation or generation checks. Late responses can overwrite state after switching server, opening another character, or signing out. This is a race risk established from code, not an observed cross-server authorization bypass. |
| P1 | Offline and signed-out states are conflated | `loadUser()` treats all non-success responses/network failures as signed out and has no visible retry state. Guild requests have no timeout or typed runtime response validation. |
| P2 | Discovery is limited | Search covers names/class/spec/professions but omits the role field; there are no structured role, ruleset, level, main/alt, or freshness filters. A search such as “healer” does not reliably find healers. |
| P2 | Navigation and copy need correction | Profile navigation replaces history rather than supporting Back to the directory; guild hash changes are only read on startup. Privacy copy still describes realms. “Only what you are wearing” understates the stats/talents/race/level upload. |
| P2 | The demo needs credible fixtures | The live sample tank displays Bloodfang items and a caster trinket. Fictional examples should still be internally coherent so they teach the product correctly. |

Preserve existing strengths: real backend membership checks, owner/manager write checks, leader-only missing-member responses, server-side session revocation, no retained Discord OAuth credential in session records, accented-name search, explicit gear removal, and top-level bag/bank trimming.

## Phase 0 — Establish the release baseline

1. Record local website and bot commit IDs, deployed versions, API schema version, and public asset fingerprints. Determine why production still uses the older guild form; inspect deployment branch/build/caching rather than blindly redeploying.
2. Add a small non-sensitive build/version indicator to diagnostics and a documented frontend/API compatibility contract. Test both extensionless and `.html` URLs, including OAuth return fragments.
3. Reconcile name/ruleset schema, examples, documentation, and migrations. The bot gear schema still mentions `realm` while website uploads contain `ruleset`; resolve this explicitly. Verify game-specific claims from authoritative current sources before changing rules. Never silently convert a historic realm to a ruleset.
4. Capture baseline desktop and 390px mobile screenshots with synthetic data. Run website tests/typecheck/build and relevant backend tests. Record environmental failures separately from test failures.

Acceptance: a reviewer can identify exactly which version is live, which fixes are local-only, and whether the website/API versions are compatible. Existing records survive migrations.

## Phase 1 — Fix privacy boundaries before expanding access

### 1A. Strict data minimization

Create shared/versioned upload and response schemas. Construct new objects from an allowlist at every depth: recognized equipment slots, item fields, stat keys, talent fields, bounded strings/arrays, valid finite numbers, and supported export versions. Reject unknown or prohibited nested fields; do not merely hide them in the UI. Keep raw addon strings and bags/bank local and transient. Use a route-level request size limit before parsing, not only a size check after Fastify has parsed the body. Bound client parsing too.

Do not log request bodies, OAuth codes, cookies, access tokens, or raw exports. Sanitize error URLs in the central error handler; currently it logs `request.url`, which can include query parameters. Audit reverse-proxy logs and error reporting as well. Give users a short upload preview naming every category sent and its audience.

Acceptance: synthetic canary strings hidden under `equipped`, item metadata, talents, and unknown stats never reach persistent storage, logs, exports, or another user. Oversized/malformed requests fail predictably without a crash.

### 1B. Field-level visibility enforced by the API

Use these recommended defaults, with explicit owner choices and guild-scoped permissions:

| Information | Default audience | Rule |
|---|---|---|
| New profile before sharing | Owner | A draft becomes discoverable only through an explicit share action. |
| Shared character name/class/spec/role/level/ruleset | Chosen guild audience | Start with the configured guild-member/raider audience; no anonymous/public directory. |
| Profession directory entry | Same audience as profile | Member chooses to list crafting availability. |
| Gear, stats, talents | Owner until shared | Offer owner only, designated officers, or guild audience; preview before first upload/share. |
| Discord display identity and links to alts | Explicit choice | Do not assume that sharing two characters consents to linking them. |
| Individual attendance | Owner and authorized raid officers | No ordinary-member attendance browsing by default. Explain account-level counting and provide corrections. |
| Missing-profile/completion lists | Designated guild leadership | Keep current restricted behavior; never publish a list of members who have not opted in. |
| Edit audit records | Owner and authorized administrators | Return the minimum actor information needed. |

Return opaque guild-scoped references rather than raw Discord IDs where the browser does not need those IDs. Hiding “Also plays” is insufficient if all profiles still contain a common owner ID or display identity. Filter response fields and list membership server-side; enforce the same rules in searches, aggregates, exports, Discord commands, and event lookups. Avoid counts that reveal private profiles. Do not permit cross-server identity correlation.

Treat manager editing, attendance access, profile moderation, and guild administration as separate capabilities. Do not equate a Discord administrator automatically with every product role without an explicit documented policy. Officers may prepare a profile for a member, but it should be pending owner acceptance before broad publication; officers cannot broaden the owner's privacy setting.

Migration: never broaden existing visibility. Existing broad records may be narrowed with clear owner notice, and new fields default private. Describe that previously viewed or posted information cannot be made unseen retroactively.

### 1C. Browser and session protections

Remove advertising and unrelated third-party scripts from Guild and authenticated Roster surfaces. Because other tools hold character data and bearer fragments too, preferably keep advertising on the public homepage only. Self-host fonts on private tool pages. Add a tested CSP, restrictive referrer policy, frame protection, and `Cache-Control: private, no-store` on authenticated API responses. Verify CDN behavior rather than assuming the header is honored.

Keep HttpOnly/Secure cookies and test a host-only API session cookie instead of sharing it with every subdomain. Cross-origin credentialed requests do not require a parent-domain cookie. Add explicit CSRF defenses for cookie-authenticated writes, including sign-out, with an exact Origin policy and/or CSRF token; CORS alone is not a complete CSRF policy. Update allowed headers when adding tokens or concurrency headers. Verify OAuth state and return URL allowlisting.

Recheck membership/permissions on every protected operation and fail closed on revoked access. Add bounded retries/rate limits appropriate to Discord; distinguish Discord outages from confirmed non-membership. Clear private UI state on logout and invalidate all pending requests. Add “Sign out everywhere” using the existing backend session-removal capability.

### 1D. Discord collection and notifications

Keep sign-in limited to `identify` unless a specific feature requires another scope. The current bot declares Guilds and GuildMembers intents; preserve the member/role functionality, document its need, and do not add message-content or presence collection for this guild tool. Do not read chat history, DMs, voice activity, or online status to infer participation.

Use slash commands/buttons with ephemeral replies for personal profile lookups and private settings. Public channel posting must be an explicit operation with a preview of channel, content, audience, and mentions. A channel's visibility must be compatible with the data being posted; when uncertain, provide an authenticated link or ephemeral response. Recheck permission at send time. Member-entered text must never trigger `@everyone`, role pings, or arbitrary user pings. Default `allowed_mentions` to none and allow only intentionally selected recipients.

Make optional reminders opt-in with unsubscribe, quiet hours, frequency caps, and no repeated reminder until a meaningful state change or scheduled interval. Separate event-critical notifications from optional profile reminders and explain each. Store only the minimum notification metadata; no public absence/shaming messages or automatic “reliability score.”

### 1E. Data lifecycle

Add “My data”: inspect visibility, download owned records, delete gear/profile, revoke sessions, and request account-linked data removal across guilds. Explain what event records and already-posted Discord messages remain. Restrict exports to the requester’s authorized fields and neutralize spreadsheet formula injection in CSV exports.

Implement member-departure and bot-removal lifecycle handling plus reconciliation for missed Discord events. Remove departed members from active discovery, revoke their access immediately, and apply documented retention/deletion jobs. Proposed starting policy: current gear snapshot only; limited edit metadata for 90 days; restricted attendance for 180 days; encrypted backups expiring within 30 days. Treat these as product defaults to review, not legal requirements. Ensure restores reapply deletion records so deleted data is not republished.

Acceptance: owner/member/officer/leader/outsider/departed-member tests prove unauthorized fields are absent from JSON, not just hidden. Privacy settings cannot be widened by another member or manager. No private page loads advertising code. Production-sensitive settings require a documented deployment check.

## Phase 2 — Make the core member journey reliable

1. **Persist form state in memory.** Introduce a typed editor draft independent of the rendered DOM. Keep every field and raw paste on validation/network failures; show field-level errors and focus the first invalid field. Preserve search caret/selection through updates. Warn before discarding unsaved changes. Keep raw exports out of persistent browser storage by default.
2. **Prevent stale response races.** Capture guild/character/session identity per request, use AbortController and generation checks, and ignore responses from obsolete contexts. Lock or safely handle navigation during mutations. An old server's response must never replace the current server's state.
3. **Handle conflicts and partial outcomes.** Add revision/ETag concurrency checks; stale saves produce a reviewable conflict rather than overwriting another editor. Make creation retry-safe. Never show “Saved” when a write or required refresh failed; distinguish “saved, refresh failed” from “not saved.”
4. **Repair member selection.** Add an authorized, rate-limited member search for officers, including members without profiles. Return minimal results, avoid bulk member enumeration, and revalidate the selected owner at save time. Refresh changed Discord display names without altering ownership.
5. **Make import the easiest path.** “Add character” offers “Import from addon” and “Enter manually.” Link addon installation and `/wfsync` instructions right there. Preview identity, level, professions, gear, and changes before save. Check name/class/ruleset conflicts, handle partial/old exports, and let the member select which valid updates to apply. Do not silently relabel a character or overwrite newer data.
6. **Save imports atomically.** Commit profile updates and equipped snapshot in one backend transaction, with a shared revision and explicit partial-export status. Preserve manual fields unless the preview says they will change. Store export time separately from upload/edit time.
7. **Explain all loading states.** Separate checking sign-in, signed out, API unavailable, session expired, missing permission, empty guild, and failed load. Add timeout/cancel/retry; respect `Retry-After` and avoid blind write retries. Recover from invalid API response shapes without crashing.
8. **Use normal navigation.** Back returns from profile to filtered directory. Handle browser history/hash changes, keep deep links reloadable, and give clear unavailable/private-profile states. Restore filter and scroll context without putting personal data into the URL.
9. **Make deletion predictable.** Name the character and consequences in an accessible confirmation. If offering undo, distinguish reversible archive from permanent privacy deletion and document retention. Add a minimal owner-visible edit history and correction workflow, without storing full sensitive snapshots indefinitely.

Acceptance: a new member can add a character and understand its visibility in under two minutes excluding addon installation. Simulated 400/401/403/409/429/500, offline, timeout, double-click, server switch, logout, and failed refresh never lose the draft or write to the wrong character. An officer can prepare a first profile for a consenting test member. Importing a level/profession change produces the selected consistent update.

## Phase 3 — Make the guild tool useful every week

Use a small navigation structure: **Overview · Members · Professions · Events · My characters**, with Settings available to authorized roles. Keep advanced controls out of the default member view.

| Feature | Behavior | Privacy and correctness requirement |
|---|---|---|
| My characters | Immediate owner list, add/import/update actions, main and alternate spec selection | Private/shared badges and “View as member”; no forced alt linking. |
| Directory filters | Class, role, spec, ruleset, level range, main/alt, professions, gear freshness; clear filters and result counts | Filter only authorized records; omit raw identities from saved views. |
| Useful summaries | Roles, profession coverage, stale-data counts, recruitment needs | Label incomplete data; separate characters from distinct players. Count only relevant ruleset/team and avoid claiming coverage from incompatible characters. |
| Profession finder | Profession/skill/specialization/recipe search, voluntarily listed crafting availability | Use verified recipe data or explicitly self-reported entries; no bag/bank inference or automatic DMs. |
| Event connection | Link signup to chosen character; show gear age and chosen role; open authorized roster | One person cannot fill multiple seats through alts. Resolve incompatible rulesets and record which character attended. |
| Raid preparation | Opt-in attunement/resistance/consumable checklist, missing buffs, alternate-role choices | Mark manual claims and stale exports; do not pretend inventory was scanned. Keep private readiness details restricted. |
| Attendance corrections | Owner sees event-level records and can request correction; authorized officer confirms | Show denominator and distinguish standby, excused, cancelled, late, and absent. No punitive composite score. |
| Sharing/export | Copy authenticated profile link; preview sanitized authorized CSV or Discord summary | Link grants no access by itself. Exclude private notes/attendance/identities unless expressly allowed. |

On mobile, use compact summary rows/cards and expandable detail. Keep search and primary action easy to reach; use readable type, visible focus, labeled controls, accessible status announcements, and touch targets around 44px. Replace the unhelpful “Armory and logs” placeholder panel with a small factual note until there is a working integration.

Acceptance: without coaching, a member can find an enchanter, identify their next event, update gear, change profile visibility, and remove their data. A leader can find a role gap without counting the same player's alts twice. Verify at 390px, desktop, keyboard-only, and 200% zoom, then on real iOS Safari and Android Chrome.

## Phase 4 — Optional advanced features

After the first three phases are stable, add in this order:

1. Multiple raid teams within one Discord server, with explicit team membership and access rules. The current one-server/one-guild assumption must become a versioned model change, not a filter pretending to be authorization.
2. Voluntary availability windows with timezone/DST handling, expiry, and chosen audience. Do not infer availability from Discord presence.
3. Private recruitment needs and role targets; allow a separately approved, sanitized public recruitment summary.
4. Crafting requests with voluntary participation, materials entered by the requester, and explicit notification controls.
5. Guild-scoped gear wishlists and upgrade planning using verified item data and the existing simulator; user chooses which results to share. Avoid public DPS/gear leaderboards by default.
6. Calendar feeds with revocable, scoped tokens and minimal event details. Explain that a private feed URL is a credential and that calendar providers receive its content.

Each feature needs independent acceptance criteria and a feature flag. Do not add speculative integrations with an unavailable armory/log service or fabricate game data to make a feature appear complete.

## Website-wide corrections

- Explain “Raid planner” versus “Roster” consistently: planning a composition versus managing an actual event. Live roster copy says only leaders can open it, while the auth specification describes member viewing; reconcile copy with verified deployed behavior.
- Replace the raw-looking Discord invite URL with a labeled setup action and permission explanation. Distinguish the hosted bot from self-hosting instructions, and give members without invite permission a useful next step.
- Audit outdated realm/name/privacy text, sample records, “no network” claims, and data-source dates across README, privacy page, landing page, and onboarding. Scope privacy claims precisely to what actually leaves the device.
- Test public navigation, tool imports, keyboard/touch interactions, feedback redaction, reduced motion, and empty/error states after shared-header or auth changes.

## Required verification and rollout

Add regression tests for the observed draft loss, member picker gap, import consistency, role search, navigation, and request races. Add integration tests against the real backend schema; mocked browser tests alone cannot catch contract drift.

Security/privacy matrix must cover: unauthenticated requests; wrong guild IDs; guessed character IDs; ordinary member editing others; officer demotion; departure; permission outage; private fields in lists/detail/search/export/Discord responses; nested canary data; malformed/oversized uploads; cross-origin writes; stale concurrent writes; duplicate retries; deletion and backup restoration. Assert both HTTP response and stored state.

Use synthetic members for browser E2E tests of create/edit/import/share/hide/delete and server switching. Exercise a real consenting test-server owner/member/officer before launch, including revoked permissions and actual Discord delivery. Existing 98 passing tests are useful baseline evidence, not proof of these scenarios.

For rollout: back up the database, rehearse migrations on anonymized/synthetic data, deploy backward-compatible API support before frontend consumers, verify deployed build IDs, then enable features gradually. Rollback must not restore broader visibility or deleted data. Keep new features disabled if API capability negotiation fails.

Deliver for every phase: concise change summary, relevant commits, tests and results, screenshots with synthetic data, migrations/compatibility notes, known limitations, and exact deployment/rollback steps. Update GUILD-SPEC.md, AUTH-SPEC.md, the privacy page, and LAUNCH-CHECKLIST.md to match implemented behavior.

## Discord references checked for this plan

Discord's `identify` scope permits basic identity without email; retain minimal scopes and OAuth state validation: [OAuth2 documentation](https://docs.discord.com/developers/topics/oauth2).

Member, presence, and message-content access have separate privileged-intent considerations; document the required member access and avoid collecting unrelated content: [Privileged intents](https://support-dev.discord.com/hc/en-us/articles/6207308062871-What-are-Privileged-Intents).

Use explicit mention controls for generated messages: [Message resource and allowed mentions](https://docs.discord.com/developers/resources/message#allowed-mentions-object).
