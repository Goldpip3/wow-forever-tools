# WoW Forever Sync

Reads your character out of the game and hands you a string to paste into the
gear and DPS page.

## Installing

Copy the `WoWForeverSync` folder into your `Interface/AddOns` directory:

```
World of Warcraft/_classic_beta_/Interface/AddOns/WoWForeverSync/
```

Restart the game. A folder the game has not seen before is only picked up by a
full restart, not by `/reload`.

## Using it

1. Stand somewhere quiet and **take your buffs off**. The addon sends the
   character sheet as the game shows it, so a flask you are running counts
   twice: once in the sheet and again if you tick it in the fight settings. The
   site warns you when it spots this, but unbuffed is cleaner.
2. Open your bank if you want the bank scanned. It is read automatically the
   moment the bank window opens, and kept for later, so you only have to do this
   once in a while.
3. Type `/wfsync`.
4. The box opens with everything selected. Copy it, and paste it into the gear
   page.

`/wfsync bank` rescans the bank without opening the window.

`/wfsync diag` lists which game functions this client is missing and which
tooltip lines the scanner did not understand. Copy it when the site shows a
field empty that should not be.

It will not export in combat: the client hides numbers from addons during a
fight.

## What it sends

Everything is read locally and nothing is uploaded; the addon only puts text in
a box for you to copy.

- Your name, realm, race, class and level.
- Every equipped item, with its stats read off the tooltip so enchants and
  random suffixes are included.
- Everything equippable in your bags, and in your bank the last time it was open.
- The character sheet: your five stats, spell damage and crit per school, attack
  power, hit, armor, mana and health, and your weapon damage and speed.
- Your talents, tab by tab.
- Your weapon skills.
- Your professions and their skill, which the guild page shows.
- Which buffs were on you at the time, so the site can avoid counting them twice.

## When something is missing

The status line at the bottom of the window says how much it found. If it
mentions items that had not loaded, press **Refresh**: the game had not sent the
addon that item's details yet, and a second look usually has them.

Every call into the game is wrapped, so a client missing one of these functions
loses that one field and marks the export partial rather than failing. The stat
patterns are English only. On another locale the item stats come back empty, and
the site will show the items with nothing on them rather than inventing numbers.

## Publishing it

See [RELEASING.md](../RELEASING.md) one folder up: how to cut a release, what
CurseForge wants, and why Forever is not a CurseForge game version yet.

## Keeping it working

`## Interface` in the `.toc` lists 16001, the Forever client, ahead of the
Classic Era numbers. If a patch moves it, add the new number or the addon shows
as out of date.

The tooltip patterns live in `scan.lua`, in one function, `readLine`. If Forever
words a stat differently, that function is the only place that needs changing.

There is no Forever client to test against yet, so the addon is exercised by the
site's own test suite instead: `tests/dps-addon.test.ts` loads these Lua files
into a Lua virtual machine, stubs the game, and checks that what comes out is
something the importer can read. Run `npm test` from the project root after
editing anything here.
