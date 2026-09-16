/**
 * Trinkets and weapon procs, during the fight.
 *
 * The engine is handed a flat list of effects rather than a bag of items: the
 * main thread reads the tooltips and decides what is on, and this only has to
 * know that something adds two hundred and sixty attack power for twenty
 * seconds when a weapon lands.
 *
 * Stats that come and go are the awkward part. Everything else in the model is
 * resolved before the fight starts, so the actor keeps a bonus alongside the
 * sheet and the hot loop adds the two together. That means an aura going up or
 * down has to be a real event rather than something noticed on the next read,
 * which is why a runtime exists at all rather than a pair of hooks.
 */

import * as K from '../data/combat-constants';
import type { EffectAura, ItemEffect, Trigger } from '../data/item-effects';
import type { StatKey } from '../export-format';
import type { Actor } from './actor';
import type { Rng } from './rng';
import type { Hand, WeaponStats } from './types';

/** One effect, with the item it came from, as the engine receives it. */
export interface ActiveEffect {
  /** For the ability table and the notes. */
  name: string;
  effect: ItemEffect;
}

export interface EffectFired {
  /** An aura went up and has to be taken down again at this moment. */
  expiresAt?: number;
  /** Which aura, so the engine can name the event that takes it down. */
  auraId?: string;
  /** Damage to deal now, for a weapon that blasts what it hits. */
  damage?: { id: string; name: string; amount: number };
  /** Swings to take straight away, for an extra attack. */
  extraAttacks?: number;
}

const NOTHING: EffectFired = {};

export class EffectRuntime {
  private readonly effects: ActiveEffect[];
  private readonly lastFired = new Map<string, number>();
  private readonly useReadyAt = new Map<string, number>();

  constructor(effects: ActiveEffect[] = []) {
    this.effects = effects;
  }

  get any(): boolean {
    return this.effects.length > 0;
  }

  /** Everything that can be pressed, for a rotation that wants to press one. */
  usable(now: number): ActiveEffect[] {
    return this.effects.filter(
      (entry) => entry.effect.kind === 'use' && (this.useReadyAt.get(entry.name) ?? 0) <= now,
    );
  }

  /**
   * A weapon landed, or a spell did. Returns what has to happen as a result,
   * because scheduling belongs to the event loop rather than here.
   */
  onTrigger(
    trigger: Trigger,
    now: number,
    actor: Actor,
    rng: Rng,
    weapon: WeaponStats | undefined,
    hand: Hand,
  ): EffectFired[] {
    if (!this.effects.length) return [];
    const fired: EffectFired[] = [];

    for (const entry of this.effects) {
      const effect = entry.effect;
      if (effect.kind === 'use') continue;
      if (!matches(effect.trigger, trigger)) continue;

      // A proc on the off hand is a proc from the off-hand weapon, so a weapon
      // that has none does not fire one.
      if (hand === 'off' && effect.kind === 'proc' && !weapon) continue;

      const icd = effect.kind === 'proc' ? effect.icd ?? 0 : 0;
      if (icd > 0 && now - (this.lastFired.get(entry.name) ?? -Infinity) < icd) continue;

      const chance = chanceOf(effect, weapon);
      if (chance <= 0 || !rng.chance(Math.min(1, chance))) continue;
      this.lastFired.set(entry.name, now);

      if (effect.kind === 'extra-attacks') {
        fired.push({ extraAttacks: effect.count });
        continue;
      }

      fired.push(this.apply(effect.aura, entry.name, now, actor, rng));
    }

    return fired;
  }

  /** Presses one, for a rotation that asked. */
  use(name: string, now: number, actor: Actor, rng: Rng): EffectFired | null {
    const entry = this.effects.find((e) => e.name === name && e.effect.kind === 'use');
    if (!entry || entry.effect.kind !== 'use') return null;
    if ((this.useReadyAt.get(name) ?? 0) > now) return null;

    this.useReadyAt.set(name, now + entry.effect.cooldown);
    // Trinkets share a cooldown with each other, so pressing one holds the rest.
    if (entry.effect.shareGroup === 'trinket') {
      for (const other of this.effects) {
        if (other.effect.kind === 'use' && other.effect.shareGroup === 'trinket' && other !== entry) {
          this.useReadyAt.set(other.name, Math.max(this.useReadyAt.get(other.name) ?? 0, now + 30));
        }
      }
    }

    return this.apply(entry.effect.aura, name, now, actor, rng);
  }

  /** Puts an aura up, adding its stats to the actor until it comes down. */
  private apply(
    aura: EffectAura,
    name: string,
    now: number,
    actor: Actor,
    rng: Rng,
  ): EffectFired {
    if (aura.damage) {
      const amount = rng.between(aura.damage.min, aura.damage.max);
      return { damage: { id: aura.id, name, amount } };
    }

    if (!aura.stats || aura.duration <= 0) return NOTHING;

    // Refreshing an aura that is still up must not add its stats twice.
    if (!actor.auras.has(aura.id, now)) actor.addBonus(aura.stats, 1);
    actor.auras.apply(aura.id, now, { duration: aura.duration });
    return { expiresAt: now + aura.duration, auraId: aura.id };
  }

  /** Takes an aura's stats back off, when the engine's timer says so. */
  expire(auraId: string, now: number, actor: Actor): void {
    for (const entry of this.effects) {
      const effect = entry.effect;
      if (effect.kind === 'extra-attacks') continue;
      if (effect.aura.id !== auraId || !effect.aura.stats) continue;
      // Something may have refreshed it since; only take it off when it is gone.
      if (actor.auras.has(auraId, now)) return;
      actor.addBonus(effect.aura.stats, -1);
      return;
    }
  }
}

function matches(wanted: Trigger, happened: Trigger): boolean {
  if (wanted === happened) return true;
  if (wanted === 'any-damage') return true;
  if (wanted === 'melee-hit' && happened === 'melee-crit') return true;
  return false;
}

/** A flat chance, or a rate per minute turned into one by the weapon's speed. */
function chanceOf(effect: ItemEffect, weapon: WeaponStats | undefined): number {
  if (effect.kind === 'use') return 0;
  if (effect.chance !== undefined) return effect.chance;
  const ppm = effect.ppm ?? K.PROC_PPM_DEFAULT.value;
  const speed = weapon?.speed ?? 2.5;
  return (ppm * speed) / 60;
}

/** Which stat keys an effect can move, so the sheet knows what to watch. */
export function statsTouched(effects: ActiveEffect[]): Set<StatKey> {
  const keys = new Set<StatKey>();
  for (const { effect } of effects) {
    if (effect.kind === 'extra-attacks') continue;
    for (const key of Object.keys(effect.aura.stats ?? {}) as StatKey[]) keys.add(key);
  }
  return keys;
}

