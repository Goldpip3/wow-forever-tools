import { describe, expect, it } from 'vitest';
import type { Player, Roster } from '../src/raid/types';
import {
  DEFAULT_DEBUFF_CAP,
  activeGroupCount,
  computeCoverage,
  emptyRoster,
  playersInRaid,
  providersOf,
} from '../src/raid/engine';
import { createPlayer, spreadChoices } from '../src/raid/loadout';
import { effectById } from '../src/raid/effects/index';
import { decodeRoster, encodeRoster } from '../src/raid/codec';
import { ALL_SPECS, type ClassId } from '../src/shared/classes';

function seat(roster: Roster, group: number, slot: number, player: Player): Player {
  roster.groups[group]![slot] = player;
  return player;
}

function add(roster: Roster, group: number, slot: number, classId: ClassId, specId: number, name?: string): Player {
  return seat(roster, group, slot, createPlayer(classId, specId, name));
}

function covered(roster: Roster, effectId: string): boolean {
  return computeCoverage(roster).byEffect.get(effectId)?.covered ?? false;
}

describe('roster basics', () => {
  it('starts empty with eight groups of five', () => {
    const roster = emptyRoster(40);
    expect(roster.groups).toHaveLength(8);
    expect(roster.groups[0]).toHaveLength(5);
    expect(playersInRaid(roster)).toEqual([]);
    expect(roster.settings.debuffCap).toBe(DEFAULT_DEBUFF_CAP);
  });

  it('counts only the groups a raid size uses', () => {
    expect(activeGroupCount(40)).toBe(8);
    expect(activeGroupCount(20)).toBe(4);
    expect(activeGroupCount(10)).toBe(2);
  });

  it('ignores players seated past the raid size', () => {
    const roster = emptyRoster(10);
    add(roster, 0, 0, 'warrior', 161);
    add(roster, 6, 0, 'mage', 61);
    expect(playersInRaid(roster)).toHaveLength(1);
  });
});

describe('provider matching', () => {
  it('credits a class buff to any spec of that class', () => {
    const roster = emptyRoster(40);
    add(roster, 0, 0, 'priest', 203);
    expect(covered(roster, 'power-word-fortitude')).toBe(true);
    expect(covered(roster, 'divine-spirit')).toBe(true);
  });

  it('gates a talent effect behind the toggle', () => {
    const roster = emptyRoster(40);
    const hunter = add(roster, 0, 0, 'hunter', 363);
    expect(covered(roster, 'trueshot-aura')).toBe(true);
    hunter.talentToggles['trueshot-aura'] = false;
    expect(covered(roster, 'trueshot-aura')).toBe(false);
  });

  it('will not credit a talent to the wrong spec', () => {
    const roster = emptyRoster(40);
    const hunter = add(roster, 0, 0, 'hunter', 361);
    hunter.talentToggles['trueshot-aura'] = true;
    expect(covered(roster, 'trueshot-aura')).toBe(false);
  });

  it('gates a choice effect behind the loadout', () => {
    const roster = emptyRoster(40);
    const paladin = add(roster, 0, 0, 'paladin', 383);
    expect(covered(roster, 'blessing-of-kings')).toBe(true);
    paladin.loadout['paladin-blessing'] = ['blessing-of-might'];
    expect(covered(roster, 'blessing-of-kings')).toBe(false);
    expect(covered(roster, 'blessing-of-might')).toBe(true);
  });

  it('lists every player who provides an effect', () => {
    const roster = emptyRoster(40);
    add(roster, 0, 0, 'warrior', 161, 'Ragnar');
    add(roster, 1, 0, 'warrior', 164, 'Brawn');
    const effect = effectById('battle-shout')!;
    const provs = providersOf(effect, playersInRaid(roster));
    expect(provs.map((p) => p.name).sort()).toEqual(['Brawn', 'Ragnar']);
  });
});

