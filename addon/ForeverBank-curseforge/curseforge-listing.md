# Forever Bank: CurseForge listing

Create the project at https://authors.curseforge.com/#/projects/create/choose-game (pick World of Warcraft).

**Name:** Forever Bank

**Summary (one line):**
See what is in your bank from anywhere in WoW Forever, without walking to a banker.

**Class:** Addons
**Main category:** Bags & Inventory
**License:** All Rights Reserved (same as Forever Threat)
**Logo:** ForeverBank-icon-400.png
**First file:** ForeverBank-1.0.zip, release type Release, game version WoW Forever 1.60.1
**After approval:** put the project id in ForeverBank.toc as `## X-Curse-Project-ID: <id>`

## Description (paste into the description editor)

You are out questing and can't remember whether that stack of cloth is in your bank or you sold it. Forever Bank answers that. It saves a copy of your bank every time you visit a banker and shows you that copy anywhere in the world.

Type `/fbank` or click the minimap button. The window shows every bank slot the way you left it, with item counts and quality borders. The bottom corner tells you how long ago the bank was last seen and how many slots are free. While the real bank is open the window reads "live" and updates as you move things.

## The window

The search box dims everything that doesn't match what you type. Shift-click an item to link it in chat. Hover an item for its tooltip. Esc closes the window. Drag it to move it.

## Commands

`/fbank` shows or hides the window.
`/fbank cols 12` sets how many slots wide the window is.
`/fbank scale 0.9` sets its size.
`/fbank minimap` shows or hides the minimap button.
`/fbank debug` prints what the add-on read from the bank. Paste that into a bug report.

## Limits

The game only lets add-ons read the bank while the bank window is open. Visit a banker once on each character before the window has anything to show. What you see away from the bank is the last visit, so anything mailed or moved by another add-on since then won't show until you go back.

It covers the bank of the character you are logged in on. It does not show other characters.

## Addon policy

The add-on reads your bank and draws it. It moves no items, sends no data, and automates nothing.
