# WoW Forever Tools

Tools for World of Warcraft: Forever, the Classic+ line announced at BlizzCon 2026.

1. **Talent calculator** for all nine classes, with a side-by-side Classic comparison.
2. **Raid planner** that takes a roster by name and spec and tells you which buffs,
   debuffs, dispels and cooldowns it actually covers, which ones overwrite each
   other, and how many debuff slots are left on the boss.
3. **Roster mode**, the same page pointed at a real Discord event: the people who
   signed up, seated by the raid leader and told where they stand when it is published.
4. **Gear and DPS**, which reads your character out of the game, simulates the
   fight thousands of times, measures what each stat is worth to you, and ranks
   everything you already own slot by slot.
5. **Guild**, where everyone in your Discord server says which characters they play,
   with spec, professions and the gear from their last export. Forever has no armory
   and no Warcraft Logs, so all of it is entered by hand or pasted from the addon.

A static site with no backend of its own. The guild page, roster mode and signing in
talk to the Group Builder bot's API; nothing else makes a network call beyond loading
the page's own data files. See [ROSTER-SPEC.md](ROSTER-SPEC.md),
[GUILD-SPEC.md](GUILD-SPEC.md) and [AUTH-SPEC.md](AUTH-SPEC.md).

## Getting started

```bash
npm install
```

```bash
npm run dev
```

Then open http://localhost:5273. The pages are `/`, `/talents.html`, `/raid.html`
(planner and roster mode), `/dps.html`, `/guild.html` and `/privacy.html`.

## Commands

| Command | What it does |
|---|---|
| `npm test` | Runs the test suite |
| `npm run import` | Fetches `talentsforever.com/data.json` into `public/data/`, rebuilds the asset manifest and scrubs source notes |
| `npm run assets` | Downloads any icon or tree background the manifest names but `public/assets/` does not have |
| `npm run addon` | Packs `addon/WoWForeverSync` into the zip the gear page hands out |
| `npm run build` | Packs the addon, typechecks, then writes the static site to `dist/` |

Run `import` then `assets` whenever the upstream data changes. Both are safe to
re-run: `assets` skips files that already exist, and logs anything it could not
fetch to `scripts/missing-assets.txt`.

After editing the raid catalog in `src/raid/effects/`, refresh its icon list first:

```bash
node scripts/collect-effect-icons.mjs && npm run import && npm run assets
```

## Fonts

The site uses World of Warcraft’s two fonts: **Morpheus** for large titles and
**Friz Quadrata TT** for interface text, with a narrow face for counters.

**Morpheus is included.** It is shareware from Kiwi Media and ships in
`public/assets/fonts/MORPHEUS.TTF`, with its notice beside it.

**Friz Quadrata** sits in `public/assets/fonts/FRIZQT__.TTF`. It is a commercial ITC
typeface: fine to use from a copy you own, but check your licence before publishing the
site anywhere public. Delete the file and the site falls back to **Alegreya** from
Google Fonts, which is close and still looks right.

Counters use Arial Narrow when it is installed on the visitor's machine, and Alegreya when
it is not. No copy ships and there is no file to drop in. An installed Friz Quadrata or
Morpheus is picked up too, since those rules try `local()` before the file.

The rules live in `src/styles/fonts.css`. It loads files by absolute path
(`/assets/fonts/...`), so a deploy into a subdirectory needs those paths adjusted.

## Refreshing after the beta

The talent data was read from BlizzCon demo footage, so numbers can lag the live
game. When the source site rebuilds from the beta client:

1. Run `npm run import`.
2. Run `npm run assets`.
3. Run `npm test`. The catalog tests will name any talent or icon that moved.
4. Update `forever.status` on anything in `src/raid/effects/` the beta confirms or
   contradicts. Everything currently marked `unverified` is listed in the app's own
   warnings panel.

## Layout

