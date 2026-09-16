# WoW Forever Tools

A fan site for World of Warcraft: Forever. Four pages, no framework, no backend of its
own: a talent calculator, a raid composition planner, a gear and DPS analyser, and roster
mode, which edits a real Discord event through the Group Builder bot.

## Read these before writing

- **[WRITING.md](WRITING.md) — read it before writing a single word a visitor will see.**
  Headlines, buttons, hints, errors, empty states. It is not a style preference; the
  first version of this site read like a brochure and had to be rewritten.
- [AUTH-SPEC.md](AUTH-SPEC.md) — signing in with Discord and who may do what. Not built.
  The rule it turns on: the bot decides, the website only asks. Do not grow a second
  permission model in the planner.
- [ROSTER-SPEC.md](ROSTER-SPEC.md) — the contract between this planner and the Group
  Builder bot. Where it disagrees with the deployed API, the API wins.
- [INTEGRATION.md](INTEGRATION.md) — the older copy-paste handoff, still supported.

## The two modes of raid.html

They share a page and almost nothing else.

**Planner mode** is the default. It invents players, makes no network call, needs no
account, and carries its whole state in the URL hash. It must keep working that way.
`encodeRoster` / `decodeRoster` are not to be changed for roster mode's benefit.

**Roster mode** is entered only by a signed link the bot DMs a raid leader
(`raid.html#roster=<eventId>&t=<token>`). Seats hold real people who get messaged when
the roster is published. `src/raid/roster-mode.ts` is the only file that talks to the
network; the token is read from the fragment and never put in a query string, a cookie or
localStorage.

A `Player` with `discord` set is a real person. Its absence is what makes a seat
hypothetical.

## Rules that are easy to break

- **Real game text only.** Spell and talent descriptions come from the data, never from a
  summary someone wrote. Missing text is a data bug.
- **Signup status is not a leader's decision.** `primary/late/tentative/bench/absence/queued`
  is what the member said. `selected/standby/cut` is what the leader decided. Never map
  one onto the other.
- **Never auto-retry a 409.** Refetch and tell the leader their copy was stale.
- **Estimated numbers say so.** Scaled figures and unknown ranks are labelled differently
  and must stay that way.
- **Module state goes at the top of `main.ts`, above the functions.** `raid.html` runs
  work during bootstrap, so a `let` declared further down the file is still in its
  temporal dead zone when a boot-time function reads it. The page then dies with
  "Cannot access X before initialization" and renders the wrong mode. This has caught
  three separate additions: the roster handlers, the docs guard, and the session.
- **Shared CSS belongs in `base.css`.** Classes used by more than one page have twice been
  left in `raid.css`, which only `raid.html` loads, and silently broke the other page.
- **A player joining a roster goes through `spreadChoices`.** It moves the new player off
  the raid-wide and boss-facing picks their classmates already hold, so a second Warlock
  takes the next curse instead of doubling the first one's. `createPlayer` cannot do it
  itself — it is also called where there is no roster to read. It keys off effect *scope*,
  so it covers every class; party-scope groups like auras and totems are left alone on
  purpose, because a second group needs its own.

## Commands

```
npm run dev      # vite on 5273
npm test         # vitest, 747 tests
npm run build    # typecheck, then dist/
npm run import   # refetch talent data after the beta changes
```

Deployed to Cloudflare Pages at https://wowforever.us.
