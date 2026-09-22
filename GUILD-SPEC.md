# Characters: who plays what

**Status: built and running.** The guild page is implemented in this repository and the
character routes are implemented in Group Builder. **Where this document and the deployed
API disagree, the API wins**, as with `ROSTER-SPEC.md`.

**Two repositories implement this:**

| Side | Path | Owns |
|---|---|---|
| Bot | `C:\Users\colom\Claude Projects\Group Builder` | tables, API, every permission decision |
| Site | `C:\Users\colom\Claude Projects\WoW Forever` | `guild.html`, the form, reading an addon paste |

---

## 1. Why it exists, and why none of it is fetched

A raid leader wants to know who Thrallsbane is, what they are wearing and whether anybody
can make a flask. Three answers, and in September 2026 not one of them can be looked up:

- Blizzard has published no character API for Forever. A thread asking for one on the
  Blizzard API forum, opened 18 September 2026, has no reply, and aotc.gg's Forever page
  says its armory fills in "as Battle.net character data becomes available".
- Warcraft Logs has no Forever site. `forever.warcraftlogs.com` does not resolve. The beta
  does write a combat log, so this may change.
- Raider.IO, ironforge.pro and Wowhead's profiler cover Classic Era and retail, not
  Forever.

So everything on this page is **entered by a person or read out of the addon on their own
machine**. That is not a limitation to be worked around; it decides the shape of the
feature. The page says who typed a thing and when, because that is the only provenance
there is. When an armory does appear, it becomes a second source beside this one, not a
replacement for it.

The nearest existing shape, for whenever that happens, is the classic profile API:
`/profile/wow/character/{realmSlug}/{name}` and its `/equipment` and `/specializations`
under a `profile-classic1x-{region}` namespace. It carries no professions.

---

## 2. What a character is

One row per character, belonging to one Discord account, inside one Discord server.

- **A Discord server is a guild.** A server running two guilds is out of scope.
- **A character name is unique per server**, compared case-folded. Two people cannot both
  claim Thrallsbane, and the refusal names who holds it.
- **One main per person per server.** Marking a character as the main clears the flag from
  that person's others rather than refusing the save. Somebody who re-rolls is telling you
  their main changed.
- **A character belongs to its owner, not to whoever typed it.** An officer may create and
  edit one for a member who has not signed in yet; `updated_by` records who last did.

Class and spec use **Group Builder's own keys**, the same ones the signup buttons use, so
a character and a raid signup can be lined up. `specFromSignup` in
`src/raid/groupbuilder.ts` already maps all 28 to the site's specs; the guild page goes
through it rather than growing a second table.

Feral Combat is one tree on the site and two keys on the bot, `feral` and `guardian`. The
form offers both and the profile says which.

---

## 3. Tables (Group Builder)

Migration `0006_characters.sql`.

```sql
CREATE TABLE characters (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id     TEXT NOT NULL,
  user_id      TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',   -- Discord name snapshot, for the list
  name         TEXT NOT NULL,
  realm        TEXT NOT NULL DEFAULT '',
  class_key    TEXT NOT NULL,
  spec_key     TEXT,
  role_key     TEXT,                       -- tank | healer | melee | ranged
  level        INTEGER,
  is_main      INTEGER NOT NULL DEFAULT 0,
  professions  TEXT NOT NULL DEFAULT '[]', -- JSON [{ key, skill }]
  note         TEXT NOT NULL DEFAULT '',
  updated_by   TEXT NOT NULL DEFAULT '',
  created_at, updated_at INTEGER
);
CREATE UNIQUE INDEX characters_guild_name_idx ON characters(guild_id, lower(name));
CREATE INDEX characters_guild_user_idx ON characters(guild_id, user_id);

CREATE TABLE character_gear (
  character_id  INTEGER PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
  export_v      INTEGER NOT NULL,
  addon_version TEXT NOT NULL DEFAULT '',
  generated_at  INTEGER NOT NULL,          -- when the addon read it, not when it was pasted
  payload       TEXT NOT NULL,             -- JSON: race, level, stats, equipped, talents
  updated_at    INTEGER
);
```

Three decisions worth keeping:

1. **Gear is its own table.** A profile is a handful of short fields edited by hand; an
   export is tens of kilobytes replaced wholesale. Keeping them apart means reading the
   list does not drag every member's gear along with it.
2. **`lower(name)` in the unique index.** Without it "Thrallsbane" and "thrallsbane" are
   two characters, and the second one is somebody quietly stealing the first one's name.
3. **`generated_at` is the addon's clock, not the server's.** A sheet read five weeks ago
   is not what somebody is wearing tonight, and the page says which it is.

---

## 4. Who may do what

**The bot decides. The website only asks** — the same rule as `AUTH-SPEC.md`, and the same
`isManager` that gates the slash commands.

| | Read every profile | Add their own | Edit their own | Edit anybody's | Add for somebody else |
|---|---|---|---|---|---|
| Admin / Manager | yes | yes | yes | yes | yes |
| Assistant | yes | yes | yes | no | no |
| Member | yes | yes | yes | no | no |
| Signed out | **no** | no | no | no | no |

Every route needs a session **and** a live membership check, through `fetchMemberFresh`,
so a demotion takes effect on the next click. There is no link-and-token path: unlike a
roster, a character list is not something a leader hands out.

