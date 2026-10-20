# The download portal: who may download, and how a file gets to them

**Status:** built, not yet deployed. Written 20 October 2026.

Addons and guide packages the owner has permission to share, for people the owner has
approved. The same split as `ROSTER-SPEC.md` and `AUTH-SPEC.md`:

| Side | Owns |
|---|---|
| Group Builder (the bot) | the archives, every permission decision, the log |
| WoW Forever Tools (this site) | `downloads.html`: the cards, the pending notice, the owner's forms |

The rule from `AUTH-SPEC.md` holds: **the bot decides, the website only asks.** There is
no permission model on the site. Hiding a button is a courtesy; the refusal is on the
server, on every request.

---

## 1. Where it runs, and why nothing new was bought

The site is static on Cloudflare Pages. Pages cannot keep a private file or check a
cookie before serving one, so a download has to come from a server. Three ways were
considered:

| | Cost | Revocation | Notes |
|---|---|---|---|
| **The bot on the VPS, archives on its disk** | nothing new | immediate | chosen |
| Cloudflare R2 with signed URLs from a Pages Function | free tier, then per GB | **delayed**: a signed URL works until it expires, even after a revoke | not chosen |
| A separate storage service | monthly | depends | not chosen |

The bot already has Discord sign-in, sessions, SQLite, the origin check and a rate
limiter, and the VPS has disk. So the portal is a set of routes under `/api/v4/portal/`
and a directory on the VPS. Every download is streamed by the bot after it has read the
session cookie and the person's current status, so a copied link is a link to that check.

**What the choice costs:**

- **Uploads are capped at 100 MB.** Cloudflare's proxy stops a request body at 100 MB on
  the free plan, and `api.wowforever.us` goes through it. `PORTAL_MAX_UPLOAD_MB` is 100 for
  that reason; a larger value only works for an upload that does not pass through
  Cloudflare. Downloads have no such cap.
- **One disk.** The archives live under `PORTAL_STORAGE_DIR` on the VPS and nowhere else.
  Back that directory up with the database (§5).
- **One process.** The rate limits are in memory, so a restart forgets them. They are a
  brake, not a wall.

If the archives ever outgrow the VPS, R2 with short-lived signed URLs is the next step,
and the revocation delay is the price: a link signed for five minutes keeps working for
five minutes after a revoke. Say so on the page if it comes to that.

---

## 2. Who is who

Everything is keyed on the **Discord user id**. A username can be changed by its owner; an
id cannot.

- **The owner** is whoever `PORTAL_OWNER_ID` names in the bot's environment. Nobody else
  is ever an owner, and the first person to sign in gets nothing special. Unset, nobody
  administers the portal and the owner routes answer 403 saying so.
- **Everyone else** gets a `portal_users` row the first time they open the page, with
  status `pending`. From there:

```
pending   ──approve──▶ approved ──revoke──▶ revoked
   │                       ▲                   │
   └──reject──▶ rejected ──┴───────approve─────┘
```

Only `approved` may list packages and download. The owner may always. A pending person
may **ask once**: `requestedAt` is set and never cleared, and the button goes away.
Somebody rejected or revoked cannot ask again from the page; that is the owner's decision
to revisit in the People tab, where an Approve button is still there.

Signup words are the member's; decisions are the owner's. The page never maps one onto
the other.

---

## 3. The routes

All under `/api/v4/portal/`. Every one reads the session cookie and refuses 401 without
it. Writes go through the same origin check as the rest of the API (`AUTH-SPEC.md` §4): a
cookie-authorised `POST`, `PUT` or `PATCH` whose `Origin` is not `PLANNER_ORIGIN` is
refused before any route sees it.

**For a member**

```
GET   /me                           who you are, your status, whether you may download
POST  /request                      ask once; 409 if asked already or not pending
GET   /packages                     published releases only; 403 with your status otherwise
GET   /releases/:id/download        the archive, streamed; 403 unless approved; 404 unless published
```

**For the owner** (403 for anyone else, including an approved member)

```
GET   /admin/users                  everybody, with the owner's note
POST  /admin/users/:userId/decision { status: approved | rejected | revoked, note? }
GET   /admin/packages               everything, including unpublished and file-less releases
POST  /admin/packages               { title, description, installInstructions }
PATCH /admin/packages/:id
POST  /admin/packages/:id/releases  { version, gameCompat, coverage, changelog }
PATCH /admin/releases/:id           the same fields, and { published: true | false }
PUT   /admin/releases/:id/file      the archive as application/octet-stream,
                                    its name in X-Upload-Filename
GET   /admin/events?limit=          the log, newest first
```

