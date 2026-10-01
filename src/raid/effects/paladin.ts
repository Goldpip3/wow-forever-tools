import type { Effect } from "../types";

const HOLY = 382;
const PROT = 383;
const RET = 381;
const ANY = [HOLY, PROT, RET];

/** One aura at a time, and one blessing per Paladin on any given class. */
const AURA = { group: "paladin-aura", limit: 1 };
const BLESSING = { group: "paladin-blessing", limit: 1 };

export const PALADIN_EFFECTS: Effect[] = [
  /* ------------------------------------------------------------------ auras */
  {
    id: "devotion-aura",
    name: "Devotion Aura",
    icon: "spell_holy_devotionaura",
    kind: "buff",
    scope: "party",
    categories: ["armor"],
    providers: [{ classId: "paladin", specs: ANY, choice: AURA }],
    forever: {
      status: "changed",
      note: "Improved Devotion Aura was cut from the Protection tree, so every Paladin gives the base armor.",
    },
  },
  {
    id: "retribution-aura",
    name: "Retribution Aura",
    icon: "spell_holy_auraoflight",
    kind: "buff",
    scope: "party",
    categories: ["holy-damage"],
    providers: [{ classId: "paladin", specs: ANY, choice: AURA }],
    forever: {
      status: "changed",
      note: "30 Holy damage to each attacker at rank 5, up from 20 in Classic. Improved Retribution Aura was cut from the Retribution tree.",
    },
  },
  {
    id: "concentration-aura",
    name: "Concentration Aura",
    icon: "spell_holy_mindsooth",
    kind: "buff",
    scope: "party",
    categories: ["misc-utility"],
    providers: [{ classId: "paladin", specs: ANY, choice: AURA }],
    forever: {
      status: "changed",
      note: "Improved Concentration Aura was cut from the Protection tree.",
    },
  },
  /* The resistance auras reach the raid at build 1.60.1.70009, but they stay "party"
     here: as raid scope, spreadChoices would move a second Paladin off Devotion Aura
     onto one of them. That needs spreadChoices to leave a party-scope pick alone first. */
  {
    id: "fire-resistance-aura",
    name: "Fire Resistance Aura",
    icon: "spell_fire_sealoffire",
    kind: "buff",
    scope: "party",
    categories: ["fire-resist"],
    providers: [{ classId: "paladin", specs: ANY, choice: AURA }],
    forever: {
      status: "changed",
      note: "Same 60 Fire resistance, but it now reaches party and raid members within 30 yards, not just the party.",
    },
  },
  {
    id: "frost-resistance-aura",
    name: "Frost Resistance Aura",
    icon: "spell_frost_wizardmark",
    kind: "buff",
    scope: "party",
    categories: ["frost-resist"],
    providers: [{ classId: "paladin", specs: ANY, choice: AURA }],
    forever: {
      status: "changed",
      note: "Same 60 Frost resistance, but it now reaches party and raid members within 30 yards, not just the party.",
    },
  },
  {
    id: "shadow-resistance-aura",
    name: "Shadow Resistance Aura",
    icon: "spell_shadow_sealofkings",
    kind: "buff",
    scope: "party",
    categories: ["shadow-resist"],
    providers: [{ classId: "paladin", specs: ANY, choice: AURA }],
    forever: {
      status: "changed",
      note: "Same 60 Shadow resistance, but it now reaches party and raid members within 30 yards, not just the party.",
    },
  },
  {
    id: "sanctity-aura",
    name: "Sanctity Aura",
    icon: "spell_holy_mindvision",
    kind: "buff",
    scope: "party",
    categories: ["holy-damage"],
    providers: [{ classId: "paladin", specs: [RET], choice: AURA }],
    forever: {
      status: "removed",
      note: "The talent is gone from the Retribution tree, and it is not in the level 60 spellbook at build 1.60.1.70009.",
    },
  },

  /* -------------------------------------------------------------- blessings */
  {
    id: "blessing-of-kings",
    name: "Blessing of Kings",
    icon: "spell_magic_magearmor",
    kind: "buff",
    scope: "raid",
    categories: ["all-stats"],
    providers: [{ classId: "paladin", specs: ANY, choice: BLESSING }],
    forever: {
      status: "changed",
      note: "Trainable in Forever rather than a Protection talent, so every Paladin can bring it.",
    },
  },
  {
    id: "blessing-of-might",
    name: "Blessing of Might",
    icon: "spell_holy_fistofjustice",
    kind: "buff",
    scope: "raid",
    categories: ["melee-attack-power"],
    providers: [{ classId: "paladin", specs: ANY, choice: BLESSING }],
    forever: {
      status: "changed",
      note: "133 melee attack power for 1 hour at rank 7, down from 185 for 5 min in Classic. Improved Blessing of Might was cut from the Retribution tree.",
    },
  },
  {
    id: "blessing-of-wisdom",
    name: "Blessing of Wisdom",
    icon: "spell_holy_sealofwisdom",
    kind: "buff",
    scope: "raid",
    categories: ["mana-regen"],
    providers: [{ classId: "paladin", specs: ANY, choice: BLESSING }],
    forever: {
      status: "changed",
      note: "40 mana every 5 sec for 1 hour at rank 6, up from 33 for 5 min in Classic. Improved Blessing of Wisdom was cut from the Holy tree.",
    },
  },
  {
    id: "blessing-of-salvation",
    name: "Blessing of Salvation",
    icon: "spell_holy_sealofsalvation",
    kind: "buff",
    scope: "raid",
    categories: ["reduced-threat"],
    providers: [{ classId: "paladin", specs: ANY, choice: BLESSING }],
    forever: {
      status: "changed",
      note: "Same 30% less threat, but it lasts 1 hour rather than 5 min.",
    },
  },
  {
    id: "blessing-of-sanctuary",
    name: "Blessing of Sanctuary",
    icon: "spell_nature_lightningshield",
    kind: "buff",
    scope: "raid",
    categories: ["reduced-damage-taken", "holy-damage"],
    providers: [{ classId: "paladin", specs: ANY, choice: BLESSING }],
    forever: {
      status: "removed",
      note: "The Protection talent is gone, and it is not in the level 60 spellbook at build 1.60.1.70009.",
    },
  },
  {
    id: "blessing-of-light",
    name: "Blessing of Light",
    icon: "spell_holy_prayerofhealing02",
    kind: "buff",
    scope: "raid",
    categories: ["misc-utility"],
    providers: [{ classId: "paladin", specs: ANY, choice: BLESSING }],
    forever: {
      status: "changed",
      note: "Same 400 and 115 to Holy Light and Flash of Light. It lasts an hour rather than 5 min.",
    },
  },

  /* ------------------------------------------------------- utility and CDs */
  {
    id: "blessing-of-protection",
    name: "Blessing of Protection",
    icon: "spell_holy_sealofprotection",
    kind: "list",
    scope: "self",
    categories: ["immunities", "external-cooldowns"],
    providers: [{ classId: "paladin", specs: ANY }],
    forever: { status: "same" },
  },
  {
    id: "divine-intervention",
    name: "Divine Intervention",
    icon: "spell_nature_timestop",
    kind: "list",
    scope: "self",
    categories: ["immunities"],
    providers: [{ classId: "paladin", specs: ANY }],
    forever: { status: "same" },
  },
  {
    id: "blessing-of-freedom",
    name: "Blessing of Freedom",
    icon: "spell_holy_sealofvalor",
    kind: "list",
    scope: "self",
    categories: ["external-cooldowns"],
    providers: [{ classId: "paladin", specs: ANY }],
    forever: { status: "same" },
  },
  {
    id: "blessing-of-sacrifice",
    name: "Blessing of Sacrifice",
    icon: "spell_holy_sealofsacrifice",
    kind: "list",
    scope: "self",
    categories: ["external-cooldowns"],
    providers: [{ classId: "paladin", specs: ANY }],
    forever: {
      status: "changed",
      note: "Classic transferred 140 damage in total. It transfers 55 per hit now, over the same 30 sec.",
    },
  },
  {
    id: "cleanse",
    name: "Cleanse",
    icon: "spell_holy_renew",
    kind: "other",
    scope: "self",
    categories: [
      "friendly-poison-dispels",
      "friendly-disease-dispels",
      "friendly-magic-dispels",
    ],
    providers: [{ classId: "paladin", specs: ANY }],
    forever: {
      status: "changed",
      note: "Purifying Power in the Holy tree now cuts the mana cost of Cleanse and Purify.",
    },
  },
  {
    id: "seal-of-justice",
    name: "Seal of Justice",
    icon: "spell_holy_sealofwrath",
    kind: "list",
    scope: "self",
    categories: ["in-combat-cc"],
    providers: [{ classId: "paladin", specs: ANY }],
    forever: {
      status: "changed",
      note: "Judgement no longer consumes the seal, so seals stay up through a Judgement.",
    },
  },
  {
    id: "repentance",
    name: "Repentance",
    icon: "spell_holy_prayerofhealing",
    kind: "list",
    scope: "self",
    categories: ["out-of-combat-cc"],
    providers: [
      {
        classId: "paladin",
        specs: [RET],
        talent: { tree: "Retribution", name: "Repentance" },
      },
    ],
    forever: {
      status: "same",
      note: "Word for word the Classic text. The talent moved within Retribution.",
    },
  },
  {
    id: "hammer-of-justice",
    name: "Hammer of Justice",
    icon: "spell_holy_sealofmight",
    kind: "list",
    scope: "self",
    categories: ["in-combat-cc", "interrupts"],
    providers: [{ classId: "paladin", specs: ANY }],
    forever: { status: "same" },
  },
  {
    id: "judgement-of-wisdom",
    name: "Judgement of Wisdom",
    icon: "spell_holy_righteousnessaura",
    kind: "debuff",
    scope: "target",
    categories: ["mana-regen"],
    providers: [{ classId: "paladin", specs: ANY }],
    forever: {
      status: "changed",
      note: "Judging Seal of Wisdom still gives attacks and spells on the target a chance to restore 59 mana, but it lasts 40 sec rather than 10.",
    },
  },
  {
    id: "judgement-of-light",
    name: "Judgement of Light",
    icon: "spell_holy_healingaura",
    kind: "debuff",
    scope: "target",
    categories: ["misc-utility"],
    providers: [{ classId: "paladin", specs: ANY }],
    forever: {
      status: "changed",
      note: "Judging Seal of Light still gives melee attacks on the target a chance to heal the attacker for 61, but it lasts 40 sec rather than 10.",
    },
  },
  {
    id: "judgement-of-the-crusader",
    name: "Judgement of the Crusader",
    icon: "spell_holy_holysmite",
    kind: "debuff",
    scope: "target",
    categories: ["holy-damage"],
    providers: [{ classId: "paladin", specs: ANY }],
    forever: {
      status: "changed",
      note: "Judging Seal of the Crusader raises Holy damage taken by up to 161 for 40 sec. Classic gave 140 for 10 sec.",
    },
  },
  {
    id: "seal-of-fury",
    name: "Seal of Fury",
    icon: "spell_holy_sealoffury",
    kind: "list",
    scope: "self",
    categories: ["misc-utility"],
    providers: [{ classId: "paladin", specs: [PROT, RET, HOLY] }],
    forever: {
      status: "new",
      note: "The tank seal. Every hit adds Holy damage, and with a shield up you also get an absorb worth half of it. Judging it taunts for 4 sec.",
    },
  },
  {
    id: "consecration",
    name: "Consecration",
    icon: "spell_holy_innerfire",
    kind: "list",
    scope: "self",
    categories: ["misc-utility"],
    providers: [{ classId: "paladin", specs: ANY }],
    forever: {
      status: "changed",
      note: "Trainable at level 20 now instead of a Holy talent.",
    },
  },
];
