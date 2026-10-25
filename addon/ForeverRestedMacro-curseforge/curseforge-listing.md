# Forever Rested Macro: CurseForge listing

Create the project at https://authors.curseforge.com/#/projects/create/choose-game (pick World of Warcraft).

**Name:** Forever Rested Macro

**Summary (one line):**
One macro that targets and tags the mobs of your current RestedXP step in WoW Forever.

**Class:** Addons
**Main category:** Quests & Leveling (secondary: Action Bars if offered)
**License:** All Rights Reserved (same as the other three)
**Logo:** ForeverRestedMacro-icon-400.jpg (Hunter's Mark, stock Blizzard icon Ability_Hunter_SniperShot; under the 100 KB cap)
**First file:** ForeverRestedMacro-1.0.zip, release type Release, game version WoW Forever 1.60.1 (type "1.60")
**Relations tab:** add RestedXP Guides as a Required Dependency
**After approval:** put the project id in ForeverRestedMacro.toc as `## X-Curse-Project-ID: <id>`

## Description (paste into the description editor)

Requires RestedXP Guides.

Forever Rested Macro keeps two macros up to date with your RestedXP guide. Each time the guide moves to a new step, both macros are rewritten with the names of the mobs that step asks you to kill. Put them on your bars once and press them the whole way to level cap.

**RXPTag** targets a quest mob and casts your class's tag spell on it, so the kill is yours even if someone else finishes it.
**RXPMelee** targets a quest mob and starts auto-attack.

The macros appear in your general macros the first time you log in. Drag them to a bar.

## Tag spells

| Class | Spell |
|---|---|
| Druid | Moonfire |
| Mage | Fire Blast |
| Shaman | Earth Shock |
| Hunter | Arcane Shot |
| Paladin | Judgement (needs a Seal up) |
| Priest | Shadow Word: Pain |
| Warlock | Curse of Agony |

Warriors, Rogues, and anyone who hasn't learned the spell yet get the melee version in RXPTag too. `/frm spell <name>` swaps in any spell you like.

## How the macro reads

```
/target Kobold Vermin
/target Kobold Worker
/cast Moonfire
```

One `/target` line per mob, then the spell. When a step lists several mobs, each press of RXPTag moves on to the next one in range, so you can pick the owl, the wolf or the spider by pressing again. RXPMelee doesn't rotate, so it won't pull you off the mob you just tagged. Steps with no mobs to kill leave the macros as they were, so they still work on the previous step's mobs.

## Commands

`/frm` shows the current state and tag spell.
`/frm on` and `/frm off` turn the updates on or off.
`/frm spell <name>` sets the tag spell. `/frm spell` with nothing after it goes back to your class default.
`/frm update` rebuilds the macros now.

`/rxptag` works as well.

## Addon policy

The add-on only edits the text of two macros, and only out of combat. It never targets, casts or attacks on its own. You press the button every time.