describe('scope resolution', () => {
  it('treats a raid buff as covered from any group', () => {
    const roster = emptyRoster(40);
    add(roster, 5, 2, 'mage', 61);
    const cov = computeCoverage(roster).byEffect.get('arcane-intellect')!;
    expect(cov.covered).toBe(true);
    expect(cov.groups[5]).toBe(true);
  });

  it('tracks party buffs group by group', () => {
    const roster = emptyRoster(40);
    add(roster, 0, 0, 'warrior', 161);
    add(roster, 3, 1, 'warrior', 164);
    const cov = computeCoverage(roster).byEffect.get('battle-shout')!;
    expect(cov.groups[0]).toBe(true);
    expect(cov.groups[3]).toBe(true);
    expect(cov.groups[1]).toBe(false);
  });

  it('warns about the groups a party buff misses', () => {
    const roster = emptyRoster(40);
    add(roster, 0, 0, 'warrior', 161);
    add(roster, 0, 1, 'mage', 61);
    const warnings = computeCoverage(roster).warnings;
    const gap = warnings.find((w) => w.title.includes('Battle Shout'));
    expect(gap).toBeDefined();
    expect(gap!.detail).toMatch(/Groups 2, 3, 4, 5, 6, 7, 8/);
  });
});

describe('exclusivity', () => {
  it('warns when both crit auras sit in one group', () => {
    const roster = emptyRoster(40);
    add(roster, 1, 0, 'druid', 281, 'Claws');
    add(roster, 1, 1, 'druid', 283, 'Boomie');
    const warnings = computeCoverage(roster).warnings;
    const clash = warnings.find((w) => w.title.includes('do not stack'));
    expect(clash).toBeDefined();
    expect(clash!.detail).toMatch(/Group 2/);
  });

  it('does not warn when the crit auras are split across groups', () => {
    const roster = emptyRoster(40);
    add(roster, 0, 0, 'druid', 281);
    add(roster, 1, 0, 'druid', 283);
    const warnings = computeCoverage(roster).warnings;
    expect(warnings.find((w) => w.title.includes('do not stack'))).toBeUndefined();
    expect(warnings.find((w) => w.title.includes('Both crit auras'))).toBeDefined();
  });

  it('counts Sunder and Expose as one armor debuff, not two', () => {
    const roster = emptyRoster(40);
    add(roster, 0, 0, 'warrior', 163);
    const warriorOnly = computeCoverage(roster).debuffSlotsUsed;

    // A rogue who brings nothing but Expose Armor: no poisons, no bleeds.
    const rogue = add(roster, 0, 1, 'rogue', 181);
    rogue.loadout['rogue-poison'] = [];

    const cov = computeCoverage(roster);
    expect(cov.byEffect.get('expose-armor')!.covered).toBe(true);
    expect(cov.byEffect.get('sunder-armor')!.covered).toBe(true);
    // Both are up, but they share the one armor slot.
    expect(cov.debuffSlotsUsed).toBe(warriorOnly);
    expect(cov.warnings.find((w) => w.title.includes('do not stack'))).toBeDefined();
  });

  });