A release is made in two steps on purpose: the text first, then the bytes. An archive is
not multipart; it is the request body, checked and hashed as it streams to disk, so a
90 MB upload is never held in memory. Publishing a release with no archive is refused.

**Latest** is the most recently uploaded published release of a package. It is computed,
not chosen, and exactly one release per package carries it.

---

## 4. The file

- Accepted: `.zip` and `.rar`, by the name **and** the first bytes. A ZIP starts `PK` with
  one of three record markers; a RAR starts `Rar!\x1a\x07` with its version bytes. A name
  that says one and bytes that say another is refused with 415.
- Stored as `<32 random hex>.zip` under `PORTAL_STORAGE_DIR`, written as `.part` and
  renamed only once complete and checked. The name on disk says nothing about the
  contents, and a dropped connection leaves nothing a download could find.
- **Never opened.** No listing, no extraction, no execution. An archive here is bytes
  with a SHA-256, and the checksum is what a member compares after saving.
- Served as `application/octet-stream` with `X-Content-Type-Options: nosniff` and
  `Content-Disposition: attachment; filename="<Title>-<version>.<ext>"`, where the name is
  built from what was typed into the portal: letters, digits, dots and dashes, never a
  path, never the name the owner's disk had.
- Replacing an archive deletes the old file once the new one is recorded.

Limits, per account, in memory: 30 downloads in ten minutes, 20 uploads an hour, 120
owner writes a minute, 5 access requests an hour. A refusal answers 429 with
`Retry-After`.

---

## 5. Setting it up

### The Discord application

The portal uses the application the bot already has. Nothing new is created; one thing
is checked.

1. Open <https://discord.com/developers/applications> and pick the Group Builder
   application.
2. **OAuth2 → Redirects.** Both of these must be listed, exactly, with no trailing slash:
   - `http://localhost:3000/auth/callback` for development
   - `https://api.wowforever.us/auth/callback` for production
3. Nothing else changes. The scope is `identify`, as it always was; the portal reads a
   user id and nothing more. There is no bot, server or role requirement.

### Your own id

In Discord: **User Settings → Advanced → Developer Mode** on, then right-click your name
anywhere and **Copy User ID**. It is 17 to 20 digits. That value is `PORTAL_OWNER_ID`.

### The bot's environment

