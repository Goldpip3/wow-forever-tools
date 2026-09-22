WoW Forever ships with a damage meter and no threat meter. This is the threat meter. I built it from the damage meter's layout, so the two windows match when they sit side by side.

Target a mob. The window lists everyone on its threat table, highest first. The red bar is whoever has aggro. The orange bar is whoever pulls next. Every other bar fills to that player's threat as a percent of the aggro holder's, so 300 threat against 400 fills three quarters of the bar. The number on the right is the threat value, then that same percent.

It works in a party or a raid, solo, in or out of combat, and on mobs other people are fighting. Healers don't need to switch targets. With a friendly player targeted, the meter reads that player's target.

## The window

Drag it to move it. Drag the corner to resize it. The mouse wheel scrolls the list, and your own row stays pinned to the top or bottom edge if the list scrolls past you. The title strip turns red once you pass 90% of the way to pulling aggro. You can change that number or add a sound.

The minimap button shows and hides the meter on left click and opens settings on right click. Settings cover the lock, showing only in combat or only in a group, pets, players outside your group, friendly nameplates, class icons, the aggro warning, bar height, text size, background opacity, scale, and test bars.

## Commands

`/threat` shows or hides the window.
`/threat test` fills it with sample bars so you can place it.
`/threat lock`, `/threat reset`, `/threat minimap` and `/threat options` do what they say.
`/threat debug` prints what the game returned for each player. Paste that into a bug report.

## Limits set by the game

The game does not give addons a mob's full threat list. The meter asks about each player it can name: your group and their pets, whoever the mob is attacking, your mouseover, and anyone with a nameplate showing. Turn on friendly nameplates to pick up more players outside your group.

For players outside your group, the game sometimes hides the exact number. Those rows still show a bar and a percent. They can't be sorted by threat.

Inside a dungeon, a player outside your group is not listed. The game hides their name there, and the meter can't tell them apart from someone in your party.

## Addon policy

The meter reads the game's threat API and draws the result. It sends no data, automates no actions, and makes no decisions for the player.
