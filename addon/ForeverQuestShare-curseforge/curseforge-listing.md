# Forever Quest Share: CurseForge listing

Create the project at https://authors.curseforge.com/#/projects/create/choose-game (pick World of Warcraft).

**Name:** Forever Quest Share

**Summary (one line):**
See which of your quests your party has, and share the missing ones in one click.

**Class:** Addons
**Main category:** Quests & Leveling
**License:** All Rights Reserved, distribution to 3rd party allowed, comments on (same as the others)
**Logo:** ForeverQuestShare-icon-400.jpg (INV_Misc_GroupNeedMore)
**Files:** ForeverQuestShare-1.0.zip, release type Release, game version WoW Forever 1.60.1
**Project id:** 1723551 (created 2026-10-03, in the TOC as X-Curse-Project-ID)

## Description

Forever Quest Share puts your party's quest status next to every quest in your quest log, and shares the quests they're missing.

Each quest row in Map & Quest Log gets a small marker per party member. A green check means they have the quest. A gold check means they already turned it in. A grey dash means they don't have it, so you can share it. A red X means the game told you they can't take it. Hover a quest to see each name and what they have.

## Party Quests panel

Click the group icon on the right edge of the map, or the minimap button. The panel opens beside the map with four lists:

- **You can share:** quests you have that someone in your group is missing, with their names and a Share button.
- **They have, you don't:** quests in a party member's log that aren't in yours, with an Ask button.
- **Everyone has or did it**
- **Can't be shared:** quests the game won't let you share, such as ones started from an item.

**Share missing** at the top sends every quest someone lacks, one per second, so the accept windows on their end don't overwrite each other. It skips anyone who already has the quest or finished it. Click again to stop. It waits out combat.

**Ask** sends a request to a party member who has a quest you don't. They get a small window with a Share button, and nothing happens unless they click it.

## Raids

In a raid each quest shows a count, such as 7/12, in place of the markers. Hover it for the names.

## Where the information comes from

- **Party members running Forever Quest Share** send their quest list and say which of your quests they already turned in. This is the only way to know whether someone completed a quest, because the game doesn't let add-ons read another player's quest history.
- **Party members running Questie** already send their quest log to the party. Forever Quest Share reads what Questie received. Questie doesn't send completed quests.
- **Everyone else** shows up as unknown until you share. When you do, the game answers with "already on that quest", "has completed that quest" or "not eligible", and the markers update.

## Commands

`/fqs` opens or closes the panel.
`/fqs share` shares the missing quests.
`/fqs pips` turns the quest log markers on or off.
`/fqs minimap` shows or hides the minimap button.
`/fqs send` sends your quest list to the group again.
`/fqs debug` prints what the add-on found in the game and what it knows about each party member. Paste that into a bug report.

## Addon policy

Sharing is the same action as the game's own Share button, and it never runs in combat. The add-on doesn't accept, abandon or turn in quests. The only data it sends is your quest list, and only to your own party or raid.
