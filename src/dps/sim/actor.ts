/**
 * The character, mid-fight: what it has, what it is busy doing and what is
 * still on cooldown.
 *
 * Mana, rage and energy are the same thing with different numbers on it, so
 * there is one Resource class and three of them. The mana methods stayed as
 * they were, because the caster specs and their tests were written against
 * them and a rename would have been churn for nothing.
 */

import { AuraTracker } from './auras';
import { SwingTimer } from './swing';
import type { ResourceKind } from './spells';
import type { StatKey } from '../export-format';
import type { Hand, StatSheet } from './types';

/** One bar: what is in it, what has gone through it, and when it ran dry. */
export class Resource {
  readonly kind: ResourceKind;
  max: number;
  current: number;
  /** Total taken out over the fight. */
  spent = 0;
  /** Total put in over the fight, not counting what it started with. */
  gained = 0;
  /** The first moment there was not enough for what the character wanted. */
  starvedAt: number | null = null;

  constructor(kind: ResourceKind, max: number, start = max) {
    this.kind = kind;
    this.max = max;
    this.current = start;
  }

  canPay(cost: number): boolean {
    return cost <= 0 || this.current >= cost;
  }

  pay(cost: number, now: number): boolean {
    if (cost <= 0) return true;
    if (this.current < cost) {
      if (this.starvedAt === null) this.starvedAt = now;
      return false;
    }
    this.current -= cost;
    this.spent += cost;
    return true;
  }

  restore(amount: number): void {
    if (amount <= 0) return;
    const room = Math.max(0, this.max - this.current);
    const added = Math.min(room, amount);
    this.current += added;
    this.gained += added;
  }

  fraction(): number {
    return this.max > 0 ? this.current / this.max : 0;
  }
}

export class Actor {
  readonly stats: StatSheet;
  readonly maxMana: number;
  mana: number;

  /** Rage and energy, for anyone who has them. Mana keeps its own fields. */
  readonly rage: Resource;
  readonly energy: Resource;

  /** Points banked towards a finisher. */
  comboPoints = 0;

  /**
   * Stats from anything that comes and goes: a trinket that was pressed, a
   * weapon that procced. Kept apart from the sheet and added on read, because
   * the sheet is resolved once and these change mid-fight.
   */
  readonly bonus: Partial<Record<StatKey, number>> = {};

  /** Auras on the character. */
  readonly auras = new AuraTracker();
  /** Auras on the boss, kept apart so a rotation can ask about either. */
  readonly targetAuras = new AuraTracker();

  /** One per weapon, for anyone who swings. */
  readonly swings: Partial<Record<Hand, SwingTimer>> = {};
  /**
   * An ability waiting for the next swing of that hand, which is how Heroic
   * Strike and Cleave work: the swing arrives and lands as a strike instead.
   */
  queuedSwing: Partial<Record<Hand, string>> = {};

  private readonly cooldowns = new Map<string, number>();

  /** When the next spell can start, because of the global cooldown. */
  gcdReadyAt = 0;
  /** When the current cast finishes. */
  busyUntil = 0;
  /** Standing still again at this moment; nothing lands before then. */
  movingUntil = 0;

  /** Seconds spent with nothing worth doing. */
  idleTime = 0;
  /** Seconds spent wanting to act with an empty bar. */
  starvedTime = 0;
  /** Mana spent over the fight, for the resource summary. */
  manaSpent = 0;
  /** The first moment the character could not pay for what it wanted. */
  oomAt: number | null = null;
  /**
   * When mana was last spent. Spirit regeneration stops for five seconds after
   * that, which is the rule every caster plans around.
   */
  lastSpendAt = -Infinity;

  readonly infiniteMana: boolean;
  readonly infiniteResource: boolean;

  constructor(stats: StatSheet, infiniteMana = false, infiniteResource = false) {
    this.stats = stats;
    this.maxMana = stats.mana;
    this.mana = stats.mana;
    this.infiniteMana = infiniteMana;
    this.infiniteResource = infiniteResource;
    // Rage starts empty, the way a pull does. Energy starts full.
    this.rage = new Resource('rage', 100, 0);
    this.energy = new Resource('energy', 100, 100);
  }