The page hides what it cannot do and the bot refuses it anyway. Hiding a control is a
courtesy; the refusal is the security.

---

## 5. API

```
GET    /api/v4/guilds/:guildId/characters
GET    /api/v4/guilds/:guildId/characters/:id
POST   /api/v4/guilds/:guildId/characters
PUT    /api/v4/guilds/:guildId/characters/:id
DELETE /api/v4/guilds/:guildId/characters/:id
PUT    /api/v4/guilds/:guildId/characters/:id/gear
DELETE /api/v4/guilds/:guildId/characters/:id/gear
```

**`GET …/characters`** — the list, and who is asking:

```jsonc
{
  "guild": { "id": "…", "name": "Nightfall" },
  "you": { "userId": "…", "isOfficer": true },
  "characters": [
    { "id": 1, "userId": "…", "displayName": "Ava", "name": "Thrallsbane",
      "realm": "Nightslayer", "classKey": "warrior", "specKey": "prot_war",
      "roleKey": "tank", "level": 60, "isMain": true,
      "professions": [{ "key": "mining", "skill": 300 }],
      "note": "", "updatedBy": "…", "updatedAt": 1790000000, "hasGear": true }
  ]
}
```

`hasGear` is on the list row so a row can say there is something to look at without the
list carrying every member's gear.

**`GET …/characters/:id`** adds `gear` (or null), `attendance`, and
`permissions: { canEdit }`.

**`POST`** creates one. An officer may pass `userId` to file it for somebody else; from
anyone else that field is refused with 403. A name already taken answers **409** with a
message naming who holds it.

**`PUT`** edits. The owner never moves, so `userId` is not accepted here.

**`PUT …/gear`** replaces the gear wholesale. **413** when the body is over 64 KB, which
means bags or a bank got through and should not have.

**`DELETE …/gear`** removes the gear and leaves the profile. **`DELETE`** on the character
takes both, by cascade.

### Attendance

Read from the existing `attendance_log`, filtered by guild and Discord account:

```jsonc
{ "events": 14, "present": 12, "late": 1, "absent": 1, "last": 1790000000 }
```

**It is per account, never per character**, because the log has never recorded which
character somebody brought. The page says so on every profile. Do not let this quietly
become per-character without the log gaining a column first.

---

## 6. Professions

Twelve keys, held in **three places that must agree**: `src/guild/professions.ts` on the
site, `PROFESSIONS` in `addon/WoWForeverSync/export.lua`, and
`src/services/characters.ts` on the bot.

```
alchemy blacksmithing enchanting engineering herbalism
leatherworking mining skinning tailoring          (primary, two at most)
cooking first-aid fishing                          (secondary)
```

`skill` is 1 to 300, or **null**, which means the profession was named but the number was
not. Null is not zero, and the profile says "no skill given" rather than printing a 0.

`tests/guild-addon-professions.test.ts` reads the Lua table off disk and compares it with
the site's, because a key the addon sends that the site does not know is dropped in
silence, which reads to a member as a profession that will not save.

---

## 7. Gear, and what never leaves the machine

Gear arrives only as a **`/wfsync` paste**, read by `src/guild/paste.ts` and checked with
`isCharacterShape` from the gear page's own validator.

**Bags and bank are removed before anything is sent.** Nobody needs to read another
member's inventory, it keeps the row small, and the bot's 64 KB limit refuses a payload
carrying one. A unit test and a browser test both assert they never reach the request.

What is sent: `v`, `addonVersion`, `generatedAt`, `name`, `realm`, `race`, `level`,
`stats`, `equipped`, `talents`, `professions`.

Two behaviours worth keeping:

- **A name mismatch asks, rather than refusing.** People do paste the wrong alt, and they
  also rename characters. The prompt names both.
- **A paste fills in blanks only.** A missing realm, level or profession list is taken
  from the export; anything already entered is left alone, because the person who typed it
  meant it.

### Export version 2

The addon gained `professions` and moved to export version 2 (addon 1.2.0). Version 1 is
still read, and a version 1 paste reports **no professions** rather than "none learned" —
those are different facts. An export claiming a version newer than the site reads is
refused with a message saying so.

---

## 8. Things that will go wrong

- **`DELETE` must be in the CORS method list.** It was not, at first. The browser's
  preflight fails and it reads as the API being down rather than as a CORS problem.
- **A stale `#guild=` link** naming a server the reader has since left must fall back to
  the picker, not send a request the bot will refuse. `chooseGuild` in `src/guild/pick.ts`
  is where that is decided, and it is unit-tested.
- **The attendance caveat is load-bearing.** Remove the "per Discord account" line and a
  leader reads an alt's page as that alt's attendance.
- **Do not put the character id in a query string.** It is not secret, but the fragment is
  where this page's state lives and splitting it across both is how one of them goes stale.

---

## 9. What is deliberately not built

- **A `/character` slash command.** A second on-ramp from Discord, worth doing, not yet
  done.
- **Armory and Warcraft Logs links.** `linksPanel` in `src/guild/render.ts` says plainly
  that neither covers Forever. When one does, that panel is where the links go, and the
  sentence it holds now comes out.
- **Item level on the list.** The item list shipped with the site carries no icons for
  most items and the addon's tooltip read is the only reliable source, so an average would
  be a number of unclear provenance beside numbers that are read.
