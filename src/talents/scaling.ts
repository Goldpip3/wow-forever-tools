/**
 * Which number in a talent's sentence moves when you spend another point.
 *
 * The demo showed one rank of these talents and no more. Where that rank's text carries a
 * single number there is nothing to work out — it is the only thing rank could be changing,
 * and `build.ts` scales it. Where the sentence carries two or more, the data does not say
 * which one moves, so the calculator showed rank 1's text at every rank: Restorative Totems
 * read "Mana Spring by 5% and Healing Stream by 10%" whether you had one point in it or
 * five.
 *
 * This file answers only the question the data leaves open: which numbers are the per-rank
 * benefit, and which are a duration, a threshold, a charge count or a range that a talent
 * point does not touch. That is a reading of the English, not a claim about a value. The
 * figures themselves are still worked out by scaling from the one rank that was read, and
 * are still labelled estimates in the tooltip exactly as every other scaled talent is.
 *
 * Indices count the numbers in the rank-1 text in the order they appear, from zero, the
 * same as the upstream `scaleIdx`. Upstream `scaleIdx` always wins over anything here.
 *
 * Six talents are deliberately left out and are listed in AMBIGUOUS below with the reason.
 * A wrong number is worse than an admitted gap, and those are gaps.
 *
 * All of this becomes unnecessary the moment the beta lets the ranks be read properly.
 * Re-import, and any talent that gains a second read rank stops consulting this file.
 */