describe('choice limits', () => {
  it('warns when four Paladins share fewer than four blessings', () => {
    const roster = emptyRoster(40);
    for (let i = 0; i < 4; i += 1) {
      const pal = add(roster, i, 0, 'paladin', 382, 'Pal ' + (i + 1));
      pal.loadout['paladin-blessing'] = ['blessing-of-kings'];
    }
    const warn = computeCoverage(roster).warnings.find((w) => w.title.includes('blessings are doubled up'));
    expect(warn).toBeDefined();
    expect(warn!.detail).toMatch(/4 Paladins are only covering 1 different blessings/);
  });

  it('is happy when each Paladin brings a different blessing', () => {
    const roster = emptyRoster(40);
    const blessings = ['blessing-of-kings', 'blessing-of-might', 'blessing-of-wisdom', 'blessing-of-salvation'];
    blessings.forEach((b, i) => {
      const pal = add(roster, i, 0, 'paladin', 382, 'Pal ' + (i + 1));
      pal.loadout['paladin-blessing'] = [b];
    });
    const cov = computeCoverage(roster);
    expect(cov.warnings.find((w) => w.title.includes('blessings are doubled up'))).toBeUndefined();
    for (const b of blessings) expect(cov.byEffect.get(b)!.covered, b).toBe(true);
  });

  it('warns when two Warlocks cast the same curse', () => {
    const roster = emptyRoster(40);
    const a = add(roster, 0, 0, 'warlock', 302, 'Lock A');
    const b = add(roster, 0, 1, 'warlock', 303, 'Lock B');
    a.loadout['warlock-curse'] = ['curse-of-the-elements'];
    b.loadout['warlock-curse'] = ['curse-of-the-elements'];
    const warn = computeCoverage(roster).warnings.find((w) => w.title.includes('casting Curse of the Elements'));
    expect(warn).toBeDefined();
  });

  it('flags a Shaman with an empty totem element', () => {
    const roster = emptyRoster(40);
    const shaman = add(roster, 0, 0, 'shaman', 263, 'Thrall');
    shaman.loadout['shaman-fire'] = [];
    const warn = computeCoverage(roster).warnings.find((w) => w.title.includes('no fire totem'));
    expect(warn).toBeDefined();
  });

  it('gives each Shaman one totem per element', () => {
    const roster = emptyRoster(40);
    add(roster, 0, 0, 'shaman', 263);
    const cov = computeCoverage(roster);
    expect(cov.byEffect.get('windfury-totem')!.covered).toBe(true);
    expect(cov.byEffect.get('grace-of-air-totem')!.covered).toBe(false);
  });
});

describe('debuff slots', () => {
  it('counts a plain debuff as one slot', () => {
    const roster = emptyRoster(40);
    add(roster, 0, 0, 'druid', 282);
    const cov = computeCoverage(roster);
    expect(cov.byEffect.get('faerie-fire')!.covered).toBe(true);
    expect(cov.debuffSlotsUsed).toBeGreaterThanOrEqual(1);
  });

  
  it('warns once the raid goes over the cap', () => {
    const roster = emptyRoster(40);
    roster.settings.debuffCap = 2;
    add(roster, 0, 0, 'warlock', 302);
    add(roster, 0, 1, 'priest', 203);
    add(roster, 0, 2, 'druid', 283);
    const cov = computeCoverage(roster);
    expect(cov.debuffSlotsUsed).toBeGreaterThan(2);
    const warn = cov.warnings.find((w) => w.title === 'Over the debuff slot limit');
    expect(warn).toBeDefined();
    expect(warn!.level).toBe('error');
  });

  it('respects a raised cap', () => {
    const roster = emptyRoster(40);
    roster.settings.debuffCap = 40;
    add(roster, 0, 0, 'warlock', 302);
    add(roster, 0, 1, 'priest', 203);
    const cov = computeCoverage(roster);
    expect(cov.warnings.find((w) => w.title === 'Over the debuff slot limit')).toBeUndefined();
  });
});

describe('category counters', () => {
  it('counts distinct players per category', () => {
    const roster = emptyRoster(40);
    add(roster, 0, 0, 'warrior', 161);
    add(roster, 0, 1, 'warrior', 164);
    add(roster, 1, 0, 'paladin', 381);
    const cov = computeCoverage(roster);
    // Two warriors with Battle Shout plus one Paladin with Blessing of Might.
    expect(cov.categoryCounts.get('melee-attack-power')).toBe(3);
  });

  it('lists the effects behind a category', () => {
    const roster = emptyRoster(40);
    add(roster, 0, 0, 'druid', 282);
    const cov = computeCoverage(roster);
    const armor = cov.categoryEffects.get('armor') ?? [];
    expect(armor.map((c) => c.effect.id)).toContain('mark-of-the-wild');
  });

  it('reports zero for a category nobody covers', () => {
    const roster = emptyRoster(40);
    add(roster, 0, 0, 'rogue', 181);
    const cov = computeCoverage(roster);
    expect(cov.categoryCounts.get('intellect')).toBe(0);
  });
});

