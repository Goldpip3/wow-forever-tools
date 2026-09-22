import { describe, expect, it } from 'vitest';
import { ago, classIdOf, classNameOf, specNameOf } from '../src/guild/render';
import { PAPERDOLL, PAPERDOLL_SLOTS, qualityColor, wornCount } from '../src/shared/gear-view';
import { SLOT_LABEL } from '../src/dps/export-format';

describe('turning the bot’s keys into words', () => {
  it('knows the nine classes', () => {
    expect(classIdOf('warrior')).toBe('warrior');
    expect(classNameOf('warlock')).toBe('Warlock');
  });

  it('gives an unknown class back rather than throwing', () => {
    expect(classIdOf('deathknight')).toBeNull();
    expect(classNameOf('deathknight')).toBe('deathknight');
  });

  it('names a spec from its signup key', () => {
    expect(specNameOf('warrior', 'prot_war')).toBe('Protection');
    expect(specNameOf('priest', 'holy_priest')).toBe('Holy');
    expect(specNameOf('shaman', 'resto_sham')).toBe('Restoration');
  });

  it('tells the cat from the bear, which share one tree', () => {
    // Group Builder splits Feral Combat in two and the planner does not, so the
    // profile has to say which of them this is.
    expect(specNameOf('druid', 'feral')).toContain('cat');
    expect(specNameOf('druid', 'guardian')).toContain('bear');
  });

  it('answers nothing when no spec was chosen', () => {
    expect(specNameOf('paladin', null)).toBeNull();
  });
});

describe('how long ago something was entered', () => {
  const NOW = 1_790_000_000;
  const DAY = 86_400;

  it('reads the way somebody would say it', () => {
    expect(ago(NOW, NOW)).toBe('today');
    expect(ago(NOW - DAY, NOW)).toBe('yesterday');
    expect(ago(NOW - 5 * DAY, NOW)).toBe('5 days ago');
    expect(ago(NOW - 45 * DAY, NOW)).toBe('a month ago');
    expect(ago(NOW - 200 * DAY, NOW)).toBe('6 months ago');
    expect(ago(NOW - 400 * DAY, NOW)).toBe('a year ago');
  });

  it('does not count backwards when a clock is out by a little', () => {
    expect(ago(NOW + 600, NOW)).toBe('today');
  });
});

describe('the character sheet', () => {
  it('lays out every slot once', () => {
    expect(new Set(PAPERDOLL_SLOTS).size).toBe(PAPERDOLL_SLOTS.length);
    expect(PAPERDOLL_SLOTS).toHaveLength(17);
  });

  it('labels every slot it lays out', () => {
    for (const slot of PAPERDOLL_SLOTS) expect(SLOT_LABEL[slot]).toBeTruthy();
  });

  it('keeps the weapons on their own row, in the game’s order', () => {
    expect(PAPERDOLL.weapons).toEqual(['mainhand', 'offhand', 'ranged']);
  });

  it('counts only the slots with something in them', () => {
    expect(wornCount({})).toBe(0);
    expect(wornCount({ head: { name: 'x' } as never, waist: { name: 'y' } as never })).toBe(2);
  });

  it('colours an item by its quality, and clamps anything odd', () => {
    expect(qualityColor(4)).toBe('#a335ee');
    expect(qualityColor(0)).toBe('#9d9d9d');
    expect(qualityColor(99)).toBe('#ff8000');
    expect(qualityColor(-5)).toBe('#9d9d9d');
  });
});
