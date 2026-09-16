import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { specModule, supportedSpecs } from '../src/dps/sim/specs';
import { CLASSES, specById } from '../src/shared/classes';
import { check } from '../src/dps/sim/apl';
import type { TalentData } from '../src/talents/types';

const DATA: TalentData = JSON.parse(
  readFileSync(resolve(__dirname, '../public/data/talents.generated.json'), 'utf8'),
);

/**
 * The guard against a hook that can never fire.
 *
 * Forever moved its talents. A hook keyed to a Classic name compiles, runs, and
 * does nothing at all, which is the worst kind of wrong: the damage figure is
 * quietly short and there is nothing to notice. Every spec's hooks are checked
 * against the tree the game actually has.
 */
function talentNamesFor(classKey: string): Set<string> {
  const names = new Set<string>();
  const cls = DATA.talents[classKey];
  if (!cls) return names;
  for (const tree of cls.trees) for (const talent of tree.talents) names.add(talent.name);
  return names;
}

/** The class a spec belongs to, spelled the way the talent data spells it. */
function classKeyOf(specId: number): string {
  const spec = specById(specId);
  if (!spec) throw new Error('no spec ' + specId);
  return CLASSES[spec.classId].name;
}

describe('every spec that has been written', () => {
  const ids = supportedSpecs();

  it('has at least the mage and both warriors in it', () => {
    expect(ids.length).toBeGreaterThanOrEqual(3);
  });

  for (const specId of ids) {
    const spec = specModule(specId)!;

    describe(spec.label, () => {
      it('keys every talent hook to a name the game has', () => {
        const names = talentNamesFor(classKeyOf(specId));
        expect(names.size).toBeGreaterThan(0);
        for (const hook of Object.keys(spec.talentHooks)) {
          expect(names, hook + ' is not in the ' + classKeyOf(specId) + ' tree').toContain(hook);
        }
      });

      it('names only real talents in what it says it does not model', () => {
        const names = talentNamesFor(classKeyOf(specId));
        for (const talent of Object.keys(spec.unmodelledTalents ?? {})) {
          expect(names, talent + ' is not in the ' + classKeyOf(specId) + ' tree').toContain(talent);
        }
      });

      it('does not both model a talent and claim it does not', () => {
        for (const talent of Object.keys(spec.unmodelledTalents ?? {})) {
          expect(spec.talentHooks[talent], talent).toBeUndefined();
        }
      });

      it('has a hook behind every talent it says is only half modelled', () => {
        const names = talentNamesFor(classKeyOf(specId));
        for (const talent of Object.keys(spec.partlyModelledTalents ?? {})) {
          expect(names, talent).toContain(talent);
          expect(spec.talentHooks[talent], talent).toBeDefined();
          expect(spec.unmodelledTalents?.[talent], talent).toBeUndefined();
        }
      });

      it('has a rotation that only names abilities it declares', () => {
        const declared = new Set(spec.spells.map((s) => s.id));
        for (const name of Object.keys(spec.rotations)) {
          for (const line of spec.rotations[name]!({})) {
            expect(declared, name + ' asks for ' + line.spellId).toContain(line.spellId);
          }
        }
      });

      it('writes every rotation condition in words the editor can read', () => {
        for (const name of Object.keys(spec.rotations)) {
          for (const line of spec.rotations[name]!({})) {
            // A line with a predicate and no words cannot be shown or edited.
            if (line.when) expect(line.text, name + ' / ' + line.spellId).toBeTruthy();
            expect(check(line.text ?? ''), name + ' / ' + line.text).toBeNull();
          }
        }
      });

      it('tags every ability with where its numbers came from', () => {
        for (const ability of spec.spells) {
          expect(ability.forever?.status, ability.id).toBeTruthy();
        }
      });

      it('measures a stat it can actually move', () => {
        expect(spec.weightStats.length).toBeGreaterThan(0);
        const measured = spec.weightStats.map((w) => w.stat);
        expect(measured).toContain(spec.referenceStat);
        for (const entry of spec.weightStats) expect(entry.step).toBeGreaterThan(0);
      });
    });
  }
});

describe('the samples', () => {
  it('include a character of every class that has a simulation', async () => {
    const { SAMPLES } = await import('../src/dps/samples');
    const { parseCharacterExport } = await import('../src/dps/importer');

    const sampled = new Set(SAMPLES.map((s) => parseCharacterExport(s.text).character!.classId));
    for (const specId of supportedSpecs()) {
      const classId = specById(specId)!.classId;
      expect(sampled, 'no sample for ' + classId).toContain(classId);
    }
  });

  it('each load as a spec that has a simulation', async () => {
    const { SAMPLES } = await import('../src/dps/samples');
    const { parseCharacterExport } = await import('../src/dps/importer');
    for (const sample of SAMPLES) {
      const imported = parseCharacterExport(sample.text);
      expect(imported.error, sample.key).toBeUndefined();
      expect(imported.skipped, sample.key).toEqual([]);
      expect(specModule(imported.character!.specId), sample.key).toBeDefined();
    }
  });
});
