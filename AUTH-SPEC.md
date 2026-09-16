# Signing in with Discord, and who may do what

**Status:** specification, not built. Written after roster mode shipped, because the signed
link that gets a leader into a roster does not scale to a guild, and because accounts are
the prerequisite for charging for anything later.

Two repositories implement this, same split as `ROSTER-SPEC.md`:

| Side | Owns |
|---|---|
| Group Builder (the bot) | OAuth exchange, sessions, every permission decision |
| WoW Forever Tools (the planner) | the sign-in button, showing who you are, hiding what you cannot do |

---

## 1. What is wrong with the link

A `/roster` link is a bearer token in a URL. It works, and for one leader opening one
roster it is the right amount of machinery. It does not survive contact with a guild:

- It expires after two hours, so a leader who comes back after dinner is locked out.
- It is one event. An officer who runs three raids a week needs three links.
- Anyone who has the link is the leader, so forwarding it hands over control.
- Nobody can *look* at a roster. There is no read-only anything.
- There is no "you", so there is nothing to attach a subscription to.

Signing in fixes all five, and the link stays for the one thing it is good at: getting a
leader from a Discord message into the right roster in one click.

---

## 2. The rule that keeps this honest

**The bot decides. The website only asks.**

`src/services/permissions.ts` already models this guild's reality:

```
isAdmin      Discord Administrator or Manage Server
isManager    admin, or the guild's manager role
isAssistant  manager, or the guild's assistant role
can(capability, member, event?)   create | edit | admin
             edit also passes for the event's leader and its co-leaders
```

That is the answer to "only guild leaders or officers". It exists, it is already enforced
in Discord, and a server has already configured it with `/settings`. The website must not
grow a second copy. Every question the planner asks — can I open this, can I edit it, can I
publish it — goes to the bot and is answered by that same function against that same guild.

A permission model that lives in two places disagrees with itself eventually, and the half
that disagrees quietly is the web half, because nobody is watching it.

---

## 3. Which scopes, and why only one

Ask Discord for **`identify`** and nothing else.

The obvious design asks for `guilds` and `guilds.members.read` so the site can read the
signed-in user's roles. Do not. The bot is already in the guild with the members intent on,
so it holds every member and every role in its own cache. Once OAuth has told us *who* this
person is, the bot can answer *what they may do* without the user's token being involved at
all.

That is better on three counts, and the third is the one that matters:

1. Less to ask for. A consent screen that says only "know who you are" gets clicked.
2. Nothing to keep. No Discord access token has to be stored or refreshed to check a role.
3. **A role change takes effect at once.** With `guilds.members.read` the site sees the
   roles the user's token was minted with, so demoting an officer leaves them in charge
   until their token refreshes. Reading from the bot's own view, removing the role removes
   the access on their next click.

Discord's access token is used once, to learn the user id, and is then discarded. It is
never stored.

---

## 4. The flow

```
planner                       bot (api.wowforever.us)            Discord
  |  click Sign in              |                                   |
  |---------------------------->|  GET /auth/discord                |
  |                             |  make state, set short cookie     |
  |                             |---------------- 302 ------------->|
  |                                                                 |
  |  <-------------- user approves, Discord redirects back ----------|
  |                             |  GET /auth/callback?code&state    |
  |                             |  check state, exchange code       |
  |                             |  GET /users/@me -> user id        |
  |                             |  discard the Discord token        |
  |                             |  create session, set cookie       |
  |  <----------- 302 back to where they started --------------------|
```

`state` is random, stored in its own short-lived cookie and compared on return. Without it
the callback accepts a code from anywhere, which is CSRF with extra steps.

Sessions go in `web_sessions`, which already exists. The columns for the Discord tokens
should be dropped rather than filled: per section 3 there is nothing to keep in them, and a
column that holds a credential is a column that eventually leaks into a log.

**The cookie**

```
name      wf_session
value     32 random bytes, base64url
Domain    .wowforever.us        both the site and api. are under it
Path      /
HttpOnly  yes                   script must never read it
Secure    yes
SameSite  Lax
Max-Age   30 days, refreshed on use
```

Because the planner is on `wowforever.us` and the API on `api.wowforever.us`, every call
needs `credentials: 'include'`, and the API needs
`Access-Control-Allow-Credentials: true`. `Access-Control-Allow-Origin` must stay an exact
origin: with credentials, a browser rejects `*` outright.

Sign out deletes the row, not just the cookie. A cookie the server still honours is not
signed out.

---

## 5. What the planner may ask