```
index.html / talents.html / raid.html   the pages
dps.html / guild.html / privacy.html
public/data/items.json                  optional item list for the drop finder; not shipped
public/data/talents.generated.json      imported talent data
public/assets/icons, public/assets/bg   Blizzard icons and tree backgrounds
scripts/                                import, asset fetch, icon collection
src/shared/                             classes and specs, icons, tooltip, storage, header, session, focus
src/talents/                            build rules, URL codec, rendering, sections
src/raid/                               types, categories, effects, engine, suggestions, export, UI
src/raid/groupbuilder.ts                reads signups from the Discord bot
src/raid/roster-mode.ts                 roster mode's API calls, saver and publish; the only raid file that uses the network
src/raid/handoff.ts                     one planned player's raid buffs, as a link to the gear page
src/raid/effects/                       one file per class, the hand-maintained catalog
src/dps/                                export format, importer, stat model, gear ranking, UI
src/dps/config.ts                       the one builder every simulation config goes through
src/dps/validate.ts, fight.ts           what links and saved settings must look like, and fight migration
src/dps/draft.ts                        the character kept whole on this device, bags and bank included
src/dps/handoff.ts                      a player from the planner: which buffs apply, which are not simulated
src/guild/                              character profiles: who plays what, and their gear
src/dps/sim/                            the simulator: rolls, event queue, auras, the fight
src/dps/sim/specs/                      one file per spec, registered in index.ts
src/dps/data/                           the editable numbers: spells, buffs, conversions
addon/WoWForeverSync/                   the in-game addon that exports your character
addon/RELEASING.md                      how to publish it, and the CurseForge caveat
tests/                                  vitest suite for every page and the addon
.github/workflows/                      site tests and build on push; addon release on tag
```

## How the raid engine decides things

- **Scope.** A `raid` effect counts once for everyone. A `party` effect only reaches
  the caster's group, so the planner tracks it group by group. A `target` effect is a
  boss debuff and takes a slot. A `self` effect is personal and listed for information.
- **Talent gates.** Anything behind a talent only counts when that player's toggle is on.
- **Choice groups.** A Paladin runs one aura and hands out one blessing. A Shaman drops
  one totem per element. A Warlock keeps one curse. A Rogue runs two poisons.
- **Exclusivity.** Leader of the Pack and Moonkin Aura overwrite each other, as do Sunder
  Armor and Expose Armor. The planner counts one and says so.
- **Debuff slots.** One slot per distinct debuff, whoever applies it. Effects that
  overwrite each other share a slot. Damage-over-time effects only count when the player
  says they will keep them up.

There is no cap by default. Classic's was 16, but Forever has not confirmed its own, so
the toolbar lets you set one and the planner then warns when the raid goes over it.

## Spell text

No description in the planner is written by hand. Every tooltip is the game’s own text,
resolved in this order by `src/raid/spelltext.ts`:

1. The talent trees, for anything behind a talent.
2. The level 38 spellbook, for anything trainable.
3. `src/raid/classic-text.ts`, the Classic 1.12 tooltip, for the rest.

The demo only ever showed a level 38 spellbook, so pet abilities, rogue poisons and
anything learned later fall to step 3. Those carry Classic values, which Forever may
have changed. Each one is a single entry in that file and drops out automatically once
a later import of the Forever data covers it.

Pure damage effects are not tracked at all. Moonfire, Rend, Rupture, Corruption and the
rest change nothing about a composition, so they are not in the catalog.

## Suggested moves

The overview counts the four roles a raid leader thinks in: Tanks, Melee DPS, Ranged DPS
and Healers. Underneath, the scoring keeps a finer split, because a hunter and a mage are
both Ranged DPS but want completely different buffs. Windfury Totem is worth a lot to
melee and nothing to a caster; Moonkin Aura is the reverse.

Those five archetypes live in `src/shared/classes.ts` as `Archetype`, and the four display
buckets as `RoleBucket`.

`src/raid/suggestions.ts` compares every filled seat against every other seat, empty or
not, and keeps the changes that raise the raid's total. Each one comes with the reason
and the size of the gain, and a button that applies it.

To retune the advice, edit the `VALUE` table at the top of that file. It maps a buff
category to what it is worth per archetype. Nothing else needs to change.

A seat gets a red mark only when its group's party buffs do nothing at all for that
player. Hovering it says which buffs are being wasted.

## How the gear tool works

A small addon reads your character in game and hands you a string. Paste it in and
the site has your sheet, your talents, everything you are wearing and everything
equippable in your bags and bank.

The page walks people through it and offers the addon as a download, which is why
`public/downloads/WoWForeverSync.zip` is committed. It is packed by
`npm run addon` straight from `addon/WoWForeverSync`, with a fixed timestamp on
every entry so unchanged sources produce the same bytes and the file does not churn
in the history. A test unzips it and compares it against the source files, so a
stale download cannot ship.

