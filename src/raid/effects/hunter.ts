import type { Effect } from "../types";

const BM = 361;
const MM = 363;
const SURV = 362;
const ANY = [BM, MM, SURV];

/** One sting on the boss at a time per Hunter. */
const STING = { group: "hunter-sting", limit: 1 };
/** One pet out at a time. */
const PET = { group: "hunter-pet", limit: 1 };

export const HUNTER_EFFECTS: Effect[] = [
  {
    id: "trueshot-aura",
    name: "Trueshot Aura",
    icon: "ability_trueshot",
    kind: "buff",
    scope: "party",
    categories: ["melee-attack-power", "ranged-attack-power"],
    providers: [
      {
        classId: "hunter",
        specs: [MM],
        talent: { tree: "Marksmanship", name: "Trueshot Aura" },
      },
    ],
    values: {
      forever: "+30 ranged attack power to the party within 45 yards, 30 min",
    },
    forever: {
      status: "changed",
      note: "Forever gives a flat +30 ranged attack power to party members within 45 yards and lasts 30 min.",
    },
  },
  {
    id: "hunters-mark",
    name: "Hunter's Mark",
    icon: "ability_hunter_snipershot",
    kind: "debuff",
    scope: "target",
    categories: ["physical-damage-taken", "ranged-attack-power"],
    providers: [{ classId: "hunter", specs: ANY }],
    forever: {
      status: "changed",
      note: "Improved Hunter's Mark was cut from the Marksmanship tree.",
    },
  },
  {
    id: "scorpid-sting",
    name: "Scorpid Sting",
    icon: "ability_hunter_criticalshot",
    kind: "debuff",
    scope: "target",
    categories: ["reduced-melee-attack-power"],
    providers: [{ classId: "hunter", specs: ANY, choice: STING }],
    forever: {
      status: "changed",
      note: "Improved Scorpid Sting was cut. Improved Stings in Marksmanship now adds 15 sec of duration per rank instead.",
    },
  },
  {
    id: "viper-sting",
    name: "Viper Sting",
    icon: "ability_hunter_aimedshot",
    kind: "debuff",
    scope: "target",
    categories: ["misc-utility"],
    providers: [{ classId: "hunter", specs: ANY, choice: STING }],
    forever: {
      status: "changed",
      note: "Improved Stings cuts its cooldown by 2 sec per rank.",
    },
  },
  {
    id: "tranquilizing-shot",
    name: "Tranquilizing Shot",
    icon: "spell_nature_drowsy",
    kind: "other",
    scope: "self",
    categories: ["offensive-enrage-dispels"],
    providers: [{ classId: "hunter", specs: ANY }],
    forever: { status: "same" },
  },
  {
    id: "furious-howl",
    name: "Furious Howl",
    icon: "ability_hunter_pet_wolf",
    kind: "buff",
    scope: "party",
    // Beta client: melee attack power only. Classic gave melee and ranged, so a
    // wolf no longer covers a group's ranged attack power.
    categories: ["melee-attack-power"],
    providers: [{ classId: "hunter", specs: ANY, pet: "wolf", choice: PET }],
    forever: {
      status: "changed",
      note: "Classic gave the wolf and its master 45 melee and ranged attack power for 20 sec. It is a party buff now: 138 melee attack power within 15 yards for 1 min, and it no longer gives ranged attack power at all.",
    },
  },
  {
    id: "screech",
    name: "Screech",
    icon: "ability_hunter_pet_bat",
    kind: "debuff",
    scope: "target",
    categories: ["reduced-melee-attack-power"],
    debuffSlots: 0,
    providers: [{ classId: "hunter", specs: ANY, pet: "bat", choice: PET }],
    forever: {
      status: "unverified",
      note: "Not in the beta client's level 60 data at build 1.60.1.69876. Pet abilities are not in a player spellbook, so this is not evidence it was cut.",
    },
  },
  {
    id: "summon-hawk",
    name: "Summon Hawk",
    icon: "ability_hunter_pet_owl",
    kind: "list",
    scope: "self",
    categories: ["misc-utility"],
    providers: [
      {
        classId: "hunter",
        specs: [BM],
        talent: { tree: "Beast Mastery", name: "Summon Hawk" },
      },
    ],
    forever: {
      status: "new",
      note: "New Beast Mastery talent. A dive-bombing hawk, two active at once, sharing a cooldown with Arcane Shot.",
    },
  },
  {
    id: "intimidation",
    name: "Intimidation",
    icon: "ability_devour",
    kind: "list",
    scope: "self",
    categories: ["in-combat-cc"],
    providers: [
      {
        classId: "hunter",
        specs: [BM],
        talent: { tree: "Beast Mastery", name: "Intimidation" },
      },
    ],
    forever: {
      status: "changed",
      note: "Still a 3 sec stun on the pet's next attack, but that attack now also gets 100% more critical strike chance.",
    },
  },
  {
    id: "scatter-shot",
    name: "Scatter Shot",
    icon: "ability_golemstormbolt",
    kind: "list",
    scope: "self",
    categories: ["in-combat-cc"],
    providers: [
      {
        classId: "hunter",
        // Marksmanship, not Survival. The gate never matched while it named a
        // tree the talent is not in, so no Hunter ever showed as having it.
        specs: [MM],
        talent: { tree: "Marksmanship", name: "Scatter Shot" },
      },
    ],
    forever: {
      status: "same",
      note: "Word for word the Classic text, in Marksmanship rather than Survival.",
    },
  },
  {
    id: "wyvern-sting",
    name: "Wyvern Sting",
    icon: "inv_spear_02",
    kind: "list",
    scope: "self",
    categories: ["out-of-combat-cc"],
    providers: [
      {
        classId: "hunter",
        specs: [SURV],
        talent: { tree: "Survival", name: "Wyvern Sting" },
      },
    ],
    forever: {
      status: "removed",
      note: "The talent was cut from the Survival tree in Forever.",
    },
  },
  {
    id: "scare-beast",
    name: "Scare Beast",
    icon: "ability_druid_cower",
    kind: "list",
    scope: "self",
    categories: ["out-of-combat-cc"],
    providers: [{ classId: "hunter", specs: ANY }],
    forever: { status: "same" },
  },
  {
    id: "freezing-trap",
    name: "Freezing Trap",
    icon: "spell_frost_chainsofice",
    kind: "list",
    scope: "self",
    categories: ["out-of-combat-cc"],
    providers: [{ classId: "hunter", specs: ANY }],
    forever: {
      status: "changed",
      note: "Survival now has Survival Tactics for trap hit chance and Survivalist’s Discipline for a 20% shorter trap cooldown.",
    },
  },
  {
    id: "aspect-of-the-pack",
    name: "Aspect of the Pack",
    icon: "ability_mount_jungletiger",
    kind: "list",
    scope: "party",
    categories: ["misc-utility"],
    providers: [{ classId: "hunter", specs: ANY }],
    forever: { status: "same" },
  },
  {
    id: "feign-death",
    name: "Feign Death",
    icon: "ability_rogue_feigndeath",
    kind: "list",
    scope: "self",
    categories: ["misc-utility"],
    providers: [{ classId: "hunter", specs: ANY }],
    forever: {
      status: "changed",
      note: "Improved Feign Death was cut from the Survival tree.",
    },
  },
  {
    id: "hunter-tracking",
    name: "Tracking",
    icon: "ability_tracking",
    kind: "list",
    scope: "self",
    categories: ["misc-utility"],
    providers: [{ classId: "hunter", specs: ANY }],
    forever: {
      status: "changed",
      note: "Improved Tracking is a new Survival talent: up to 5% more damage against whatever type you are tracking.",
    },
  },
];
