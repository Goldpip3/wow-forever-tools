import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { FERAL_SPEC_ID, CLASS_IDS, roleOf, seatSpecOf, seatSpecsFor } from '../src/shared/classes';
import { computeCoverage, emptyRoster, specLabel } from '../src/raid/engine';
import { createPlayer } from '../src/raid/loadout';
import { decodeRoster, encodeRoster } from '../src/raid/codec';
import { overview } from '../src/raid/suggestions';
import { specKeyForSpecId } from '../src/raid/groupbuilder';

const ICON_DIR = resolve(__dirname, '../public/assets/icons');

describe('Feral Druids as a bear or a cat', () => {
  it('offers Feral twice, as a bear tank and a cat, on the one tree', () => {
    const druid = seatSpecsFor('druid');
    expect(druid.map((s) => s.short)).toEqual(['Balance', 'Bear', 'Cat', 'Resto']);
    const feral = druid.filter((s) => s.specId === FERAL_SPEC_ID);
    expect(feral.map((s) => s.role)).toEqual(['tank', undefined]);
  });

  it('leaves every other class as it was', () => {
    for (const id of CLASS_IDS) {
      if (id === 'druid') continue;
      expect(seatSpecsFor(id).every((s) => !s.role), id).toBe(true);
    }
  });

  it('has an icon on disk for every seat spec', () => {
    for (const id of CLASS_IDS) {
      for (const s of seatSpecsFor(id)) {
        expect(existsSync(resolve(ICON_DIR, s.icon + '.jpg')), s.icon).toBe(true);
      }
    }
  });

  it('counts a bear as a tank and a cat as melee', () => {
    const bear = createPlayer('druid', FERAL_SPEC_ID, 'Ursoc');
    bear.role = 'tank';
    const cat = createPlayer('druid', FERAL_SPEC_ID, 'Shadowclaw');
    expect(roleOf(bear)).toBe('tank');
    expect(roleOf(cat)).toBe('melee');
    expect(seatSpecOf(bear)?.short).toBe('Bear');
    expect(seatSpecOf(cat)?.short).toBe('Cat');
    expect(specLabel(bear)).toBe('Feral Combat (bear tank) Druid');

    const roster = emptyRoster(10);
    roster.groups[0]![0] = bear;
    roster.groups[0]![1] = cat;
    expect(overview(roster).counts).toMatchObject({ tank: 1, melee: 1 });
  });

  it('keeps the bear through the planner link', () => {
    const roster = emptyRoster(10);
    const bear = createPlayer('druid', FERAL_SPEC_ID, 'Ursoc');
    bear.role = 'tank';
    roster.groups[0]![0] = bear;
    const back = decodeRoster(encodeRoster(roster))!;
    expect(back.groups[0]![0]!.role).toBe('tank');
    expect(seatSpecOf(back.groups[0]![0]!)?.short).toBe('Bear');
  });

  it('sends the bot a bear as guardian and a cat as feral', () => {
    expect(specKeyForSpecId(FERAL_SPEC_ID, 'tank')).toBe('guardian');
    expect(specKeyForSpecId(FERAL_SPEC_ID, undefined)).toBe('feral');
  });

  it('still gives Leader of the Pack from either', () => {
    for (const role of ['tank', undefined] as const) {
      const roster = emptyRoster(10);
      const druid = createPlayer('druid', FERAL_SPEC_ID);
      if (role) druid.role = role;
      roster.groups[0]![0] = druid;
      expect(computeCoverage(roster).byEffect.get('leader-of-the-pack')!.covered, String(role)).toBe(true);
    }
  });
});
