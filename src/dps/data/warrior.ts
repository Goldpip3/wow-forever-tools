/**
 * Warrior abilities and the talents that change them.
 *
 * Forever's warrior trees are not Classic's. Bloodthirst deals thirty-five per
 * cent of attack power plus thirty where Classic's dealt forty-five per cent,
 * Unbridled Wrath pays out at twelve per cent a rank rather than eight, Flurry
 * gives five per cent a rank rather than ten, and there are talents Classic
 * never had at all. Every hook below is keyed by the name in
 * public/data/talents.generated.json and cites the description it was read
 * from, because a Classic name would silently never fire.
 *
 * Where a talent's own text is the whole story the status is 'changed', because
 * the tree confirmed it. Where the data showed only the first rank and the rest
 * had to be scaled from it, the status says 'unverified' and the note names the
 * rank that was actually seen. The abilities the tree says nothing about are
 * their Classic level-sixty values, carried over the same way Frostbolt was.
 */

import type { AbilityDef, SpellMods, TalentHook } from '../sim/spells';
import { reduceCost } from '../sim/spells';

/* ---------------------------------------------------------------- numbers */

/** Rage generated instantly by Bloodrage, and the trickle after it. */
export const BLOODRAGE = { instant: 10, overTime: 10, duration: 10, cooldown: 60 };

export const DEATH_WISH = { damage: 0.2, duration: 30, cooldown: 180 };
export const RECKLESSNESS = { duration: 15, cooldown: 1800 };
export const FLURRY = { swings: 3, duration: 12, perRank: 0.05 };
export const ENRAGE = { duration: 12, perRank: 0.02, chance: 0.3 };
export const DEEP_WOUNDS = { ticks: 4, interval: 3, sharePerRank: 0.2 };

const changed = (note: string) => ({ status: 'changed' as const, note });
const classic = (note?: string) =>
  (note ? { status: 'unverified' as const, note } : { status: 'unverified' as const });

/* -------------------------------------------------------------- abilities */

/**
 * A strike that waits for the weapon to come round. It replaces the swing
 * rather than arriving alongside it, so its damage is the swing's damage plus
 * a flat amount and the rage is paid when the weapon lands.
 */
export const HEROIC_STRIKE: AbilityDef = {
  id: 'heroic-strike',
  name: 'Heroic Strike',
  icon: 'ability_rogue_ambush',
  school: 'physical',
  kind: 'melee',
  resource: 'rage',
  castTime: 0,
  gcd: 0,
  cost: 15,
  minDamage: 0,
  maxDamage: 0,
  coefficient: 0,
  onNextSwing: true,
  weapon: { hand: 'main', multiplier: 1, flat: 157, normalised: false },
  forever: classic('Rank 9 at the Classic 157 damage. The tree only speaks about its rage cost.'),
};

export const CLEAVE: AbilityDef = {
  id: 'cleave',
  name: 'Cleave',
  icon: 'ability_warrior_cleave',
  school: 'physical',
  kind: 'melee',
  resource: 'rage',
  castTime: 0,
  gcd: 0,
  cost: 20,
  minDamage: 0,
  maxDamage: 0,
  coefficient: 0,
  onNextSwing: true,
  aoe: { maxTargets: 2 },
  weapon: { hand: 'main', multiplier: 1, flat: 50, normalised: false },
  forever: classic('Rank 5 at the Classic 50 damage. The tree only speaks about its rage cost.'),
};

/**
 * Bloodthirst is one of the places Forever moved: the tree says thirty-five per
 * cent of attack power plus thirty, where Classic read forty-five per cent and
 * healed you. It is a single-rank talent, so this is the whole of it.
 */
export const BLOODTHIRST: AbilityDef = {
  id: 'bloodthirst',
  name: 'Bloodthirst',
  icon: 'spell_nature_bloodlust',
  school: 'physical',
  kind: 'melee',
  resource: 'rage',
  castTime: 0,
  cost: 30,
  cooldown: 6,
  minDamage: 0,
  maxDamage: 0,
  coefficient: 0,
  apCoefficient: 0.35,
  weapon: { hand: 'main', multiplier: 0, flat: 30, normalised: true },
  forever: changed(
    'Thirty-five per cent of attack power plus thirty, which is what the Fury tree says. ' +
      'Classic dealt forty-five per cent and restored health.',
  ),
};

