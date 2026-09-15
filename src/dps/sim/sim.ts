/**
 * The fight.
 *
 * One iteration is an event loop: ask the rotation what to do, put the cast's
 * landing on the queue, resolve it, ask again. A run is that iteration a
 * thousand times over with a different seed, which is what turns one noisy
 * number into a mean with a spread around it.
 */

import { SCHOOL_POWER } from '../export-format';
import * as K from '../data/combat-constants';
import { Actor } from './actor';
import { EventQueue } from './queue';
import { mulberry32, splitSeed, type Rng } from './rng';
import { applyTalents, type SpellDef, type SpellMods } from './spells';
import type { SpecModule } from './spec';
import type { RotationCtx } from './rotation';
import { resistMultiplier, rollSpell, spellCritChance, spellHitChance } from './tables';
import type { AbilityStats, Outcome, SimConfig, SimResult } from './types';

/** Mana ticks on a two second heartbeat, the way the game does it. */
const MANA_TICK = 2;

/** How long to wait before looking again when there is nothing worth casting. */
const IDLE_POLL = 0.1;

type SimEvent =
  | { kind: 'decide' }
  | { kind: 'cast-finish'; spellId: string }
  | { kind: 'dot-tick'; spellId: string; snapshotPower: number; left: number }
  | { kind: 'mana-tick' };

interface Tally {
  casts: number;
  hits: number;
  crits: number;
  misses: number;
  damage: number;
}

export interface IterationResult {
  damage: number;
  abilities: Map<string, Tally>;
  idleTime: number;
  manaSpent: number;
  oomAt: number | null;
}

/** A spell with its talents already folded in, worked out once per run. */
interface ResolvedSpell {
  def: SpellDef;
  castTime: number;
  gcd: number;
  cost: number;
  damageMultiplier: number;
  critMultiplier: number;
  critBonusPct: number;
}

function resolveSpells(spec: SpecModule, mods: SpellMods): Map<string, ResolvedSpell> {
  const out = new Map<string, ResolvedSpell>();

  for (const def of spec.spells) {
    const shortened = def.castTime > 0
      ? Math.max(K.MIN_CAST_TIME.value, def.castTime + (mods.castTime[def.id] ?? 0))
      : 0;

    const damageMultiplier = (mods.damage[def.id] ?? 1) * (mods.schoolDamage[def.school] ?? 1);
    const critMultiplier =
      (def.critMultiplier ?? K.SPELL_CRIT_MULTIPLIER.value) + (mods.critBonus[def.school] ?? 0);

    out.set(def.id, {
      def,
      castTime: shortened,
      gcd: def.gcd ?? K.GLOBAL_COOLDOWN.value,
      cost: Math.max(0, def.cost * (mods.cost[def.id] ?? 1)),
      damageMultiplier,
      critMultiplier,
      critBonusPct: mods.spellCrit[def.school] ?? 0,
    });
  }

  return out;
}

function emptyTally(): Tally {
  return { casts: 0, hits: 0, crits: 0, misses: 0, damage: 0 };
}

/* -------------------------------------------------------------- one fight */

