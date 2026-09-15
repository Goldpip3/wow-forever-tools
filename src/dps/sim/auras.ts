/**
 * Buffs and debuffs that last a while: haste after a crit, a stacking chill on
 * the boss, a damage-over-time effect ticking away.
 *
 * Expiry is checked when an aura is read rather than scheduled, which keeps the
 * event queue for things that actually do something. Ticks are the exception:
 * a tick deals damage, so it has to be a real event.
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

  clear(): void {
    this.auras.clear();
  }

  apply(id: string, now: number, opts: AuraOptions): void {
    const existing = this.auras.get(id);
    const maxStacks = opts.maxStacks ?? existing?.maxStacks ?? 1;
    const add = opts.stacks ?? 1;

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
    if (aura.stacks <= 0) this.auras.delete(id);
    return true;
  }

  remove(id: string): void {
    this.auras.delete(id);
  }

  /** Every aura still up, for a rotation that wants to look around. */
  active(now: number): string[] {
    const out: string[] = [];
    for (const aura of this.auras.values()) if (aura.expiresAt > now) out.push(aura.id);
    return out;
  }
}
