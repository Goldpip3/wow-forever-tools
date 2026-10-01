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
      note: "70 Stamina for 1 hour at rank 6, up from 54 for 30 min, and Prayer of Fortitude now covers the whole raid rather than one party. Improved Power Word: Fortitude was cut from Discipline, so every Priest gives the same amount.",
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
      note: "Trainable in Forever rather than a Discipline talent, so every Priest brings it. Rank 4 gives 40 Spirit for 1 hour rather than 30 min, and Prayer of Spirit covers the whole raid.",
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
      status: "changed",
      note: "Same 60 Shadow resistance, but Prayer of Shadow Protection now covers the whole raid rather than one party.",
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
      note: "Every Priest gets it in Forever, not just Dwarves. It has a 3 min cooldown, and the ward lasts 3 min rather than 10.",
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
      note: "Heals the party for 20% of the Priest’s Shadow damage for 30 sec rather than 1 min, and can now proc Spirit Tap. Improved Vampiric Embrace was cut.",
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
    id: "hex-of-weakness",
    name: "Hex of Weakness",
    icon: "spell_shadow_fingerofdeath",
    kind: "debuff",
    scope: "target",
    categories: ["reduced-melee-attack-power"],
    providers: [{ classId: "priest", specs: ANY }],
    forever: {
      status: "changed",
      note: "In every Priest's level 60 spellbook at build 1.60.1.70009, not only Trolls'. Rank 6 lowers melee attack power by 204 for 2 min, where Classic took 20 off each hit. Whether it stacks with Demoralizing Shout is not known.",
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
      note: "Non-periodic critical heals raise the target's armor by 25% for 15 sec at 3 ranks, up from 8% per rank.",
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
    forever: {
      status: "removed",
      note: "Not in the Holy tree, and not in the level 60 spellbook at build 1.60.1.70009.",
    },
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
      note: "The spirit lasts 15 sec rather than 10.",
    },
  },
];