/**
 * Mortal Strike's tooltip in the tree reads weapon damage plus eighty-five,
 * which is the rank the talent itself grants. Higher ranks come from a trainer
 * and Forever has published none of them, so this is the low end of it.
 */
export const MORTAL_STRIKE: AbilityDef = {
  id: 'mortal-strike',
  name: 'Mortal Strike',
  icon: 'ability_warrior_savageblow',
  school: 'physical',
  kind: 'melee',
  resource: 'rage',
  castTime: 0,
  cost: 30,
  cooldown: 6,
  minDamage: 0,
  maxDamage: 0,
  coefficient: 0,
  weapon: { hand: 'main', multiplier: 1, flat: 85, normalised: true },
  forever: changed(
    'Weapon damage plus eighty-five, which is the rank the talent grants. Forever has ' +
      'published no higher rank, so this understates a level sixty warrior.',
  ),
};

export const WHIRLWIND: AbilityDef = {
  id: 'whirlwind',
  name: 'Whirlwind',
  icon: 'ability_whirlwind',
  school: 'physical',
  kind: 'melee',
  resource: 'rage',
  castTime: 0,
  cost: 25,
  cooldown: 10,
  minDamage: 0,
  maxDamage: 0,
  coefficient: 0,
  aoe: { maxTargets: 4 },
  weapon: { hand: 'main', multiplier: 1, flat: 0, normalised: true },
  forever: classic('A full normalised swing at up to four things, the Classic behaviour.'),
};

export const EXECUTE: AbilityDef = {
  id: 'execute',
  name: 'Execute',
  icon: 'inv_sword_48',
  school: 'physical',
  kind: 'melee',
  resource: 'rage',
  castTime: 0,
  cost: 15,
  minDamage: 600,
  maxDamage: 600,
  coefficient: 0,
  execute: { belowPct: 0.2 },
  weapon: { hand: 'main', multiplier: 0, flat: 600, normalised: false },
  forever: classic(
    'Rank 7 at the Classic six hundred damage. Classic also turned every point of rage above ' +
      'fifteen into more damage, which is not modelled, so this understates it.',
  ),
};

export const SLAM: AbilityDef = {
  id: 'slam',
  name: 'Slam',
  icon: 'ability_warrior_decisivestrike',
  school: 'physical',
  kind: 'melee',
  resource: 'rage',
  castTime: 1.5,
  cost: 15,
  minDamage: 0,
  maxDamage: 0,
  coefficient: 0,
  weapon: { hand: 'main', multiplier: 1, flat: 87, normalised: false },
  forever: classic('Rank 6 at the Classic eighty-seven damage.'),
};

export const OVERPOWER: AbilityDef = {
  id: 'overpower',
  name: 'Overpower',
  icon: 'ability_meleedamage',
  school: 'physical',
  kind: 'melee',
  resource: 'rage',
  castTime: 0,
  cost: 5,
  cooldown: 5,
  minDamage: 0,
  maxDamage: 0,
  coefficient: 0,
  weapon: { hand: 'main', multiplier: 1, flat: 35, normalised: false },
  forever: classic(
    'Rank 4 at the Classic thirty-five damage. It can only be used after the target dodged, ' +
      'which no rotation here waits for.',
  ),
};

/**
 * Berserker Rage earns rage only once Improved Berserker Rage is taken, so the
 * amount comes from the talent rather than from the ability, and the rotation
 * leaves it alone when the talent is not there.
 */
export const BERSERKER_RAGE_SPELL: AbilityDef = {
  id: 'berserker-rage',
  name: 'Berserker Rage',
  icon: 'spell_nature_ancestralguardian',
  school: 'physical',
  kind: 'item',
  resource: 'rage',
  castTime: 0,
  cost: 0,
  cooldown: 30,
  minDamage: 0,
  maxDamage: 0,
  coefficient: 0,
  forever: changed(
    'Five rage a rank from Improved Berserker Rage, which is what the Fury tree says. ' +
      'Without that talent it earns nothing and the rotation skips it.',
  ),
};

