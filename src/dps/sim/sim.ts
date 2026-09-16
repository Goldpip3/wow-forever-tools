/**
 * The fight.
 *
 * One iteration is an event loop: ask the rotation what to do, put the cast's
 * landing on the queue, resolve it, ask again. Weapons swing on timers of their
 * own alongside all of that, which is the whole difference between a caster and
 * anyone holding an axe. A run is that iteration a thousand times over with a
 * different seed, which is what turns one noisy number into a mean with a
 * spread around it.
 */

import { SCHOOL_POWER } from '../export-format';
import * as K from '../data/combat-constants';
import { Actor } from './actor';
import { EventQueue } from './queue';
import { physicalMultiplier, resolveAttack, type SwingParams } from './melee';
import { rageFromDamage, rageFromDamageTaken } from './rage';
import { mulberry32, splitSeed, type Rng } from './rng';
import { applyTalents, type AbilityDef, type ResourceKind, type SpellMods } from './spells';
import type { SpecModule } from './spec';
import type { Rotation, RotationCtx } from './rotation';
import { resistMultiplier, rollSpell, spellCritChance, spellHitChance } from './tables';
import { emptyShard, emptyTally, finishShard, type Shard, type Tally } from './accumulate';
import { collectTrace, type TraceEvent, type TraceSink } from './trace';

export type { Shard };
import {
  AVOIDED,
  type Hand,
  type Outcome,
  type SimConfig,
  type SimResult,
  type TargetState,
} from './types';
import { targetStateFor } from './target';

/** Mana ticks on a two second heartbeat, the way the game does it. */
const MANA_TICK = 2;

/** How long to wait before looking again when there is nothing worth casting. */
const IDLE_POLL = 0.1;

/** The ids white swings are tallied under, which no spec declares itself. */
export const AUTO_ATTACK_ID: Record<Hand, string> = {
  main: 'auto-main',
  off: 'auto-off',
  ranged: 'auto-ranged',
};

type SimEvent =
  | { kind: 'decide' }
  | { kind: 'cast-finish'; spellId: string }
  | { kind: 'dot-tick'; spellId: string; snapshotPower: number; left: number; perTick?: number }
  | { kind: 'mana-tick' }
  | { kind: 'resource-tick' }
  | { kind: 'swing'; hand: Hand };

export interface IterationResult {
  damage: number;
  /** Seconds each aura spent up, player and target together. */
  auraUptime: Map<string, number>;
  abilities: Map<string, Tally>;
  idleTime: number;
  starvedTime: number;
  manaSpent: number;
  rageGained: number;
  energySpent: number;
  oomAt: number | null;
}

/** An ability with its talents already folded in, worked out once per run. */
interface ResolvedSpell {
  def: AbilityDef;
  castTime: number;
  gcd: number;
  cost: number;
  resource: ResourceKind;
  damageMultiplier: number;
  critMultiplier: number;
  critBonusPct: number;
  /** True for anything that reads a weapon rather than spell power. */
  physical: boolean;
}

function resolveSpells(spec: SpecModule, mods: SpellMods): Map<string, ResolvedSpell> {
  const out = new Map<string, ResolvedSpell>();
  const specResource: ResourceKind = spec.resource ?? 'mana';

  for (const def of spec.spells) {
    const shortened = def.castTime > 0
      ? Math.max(K.MIN_CAST_TIME.value, def.castTime + (mods.castTime[def.id] ?? 0))
      : 0;

    const physical = def.kind === 'melee' || def.kind === 'ranged';
    const damageMultiplier =
      (mods.damage[def.id] ?? 1) *
      (mods.schoolDamage[def.school] ?? 1) *
      (physical ? mods.physicalDamage : 1);

    const baseCrit = def.critMultiplier
      ?? (physical ? K.MELEE_CRIT_MULTIPLIER.value : K.SPELL_CRIT_MULTIPLIER.value);
    const critMultiplier =
      baseCrit + (mods.critBonus[def.school] ?? 0) + (physical ? mods.meleeCritBonus : 0);

    const scaled = def.cost * (mods.cost[def.id] ?? 1);
    const cost = Math.max(0, scaled - (mods.costFlat[def.id] ?? 0));

    out.set(def.id, {
      def,
      castTime: shortened,
      gcd: def.gcd ?? K.GLOBAL_COOLDOWN.value,
      cost,
      resource: def.resource ?? (physical ? specResource : def.kind === 'item' ? specResource : 'mana'),
      damageMultiplier,
      critMultiplier,
      critBonusPct: mods.spellCrit[def.school] ?? 0,
      physical,
    });
  }

  return out;
}

