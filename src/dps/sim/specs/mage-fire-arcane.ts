/**
 * Fire and Arcane Mage.
 *
 * Both share the mana handling Frost has, and most of the Arcane tree, so they
 * are built from one function and differ in spells, rotation and the talents
 * that only one of them reads. Frost stays in its own file so its pinned answer
 * cannot move.
 *
 * Several talents here change a cast after it has been chosen: Hot Streak and
 * Presence of Mind make it faster, Missile Barrage halves a channel, Arcane
 * Blast's stacks are spent by the next spell. The engine asks how fast a cast
 * goes after the cast has started, so each of those is decided at the start
 * and remembered for that one cast.
 */

import { spiritRegenPer2s } from '../../data/conversions';
import {
  CLEARCASTING_DURATION,
  EVOCATION,
  MAGE_ARMOR_REGEN,
  MANA_GEM_AMOUNT,
  MANA_POTION_AMOUNT,
} from '../../data/mage';
import {
  ARCANE_BLAST,
  ARCANE_POWER,
  ARCANE_SPELLS,
  ARCANE_TALENT_HOOKS,
  BASE_COST,
  COMBUSTION,
  DAMAGE_SPELLS,
  FIRE_BLAST_COOLDOWN,
  FIRE_SPELLS,
  FIRE_TALENT_HOOKS,
  HOT_STREAK,
  IGNITE,
  IMPROVED_SCORCH,
  MISSILE_BARRAGE,
  castingRegen,
} from '../../data/mage-fire-arcane';
import type { PriorityEntry } from '../rotation';
import type { SpecModule } from '../spec';
import type { SpellDef, TalentHook } from '../spells';

export const MAGE_AURAS = {
  clearcasting: 'clearcasting',
  fireVulnerability: 'fire-vulnerability',
  hotStreak: 'hot-streak',
  combustion: 'combustion',
  arcaneBlast: 'arcane-blast',
  missileBarrage: 'missile-barrage',
  arcanePower: 'arcane-power',
  presenceOfMind: 'presence-of-mind',
};

/** Where Ignite's burning is billed. */
export const IGNITE_ID = 'ignite';

/** Spells with a cast time Presence of Mind can make instant. */
const CAST_SPELLS = new Set(['fireball', 'scorch', 'pyroblast', 'arcane-blast']);
const HOT_STREAK_SPELLS = new Set(['fireball', 'fire-blast', 'scorch']);
const INCINERATION_SPELLS = new Set(['fire-blast', 'scorch', 'arcane-blast']);

/**
 * What was decided when the cast in progress started. Casts never overlap, so
 * one of these is enough; it is cleared at the start of every iteration.
 */
const thisCast = { spellId: '', speed: 1, blastStacks: 0, combustionCrits: 0 };

/** The mana lines Frost uses, so every mage handles mana the same way. */
const manaLines = (): PriorityEntry[] => [
  {
    spellId: 'evocation',
    when: (ctx) => ctx.timeLeft > EVOCATION.duration + 4,
    text: 'time_left > ' + (EVOCATION.duration + 4),
  },
  {
    spellId: 'mana-gem',
    when: (ctx) => ctx.actor.maxMana - ctx.actor.mana > MANA_GEM_AMOUNT,
    text: 'mana_pct < 0.75',
  },
  {
    spellId: 'mana-potion',
    when: (ctx) => ctx.actor.maxMana - ctx.actor.mana > MANA_POTION_AMOUNT,
    text: 'mana_pct < 0.7',
  },
];

interface MageParts {
  specId: number;
  label: string;
  spells: SpellDef[];
  hooks: Record<string, TalentHook>;
  rotation: (talents: Record<string, number>) => PriorityEntry[];
  rotationLabel: string;
  schoolPower: 'firePower' | 'arcanePower';
  unmodelled: Record<string, string>;
  partly?: Record<string, string>;
  notes: string[];
}

