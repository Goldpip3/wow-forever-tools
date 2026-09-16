/**
 * When a weapon comes round again.
 *
 * The whole of the difficulty is what happens when haste changes mid-swing. The
 * game does not restart the swing and it does not ignore the change: it keeps
 * the share of the swing already spent and applies the new speed to the rest.
 * Land a critical strike two thirds of the way through a swing with Flurry up
 * and the last third arrives sooner, not the whole swing over again.
 *
 * Getting that wrong is how a melee simulator quietly gains or loses a few per
 * cent, so it is a class of its own with tests of its own.
 */
export class SwingTimer {
  /** The weapon's own speed, before haste. */
  readonly base: number;
  /** The speed it is actually swinging at now. */
  speed: number;
  /** When the next swing lands. */
  nextAt: number;
  /** When the swing in progress started. */
  startedAt: number;
  /**
   * Goes up whenever the next swing moves, landing included. Any event queued
   * for an older version is stale, so a swing the engine queued and then moved
   * can never land twice.
   */
  version = 0;

  constructor(base: number, startAt = 0, hasteMultiplier = 1) {
    this.base = base;
    this.speed = base / Math.max(0.01, hasteMultiplier);
    this.startedAt = startAt;
    this.nextAt = startAt + this.speed;
  }

  /**
   * Haste changed. Keep the share of the swing already spent and stretch or
   * shrink what is left of it.
   */
  retime(now: number, hasteMultiplier: number): void {
    const speed = this.base / Math.max(0.01, hasteMultiplier);
    if (speed === this.speed) return;

    const remaining = this.nextAt - now;
    if (remaining <= 0) {
      this.speed = speed;
      return;
    }

    const spent = 1 - remaining / this.speed;
    this.speed = speed;
    this.nextAt = now + speed * (1 - spent);
    this.version += 1;
  }

  /** The swing landed; start the next one. */
  advance(now: number): void {
    this.startedAt = now;
    this.nextAt = now + this.speed;
    this.version += 1;
  }

  /** Start the swing over from here, for an extra attack or a weapon change. */
  reset(now: number): void {
    this.startedAt = now;
    this.nextAt = now + this.speed;
    this.version += 1;
  }

  /** Seconds until it comes round, never below zero. */
  remaining(now: number): number {
    return Math.max(0, this.nextAt - now);
  }
}