Add to `.env` on the VPS (the example is in the bot's `.env.example`):

```
PORTAL_OWNER_ID=<your id>
PORTAL_STORAGE_DIR=/opt/groupbuilder-data/portal
PORTAL_MAX_UPLOAD_MB=100
```

`PORTAL_STORAGE_DIR` must be somewhere no web server serves. On the VPS the bot is the
only thing listening and it serves nothing static, so beside the database is right. The
directory is created on the first upload; the service user needs write access to it.

### Deploying

The order matters the same way it did in `RELEASE-BASELINE.md`: **bot first.** The page
asks `/api/v4/version` for the `portal` capability and says "the bot has not been updated
yet" until it is there.

1. Back up the database: `sqlite3 /opt/groupbuilder-data/groupbuilder.sqlite ".backup
   /opt/groupbuilder-backups/pre-portal.sqlite"`.
2. Push the bot. Migration `0008_portal.sql` adds four tables and touches nothing
   existing. The deploy hook builds and restarts; the startup log will say the owner id
   is malformed if it is.
3. `curl -s https://api.wowforever.us/api/v4/version` and look for `"portal"` in
   `capabilities`.
4. Push the site to `master`. Pages builds it. Open `/downloads` and `/downloads.html`
   and read the footer commit.
5. Sign in as yourself. The page should say you are the owner. If it says pending, the
   id in `PORTAL_OWNER_ID` is not the id you signed in with.

Add `PORTAL_STORAGE_DIR` to whatever backs up the database. The rows in
`portal_releases` point at files by name, and a database without the files is a list of
404s.

### Trying it without a real package

```
node scripts/make-sample-archive.mjs
```

in the bot repository writes `data/sample-package.zip`: one README and nothing else.
Upload that. Do not upload anything from `addon/` or a guide pack until you have checked
you may distribute it; nothing is uploaded for you.

### Rolling back

Code alone is safe to roll back: the four tables are not read by an older build. To take
the migration out as well, stop the service, restore the backup from step 1, and remove
`PORTAL_STORAGE_DIR`.

---

## 6. Owner guide

Open `/downloads` signed in as yourself. The cards at the top are what an approved person
sees. Your tools are under them, in three tabs.

**Uploading something new**

1. Packages → **New package.** Title, a sentence of description, and the install steps.
   The install steps are shown on every release of the package, so write them once.
2. On the package, **New release.** Version (`1.2`, `2.0-beta`: letters, digits, dots,
   dashes), what it works with, what it covers, and the changelog.
3. On the release, **Upload archive.** A `.zip` or `.rar` up to 100 MB. The bar shows the
   upload, then "Checking and storing". The size and SHA-256 appear when it is done.
4. **Download to check** fetches it back the way a member would.
5. **Publish.** Everyone approved sees it at once. The newest published upload is marked
   Latest.

**Updating** is steps 2 to 5 again with a new version. Old releases stay under "older
versions" on the card. To fix a file without a new version, **Replace archive** on the
release; the old file is deleted. To hide a release, **Unpublish**; it is not deleted,
and members keep nothing, because they never had a link that works without you.

**Approving people**

People → "Asked for access" lists everyone waiting, newest first, with the Discord id to
check against who you expect. **Approve** or **Reject.** "Signed in, not asked" are people
who opened the page and did not press the button; you can approve them anyway.

**Revoking** is on the approved person's row. It takes effect on their next request,
including a download link they copied earlier. A revoked person cannot ask again; if you
change your mind, Approve is on their row under "Rejected or revoked".

**The log** is every sign-in, request, decision, upload, publish and download, with who
and when. Downloads are logged by Discord id, which the page tells members.

**Things that will look like bugs**

- "The bot has not been updated yet" above the page: deploy the bot (§5).
- You are shown as pending: `PORTAL_OWNER_ID` does not match the account you signed in
  with. Check it, restart the bot, reload.
- An upload fails at exactly 100 MB: that is Cloudflare, not the bot (§1).
- A download answers 503 "missing on the server": the row exists and the file does not.
  Restore the storage directory from backup, or Replace archive.
- Nothing appears after you Publish: reload; the page redraws from the server after each
  change, and a refused change says why in the toast.

---

## 7. What the tests prove

`test/portal.test.ts` on the bot stands up the real routes behind the real origin check
and sends direct requests with whatever cookie each caller holds:

- **anonymous:** 401 from every route, member and owner; nothing about a package in the
  body; no `.part` file left by an attempted upload;
- **first sign-in:** pending, never an owner, with and without `PORTAL_OWNER_ID` set;
- **pending:** no list, no download, one request then 409;
- **rejected and revoked:** no list, no download, request refused; a revoke stops a
  download that worked a moment before;
- **an approved member:** 403 from every owner route, cannot approve themselves, cannot
  see or fetch an unpublished release, is slowed after thirty downloads;
- **cross-site:** an owner's cookie with no `Origin`, or another site's, is refused;
- **the file:** wrong extension, wrong bytes, too short, over the limit, a declared
  length over the limit, random storage key, hash, replacement, publish-needs-a-file,
  duplicate version, latest marking.

`tests/downloads-format.test.ts` here covers the words a pending, rejected or revoked
person reads, and `tests/headers.test.ts` now covers `/downloads` the same as the other
pages that hold somebody's data.

---

## 8. Things that will go wrong

- **The download is a top-level navigation**, so the cookie is sent under `SameSite=Lax`.
  Fetching it with `fetch()` from the page would also work, but then the file goes
  through memory; leave it as a link.
- **`COOKIE_DOMAIN`** is still set on the VPS (`RELEASE-BASELINE.md` §8). Nothing here
  needs it; unsetting it is still the right move at a quiet moment.
- **`X-Upload-Filename` is in the CORS allow-list.** Removing it fails the preflight and
  reads as the API being down.
- **Fastify's default body limit is 1 MB**; the upload route raises its own. If the
  limit is ever enforced somewhere earlier, the symptom is 413 on a 2 MB file.
- **Do not put the session id or anything about a person in a download URL.** The id in
  the path is the release's, and that is all it will ever be.