function mageSpec(parts: MageParts): SpecModule {
  return {
    specId: parts.specId,
    label: parts.label,
    spells: parts.spells,
    resource: 'mana',
    buffRole: 'caster',
    talentHooks: parts.hooks,
    referenceStat: 'spellPower',

    rotations: { standard: parts.rotation },
    rotationLabels: { standard: parts.rotationLabel },

    weightStats: [
      { stat: 'spellPower', step: 50 },
      { stat: parts.schoolPower, step: 50 },
      { stat: 'spellCrit', step: 2 },
      { stat: 'spellHit', step: 2 },
      { stat: 'intellect', step: 50 },
      { stat: 'spirit', step: 50 },
      { stat: 'mp5', step: 10 },
    ],

    configure: (config, mods) => {
      if (config.fight.buffs.includes('mage-armor')) mods.flags.spiritWhileCasting = MAGE_ARMOR_REGEN;
    },

    init: () => {
      thisCast.spellId = '';
      thisCast.speed = 1;
      thisCast.blastStacks = 0;
      thisCast.combustionCrits = 0;
    },

    manaRegen: (stats, mods) => ({
      per2s: spiritRegenPer2s('mage', stats.spirit),
      castingFraction: castingRegen(mods),
    }),

    /**
     * Clearcasting and Missile Barrage make a spell free, Arcane Blast costs
     * more for every stack it already has, and Arcane Power costs more on
     * everything while it lasts.
     */
    costFor: ({ spellId, baseCost, actor, now }) => {
      if (!DAMAGE_SPELLS.has(spellId)) return baseCost;
      if (actor.auras.has(MAGE_AURAS.clearcasting, now)) return 0;
      if (spellId === 'arcane-missiles' && actor.auras.has(MAGE_AURAS.missileBarrage, now)) return 0;
      let cost = baseCost;
      if (spellId === 'arcane-blast') {
        cost *= 1 + ARCANE_BLAST.costPerStack * actor.auras.stacks(MAGE_AURAS.arcaneBlast, now);
      }
      if (actor.auras.has(MAGE_AURAS.arcanePower, now)) cost *= 1 + ARCANE_POWER.cost;
      return cost;
    },

    castSpeedFor: (_actor, _now, _mods, spellId) => (spellId === thisCast.spellId ? thisCast.speed : 1),

    onCastStart: ({ spellId, actor, now, mods }) => {
      if (spellId === 'arcane-power') {
        actor.auras.apply(MAGE_AURAS.arcanePower, now, { duration: ARCANE_POWER.duration });
      }
      if (spellId === 'presence-of-mind') {
        actor.auras.apply(MAGE_AURAS.presenceOfMind, now, { duration: 3600 });
      }
      if (spellId === 'combustion') {
        actor.auras.apply(MAGE_AURAS.combustion, now, { duration: 3600, maxStacks: 100, stacks: 0 });
        thisCast.combustionCrits = 0;
      }
      if (spellId === 'fire-blast') {
        actor.startCooldown(spellId, now, FIRE_BLAST_COOLDOWN - (mods.flags.fireBlastCooldownOff ?? 0));
      }
      if (!DAMAGE_SPELLS.has(spellId)) return;

      // Everything below is decided for this cast alone.
      thisCast.spellId = spellId;
      thisCast.speed = 1;
      thisCast.blastStacks = 0;

      actor.auras.consume(MAGE_AURAS.clearcasting, now);

      if (spellId === 'pyroblast') {
        const stacks = actor.auras.stacks(MAGE_AURAS.hotStreak, now);
        if (stacks > 0) {
          thisCast.speed = 1 / Math.max(0.01, 1 - HOT_STREAK.perStack * stacks);
          actor.auras.consume(MAGE_AURAS.hotStreak, now, stacks);
        }
      }
      if (spellId === 'arcane-missiles' && actor.auras.has(MAGE_AURAS.missileBarrage, now)) {
        thisCast.speed = MISSILE_BARRAGE.speed;
        actor.auras.consume(MAGE_AURAS.missileBarrage, now);
      }
      if (CAST_SPELLS.has(spellId) && actor.auras.has(MAGE_AURAS.presenceOfMind, now)) {
        thisCast.speed = 1000;
        actor.auras.consume(MAGE_AURAS.presenceOfMind, now);
      }

      // Arcane Blast's stacks go to the next other spell, and then they are gone.
      if (spellId !== 'arcane-blast') {
        thisCast.blastStacks = actor.auras.stacks(MAGE_AURAS.arcaneBlast, now);
        if (thisCast.blastStacks > 0) actor.auras.consume(MAGE_AURAS.arcaneBlast, now, thisCast.blastStacks);
      }
    },

    critBonusFor: ({ spellId, school, actor, now, mods }) => {
      let bonus = 0;
      if (INCINERATION_SPELLS.has(spellId)) bonus += mods.flags.incineration ?? 0;
      if (school === 'fire') bonus += COMBUSTION.perHit * actor.auras.stacks(MAGE_AURAS.combustion, now);
      return bonus;
    },

    damageBonusFor: ({ spellId, school, actor, now }) => {
      let bonus = 1;
      if (school === 'fire') {
        bonus *= 1 + IMPROVED_SCORCH.perStack * actor.targetAuras.stacks(MAGE_AURAS.fireVulnerability, now);
      }
      if (actor.auras.has(MAGE_AURAS.arcanePower, now)) bonus *= 1 + ARCANE_POWER.damage;
      if (spellId === thisCast.spellId && spellId !== 'arcane-blast') {
        bonus *= 1 + ARCANE_BLAST.perStack * thisCast.blastStacks;
      }
      return bonus;
    },

    onCastFinish: ({ spellId, actor, stats }) => {
      if (spellId !== 'evocation') return;
      const per2s = spiritRegenPer2s('mage', stats.spirit);
      actor.restore(per2s * EVOCATION.multiplier * EVOCATION.ticks);
    },

    onLand: ({ spellId, school, outcome, amount, actor, rng, now, mods, bleed }) => {
      if (outcome === 'miss') return;
      const crit = outcome === 'crit';

      if (crit && school === 'fire') {
        const ignite = mods.flags.ignite ?? 0;
        if (ignite > 0) bleed?.(IGNITE_ID, amount * ignite, IGNITE.ticks, IGNITE.interval, 'fire');
        const refund = mods.flags.masterOfElements ?? 0;
        if (refund > 0) actor.restore((BASE_COST[spellId] ?? 0) * refund);
      }

      if (mods.flags.hotStreak && crit && HOT_STREAK_SPELLS.has(spellId)) {
        actor.auras.apply(MAGE_AURAS.hotStreak, now, { duration: HOT_STREAK.duration, maxStacks: HOT_STREAK.stacks });
      }

      if (spellId === 'scorch') {
        const chance = mods.flags.improvedScorch ?? 0;
        if (chance > 0 && rng.chance(chance)) {
          actor.targetAuras.apply(MAGE_AURAS.fireVulnerability, now, {
            duration: IMPROVED_SCORCH.duration, maxStacks: IMPROVED_SCORCH.stacks,
          });
        }
      }

      // Combustion counts Fire hits up and stops after four critical strikes.
      if (school === 'fire' && actor.auras.has(MAGE_AURAS.combustion, now)) {
        if (crit) thisCast.combustionCrits += 1;
        if (thisCast.combustionCrits >= COMBUSTION.crits) {
          actor.auras.remove(MAGE_AURAS.combustion, now);
        } else {
          actor.auras.apply(MAGE_AURAS.combustion, now, { duration: 3600, maxStacks: 100 });
        }
      }

      if (spellId === 'arcane-blast') {
        actor.auras.apply(MAGE_AURAS.arcaneBlast, now, { duration: ARCANE_BLAST.duration, maxStacks: ARCANE_BLAST.stacks });
      }

      if (mods.flags.missileBarrage) {
        const chance = spellId === 'arcane-blast' ? MISSILE_BARRAGE.fromBlast
          : spellId === 'fireball' ? MISSILE_BARRAGE.fromBolts : 0;
        if (chance > 0 && rng.chance(chance)) {
          actor.auras.apply(MAGE_AURAS.missileBarrage, now, { duration: MISSILE_BARRAGE.duration });
        }
      }

      const clearcasting = mods.flags.clearcastingChance ?? 0;
      if (clearcasting > 0 && DAMAGE_SPELLS.has(spellId) && rng.chance(clearcasting)) {
        actor.auras.apply(MAGE_AURAS.clearcasting, now, { duration: CLEARCASTING_DURATION });
      }
    },

    extraNames: { [IGNITE_ID]: 'Ignite' },

    forever: {
      status: 'unverified',
      note:
        'Forever rebuilt the Fire and Arcane trees, so the talents here are read from their own ' +
        'text. The spells are Classic level-sixty ranks, because the trees only show the rank a ' +
        'talent teaches.',
    },

    unmodelledTalents: parts.unmodelled,
    partlyModelledTalents: parts.partly,
    notes: parts.notes,
  };
}

