/**
 * The character, mid-fight: what it has, what it is busy doing and what is
 * still on cooldown.
 */

import { AuraTracker } from './auras';
import type { StatSheet } from './types';

export class Actor {
  readonly stats: StatSheet;
  readonly maxMana: number;
  mana: number;

  /** Auras on the character. */
  readonly auras = new AuraTracker();
  /** Auras on the boss, kept apart so a rotation can ask about either. */
  readonly targetAuras = new AuraTracker();

  private readonly cooldowns = new Map<string, number>();

  /** When the next spell can start, because of the global cooldown. */
  gcdReadyAt = 0;
  /** When the current cast finishes. */
  busyUntil = 0;

  /** Seconds spent with nothing worth doing. */
  idleTime = 0;
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

  constructor(stats: StatSheet, infiniteMana = false) {
    this.stats = stats;
    this.maxMana = stats.mana;
    this.mana = stats.mana;
    this.infiniteMana = infiniteMana;
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
}
