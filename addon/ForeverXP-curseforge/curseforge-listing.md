# Forever XP: CurseForge listing

Create the project at https://authors.curseforge.com/#/projects/create/choose-game (pick World of Warcraft).

**Name:** Forever XP

**Summary (one line):**
An experience tracker for WoW Forever that also tells you what a mob is worth before you kill it.

**Class:** Addons
**Main category:** Quests & Leveling
**License:** All Rights Reserved (same as Forever Threat)
**Logo:** ForeverXP-icon-400.png
**First file:** ForeverXP-1.0.zip, release type Release, game version WoW Forever 1.60.1
**After approval:** put the project id in ForeverXP.toc as `## X-Curse-Project-ID: <id>`

Note: the zip's ForeverXP.lua differs from your installed copy in one place. The one-time repair block for Gold Pipe's level 10 numbers is removed, since it has no business on anyone else's machine.

## Description (paste into the description editor)

Most experience trackers tell you what you already earned. This one also tells you what the mob in front of you will pay. Target a mob, or hover over it, and you see the XP it gives at your level before you pull it.

The window uses the same art as Forever's built-in damage meter, so it fits next to it.

## What it tracks

XP per hour, re-measured every five minutes, with a button to re-measure now.
How your XP splits between kills and quests.
Time left to the next level at your current rate.
Your last kill and what it gave.
The quests in your log that are ready to hand in, the XP they add up to, and where handing them all in leaves your level bar.

Click the title to switch between this session and this level. The session carries across a `/reload`.

## What a mob is worth

The target row and a line on the mob's tooltip show its XP. Once you have killed a mob of that level solo, the number is what the game really paid you. Before that it comes from the classic XP formula, corrected by what your own kills have paid, and carries a "~" to mark it as an estimate. Group kills, elites, grey mobs and rested XP are all accounted for.

A second box under the window lists mob levels from three above you to three below, the XP each gives, and how many of them it takes to level.

XP buffs count. The add-on reads the text of your buffs, so a Well Fed that adds 5% experience from kills raises the predictions while it is up, and one that doesn't is ignored.

## Level history

Each finished level is saved: total XP, the share from kills and from quests, kill and quest counts, rested XP, and time played. `/fxp levels` prints it. `/fxp copy` opens it as tab-separated text you can paste into Excel. Levels from before you installed the add-on have no data.

## Commands

`/fxp` shows or hides the window.
`/fxp reset` starts a new session.
`/fxp lock` and `/fxp center` lock the window or bring it back to the middle of the screen.
`/fxp levels` and `/fxp copy` show the level history.
`/fxp buff` lists the XP buffs it found.
`/fxp debug` prints what the add-on is seeing. Paste that into a bug report.

The minimap button toggles the window. The gear in the header opens settings.

## Addon policy

The add-on reads your experience, quest log and buffs and draws the result. It sends no data, automates no actions, and makes no decisions for the player.
