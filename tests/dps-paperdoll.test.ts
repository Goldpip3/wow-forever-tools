import { describe, expect, it } from 'vitest';
import { PAPERDOLL } from '../src/dps/render';
import { SLOTS } from '../src/dps/export-format';

/**
 * The gear panel draws from a fixed arrangement rather than from SLOTS, so a slot
 * added to the game and to the import would otherwise be read, scored and then
 * never drawn. This catches that, which no other test would.
 */
describe('the character sheet arrangement', () => {
  const laidOut = [...PAPERDOLL.left, ...PAPERDOLL.right, ...PAPERDOLL.weapons];

  it('has a square for every slot', () => {
    expect([...laidOut].sort()).toEqual([...SLOTS].sort());
  });

  it('puts each slot in exactly one place', () => {
    expect(new Set(laidOut).size).toBe(laidOut.length);
  });

  it('keeps the weapons in the row underneath', () => {
    expect(PAPERDOLL.weapons).toEqual(['mainhand', 'offhand', 'ranged']);
  });
});