export const BLOODRAGE_SPELL: AbilityDef = {
  id: 'bloodrage',
  name: 'Bloodrage',
  icon: 'ability_racial_bloodrage',
  school: 'physical',
  kind: 'item',
  resource: 'rage',
  castTime: 0,
  gcd: 0,
  cost: 0,
  cooldown: BLOODRAGE.cooldown,
  minDamage: 0,
  maxDamage: 0,
  coefficient: 0,
  restoresResource: BLOODRAGE.instant,
  forever: classic(
    'Ten rage at once and ten more over ten seconds. The trickle is handed over in full at ' +
      'the press, which is worth a little more than waiting for it.',
  ),
};

export const DEATH_WISH_SPELL: AbilityDef = {
  id: 'death-wish',
  name: 'Death Wish',
  icon: 'spell_shadow_deathpact',
  school: 'physical',
  kind: 'item',
  resource: 'rage',
  castTime: 0,
  cost: 10,
  cooldown: DEATH_WISH.cooldown,
  minDamage: 0,
  maxDamage: 0,
  coefficient: 0,
  forever: changed(
    'A fifth more physical damage for thirty seconds, and five per cent more damage taken. ' +
      'The cooldown is the Classic three minutes; the tree does not give one.',
  ),
};

export const RECKLESSNESS_SPELL: AbilityDef = {
  id: 'recklessness',
  name: 'Recklessness',
  icon: 'ability_criticalstrike',
  school: 'physical',
  kind: 'item',
  resource: 'rage',
  castTime: 0,
  cost: 0,
  cooldown: RECKLESSNESS.cooldown,
  minDamage: 0,
  maxDamage: 0,
  coefficient: 0,
  forever: classic(
    'Every strike a critical one for fifteen seconds, on a thirty minute cooldown, which is ' +
      'the Classic version. That means once a fight and never again.',
  ),
};

export const WARRIOR_ABILITIES: AbilityDef[] = [
  HEROIC_STRIKE,
  CLEAVE,
  BLOODTHIRST,
  MORTAL_STRIKE,
  WHIRLWIND,
  EXECUTE,
  SLAM,
  OVERPOWER,
  BERSERKER_RAGE_SPELL,
  BLOODRAGE_SPELL,
  DEATH_WISH_SPELL,
  RECKLESSNESS_SPELL,
];

/* ----------------------------------------------------------------- flags */

/** Flags the warrior spec modules read back out of the mods. */
export const WARRIOR_FLAGS = {
  flurryRank: 'flurryRank',
  unbridledChance: 'unbridledChance',
  unbridledTwoHanded: 'unbridledTwoHanded',
  deepWoundsShare: 'deepWoundsShare',
  angerManagement: 'angerManagement',
  swordSpecChance: 'swordSpecChance',
  bloodthrillChance: 'bloodthrillChance',
  improvedOverpowerCrit: 'improvedOverpowerCrit',
};

/* --------------------------------------------------------------- talents */

/**
 * Keyed by the talent name exactly as public/data/talents.generated.json spells
 * it. Anything not in this map is listed in the spec's unmodelled list instead,
 * so a build is never quietly worth more than the number says.
 */