/* ------------------------------------------------------ what neither reads */

const NEITHER: Record<string, string> = {
  'Wand Specialization': 'a wand is not in any rotation.',
  'Improved Channeling': 'nothing here interrupts a cast.',
  'Arcane Subtlety': 'the boss has no resistance to take off unless you set one, and this is not counted against it.',
  'Magic Absorption': 'nothing here casts at you.',
  'Arcane Resilience': 'armor does nothing to damage.',
  'Arcane Geometry': 'range does nothing to damage.',
  'Arcane Shielding': 'Mana Shield is not in any rotation.',
  'Improved Counterspell': 'Counterspell is not in any rotation.',
  'Flame Throwing': 'range does nothing to damage.',
  Impact: 'a stun does nothing to a boss.',
  'Burning Soul': 'nothing here interrupts a cast.',
  'Improved Flamestrike': 'Flamestrike is not in any rotation.',
  'Improved Fire Ward': 'nothing here casts Fire at you.',
  'Frost Warding': 'nothing here casts at you.',
  'Improved Frostbolt': 'Frostbolt is not in this rotation.',
  'Ice Shards': 'no Frost spell is in this rotation.',
  Permafrost: 'a slow does nothing to a boss.',
  'Improved Frost Nova': 'Frost Nova is not in any rotation.',
  Frostbite: 'a boss cannot be frozen.',
  'Piercing Ice': 'no Frost spell is in this rotation.',
  'Frost Channeling': 'no Frost spell is in this rotation.',
  'Ice Lance': 'only its first rank is known, so no rotation casts it.',
  'Improved Blizzard': 'Blizzard is not in any rotation.',
  'Arctic Reach': 'range does nothing to damage.',
  'Ice Block': 'it stops you casting.',
  Shatter: 'a boss cannot be frozen, and Fingers of Frost needs Frostbolt.',
  'Improved Cone of Cold': 'Cone of Cold is not in any rotation.',
  'Cold Snap': 'no Frost cooldown is in this rotation.',
  'Fingers of Frost': 'it needs Frostbolt, which is not in this rotation.',
  "Winter's Chill": 'no Frost spell is in this rotation.',
  'Ice Barrier': 'it absorbs damage, and nothing hits you.',
};