/* ------------------------------------------------------- once per run setup */

/**
 * Everything that depends on the configuration but not on the dice: the talent
 * mods, the resolved abilities, the rotation and the boss.
 *
 * This used to be rebuilt every iteration, which meant a thousand runs did the
 * same work a thousand times. Nothing here reads the random number generator,
 * so doing it once changes no answer.
 */
export interface Prepared {
  mods: SpellMods;
  spells: Map<string, ResolvedSpell>;
  rotation: Rotation;
  rotationName: string;
  target: TargetState;
  cheapest: Map<ResourceKind, number>;
}

export function prepare(config: SimConfig, spec: SpecModule): Prepared {
  const mods = applyTalents(spec.talentHooks, config.talents);

  const stance = spec.stance?.options.find((o) => o.id === config.fight.stance)
    ?? spec.stance?.options[0];
  stance?.mods(mods);

  spec.configure?.(config, mods);

  const spells = resolveSpells(spec, mods);
  const rotationName = config.rotation && spec.rotations[config.rotation]
    ? config.rotation
    : Object.keys(spec.rotations)[0]!;
  const rotation = spec.rotations[rotationName]!(config.talents);

  // The cheapest thing worth pressing in each bar, so an idle moment can be
  // told apart from an empty one.
  const cheapest = new Map<ResourceKind, number>();
  for (const spell of spells.values()) {
    if (spell.def.maxDamage <= 0 && !spell.def.weapon && !spell.def.apCoefficient) continue;
    const current = cheapest.get(spell.resource);
    if (current === undefined || spell.cost < current) cheapest.set(spell.resource, spell.cost);
  }

  return { mods, spells, rotation, rotationName, target: targetStateFor(config.fight), cheapest };
}

/* -------------------------------------------------------------- one fight */

