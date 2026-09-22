import type { Effect } from "../types";

const AFF = 302;
const DEMO = 303;
const DESTRO = 301;
const ANY = [AFF, DEMO, DESTRO];

/** One Curse per Warlock on a target. Banes look like their own family in Forever. */
const CURSE = { group: "warlock-curse", limit: 1 };
const BANE = { group: "warlock-bane", limit: 1 };
const PET = { group: "warlock-pet", limit: 1 };

export const WARLOCK_EFFECTS: Effect[] = [
  /* ------------------------------------------------------------------ curses */
  {
    id: "curse-of-the-elements",
    name: "Curse of the Elements",
    icon: "spell_shadow_chilltouch",
    kind: "debuff",
    scope: "target",
    categories: [
      "increased-fire-damage-taken",
      "increased-frost-damage-taken",
      "reduced-fire-resistance",
      "reduced-frost-resistance",
    ],
    providers: [{ classId: "warlock", specs: ANY, choice: CURSE }],
    forever: {
      status: "changed",
      note: "It was Fire and Frost only: 60 resistance and 8% damage. It is all Magic schools now, 75 resistance and 10% damage, so it helps shadow and nature casters too.",
    },
  },
  {
    id: "curse-of-shadow",
    name: "Curse of Shadow",
    icon: "spell_shadow_curseofachimonde",
    kind: "debuff",
    scope: "target",
    categories: [
      "increased-shadow-damage-taken",
      "increased-arcane-damage-taken",
      "reduced-shadow-resistance",
      "reduced-arcane-resistance",
    ],
    providers: [{ classId: "warlock", specs: ANY, choice: CURSE }],
    forever: {
      status: "unverified",
      note: "Not in the beta client spellbook at build 1.60.1.69876. Curse of the Elements covers all Magic schools now, which would make this one redundant.",
    },
  },
  /*
   * Curse of Recklessness is not tracked: it raises the target's attack power and stops it
   * fleeing. On a raid boss that is a downside for the tanks, so nobody casts it, and it
   * would cost the Warlock the one curse slot that Elements or Shadow wants.
   */
  /*
   * Curse of Weakness is not tracked, for the same reason as Expose Armor. It does not
   * stack with Demoralizing Shout, every raid has warriors shouting, and casting it costs
   * the Warlock the curse slot that Elements or Shadow wants. Listing it put a gap on the
   * page for something no raid assigns.
   */
  {
    id: "curse-of-tongues",
    name: "Curse of Tongues",
    icon: "spell_shadow_curseoftounges",
    kind: "debuff",
    scope: "target",
    categories: ["reduced-casting-speed"],
    providers: [{ classId: "warlock", specs: ANY, choice: CURSE }],
    forever: { status: "same" },
  },
  /* A raid boss cannot be slowed, so this is not a debuff the raid covers. Kept as
       utility, which is what it is for: adds, runners and anything that flees. */
  {
    id: "curse-of-exhaustion",
    name: "Curse of Exhaustion",
    icon: "spell_shadow_grimward",
    kind: "list",
    scope: "self",
    categories: ["misc-utility"],
    providers: [
      {
        classId: "warlock",
        specs: [AFF],
        talent: { tree: "Affliction", name: "Curse of Exhaustion" },
        choice: CURSE,
      },
    ],
    forever: {
      status: "changed",
      note: "A talent in its own right now, 30% slower for 12 sec. Improved Curse of Exhaustion was cut.",
    },
  },

  /* ------------------------------------------------------------------- banes */
  {
    id: "bane-of-havoc",
    name: "Bane of Havoc",
    icon: "spell_shadow_shadowfury",
    kind: "debuff",
    scope: "target",
    categories: ["misc-utility"],
    providers: [
      {
        classId: "warlock",
        specs: [DESTRO],
        talent: { tree: "Destruction", name: "Bane of Havoc" },
        choice: BANE,
      },
    ],
    forever: {
      status: "new",
      note: "New Destruction talent. 15% of your damage to other targets also hits the cursed one.",
    },
  },

  /* -------------------------------------------------------------------- pets */
  {
    id: "blood-pact",
    name: "Blood Pact",
    icon: "spell_shadow_burningspirit",
    kind: "buff",
    scope: "party",
    categories: ["stamina"],
    providers: [{ classId: "warlock", specs: ANY, pet: "imp", choice: PET }],
    forever: {
      status: "changed",
      note: "Improved Imp now adds 10% per rank to the Imp Fire Shield as well.",
    },
  },
  {
    id: "paranoia",
    name: "Paranoia",
    icon: "spell_shadow_auraofdarkness",
    kind: "list",
    scope: "party",
    categories: ["misc-utility"],
    providers: [
      { classId: "warlock", specs: ANY, pet: "felhunter", choice: PET },
    ],
    forever: {
      status: "changed",
      note: "Improved Felhunter, a new Demonology talent, raises its detection level by 10% per rank.",
    },
  },
  {
    id: "spell-lock",
    name: "Spell Lock",
    icon: "spell_shadow_mindrot",
    kind: "other",
    scope: "self",
    categories: ["interrupts", "silences"],
    providers: [
      { classId: "warlock", specs: ANY, pet: "felhunter", choice: PET },
    ],
    forever: {
      status: "changed",
      note: "Improved Felhunter cuts its cooldown by up to 2 sec.",
    },
  },
  {
    id: "devour-magic",
    name: "Devour Magic",
    icon: "spell_nature_purge",
    kind: "other",
    scope: "self",
    categories: ["offensive-magic-dispels", "friendly-magic-dispels"],
    providers: [
      { classId: "warlock", specs: ANY, pet: "felhunter", choice: PET },
    ],
    forever: {
      status: "changed",
      note: "Improved Felhunter now also raises its healing by 10% per rank.",
    },
  },
  {
    id: "tainted-blood",
    name: "Tainted Blood",
    icon: "spell_shadow_lifedrain02",
    kind: "debuff",
    scope: "target",
    categories: ["reduced-melee-attack-power"],
    debuffSlots: 0,
    providers: [
      { classId: "warlock", specs: ANY, pet: "felhunter", choice: PET },
    ],
    forever: {
      status: "changed",
      note: "Improved Felhunter raises its attack power reduction by 10% per rank.",
    },
  },
  {
    id: "seduction",
    name: "Seduction",
    icon: "spell_shadow_mindsteal",
    kind: "list",
    scope: "self",
    categories: ["out-of-combat-cc"],
    providers: [
      { classId: "warlock", specs: ANY, pet: "succubus", choice: PET },
    ],
    forever: {
      status: "changed",
      note: "The Incubus is a new male counterpart with its own summon, and Improved Sayaad covers both.",
    },
  },

  /* ----------------------------------------------------------------- utility */
  {
    id: "soulstone",
    name: "Create Soulstone",
    icon: "inv_misc_orb_04",
    kind: "other",
    scope: "self",
    categories: ["battle-resurrections"],
    providers: [{ classId: "warlock", specs: ANY }],
    forever: { status: "same" },
  },
  {
    id: "ritual-of-summoning",
    name: "Ritual of Summoning",
    icon: "spell_shadow_twilight",
    kind: "list",
    scope: "self",
    categories: ["misc-utility"],
    providers: [{ classId: "warlock", specs: ANY }],
    forever: { status: "same" },
  },
  {
    id: "healthstone",
    name: "Create Healthstone",
    icon: "inv_stone_04",
    kind: "list",
    scope: "self",
    categories: ["misc-utility"],
    providers: [{ classId: "warlock", specs: ANY }],
    forever: {
      status: "changed",
      note: "Improved Healthstone was cut from the Demonology tree.",
    },
  },
  {
    id: "banish",
    name: "Banish",
    icon: "spell_shadow_cripple",
    kind: "list",
    scope: "self",
    categories: ["out-of-combat-cc"],
    providers: [{ classId: "warlock", specs: ANY }],
    forever: { status: "same" },
  },
  {
    id: "fear-warlock",
    name: "Fear",
    icon: "spell_shadow_possession",
    kind: "list",
    scope: "self",
    categories: ["in-combat-cc"],
    providers: [{ classId: "warlock", specs: ANY }],
    forever: { status: "same" },
  },
  {
    id: "subjugate-demon",
    name: "Subjugate Demon",
    icon: "spell_shadow_enslavedemon",
    kind: "list",
    scope: "self",
    categories: ["misc-utility"],
    providers: [{ classId: "warlock", specs: ANY }],
    forever: {
      status: "changed",
      note: "Enslave Demon renamed. Improved Subjugate Demon was cut from the Demonology tree.",
    },
  },
  {
    id: "improved-shadow-bolt",
    name: "Improved Shadow Bolt",
    icon: "spell_shadow_shadowbolt",
    kind: "buff",
    scope: "self",
    categories: [],
    providers: [
      {
        classId: "warlock",
        specs: [DESTRO],
        talent: { tree: "Destruction", name: "Improved Shadow Bolt" },
      },
    ],
    forever: {
      status: "changed",
      note: "Forever raises shadow damage the target takes from your attacks only, so it no longer helps other shadow casters.",
    },
  },
];
