/**
 * Buffs and debuffs that last a while: haste after a crit, a stacking chill on
 * the boss, a damage-over-time effect ticking away.
 *
 * Expiry is checked when an aura is read rather than scheduled, which keeps the
 * event queue for things that actually do something. Ticks are the exception:
 * a tick deals damage, so it has to be a real event.
 *
 * Uptime is counted exactly rather than sampled. An interval opens when an aura
 * goes up on something that was not already carrying it, and closes when it is
 * spent, removed, or found to have run out; whatever is still open at the end of
 * the fight closes at the earlier of its expiry and the final bell. That means a
 * fifteen second aura applied once in a five minute fight reads fifteen seconds,
 * not fourteen point nine.
 */

export interface AuraOptions {
  duration: number;
  maxStacks?: number;
  /** Starting stacks when the aura goes up. */
  stacks?: number;
  /** Refreshing an existing aura resets its duration unless this says not to. */
  pandemic?: boolean;
}

interface Aura {
  id: string;
  expiresAt: number;
  stacks: number;
  maxStacks: number;
  appliedAt: number;
}

export class AuraTracker {
  private auras = new Map<string, Aura>();
  /** Seconds each aura has been up, over closed intervals. */
  private accrued = new Map<string, number>();
  /** When the interval still running for each aura began. */
  private openedAt = new Map<string, number>();

  clear(): void {
    this.auras.clear();
    this.accrued.clear();
    this.openedAt.clear();
  }

  /** Shuts the open interval for an aura, adding what it was up for. */
  private close(id: string, at: number): void {
    const opened = this.openedAt.get(id);
    if (opened === undefined) return;
    this.accrued.set(id, (this.accrued.get(id) ?? 0) + Math.max(0, at - opened));
    this.openedAt.delete(id);
  }

  apply(id: string, now: number, opts: AuraOptions): void {
    const existing = this.auras.get(id);
    const maxStacks = opts.maxStacks ?? existing?.maxStacks ?? 1;
    const add = opts.stacks ?? 1;

    // An aura that ran out while nobody was looking closes at the moment it
    // actually ended rather than at the moment it was noticed.
    if (!existing || existing.expiresAt <= now) this.close(id, existing?.expiresAt ?? now);
    if (!this.openedAt.has(id)) this.openedAt.set(id, now);

    if (existing && existing.expiresAt > now) {
      existing.stacks = Math.min(maxStacks, existing.stacks + add);
      existing.maxStacks = maxStacks;
      if (!opts.pandemic) existing.expiresAt = now + opts.duration;
      return;
    }

    this.auras.set(id, {
      id,
      expiresAt: now + opts.duration,
      stacks: Math.min(maxStacks, add),
      maxStacks,
      appliedAt: now,
    });
  }

  has(id: string, now: number): boolean {
    const aura = this.auras.get(id);
    return !!aura && aura.expiresAt > now;
  }

  stacks(id: string, now: number): number {
    const aura = this.auras.get(id);
    return aura && aura.expiresAt > now ? aura.stacks : 0;
  }

  remaining(id: string, now: number): number {
    const aura = this.auras.get(id);
    return aura && aura.expiresAt > now ? aura.expiresAt - now : 0;
  }

  /** When this aura went up, for anything that snapshots at application. */
  appliedAt(id: string, now: number): number | null {
    const aura = this.auras.get(id);
    return aura && aura.expiresAt > now ? aura.appliedAt : null;
  }

  /** Takes one stack off, removing the aura when the last one goes. */
  consume(id: string, now: number, count = 1): boolean {
    const aura = this.auras.get(id);
    if (!aura || aura.expiresAt <= now) return false;
    aura.stacks -= count;
    if (aura.stacks <= 0) {
      this.auras.delete(id);
      this.close(id, now);
    }
    return true;
  }

  remove(id: string, now = 0): void {
    this.auras.delete(id);
    this.close(id, now);
  }

  /**
   * Closes every interval still running, for the end of the fight. An aura that
   * would have run out before the bell closes when it ran out.
   */
  closeAll(end: number): void {
    for (const id of [...this.openedAt.keys()]) {
      const aura = this.auras.get(id);
      this.close(id, Math.min(aura?.expiresAt ?? end, end));
    }
  }

  /** Seconds each aura has been up. Call closeAll first for a final answer. */
  uptimes(): Map<string, number> {
    return new Map(this.accrued);
  }

  /** Every aura still up, for a rotation that wants to look around. */
  active(now: number): string[] {
    const out: string[] = [];
    for (const aura of this.auras.values()) if (aura.expiresAt > now) out.push(aura.id);
    return out;
  }
}
