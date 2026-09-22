import type { Effect } from "../types";

const ASSA = 182;
const COMBAT = 181;
const SUB = 183;
const ANY = [ASSA, COMBAT, SUB];

/** A Rogue runs at most two poisons at a time, one per weapon. */
const POISON = { group: "rogue-poison", limit: 2 };

export const ROGUE_EFFECTS: Effect[] = [
  /*
   * Expose Armor is deliberately not tracked.
   *
   * It does not stack with Sunder Armor, it overwrites it, and any raid that has warriors
   * tanking already has Sunder up. A rogue spending combo points and energy to replace a
   * debuff that is already there loses damage for nothing, so no raid assigns it. Listing
   * it as a debuff to cover put an empty slot on the page that implied the raid was
   * missing something it was not.
   *
   * Sunder Armor still covers reduced-armor, so the category itself is unaffected.
   */
  {
    id: "kick",
    name: "Kick",
    icon: "ability_kick",
    kind: "other",
    scope: "self",
    categories: ["interrupts"],
    providers: [{ classId: "rogue", specs: ANY }],
    forever: { status: "same" },
  },
  {
    id: "improved-kick",
    name: "Improved Kick",
    icon: "ability_kick",
    kind: "other",
    scope: "self",
    categories: ["silences"],
    providers: [
      {
        classId: "rogue",
        specs: [COMBAT],
        talent: { tree: "Combat", name: "Improved Kick" },
      },
    ],
    forever: { status: "same" },
  },
  {
    id: "kidney-shot",
    name: "Kidney Shot",
    icon: "ability_rogue_kidneyshot",
    kind: "list",
    scope: "self",
    categories: ["in-combat-cc"],
    providers: [{ classId: "rogue", specs: ANY }],
    forever: {
      status: "changed",
      note: "Improved Kidney Shot now makes stunned targets take 5% more damage from your poisons and attacks per rank.",
    },
  },
  {
    id: "blind",
    name: "Blind",
    icon: "spell_shadow_mindsteal",
    kind: "list",
    scope: "self",
    categories: ["out-of-combat-cc"],
    providers: [{ classId: "rogue", specs: ANY }],
    forever: {
      status: "changed",
      note: "Dirty Tricks in Subtlety cuts the energy cost of Blind and Sap by up to 25%.",
    },
  },
  {
    id: "sap",
    name: "Sap",
    icon: "ability_sap",
    kind: "list",
    scope: "self",
    categories: ["out-of-combat-cc"],
    providers: [{ classId: "rogue", specs: ANY }],
    forever: {
      status: "changed",
      note: "Improved Sap was cut from Subtlety, but the new Dirty Tricks cuts its energy cost.",
    },
  },
  {
    id: "mind-numbing-poison",
    name: "Mind-numbing Poison",
    icon: "spell_nature_nullifydisease",
    kind: "debuff",
    scope: "target",
    categories: ["reduced-casting-speed"],
    providers: [{ classId: "rogue", specs: ANY, choice: POISON }],
    forever: {
      status: "same",
      note: "Same 20% chance and 60% casting time for 14 sec. The beta adds a charge count.",
    },
  },
  {
    id: "wound-poison",
    name: "Wound Poison",
    icon: "inv_misc_herb_16",
    kind: "debuff",
    scope: "target",
    categories: ["physical-damage-taken"],
    providers: [{ classId: "rogue", specs: ANY, choice: POISON }],
    forever: {
      status: "changed",
      note: "Improved Poisons now also gives applications a 10% chance not to consume a charge.",
    },
  },
  /* A raid boss cannot be slowed, so this is not a debuff the raid covers. Kept as
       utility, which is what it is for: adds, runners and anything that flees. */
  {
    id: "crippling-poison",
    name: "Crippling Poison",
    icon: "ability_poisons",
    kind: "list",
    scope: "self",
    categories: ["misc-utility"],
    debuffSlots: 0,
    providers: [{ classId: "rogue", specs: ANY, choice: POISON }],
    forever: { status: "same" },
  },
  {
    id: "hemorrhage",
    name: "Hemorrhage",
    icon: "spell_shadow_lifedrain",
    kind: "debuff",
    scope: "target",
    categories: ["physical-damage-taken"],
    providers: [
      {
        classId: "rogue",
        specs: [SUB],
        talent: { tree: "Subtlety", name: "Hemorrhage" },
      },
    ],
    forever: {
      status: "changed",
      note: "No longer a physical damage debuff the raid shares. It makes the target take 15% more Rupture damage from that Rogue alone, so it buys the raid nothing.",
    },
  },
  {
    id: "mutilate",
    name: "Mutilate",
    icon: "ability_rogue_shadowstrikes",
    kind: "list",
    scope: "self",
    categories: ["misc-utility"],
    providers: [
      {
        classId: "rogue",
        specs: [ASSA],
        talent: { tree: "Assassination", name: "Mutilate" },
      },
    ],
    forever: {
      status: "new",
      note: "New Assassination talent. Both weapons for 75% damage, 20% more against poisoned targets, and it awards 2 combo points.",
    },
  },
  {
    id: "rogue-stealth",
    name: "Stealth",
    icon: "ability_stealth",
    kind: "list",
    scope: "self",
    categories: ["misc-utility"],
    providers: [{ classId: "rogue", specs: ANY }],
    forever: { status: "same" },
  },
  {
    id: "pick-lock",
    name: "Pick Lock",
    icon: "inv_misc_key_03",
    kind: "list",
    scope: "self",
    categories: ["misc-utility"],
    providers: [{ classId: "rogue", specs: ANY }],
    forever: { status: "same" },
  },
  {
    id: "distract",
    name: "Distract",
    icon: "ability_rogue_distract",
    kind: "list",
    scope: "self",
    categories: ["misc-utility"],
    providers: [{ classId: "rogue", specs: ANY }],
    forever: {
      status: "changed",
      note: "Improved Distract is a new Subtlety talent: a wider radius and worse stealth detection on distracted enemies.",
    },
  },
];