```
GET    /api/v4/me
       { "user": { "id", "username", "avatarUrl" },
         "guilds": [ { "id", "name", "iconUrl",
                       "role": "admin" | "manager" | "assistant" | "member",
                       "canCreate": true, "canEditAny": true } ] }

GET    /api/v4/guilds/:guildId/events?status=open
       Events this person may see, each with what they may do to it.

GET    /api/v4/events/:eventId/roster        as today, but a session also authorises it
PUT    /api/v4/events/:eventId/roster
POST   /api/v4/events/:eventId/roster/publish
PATCH  /api/v4/events/:eventId/settings

POST   /api/v4/auth/signout
```

`guilds` lists only guilds the bot is in *and* this person is in. A guild where they are a
plain member appears with `role: "member"` rather than being hidden, so the site can say
"you are in this server but not an officer" instead of pretending the server does not
exist. That difference is the whole of what a confused user writes to you about.

**Both credentials work.** A signed link and a session are two ways of proving the same
thing, and every roster route accepts either. The link keeps working for the leader who
clicks it from Discord; the session is for everyone who came to the site directly. Where
both are present, the session wins, because it is the one that can be revoked.

---

## 6. What each person sees

| | Sees a guild's events | Opens a roster | Edits it | Publishes | Changes settings |
|---|---|---|---|---|---|
| Admin / Manager | yes | yes | yes | yes | yes |
| Assistant | yes | yes | own events | own events | own events |
| Event leader or co-leader | yes | yes | yes | yes | yes |
| Member | their own signups | **read-only** | no | no | no |
| Signed out | no | only with a link | with a link | with a link | no |

Read-only for members is worth building rather than skipping. A raider wanting to know
which group they are in is the most common question a leader gets, and answering it costs
nothing once the roster is already rendering.

The planner hides what it cannot do, and the bot refuses it anyway. Hiding a control is a
courtesy; the refusal is the security. Never one without the other.

---

## 7. Where money would go later

Free now, and the shape below is so that charging later does not mean rebuilding.

The thing that actually costs is **running the bot for somebody**. Everything else is one
static site and a SQLite file. So the line is not a feature list, it is who operates it:

| | Free | Paid |
|---|---|---|
| Self-hosted, your own machine | everything, forever | — |
| Hosted by you, no setup | one guild, current events | several guilds, history, uptime |

Drawing it there has three things going for it. It does not take away anything anybody
already has. It matches the real cost, so the price has an honest explanation. And it keeps
the self-hosted version complete, which is what makes people recommend it.

What that needs from this spec: a session knows its user, a user has guilds, and a guild
can carry a plan. That is one nullable column on `guild_settings` and nothing else. **Add
the column when the first paid thing exists, not now** — a billing model designed before
anybody has paid is a guess with a schema.

Two things to avoid, both of which annoy people out of proportion to what they earn:
charging for the raiders' read-only view, and putting a limit on raid size. Neither costs
you anything to serve, and both are felt by people who did not choose the tool.

---

## 8. Build order

1. `/auth/discord`, `/auth/callback`, the session cookie, `POST /auth/signout`. Prove it
   with a page that prints your own username.
2. `GET /api/v4/me`. Now the planner can show who you are and which guilds you lead.
3. Accept a session on the roster routes alongside the token. Nothing visibly changes,
   which is the point: the link still works throughout.
4. `GET /guilds/:id/events`, and a picker on the planner. This is the first step a leader
   notices, because it is the first time they get to a roster without Discord.
5. Read-only for members.
6. Drop the Discord token columns from `web_sessions` once nothing reads them.

Steps 1 to 3 are worth doing together; a session that cannot open a roster is not testable
by anybody but its author.

---

## 9. Things that will go wrong

- **A redirect URI must match Discord's list exactly**, including scheme and trailing
  slash. Register the production one and the dev one and keep both.
- **`SameSite=Lax` and the OAuth return.** The callback is a top-level GET, so Lax sends
  the cookie. Do not switch to `Strict` without testing the return trip; it silently drops
  the session and looks like a failed login.
- **The bot must be in the guild** for any of this to answer. A user who is in a server the
  bot is not in should be told to invite it, not shown an empty list.
- **Members intent.** The role lookup in section 3 needs it, and it is already on. If it is
  ever turned off, every permission check quietly becomes "member".
- **Do not put the session id in a URL**, ever, for the reason the roster token lives in
  the fragment: a URL is written to logs and Referer headers, and unlike the two-hour token
  this one lasts a month.
