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
import { priorityRotation, type PriorityEntry, type Rotation, type RotationCtx } from './rotation';
import { condition } from './apl';
import type { RotationLine } from './rotation';
import { resistMultiplier, rollSpell, spellCritChance, spellHitChance } from './tables';
import { emptyShard, emptyTally, finishShard, type Shard, type Tally } from './accumulate';
import { EffectRuntime, type EffectFired } from './effects';
import { collectTrace, type TraceEvent, type TraceSink } from './trace';

export type { Shard };
import {
  AVOIDED,
  type Hand,
  type School,
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
/** Where extra attacks are billed, so they do not inflate the count of swings. */
export const EXTRA_ATTACK_ID = 'extra-attack';

export const AUTO_ATTACK_ID: Record<Hand, string> = {
  main: 'auto-main',
  off: 'auto-off',
  ranged: 'auto-ranged',
};

type SimEvent =
  | { kind: 'decide' }
  | { kind: 'cast-finish'; spellId: string }
  | { kind: 'dot-tick'; spellId: string; snapshotPower: number; left: number; perTick?: number; generation?: number }
  | { kind: 'mana-tick' }
  | { kind: 'resource-tick' }
  | { kind: 'swing'; hand: Hand; version: number }
  | { kind: 'effect-expire'; auraId: string }
  | { kind: 'move'; moving: boolean };

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
    // A cast shortened to nothing or less becomes instant, which is what a
    // talent like Instrument of Law says outright. Anything short of that is
    // held at the floor, the way Improved Frostbolt always has been.
    const after = def.castTime + (mods.castTime[def.id] ?? 0);
    const shortened = def.castTime > 0 && after > 0
      ? Math.max(K.MIN_CAST_TIME.value, after)
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

/**
 * Turns written lines into a priority list.
 *
 * A line that will not read is left out rather than thrown, because a rotation
 * is edited a character at a time and half-typed text should not stop the run
 * that is already going. The editor reports the error; the engine skips it.
 */
function compileLines(lines: RotationLine[], talents: Record<string, number>): PriorityEntry[] {
  const out: PriorityEntry[] = [];
  for (const line of lines) {
    if (!line.text?.trim()) {
      out.push({ spellId: line.spellId });
      continue;
    }
    try {
      out.push({ spellId: line.spellId, when: condition(line.text, { talents }), text: line.text });
    } catch {
      continue;
    }
  }
  return out;
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

  // A rotation somebody wrote themselves replaces the spec's, and its
  // conditions are compiled here rather than read every time round the loop.
  const entries = config.apl?.length
    ? compileLines(config.apl, config.talents)
    : spec.rotations[rotationName]!(config.talents);
  const rotation = priorityRotation(entries);

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
  // A form can put something other than the weapon on the end of the arm.
  const weapons = spec.weaponsFor?.(stats) ?? stats.weapons;

  const regen = spec.manaRegen?.(stats, mods) ?? { per2s: 0, castingFraction: 0 };
  const effects = new EffectRuntime(config.effects ?? []);
  const style = fight.style ?? { kind: 'patchwerk' as const };
  const targets = Math.max(
    1,
    Math.round(style.kind === 'cleave' ? style.targets : fight.targets ?? 1),
  );
  const armed = actor.armedHands();
  const dualWield = !!actor.swings.main && !!actor.swings.off;

  const queue = new EventQueue<SimEvent>();
  queue.push(0, { kind: 'decide' });
  queue.push(MANA_TICK, { kind: 'mana-tick' });
  if (armed.length || spec.resource === 'energy' || fight.incoming) {
    queue.push(K.RESOURCE_TICK.value, { kind: 'resource-tick' });
  }
  // The version each hand's queued swing was made for. A timer that moved
  // since then has its old event ignored and a new one queued.
  const queuedVersion: Partial<Record<Hand, number>> = {};
  const syncSwings = (now: number): void => {
    for (const hand of armed) {
      const timer = actor.swings[hand]!;
      if (queuedVersion[hand] === timer.version) continue;
      queuedVersion[hand] = timer.version;
      queue.push(Math.max(now, timer.nextAt), { kind: 'swing', hand, version: timer.version });
    }
  };
  syncSwings(0);
  if (style.kind === 'movement' && style.every > 0 && style.for > 0) {
    queue.push(style.every, { kind: 'move', moving: true });
  }

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
    (id: string, whole: number, ticks: number, interval: number, school: School = 'physical'): void => {
      if (whole <= 0 || ticks <= 0 || interval <= 0) return;
      BLEED_INTERVAL.set(id, interval);
      const resist = school === 'physical' ? 1 : resistMultiplier(target.resistance, stats.level, target.level);
      queue.push(at + interval, {
        kind: 'dot-tick',
        spellId: id,
        snapshotPower: 0,
        left: ticks,
        perTick: (whole / ticks) * (target.damageTaken[school] ?? 1) * resist,
      });
    };

  /**
   * A spell's own damage over time replaces what it left before rather than
   * running beside it, so each cast bumps a generation and older ticks stop.
   */
  const DOT_GENERATION = new Map<string, number>();

  /**
   * An effect went off. Damage lands now and is billed to the item, and an aura
   * gets a real expiry event, because the stats it added have to come back off
   * rather than be noticed as gone on the next read.
   */
  const settle = (fired: EffectFired[], now_: number): void => {
    for (const one of fired) {
      if (one.expiresAt !== undefined && one.auraId) {
        queue.push(one.expiresAt, { kind: 'effect-expire', auraId: one.auraId });
      }
      for (let n = 0; n < (one.extraAttacks ?? 0); n += 1) extraAttack(now_, 0, EXTRA_ATTACK_ID);
      if (one.damage) {
        const amount = one.damage.amount * (target.damageTaken.physical ?? 1);
        const t = tally(one.damage.id);
        t.casts += 1;
        t.hits += 1;
        t.damage += amount;
        total += amount;
      }
    }
  };

  const hasteNow = (now: number): number => spec.hasteFor?.(actor, now, mods) ?? 1;

  /** Haste may have moved; keep each swing's progress and re-time the rest. */
  const retime = (now: number): void => {
    if (!armed.length || !spec.hasteFor) return;
    actor.retimeSwings(now, hasteNow(now));
    syncSwings(now);
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
  // Read through the actor rather than the sheet: a trinket that is up has to
  // count, and it is not on the sheet because it was not up when it was built.
  const powerFor = (spell: ResolvedSpell): number => {
    const key = SCHOOL_POWER[spell.def.school];
    return actor.statAt('spellPower') + (key ? actor.statAt(key) : 0);
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

  const swingParams = (hand: Hand, now: number, aimed: boolean, spellId: string): SwingParams | null => {
    const weapon = weapons[hand];
    if (!weapon) return null;
    const params: SwingParams = {
      weapon,
      hand,
      stats,
      attackPower: actor.statAt(hand === 'ranged' ? 'rangedAttackPower' : 'attackPower'),
      target,
      hitBonus: mods.meleeHit + (hand === 'off' ? mods.offhandHit : 0),
      hitLive: actor.statAt('hit') - stats.hit,
      critLive: actor.statAt('crit') - stats.crit,
      critBonus: mods.meleeCrit + (spec.critBonusFor
        ? spec.critBonusFor({ spellId, school: 'physical', actor, now, mods })
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
    points = 0,
  ): number => {
    const params = swingParams(hand, now, ability !== null, ability?.def.id ?? AUTO_ATTACK_ID[hand]);
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

      // A finisher is worth what it spent, so the points go in before anything
      // that multiplies, which is what makes a critical strike count them too.
      // It is gated on the swing connecting rather than on the weapon part
      // being worth something: Eviscerate reads no weapon damage at all, so
      // testing the amount would leave it dealing nothing.
      const scale = ability?.def.comboDamage;
      if (scale && points > 0 && !AVOIDED.has(swing.outcome)) {
        const rolled = overrides.forceAverageDamage
          ? (scale.min + scale.max) / 2
          : rng.between(scale.min, scale.max);
        amount += (rolled + actor.statAt('attackPower') * (scale.apCoefficient ?? 0)) * points;
      }

      if (amount > 0) {
        amount *= ability?.damageMultiplier ?? mods.physicalDamage;
        amount *= spec.damageBonusFor?.(
          { spellId: ability?.def.id ?? AUTO_ATTACK_ID[hand], school: ability?.def.school ?? 'physical', actor, now, mods },
        ) ?? 1;
        if (hand === 'off') amount *= 0.5 * mods.offhandDamage;
        if (swing.outcome === 'crit') amount *= ability?.critMultiplier
          ?? (K.MELEE_CRIT_MULTIPLIER.value + mods.meleeCritBonus);
        // A shot of another school, such as Arcane Shot, goes past armor and
        // meets the target's resistance instead.
        const school = ability?.def.school ?? 'physical';
        amount *= school === 'physical'
          ? physicalMultiplier(target, stats.level, mods.armorIgnored)
          : resistMultiplier(target.resistance, stats.level, target.level) * (target.damageTaken[school] ?? 1);
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

      if (effects.any && !AVOIDED.has(swing.outcome)) {
        const fired = effects.onTrigger(
          swing.outcome === 'crit' ? 'melee-crit' : 'melee-hit',
          now, actor, rng, params.weapon, hand,
        );
        settle(fired, now);
        retime(now);
      }

      const earns = ability?.def.combo?.generates ?? 0;
      if (earns > 0 && i === 0 && !AVOIDED.has(swing.outcome)) {
        actor.addCombo(earns, K.COMBO_POINT_MAX.value);
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
        extraAttack: (bonus = 0, id = EXTRA_ATTACK_ID) => extraAttack(now, bonus, id),
        procDamage: (id, amount, school) => procDamage(now, id, amount, school),
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

  /**
   * One more swing of the main hand, straight away, which is what Windfury, a
   * sword that swings twice and Hand of Justice all are.
   *
   * It cannot set off another one. In Classic an extra attack from Windfury
   * could not proc Windfury, and letting any of them chain would turn a small
   * chance into an occasional runaway that no player has ever seen.
   */
  /**
   * Damage a swing sets off that is not a swing: Seal of Command's holy strike.
   * It rolls for a critical strike at the character's melee chance and takes
   * the target's resistance to that school rather than its armor, because it
   * is magic riding on a weapon rather than the weapon itself.
   */
  function procDamage(now: number, id: string, base: number, school: School): void {
    if (base <= 0) return;
    const critPct = actor.statAt('crit') + mods.meleeCrit + (spec.critBonusFor?.(
      { spellId: id, school, actor, now, mods },
    ) ?? 0);
    const crit = rng.chance(Math.max(0, Math.min(100, critPct)) / 100);
    let amount = base * (mods.schoolDamage[school] ?? 1) * (target.damageTaken[school] ?? 1);
    amount *= spec.damageBonusFor?.({ spellId: id, school, actor, now, mods }) ?? 1;
    if (crit) amount *= K.MELEE_CRIT_MULTIPLIER.value + mods.meleeCritBonus;
    if (school !== 'physical') amount *= resistMultiplier(target.resistance, stats.level, target.level);
    else amount *= physicalMultiplier(target, stats.level, mods.armorIgnored);

    const t = tally(id);
    t.casts += 1;
    t.hits += 1;
    if (crit) t.crits += 1;
    t.damage += amount;
    total += amount;
    trace?.push({ t: now, kind: 'land', id, amount, outcome: crit ? 'crit' : 'hit' });
  }

  let extraDepth = 0;
  function extraAttack(now: number, bonusAttackPower: number, id: string): void {
    if (extraDepth > 0 || !actor.swings.main) return;
    extraDepth = 1;
    const bonus = { attackPower: bonusAttackPower };
    if (bonusAttackPower) actor.addBonus(bonus, 1);
    strike('main', now, null, id);
    if (bonusAttackPower) actor.addBonus(bonus, -1);
    extraDepth = 0;
  }

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
      if (spell.def.fromBehind && !fight.target.behind) return false;
      // Pressing a finisher with nothing banked spends a global on nothing.
      if (spell.def.combo?.spends && actor.comboPoints <= 0) return false;
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
      spec.onResourceTick?.({ kind: spec.resource ?? 'mana', actor, now, rng, mods });
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

    if (data.kind === 'move') {
      const moving = style.kind === 'movement' ? style : null;
      if (moving) {
        if (data.moving) {
          actor.movingUntil = now + moving.for;
          queue.push(now + moving.for, { kind: 'move', moving: false });
        } else {
          queue.push(now + moving.every, { kind: 'move', moving: true });
        }
      }
      event = queue.pop();
      continue;
    }

    if (data.kind === 'effect-expire') {
      effects.expire(data.auraId, now, actor);
      retime(now);
      event = queue.pop();
      continue;
    }

    if (data.kind === 'swing') {
      const timer = actor.swings[data.hand];
      if (!timer || data.version !== timer.version) {
        event = queue.pop();
        continue;
      }

      // Out of range of the boss, so the swing waits rather than missing.
      if (actor.movingUntil > now) {
        actor.idleTime += Math.min(actor.movingUntil, fight.duration) - now;
        queue.push(actor.movingUntil, { kind: 'swing', hand: data.hand, version: data.version });
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

      // A strike can have moved this timer itself; advancing puts it back in
      // step with the swing that just landed.
      timer.advance(now);
      queuedVersion[data.hand] = timer.version;
      queue.push(timer.nextAt, { kind: 'swing', hand: data.hand, version: timer.version });
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
        syncSwings(now);

        if (spell.physical) {
          const hand = spell.def.weapon?.hand ?? 'main';
          // A finisher spends what was banked, whether or not the strike lands,
          // which is what the game does and what the rotation plans around.
          const points = spell.def.combo?.spends ? actor.spendCombo() : 0;
          strike(hand, now, spell, spell.def.id, points);
          for (const extra of spec.extraHandsFor?.(spell.def.id, mods, actor) ?? []) {
            if (extra !== hand && actor.swings[extra]) strike(extra, now, spell, spell.def.id);
          }
        } else if (spell.def.maxDamage > 0 || spell.def.coefficient > 0) {
          const reach = spell.def.aoe ? Math.min(targets, spell.def.aoe.maxTargets) : 1;
          // A channel that deals damage, such as Arcane Missiles, is that many
          // separate hits, each rolled on its own. They are resolved together
          // when the channel ends.
          const pieces = spell.def.channel ? spell.def.channel.ticks : 1;
          for (let i = 0; i < reach * pieces; i += 1) {
            const outcome = rollSpell(hitPctFor(), critPctFor(spell, now), rng);
            const amount = damageOf(spell, outcome, powerFor(spell), now)
              * (spell.def.aoe?.falloff ?? 1) ** Math.floor(i / pieces) / pieces;
            const t = tally(spell.def.id);
            let echoed = false;
            trace?.push({ t: now, kind: 'land', id: spell.def.id, amount, outcome });
            if (outcome === 'miss') t.misses += 1;
            else {
              t.hits += 1;
              if (outcome === 'crit') t.crits += 1;
              t.damage += amount;
              total += amount;
            }
            if (effects.any && outcome !== 'miss') {
              const fired = effects.onTrigger('spell-hit', now, actor, rng, undefined, 'main');
              settle(fired, now);
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
              bleed: bleedAt(now),
              // A second copy of this spell, rolled on its own and billed to a
              // row of its own. It cannot echo again.
              echo: (multiplier: number) => {
                if (echoed) return;
                echoed = true;
                const again = rollSpell(hitPctFor(), critPctFor(spell, now), rng);
                const extra = damageOf(spell, again, powerFor(spell), now) * multiplier;
                const e = tally(spell.def.id + '-echo');
                e.casts += 1;
                if (again === 'miss') e.misses += 1;
                else {
                  e.hits += 1;
                  if (again === 'crit') e.crits += 1;
                  e.damage += extra;
                  total += extra;
                }
                trace?.push({ t: now, kind: 'land', id: spell.def.id + '-echo', amount: extra, outcome: again });
              },
            });
          }
        }

        if (spell.def.dot) {
          const dot = spell.def.dot;
          const generation = (DOT_GENERATION.get(spell.def.id) ?? 0) + 1;
          DOT_GENERATION.set(spell.def.id, generation);
          queue.push(now + dot.interval, {
            kind: 'dot-tick',
            spellId: spell.def.id,
            snapshotPower: powerFor(spell),
            left: dot.ticks,
            generation,
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
      const current = data.generation === undefined || data.generation === DOT_GENERATION.get(data.spellId);
      if (spell && dot && data.left > 0 && current) {
        const perTick =
          (dot.damage / dot.ticks + (data.snapshotPower * dot.coefficient) / dot.ticks) * spell.damageMultiplier;
        // A multiplier that comes and goes, such as Vengeance, counts when the
        // tick lands rather than when the spell went out.
        const live = spec.damageBonusFor?.(
          { spellId: spell.def.id, school: spell.def.school, actor, now, mods },
        ) ?? 1;
        const amount = perTick * live
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
            generation: data.generation,
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

    // Anything you press rather than cast goes off the moment it is ready and
    // there is fight left to spend it on. None of it costs a global.
    if (effects.any) {
      for (const ready of effects.usable(now)) {
        const aura = ready.effect.kind === 'use' ? ready.effect.aura : null;
        if (!aura || fight.duration - now < Math.min(aura.duration, 5)) continue;
        const fired = effects.use(ready.name, now, actor, rng);
        if (fired) {
          settle([fired], now);
          retime(now);
        }
      }
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
    if (spell && actor.movingUntil > now && !spell.def.usableWhileMoving && spell.def.gcd !== 0) {
      actor.idleTime += Math.min(actor.movingUntil, fight.duration) - now;
      queue.push(actor.movingUntil, { kind: 'decide' });
      event = queue.pop();
      continue;
    }
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
    // A cast can put up haste, such as Rapid Fire, or move a swing itself.
    retime(now);
    syncSwings(now);
    if (spell.def.cooldown) {
      actor.startCooldown(spell.def.id, now, spell.def.cooldown);
      trace?.push({ t: now, kind: 'cooldown', id: spell.def.id, value: spell.def.cooldown });
    }

    // Anything that speeds casting up now, such as Rage of the Farseer, shortens
    // this cast. The global cooldown is not touched: in Classic it did not move.
    const castSpeed = spell.castTime > 0 ? spec.castSpeedFor?.(actor, now, mods, spell.def.id) ?? 1 : 1;
    const finishAt = now + spell.castTime / Math.max(0.01, castSpeed);
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
