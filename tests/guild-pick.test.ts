import { describe, expect, it } from 'vitest';
import { chooseGuild, keepCharacter } from '../src/guild/pick';

const ONE = { id: '900000000000000001', name: 'Nightfall' };
const TWO = { id: '900000000000000002', name: 'Second Wind' };

describe('settling on a server', () => {
  it('honours a link that names one the account can see', () => {
    expect(chooseGuild([ONE, TWO], TWO.id)).toBe(TWO.id);
  });

  it('takes the only server there is, rather than asking', () => {
    expect(chooseGuild([ONE], null)).toBe(ONE.id);
  });

  it('asks when there are several and the link named none', () => {
    // Guessing which guild somebody meant shows the wrong roster silently.
    expect(chooseGuild([ONE, TWO], null)).toBeNull();
  });

  it('ignores a server this account cannot see', () => {
    // A stale link would otherwise ask the bot for characters it will refuse.
    expect(chooseGuild([ONE, TWO], '900000000000000009')).toBeNull();
  });

  it('falls back to the only server when the link names another', () => {
    expect(chooseGuild([ONE], '900000000000000009')).toBe(ONE.id);
  });

  it('answers nothing when the bot is in none of them', () => {
    expect(chooseGuild([], ONE.id)).toBeNull();
    expect(chooseGuild([], null)).toBeNull();
  });
});

describe('whether the open character survives', () => {
  it('stays while the server does', () => {
    expect(keepCharacter(ONE.id, ONE.id, 42)).toBe(42);
  });

  it('goes when the server changes, because the id belongs to the old one', () => {
    expect(keepCharacter(ONE.id, TWO.id, 42)).toBeNull();
  });

  it('goes when the server goes', () => {
    expect(keepCharacter(ONE.id, null, 42)).toBeNull();
  });

  it('stays absent when there was none', () => {
    expect(keepCharacter(ONE.id, ONE.id, null)).toBeNull();
  });
});