describe('a full forty-man', () => {
  function buildFortyMan(): Roster {
    const roster = emptyRoster(40);
    const comp: Array<[ClassId, number]> = [
      ['warrior', 163], ['warrior', 163],
      ['paladin', 382], ['paladin', 383], ['paladin', 381], ['paladin', 382],
      ['shaman', 262], ['shaman', 263], ['shaman', 261],
      ['druid', 281], ['druid', 283],
      ['priest', 202], ['priest', 202], ['priest', 201], ['priest', 203], ['priest', 202],
      ['mage', 61], ['mage', 61], ['mage', 41], ['mage', 81],
      ['warlock', 302], ['warlock', 303], ['warlock', 301], ['warlock', 302],
      ['hunter', 363], ['hunter', 361], ['hunter', 362], ['hunter', 361],
      ['rogue', 181], ['rogue', 181], ['rogue', 182], ['rogue', 183],
      ['warrior', 161], ['warrior', 164], ['warrior', 161], ['warrior', 164],
      ['warrior', 161], ['warrior', 164], ['warrior', 161], ['warrior', 164],
    ];
    comp.forEach(([classId, specId], i) => {
      add(roster, Math.floor(i / 5), i % 5, classId, specId, classId + ' ' + (i + 1));
    });
    return roster;
  }

  it('seats forty players', () => {
    expect(playersInRaid(buildFortyMan())).toHaveLength(40);
  });

  it('covers the headline raid buffs', () => {
    const cov = computeCoverage(buildFortyMan());
    for (const id of [
      'arcane-intellect', 'power-word-fortitude', 'divine-spirit', 'shadow-protection',
      'mark-of-the-wild', 'blessing-of-kings', 'battle-shout', 'devotion-aura',
      'leader-of-the-pack', 'moonkin-form', 'trueshot-aura', 'blood-pact',
    ]) {
      expect(cov.byEffect.get(id)!.covered, id).toBe(true);
    }
  });

  it('covers the headline raid debuffs', () => {
    const cov = computeCoverage(buildFortyMan());
    for (const id of ['sunder-armor', 'faerie-fire', 'hunters-mark', 'demoralizing-shout', 'thunder-clap']) {
      expect(cov.byEffect.get(id)!.covered, id).toBe(true);
    }
  });

  it('fills most categories', () => {
    const cov = computeCoverage(buildFortyMan());
    const nonZero = [...cov.categoryCounts.values()].filter((n) => n > 0).length;
    expect(nonZero).toBeGreaterThan(30);
  });

  it('produces useful warnings rather than none', () => {
    const cov = computeCoverage(buildFortyMan());
    expect(cov.warnings.length).toBeGreaterThan(0);
    expect(cov.debuffSlotsUsed).toBeGreaterThan(0);
  });
});