export function runIteration(
  config: SimConfig,
  spec: SpecModule,
  seed: number,
  prepared: Prepared = prepare(config, spec),
  trace?: TraceSink,
): IterationResult {
  const { mods, spells, rotation, target } = prepared;

  const rng: Rng = mulberry32(seed);
  const { fight, stats } = config;
  const overrides = fight.overrides ?? {};
  const actor = new Actor(stats, overrides.infiniteMana === true, overrides.infiniteResource === true);
  actor.rage.max = K.RAGE_MAX.value + mods.bonusRage;
  spec.init?.(actor, config, mods);

  const regen = spec.manaRegen?.(stats, mods) ?? { per2s: 0, castingFraction: 0 };
  const targets = Math.max(1, Math.round(fight.targets ?? 1));
  const armed = actor.armedHands();
  const dualWield = !!actor.swings.main && !!actor.swings.off;

  const queue = new EventQueue<SimEvent>();
  queue.push(0, { kind: 'decide' });
  queue.push(MANA_TICK, { kind: 'mana-tick' });
  if (armed.length || spec.resource === 'energy' || fight.incoming) {
    queue.push(K.RESOURCE_TICK.value, { kind: 'resource-tick' });
  }
  for (const hand of armed) queue.push(actor.swings[hand]!.nextAt, { kind: 'swing', hand });

  const abilities = new Map<string, Tally>();
  const tally = (id: string): Tally => {
    let t = abilities.get(id);
    if (!t) {
      t = emptyTally();
      abilities.set(id, t);
    }
    return t;
  };

  let total = 0;

  /** Interval per bleed id, so its own ticks can reschedule themselves. */
  const BLEED_INTERVAL = new Map<string, number>();

  /**
   * A talent starting damage over time from a strike. The damage is worked out
   * now and carried on the event, because the weapon that caused it may be
   * swinging at something else by the time the last tick lands.
   */
  const bleedAt = (at: number) =>
    (id: string, whole: number, ticks: number, interval: number): void => {
      if (whole <= 0 || ticks <= 0 || interval <= 0) return;
      BLEED_INTERVAL.set(id, interval);
      queue.push(at + interval, {
        kind: 'dot-tick',
        spellId: id,
        snapshotPower: 0,
        left: ticks,
        perTick: (whole / ticks) * (target.damageTaken.physical ?? 1),
      });
    };

  const hasteNow = (now: number): number => spec.hasteFor?.(actor, now, mods) ?? 1;

  /** Haste may have moved; keep each swing's progress and re-time the rest. */
  const retime = (now: number): void => {
    if (!armed.length || !spec.hasteFor) return;
    actor.retimeSwings(now, hasteNow(now));
  };

  /** Damage for one landing of a spell, with the roll already made. */
  const damageOf = (spell: ResolvedSpell, outcome: Outcome, power: number, now: number): number => {
    if (outcome === 'miss') return 0;
    const roll = overrides.forceAverageDamage
      ? (spell.def.minDamage + spell.def.maxDamage) / 2
      : rng.between(spell.def.minDamage, spell.def.maxDamage);
    const live = spec.damageBonusFor?.(
      { spellId: spell.def.id, school: spell.def.school, actor, now, mods },
    ) ?? 1;
    let amount = (roll + power * spell.def.coefficient) * spell.damageMultiplier * live;
    if (outcome === 'crit') amount *= spell.critMultiplier;
    amount *= resistMultiplier(target.resistance, stats.level, target.level);
    return amount * (target.damageTaken[spell.def.school] ?? 1);
  };

  /** Spell power that reaches a school: the generic pool plus that school's own. */
  const powerFor = (spell: ResolvedSpell): number => {
    const key = SCHOOL_POWER[spell.def.school];
    return stats.spellPower + (key ? (stats[key] ?? 0) : 0);
  };

  const hitPctFor = (): number =>
    overrides.forceSpellHit !== undefined
      ? overrides.forceSpellHit * 100
      : spellHitChance(stats.level, target.level, stats.spellHit + mods.spellHit);

  const critPctFor = (spell: ResolvedSpell, now: number): number => {
    if (overrides.forceSpellCrit !== undefined) return overrides.forceSpellCrit * 100;
    const fromSpec =
      spec.critBonusFor?.({ spellId: spell.def.id, school: spell.def.school, actor, now, mods }) ?? 0;
    return spellCritChance(
      stats.spellCrit + spell.critBonusPct + fromSpec,
      stats.level,
      target.level,
    );
  };

  /** What an ability costs right now, after any proc that makes it free. */
  const costOf = (spell: ResolvedSpell, now: number): number =>
    spec.costFor
      ? Math.max(0, spec.costFor({ spellId: spell.def.id, baseCost: spell.cost, actor, now }))
      : spell.cost;

  const healthAt = (now: number): number => Math.max(0, 1 - now / fight.duration);

  /* ---------------------------------------------------------------- swings */

  const swingParams = (hand: Hand, now: number, aimed: boolean): SwingParams | null => {
    const weapon = stats.weapons[hand];
    if (!weapon) return null;
    const params: SwingParams = {
      weapon,
      hand,
      stats,
      target,
      hitBonus: mods.meleeHit + (hand === 'off' ? mods.offhandHit : 0),
      critBonus: mods.meleeCrit + (spec.critBonusFor
        ? spec.critBonusFor({ spellId: AUTO_ATTACK_ID[hand], school: 'physical', actor, now, mods })
        : 0),
      behind: fight.target.behind,
      canParry: fight.target.canParry,
      canBlock: fight.target.canBlock,
      dualWield: dualWield && !aimed,
    };
    if (overrides.forceMeleeTable) params.forced = overrides.forceMeleeTable;
    return params;
  };

  /**
   * One attack with a weapon, whether it came round on its own or was pressed.
   * Returns the damage so the caller can bill it to the right ability.
   */
  const strike = (
    hand: Hand,
    now: number,
    ability: ResolvedSpell | null,
    tallyId: string,
  ): number => {
    const params = swingParams(hand, now, ability !== null);
    if (!params) return 0;

    const t = tally(tallyId);
    // A swing that came round on its own is still a swing, and the casts column
    // is the only place the number of them can be read.
    if (ability === null) t.casts += 1;
    let dealt = 0;
    const reach = ability?.def.aoe ? Math.min(targets, ability.def.aoe.maxTargets) : 1;

    for (let i = 0; i < reach; i += 1) {
      const swing = resolveAttack(params, rng, ability?.def ?? null, overrides.forceAverageDamage);
      let amount = swing.amount;

      if (amount > 0) {
        amount *= ability?.damageMultiplier ?? mods.physicalDamage;
        amount *= spec.damageBonusFor?.(
          { spellId: ability?.def.id ?? AUTO_ATTACK_ID[hand], school: 'physical', actor, now, mods },
        ) ?? 1;
        if (hand === 'off') amount *= 0.5 * mods.offhandDamage;
        if (swing.outcome === 'crit') amount *= ability?.critMultiplier
          ?? (K.MELEE_CRIT_MULTIPLIER.value + mods.meleeCritBonus);
        amount *= physicalMultiplier(target, stats.level, mods.armorIgnored);
      }

      trace?.push({
        t: now,
        kind: 'swing',
        id: tallyId,
        amount: amount,
        outcome: swing.outcome,
      });

      if (swing.outcome === 'miss') t.misses += 1;
      else if (AVOIDED.has(swing.outcome)) t.avoided += 1;
      else {
        t.hits += 1;
        if (swing.outcome === 'crit') t.crits += 1;
        if (swing.outcome === 'glance') t.glances += 1;
        t.damage += amount;
        total += amount;
        dealt += amount;
      }

      // Rage is earned per swing, on the first target only: a cleave does not
      // pay out twice for one swing of the weapon.
      if (i === 0 && spec.resource === 'rage') {
        const earned = rageFromDamage(
          amount,
          params.weapon.speed,
          hand,
          swing.outcome === 'crit',
        ) * mods.rageFromDamage * (hand === 'off' ? mods.offhandRage : 1);
        if (earned > 0) actor.gain('rage', earned);
      }

      spec.onSwing?.({
        spellId: ability?.def.id ?? AUTO_ATTACK_ID[hand],
        school: 'physical',
        outcome: swing.outcome,
        amount,
        hand,
        white: ability === null,
        weapon: params.weapon,
        bleed: bleedAt(now),
        now,
        actor,
        rng,
        mods,
        stats,
      });
    }

    retime(now);
    return dealt;
  };

  const ctxFor = (now: number): RotationCtx => ({
    now,
    timeLeft: fight.duration - now,
    actor,
    fight,
    rng,
    rage: actor.rage.current,
    energy: actor.energy.current,
    comboPoints: actor.comboPoints,
    manaPct: actor.manaFraction(),
    targetHealthPct: healthAt(now),
    targets,
    has: (id) => actor.auras.has(id, now),
    stacks: (id) => actor.auras.stacks(id, now),
    remaining: (id) => actor.auras.remaining(id, now),
    onTarget: (id) => actor.targetAuras.has(id, now),
    targetStacks: (id) => actor.targetAuras.stacks(id, now),
    remainingOnTarget: (id) => actor.targetAuras.remaining(id, now),
    swingIn: (hand) => actor.swings[hand]?.remaining(now) ?? Infinity,
    queued: (hand) => actor.queuedSwing[hand] !== undefined,
    cooldownLeft: (spellId) => Math.max(0, actor.readyAt(spellId) - now),
    ready: (spellId) => {
      const spell = spells.get(spellId);
      if (!spell) return false;
      if (!actor.ready(spellId, now)) return false;
      if (spell.def.useBelowMana !== undefined && actor.manaFraction() > spell.def.useBelowMana) return false;
      if (spell.def.execute && healthAt(now) > spell.def.execute.belowPct) return false;
      // An ability that waits on a swing cannot be queued onto a hand that is
      // already holding one, and needs a weapon in that hand at all.
      if (spell.def.onNextSwing) {
        const hand = spell.def.weapon?.hand ?? 'main';
        if (!actor.swings[hand] || actor.queuedSwing[hand] !== undefined) return false;
      }
      return true;
    },
    canAfford: (spellId) => {
      const spell = spells.get(spellId);
      return !!spell && actor.canAfford(spell.resource, costOf(spell, now));
    },
  });

  let event = queue.pop();
  while (event && event.time <= fight.duration) {
    const now = event.time;
    const data = event.data;

    if (data.kind === 'mana-tick') {
      const casting = now - actor.lastSpendAt < 5;
      const fromSpirit = regen.per2s * (casting ? regen.castingFraction : 1);
      const fromGear = (stats.mp5 * MANA_TICK) / 5;
      actor.restore(fromSpirit + fromGear);
      if (trace && (spec.resource ?? 'mana') === 'mana') {
        trace.push({ t: now, kind: 'resource', id: 'mana', value: actor.mana });
      }
      queue.push(now + MANA_TICK, { kind: 'mana-tick' });
      event = queue.pop();
      continue;
    }

    if (data.kind === 'resource-tick') {
      const interval = K.RESOURCE_TICK.value;
      if (spec.resource === 'energy') actor.gain('energy', K.ENERGY_PER_TICK.value);
      if (spec.resource === 'rage' && fight.incoming?.damagePerSecond) {
        actor.gain('rage', rageFromDamageTaken(fight.incoming.damagePerSecond * interval));
      }
      spec.onResourceTick?.({ kind: spec.resource ?? 'mana', actor, now, mods });
      if (trace) {
        const bar = actor.resource(spec.resource ?? 'mana');
        trace.push({
          t: now,
          kind: 'resource',
          id: spec.resource ?? 'mana',
          value: bar ? bar.current : actor.mana,
        });
      }
      queue.push(now + interval, { kind: 'resource-tick' });
      event = queue.pop();
      continue;
    }

    if (data.kind === 'swing') {
      const timer = actor.swings[data.hand];
      if (!timer) {
        event = queue.pop();
        continue;
      }

      const queuedId = actor.queuedSwing[data.hand];
      if (queuedId !== undefined) {
        delete actor.queuedSwing[data.hand];
        const queued = spells.get(queuedId);
        // The rage is paid when the swing comes round, not when it was pressed,
        // which is why a queued strike can be cancelled by an empty bar.
        if (queued && actor.canAfford(queued.resource, costOf(queued, now))) {
          actor.spend(queued.resource, costOf(queued, now), now);
          tally(queued.def.id).casts += 1;
          spec.onCastStart?.({ spellId: queued.def.id, now, actor, rng, mods, stats });
          if (queued.def.cooldown) actor.startCooldown(queued.def.id, now, queued.def.cooldown);
          strike(data.hand, now, queued, queued.def.id);
        } else {
          strike(data.hand, now, null, AUTO_ATTACK_ID[data.hand]);
        }
      } else {
        strike(data.hand, now, null, AUTO_ATTACK_ID[data.hand]);
      }

      timer.advance(now);
      queue.push(timer.nextAt, { kind: 'swing', hand: data.hand });
      event = queue.pop();
      continue;
    }

    if (data.kind === 'cast-finish') {
      const spell = spells.get(data.spellId);
      if (spell) {
        if (spell.def.restoresMana) actor.restore(spell.def.restoresMana);
        if (spell.def.restoresManaPct) actor.restore(actor.maxMana * spell.def.restoresManaPct);
        if (spell.def.restoresResource) {
          actor.gain(spell.resource, spell.def.restoresResource);
        }

        spec.onCastFinish?.({ spellId: spell.def.id, now, actor, rng, mods, stats });

        if (spell.physical) {
          const hand = spell.def.weapon?.hand ?? 'main';
          strike(hand, now, spell, spell.def.id);
          for (const extra of spec.extraHandsFor?.(spell.def.id, mods, actor) ?? []) {
            if (extra !== hand && actor.swings[extra]) strike(extra, now, spell, spell.def.id);
          }
        } else if (spell.def.maxDamage > 0 || spell.def.coefficient > 0) {
          const reach = spell.def.aoe ? Math.min(targets, spell.def.aoe.maxTargets) : 1;
          for (let i = 0; i < reach; i += 1) {
            const outcome = rollSpell(hitPctFor(), critPctFor(spell, now), rng);
            const amount = damageOf(spell, outcome, powerFor(spell), now);
            const t = tally(spell.def.id);
            trace?.push({ t: now, kind: 'land', id: spell.def.id, amount, outcome });
            if (outcome === 'miss') t.misses += 1;
            else {
              t.hits += 1;
              if (outcome === 'crit') t.crits += 1;
              t.damage += amount;
              total += amount;
            }
            spec.onLand?.({
              spellId: spell.def.id,
              school: spell.def.school,
              outcome,
              amount,
              now,
              actor,
              rng,
              mods,
              stats,
            });
          }
        }

        if (spell.def.dot) {
          const dot = spell.def.dot;
          queue.push(now + dot.interval, {
            kind: 'dot-tick',
            spellId: spell.def.id,
            snapshotPower: powerFor(spell),
            left: dot.ticks,
          });
        }
      }
      event = queue.pop();
      continue;
    }

    if (data.kind === 'dot-tick') {
      // A bleed carries its own per-tick damage, worked out when it was applied,
      // because the strike that started it is long gone by the time it ticks.
      if (data.perTick !== undefined) {
        if (data.left > 0) {
          const t = tally(data.spellId);
          t.hits += 1;
          t.damage += data.perTick;
          total += data.perTick;
          if (data.left > 1) {
            queue.push(now + BLEED_INTERVAL.get(data.spellId)!, {
              kind: 'dot-tick',
              spellId: data.spellId,
              snapshotPower: data.snapshotPower,
              left: data.left - 1,
              perTick: data.perTick,
            });
          }
        }
        event = queue.pop();
        continue;
      }

      const spell = spells.get(data.spellId);
      const dot = spell?.def.dot;
      if (spell && dot && data.left > 0) {
        const perTick =
          (dot.damage / dot.ticks + (data.snapshotPower * dot.coefficient) / dot.ticks) * spell.damageMultiplier;
        const amount = perTick
          * resistMultiplier(target.resistance, stats.level, target.level)
          * (target.damageTaken[spell.def.school] ?? 1);
        const t = tally(spell.def.id + '-dot');
        t.hits += 1;
        t.damage += amount;
        total += amount;
        if (data.left > 1) {
          queue.push(now + dot.interval, {
            kind: 'dot-tick',
            spellId: data.spellId,
            snapshotPower: data.snapshotPower,
            left: data.left - 1,
          });
        }
      }
      event = queue.pop();
      continue;
    }

    // The fight is over; anything still queued to be decided is too late.
    if (now >= fight.duration) {
      event = queue.pop();
      continue;
    }

    const action = rotation(ctxFor(now));

    if (!action) {
      // Nothing to press is usually a cooldown; when even the cheapest thing is
      // out of reach it is the bar, and that is worth reporting.
      const bar = spec.resource ?? 'mana';
      const floor = prepared.cheapest.get(bar);
      if (floor !== undefined && !actor.canAfford(bar, floor)) {
        actor.starvedTime += IDLE_POLL;
        if (bar === 'mana' && actor.oomAt === null) actor.oomAt = now;
      }
      actor.idleTime += IDLE_POLL;
      queue.push(now + IDLE_POLL, { kind: 'decide' });
      event = queue.pop();
      continue;
    }

    if (action.kind === 'wait') {
      const until = Math.max(now + IDLE_POLL, action.until);
      actor.idleTime += until - now;
      queue.push(until, { kind: 'decide' });
      event = queue.pop();
      continue;
    }

    const spell = spells.get(action.spellId);
    if (!spell) {
      // A rotation asking for an ability the spec does not have is a bug, not a
      // fight event: skip a tenth of a second rather than spinning.
      queue.push(now + IDLE_POLL, { kind: 'decide' });
      event = queue.pop();
      continue;
    }

    // A cast that cannot land before the end never happens, so casts and
    // landings always agree and the damage total stays honest.
    if (now + spell.castTime > fight.duration) {
      actor.idleTime += fight.duration - now;
      event = queue.pop();
      continue;
    }

    // An on-next-swing ability is only queued here. It costs nothing until the
    // weapon comes round, and it does not use a global cooldown.
    if (spell.def.onNextSwing) {
      const hand = spell.def.weapon?.hand ?? 'main';
      actor.queuedSwing[hand] = spell.def.id;
      queue.push(now + IDLE_POLL, { kind: 'decide' });
      event = queue.pop();
      continue;
    }

    if (!actor.spend(spell.resource, costOf(spell, now), now)) {
      actor.idleTime += IDLE_POLL;
      actor.starvedTime += IDLE_POLL;
      queue.push(now + IDLE_POLL, { kind: 'decide' });
      event = queue.pop();
      continue;
    }

    tally(spell.def.id).casts += 1;
    trace?.push({ t: now, kind: 'cast', id: spell.def.id });
    spec.onCastStart?.({ spellId: spell.def.id, now, actor, rng, mods, stats });
    if (spell.def.cooldown) {
      actor.startCooldown(spell.def.id, now, spell.def.cooldown);
      trace?.push({ t: now, kind: 'cooldown', id: spell.def.id, value: spell.def.cooldown });
    }

    const finishAt = now + spell.castTime;
    actor.busyUntil = finishAt;
    actor.gcdReadyAt = now + spell.gcd;
    queue.push(finishAt, { kind: 'cast-finish', spellId: spell.def.id });
    queue.push(Math.max(finishAt, actor.gcdReadyAt), { kind: 'decide' });

    event = queue.pop();
  }

  actor.auras.closeAll(fight.duration);
  actor.targetAuras.closeAll(fight.duration);
  const auraUptime = actor.auras.uptimes();
  for (const [id, seconds] of actor.targetAuras.uptimes()) {
    auraUptime.set(id, (auraUptime.get(id) ?? 0) + seconds);
  }

  return {
    damage: total,
    auraUptime,
    abilities,
    idleTime: actor.idleTime,
    starvedTime: actor.starvedTime,
    manaSpent: actor.manaSpent,
    rageGained: actor.rage.gained,
    energySpent: actor.energy.spent,
    oomAt: actor.oomAt,
  };
}

