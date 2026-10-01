import type { Effect } from "../types";

const ELE = 261;
const ENH = 263;
const RESTO = 262;
const ANY = [ELE, ENH, RESTO];

/** One totem per element at a time, so each element is its own choice group. */
const EARTH = { group: "shaman-earth", limit: 1 };
const AIR = { group: "shaman-air", limit: 1 };
const WATER = { group: "shaman-water", limit: 1 };
const FIRE = { group: "shaman-fire", limit: 1 };

export const SHAMAN_EFFECTS: Effect[] = [
  /* ------------------------------------------------------------------ earth */
  {
    id: "strength-of-earth-totem",
    name: "Strength of Earth Totem",
    icon: "spell_nature_earthbindtotem",
    kind: "buff",
    scope: "party",
    categories: ["strength"],
    providers: [{ classId: "shaman", specs: ANY, choice: EARTH }],
    values: { forever: "+53 Strength to the party within 30 yards" },
    forever: {
      status: "changed",
      note: "Rank 5, learned at 60, gives 53 Strength at build 1.60.1.70009, against Classic's 77. Enhancing Totems was cut from Enhancement, so nothing raises it.",
    },
  },
  {
    id: "stoneskin-totem",
    name: "Stoneskin Totem",
    icon: "spell_nature_stoneskintotem",
    kind: "buff",
    scope: "party",
    categories: ["reduced-damage-taken"],
    providers: [{ classId: "shaman", specs: ANY, choice: EARTH }],
    forever: {
      status: "changed",
      note: "Rank 6 reduces Physical damage taken by 30 within 30 yards, where Classic reduced melee damage only. Guardian Totems in Enhancement adds 20% to it.",
    },
  },
  {
    id: "tremor-totem",
    name: "Tremor Totem",
    icon: "spell_nature_tremortotem",
    kind: "list",
    scope: "party",
    categories: ["misc-utility"],
    providers: [{ classId: "shaman", specs: ANY, choice: EARTH }],
    forever: {
      status: "changed",
      note: "Lasts 5 min instead of 2. It still removes Fear, Charm and Sleep within 30 yards.",
    },
  },
  {
    id: "earthbind-totem",
    name: "Earthbind Totem",
    icon: "spell_nature_strengthofearthtotem02",
    kind: "list",
    scope: "party",
    categories: ["misc-utility"],
    providers: [{ classId: "shaman", specs: ANY, choice: EARTH }],
    forever: {
      status: "changed",
      note: "The new Earthbound talent in Elemental makes it immobilize nearby targets for 5 sec when cast.",
    },
  },
  {
    id: "stoneclaw-totem",
    name: "Stoneclaw Totem",
    icon: "spell_nature_stoneclawtotem",
    kind: "list",
    scope: "party",
    categories: ["misc-utility"],
    providers: [{ classId: "shaman", specs: ANY, choice: EARTH }],
    forever: { status: "same" },
  },

  /* -------------------------------------------------------------------- air */
  {
    id: "windfury-totem",
    name: "Windfury Totem",
    icon: "spell_nature_windfury",
    kind: "buff",
    scope: "party",
    categories: ["extra-melee-attack"],
    providers: [{ classId: "shaman", specs: ANY, choice: AIR }],
    values: { forever: "20% chance on main hand hits of 1 extra attack with 246 attack power" },
    forever: {
      status: "changed",
      note: "Rank 3 gives 246 extra attack power on main hand hits only, within 30 yards, for 5 min. Classic Rank 3 gave 315 within 20 yards. Improved Weapon Totems was cut from Enhancement.",
    },
  },
  {
    id: "grace-of-air-totem",
    name: "Grace of Air Totem",
    icon: "spell_nature_invisibilitytotem",
    kind: "buff",
    scope: "party",
    categories: ["agility"],
    providers: [{ classId: "shaman", specs: ANY, choice: AIR }],
    values: { forever: "+89 Agility to the party within 30 yards" },
    forever: {
      status: "changed",
      note: "Rank 3, learned at 60, gives 89 Agility at build 1.60.1.70009, against Classic's 77. Enhancing Totems was cut, so nothing raises it.",
    },
  },
  {
    id: "windwall-totem",
    name: "Windwall Totem",
    icon: "spell_nature_earthbind",
    kind: "buff",
    scope: "party",
    categories: ["reduced-damage-taken"],
    providers: [{ classId: "shaman", specs: ANY, choice: AIR }],
    forever: {
      status: "changed",
      note: "Guardian Totems in Enhancement still adds 20% to its effect.",
    },
  },
  {
    id: "tranquil-air-totem",
    name: "Tranquil Air Totem",
    icon: "spell_nature_brilliance",
    kind: "buff",
    scope: "party",
    categories: ["reduced-threat"],
    providers: [{ classId: "shaman", specs: ANY, choice: AIR }],
    forever: {
      status: "unverified",
      note: "Not in the beta client's level 60 spellbook at build 1.60.1.70009, which lists every other air totem. A trainable totem missing from a full level 60 spellbook is a fair sign it was cut, but not proof.",
    },
  },
  {
    id: "grounding-totem",
    name: "Grounding Totem",
    icon: "spell_nature_groundingtotem",
    kind: "list",
    scope: "party",
    categories: ["external-cooldowns"],
    providers: [{ classId: "shaman", specs: ANY, choice: AIR }],
    forever: {
      status: "changed",
      note: "Guardian Totems now cuts its cooldown by up to 2 sec.",
    },
  },
  {
    id: "nature-resistance-totem",
    name: "Nature Resistance Totem",
    icon: "spell_nature_natureresistancetotem",
    kind: "buff",
    scope: "raid",
    categories: ["nature-resist"],
    providers: [{ classId: "shaman", specs: ANY, choice: AIR }],
    forever: {
      status: "changed",
      note: "Reaches party and raid members within 30 yards, where Classic reached only the party within 20. Rank 3 gives 60 Nature resistance for 5 min.",
    },
  },

  /* ------------------------------------------------------------------ water */
  {
    id: "mana-spring-totem",
    name: "Mana Spring Totem",
    icon: "spell_nature_manaregentotem",
    kind: "buff",
    scope: "party",
    categories: ["mana-regen"],
    providers: [{ classId: "shaman", specs: ANY, choice: WATER }],
    forever: {
      status: "changed",
      note: "Restorative Totems in Restoration now adds 5% per rank to this, and 10% per rank to Healing Stream.",
    },
  },
  {
    id: "healing-stream-totem",
    name: "Healing Stream Totem",
    icon: "inv_spear_04",
    kind: "list",
    scope: "party",
    categories: ["misc-utility"],
    providers: [{ classId: "shaman", specs: ANY, choice: WATER }],
    forever: {
      status: "changed",
      note: "Restorative Totems now adds 10% per rank instead of 5%.",
    },
  },
  {
    id: "mana-tide-totem",
    name: "Mana Tide Totem",
    icon: "spell_frost_summonwaterelemental",
    kind: "buff",
    scope: "party",
    categories: ["mana-regen"],
    providers: [
      {
        classId: "shaman",
        specs: [RESTO],
        talent: { tree: "Restoration", name: "Mana Tide Totem" },
        choice: WATER,
      },
    ],
    values: { forever: "290 mana every 3 sec for 12 sec to the group" },
    forever: {
      status: "changed",
      note: "Rank 3, learned at 58, restores 290 mana every 3 sec for 12 sec to group members within 30 yards. The talent teaches Rank 1, which restores 88.",
    },
  },
  {
    id: "poison-cleansing-totem",
    name: "Poison Cleansing Totem",
    icon: "spell_nature_poisoncleansingtotem",
    kind: "other",
    scope: "party",
    categories: ["friendly-poison-dispels"],
    providers: [{ classId: "shaman", specs: ANY, choice: WATER }],
    forever: {
      status: "changed",
      note: "Reaches party members within 30 yards instead of 20, and lasts 5 min.",
    },
  },
  {
    id: "disease-cleansing-totem",
    name: "Disease Cleansing Totem",
    icon: "spell_nature_diseasecleansingtotem",
    kind: "other",
    scope: "party",
    categories: ["friendly-disease-dispels"],
    providers: [{ classId: "shaman", specs: ANY, choice: WATER }],
    forever: {
      status: "changed",
      note: "Reaches party members within 30 yards instead of 20.",
    },
  },
  {
    id: "frost-resistance-totem",
    name: "Frost Resistance Totem",
    icon: "spell_frost_frostward",
    kind: "buff",
    scope: "raid",
    categories: ["frost-resist"],
    providers: [{ classId: "shaman", specs: ANY, choice: WATER }],
    forever: {
      status: "changed",
      note: "Reaches party and raid members within 30 yards, where Classic reached only the party within 20. Rank 3 gives 60 Frost resistance for 5 min.",
    },
  },

  /* ------------------------------------------------------------------- fire */
  {
    id: "fire-resistance-totem",
    name: "Fire Resistance Totem",
    icon: "spell_fire_sealoffire",
    kind: "buff",
    scope: "raid",
    categories: ["fire-resist"],
    providers: [{ classId: "shaman", specs: ANY, choice: FIRE }],
    forever: {
      status: "changed",
      note: "Reaches party and raid members within 30 yards, where Classic reached only the party within 20. Rank 3 gives 60 Fire resistance for 5 min.",
    },
  },
  {
    id: "flametongue-totem",
    name: "Flametongue Totem",
    icon: "spell_nature_guardianward",
    kind: "buff",
    scope: "party",
    categories: ["fire-damage"],
    providers: [{ classId: "shaman", specs: ANY, choice: FIRE }],
    forever: {
      status: "changed",
      note: "Rank 4 adds 17 to 55 Fire damage to main hand hits, scaled by weapon speed, within 30 yards for 5 min. Classic Rank 4 was 15.8 to 48.7 within 20 yards for 2 min.",
    },
  },
  {
    id: "magma-totem",
    name: "Magma Totem",
    icon: "spell_fire_selfdestruct",
    kind: "list",
    scope: "party",
    categories: ["misc-utility"],
    providers: [{ classId: "shaman", specs: ANY, choice: FIRE }],
    forever: {
      status: "changed",
      note: "Rank 4 deals 73 Fire damage every 2 sec, against Classic's 75.",
    },
  },
  {
    id: "searing-totem",
    name: "Searing Totem",
    icon: "spell_fire_searingtotem",
    kind: "list",
    scope: "party",
    categories: ["misc-utility"],
    providers: [{ classId: "shaman", specs: ANY, choice: FIRE }],
    forever: {
      status: "changed",
      note: "Rank 6 deals 40 to 54 Fire damage, as in Classic, but scales with 1.7% of spell power instead of 8.3%.",
    },
  },

  /* ------------------------------------------------------- spells and utility */
  {
    id: "earth-shock",
    name: "Earth Shock",
    icon: "spell_nature_earthshock",
    kind: "other",
    scope: "self",
    categories: ["interrupts"],
    providers: [{ classId: "shaman", specs: ANY }],
    forever: {
      status: "changed",
      note: "Shamanistic Focus in Enhancement cuts shock mana costs by 45%.",
    },
  },
  {
    id: "purge",
    name: "Purge",
    icon: "spell_nature_purge",
    kind: "other",
    scope: "self",
    categories: ["offensive-magic-dispels"],
    providers: [{ classId: "shaman", specs: ANY }],
    forever: { status: "same" },
  },
  {
    id: "stormstrike",
    name: "Stormstrike",
    icon: "ability_shaman_stormstrike",
    kind: "debuff",
    scope: "self",
    categories: ["increased-nature-damage-taken"],
    providers: [
      {
        classId: "shaman",
        specs: [ENH],
        talent: { tree: "Enhancement", name: "Stormstrike" },
      },
    ],
    forever: {
      status: "changed",
      note: "Forever's Stormstrike only adds 20% to the Shaman's own next Lightning Bolt, Chain Lightning or Earth Shock on the target. Classic raised the next 2 Nature hits from anyone, so it is no longer a raid debuff. Improved Stormstrike is new: a chance at mana regeneration while casting, and a chance to reset the cooldown when you dodge or parry.",
    },
  },
  {
    id: "cure-poison-shaman",
    name: "Cure Poison",
    icon: "spell_nature_nullifypoison",
    kind: "other",
    scope: "self",
    categories: ["friendly-poison-dispels"],
    providers: [{ classId: "shaman", specs: ANY }],
    forever: { status: "same" },
  },
  {
    id: "cure-disease-shaman",
    name: "Cure Disease",
    icon: "spell_nature_removedisease",
    kind: "other",
    scope: "self",
    categories: ["friendly-disease-dispels"],
    providers: [{ classId: "shaman", specs: ANY }],
    forever: { status: "same" },
  },
  {
    id: "ancestral-spirit",
    name: "Ancestral Spirit",
    icon: "spell_nature_regenerate",
    kind: "list",
    scope: "self",
    categories: ["misc-utility"],
    providers: [{ classId: "shaman", specs: ANY }],
    forever: { status: "same" },
  },
  {
    id: "reincarnation",
    name: "Reincarnation",
    icon: "spell_nature_reincarnation",
    kind: "list",
    scope: "self",
    categories: ["misc-utility"],
    providers: [{ classId: "shaman", specs: ANY }],
    forever: {
      status: "changed",
      note: "Improved Reincarnation now also raises maximum health by 2% per rank.",
    },
  },
  {
    id: "totemic-projection",
    name: "Totemic Projection",
    icon: "spell_nature_astralrecal",
    kind: "list",
    scope: "self",
    categories: ["misc-utility"],
    providers: [{ classId: "shaman", specs: ANY }],
    forever: {
      status: "new",
      note: "New in Forever. Moves your totems to a spot up to 30 yards away.",
    },
  },
  {
    id: "call-of-the-elements",
    name: "Call of the Elements",
    icon: "spell_nature_manaregentotem",
    kind: "list",
    scope: "self",
    categories: ["misc-utility"],
    providers: [{ classId: "shaman", specs: ANY }],
    forever: {
      status: "new",
      note: "New in Forever. Drops up to four totems from your Totem Bar at once.",
    },
  },
  {
    id: "rage-of-the-farseer",
    name: "Rage of the Farseer",
    icon: "spell_nature_bloodlust",
    kind: "buff",
    scope: "self",
    categories: [],
    providers: [
      {
        classId: "shaman",
        specs: [ENH],
        talent: { tree: "Enhancement", name: "Rage of the Farseer" },
      },
    ],
    forever: {
      status: "new",
      note: "New Enhancement talent: 30% attack speed for 25 sec, on the Shaman only, every 3 min. Build 1.60.1.69876 also sped up casting; build 1.60.1.70009 does not. This is not a raid-wide Bloodlust.",
    },
  },
];
