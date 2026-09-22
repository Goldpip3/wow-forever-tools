# Which build is live, and how to tell

Written 22 September 2026, while working out why the deployed guild form still asked for
a realm when the source in this repository had asked for a ruleset for three commits.

The answer was not caching and not a failed build. **The branch was never merged.**
Cloudflare Pages deploys `master`; the work was on `modern-character-form`. The bot has
the same shape: the VPS runs `production/master`, and two commits of character work sat
on `guild-coverage`.

That took an afternoon of reading git to establish, so this page exists, and so does the
version endpoint. Neither the site nor the bot used to say what it was.

---

## 1. What each side was, at the baseline

| | Deployed | Local branch | Commits behind |
|---|---|---|---|
| Site (`wow-forever-tools`) | `origin/master` `f85867b` | `modern-character-form` `769b9d6` | 3 |
| Bot (`group-builder`) | `production/master` `5c72b90` | `guild-coverage` `a1a0e00` | 2 |

**The bot has since been deployed** — see §8. The site has not.

The three site commits are the dark character form, the coverage panel, and asking for a
ruleset instead of a realm. The two bot commits are the `ruleset` column with its
migration, and telling a leader who has filed nothing.

Tests at the baseline, both green: **1018** in 51 files here, **306** in 12 files on the
bot. That is `vitest run` on each, not a deploy and not a browser.

## 2. How to tell now

- **The site** prints its commit in the footer of every page: `build 769b9d6a1b2c`. A `+`
  on the end means the bundle was built over uncommitted work, so the commit alone does
  not describe it.
- **The bot** answers `GET /api/v4/version` with no session at all:

  ```jsonc
  { "api": 4, "version": "0.1.0", "build": "a1a0e002336d",
    "capabilities": ["characters", "characters.ruleset", "characters.missing", "roster", "docs"] }
  ```

  `/health` carries the same fields. `npm run build` writes the commit into
  `dist/build-ref.txt`, so a deploy does not have to remember to set anything; `BUILD_REF`
  overrides it where the commit is only known to the environment.
- **A bug report** from the site names both builds. `feedbackTemplate` puts the site's
  commit and the bot's in the template, because a report from a stale build reads as a bug
  in code that is already fixed.

Nothing here is server-specific and nothing is a secret. Both repositories are public, and
a version endpoint that needs a session cannot help explain why signing in does not work.

## 3. The compatibility contract

`API_CONTRACT` in `src/shared/api-contract.ts` is `4`, the same `v4` that is in every
path. It moves only when a shape the site reads changes in a way the site's code cannot
survive — a removed or renamed field. **Adding a field does not move it.**

`CAPABILITIES` on the bot (`src/web/contract.ts`) names features the routes behind them
have actually shipped. A client that does not find the name it wants keeps that part of
itself switched off rather than sending a request that answers 404. Names are added, never
repurposed.

The guild page reads the version once at load and, when the two disagree, says so above
everything else, naming which side is behind:

- bot number lower than the page's → the bot has not been deployed;
- bot number higher → the page is stale, so reload;
- a missing capability → named, with what to do.

An unreachable version endpoint produces **no** message. Not knowing what is deployed is
not something the reader can act on, and the request that actually needed the API says
what failed.

## 4. Realm and ruleset, resolved

Forever has no realms. The site sends `ruleset` in a gear paste; the bot's gear schema
still had `realm`, so the field was silently dropped by the schema and nobody noticed.

- The gear route now takes **`ruleset`** and validates it against the same four names.
  Unrecognised is stored as null rather than refused, because losing a whole gear save
  over a field the gear row does not store would be the wrong trade, and a wrong ruleset
  is worse than a missing one.
- The gear row stores **no identity fields at all** — not name, not ruleset. The profile
  owns those. A paste that disagrees with the profile is a question for the person pasting.
- `realm` is gone from the gear schema. An older site build still sends it; it is dropped,
  and a test asserts the value never appears in what is stored.
- The `characters.realm` **column stays, and is no longer written**. Rows written before
  `ruleset` existed hold a realm somebody typed, and the build on this branch used to blank
  it on every edit. A realm is not a ruleset and cannot be turned into one, so it stays
  untouched until a migration is written that says what to do with it.

## 5. What to check on the next deploy

1. `curl -s https://api.wowforever.us/api/v4/version` and compare `build` with the commit
   you pushed.
2. Load the site and read the footer commit. If it is the old one, the Pages build has not
   run or has not finished.
3. Both URL shapes, because Pages serves them differently and the OAuth return lands on a
   fragment: `/guild.html#guild=…` and `/guild#guild=…`. Sign in from each and confirm the
   fragment survives the trip to Discord and back.
4. The `#signin=ok` fragment is consumed and the page keeps the state it had.