  /* ------------------------------------------------------------- live stats */

  /** A stat as it stands now: what the sheet said, plus anything up. */
  statAt(key: StatKey): number {
    return this.stats[key] + (this.bonus[key] ?? 0);
  }

  /** Puts a block of stats on, or takes it back off with a sign of minus one. */
  addBonus(stats: Partial<Record<StatKey, number>>, sign: number): void {
    for (const [key, value] of Object.entries(stats) as Array<[StatKey, number]>) {
      if (value) this.bonus[key] = (this.bonus[key] ?? 0) + value * sign;
    }
  }

  /* --------------------------------------------------------------- cooldowns */

  ready(id: string, now: number): boolean {
    const until = this.cooldowns.get(id);
    return until === undefined || until <= now;
  }

  readyAt(id: string): number {
    return this.cooldowns.get(id) ?? 0;
  }

  startCooldown(id: string, now: number, seconds: number): void {
    if (seconds > 0) this.cooldowns.set(id, now + seconds);
  }

  /* ------------------------------------------------------------------- mana */

  canPay(cost: number): boolean {
    return this.infiniteMana || cost <= 0 || this.mana >= cost;
  }

  pay(cost: number, now: number): boolean {
    if (cost <= 0) return true;
    if (this.infiniteMana) {
      this.manaSpent += cost;
      this.lastSpendAt = now;
      return true;
    }
    if (this.mana < cost) {
      if (this.oomAt === null) this.oomAt = now;
      return false;
    }
    this.mana -= cost;
    this.manaSpent += cost;
    this.lastSpendAt = now;
    return true;
  }

  restore(amount: number): void {
    this.mana = Math.min(this.maxMana, this.mana + Math.max(0, amount));
  }

  /** The share of maximum mana still in the tank. */
  manaFraction(): number {
    if (this.infiniteMana) return 1;
    return this.maxMana > 0 ? this.mana / this.maxMana : 0;
  }

  /* -------------------------------------------------------- any resource bar */

  resource(kind: ResourceKind): Resource | null {
    if (kind === 'rage') return this.rage;
    if (kind === 'energy') return this.energy;
    return null;
  }

  /** Whether the bar this ability draws on has enough in it. */
  canAfford(kind: ResourceKind, cost: number): boolean {
    if (kind === 'mana') return this.canPay(cost);
    if (this.infiniteResource) return true;
    return this.resource(kind)!.canPay(cost);
  }

  /** Takes the cost out of whichever bar it belongs to. */
  spend(kind: ResourceKind, cost: number, now: number): boolean {
    if (kind === 'mana') return this.pay(cost, now);
    const bar = this.resource(kind)!;
    if (this.infiniteResource) {
      bar.spent += Math.max(0, cost);
      return true;
    }
    return bar.pay(cost, now);
  }

  /** Puts some back, capped at the top of the bar. */
  gain(kind: ResourceKind, amount: number): void {
    if (kind === 'mana') {
      this.restore(amount);
      return;
    }
    this.resource(kind)!.restore(amount);
  }

  /* ---------------------------------------------------------------- swinging */

  /** Gives this hand a weapon, starting its first swing now. */
  arm(hand: Hand, speed: number, startAt = 0, hasteMultiplier = 1): SwingTimer {
    const timer = new SwingTimer(speed, startAt, hasteMultiplier);
    this.swings[hand] = timer;
    return timer;
  }

  /** Every hand that is holding something, in the order they are read. */
  armedHands(): Hand[] {
    return (['main', 'off', 'ranged'] as Hand[]).filter((h) => this.swings[h]);
  }

  /** Puts the new haste on every swing at once, keeping each one's progress. */
  retimeSwings(now: number, hasteMultiplier: number): void {
    for (const hand of this.armedHands()) this.swings[hand]!.retime(now, hasteMultiplier);
  }

  /* ------------------------------------------------------------ combo points */

  addCombo(points: number, max = 5): void {
    this.comboPoints = Math.max(0, Math.min(max, this.comboPoints + points));
  }

  spendCombo(): number {
    const spent = this.comboPoints;
    this.comboPoints = 0;
    return spent;
  }
}
