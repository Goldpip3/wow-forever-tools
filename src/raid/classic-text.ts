/**
 * Classic tooltips, word for word, for the spells the BlizzCon demo never showed.
 *
 * The demo only ever exposed a level 38 spellbook, so anything learned later, any
 * pet ability and every rogue poison is missing from the imported data. Rather
 * than describe those in our own words, this file carries the Classic 1.12 text
 * at the rank a level 60 would have.
 *
 * These are Classic values. Forever may well have changed them, which is why each
 * one is served with a note saying where it came from. When an entry turns up in a
 * later import of the Forever data, that wins and this file is skipped.
 */

export interface ClassicEntry {
  /** Cost and range, then cast time: the grey lines under the name. */
  lines?: Array<[string, string]>;
  text: string;
  rank?: string;
}

export const CLASSIC_TEXT: Record<string, ClassicEntry> = {
  /* ------------------------------------------------------------------ Warrior */
  intercept: {
    lines: [['10 Rage', '8-25 yd range'], ['Instant', '30 sec cooldown']],
    rank: 'Rank 3',
    text: 'Charge an enemy, causing 65 damage and stunning it for 3 sec. Can only be used while in Berserker Stance.',
  },

  /* ------------------------------------------------------------------ Paladin */
  'sanctity-aura': {
    lines: [['Instant', '']],
    text: 'Increases Holy damage done by party members within 30 yards by 10%. Players may only have one Aura on them per Paladin at any one time.',
  },
  'blessing-of-sanctuary': {
    lines: [['70 Mana', '30 yd range'], ['Instant', '']],
    rank: 'Rank 4',
    text: 'Places a Blessing on the friendly target, reducing damage taken from all sources by 20 and causing 28 Holy damage to any creature that strikes a party member. Lasts 5 min.',
  },
  'blessing-of-light': {
    lines: [['145 Mana', '30 yd range'], ['Instant', '']],
    rank: 'Rank 3',
    text: 'Places a Blessing on the friendly target, increasing the effects of Holy Light spells used on the target by up to 400 and the effects of Flash of Light by up to 115. Lasts 5 min.',
  },
  'blessing-of-sacrifice': {
    lines: [['130 Mana', '30 yd range'], ['Instant', '']],
    rank: 'Rank 4',
    text: 'Places a Blessing on a party member, transferring 140 damage taken by that member to the caster. Lasts 30 sec.',
  },
  cleanse: {
    lines: [['140 Mana', '40 yd range'], ['Instant', '']],
    text: 'Cleanses a friendly target, removing 1 poison effect, 1 disease effect and 1 magic effect.',
  },
  'judgement-of-wisdom': {
    lines: [['null', ''], ['Instant', '']],
    rank: 'Rank 3',
    text: "Gives the Paladin's target a chance to restore 74 mana when hit by a melee attack. Lasts 10 sec.",
  },
  'judgement-of-light': {
    lines: [['Instant', '']],
    rank: 'Rank 4',
    text: "Gives the Paladin's target a chance to heal the attacker for 87 when hit by a melee attack. Lasts 10 sec.",
  },

  /* ------------------------------------------------------------------- Hunter */
  'tranquilizing-shot': {
    lines: [['80 Mana', '35 yd range'], ['Instant', '20 sec cooldown']],
    text: 'Attempts to remove 1 Frenzy effect from an enemy.',
  },
  'furious-howl': {
    lines: [['30 Focus', ''], ['Instant', '10 sec cooldown']],
    rank: 'Rank 4',
    text: 'Increases melee and ranged attack power of the wolf and its master by 45 for 20 sec.',
  },
  screech: {
    lines: [['20 Focus', ''], ['Instant', '10 sec cooldown']],
    rank: 'Rank 4',
    text: 'Uses a screeching yell to reduce the melee attack power of all enemies within 10 yards by 210 for 4 sec.',
  },
  'scatter-shot': {
    lines: [['50 Mana', '15 yd range'], ['Instant', '30 sec cooldown']],
    text: 'A short-range shot that deals 50% weapon damage and disorients the target for 4 sec. Any damage caused will remove the effect. Turns off your attack.',
  },
  'wyvern-sting': {
    lines: [['150 Mana', '35 yd range'], ['Instant', '2 min cooldown']],
    text: 'A stinging shot that puts the target to sleep for 12 sec. Any damage will cancel the effect. When the target wakes up, the Sting causes 300 Nature damage over 12 sec. Only one Sting per Hunter can be active on the target at a time.',
  },
  'viper-sting': {
    lines: [['80 Mana', '35 yd range'], ['Instant', '15 sec cooldown']],
    rank: 'Rank 4',
    text: "Stings the target, draining 216 mana over 8 sec, and giving the caster 108 mana. Only one Sting per Hunter can be active on any one target. Lasts 8 sec.",
  },
  'aspect-of-the-pack': {
    lines: [['100 Mana', ''], ['Instant', '']],
    text: 'The hunter takes on the aspects of a pack of cheetahs, increasing movement speed by 30% for the hunter and all party members within 45 yards. Any party member that is struck will be dazed for 4 sec. Only one Aspect can be active at a time.',
  },
  'hunter-tracking': {
    lines: [['Instant', '']],
    text: 'Shows the location of all nearby creatures of the tracked type on the minimap. Only one type of creature can be tracked at a time.',
  },

  /* -------------------------------------------------------------------- Rogue */
  'mind-numbing-poison': {
    lines: [['', '']],
    rank: 'Mind-numbing Poison III',
    text: 'Coats a weapon with poison that lasts for 30 minutes. Each strike has a 20% chance of poisoning the enemy, increasing casting time by 60% for 14 sec.',
  },
  'wound-poison': {
    lines: [['', '']],
    rank: 'Wound Poison IV',
    text: 'Coats a weapon with poison that lasts for 30 minutes. Each strike has a 30% chance of poisoning the enemy for 75 Nature damage and reducing the effectiveness of any healing on the target by 45% for 15 sec. Stacks up to 5 times on a single target.',
  },
  'crippling-poison': {
    lines: [['', '']],
    text: 'Coats a weapon with poison that lasts for 30 minutes. Each strike has a 30% chance of poisoning the enemy, slowing their movement speed by 70% for 12 sec.',
  },

  /* ------------------------------------------------------------------- Priest */
  lightwell: {
    lines: [['1200 Mana', ''], ['2 sec cast', '6 min cooldown']],
    rank: 'Rank 4',
    text: 'Creates a Holy Lightwell. Members of your raid or party can click the Lightwell to restore 800 health over 10 sec. Lightwell will last for 3 min or until 5 charges are used. Moving while under this effect will cancel it.',
  },
  'vampiric-embrace': {
    lines: [['', '30 yd range'], ['Instant', '']],
    text: 'Afflicts your target with Shadow energy that causes all party members to be healed for 20% of any Shadow spell damage you deal for 1 min.',
  },

  /* ------------------------------------------------------------------- Shaman */
  'grace-of-air-totem': {
    lines: [['310 Mana', ''], ['Instant', '']],
    rank: 'Rank 3',
    text: 'Summons a Grace of Air Totem with 5 health at the feet of the caster that increases the Agility of party members within 20 yards by 77 for 2 min.',
  },
  'tranquil-air-totem': {
    lines: [['300 Mana', ''], ['Instant', '']],
    text: 'Summons a Tranquil Air Totem with 5 health at the feet of the caster that reduces threat generated by party members within 20 yards by 20% for 2 min.',
  },

  /* --------------------------------------------------------------------- Mage */
  'conjure-refreshment': {
    lines: [['595 Mana', ''], ['5 sec cast', '']],
    rank: 'Rank 7',
    text: 'Conjures food and water for the caster. Conjured items disappear if logged out for more than 15 minutes.',
  },
  'mage-portals': {
    lines: [['550 Mana', ''], ['10 sec cast', '']],
    text: 'Creates a portal, teleporting group members that use it to the chosen city. Only usable outdoors.',
  },

  /* ------------------------------------------------------------------ Warlock */
  'curse-of-shadow': {
    lines: [['260 Mana', '30 yd range'], ['Instant', '']],
    rank: 'Rank 2',
    text: "Curses the target with shadow vulnerability, increasing Shadow and Arcane damage dealt to the target by 10% and reducing the target's Arcane and Shadow resistances by 75 for 5 min. Only one Curse per Warlock can be active on any one target.",
  },
  'blood-pact': {
    lines: [['Instant', '']],
    rank: 'Rank 5',
    text: 'Increases the Stamina of party members within 30 yards by 14.',
  },
  paranoia: {
    lines: [['Instant', '']],
    text: 'Increases the stealth detection of party members within 30 yards.',
  },
  seduction: {
    lines: [['', '20 yd range'], ['1.5 sec cast', '']],
    text: 'Seduces the target, preventing all actions for up to 15 sec. Any damage caused will remove the effect. Only works on Humanoids.',
  },
  'bane-of-havoc': {
    lines: [['', '40 yd range'], ['Instant', '']],
    text: "Afflicts the target for 5 min, causing 15% of all damage done by the Warlock to other targets to also be dealt to the cursed target. Bane of Havoc is limited to 1 target, and only one Bane per Warlock can be active on any one target.",
  },

  /* -------------------------------------------------------------------- Druid */
  innervate: {
    lines: [['94 Mana', '30 yd range'], ['Instant', '6 min cooldown']],
    text: "Increases the target's Mana regeneration by 400% and allows 100% of the target's Mana regeneration to continue while casting. Lasts 20 sec.",
  },
};

export function classicTextFor(effectId: string): ClassicEntry | undefined {
  return CLASSIC_TEXT[effectId];
}
