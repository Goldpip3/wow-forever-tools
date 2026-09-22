import { describe, expect, it } from 'vitest';
import { sliderValue, stepValue } from '../src/guild/number-field';

/**
 * The arithmetic behind the level and profession-skill controls.
 *
 * Both were a bare number box, and both are now a value that can be nudged,
 * dragged or typed. The parts worth testing are the edges: stepping off the end
 * of the range, stepping from a field nobody has filled in, and being handed
 * something that is not a number because it was pasted in.
 */

describe('nudging a level', () => {
  it('moves by the step', () => {
    expect(stepValue('58', 1, 1, 60)).toBe('59');
    expect(stepValue('58', -1, 1, 60)).toBe('57');
  });

  it('stops at the top and the bottom rather than going past them', () => {
    expect(stepValue('60', 1, 1, 60)).toBe('60');
    expect(stepValue('1', -1, 1, 60)).toBe('1');
  });

  it('starts at the bottom of the range from an empty field', () => {
    expect(stepValue('', 1, 1, 60)).toBe('1');
    expect(stepValue('   ', 1, 1, 60)).toBe('1');
  });

  it('does not go below the bottom from an empty field', () => {
    expect(stepValue('', -1, 1, 60)).toBe('1');
  });
});

describe('nudging a profession skill', () => {
  it('moves by five, which is how skill-ups read in game', () => {
    expect(stepValue('280', 5, 1, 300)).toBe('285');
    expect(stepValue('285', -5, 1, 300)).toBe('280');
  });

  it('clamps a step that would overshoot the maximum', () => {
    expect(stepValue('298', 5, 1, 300)).toBe('300');
  });

  it('pulls a value from outside the range back inside it', () => {
    // A number typed before the cap was known, or pasted from somewhere else.
    expect(stepValue('900', -5, 1, 300)).toBe('295');
    expect(stepValue('900', 5, 1, 300)).toBe('300');
  });

  it('treats something that is not a number as nothing said', () => {
    expect(stepValue('three hundred', 5, 1, 300)).toBe('1');
  });
});

describe('where the slider sits', () => {
  it('follows the value', () => {
    expect(sliderValue('285', 1, 300)).toBe(285);
  });

  it('rests at the bottom when nothing has been said', () => {
    // Which is why the slider is drawn faded until there is a value: at the
    // bottom of the range it would otherwise read as an answer of one.
    expect(sliderValue('', 1, 300)).toBe(1);
  });

  it('never leaves the track, whatever the field holds', () => {
    expect(sliderValue('9999', 1, 300)).toBe(300);
    expect(sliderValue('-40', 1, 300)).toBe(1);
    expect(sliderValue('nonsense', 1, 300)).toBe(1);
  });

  it('rounds a value that arrived with a decimal on it', () => {
    expect(sliderValue('60.6', 1, 60)).toBe(60);
    expect(sliderValue('12.2', 1, 60)).toBe(12);
  });
});