export function runIteration(config: SimConfig, spec: SpecModule, seed: number): IterationResult {
  const mods = applyTalents(spec.talentHooks, config.talents);
  const spells = resolveSpells(spec, mods);
  const rotationName = config.rotation && spec.rotations[config.rotation] ? config.rotation : Object.keys(spec.rotations)[0]!;
  const rotation = spec.rotations[rotationName]!(config.talents);

  const rng: Rng = mulberry32(seed);
  const { fight, stats } = config;
  const overrides = fight.overrides ?? {};
  const actor = new Actor(stats, overrides.infiniteMana === true);
  spec.init?.(actor, config, mods);

  const regen = spec.manaRegen?.(stats, mods) ?? { per2s: 0, castingFraction: 0 };

  const queue = new EventQueue<SimEvent>();
  queue.push(0, { kind: 'decide' });
  queue.push(MANA_TICK, { kind: 'mana-tick' });

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

  // The cheapest thing worth casting, so an idle moment can be told apart from
  // an empty mana bar.
  const cheapestCost = Math.min(
    ...[...spells.values()].filter((s) => s.def.maxDamage > 0).map((s) => s.cost),
    Infinity,
  );

  /** Damage for one landing of a spell, with the roll already made. */
  const damageOf = (spell: ResolvedSpell, outcome: Outcome, power: number): number => {
    if (outcome === 'miss') return 0;
    const roll = overrides.forceAverageDamage
      ? (spell.def.minDamage + spell.def.maxDamage) / 2
      : rng.between(spell.def.minDamage, spell.def.maxDamage);
    let amount = (roll + power * spell.def.coefficient) * spell.damageMultiplier;
    if (outcome === 'crit') amount *= spell.critMultiplier;
    return amount * resistMultiplier(fight.target.resistance, stats.level, fight.target.level);
  };

  /** Spell power that reaches a school: the generic pool plus that school's own. */
  const powerFor = (spell: ResolvedSpell): number => {
    const key = SCHOOL_POWER[spell.def.school];
    return stats.spellPower + (key ? (stats[key] ?? 0) : 0);
  };

  const hitPctFor = (): number =>
    overrides.forceSpellHit !== undefined
      ? overrides.forceSpellHit * 100
      : spellHitChance(stats.level, fight.target.level, stats.spellHit + mods.spellHit);

  const critPctFor = (spell: ResolvedSpell, now: number): number => {
    if (overrides.forceSpellCrit !== undefined) return overrides.forceSpellCrit * 100;
    const fromSpec =
      spec.critBonusFor?.({ spellId: spell.def.id, school: spell.def.school, actor, now, mods }) ?? 0;
    return spellCritChance(
      stats.spellCrit + spell.critBonusPct + fromSpec,
      stats.level,
      fight.target.level,
    );
  };

  /** What a cast costs right now, after any proc that makes it free. */
  const costOf = (spell: ResolvedSpell, now: number): number =>
    spec.costFor
      ? Math.max(0, spec.costFor({ spellId: spell.def.id, baseCost: spell.cost, actor, now }))
      : spell.cost;

  const ctxFor = (now: number): RotationCtx => ({
    now,
    timeLeft: fight.duration - now,
    actor,
    fight,
    rng,
    has: (id) => actor.auras.has(id, now),
    stacks: (id) => actor.auras.stacks(id, now),
    onTarget: (id) => actor.targetAuras.has(id, now),
    targetStacks: (id) => actor.targetAuras.stacks(id, now),
    remainingOnTarget: (id) => actor.targetAuras.remaining(id, now),
    ready: (spellId) => {
      const spell = spells.get(spellId);
      if (!spell) return false;
      if (!actor.ready(spellId, now)) return false;
      if (spell.def.useBelowMana !== undefined && actor.manaFraction() > spell.def.useBelowMana) return false;
      return true;
    },
    canAfford: (spellId) => {
      const spell = spells.get(spellId);
      return !!spell && actor.canPay(costOf(spell, now));
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
      queue.push(now + MANA_TICK, { kind: 'mana-tick' });
      event = queue.pop();
      continue;
    }

    if (data.kind === 'cast-finish') {
      const spell = spells.get(data.spellId);
      if (spell) {
        if (spell.def.restoresMana) actor.restore(spell.def.restoresMana);
        if (spell.def.restoresManaPct) actor.restore(actor.maxMana * spell.def.restoresManaPct);

        spec.onCastFinish?.({ spellId: spell.def.id, now, actor, rng, mods, stats });

        if (spell.def.maxDamage > 0 || spell.def.coefficient > 0) {
          const outcome = rollSpell(hitPctFor(), critPctFor(spell, now), rng);
          const amount = damageOf(spell, outcome, powerFor(spell));
          const t = tally(spell.def.id);
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
      const spell = spells.get(data.spellId);
      const dot = spell?.def.dot;
      if (spell && dot && data.left > 0) {
        const perTick =
          (dot.damage / dot.ticks + (data.snapshotPower * dot.coefficient) / dot.ticks) * spell.damageMultiplier;
        const amount = perTick * resistMultiplier(fight.target.resistance, stats.level, fight.target.level);
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
      // Nothing to cast is usually a cooldown; when even the cheapest spell is
      // out of reach it is the mana bar, and that is worth reporting.
      if (actor.oomAt === null && !actor.canPay(cheapestCost)) actor.oomAt = now;
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
      // A rotation asking for a spell the spec does not have is a bug, not a
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

    if (!actor.pay(costOf(spell, now), now)) {
      actor.idleTime += IDLE_POLL;
      queue.push(now + IDLE_POLL, { kind: 'decide' });
      event = queue.pop();
      continue;
    }

    tally(spell.def.id).casts += 1;
    spec.onCastStart?.({ spellId: spell.def.id, now, actor, rng, mods, stats });
    if (spell.def.cooldown) actor.startCooldown(spell.def.id, now, spell.def.cooldown);

    const finishAt = now + spell.castTime;
    actor.busyUntil = finishAt;
    actor.gcdReadyAt = now + spell.gcd;
    queue.push(finishAt, { kind: 'cast-finish', spellId: spell.def.id });
    queue.push(Math.max(finishAt, actor.gcdReadyAt), { kind: 'decide' });

    event = queue.pop();
  }

  return {
    damage: total,
    abilities,
    idleTime: actor.idleTime,
    manaSpent: actor.manaSpent,
    oomAt: actor.oomAt,
  };
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
  const out: number[] = new Array(iterations);
  for (let i = 0; i < iterations; i += 1) {
    out[i] = runIteration(config, spec, splitSeed(config.fight.seed, i)).damage / config.fight.duration;
  }
  return out;
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
  const duration = config.fight.duration;
  const every = opts.progressEvery ?? 50;

  const perIteration: number[] = [];
  const totals = new Map<string, Tally>();
  let idle = 0;
  let manaSpent = 0;
  let oomSum = 0;
  let oomCount = 0;

  for (let i = 0; i < iterations; i += 1) {
    const result = runIteration(config, spec, splitSeed(config.fight.seed, i));
    perIteration.push(result.damage / duration);
    idle += result.idleTime;
    manaSpent += result.manaSpent;
    if (result.oomAt !== null) {
      oomSum += result.oomAt;
      oomCount += 1;
    }
    for (const [id, t] of result.abilities) {
      const running = totals.get(id) ?? emptyTally();
      running.casts += t.casts;
      running.hits += t.hits;
      running.crits += t.crits;
      running.misses += t.misses;
      running.damage += t.damage;
      totals.set(id, running);
    }
    if (opts.onProgress && (i % every === every - 1 || i === iterations - 1)) {
      opts.onProgress({ done: i + 1, total: iterations });
    }
  }

  const mean = perIteration.reduce((sum, n) => sum + n, 0) / iterations;
  const variance =
    iterations > 1
      ? perIteration.reduce((sum, n) => sum + (n - mean) ** 2, 0) / (iterations - 1)
      : 0;
  const stdev = Math.sqrt(variance);

  const totalDamage = [...totals.values()].reduce((sum, t) => sum + t.damage, 0);
  const names = new Map(spec.spells.map((s) => [s.id, s.name]));

  const abilities: AbilityStats[] = [...totals.entries()]
    .map(([id, t]) => ({
      id,
      name: names.get(id) ?? names.get(id.replace(/-dot$/, '')) ?? id,
      casts: t.casts / iterations,
      hits: t.hits / iterations,
      crits: t.crits / iterations,
      misses: t.misses / iterations,
      damage: t.damage / iterations,
      dps: t.damage / iterations / duration,
      share: totalDamage > 0 ? t.damage / totalDamage : 0,
    }))
    .filter((a) => a.casts > 0 || a.damage > 0)
    .sort((a, b) => b.damage - a.damage);

  const notes = [K.BASELINE_NOTE, ...(spec.notes ?? [])];
  if (spec.forever.note) notes.push(spec.forever.note);

  const resources: SimResult['resources'] = {
    timeIdle: idle / iterations,
    manaSpent: manaSpent / iterations,
  };
  if (oomCount > 0) resources.oomAt = oomSum / oomCount;

  return {
    dps: mean,
    dpsStdev: stdev,
    dpsStderr: stdev / Math.sqrt(iterations),
    iterations,
    duration,
    abilities,
    resources,
    notes,
  };
}