const FIRE_ONLY: Record<string, string> = {
  'Wake of Fire': 'Fire Blast is not in the Arcane rotation.',
  'Improved Fireball': 'Fireball is not in the Arcane rotation.',
  Ignite: 'the Arcane rotation casts no Fire spells.',
  Pyroblast: 'it is not in the Arcane rotation.',
  'Improved Scorch': 'Scorch is not in the Arcane rotation.',
  'Hot Streak': 'the Arcane rotation casts no Fire spells.',
  'Critical Mass': 'the Arcane rotation casts no Fire spells.',
  'Blast Wave': 'it is not in the Arcane rotation.',
  'Fire Power': 'the Arcane rotation casts no Fire spells.',
  Combustion: 'the Arcane rotation casts no Fire spells.',
  'Elemental Precision': 'it only helps Fire and Frost spells, and Arcane casts neither.',
  'Master of Elements': 'it only refunds Fire and Frost spells, and Arcane casts neither.',
};

const ARCANE_ONLY: Record<string, string> = {
  'Arcane Focus': 'it only helps Arcane spells, and Fire casts none.',
  'Arcane Impact': 'it only helps Arcane spells, and Fire casts none.',
  'Arcane Blast': 'it is not in the Fire rotation.',
  'Missile Barrage': 'Arcane Missiles is not in the Fire rotation.',
  'Arcane Power': 'it is a button the Fire rotation does not press.',
  'Presence of Mind': 'it is a button the Fire rotation does not press.',
  'Arcane Mind': 'its critical bonus is for Arcane spells, and Fire casts none; the intellect is on your sheet already.',
};

