import type { Effect } from "../types";

const ARMS = 161;
const FURY = 164;
const PROT = 163;
const ANY = [ARMS, FURY, PROT];

export const WARRIOR_EFFECTS: Effect[] = [
  {
    id: "battle-shout",
    name: "Battle Shout",
    icon: "ability_warrior_battleshout",
    kind: "buff",
    scope: "raid",
    categories: ["melee-attack-power"],
    providers: [{ classId: "warrior", specs: ANY }],
    values: {
      classic: "232 melee attack power to the party, 2 min",
      forever: "139 melee attack power to party or raid members within 20 yards, 3 min",
    },
    forever: {
      status: "changed",
      note: "Rank 7 gives 139 melee attack power for 3 min, down from Classic's 232 for 2 min. It reaches party or raid members within 20 yards at build 1.60.1.70425, where Classic reached only the party. Improved Battle Shout is gone from the Fury tree, so every Warrior brings the same value.",
    },
  },
  {
    id: "demoralizing-shout",
    name: "Demoralizing Shout",
    icon: "ability_warrior_warcry",
    kind: "debuff",
    scope: "target",
    categories: ["reduced-melee-attack-power"],
    providers: [{ classId: "warrior", specs: ANY }],
    exclusiveWith: ["demoralizing-roar"],
    values: {
      classic: "146 less melee attack power for 30 sec",
      forever: "204 less melee attack power for 45 sec",
    },
    forever: {
      status: "changed",
      note: "Rank 5 lowers melee attack power by 204 for 45 sec, up from Classic's 146 for 30 sec. Improved Demoralizing Shout was cut from the Fury tree, so every Warrior brings the same value.",
    },
  },
  {
    id: "thunder-clap",
    name: "Thunder Clap",
    icon: "spell_nature_thunderclap",
    kind: "debuff",
    scope: "target",
    categories: ["reduced-attack-speed"],
    providers: [{ classId: "warrior", specs: ANY }],
    values: {
      classic: "10% slower attacks for 30 sec",
      forever: "20% slower attacks for 30 sec, up to 4 targets",
    },
    forever: {
      status: "changed",
      note: "Rank 6 slows attacks 20% for 30 sec and hits up to 4 targets, twice Classic's 10%. Works in Battle or Defensive Stance now, on a 6 sec cooldown.",
    },
  },
  {
    id: "sunder-armor",
    name: "Sunder Armor",
    icon: "ability_warrior_sunder",
    kind: "debuff",
    scope: "target",
    categories: ["reduced-armor"],
    providers: [{ classId: "warrior", specs: ANY }],
    // Nothing to be exclusive with any more: Expose Armor is no longer tracked, because no
    // raid assigns it over the Sunder its warriors are already stacking.
    forever: {
      status: "same",
      note: "Same 450 armor per application, up to 5 times, for 30 sec. Improved Sunder Armor now only cuts the Rage cost.",
    },
  },
  {
    id: "mortal-strike-debuff",
    name: "Mortal Strike",
    icon: "ability_warrior_savageblow",
    kind: "list",
    scope: "target",
    categories: ["misc-utility"],
    debuffSlots: 0,
    providers: [
      {
        classId: "warrior",
        specs: [ARMS],
        talent: { tree: "Arms", name: "Mortal Strike" },
      },
    ],
    forever: { status: "same" },
  },
  {
    id: "challenging-shout",
    name: "Challenging Shout",
    icon: "ability_bullrush",
    kind: "list",
    scope: "self",
    categories: ["external-cooldowns"],
    providers: [{ classId: "warrior", specs: ANY }],
    forever: { status: "same" },
  },
  {
    id: "intimidating-shout",
    name: "Intimidating Shout",
    icon: "ability_golemthunderclap",
    kind: "list",
    scope: "self",
    categories: ["in-combat-cc"],
    providers: [{ classId: "warrior", specs: ANY }],
    forever: { status: "same" },
  },
  {
    id: "shield-bash",
    name: "Shield Bash",
    icon: "ability_warrior_shieldbash",
    kind: "other",
    scope: "self",
    categories: ["interrupts"],
    providers: [{ classId: "warrior", specs: ANY }],
    forever: { status: "same" },
  },
  {
    id: "improved-shield-bash",
    name: "Improved Shield Bash",
    icon: "ability_warrior_shieldbash",
    kind: "other",
    scope: "self",
    categories: ["silences"],
    providers: [
      {
        classId: "warrior",
        specs: [PROT],
        talent: { tree: "Protection", name: "Improved Shield Bash" },
      },
    ],
    forever: { status: "same" },
  },
  {
    id: "pummel",
    name: "Pummel",
    icon: "inv_gauntlets_04",
    kind: "other",
    scope: "self",
    categories: ["interrupts"],
    providers: [{ classId: "warrior", specs: ANY }],
    forever: { status: "same" },
  },
  {
    id: "concussion-blow",
    name: "Concussion Blow",
    icon: "ability_thunderbolt",
    kind: "list",
    scope: "self",
    categories: ["in-combat-cc"],
    providers: [
      {
        classId: "warrior",
        specs: [PROT],
        talent: { tree: "Protection", name: "Concussion Blow" },
      },
    ],
    forever: {
      status: "changed",
      note: "Same 5 sec stun on a 45 sec cooldown, but it costs 10 Rage instead of 15. The talent moved within Protection.",
    },
  },
  /* A raid boss cannot be slowed, so this is not a debuff the raid covers. Kept as
       utility, which is what it is for: adds, runners and anything that flees. */
  {
    id: "piercing-howl",
    name: "Piercing Howl",
    icon: "spell_shadow_deathscream",
    kind: "list",
    scope: "self",
    categories: ["misc-utility"],
    debuffSlots: 0,
    providers: [
      {
        classId: "warrior",
        specs: [FURY],
        talent: { tree: "Fury", name: "Piercing Howl" },
      },
    ],
    forever: {
      status: "same",
      note: "Same daze: 50% movement speed for 6 sec.",
    },
  },
  {
    id: "disarm",
    name: "Disarm",
    icon: "ability_warrior_disarm",
    kind: "list",
    scope: "self",
    categories: ["misc-utility"],
    providers: [{ classId: "warrior", specs: ANY }],
    forever: {
      status: "changed",
      note: "Improved Disarm now cuts the 1 min cooldown by 7 sec at rank 1 and 20 sec at rank 3.",
    },
  },
  {
    id: "intercept",
    name: "Intercept",
    icon: "ability_rogue_sprint",
    kind: "list",
    scope: "self",
    categories: ["external-cooldowns"],
    providers: [{ classId: "warrior", specs: ANY }],
    forever: {
      status: "same",
      note: "Learned at level 30, as in Classic. Rank 3 stuns for 3 sec on a 30 sec cooldown, and Improved Intercept in Fury takes up to 10 sec off that.",
    },

  },
];
