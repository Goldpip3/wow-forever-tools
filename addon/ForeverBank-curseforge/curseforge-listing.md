# Forever Bank: CurseForge listing

Create the project at https://authors.curseforge.com/#/projects/create/choose-game (pick World of Warcraft).

**Name:** Forever Bank

**Summary (one line):**
See what is in your bank from anywhere in WoW Forever, without walking to a banker.

**Class:** Addons
**Main category:** Bags & Inventory
**License:** All Rights Reserved (same as Forever Threat)
**Logo:** ForeverBank-icon-400.png
**Files:** ForeverBank-1.0.zip (2026-09-21), ForeverBank-1.1.zip (2026-09-28), ForeverBank-1.2.zip (2026-09-29), ForeverBank-1.3.zip (2026-10-01), release type Release, game version WoW Forever 1.60.1
**After approval:** put the project id in ForeverBank.toc as `## X-Curse-Project-ID: <id>`

## Description (live on CurseForge since 2026-10-01, version 1.3)

Forever Bank saves a copy of your bank every time you visit a banker. You can open that copy anywhere in the world.

Open your bags and click the bag icon to the left of the search box. The minimap button and `/fbank` open it too. The window uses the game's own bag frame, so it looks like your backpack: every bank slot the way you left it, with item counts and quality borders. The coin bar at the bottom shows how many slots are free and how long ago the bank was last seen. While the real bank is open it reads "live" and updates as you move things.

## Vendor value

The top of your backpack shows what your bags would sell for at a vendor. It starts at Junk (grey items). Click it to step up to Normal, Uncommon, Rare and Epic; right-click steps back down. Each step counts everything of that quality and lower, so Uncommon is grey, white and green together. Items a vendor won't buy are left out. It updates as you loot.

## Settings

Open the settings with `/fbank settings`, by right-clicking the minimap button or the bank button on your backpack, or under Options > AddOns > Forever Bank.

You can turn the vendor value and the bank button off, and pick which qualities the vendor value counts. With both turned off, your backpack goes back to the game's normal layout. The bank window has sliders for columns and scale, a minimap button switch, a reset for its position, and a button to forget the saved bank for the character you are on.

## The window

The search box dims everything that doesn't match what you type. Shift-click an item to link it in chat. Hover an item for its tooltip. Esc closes the window. Drag it to move it.

## Commands

`/fbank` shows or hides the window.
`/fbank settings` opens the settings.
`/fbank value` turns the vendor value on or off.
`/fbank button` turns the backpack's bank button on or off.
`/fbank cols 12` sets how many slots wide the window is.
`/fbank scale 0.9` sets its size.
`/fbank minimap` shows or hides the minimap button.
`/fbank debug` prints what the add-on read from the bank. Paste that into a bug report.

## Limits

The game only lets add-ons read the bank while the bank window is open. Visit a banker once on each character before the window has anything to show. What you see away from the bank is the last visit, so anything mailed or moved by another add-on since then won't show until you go back.

It covers the bank of the character you are logged in on. It does not show other characters.

While the vendor value or the bank button is on, the backpack and combined bag grow one row taller to fit them, and the search box and cleanup button move down into that row.

## Addon policy

The add-on reads your bank and bags and draws them. It moves no items, sells nothing, sends no data, and automates nothing.
