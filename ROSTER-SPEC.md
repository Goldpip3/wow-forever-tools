# Roster: selection and Discord notification

**Status: built and running.** Roster mode is implemented in the planner and verified
against the deployed bot. **Where this document and the deployed API disagree, the API
wins.** Three places it already did:

1. `roleKey` is lowercase — `tank` / `healer` / `melee` / `ranged` — and may be null when
   the member picked no spec. The example below shows `Ranged`; that is wrong.
2. `GET` returns `slots`, an array. `PUT` answers with `slotCount`, a number. The names
   differ on purpose.
3. A published roster **stays** `status: "published"` through later saves. Editing does
   not return it to draft.

Guests also turned out to be supported; see section 2.

---

Supersedes the "Getting the composition back" section of `INTEGRATION.md`, which
describes a copy-paste handoff. This is the live round-trip instead.

**Two repositories implement this:**

| Side | Path | Owns |
|---|---|---|
| Bot | `C:\Users\colom\Claude Projects\Group Builder` | tables, API, token minting, notifications |
| Planner | `C:\Users\colom\Claude Projects\WoW Forever` | roster mode UI, drag and drop, publish button |

---

## 1. The idea in one paragraph

Signing up is a request, not a ticket. Sixty people sign up; forty go. The leader opens
the raid planner from Discord, sees the real signups as named people, drags forty of them
into eight groups while the buff panel updates live, and presses **Publish**. Discord then
tells everyone where they stand. Raid-Helper has the roster but no buff analysis; the
planner has the buff analysis but no people. This joins them.

---

## 2. Two modes on the raid page

The planner gains a mode. Everything that exists today is **planner mode** and does not
change.

| | Planner mode (today) | Roster mode (new) |
|---|---|---|
| Entered by | opening `raid.html` | a signed link from Discord |
| A seat holds | a spec | **a person** |
| Names | generated, "Warrior 3" | the member's Discord display name |
| Source of players | you invent them | the event's signups |
| Can invent a player | yes | **no** — every seat is a real signup (see note below) |
| Output | a shareable link | a published roster + notifications |
| Purpose | hypothetical: "what if I ran four warlocks" | real: who is actually coming |

Roster mode adds a **pool** column: every signup not yet placed, showing name, class and
spec emote, their own signup status (`primary` / `late` / `tentative` / `bench` /
`absence`), and signup position. Drag from pool to a seat, seat to seat, or seat back to
pool. Anyone left in the pool when you publish is **standby** unless explicitly cut.

**Guests are supported.** This was written as out of scope, on the grounds that every
seat having a Discord id keeps the notification path simple. The deployed API decided
otherwise: a slot takes a null `signupId`, which is how it carries somebody who never
signed up. The planner gives them a synthetic `guest:N` id so the rule that a userId
appears at most once still holds, and the bot never messages them, because there is no
account behind the id.

Planner mode must keep working with no network and no account. Do not make roster mode a
prerequisite for anything that works today.

---

## 3. Data model (Group Builder)

Two new tables. **Signups are not modified.** `signups.status` is what the *member* said;
the roster is what the *leader* decided. Conflating them makes "bench" ambiguous forever.

```sql
CREATE TABLE rosters (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id     TEXT    NOT NULL REFERENCES events(id) ON DELETE CASCADE ON UPDATE CASCADE,
  revision     INTEGER NOT NULL DEFAULT 1,
  status       TEXT    NOT NULL DEFAULT 'draft',   -- draft | published
  published_at INTEGER,
  published_by TEXT,
  updated_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(event_id)
);

CREATE TABLE roster_slots (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  roster_id   INTEGER NOT NULL REFERENCES rosters(id) ON DELETE CASCADE,
  signup_id   INTEGER REFERENCES signups(id) ON DELETE SET NULL,
  user_id     TEXT    NOT NULL,
  display_name TEXT   NOT NULL,
  class_key   TEXT    NOT NULL,
  spec_key    TEXT,
  decision    TEXT    NOT NULL,     -- selected | standby | cut
  group_index INTEGER,              -- 0..7, NULL unless selected
  slot_index  INTEGER,              -- 0..4, NULL unless selected
  loadout     TEXT    NOT NULL DEFAULT '{}',
  UNIQUE(roster_id, group_index, slot_index),
  UNIQUE(roster_id, user_id)
);
```

Four decisions in there that are load-bearing:

1. **`ON UPDATE CASCADE` on `event_id`.** An event's primary key changes from a ULID to
   the Discord message id when it is posted. `DECISIONS.md` item 7 records this exact bite
   on `signups` and `reminders`. Do not repeat it.
2. **`ON DELETE SET NULL` on `signup_id`, with `user_id` and `display_name` copied onto the
   slot.** If someone un-signs after publication, the roster must still show them so the
   leader knows there is a hole. Cascading the delete would silently shrink the raid.
3. **`loadout` on the slot.** The leader's planner choices — which curse that warlock
   brings, which aura that paladin runs — round-trip, so reopening a draft preserves the
   buff analysis.
4. **`revision`** drives both optimistic concurrency and notification diffing. See §6.

---

## 4. Authorisation

The planner is a static site on a different origin from the bot. It must never see a
Discord token. Use a **signed, short-lived, single-event handoff token**.

1. Leader runs `/roster` on the event.
2. Bot checks `services/permissions.ts` (leader, co-leader, manager or assistant role).
3. Bot mints an HMAC-signed token over
   `{ eventId, guildId, userId, scope: 'roster:write', exp: now + 2h }`.
4. Bot replies **ephemerally** with
   `https://wowforever.us/raid.html#roster=<eventId>&t=<token>`.
5. Planner reads the token, calls the API with `Authorization: Bearer <token>`.

Rules the implementation must follow:

- **Token goes in the URL fragment, never the query string.** Fragments are not sent in
  the HTTP request, so the token stays out of server access logs, proxy logs and
  `Referer` headers. This is the reason for the `#`.
- **Re-check permissions server-side on every write.** The token proves who minted it, not
  that they still hold the role. Roles change; a two-hour-old token must not outlive a
  demotion.
- **CORS must name the exact origin**, e.g. `Access-Control-Allow-Origin:
  https://wowforever.us`. A wildcard is rejected by browsers when an `Authorization`
  header is present. Handle the `OPTIONS` preflight that a JSON `POST` with that header
  will trigger.
- **Expire fast (2h) and scope to one event.** A leaked link then costs you one raid, not
  the server.
- Never log the token.

This avoids building an OAuth redirect flow in a static site. The leader is already proven
to be themselves by Discord having delivered the link to them privately.

---

## 5. API

Extend the existing `/api/v4/` surface from `PLAN.md` §12.3.

```
GET  /api/v4/events/:eventId/roster
PUT  /api/v4/events/:eventId/roster
POST /api/v4/events/:eventId/roster/publish
```

**`GET`** returns everything the planner needs in one call:

```jsonc
{
  "event": { "id", "title", "startTime", "guildId", "channelId", "size": 40 },
  "signups": [
    { "signupId": 12, "userId": "…", "name": "Bob", "classKey": "warlock",
      "specKey": "affli", "roleKey": "Ranged", "status": "primary", "position": 4 }
  ],
  "roster": { "revision": 3, "status": "draft", "slots": [ … ] },   // or null
  "permissions": { "canEdit": true, "canPublish": true }
}
```

**`PUT`** saves a draft. Debounce it in the planner (~1s after the last drag) so closing
the tab never loses work. Body carries `revision`; the server rejects a stale revision
with **409** so two leaders editing at once cannot silently overwrite each other. On 409
the planner refetches and tells the user rather than clobbering.

**`POST …/publish`** writes `status='published'`, bumps `revision`, posts the embed and
sends the notifications. Returns the list of users it could not reach.

`classKey` / `specKey` are Group Builder's own keys; `src/raid/groupbuilder.ts` already
maps all 28 of them to planner spec ids. That mapping is done and needs no work.

---

## 6. Notifications

**Default behaviour**, as a guild setting so it can be changed without a code edit:

1. **Always:** post a roster embed in the event channel. Eight fields, one per group —
   well inside Discord's 25-field and 6000-character caps.
2. **Default on:** DM each selected player ("You're in. Group 3. Tuesday 20:00, Fury.")
   and each standby ("Standby this week, stay reachable.").
3. **Never:** DM people who were cut without the leader opting in. Being told you were
   cut by a robot lands badly.

You did not pick between DMs and a channel post, so this defaults to **both**, with DMs
controllable via `guild_settings.roster_dm_mode` (`off` | `selected` | `selected+standby`).
Flip one value if you disagree.

Four things that will break this in production if skipped:

