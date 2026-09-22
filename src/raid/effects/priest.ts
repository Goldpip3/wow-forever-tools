import type { Effect } from "../types";

const DISC = 201;
const HOLY = 202;
const SHADOW = 203;
const ANY = [DISC, HOLY, SHADOW];

export const PRIEST_EFFECTS: Effect[] = [
  {
    id: "power-word-fortitude",
    name: "Power Word: Fortitude",
    icon: "spell_holy_wordfortitude",
    kind: "buff",
    scope: "raid",
    categories: ["stamina"],
    providers: [{ classId: "priest", specs: ANY }],
    forever: {
      status: "changed",
      note: "Improved Power Word: Fortitude was cut from Discipline, so every Priest gives the base stamina.",
    },
  },
  {
    id: "divine-spirit",
    name: "Divine Spirit",
    icon: "spell_holy_divinespirit",
    kind: "buff",
    scope: "raid",
    categories: ["spirit"],
    providers: [{ classId: "priest", specs: ANY }],
    forever: {
      status: "changed",
      note: "Trainable in Forever rather than a Discipline talent. Rank 1 was in the level 38 spellbook, so every Priest brings it.",
    },
  },
  {
    id: "shadow-protection",
    name: "Shadow Protection",
    icon: "spell_shadow_antishadow",
    kind: "buff",
    scope: "raid",
    categories: ["shadow-resist"],
    providers: [{ classId: "priest", specs: ANY }],
    forever: {
      status: "same",
      note: "Still trainable, sits in the Shadow tab.",
    },
  },
  {
    id: "fear-ward",
    name: "Fear Ward",
    icon: "spell_holy_excorcism",
    kind: "list",
    scope: "self",
    categories: ["external-cooldowns"],
    providers: [{ classId: "priest", specs: ANY }],
    forever: {
      status: "changed",
      note: "Every Priest gets it in Forever on a 3 min cooldown, not just Dwarves.",
    },
  },
  {
    id: "power-infusion",
    name: "Power Infusion",
    icon: "spell_holy_powerinfusion",
    kind: "list",
    scope: "self",
    categories: ["external-cooldowns"],
    providers: [
      {
        classId: "priest",
        specs: [DISC],
        talent: { tree: "Discipline", name: "Power Infusion" },
      },
    ],
    forever: {
      status: "same",
      note: "20% more spell damage and healing for 15 sec, as in Classic.",
    },
  },
  {
    id: "vampiric-embrace",
    name: "Vampiric Embrace",
    icon: "spell_shadow_unsummonbuilding",
    kind: "debuff",
    scope: "target",
    categories: ["misc-utility"],
    providers: [
      {
        classId: "priest",
        specs: [SHADOW],
        talent: { tree: "Shadow", name: "Vampiric Embrace" },
      },
    ],
    forever: {
      status: "changed",
      note: "Heals the party for 20% of the Priest’s Shadow damage and can now proc Spirit Tap. Improved Vampiric Embrace was cut.",
    },
  },
  {
    id: "shadow-weaving",
    name: "Shadow Weaving",
    icon: "spell_shadow_blackplague",
    kind: "buff",
    scope: "self",
    categories: ["shadow-damage"],
    providers: [
      {
        classId: "priest",
        specs: [SHADOW],
        talent: { tree: "Shadow", name: "Shadow Weaving" },
      },
    ],
    forever: {
      status: "changed",
      note: "Now a self-buff: the Priest’s own Shadow damage goes up 2% per stack, up to 5. It is no longer a raid-wide debuff on the target.",
    },
  },
  {
    id: "dispel-magic",
    name: "Dispel Magic",
    icon: "spell_holy_dispelmagic",
    kind: "other",
    scope: "self",
    categories: ["friendly-magic-dispels", "offensive-magic-dispels"],
    providers: [{ classId: "priest", specs: ANY }],
    forever: { status: "same" },
  },
  {
    id: "abolish-disease",
    name: "Abolish Disease",
    icon: "spell_nature_nullifydisease",
    kind: "other",
    scope: "self",
    categories: ["friendly-disease-dispels"],
    providers: [{ classId: "priest", specs: ANY }],
    forever: { status: "same" },
  },
  {
    id: "mass-dispel",
    name: "Mind Control",
    icon: "spell_shadow_shadowworddominate",
    kind: "list",
    scope: "self",
    categories: ["in-combat-cc"],
    providers: [{ classId: "priest", specs: ANY }],
    forever: { status: "same" },
  },
  {
    id: "psychic-scream",
    name: "Psychic Scream",
    icon: "spell_shadow_psychicscream",
    kind: "list",
    scope: "self",
    categories: ["in-combat-cc"],
    providers: [{ classId: "priest", specs: ANY }],
    forever: { status: "same" },
  },
  {
    id: "silence",
    name: "Silence",
    icon: "spell_shadow_impphaseshift",
    kind: "other",
    scope: "self",
    categories: ["interrupts", "silences"],
    providers: [
      {
        classId: "priest",
        specs: [SHADOW],
        talent: { tree: "Shadow", name: "Silence" },
      },
    ],
    forever: {
      status: "changed",
      note: "Still a 5 sec silence, and it now interrupts for 3 sec as well.",
    },
  },
  {
    id: "shackle-undead",
    name: "Shackle Undead",
    icon: "spell_nature_slow",
    kind: "list",
    scope: "self",
    categories: ["out-of-combat-cc"],
    providers: [{ classId: "priest", specs: ANY }],
    forever: { status: "same" },
  },
  {
    id: "inspiration",
    name: "Inspiration",
    icon: "spell_holy_layonhands",
    kind: "buff",
    scope: "raid",
    categories: ["armor"],
    providers: [
      {
        classId: "priest",
        specs: [HOLY],
        talent: { tree: "Holy", name: "Inspiration" },
      },
    ],
    forever: {
      status: "changed",
      note: "Non-periodic critical heals now raise the target armor by up to 8% per rank for 15 sec.",
    },
  },
  {
    id: "prayer-of-mending",
    name: "Prayer of Mending",
    icon: "spell_holy_prayerofmendingtga",
    kind: "list",
    scope: "self",
    categories: ["external-cooldowns"],
    providers: [
      {
        classId: "priest",
        specs: [HOLY],
        talent: { tree: "Holy", name: "Prayer of Mending" },
      },
    ],
    forever: {
      status: "new",
      note: "New Holy talent that jumps between party and raid members as it heals.",
    },
  },
  {
    id: "penance",
    name: "Penance",
    icon: "spell_holy_penance",
    kind: "list",
    scope: "self",
    categories: ["misc-utility"],
    providers: [
      {
        classId: "priest",
        specs: [DISC],
        talent: { tree: "Discipline", name: "Penance" },
      },
    ],
    forever: {
      status: "new",
      note: "New Discipline talent that heals an ally or damages an enemy.",
    },
  },
  {
    id: "lightwell",
    name: "Lightwell",
    icon: "spell_holy_summonlightwell",
    kind: "list",
    scope: "self",
    categories: ["external-cooldowns"],
    providers: [
      {
        classId: "priest",
        specs: [HOLY],
        talent: { tree: "Holy", name: "Lightwell" },
      },
    ],
    forever: { status: "removed", note: "Cut from the Holy tree in Forever." },
  },
  {
    id: "spirit-of-redemption",
    name: "Spirit of Redemption",
    icon: "inv_enchant_essenceeternallarge",
    kind: "list",
    scope: "self",
    categories: ["external-cooldowns"],
    providers: [
      {
        classId: "priest",
        specs: [HOLY],
        talent: { tree: "Holy", name: "Spirit of Redemption" },
      },
    ],
    forever: {
      status: "changed",
      note: "Duration and behaviour were adjusted in the demo tooltip.",
    },
  },
];
