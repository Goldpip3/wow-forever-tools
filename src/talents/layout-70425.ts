import type { ClassTalents } from './types';
import { buildLayout, type Layout } from './layout-70009';

/**
 * The talent trees as they stood at beta build 1.60.1.70425, for reading links made
 * against them.
 *
 * Build 1.60.1.70630 and the server hotfixes of 28 and 30 October rebuilt the Paladin
 * trees, reshaped Feral and Restoration Druid, changed the Mage trees and swapped two
 * Beast Mastery talents, so a link saved before then points at the wrong talents in
 * those four classes. Only they are here. Each entry is name, maximum rank, row, column
 * and, where there is one, the talent that has to be maxed first: what the rules need,
 * nothing more. Taken from the talentsforever.com export generated 2026-10-23.
 *
 * Priest is left out on purpose. Holy Binding took Binding Heal's place with the same
 * rank and row, so no link can tell the two apart, and a point in one reads as the other.
 */

const LAYOUT: Record<string, Layout> = {
  Paladin: [
    ["Holy", [
      ["Divine Strength", 5, 1, 2],
      ["Divine Intellect", 5, 1, 3],
      ["Healing Light", 3, 2, 1],
      ["Spiritual Focus", 2, 2, 2],
      ["Improved Seals", 3, 2, 3],
      ["Unyielding Faith", 2, 2, 4],
      ["Voice of Truth", 1, 3, 1],
      ["Reverence", 3, 3, 2],
      ["Purifying Power", 2, 3, 3],
      ["Infusion of Light", 2, 4, 1],
      ["Illumination", 5, 4, 2, "Reverence"],
      ["Divine Favor", 1, 4, 3],
      ["Divine Precision", 3, 5, 1, "Holy Shock"],
      ["Holy Shock", 1, 5, 2],
      ["Consecrated Ground", 2, 5, 3],
      ["Holy Power", 5, 6, 3],
      ["Light's Vigil", 1, 7, 2, "Holy Shock"],
    ]],
    ["Protection", [
      ["Toughness", 5, 1, 2],
      ["Redoubt", 5, 1, 3],
      ["Precision", 3, 2, 1],
      ["Guardian's Favor", 2, 2, 2],
      ["Anticipation", 5, 2, 4],
      ["Improved Seal of Fury", 1, 3, 1],
      ["Improved Righteous Fury", 3, 3, 2],
      ["Shield Specialization", 3, 3, 3, "Redoubt"],
      ["Sacred Duty", 2, 3, 4],
      ["Swift Judgement", 1, 4, 1, "Improved Seal of Fury"],
      ["One-Handed Weapon Specialization", 3, 4, 2],
      ["Improved Hammer of Justice", 3, 4, 3],
      ["Templar's Bulwark", 1, 5, 2],
      ["Reckoning", 5, 5, 3],
      ["Iron Creed", 5, 6, 3],
      ["Holy Shield", 1, 7, 2, "Templar's Bulwark"],
    ]],
    ["Retribution", [
      ["Deflection", 5, 1, 2],
      ["Benediction", 5, 1, 3],
      ["Improved Judgement", 2, 2, 1],
      ["Holy Conduit", 2, 2, 2],
      ["Conviction", 5, 2, 3],
      ["Vindication", 3, 3, 1],
      ["Sanctified Judgement", 3, 3, 2],
      ["Seal of Command", 1, 3, 3],
      ["Pursuit of Justice", 2, 3, 4],
      ["Eye for an Eye", 2, 4, 1],
      ["Sacred Arbiter", 1, 4, 3],
      ["Two-Handed Weapon Specialization", 3, 5, 1],
      ["Vengeance", 3, 5, 2, "Sanctified Judgement"],
      ["Repentance", 1, 5, 3],
      ["Champion of the Light", 3, 6, 2],
      ["Instrument of Law", 2, 6, 3],
      ["Twist of Light", 1, 7, 2],
    ]],
  ],
  Hunter: [
    ["Beast Mastery", [
      ["Deadly Aspects", 5, 1, 2],
      ["Endurance Training", 5, 1, 3],
      ["Focused Fire", 2, 2, 1],
      ["Improved Aspect of the Monkey", 3, 2, 2],
      ["Pathfinding", 2, 2, 3],
      ["Improved Revive Pet", 2, 2, 4],
      ["Bestial Swiftness", 1, 3, 2],
      ["Unleashed Fury", 5, 3, 3],
      ["Improved Mend Pet", 2, 4, 1],
      ["Ferocity", 5, 4, 3],
      ["Summon Hawk", 1, 4, 4],
      ["Spirit Bond", 2, 5, 1],
      ["Intimidation", 1, 5, 2, "Bestial Swiftness"],
      ["Bestial Discipline", 2, 5, 4],
      ["Frenzy", 5, 6, 3, "Ferocity"],
      ["Bestial Wrath", 1, 7, 2, "Intimidation"],
    ]],
    ["Marksmanship", [
      ["Hawk Eye", 3, 1, 1],
      ["Improved Concussive Shot", 5, 1, 2],
      ["Lethal Attacks", 5, 1, 3],
      ["Improved Stings", 3, 2, 1],
      ["Efficiency", 5, 2, 2],
      ["Careful Aim", 5, 2, 3],
      ["Rapid Killing", 2, 3, 1],
      ["Improved Arcane Shot", 5, 3, 2],
      ["Lone Wolf", 1, 3, 4],
      ["Trueshot Aura", 1, 4, 2],
      ["Mortal Shots", 5, 4, 3, "Careful Aim"],
      ["Rapid Recuperation", 2, 5, 1, "Rapid Killing"],
      ["Barrage", 3, 5, 3],
      ["Scatter Shot", 1, 5, 4],
      ["Ranged Weapon Specialization", 5, 6, 3],
      ["Sniper Shot", 1, 7, 2, "Trueshot Aura"],
    ]],
    ["Survival", [
      ["Improved Tracking", 5, 1, 2],
      ["Deflection", 5, 1, 3],
      ["Entrapment", 5, 2, 1],
      ["Savage Strikes", 2, 2, 2],
      ["Survivalist", 5, 2, 3],
      ["Improved Wing Clip", 3, 2, 4],
      ["Clever Traps", 2, 3, 1],
      ["Surefooted", 3, 3, 2],
      ["Deterrence", 1, 3, 3],
      ["Survival Tactics", 2, 4, 1],
      ["Predator's Edge", 5, 4, 2],
      ["Counterattack", 1, 4, 3, "Deterrence"],
      ["Resourcefulness", 2, 5, 1],
      ["Expose Prey", 2, 5, 2],
      ["Survivalist's Discipline", 2, 5, 3],
      ["Strider Kick", 1, 5, 4],
      ["Lightning Reflexes", 5, 6, 3],
      ["Lacerating Strikes", 1, 7, 2, "Expose Prey"],
    ]],
  ],
  Mage: [
    ["Arcane", [
      ["Wand Specialization", 2, 1, 1],
      ["Arcane Focus", 5, 1, 2],
      ["Improved Channeling", 5, 1, 3],
      ["Missile Barrage", 2, 1, 4],
      ["Arcane Subtlety", 2, 2, 1],
      ["Magic Absorption", 2, 2, 2],
      ["Arcane Concentration", 5, 2, 3],
      ["Arcane Resilience", 2, 2, 4],
      ["Arcane Geometry", 2, 3, 1],
      ["Arcane Impact", 3, 3, 2],
      ["Arcane Blast", 1, 3, 4],
      ["Arcane Shielding", 2, 4, 1],
      ["Improved Counterspell", 2, 4, 2],
      ["Arcane Meditation", 3, 4, 3, "Arcane Concentration"],
      ["Arcane Wrath", 1, 4, 4, "Arcane Blast"],
      ["Presence of Mind", 1, 5, 2],
      ["Arcane Mind", 5, 5, 3],
      ["Arcane Instability", 3, 6, 3],
      ["Arcane Power", 1, 7, 2, "Presence of Mind"],
    ]],
    ["Fire", [
      ["Improved Fire Blast", 2, 1, 1],
      ["Incineration", 3, 1, 2],
      ["Improved Fireball", 5, 1, 3],
      ["Ignite", 5, 2, 1],
      ["Flame Throwing", 2, 2, 2],
      ["Impact", 3, 2, 3],
      ["Burning Soul", 3, 3, 1],
      ["Improved Flamestrike", 3, 3, 2],
      ["Pyroblast", 1, 3, 3],
      ["Improved Scorch", 3, 4, 1],
      ["Improved Fire Ward", 2, 4, 2],
      ["Heating Up", 1, 4, 3, "Pyroblast"],
      ["Master of Elements", 3, 4, 4],
      ["Critical Mass", 5, 5, 2],
      ["Blast Wave", 1, 5, 3],
      ["Fire Power", 3, 6, 3],
      ["Combustion", 1, 7, 2, "Critical Mass"],
    ]],
    ["Frost", [
      ["Frost Warding", 2, 1, 1],
      ["Improved Frostbolt", 5, 1, 2],
      ["Elemental Precision", 3, 1, 3],
      ["Ice Shards", 5, 2, 1],
      ["Frostbite", 3, 2, 2],
      ["Improved Frost Nova", 2, 2, 3],
      ["Permafrost", 3, 2, 4],
      ["Frost Channeling", 3, 3, 1],
      ["Improved Blizzard", 3, 3, 2],
      ["Ice Lance", 1, 3, 3],
      ["Arctic Reach", 2, 4, 1],
      ["Ice Block", 1, 4, 2],
      ["Shatter", 3, 4, 4],
      ["Improved Cone of Cold", 3, 5, 1],
      ["Cold Snap", 1, 5, 2],
      ["Fingers of Frost", 2, 5, 3, "Ice Lance"],
      ["Winter's Chill", 5, 6, 3],
      ["Ice Barrier", 1, 7, 2, "Cold Snap"],
    ]],
  ],
  Druid: [
    ["Balance", [
      ["Improved Wrath", 5, 1, 2],
      ["Genesis", 5, 1, 3],
      ["Moonglow", 3, 2, 1],
      ["Improved Moonfire", 2, 2, 2],
      ["Nature's Majesty", 2, 2, 3],
      ["Nature's Reach", 2, 2, 4],
      ["Improved Entangling Roots", 3, 3, 1],
      ["Nature's Splendor", 1, 3, 3, "Nature's Majesty"],
      ["Insect Swarm", 1, 4, 1],
      ["Vengeance", 5, 4, 2, "Improved Moonfire"],
      ["Improved Starfire", 5, 4, 3],
      ["Overgrowth", 2, 5, 1],
      ["Nature's Grace", 1, 5, 2],
      ["Eclipse", 3, 5, 3],
      ["Moonfury", 5, 6, 2],
      ["Moonkin Form", 1, 7, 2],
    ]],
    ["Feral Combat", [
      ["Ferocity", 5, 1, 2],
      ["Heart of the Wild", 5, 1, 3],
      ["Feral Swiftness", 2, 2, 1],
      ["Feral Instinct", 3, 2, 2],
      ["Brutal Impact", 2, 2, 3],
      ["Thick Hide", 3, 2, 4],
      ["Shredding Attacks", 3, 3, 1],
      ["Savage Fury", 2, 3, 2],
      ["Feral Charge", 1, 3, 3],
      ["Sharpened Claws", 2, 3, 4],
      ["Shifting Power", 1, 4, 1, "Shredding Attacks"],
      ["Primal Bite", 1, 4, 2, "Savage Fury"],
      ["Predatory Strikes", 3, 4, 3],
      ["Blood Frenzy", 2, 4, 4, "Sharpened Claws"],
      ["Improved Shifting Power", 2, 5, 1, "Shifting Power"],
      ["Leader of the Pack", 1, 5, 2],
      ["Natural Instinct", 2, 5, 4],
      ["Natural Reaction", 5, 6, 1],
      ["Rend and Tear", 5, 6, 3, "Predatory Strikes"],
      ["Berserk", 1, 7, 2, "Leader of the Pack"],
    ]],
    ["Restoration", [
      ["Nature's Focus", 5, 1, 2],
      ["Furor", 5, 1, 3],
      ["Naturalist", 5, 2, 1],
      ["Subtlety", 3, 2, 2],
      ["Natural Shapeshifter", 3, 2, 3],
      ["Reflection", 3, 3, 2],
      ["Gift of Nature", 5, 3, 3],
      ["Gift of the Earthmother", 1, 3, 4],
      ["Tranquil Spirit", 5, 4, 2],
      ["Improved Rejuvenation", 3, 4, 3],
      ["Swiftmend", 1, 4, 4],
      ["Nature's Swiftness", 1, 5, 1, "Naturalist"],
      ["Living Spirit", 3, 5, 2],
      ["Improved Tranquility", 2, 5, 4],
      ["Improved Regrowth", 5, 6, 3, "Improved Rejuvenation"],
      ["Wild Growth", 1, 7, 2, "Living Spirit"],
    ]],
  ],
};

/**
 * Talents that changed name but not place in the rules, so a point in the old one lands in
 * the new. Each pair was checked against the new text: the same effect under a new name.
 */
export const RENAMED_AT_70630: Record<string, string> = {
  'Improved Fireball': 'Accelerant',
  'Elemental Precision': 'Precision',
};

const built = new Map<string, ClassTalents>();

/** The trees at build 1.60.1.70425 for one class, keyed the way the talent data is, or null. */
export function layoutBefore70630(dataKey: string): ClassTalents | null {
  const rows = LAYOUT[dataKey];
  if (!rows) return null;
  let cls = built.get(dataKey);
  if (!cls) {
    cls = buildLayout(rows);
    built.set(dataKey, cls);
  }
  return cls;
}
