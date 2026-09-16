import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { EFFECTS, effectById, effectsForClass } from '../src/raid/effects/index';
import { CATEGORIES, category } from '../src/raid/categories';
import { ALL_SPECS, CLASS_IDS, specById } from '../src/shared/classes';

const ICON_DIR = resolve(__dirname, '../public/assets/icons');

describe('effect catalog', () => {
  it('has a unique id for every effect', () => {
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const e of EFFECTS) {
      if (seen.has(e.id)) dupes.push(e.id);
      seen.add(e.id);
    }
    expect(dupes).toEqual([]);
  });

  it('gives every effect at least one provider', () => {
    const orphans = EFFECTS.filter((e) => e.providers.length === 0).map((e) => e.id);
    expect(orphans).toEqual([]);
  });

  it('only names categories that exist', () => {
    const bad: string[] = [];
    for (const e of EFFECTS) {
      for (const c of e.categories) {
        if (!category(c)) bad.push(e.id + ' -> ' + c);
      }
    }
    expect(bad).toEqual([]);
  });

  it('only names spec ids that exist', () => {
    const bad: string[] = [];
    for (const e of EFFECTS) {
      for (const p of e.providers) {
        for (const s of p.specs ?? []) {
          const spec = specById(s);
          if (!spec) bad.push(e.id + ' -> unknown spec ' + s);
          else if (spec.classId !== p.classId) {
            bad.push(e.id + ' -> spec ' + s + ' is ' + spec.classId + ', not ' + p.classId);
          }
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('points exclusiveWith at effects that exist, and both ways', () => {
    const missing: string[] = [];
    const oneWay: string[] = [];
    for (const e of EFFECTS) {
      for (const other of e.exclusiveWith ?? []) {
        const target = effectById(other);
        if (!target) {
          missing.push(e.id + ' -> ' + other);
          continue;
        }
        if (!(target.exclusiveWith ?? []).includes(e.id)) oneWay.push(e.id + ' -> ' + other);
      }
    }
    expect(missing).toEqual([]);
    expect(oneWay).toEqual([]);
  });

  it('has a downloaded icon for every effect', () => {
    const missing = EFFECTS.filter((e) => !existsSync(resolve(ICON_DIR, e.icon + '.jpg'))).map(
      (e) => e.id + ' (' + e.icon + ')',
    );
    expect(missing).toEqual([]);
  });

  it('covers all nine classes', () => {
    for (const id of CLASS_IDS) {
      expect(effectsForClass(id).length, id).toBeGreaterThan(5);
    }
  });

  it('covers every spec with at least one effect', () => {
    for (const spec of ALL_SPECS) {
      const count = EFFECTS.filter((e) =>
        e.providers.some((p) => p.classId === spec.classId && (!p.specs || p.specs.includes(spec.id))),
      ).length;
      expect(count, spec.classId + ' ' + spec.name).toBeGreaterThan(3);
    }
  });

  it('keeps a consistent choice limit per group', () => {
    const limits = new Map<string, number>();
    const clashes: string[] = [];
    for (const e of EFFECTS) {
      for (const p of e.providers) {
        if (!p.choice) continue;
        const known = limits.get(p.choice.group);
        if (known !== undefined && known !== p.choice.limit) {
          clashes.push(p.choice.group + ' has limits ' + known + ' and ' + p.choice.limit);
        }
        limits.set(p.choice.group, p.choice.limit);
      }
    }
    expect(clashes).toEqual([]);
  });

  it('gives every target-scope debuff a slot cost, explicit or default', () => {
    for (const e of EFFECTS.filter((x) => x.scope === 'target')) {
      const slots = e.debuffSlots ?? 1;
      expect(slots, e.id).toBeGreaterThanOrEqual(0);
      expect(slots, e.id).toBeLessThanOrEqual(2);
    }
  });

  it('records a Forever status on everything', () => {
    const allowed = new Set(['same', 'changed', 'new', 'removed', 'unverified']);
    const bad = EFFECTS.filter((e) => !allowed.has(e.forever.status)).map((e) => e.id);
    expect(bad).toEqual([]);
  });

  it('tracks the major Classic raid buffs', () => {
    const wanted = [
      'battle-shout', 'blessing-of-kings', 'devotion-aura', 'arcane-intellect',
      'power-word-fortitude', 'divine-spirit', 'shadow-protection', 'mark-of-the-wild',
      'leader-of-the-pack', 'moonkin-form', 'trueshot-aura', 'mana-tide-totem',
      'blood-pact', 'windfury-totem', 'strength-of-earth-totem', 'grace-of-air-totem',
      'mana-spring-totem', 'power-infusion', 'innervate',
    ];
    const missing = wanted.filter((id) => !effectById(id));
    expect(missing).toEqual([]);
  });

  it('tracks the major Classic raid debuffs', () => {
    const wanted = [
      'sunder-armor', 'faerie-fire', 'curse-of-recklessness',
      'demoralizing-shout', 'demoralizing-roar', 'curse-of-weakness', 'scorpid-sting',
      'insect-swarm', 'hunters-mark', 'thunder-clap', 'curse-of-the-elements',
      'curse-of-shadow', 'vampiric-embrace',
    ];
    const missing = wanted.filter((id) => !effectById(id));
    expect(missing).toEqual([]);
  });

  it('marks the buffs Forever turned personal', () => {
    for (const id of ['winters-chill', 'improved-scorch', 'shadow-weaving', 'improved-shadow-bolt']) {
      const effect = effectById(id)!;
      expect(effect, id).toBeDefined();
      expect(effect.scope, id).toBe('self');
      expect(effect.forever.status, id).toBe('changed');
    }
  });

  it('does not track Expose Armor', () => {
    /* It overwrites Sunder Armor rather than stacking with it, and a raid with warriors
       tanking already has Sunder up, so no rogue is asked to spend combo points replacing
       it. Tracking it showed an empty slot for something no raid assigns. */
    expect(effectById('expose-armor')).toBeUndefined();
    expect(effectById('sunder-armor')!.exclusiveWith ?? []).not.toContain('expose-armor');
  });

  it('still covers reduced armor without it', () => {
    const sunder = effectById('sunder-armor')!;
    expect(sunder.categories).toContain('reduced-armor');
  });

  it('makes the two crit auras mutually exclusive', () => {
    expect(effectById('leader-of-the-pack')!.exclusiveWith).toContain('moonkin-form');
    expect(effectById('moonkin-form')!.exclusiveWith).toContain('leader-of-the-pack');
  });

  it('uses every category at least once', () => {
    const used = new Set(EFFECTS.flatMap((e) => e.categories));
    const unused = CATEGORIES.filter((c) => !used.has(c.id)).map((c) => c.id);
    expect(unused).toEqual([]);
  });
});
