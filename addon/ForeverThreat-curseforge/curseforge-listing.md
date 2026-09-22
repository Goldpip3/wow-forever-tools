# Forever Threat: CurseForge listing

Paste these into the project form at https://authors.curseforge.com/#/projects/create/choose-game (pick World of Warcraft).

**Name:** Forever Threat

**Summary (one line):**
A threat meter for WoW Forever that looks and works like the built-in damage meter.

**Class:** Addons
**Main category:** Combat
**Extra categories:** Unit Frames is wrong for this; use Boss Encounters or Tank if offered.
**License:** All Rights Reserved (or MIT if you want others to fork it)
**Logo:** ForeverThreat-icon-400.png
**First file:** ForeverThreat-1.11.zip, release type Beta, game version: the Classic Era version closest to Forever until CurseForge adds Forever itself.

## Description

Forever has a damage meter but no threat meter. This adds one, in the same style, so it sits next to the damage meter without looking like a different UI.

Target a mob and the window lists everyone on its threat table, highest first.

- **Red bar:** whoever has aggro.
- **Orange bar:** whoever pulls next.
- **Every other bar:** filled to that player's threat as a percent of the aggro holder's. 300 threat against 400 fills 75% of the bar.
- The number on the right is the threat value and that same percent.
- Your own row stays pinned to the top or bottom edge if the list scrolls past you.
- The title strip turns red when you pass 90% of the way to pulling. The threshold and an optional sound are in the settings.

Works in a party or raid, solo, in or out of combat, and on mobs someone else is fighting. If you have a friendly player targeted it reads that player's target, so healers see the list without switching.

### Window

Built from the damage meter's own layout: same header, bar art, fonts, settings gear, minimize button and resize handle. Drag it anywhere, resize from the corner, scroll with the mouse wheel. A minimap button shows and hides it (left-click) and opens settings (right-click).

Settings: lock, only show in combat, only show in a group, count pets, include people outside your group, friendly nameplates, class icons, aggro warning and threshold, warning sound, bar height, text size, background opacity, scale, minimap button, test bars, reset position.

### Commands

- `/threat` shows or hides the window
- `/threat test` fills it with sample bars so you can place it
- `/threat lock`, `/threat reset`, `/threat minimap`, `/threat options`
- `/threat debug` prints what the game returned for each player, for bug reports

### What the game does not allow

- The game will not hand an addon a mob's full threat list. The meter checks everyone it can name: your group and pets, whoever the mob is attacking, your mouseover, and anyone with a nameplate up. Turn on friendly nameplates to see more players outside your group.
- Outside your group, and in some instanced fights, the game hides exact threat numbers from addons. Those rows still show a bar and a percent but cannot be sorted by threat.
- Inside a dungeon, a player outside your group is not listed, because the game hides their name and they cannot be told apart from a party member.

### Addon policy

Display only. It reads the game's threat API and draws it. It sends nothing, automates nothing, and makes no decisions for the player.