Pushing an annotated tag builds the addon and publishes a GitHub release, via
`.github/workflows/release.yml` and the BigWigs packager. CurseForge, Wago and
WoWInterface each turn on by adding one repository secret.
[addon/RELEASING.md](addon/RELEASING.md) covers all of it, including why Forever
is not a CurseForge game version yet and what goes wrong if you pretend it is.

**The baseline comes from the sheet, not from a table.** Forever has published no
race and class stat tables, so rebuilding your character from first principles
would mean inventing them. Instead the site takes the numbers the game showed,
subtracts what your equipped gear contributes, and calls the rest your baseline.
Swap an item and only the difference moves. That also keeps the class conversions
honest: ten intellect on a new ring becomes crit and mana, while the intellect
already on your sheet is not converted a second time.

**The damage figure is a simulation, not a formula.** `src/dps/sim` runs the fight
as an event loop, rolling every cast against the Classic hit and crit tables, and
does it a thousand times. You get the mean and the spread around it, so you can see
when two answers are too close to tell apart.

**Stat weights are measured, not guessed.** For each stat the site runs the same
fight again with more of it and divides the change in damage by how much it added.
Both runs share their random seeds, so the same misses land in the same places and
what is left is the stat rather than the dice. The weights that come out belong to
your character with your gear and your talents, and you can override any of them.

**Gear is ranked by those weights, and the top swaps can be checked properly.**
A score is a straight line drawn through something that bends: hit stops paying at
the cap, mana stops mattering once you have enough. Pressing Confirm on a swap runs
the whole fight again with the item on and reports what actually changed.

### Adding a spec

Frost Mage went first because its rotation is one button, which makes the damage
checkable by hand, while still exercising the caster half of the engine: cast
timing, the hit and crit rolls, a stacking debuff on the boss, procs, cooldowns
worth planning around and a mana bar that runs dry.

Arms and Fury Warrior went second, and they are the other half. A weapon swings on
a timer of its own, the whole Classic attack table applies to it, rage arrives in
proportion to the damage and the weapon's speed, and Flurry speeds the swings up
which earns more rage. Their talents are read from Forever's own tree text rather
than from Classic, because Forever moved them: Bloodthirst deals thirty-five per
cent of attack power plus thirty, Flurry gives five per cent a rank, and a hook
keyed to a Classic name would silently never fire.

A new spec is one file in `src/dps/sim/specs`, registered in the index beside it.
It declares its abilities, a hook per talent keyed by the name the talent data
uses, a rotation as a priority list, and which stats the weight pass should
measure. Nothing in the engine needs to change unless the spec needs a mechanic it
has never seen.

The index is the list of what is written. The gear page reads it to say which specs
it can run, so that sentence cannot fall behind; this file does not repeat it.

### Where the numbers came from

The demo footage only reached level thirty-eight, so every level-sixty spell rank
is its Classic value carried over and tagged `unverified`. Where the footage did
show something, the note says so: Evocation running for eight seconds on an eight
minute cooldown at fifteen hundred per cent regeneration is confirmed, while the
Frostbolt it showed at two and a half seconds was Rank 7 with that character’s own
talents included, which is consistent with Classic rather than proof of a change.

All of it lives in `src/dps/data`. Every entry carries a status, the results panel
repeats the warning, and when the beta contradicts something the tag changes rather
than the number quietly moving.

**Trinkets and weapon procs** are read off the tooltip the addon scanned, by a
handful of patterns in `src/dps/data/item-effects.ts`. A line none of them
recognises is named in the results notes, and the figure leaves it out rather than
guessing.

**What is not modelled yet:** anything a frozen target would change, since a boss
cannot be frozen. The boss also loses health evenly over the fight rather than at the
rate a real pull goes down, which is what decides when Execute becomes available.
Each of those is listed in the panel that would otherwise overstate your damage,
along with every talent in your build that has no hook behind it.

**Saved runs record the simulator that made them.** A report link carries a
fingerprint of the simulator files. Opened by a build whose simulator has changed
since, it shows the figures as they were and leaves out the fight replay.

## Talking to a Discord bot

