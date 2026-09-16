import { describe, expect, it } from 'vitest';
import { compressToEncodedURIComponent } from 'lz-string';

import { createPlayer } from '../src/raid/loadout';
import { computeCoverage, emptyRoster } from '../src/raid/engine';
import { effectById } from '../src/raid/effects/index';
import { SIM_BUFF_FOR, handoffFor, handoffLink } from '../src/raid/handoff';
import { buffById } from '../src/dps/data/buffs';
import { applyHandoff, decodeHandoff, planHandoff } from '../src/dps/handoff';
import { parseCharacterExport } from '../src/dps/importer';
import { SAMPLE_WARRIOR_EXPORT } from '../src/dps/sample-warrior';
import { deriveStatSheet } from '../src/dps/stats';
import type { FightConfig } from '../src/dps/sim/types';
import type { Roster } from '../src/raid/types';

/** Group 1 melee with an Enhancement shaman on Windfury; group 2 casters with Mana Spring. */
function raid(): { roster: Roster; warrior: ReturnType<typeof createPlayer>; mage: ReturnType<typeof createPlayer> } {
  const roster = emptyRoster(40);
  const warrior = createPlayer('warrior', 164);
  const enh = createPlayer('shaman', 263);
  enh.loadout['shaman-air'] = ['windfury-totem'];
  enh.loadout['shaman-earth'] = ['strength-of-earth-totem'];
  enh.loadout['shaman-water'] = [];
  const mage = createPlayer('mage', 61);
  const ele = createPlayer('shaman', 261);
  ele.loadout['shaman-water'] = ['mana-spring-totem'];
  ele.loadout['shaman-air'] = [];
  ele.loadout['shaman-earth'] = [];
  roster.groups[0]![0] = warrior;
  roster.groups[0]![1] = enh;
  roster.groups[1]![0] = mage;
  roster.groups[1]![1] = ele;
  return { roster, warrior, mage };
}

describe('the planner-to-gear mapping', () => {
  it('names only planner effects and simulator buffs that exist', () => {
    for (const [raidId, simId] of Object.entries(SIM_BUFF_FOR)) {
      expect(effectById(raidId), raidId).toBeDefined();
      expect(buffById(simId), simId).toBeDefined();
    }
  });
});

describe('what a player takes over to the gear page', () => {
  it('gives a melee party and a caster party different buffs', () => {
    const { roster, warrior, mage } = raid();
    const coverage = computeCoverage(roster);
    const melee = handoffFor(roster, coverage, warrior)!;
    const caster = handoffFor(roster, coverage, mage)!;
    expect(melee.group).toBe(1);
    expect(caster.group).toBe(2);
    expect(melee.simulated).toContain('windfury-totem');
    expect(melee.simulated).not.toContain('mana-spring-totem');
    expect(caster.simulated).toContain('mana-spring-totem');
    expect(caster.simulated).not.toContain('windfury-totem');
    // Raid-wide ones reach both groups.
    expect(melee.simulated).toContain('arcane-intellect');
    expect(caster.simulated).toContain('arcane-intellect');
  });

  it('ticks only what suits the character, and says what it left off and why', () => {
    const { roster, warrior, mage } = raid();
    const coverage = computeCoverage(roster);
    const forWarrior = planHandoff(handoffFor(roster, coverage, warrior)!, 'melee');
    const forMage = planHandoff(handoffFor(roster, coverage, mage)!, 'caster');
    expect(forWarrior.apply.buffs).toContain('windfury-totem');
    expect(forWarrior.apply.buffs).not.toContain('arcane-intellect');
    expect(forWarrior.notForRole).toContain('Arcane Intellect');
    expect(forMage.apply.buffs).toContain('mana-spring-totem');
    expect(forMage.apply.buffs).toContain('arcane-intellect');
  });

  it('keeps anything the simulator does not model visible by name', () => {
    const { roster, warrior } = raid();
    const druid = createPlayer('druid', 281);
    roster.groups[0]![2] = druid;
    const handoff = handoffFor(roster, computeCoverage(roster), warrior)!;
    const plan = planHandoff(handoff, 'melee');
    expect(plan.notSimulated.length).toBeGreaterThan(0);
    expect([...plan.notSimulated, ...handoff.notSimulated].join(' ')).toMatch(/Leader of the Pack/);
  });

  it('leaves nobody outside the raid to hand over', () => {
    const { roster } = raid();
    const benched = createPlayer('rogue', 181);
    roster.bench.push(benched);
    expect(handoffFor(roster, computeCoverage(roster), benched)).toBeNull();
  });

  it('survives the link, and a broken link opens nothing', () => {
    const { roster, warrior } = raid();
    const handoff = handoffFor(roster, computeCoverage(roster), warrior)!;
    const link = handoffLink(handoff, 'dps.html');
    expect(decodeHandoff(link.split('#')[1]!)).toEqual(handoff);
    expect(decodeHandoff('h=garbage')).toBeNull();
    expect(decodeHandoff('h=' + compressToEncodedURIComponent(JSON.stringify({ ...handoff, group: 99 })))).toBeNull();
    expect(decodeHandoff('h=' + compressToEncodedURIComponent(JSON.stringify({ ...handoff, simulated: 'all' })))).toBeNull();
  });
});

describe('ticking the handoff on the gear page', () => {
  const fight: FightConfig = {
    duration: 60, iterations: 1, seed: 1,
    target: { level: 63, armor: 3000, resistance: 0, behind: true, canParry: false, canBlock: false },
    buffs: [], debuffs: [], consumables: ['elixir-of-the-mongoose'],
  };

  it('replaces the raid buffs and debuffs and keeps the consumables', () => {
    const { roster, warrior } = raid();
    const plan = planHandoff(handoffFor(roster, computeCoverage(roster), warrior)!, 'melee');
    const next = applyHandoff(fight, plan);
    expect(next.buffs).toEqual(plan.apply.buffs);
    expect(next.debuffs).toEqual(plan.apply.debuffs);
    expect(next.consumables).toEqual(['elixir-of-the-mongoose']);
  });

  it('does not add a buff twice that was up when the character was exported', () => {
    const exported = parseCharacterExport(SAMPLE_WARRIOR_EXPORT).character!;
    exported.source.activeBuffs = ['Battle Shout'];
    const plan = { apply: { buffs: ['battle-shout'], debuffs: [] }, notForRole: [], notSimulated: [] };
    const without = deriveStatSheet(exported, { ...fight, consumables: [] });
    const withIt = deriveStatSheet(exported, applyHandoff({ ...fight, consumables: [] }, plan));
    expect(withIt.attackPower).toBe(without.attackPower);
    // Not up at export, the same buff does add its attack power.
    const clean = parseCharacterExport(SAMPLE_WARRIOR_EXPORT).character!;
    expect(deriveStatSheet(clean, applyHandoff({ ...fight, consumables: [] }, plan)).attackPower)
      .toBeGreaterThan(deriveStatSheet(clean, { ...fight, consumables: [] }).attackPower);
  });
});
