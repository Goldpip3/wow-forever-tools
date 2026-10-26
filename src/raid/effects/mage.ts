import type { Effect } from "../types";

const ARCANE = 81;
const FIRE = 41;
const FROST = 61;
const ANY = [ARCANE, FIRE, FROST];

export const MAGE_EFFECTS: Effect[] = [
  {
    id: "arcane-intellect",
    name: "Arcane Intellect",
    icon: "spell_holy_magicalsentry",
    kind: "buff",
    scope: "raid",
    categories: ["intellect"],
    providers: [{ classId: "mage", specs: ANY }],
    forever: {
      status: "same",
      note: "Rank 5 gives 31 Intellect, as in Classic. Arcane Brilliance covers the party and raid at 56.",
    },
  },
  {
    id: "counterspell",
    name: "Counterspell",
    icon: "spell_frost_iceshock",
    kind: "other",
    scope: "self",
    categories: ["interrupts"],
    providers: [{ classId: "mage", specs: ANY }],
    forever: { status: "same" },
  },
  {
    id: "improved-counterspell",
    name: "Improved Counterspell",
    icon: "spell_frost_iceshock",
    kind: "other",
    scope: "self",
    categories: ["silences"],
    providers: [
      {
        classId: "mage",
        specs: [ARCANE],
        talent: { tree: "Arcane", name: "Improved Counterspell" },
      },
    ],
    forever: {
      status: "changed",
      note: "Now a certain silence: 2 sec at rank 1 and 4 sec at rank 2. Classic gave a 50% chance at a 4 sec silence.",
    },
  },
  {
    id: "remove-lesser-curse",
    name: "Remove Lesser Curse",
    icon: "spell_nature_removecurse",
    kind: "other",
    scope: "self",
    categories: ["friendly-curse-dispels"],
    providers: [{ classId: "mage", specs: ANY }],
    forever: {
      status: "changed",
      note: "Removes 1 Curse or Bane. The Warlock's Banes are Bane of Agony, Bane of Doom and Bane of Havoc.",
    },
  },
  {
    id: "polymorph",
    name: "Polymorph",
    icon: "spell_nature_polymorph",
    kind: "list",
    scope: "self",
    categories: ["out-of-combat-cc"],
    providers: [{ classId: "mage", specs: ANY }],
    forever: { status: "same" },
  },
  {
    id: "ice-block",
    name: "Ice Block",
    icon: "spell_frost_frost",
    kind: "list",
    scope: "self",
    categories: ["immunities"],
    providers: [
      {
        classId: "mage",
        specs: [FROST],
        talent: { tree: "Frost", name: "Ice Block" },
      },
    ],
    forever: {
      status: "same",
      note: "Word for word the Classic text. The talent moved within Frost.",
    },
  },
  {
    id: "amplify-magic",
    name: "Amplify Magic",
    icon: "spell_holy_flashheal",
    kind: "list",
    scope: "self",
    categories: ["external-cooldowns"],
    providers: [{ classId: "mage", specs: ANY }],
    forever: {
      status: "changed",
      note: "Rank 4 raises spell damage taken by up to 113 and healing by up to 225. Classic gave 75 and 150.",
    },
  },
  {
    id: "dampen-magic",
    name: "Dampen Magic",
    icon: "spell_nature_abolishmagic",
    kind: "list",
    scope: "self",
    categories: ["external-cooldowns"],
    providers: [{ classId: "mage", specs: ANY }],
    forever: {
      status: "changed",
      note: "Rank 5 cuts spell damage taken by up to 135 and healing by up to 270. Classic cut 90 and 180.",
    },
  },
  {
    id: "frost-nova",
    name: "Frost Nova",
    icon: "spell_frost_frostnova",
    kind: "list",
    scope: "self",
    categories: ["in-combat-cc"],
    providers: [{ classId: "mage", specs: ANY }],
    forever: {
      status: "changed",
      note: "Still freezes for up to 8 sec on a 25 sec cooldown. Rank 4 hits for 71 to 79 rather than 73 to 81.",
    },
  },
  {
    id: "winters-chill",
    name: "Winter's Chill",
    icon: "spell_frost_chillingblast",
    kind: "buff",
    scope: "self",
    categories: ["increased-chance-to-be-crit-by-frost"],
    providers: [
      {
        classId: "mage",
        specs: [FROST],
        talent: { tree: "Frost", name: "Winter's Chill" },
      },
    ],
    forever: {
      status: "changed",
      note: "Forever applies it from Frostbolt, Frost Blast and empowered Ice Lance, and each stack raises the damage the target takes from the Mage’s next Cone of Cold by 5%, up to 5. It is no longer a raid-wide frost crit debuff.",
    },
  },
  {
    id: "improved-scorch",
    name: "Improved Scorch",
    icon: "spell_fire_soulburn",
    kind: "buff",
    scope: "self",
    categories: [],
    providers: [
      {
        classId: "mage",
        specs: [FIRE],
        talent: { tree: "Fire", name: "Improved Scorch" },
      },
    ],
    forever: {
      status: "changed",
      note: "The fire vulnerability now only boosts the Mage’s own fire damage, so it no longer helps other fire casters.",
    },
  },
  {
    id: "conjure-refreshment",
    name: "Conjure Food and Water",
    icon: "inv_misc_food_69",
    kind: "list",
    scope: "self",
    categories: ["misc-utility"],
    providers: [{ classId: "mage", specs: ANY }],
    forever: { status: "same" },
  },
  {
    id: "mage-portals",
    name: "Portals and Teleports",
    icon: "spell_arcane_portalorgrimmar",
    kind: "list",
    scope: "self",
    categories: ["misc-utility"],
    providers: [{ classId: "mage", specs: ANY }],
    forever: {
      status: "changed",
      note: "Adds Teleport: Dalaran at 50.",
    },
  },
  {
    id: "comprehend-scroll",
    name: "Comprehend Scroll",
    icon: "inv_scroll_03",
    kind: "list",
    scope: "self",
    categories: ["misc-utility"],
    providers: [{ classId: "mage", specs: ANY }],
    forever: {
      status: "new",
      note: "New little Forever ability that deciphers untranslated scrolls.",
    },
  },
  {
    id: "blink",
    name: "Blink",
    icon: "spell_arcane_blink",
    kind: "list",
    scope: "self",
    categories: ["misc-utility"],
    providers: [{ classId: "mage", specs: ANY }],
    forever: { status: "same" },
  },
];