describe('roster links', () => {
  it('round-trips a roster with names, loadouts and dots', () => {
    const roster = emptyRoster(40);
    const pal = add(roster, 2, 3, 'paladin', 383, 'Lightbringer');
    pal.loadout['paladin-blessing'] = ['blessing-of-salvation'];
    add(roster, 0, 0, 'warlock', 302, 'Shadowmend');
    roster.settings.debuffCap = 20;
    roster.bench.push(createPlayer('mage', 61, 'Benched Mage'));

    const back = decodeRoster(encodeRoster(roster))!;
    expect(back).not.toBeNull();
    expect(back.size).toBe(40);
    expect(back.settings.debuffCap).toBe(20);

    const palBack = back.groups[2]![3]!;
    expect(palBack.name).toBe('Lightbringer');
    expect(palBack.classId).toBe('paladin');
    expect(palBack.specId).toBe(383);
    expect(palBack.loadout['paladin-blessing']).toEqual(['blessing-of-salvation']);

    const lockBack = back.groups[0]![0]!;
    expect(lockBack.name).toBe('Shadowmend');

    expect(back.bench).toHaveLength(1);
    expect(back.bench[0]!.name).toBe('Benched Mage');
  });

  it('keeps coverage identical across the round trip', () => {
    const roster = emptyRoster(40);
    add(roster, 0, 0, 'druid', 281);
    add(roster, 1, 0, 'druid', 283);
    add(roster, 0, 1, 'hunter', 363);
    const before = computeCoverage(roster);
    const after = computeCoverage(decodeRoster(encodeRoster(roster))!);
    expect(after.debuffSlotsUsed).toBe(before.debuffSlotsUsed);
    for (const [id, cov] of before.byEffect) {
      expect(after.byEffect.get(id)!.covered, id).toBe(cov.covered);
    }
  });

  it('survives a 40-player roster in a reasonable link length', () => {
    const roster = emptyRoster(40);
    let i = 0;
    for (let g = 0; g < 8; g += 1) {
      for (let s = 0; s < 5; s += 1) {
        i += 1;
        add(roster, g, s, 'warrior', 161, 'Player ' + i);
      }
    }
    const encoded = encodeRoster(roster);
    expect(encoded.length).toBeLessThan(3000);
    expect(playersInRaid(decodeRoster(encoded)!)).toHaveLength(40);
  });

  it('returns null for junk', () => {
    expect(decodeRoster('')).toBeNull();
    expect(decodeRoster('not-a-real-code')).toBeNull();
  });

  it('keeps a 10-man at two groups', () => {
    const roster = emptyRoster(10);
    add(roster, 0, 0, 'priest', 202, 'Healer');
    const back = decodeRoster(encodeRoster(roster))!;
    expect(back.size).toBe(10);
    expect(playersInRaid(back)).toHaveLength(1);
  });
});

describe('druid forms', () => {
  it('gives Demoralizing Roar from a Feral Druid who is also Leader of the Pack', () => {
    const roster = emptyRoster(40);
    const druid = add(roster, 0, 0, 'druid', 281, 'Bear');
    // The default Feral loadout picks Leader of the Pack. Shifting to bear for a
    // roar is not a trade against that, so both have to register.
    expect(druid.loadout['druid-form']).toEqual(['leader-of-the-pack']);
    const cov = computeCoverage(roster);
    expect(cov.byEffect.get('leader-of-the-pack')!.covered).toBe(true);
    expect(cov.byEffect.get('demoralizing-roar')!.covered).toBe(true);
  });

  it('gives the bear utility to any druid spec', () => {
    const roster = emptyRoster(40);
    add(roster, 0, 0, 'druid', 282);
    const cov = computeCoverage(roster);
    for (const id of ['demoralizing-roar', 'challenging-roar', 'bash']) {
      expect(cov.byEffect.get(id)!.covered, id).toBe(true);
    }
    // Lacerate is a bleed and bleeds are no longer tracked at all.
    expect(cov.byEffect.get('lacerate')).toBeUndefined();
  });

  it('keeps the two crit auras a real either/or', () => {
    const roster = emptyRoster(40);
    const druid = add(roster, 0, 0, 'druid', 281);
    expect(computeCoverage(roster).byEffect.get('moonkin-form')!.covered).toBe(false);
    druid.loadout['druid-form'] = ['moonkin-form'];
    const cov = computeCoverage(roster);
    expect(cov.byEffect.get('leader-of-the-pack')!.covered).toBe(false);
  });

  it('marks Demoralizing Shout and Roar as overlapping when both are up', () => {
    const roster = emptyRoster(40);
    add(roster, 0, 0, 'warrior', 161, 'Shouty');
    add(roster, 0, 1, 'druid', 281, 'Bear');
    const cov = computeCoverage(roster);
    const shout = cov.byEffect.get('demoralizing-shout')!;
    const roar = cov.byEffect.get('demoralizing-roar')!;
    expect(shout.covered).toBe(true);
    expect(roar.covered).toBe(true);
    // Each knows the other is doing the same job.
    expect(shout.overriddenBy).toContain('demoralizing-roar');
    expect(roar.overriddenBy).toContain('demoralizing-shout');
  });

  it('counts the pair as one debuff slot, not two', () => {
    const roster = emptyRoster(40);
    add(roster, 0, 0, 'warrior', 161);
    const before = computeCoverage(roster).debuffSlotsUsed;
    add(roster, 0, 1, 'druid', 282);
    const after = computeCoverage(roster).debuffSlotsUsed;
    // The druid adds Faerie Fire, but the roar shares the shout's slot.
    expect(after).toBe(before + 1);
  });
});

