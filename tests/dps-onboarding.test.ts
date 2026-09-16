import { describe, expect, it } from 'vitest';

import { supportedSpecsSentence } from '../src/dps/render-sim';
import { specModule, supportedSpecs } from '../src/dps/sim/specs';
import { CLASSES, specById } from '../src/shared/classes';

describe('the sentence naming the specs that work', () => {
  const sentence = supportedSpecsSentence();

  it('names every spec the simulator has, from the registry', () => {
    for (const id of supportedSpecs()) {
      const label = specModule(id)!.label;
      const className = CLASSES[specById(id)!.classId].name;
      expect(sentence, label).toContain(label.replace(' ' + className, ''));
      expect(sentence, label).toContain(className);
    }
  });

  it('includes Combat Rogue, which the hand-written list left out', () => {
    expect(sentence).toMatch(/Combat Rogue/);
  });

  it('reads as a list', () => {
    expect(sentence).toMatch(/ and /);
    expect(sentence).not.toMatch(/,\s*,|undefined/);
  });
});