/* --------------------------------------------------------------- slices */

export interface ShardOptions {
  onProgress?: (done: number, total: number) => void;
  /** How often to report, in iterations. */
  progressEvery?: number;
}

/**
 * Runs iterations [start, end) and hands them back as a slice.
 *
 * This is the only entry the worker pool needs: every other way of asking for
 * damage is a set of these put back together. Splitting is safe because
 * iteration i always uses splitSeed(seed, i), so a slice neither knows nor
 * cares whether anything else is running beside it.
 */
export function runShard(
  config: SimConfig,
  spec: SpecModule,
  start: number,
  end: number,
  opts: ShardOptions = {},
  prepared: Prepared = prepare(config, spec),
): Shard {
  const shard = emptyShard(start);
  const duration = config.fight.duration;
  const every = opts.progressEvery ?? 25;
  const total = end - start;

  for (let i = start; i < end; i += 1) {
    const result = runIteration(config, spec, splitSeed(config.fight.seed, i), prepared);
    shard.series.push(result.damage / duration);
    for (const [id, seconds] of result.auraUptime) {
      shard.auraUptime[id] = (shard.auraUptime[id] ?? 0) + seconds;
    }
    shard.idle += result.idleTime;
    shard.starved += result.starvedTime;
    shard.manaSpent += result.manaSpent;
    shard.rageGained += result.rageGained;
    shard.energySpent += result.energySpent;
    if (result.oomAt !== null) {
      shard.oomSum += result.oomAt;
      shard.oomCount += 1;
    }
    for (const [id, t] of result.abilities) {
      const running = shard.abilities[id] ?? emptyTally();
      running.casts += t.casts;
      running.hits += t.hits;
      running.crits += t.crits;
      running.misses += t.misses;
      running.avoided += t.avoided;
      running.glances += t.glances;
      running.damage += t.damage;
      shard.abilities[id] = running;
    }
    const done = i - start + 1;
    if (opts.onProgress && (done % every === 0 || done === total)) opts.onProgress(done, total);
  }

  return shard;
}

