import type { Effect } from "../types";

const BM = 361;
const MM = 363;
const SURV = 362;
const ANY = [BM, MM, SURV];

/** One sting on the boss at a time per Hunter. */
const STING = { group: "hunter-sting", limit: 1 };
/** One pet out at a time. */
const PET = { group: "hunter-pet", limit: 1 };
/** "Only one Aspect can be active at a time." */
const ASPECT = { group: "hunter-aspect", limit: 1 };

export const HUNTER_EFFECTS: Effect[] = [
  {
    id: "trueshot-aura",
    name: "Trueshot Aura",
    icon: "ability_trueshot",
    kind: "buff",
    scope: "raid",
    // Ranged attack power only. Classic's aura gave melee attack power too.
    categories: ["ranged-attack-power"],
    providers: [
      {
        classId: "hunter",
        specs: [MM],
        talent: { tree: "Marksmanship", name: "Trueshot Aura" },
      },
    ],
    values: {
      forever: "+50 ranged attack power to party or raid members within 45 yards at Rank 5, 30 min",
    },
    forever: {
      status: "changed",
      note: "Ranged attack power only, for party or raid members within 45 yards, 30 min. Classic reached only the party. The talent is Rank 1 at 30. Rank 5, learned at 60, reads 50 in the beta client at build 1.60.1.70425, below Rank 4's 75.",
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
      note: "Rank 4 gives everyone attacking the target 143 ranged attack power at build 1.60.1.70425, against Classic's 110, and Rank 3 reads 98. Build 1.60.1.70009 read 71 at Rank 4. Improved Hunter's Mark was cut from the Marksmanship tree.",
    },
  },
  {
    id: "scorpid-sting",
    name: "Scorpid Sting",
    icon: "ability_hunter_criticalshot",
    kind: "debuff",
    scope: "target",
    // Forever's sting lowers the target's hit chance. Classic's took Strength
    // and Agility, which is why it used to sit with attack power reductions.
    categories: ["reduced-hit-chance"],
    providers: [{ classId: "hunter", specs: ANY, choice: STING }],
    forever: {
      status: "changed",
      note: "Lowers the target's chance to hit by 2% for 20 sec, where Classic took 20 Strength and Agility. Improved Scorpid Sting was cut; Improved Stings in Marksmanship adds 15 sec of duration per rank instead.",
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
      note: "Has a 15 sec cooldown in Forever. Improved Stings cuts it by 2 sec per rank. Rank 3 drains 1,108 mana over 8 sec.",
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
    scope: "raid",
    // Beta client: melee attack power only. Classic gave melee and ranged, so a
    // wolf no longer covers a group's ranged attack power.
    categories: ["melee-attack-power"],
    providers: [{ classId: "hunter", specs: ANY, pet: "wolf", choice: PET }],
    forever: {
      status: "changed",
      note: "Classic gave the wolf and its master 45 melee and ranged attack power for 20 sec. At build 1.60.1.70425 it reaches party or raid members within 15 yards: 83 melee attack power for 1 min at Rank 4, down from 138 at the last import, and no ranged attack power at all.",
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
      note: "No bat Screech at build 1.60.1.70009: the Pets tab of the level 60 spellbook gives bats Dive only. The closest ability is Demoralizing Screech, a Carrion Bird's: 204 melee attack power off all enemies in melee range for 30 sec.",
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
      note: "The cooldown is 30 sec, up from 15. Survivalist’s Discipline in Survival cuts it by up to 40%, and Survival Tactics adds trap hit chance.",
    },
  },
  /*
   * Classic's Aspect of the Wild only reached the Hunter's group. Forever's reaches the
   * raid, so one Hunter can cover Nature resistance for everyone, at the cost of
   * Aspect of the Hawk. That makes it a real choice, so it is tracked.
   */
  {
    id: "aspect-of-the-wild",
    name: "Aspect of the Wild",
    icon: "spell_nature_protectionformnature",
    kind: "buff",
    scope: "raid",
    categories: ["nature-resist"],
    providers: [{ classId: "hunter", specs: ANY, choice: ASPECT }],
    values: { forever: "+60 Nature resistance to the raid within 30 yards" },
    forever: {
      status: "changed",
      note: "Reaches all party and raid members within 30 yards, where Classic reached only the group. Rank 2 gives 60 Nature resistance. Only one Aspect can be up, so it replaces Aspect of the Hawk.",
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