## 6. Known gaps in this baseline

- No production database was read, no Discord account was signed in, and no message was
  sent while establishing any of the above. Everything here is from source, git, and the
  local test suites.
- The bot's `BUILD_REF` is only correct for a build made from a checkout with history. A
  deploy from an archive reports `unknown`, which is honest but not useful.
- Mobile was not checked on a physical device.

---

## 7. What has been done on top of this baseline

All of it is on `modern-character-form` here and `guild-coverage` on the bot. None of it is
deployed.

| | Site | Bot |
|---|---|---|
| Say which build is live | footer commit, bug report carries both, version check on load | `/api/v4/version`, `/health`, `dist/build-ref.txt` |
| Rebuild a gear paste field by field | `src/guild/gear-upload.ts` | `src/services/gearPayload.ts`, and `gearView` filters reads too |
| Take the outside scripts off the data pages | ads off guild, raid, gear; fonts self-hosted; `public/_headers` | — |
| A cookie-authorised write names its origin | — | `src/web/guards.ts` |
| Say who a message may ping | — | `mentionPolicy` in `src/render/index.ts` |
| Keep what somebody typed | `src/guild/draft.ts`, the form draws it | — |
| One read per navigation | epochs and abort in `src/guild/main.ts` | — |
| Back returns to the list | push and `hashchange` in `src/guild/hash.ts` | — |
| Find a member to file for | the lookup in the form | `GET …/members?q=`, rate limited |

Tests: **1090** here in 56 files, **365** on the bot in 16. Both suites green, both builds
clean.

### Deploy the bot first

The site hides the member lookup when the bot does not report `members.search`, and says
which side is behind when the API numbers disagree. Nothing breaks if the site goes first;
the lookup is simply absent until the bot catches up.

### Still to do from the plan

Phase 1B (per-field visibility), 1E (a "my data" page and retention), and phases 3 and 4
are not started. In phase 2, three items are not done: revision checks so two editors
cannot overwrite each other, one request that saves a gear paste and the profile fields it
fills in together, and the import-first "Add character" flow. A paste that saves the gear
but fails to save the level and professions now says exactly that, which is a description
of the gap rather than a fix for it.

---

## 8. The bot deploy, 22 September 2026

`guild-coverage` was merged into `master` as `d62c65d` and pushed to the VPS. The site
was **not** deployed and is still `f85867b`.

Before: a `sqlite3 .backup` of the live database to
`/opt/groupbuilder-backups/groupbuilder-pre-ruleset-deploy.sqlite`, integrity checked. It
held **no characters at all** and ten sign-in sessions, so nothing a member had typed was
at stake in the realm-to-ruleset change.

After, against the live API:

- `/api/v4/version` answers `build: d62c65d5bc49`, matching local `master` exactly, with
  `members.search` in the capability list.
- Migration `0007_ruleset.sql` applied: `characters.ruleset` exists and `realm` is
  untouched.
- `Cache-Control: private, no-store` and `Vary: Origin` on `/api/v4/me`; neither on
  `/api/v4/docs/commands`, which stays public with `Access-Control-Allow-Origin: *`.
- The CORS preflight from `https://wowforever.us` still allows credentials and every verb,
  so the deployed site's writes are unaffected by the new origin check.
- A roster read with no token still answers 401. The service log has no errors, and the
  new `COOKIE_DOMAIN` warning appears as intended.

The deploy hook was changed to pass the commit it checked out as `BUILD_REF`; without it
the build cannot name its own commit and the version endpoint answered `unknown`. The old
hook is beside it as `post-receive.bak-2026-09-22`.

### Rolling this back

```bash
# code
git push production 5c72b90:master --force
# database, only if a migration has to come out with it
ssh root@147.93.180.249 systemctl stop groupbuilder
ssh root@147.93.180.249 cp /opt/groupbuilder-backups/groupbuilder-pre-ruleset-deploy.sqlite \
  /opt/groupbuilder-data/groupbuilder.sqlite
ssh root@147.93.180.249 systemctl start groupbuilder
```

Rolling the code back alone is safe: the `ruleset` column an older build does not know
about is simply not read, and `realm` was never emptied.

### Two things this deploy left open

- **`www.wowforever.us` serves the site too**, and its origin is not in `PLANNER_ORIGIN`.
  A signed-in visitor there could not write before this deploy either — CORS already
  refused them — so nothing regressed, but it is worth either redirecting www to the apex
  or adding the origin.
- **`COOKIE_DOMAIN` is still `.wowforever.us`.** The warning now says so at every start.
  Unsetting it makes the cookie host-only, and leaves the old wide cookie in browsers
  until it expires, so it wants a moment when signing everyone out again is fine.