describe('available versus missing', () => {
  it('seats every one of the twenty-seven specs', () => {
    for (const spec of ALL_SPECS) {
      const r = emptyRoster(40);
      r.groups[0]![0] = createPlayer(spec.classId, spec.id);
      expect(playersInRaid(r), spec.classId + ' ' + spec.name).toHaveLength(1);
    }
  });

  it('calls the other curses available, not missing, when a Warlock is in the raid', () => {
    const roster = emptyRoster(40);
    add(roster, 0, 0, 'warlock', 302, 'Gul');
    const cov = computeCoverage(roster);

    // The one they are actually casting.
    expect(cov.byEffect.get('curse-of-the-elements')!.covered).toBe(true);

    // The rest are a setting away, not absent from the raid.
    for (const id of ['curse-of-recklessness', 'curse-of-weakness', 'curse-of-shadow', 'curse-of-tongues']) {
      const c = cov.byEffect.get(id)!;
      expect(c.covered, id).toBe(false);
      expect(c.possibleBy.map((p) => p.name), id).toEqual(['Gul']);
    }
  });

  it('still calls something missing when no class in the raid can bring it', () => {
    const roster = emptyRoster(40);
    add(roster, 0, 0, 'warrior', 161);
    const cov = computeCoverage(roster);
    const ai = cov.byEffect.get('arcane-intellect')!;
    expect(ai.covered).toBe(false);
    expect(ai.possibleBy).toEqual([]);
  });

  it('marks a talent buff available when the right spec is present but untalented', () => {
    const roster = emptyRoster(40);
    const hunter = add(roster, 0, 0, 'hunter', 363, 'Legolas');
    hunter.talentToggles['trueshot-aura'] = false;
    const cov = computeCoverage(roster);
    const ts = cov.byEffect.get('trueshot-aura')!;
    expect(ts.covered).toBe(false);
    expect(ts.possibleBy.map((p) => p.name)).toEqual(['Legolas']);
  });

  it('marks a pet buff available when the class is there but the pet is not out', () => {
    const roster = emptyRoster(40);
    const lock = add(roster, 0, 0, 'warlock', 302, 'Gul');
    lock.loadout['warlock-pet'] = [];
    const cov = computeCoverage(roster);
    expect(cov.byEffect.get('blood-pact')!.possibleBy.map((p) => p.name)).toEqual(['Gul']);
  });

  it('gives every class something covered the moment it is seated', () => {
    for (const spec of ALL_SPECS) {
      const r = emptyRoster(40);
      r.groups[0]![0] = createPlayer(spec.classId, spec.id);
      const cov = computeCoverage(r);
      const covered = [...cov.byEffect.values()].filter((c) => c.covered);
      expect(covered.length, spec.classId + ' ' + spec.name).toBeGreaterThan(0);
    }
  });

  it('leaves nothing stuck as missing that its own class could provide', () => {
    for (const spec of ALL_SPECS) {
      const r = emptyRoster(40);
      r.groups[0]![0] = createPlayer(spec.classId, spec.id);
      const cov = computeCoverage(r);
      for (const c of cov.byEffect.values()) {
        const ownClass = c.effect.providers.some(
          (p) => p.classId === spec.classId && (!p.specs || p.specs.includes(spec.id)),
        );
        if (!ownClass) continue;
        const state = c.covered || c.possibleBy.length > 0;
        expect(state, spec.classId + ' ' + spec.name + ' -> ' + c.effect.id).toBe(true);
      }
    }
  });
});