/** Keyed by `Class|Talent name`. */
export const SCALE_INDICES: Record<string, number[]> = {
  /* ------------------------------------------------------------------ Warrior */
  // "2% chance ... for 1 attack ... Lasts 6 sec." The attack count and the duration are
  // the shape of the proc, not its size.
  'Warrior|Bloodthrill': [0],
  // "12% chance to generate 1 additional Rage ... increased to 2 Rage for two-handed."
  // The two Rage figures are the two weapon cases, not two ranks.
  'Warrior|Unbridled Wrath': [0],
  // "Regenerates 1% over 6 sec after ... suffering more than 20%." Heal size only; the
  // window and the trigger threshold are fixed.
  'Warrior|Blood Craze': [0],

  /* ------------------------------------------------------------------ Paladin */
  'Paladin|Purifying Power': [0, 1],
  // "within 15 sec by 1.0 sec" — the cut to the cast time grows, the window it applies in
  // does not.
  'Paladin|Infusion of Light': [1],
  // "5% increased damage against the first 4 enemies" — the count of enemies is the shape.
  'Paladin|Consecrated Ground': [0],
  'Paladin|Holy Power': [0, 1],
  'Paladin|Sacred Duty': [0, 1],
  // Two separate proc chances, both the talent's own benefit.
  'Paladin|Reckoning': [0, 1],
  // "threat 5% ... damage taken by 2% for 6 sec" — the 6 sec is the buff's duration.
  'Paladin|Iron Creed': [0, 1],
  // "reduce the target's Attack Power by 42, and increase your Attack Power by 1% for
  // 30 sec" — both benefits scale, the duration does not.
  'Paladin|Vindication': [0, 1],
  'Paladin|Crusade': [0, 1],
  // "1% for 30 sec. Stacks up to 5 times." Duration and stack cap are fixed.
  'Paladin|Vengeance': [0],

  /* ------------------------------------------------------------------- Hunter */
  // The same sentence twice, once per Aspect. Both proc chances scale; the speed bonus and
  // duration they grant are the same at every rank.
  'Hunter|Deadly Aspects': [0, 3],
  // "Dodge bonus by 2%. Additionally, your pet gains 50% of the effect." The 50% is the
  // share the pet gets, not a per-rank figure.
  'Hunter|Improved Aspect of the Monkey': [0],
  // "15% chance of cleansing 1 ... reduces the Mana cost by 10%" — one effect cleansed is
  // the shape of it.
  'Hunter|Improved Mend Pet': [0, 2],
  'Hunter|Bestial Discipline': [0, 1],
  // Three benefits to three different Stings, all of them the talent's own.
  'Hunter|Improved Stings': [0, 1, 2],
  // "cooldown by 1 min ... within 20 sec by 10%" — only the damage of the next Shot grows.
  'Hunter|Rapid Killing': [2],
  "Hunter|Predator's Edge": [0, 1],
  // "5% chance to activate your Mongoose Bite for 5 sec" — the window is fixed.
  'Hunter|Expose Prey': [0],

  /* -------------------------------------------------------------------- Rogue */
  // "radius by 3 yds ... as though they were an additional 1 level lower" — both grow.
  'Rogue|Improved Distract': [0, 1],
  // "2% more damage against targets below 35% health" — 35% is the execute window.
  'Rogue|Quietus': [0],
  // "3% chance to cause your next Ambush within 10 sec" — the window is fixed.
  'Rogue|Cutthroat': [0],

  /* ------------------------------------------------------------------- Priest */
  'Priest|Silent Resolve': [0, 1],
  // "absorbing 5% of the amount healed. Lasts 12 sec."
  'Priest|Divine Aegis': [0],
  // "more than 30% of your maximum Health ... heal 8% of the damage taken over 6 sec" —
  // the trigger threshold and the heal window are fixed.
  'Priest|Blessed Recovery': [1],
  // "Armor by 8% for 15 sec."
  'Priest|Inspiration': [0],
  'Priest|Spiritual Guidance': [0, 1],
  // "on targets at or below 20% health by 15%" — 20% is the execute window, 15% the bonus.
  'Priest|Early Demise': [1],

  /* ------------------------------------------------------------------- Shaman */
  'Shaman|Elemental Reach': [0, 1],
  'Shaman|Tidal Focus': [0, 1],
  'Shaman|Improved Reincarnation': [0, 1, 2],
  // The one that started this: two totems, two figures, both the talent's own benefit.
  'Shaman|Restorative Totems': [0, 1],

  /* --------------------------------------------------------------------- Mage */
  'Mage|Improved Channeling': [0, 1],
  'Mage|Arcane Shielding': [0, 1],
  'Mage|Arcane Mind': [0, 1],
  'Mage|Arcane Instability': [0, 1],
  // "cooldown by 1 sec ... within 20 sec by 25%" — the 20 sec window is fixed.
  'Mage|Wake of Fire': [0, 2],
  // "15% chance ... next 1 spell ... Lasts 15 sec."
  'Mage|Fingers of Frost': [0],

  /* ------------------------------------------------------------------ Warlock */
  'Warlock|Suppression': [0, 1],
  'Warlock|Improved Corruption': [0, 1],
  // "2% chance ... reduces the casting time of your next Shadow Bolt by 100%." The 100% is
  // the whole cast time; there is nowhere above it for a rank to go.
  'Warlock|Nightfall': [0],
  // "damage by 17%, but reduces your healing from Drain Life by 10%" — the drawback is the
  // price of the talent, the same at every rank.
  'Warlock|Soul Siphon': [0],
  'Warlock|Improved Health Funnel': [0, 1, 2],
  'Warlock|Improved Imp': [0, 1],
  'Warlock|Fel Vitality': [0, 1],
  // "by 10%, and reduces the cooldown of its Spell Lock by 2 sec."
  'Warlock|Improved Felhunter': [0, 1],
  // One figure per demon, all four the same talent's benefit.
  'Warlock|Master Demonologist': [0, 1, 2, 3],
  // "increase Shadow damage taken ... by 4% for 12 sec."
  'Warlock|Improved Shadow Bolt': [0],
  'Warlock|Agonizing Flames': [0, 1],
  // The same 13% chance and 3 sec stun written twice, for Soul Fire and for Rain of Fire.
  // The chances scale; a stun's length does not.
  'Warlock|Pyroclasm': [0, 2],

  /* -------------------------------------------------------------------- Druid */
  "Druid|Nature's Reach": [0, 1],
  // The same sentence twice, Nature into Arcane and Arcane into Nature. The 10 sec window
  // is fixed both times; the damage bonus grows.
  'Druid|Balance of Nature': [1, 3],
  // "next 2 Starfire spells by 0.17 sec. Stores up to 4 charges. Lasts 15 sec." Only the
  // cast time reduction grows.
  'Druid|Eclipse': [1],
  'Druid|Feral Swiftness': [0, 1],
  'Druid|Brutal Impact': [0, 1],
  'Druid|Shredding Attacks': [0, 1],
  'Druid|Naturalist': [0, 1],
  'Druid|Improved Tranquility': [0, 1],
};

/**
 * Talents left alone on purpose, with why.
 *
 * Each of these has a reading where a different number moves, and nothing in the data
 * settles it. They keep showing the rank the demo did show, with the tooltip saying so.
 * Kept as a list rather than as silence so the next person does not spend the same hour
 * working out that these six are hard.
 */
export const AMBIGUOUS: Record<string, string> = {
  'Warrior|Dual Wield Specialization':
    'Off-hand damage, off-hand Rage generation and off-hand hit chance. Classic scaled only the damage, and Forever bundles three; which of the three a point buys is a guess.',
  'Warrior|Master of Defense':
    'A 50% chance to generate 5 Rage. Either the chance or the Rage could be the per-rank figure and there is no Classic version to compare against.',
  'Shaman|Improved Stormstrike':
    'Three separate 50% figures and a 15 sec window in one sentence, over two ranks. Nothing marks which 50% a point moves.',
  'Warlock|Soul Harvesting':
    'A 10 sec window and two different 50% regeneration figures. Two ranks, and no way to tell which figure the second buys.',
  'Warlock|Decimation':
    'Five numbers across a cooldown cut, an execute threshold, a damage bonus, a window and a cast time cut. Too many readings.',
  'Druid|Primal Fury':
    'Two 50% chances and a 5 Rage figure. Classic scaled the chance, but Forever added the Combo Point half and it is unclear whether both move together.',
};