/**
 * One fight, written down as it happened.
 *
 * Given the seed of an iteration that already ran, this replays exactly that
 * fight: the same rolls in the same order, because the seed is the whole of the
 * randomness. That is why a result carries a seed rather than a list of events.
 */
export function traceIteration(config: SimConfig, spec: SpecModule, seed: number): TraceEvent[] {
  const events = collectTrace();
  runIteration(config, spec, seed, prepare(config, spec), events);
  return events;
}

/**
 * The damage per second of each iteration on its own.
 *
 * Stat weights lean on this: run the fight once with the stats as they are and
 * once with a stat nudged up, using the same seeds both times, and the paired
 * difference is far steadier than comparing two independent averages.
 */
export function dpsSeries(config: SimConfig, spec: SpecModule): number[] {
  const iterations = Math.max(1, Math.round(config.fight.iterations));
  return runShard(config, spec, 0, iterations).series;
}

/* ------------------------------------------------------------------- a run */

export interface SimProgress {
  done: number;
  total: number;
}

export interface SimOptions {
  onProgress?: (progress: SimProgress) => void;
  /** How often to report, in iterations. */
  progressEvery?: number;
}

export function simulate(config: SimConfig, spec: SpecModule, opts: SimOptions = {}): SimResult {
  const iterations = Math.max(1, Math.round(config.fight.iterations));
  const shardOpts: ShardOptions = {};
  if (opts.onProgress) shardOpts.onProgress = (done, total) => opts.onProgress!({ done, total });
  if (opts.progressEvery !== undefined) shardOpts.progressEvery = opts.progressEvery;

  return finishShard(runShard(config, spec, 0, iterations, shardOpts), config, spec);
}
