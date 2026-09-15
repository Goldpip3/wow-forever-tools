# Group Builder ↔ WoW Forever Tools

Two projects, one workflow. **Group Builder** (the Discord signup bot) decides *who is
coming*. **WoW Forever Tools** (this repo) decides *where they sit* and what the raid
covers. Group Builder's plan lists the "comp tool" as out of scope, so the halves do not
overlap.

This file is the contract between them. Nothing here requires either side to run the
other, or to share a database.

---

## The flow

1. People sign up to an event in Discord.
2. The raid leader gets a link to this planner with everyone already seated.
3. They arrange groups, take the suggested swaps, and copy the result back to Discord.

---

## What this planner already accepts

### Option A — a link (no work needed on this side)

Open the planner with the event JSON in the hash:

```
https://<planner>/raid.html#gb=<encodeURIComponent(JSON.stringify(event))>
```

Everyone is read, seated and the page is ready. This is the one-click path from a
Discord button or a dashboard link.

Keep an eye on length. Discord truncates very long URLs, and browsers vary above roughly
8,000 characters. For a 40-player event the JSON should be trimmed to just the fields
below before encoding.

### Option B — paste

The planner has an **Import from Group Builder** box. Paste the same JSON and press
**Seat these signups**. Useful when the link would be too long, and for testing.

---

## The shape it reads

Either of Group Builder's own shapes works. A bare array, a `{ signUps: [...] }` object,
or a whole event object are all accepted.

**The v4 API shape** (`PLAN.md` §12.3), which is the one to prefer:

```json
{
  "title": "Molten Core",
  "templateId": "wow_classic",
  "signUps": [
    { "name": "Ragnaros", "className": "Warrior", "specName": "Protection",
      "roleName": "Tank", "status": "primary", "position": 1 }
  ]
}
```

**The internal row shape** also works:

```json
[{ "displayName": "Ragnaros", "classKey": "warrior", "specKey": "prot_war",
   "status": "primary", "position": 1 }]
```

Only these fields are read. Everything else is ignored, so trimming the payload for the
URL is safe:

| Field | Notes |
|---|---|
| `displayName` or `name` | Shown on the seat. Editable afterwards. |
| `classKey` or `className` | One of the nine class keys, or its display name. |
| `specKey` or `specName` | Optional. Missing means a default spec for that class. |
| `status` | `primary`, `late`, `queued` seat the player. `bench` benches them. `absence` and `tentative` are skipped. |
| `position` | Optional. Controls seating order. |

`roleName` is ignored: the planner works the role out from the spec, which is more
reliable than a template's role buckets.

### The one case that needs care

Group Builder splits Druids into `feral` and `guardian`; Classic has a single Feral
Combat tree. Both import to that tree, and the planner records the difference so a
`guardian` sits with the tanks and a `feral` with the melee. **Keep sending both keys.**
If you ever collapse them, bears will be scored as damage and the seating advice will be
wrong.

Every one of the 28 spec keys in `templates/wow_classic.json` is mapped and covered by a
test in `tests/groupbuilder.test.ts`.

---

## Getting the composition back

The planner produces two things, both from `src/raid/export.ts`.

**A Discord message** (the "Copy for Discord" button, `asDiscordMessage`). Fits in one
post:

```
**WoW Forever raid composition**
20/40 seats  ·  3 Tanks, 7 Melee, 2 Hunters, 2 Casters, 6 Healers

**Group 1**  Ragnaros (Protection Warrior), Bearhug (Feral Combat Druid), …
**Group 2**  …

**Debuff slots** 10/16
**Missing** Blessing of Might, Blessing of Salvation, …

**Fix first**
• Paladin blessings overlap

https://<planner>/raid.html#<code>
```

**A JSON object** (the "Copy roster as JSON" button, `buildExport`), versioned and
stable:

```jsonc
{
  "version": 1,
  "link": "https://…/raid.html#…",   // reopens this exact roster
  "code": "…",                        // just the hash, if you want to build your own link
  "size": 40,
  "players": [{ "name", "class", "spec", "role", "group", "loadout", "dots" }],
  "roles": { "Tanks": 3, "Melee": 7, "Hunters": 2, "Casters": 2, "Healers": 6 },
  "buffs": {
    "covered": [{ "id", "name", "scope", "providers": ["Bob"] }],
    "missing": [{ "id", "name", "scope" }]
  },
  "debuffs": { "used": 10, "cap": 16, "onBoss": [{ "id", "name", "providers" }] },
  "categories": [{ "id", "name", "meta", "providers": 3 }],
  "warnings":   [{ "level", "title", "detail" }],
  "suggestions":[{ "kind", "title", "detail", "gain" }],
  "score": 589
}
```

`id` values match the effect ids in `src/raid/effects/`, so a bot can key off them
without parsing names.

---

## If Group Builder wants to do it without a browser

The roster travels entirely in the URL hash, so the bot can read and write compositions
directly:

```ts
import { decodeRoster, encodeRoster } from './codec';
import { computeCoverage } from './engine';
import { asDiscordMessage } from './export';

const roster = decodeRoster(hashFromPastedLink);      // link  -> roster
const text   = asDiscordMessage(roster!, computeCoverage(roster!));
```

These modules have no DOM dependencies and no network calls. Copying
`src/raid/{types,categories,effects,engine,codec,suggestions,export,groupbuilder}.ts`
plus `src/shared/classes.ts` into the bot is enough; nothing else is needed.

---

## Suggested work on the Group Builder side

None of this exists yet; it is the other half of the contract.

1. **A "Plan groups" button** on the event embed, visible to the leader and co-leaders.
   It builds the trimmed JSON, encodes it, and replies ephemerally with the
   `#gb=` link.
2. **A planner URL setting** per guild, so self-hosters point at their own deployment.
   Default it to wherever this is hosted.
3. **Optional, later:** a `/comp` command that takes a planner link back and posts the
   composition into the event thread. The message body is exactly what
   `asDiscordMessage` produces, so it can be posted verbatim.

Step 1 is small and self-contained. Steps 2 and 3 fit naturally alongside the Phase 6
web dashboard, since both need the guild settings page.