- **DMs fail silently** when a member blocks DMs from server members. Catch every
  rejection, collect the names, and report them back to the leader in the publish
  confirmation: *"couldn't DM: @a @b"*. Otherwise people miss raids and blame the bot.
- **Throttle.** Forty DMs is forty API calls. Cap at ~2/second. Bulk DMs can still trip
  Discord's spam heuristics, which is the main argument for keeping the channel post as
  the source of truth and DMs as a courtesy.
- **Set `allowed_mentions` explicitly** — `users: [only the selected ids]`. Mentioning
  forty people without it is how a bot gets muted by every moderator in the server.
- **Re-publishing must diff against the previous revision.** Notify only the people whose
  `decision` changed. Never re-ping all forty because one person swapped.

Then extend the existing scheduler: the T-minus reminder should ping **the published
roster**, not everyone who signed up. That change alone justifies the feature.

---

## 7. Planner-side work (WoW Forever repo)

1. `src/raid/types.ts` — `Player` gains
   `discord?: { userId: string; signupId: number | null; signupStatus: string }`.
   Its absence is what makes a seat hypothetical.
2. `src/raid/roster-mode.ts` — new. Reads `#roster=<id>&t=<token>`, fetches, renders the
   pool, owns the debounced `PUT` and the `POST …/publish`.
3. `src/raid/render.ts` — pool column; seats render `player.name` and a signup-status
   marker when `discord` is set.
4. Drag and drop — HTML5 DnD between pool and seats, both directions.
5. Toolbar — in roster mode show the event title and time, a save indicator, and
   **Publish to Discord**. Hide "40-player raid" / "Sample raid" / "Clear", which would
   destroy real data.
6. `API_BASE` as a build-time constant so self-hosters can repoint it.

`encodeRoster` / `decodeRoster` stay exactly as they are — planner mode still travels
entirely in the URL hash with no network.

---

## 8. Prerequisite: the bot needs a public URL

Option C cannot work while the bot is only on a home PC with no address. SQLite means one
machine, so serverless is out.

A home PC is unreachable for three separate reasons: the ISP changes its IP address, the
router blocks inbound connections, and there is no TLS certificate — and browsers refuse
to send an `Authorization` header over plain HTTP. Cloudflare Tunnel solves all three by
inverting the direction: `cloudflared` on the PC dials **out** to Cloudflare and holds the
connection open, and Cloudflare pushes public traffic back down that pipe. Nothing ever
connects inbound.

**Path that avoids a migration later:**

1. Add `wowforever.us` to Cloudflare (done) and wait for the nameservers to delegate.
2. Point `api.wowforever.us` at a **Cloudflare Tunnel** on the PC, forwarding to the bot's
   local port. Free, about ten minutes, no port forwarding, real TLS.
3. When friends actually depend on it, move the bot to a ~$5/month VPS (Hetzner CX22,
   DigitalOcean) and repoint the same hostname. **The URL never changes**, so nothing in
   the planner, the tokens or the CORS config has to be touched.

Caveat while on the tunnel: publishing only works when the PC is on.

---

## 9. Hostnames

One domain, bought and on Cloudflare: **`wowforever.us`**.

| Hostname | Points at | Serves |
|---|---|---|
| `wowforever.us` | Cloudflare Pages | the static site: planner, talents, DPS |
| `api.wowforever.us` | Cloudflare Tunnel → the bot's local port | the roster API |

The hostname appears in exactly three places: the CORS origin (§4), the tunnel
configuration, and `API_BASE` in the planner build (§7.6). Changing it later is a
three-line edit.

Two notes the owner has already been told and has decided on, recorded here so the next
reader does not re-open them:

- The name contains "WoW". Blizzard's fan-site policy tolerates fan tools but is
  unfriendly about trademarks in domain names. Accepted risk.
- `.us` carries a **Nexus requirement**: the registrant must be a US citizen, US resident,
  or an organization with a US presence. It is enforced. Verify before building on it.

---

## 10. Suggested order

1. Tables + migration. (Bot)
2. `GET`/`PUT` roster, token minting, `/roster` command. (Bot)
3. Cloudflare Tunnel so the planner has something to call. (Owner)
4. Roster mode: fetch, pool, drag and drop, autosave. (Planner)
5. Publish endpoint, embed, DMs with throttle and failure reporting. (Bot)
6. Publish button. (Planner)
7. Scheduler reminder targets the roster, not the signups. (Bot)

Steps 1–2 are testable with `curl` before any planner work exists.