describe('spreading choices across classmates', () => {
  /* Seat players the way the page does: each one is spread against whoever is already
     on the roster, so the nth player of a class sees the n-1 before them. */
  function fill(roster: Roster, classId: ClassId, specId: number, count: number): Player[] {
    const out: Player[] = [];
    for (let i = 0; i < count; i += 1) {
      const here: Player[] = [];
      for (const group of roster.groups) for (const p of group) if (p) here.push(p);
      const player = spreadChoices(createPlayer(classId, specId), here);
      roster.groups[Math.floor(i / 5)]![i % 5] = player;
      out.push(player);
    }
    return out;
  }

  it('gives four Warlocks four different curses', () => {
    const roster = emptyRoster(40);
    const picks = fill(roster, 'warlock', 302, 4).map((p) => p.loadout['warlock-curse']?.[0]);
    expect(new Set(picks).size).toBe(4);
    expect(picks[0]).toBe('curse-of-the-elements');
  });

  it('gives four Paladins four different blessings', () => {
    const roster = emptyRoster(40);
    const picks = fill(roster, 'paladin', 382, 4).map((p) => p.loadout['paladin-blessing']?.[0]);
    expect(new Set(picks).size).toBe(4);
  });

  it('gives two Hunters different stings', () => {
    const roster = emptyRoster(40);
    const picks = fill(roster, 'hunter', 361, 2).map((p) => p.loadout['hunter-sting']?.[0]);
    expect(picks[0]).not.toBe(picks[1]);
  });

  it('leaves party buffs alone, because a second group needs its own', () => {
    const roster = emptyRoster(40);
    const paladins = fill(roster, 'paladin', 382, 3);
    const auras = paladins.map((p) => p.loadout['paladin-aura']?.[0]);
    // Devotion Aura in three different groups is three groups covered, not a mistake.
    expect(new Set(auras).size).toBe(1);
  });

  it('leaves totems alone for the same reason', () => {
    const roster = emptyRoster(40);
    const shamans = fill(roster, 'shaman', 263, 3);
    for (const group of ['shaman-earth', 'shaman-air', 'shaman-water', 'shaman-fire']) {
      const picks = shamans.map((p) => p.loadout[group]?.[0]);
      expect(new Set(picks).size, group).toBe(1);
    }
  });

  it('does not touch a player who has no classmate yet', () => {
    const roster = emptyRoster(40);
    const alone = spreadChoices(createPlayer('warlock', 302), []);
    expect(alone.loadout['warlock-curse']).toEqual(['curse-of-the-elements']);
    expect(roster.groups[0]![0]).toBeNull();
  });

  it('keeps every curse in play once there are more Warlocks than curses', () => {
    const roster = emptyRoster(40);
    const picks = fill(roster, 'warlock', 302, 8).map((p) => p.loadout['warlock-curse']?.[0]);
    // Past the end of the list the default stands rather than the slot emptying.
    expect(picks.every((p) => typeof p === 'string' && p.length > 0)).toBe(true);
  });

  it('never picks a curse the Warlock would need a talent for', () => {
    const roster = emptyRoster(40);
    const picks = fill(roster, 'warlock', 302, 6).map((p) => p.loadout['warlock-curse']?.[0]);
    // Curse of Exhaustion is an Affliction talent, so it is not something to assume.
    expect(picks).not.toContain('curse-of-exhaustion');
  });
});
