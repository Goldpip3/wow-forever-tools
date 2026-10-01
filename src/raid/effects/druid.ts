import type { Effect } from "../types";

const BALANCE = 283;
const FERAL = 281;
const RESTO = 282;
const ANY = [BALANCE, FERAL, RESTO];

/**
 * Moonkin Form and the Feral forms are a real either/or: their own tooltips say the two
 * auras do not stack. Everything else a bear can do is not part of that choice, since any
 * Druid can shift for a Demoralizing Roar and shift back.
 */
const FORM = { group: "druid-form", limit: 1 };

export const DRUID_EFFECTS: Effect[] = [
  {
    id: "mark-of-the-wild",
    name: "Mark of the Wild",
    icon: "spell_nature_regeneration",
    kind: "buff",
    scope: "raid",
    categories: [
      "all-stats",
      "armor",
      "fire-resist",
      "frost-resist",
      "nature-resist",
      "shadow-resist",
      "arcane-resist",
    ],
    providers: [{ classId: "druid", specs: ANY }],
    forever: {
      status: "changed",
      note: "Rank 7 gives 385 armor, 16 to all attributes and 27 to all resistances, up from 285, 12 and 20. Improved Mark of the Wild was cut from Restoration, so every Druid gives the same.",
    },
  },
  {
    id: "leader-of-the-pack",
    name: "Leader of the Pack",
    icon: "spell_nature_unyeildingstamina",
    kind: "buff",
    scope: "party",
    categories: ["melee-and-ranged-crit"],
    providers: [
      {
        classId: "druid",
        specs: [FERAL],
        talent: { tree: "Feral Combat", name: "Leader of the Pack" },
        choice: FORM,
      },
    ],
    exclusiveWith: ["moonkin-form"],
    values: { forever: "+3% critical strike to the party within 45 yards" },
    forever: {
      status: "changed",
      note: "Forever gives +3% crit to all party members within 45 yards, and the tooltip says it is exclusive with Moonkin Aura.",
    },
  },
  {
    id: "moonkin-form",
    name: "Moonkin Aura",
    icon: "spell_nature_forceofnature",
    kind: "buff",
    scope: "party",
    categories: ["melee-and-ranged-crit", "spell-crit"],
    providers: [
      {
        classId: "druid",
        specs: [BALANCE],
        talent: { tree: "Balance", name: "Moonkin Form" },
        choice: FORM,
      },
    ],
    exclusiveWith: ["leader-of-the-pack"],
    values: {
      classic: "+3% spell crit to the party",
      forever: "+3% critical strike to the party within 45 yards",
    },
    forever: {
      status: "changed",
      note: "Forever raises critical chance for the whole party within 45 yards, and the tooltip says it is exclusive with Leader of the Pack.",
    },
  },
  {
    id: "faerie-fire",
    name: "Faerie Fire",
    icon: "spell_nature_faeriefire",
    kind: "debuff",
    scope: "target",
    categories: ["reduced-armor"],
    providers: [{ classId: "druid", specs: ANY }],
    forever: {
      status: "changed",
      note: "Faerie Fire (Feral) was cut from the Feral tree. The Faerie Fire that is left takes 505 armor off at Rank 4 and requires Cat Form or Bear Form, which any Druid can shift into.",
    },
  },
  {
    id: "insect-swarm",
    name: "Insect Swarm",
    icon: "spell_nature_insectswarm",
    kind: "debuff",
    scope: "target",
    categories: ["reduced-hit-chance"],
    providers: [
      {
        classId: "druid",
        specs: [BALANCE],
        talent: { tree: "Balance", name: "Insect Swarm" },
      },
    ],
    values: { forever: "2% lower chance to hit, 186 Nature damage over 12 sec at Rank 5" },
    forever: {
      status: "changed",
      note: "Forever lists a 2% hit reduction. Nature’s Splendor adds 2 sec of duration.",
    },
  },
  {
    id: "demoralizing-roar",
    name: "Demoralizing Roar",
    icon: "ability_druid_demoralizingroar",
    kind: "debuff",
    scope: "target",
    categories: ["reduced-melee-attack-power"],
    providers: [{ classId: "druid", specs: ANY }],
    exclusiveWith: ["demoralizing-shout"],
    forever: {
      status: "changed",
      note: "Rank 5 takes 204 melee attack power off, up from 138. Feral Aggression was cut from the Feral tree, so every Druid gives the same.",
    },
  },
  {
    id: "thorns",
    name: "Thorns",
    icon: "spell_nature_thorns",
    kind: "list",
    scope: "self",
    categories: ["misc-utility"],
    providers: [{ classId: "druid", specs: ANY }],
    forever: {
      status: "changed",
      note: "Rank 6 deals 22 Nature damage to attackers, up from 18. Improved Thorns was cut from the Balance tree.",
    },
  },
  {
    id: "innervate",
    name: "Innervate",
    icon: "spell_nature_lightning",
    kind: "list",
    scope: "self",
    categories: ["external-cooldowns"],
    providers: [{ classId: "druid", specs: ANY }],
    forever: { status: "same" },
  },
  {
    id: "rebirth",
    name: "Rebirth",
    icon: "spell_nature_reincarnation",
    kind: "other",
    scope: "self",
    categories: ["battle-resurrections"],
    providers: [{ classId: "druid", specs: ANY }],
    forever: {
      status: "same",
      note: "Keeps its 30 min cooldown. The new Revive covers out-of-combat resurrection.",
    },
  },
  {
    id: "revive",
    name: "Revive",
    icon: "spell_nature_reincarnation",
    kind: "list",
    scope: "self",
    categories: ["misc-utility"],
    providers: [{ classId: "druid", specs: ANY }],
    forever: {
      status: "new",
      note: "New out-of-combat resurrection on a 10 sec cast, separate from Rebirth.",
    },
  },
  {
    id: "tranquility",
    name: "Tranquility",
    icon: "spell_nature_tranquility",
    kind: "list",
    scope: "party",
    categories: ["external-cooldowns"],
    providers: [{ classId: "druid", specs: ANY }],
    forever: {
      status: "changed",
      note: "Improved Tranquility now cuts its threat by up to 100% and its cooldown by up to 60%.",
    },
  },
  {
    id: "challenging-roar",
    name: "Challenging Roar",
    icon: "ability_druid_challangingroar",
    kind: "list",
    scope: "self",
    categories: ["external-cooldowns"],
    providers: [{ classId: "druid", specs: ANY }],
    forever: { status: "same" },
  },
  {
    id: "remove-curse-druid",
    name: "Remove Curse",
    icon: "spell_holy_removecurse",
    kind: "other",
    scope: "self",
    categories: ["friendly-curse-dispels"],
    providers: [{ classId: "druid", specs: ANY }],
    forever: {
      status: "changed",
      note: "Dispels 1 Curse or Bane. The Warlock's Banes are Bane of Agony, Bane of Doom and Bane of Havoc.",
    },
  },
  {
    id: "abolish-poison",
    name: "Abolish Poison",
    icon: "spell_nature_nullifypoison_02",
    kind: "other",
    scope: "self",
    categories: ["friendly-poison-dispels"],
    providers: [{ classId: "druid", specs: ANY }],
    forever: {
      status: "same",
      note: "Cure Poison is in the level 60 spellbook too at build 1.60.1.70009.",
    },
  },
  {
    id: "feral-charge",
    name: "Feral Charge",
    icon: "ability_hunter_pet_bear",
    kind: "other",
    scope: "self",
    categories: ["interrupts", "in-combat-cc"],
    providers: [
      {
        classId: "druid",
        specs: [FERAL],
        talent: { tree: "Feral Combat", name: "Feral Charge" },
      },
    ],
    forever: {
      status: "changed",
      note: "Still a 4 sec immobilise and interrupt. The charge now lands behind the target.",
    },
  },
  {
    id: "bash",
    name: "Bash",
    icon: "ability_druid_bash",
    kind: "list",
    scope: "self",
    categories: ["in-combat-cc", "interrupts"],
    providers: [{ classId: "druid", specs: ANY }],
    forever: {
      status: "changed",
      note: "Brutal Impact now also cuts the Bash cooldown by up to 30 sec.",
    },
  },
  {
    id: "hibernate",
    name: "Hibernate",
    icon: "spell_nature_sleep",
    kind: "list",
    scope: "self",
    categories: ["out-of-combat-cc"],
    providers: [{ classId: "druid", specs: ANY }],
    forever: { status: "same" },
  },
  {
    id: "entangling-roots",
    name: "Entangling Roots",
    icon: "spell_nature_stranglevines",
    kind: "list",
    scope: "self",
    categories: ["out-of-combat-cc"],
    providers: [{ classId: "druid", specs: ANY }],
    forever: {
      status: "changed",
      note: "Improved Entangling Roots adds damage, and the new Overgrowth talent lets you root up to two more targets.",
    },
  },
  {
    id: "omen-of-clarity",
    name: "Omen of Clarity",
    icon: "spell_nature_crystalball",
    kind: "list",
    scope: "self",
    categories: ["misc-utility"],
    providers: [{ classId: "druid", specs: ANY }],
    forever: {
      status: "changed",
      note: "Trainable in Forever rather than a Balance talent, along with Nature's Grasp.",
    },
  },
];