See **[INTEGRATION.md](INTEGRATION.md)** for the full contract with Group Builder, the
signup bot this is built to pair with.

`src/raid/export.ts` is the integration surface. It has two functions:

- `buildExport(roster, coverage, origin)` returns a `RosterExport`: a versioned JSON
  object with players, groups, roles, covered and missing buffs with their providers,
  debuff usage, category counts, warnings, suggestions, and a link that reopens the
  exact roster. Effect ids match the ids in `src/raid/effects/`.
- `asDiscordMessage(roster, coverage, origin)` returns a formatted text block that fits
  in one chat post, which is what the "Copy for Discord" button uses.

Going the other way, `src/raid/groupbuilder.ts` reads Group Builder signups into a
seated roster, and the planner accepts them from a `#gb=` link or its Import panel.

A bot can do all of this without a browser: the roster travels entirely in the URL hash,
so `decodeRoster(hash)` turns a pasted link back into a roster and `encodeRoster` turns
one into a link. None of those modules touch the DOM.

## From the planner to the gear page

A seated player's loadout drawer has a link to the gear page carrying the raid buffs, party
buffs and boss debuffs that player gets in that raid. The gear page lists them in three
groups: what the simulator would tick, what it has but does nothing for that kind of
character, and what it does not model at all. Nothing is ticked until the person presses
the button, and consumables are left alone.

Talents are not carried over. The addon's export was measured with the character's own
talents, and the stat baseline comes from that sheet, so simulating a different build on
top of it would describe a character that does not exist. A buff that was up at export is
already in the sheet and is not added again.

## Sharing

Both tools put their whole state in the URL.

- Talents: `talents.html#warrior/60/05305213030510201-000000000000000000-0000000000000000000`.
  This is the same shape talentsforever.com uses, so links paste in either direction.
- Raid: the roster is compressed into the hash, names and loadouts included.
- Gear: the character sheet, talents and worn gear are compressed into the hash. Bags
  and the bank stay on the device, because a full bank does not fit in a link; reloading
  the same link on that device gets them back.
- Roster mode is never shared this way. Its link is signed by the bot and its token stays
  in the fragment.

Saved builds, rosters and characters also live in `localStorage` on that one device.

## Deploying

`npm run build` writes a static `dist/`. It uses relative paths, so it works from any
subdirectory.

- **Cloudflare Pages**: build command `npm run build`, output directory `dist`. The live
  site at https://wowforever.us deploys from `master`.
- **GitHub Pages**: push `dist/` to the `gh-pages` branch, or point Pages at it.
- **Anywhere else**: copy `dist/` to any static host.

## Tests

```bash
npm test
```

`.github/workflows/site.yml` runs the tests and the build on every push and pull request.

Covers the talent point rules, legality and URL round trip, the effect catalog's integrity
(unique ids, real categories, real spec ids, two-way exclusivity, a downloaded icon
for every effect), and the raid engine's scope, exclusivity, choice and debuff-slot
behaviour, plus the swap suggestions and the Discord export.

For the gear tools it covers the export format and its importer, the random number
generator and the event queue, the combat tables against their known values, the
stat model, gear search and report links, and every written spec, with the frost mage
checked against damage figures worked out by hand rather than recorded from an earlier
run. Roster mode's saving and publishing are tested against a mocked network. The addon is covered too: there is no Forever
client to install it in, so the suite loads its Lua into a Lua virtual machine,
stubs the game around it, and checks that what comes out is something the importer
reads.

## Credits

Talent, racial, spellbook and ability data from
[talentsforever.com](https://talentsforever.com), used under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The raid category structure
follows Wowhead's Classic raid composition tool.

Icons and art are Blizzard Entertainment's. This is fan-made and not affiliated with
Blizzard Entertainment.
# Launch checks

See [LAUNCH-CHECKLIST.md](LAUNCH-CHECKLIST.md) for completed checks and the remaining real-event,
game-client and physical-device tests. Feedback defaults to the public GitHub issue tracker
at `Goldpip3/wow-forever-tools`, with the visitor's report prefilled. Posting requires a GitHub
account. Long reports use the copy button instead of an oversized URL. Automatically included
page details exclude URL queries and fragments. `VITE_FEEDBACK_URL` optionally overrides the
destination with an HTTPS channel or mailto address; custom destinations use copy-and-paste.