export const WARRIOR_TALENT_HOOKS: Record<string, TalentHook> = {
  /* ---------------------------------------------------------------- Arms */

  // 'Reduces the cost of your Heroic Strike ability by 1 Rage.' at rank 1.
  'Improved Heroic Strike': (rank, mods) => {
    reduceCost(mods, HEROIC_STRIKE.id, rank);
  },

  // 'Increases the damage you deal with two-handed melee weapons by 1%.'
  'Two-Handed Weapon Specialization': (rank, mods) => {
    mods.flags.twoHandedDamage = 0.01 * rank;
  },

  // 'Increases the critical strike damage bonus of your abilities by 10%.'
  // The base bonus is the whole hit again, so a tenth of that is 0.1 each.
  Impale: (rank, mods) => {
    mods.meleeCritBonus += 0.1 * rank;
  },

  // 'Your critical strikes cause your opponent to Bleed, dealing 20% of your
  // melee weapon's average damage over 12 sec.'
  'Deep Wounds': (rank, mods) => {
    mods.flags[WARRIOR_FLAGS.deepWoundsShare] = DEEP_WOUNDS.sharePerRank * rank;
  },

  // 'Generates 1 Rage every 3 sec while in combat.'
  'Anger Management': (_rank, mods) => {
    mods.flags[WARRIOR_FLAGS.angerManagement] = 1 / 3;
  },

  // 'Increases the critical strike chance of your Overpower ability by 25%.'
  'Improved Overpower': (rank, mods) => {
    mods.flags[WARRIOR_FLAGS.improvedOverpowerCrit] = 25 * rank;
  },

  // 'Reduces the global cooldown and cast time of your Slam ability by 0.25 sec.'
  'Improved Slam': (rank, mods) => {
    mods.castTime[SLAM.id] = (mods.castTime[SLAM.id] ?? 0) - 0.25 * rank;
  },

  /**
   * 'Gives your melee weapon attacks a benefit depending on the weapon.
   * Axe/Polearm: critical strike chance by 1%. Mace/Staff: ignore 3% of armor.
   * Sword: 1% chance to trigger an extra attack.'
   *
   * Which branch applies depends on what is in your hand, so the rank is put
   * on a flag and the spec reads the weapon when the fight starts.
   */
  Weaponmaster: (rank, mods) => {
    mods.flags.weaponmasterRank = rank;
  },

  // 'Your melee attacks against targets afflicted by your Rend have a 2%
  // chance to activate your Overpower ability.' No rotation keeps Rend up.
  Bloodthrill: (rank, mods) => {
    mods.flags[WARRIOR_FLAGS.bloodthrillChance] = 0.02 * rank;
  },

  /* ---------------------------------------------------------------- Fury */

  // 'Increases your chance to get a critical strike with melee attacks by 1%.'
  Cruelty: (rank, mods) => {
    mods.meleeCrit += rank;
  },

  // 'Increases your chance to hit with all abilities and attacks by 1%.'
  Precision: (rank, mods) => {
    mods.meleeHit += rank;
  },

  /**
   * 'Gives you a 12% chance to generate 1 additional Rage when you deal melee
   * damage with a weapon. This effect is increased to 2 Rage for two-handed
   * weapons.' Twelve per cent at the first rank was all the data showed.
   */
  'Unbridled Wrath': (rank, mods) => {
    mods.flags[WARRIOR_FLAGS.unbridledChance] = 0.12 * rank;
  },

  // 'Increases your off-hand weapon damage by 5%, off-hand Rage generation by
  // 20%, and chance to hit with off-hand attacks by 2%.'
  'Dual Wield Specialization': (rank, mods) => {
    mods.offhandDamage *= 1 + 0.05 * rank;
    mods.offhandRage *= 1 + 0.2 * rank;
    mods.offhandHit += 2 * rank;
  },

  // 'Increases your melee attack speed by 5% for your next 3 swings after
  // dealing a melee critical strike.' Five per cent a rank was the first rank.
  Flurry: (rank, mods) => {
    mods.flags[WARRIOR_FLAGS.flurryRank] = rank;
  },

  // 'Increases your maximum Rage by 10.'
  'Boundless Rage': (rank, mods) => {
    mods.bonusRage += 10 * rank;
  },

  // 'Reduces the Rage cost of your Execute ability by 3.'
  'Improved Execute': (rank, mods) => {
    reduceCost(mods, EXECUTE.id, 3 * rank);
  },

  // 'Reduces the Rage cost of your Cleave ability by 1.'
  'Improved Cleave': (rank, mods) => {
    reduceCost(mods, CLEAVE.id, rank);
  },

  // 'Causes your Whirlwind to also strike with your off-hand weapon, and
  // reduces the Rage cost of your Cleave ability by 2.'
  'Raging Blows': (_rank, mods) => {
    mods.flags.ragingBlows = 1;
    reduceCost(mods, CLEAVE.id, 2);
  },

  // 'Gives you a 30% chance to deal 2% increased Physical damage for 12 sec
  // after being the victim of any damaging attack.'
  Enrage: (rank, mods) => {
    mods.flags.enrageRank = rank;
  },

  // 'Your Berserker Rage ability will instantly generate 5 Rage.'
  'Improved Berserker Rage': (rank, mods) => {
    mods.flags.berserkerRageRage = 5 * rank;
  },
};

/** How much more a two-handed weapon does, once the talent is in. */
export function twoHandedBonus(mods: SpellMods): number {
  return 1 + (mods.flags.twoHandedDamage ?? 0);
}

/** Whirlwind picks up the off hand when Raging Blows is taken. */
export function whirlwindHitsOffhand(mods: SpellMods): boolean {
  return (mods.flags.ragingBlows ?? 0) > 0;
}