const COMMON_NOTES = [
  'Mage Armor is only counted when it is ticked in the buff list.',
  'The simulated player never hesitates between casts, which is worth a few per cent more ' +
    'than anyone actually manages.',
];

/* ------------------------------------------------------------------ Fire */

const fireHooks = { ...FIRE_TALENT_HOOKS };
for (const name of Object.keys(ARCANE_ONLY)) delete fireHooks[name];

export const mageFire: SpecModule = mageSpec({
  specId: 41,
  label: 'Fire Mage',
  spells: FIRE_SPELLS,
  hooks: fireHooks,
  schoolPower: 'firePower',
  rotationLabel: 'Fireball, with Scorch keeping the target vulnerable and Pyroblast on a full Hot Streak',
  rotation: (talents) => [
    ...manaLines(),
    {
      spellId: 'combustion',
      when: (ctx) => (talents.Combustion ?? 0) > 0 && ctx.timeLeft > 20,
      text: 'talent.combustion and time_left > 20',
    },
    {
      spellId: 'scorch',
      when: (ctx) => (talents['Improved Scorch'] ?? 0) > 0
        && (ctx.targetStacks(MAGE_AURAS.fireVulnerability) < IMPROVED_SCORCH.stacks
          || ctx.remainingOnTarget(MAGE_AURAS.fireVulnerability) < 5),
      text: 'talent.improved-scorch and (debuff.fire-vulnerability.stacks < 5 or debuff.fire-vulnerability.remains < 5)',
    },
    {
      spellId: 'pyroblast',
      when: (ctx) => (talents.Pyroblast ?? 0) > 0 && ctx.stacks(MAGE_AURAS.hotStreak) >= HOT_STREAK.stacks,
      text: 'talent.pyroblast and buff.hot-streak.stacks >= 3',
    },
    {
      spellId: 'blast-wave',
      when: (ctx) => (talents['Blast Wave'] ?? 0) > 0 && ctx.targets > 1,
      text: 'talent.blast-wave and targets > 1',
    },
    {
      spellId: 'fire-blast',
      when: (ctx) => ctx.manaPct > 0.5,
      text: 'mana_pct > 0.5',
    },
    { spellId: 'fireball' },
  ],
  unmodelled: { ...NEITHER, ...ARCANE_ONLY },
  notes: [
    'Ignite burns for each critical strike on its own. In Classic a second critical strike ' +
      'rolled into the first, which this neither gains nor loses much by.',
    ...COMMON_NOTES,
  ],
});

/* ---------------------------------------------------------------- Arcane */

const arcaneHooks = { ...ARCANE_TALENT_HOOKS };
for (const name of Object.keys(FIRE_ONLY)) delete arcaneHooks[name];

export const mageArcane: SpecModule = mageSpec({
  specId: 81,
  label: 'Arcane Mage',
  spells: ARCANE_SPELLS,
  hooks: arcaneHooks,
  schoolPower: 'arcanePower',
  rotationLabel: 'Arcane Missiles, sped up by Missile Barrage, with Arcane Power on cooldown',
  rotation: (talents) => [
    ...manaLines(),
    {
      spellId: 'arcane-power',
      when: (ctx) => (talents['Arcane Power'] ?? 0) > 0 && ctx.timeLeft > 15,
      text: 'talent.arcane-power and time_left > 15',
    },
    {
      spellId: 'arcane-missiles',
      when: (ctx) => ctx.has(MAGE_AURAS.missileBarrage),
      text: 'buff.missile-barrage.up',
    },
    { spellId: 'arcane-missiles' },
  ],
  unmodelled: { ...NEITHER, ...FIRE_ONLY },
  partly: {
    'Arcane Mind': 'its Arcane critical bonus is modelled; the intellect is on your sheet already, and new intellect is not scaled by it.',
  },
  notes: [
    'Arcane Blast is not in the rotation. At the one rank known it hits for about a hundred, ' +
      'and with what it adds to Arcane Missiles and the Missile Barrage it sets off, it comes out ' +
      'about even with casting Missiles alone. It can be added in the rotation editor, where its ' +
      'stacks, rising cost and Missile Barrage chance all count.',
    'Arcane Missiles lands all five missiles when the channel ends rather than one a second.',
    ...COMMON_NOTES,
  ],
});
