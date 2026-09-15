import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { TalentData } from '../src/talents/types';
import { parseCode, ranksFromCode } from '../src/talents/codec';
import { EXPORT_PREFIX } from '../src/dps/export-format';
import { looksLikeCharacterExport, parseCharacterExport, stripPrefix } from '../src/dps/importer';
import { buildCodeFromExport, specIdFromTabs, talentRanksFromExport } from '../src/dps/talents';
import { decodeCharacter, encodeCharacter, trimForLink } from '../src/dps/codec';
import { canUse } from '../src/dps/proficiency';
import { SAMPLE_EXPORT } from '../src/dps/sample';

const here = resolve(fileURLToPath(import.meta.url), '..');

const RAW = readFileSync(resolve(here, 'fixtures/mage-frost.json'), 'utf8');
const BROKEN = readFileSync(resolve(here, 'fixtures/broken.json'), 'utf8');

const DATA = JSON.parse(
  readFileSync(resolve(here, '../public/data/talents.generated.json'), 'utf8'),
) as TalentData;

const MAGE = DATA.talents.Mage!;

describe('stripPrefix', () => {
  it('takes the addon prefix off', () => {
    expect(stripPrefix(EXPORT_PREFIX + '{"a":1}')).toBe('{"a":1}');
    expect(stripPrefix(EXPORT_PREFIX + ': {"a":1}')).toBe('{"a":1}');
    expect(stripPrefix('  wfsync1{"a":1}  ')).toBe('{"a":1}');
  });

  it('leaves bare JSON alone', () => {
    expect(stripPrefix('{"a":1}')).toBe('{"a":1}');
  });

  it('survives a paste out of a code fence', () => {
    expect(stripPrefix('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });
});

describe('looksLikeCharacterExport', () => {
  it('knows a character from a roster', () => {
    expect(looksLikeCharacterExport(JSON.parse(RAW))).toBe(true);
    expect(looksLikeCharacterExport([{ classKey: 'mage' }])).toBe(false);
    expect(looksLikeCharacterExport({ signUps: [] })).toBe(false);
    expect(looksLikeCharacterExport(null)).toBe(false);
  });
});

describe('parseCharacterExport', () => {
  it('reads the fixture', () => {
    const result = parseCharacterExport(RAW, MAGE);
    expect(result.error).toBeUndefined();
    const c = result.character!;
    expect(c.classId).toBe('mage');
    expect(c.source.name).toBe('Frostweaver');
    expect(c.source.level).toBe(60);
    expect(Object.keys(c.source.equipped)).toHaveLength(17);
  });

  it('reads it just the same behind the addon prefix', () => {
    const withPrefix = parseCharacterExport(EXPORT_PREFIX + RAW, MAGE);
    expect(withPrefix.error).toBeUndefined();
    expect(withPrefix.character!.source.name).toBe('Frostweaver');
  });

  it('refuses an export from a newer addon', () => {
    const result = parseCharacterExport(BROKEN, MAGE);
    expect(result.character).toBeUndefined();
    expect(result.error).toContain('newer addon');
  });

  it('refuses something that is not JSON', () => {
    expect(parseCharacterExport('hello', MAGE).error).toContain('not JSON');
  });

  it('refuses an empty paste', () => {
    expect(parseCharacterExport('   ', MAGE).error).toContain('Nothing to read');
  });

  it('refuses a roster export', () => {
    const result = parseCharacterExport(JSON.stringify({ signUps: [] }), MAGE);
    expect(result.error).toContain('not a character export');
  });

  it('refuses an unknown class', () => {
    const bad = { ...JSON.parse(RAW), classId: 'demonhunter' };
    expect(parseCharacterExport(JSON.stringify(bad), MAGE).error).toContain('Unknown class');
  });

  it('works out weapon DPS from the damage line', () => {
    const c = parseCharacterExport(RAW, MAGE).character!;
    const mh = c.source.equipped.mainhand!;
    // 44 to 82 over 2.2 seconds.
    expect(mh.stats.weaponDps).toBeCloseTo(28.64, 2);
  });

  it('keeps the wand as ranged rather than a weapon slot', () => {
    const c = parseCharacterExport(RAW, MAGE).character!;
    expect(c.source.equipped.ranged!.name).toBe('Wand of Hoarfrost');
  });

  it('skips plate for a mage but keeps the cloth it found', () => {
    const result = parseCharacterExport(RAW, MAGE);
    const names = result.character!.owned.map((i) => i.name);
    expect(names).not.toContain('Breastplate of the Warlord');
    expect(names).toContain('Crown of the Frozen Wastes');
    expect(result.skipped.some((s) => s.name === 'Breastplate of the Warlord')).toBe(true);
  });

  it('names a stat it does not understand instead of swallowing it', () => {
    const result = parseCharacterExport(RAW, MAGE);
    const issue = result.skipped.find((s) => s.reason.includes('dodge'));
    expect(issue).toBeDefined();
    expect(issue!.name).toBe('Sash of Mending');
    const sash = result.character!.owned.find((i) => i.name === 'Sash of Mending')!;
    expect('dodge' in sash.stats).toBe(false);
    expect(sash.stats.intellect).toBe(22);
  });

  it('warns about a stale bank', () => {
    const result = parseCharacterExport(RAW, MAGE);
    expect(result.warnings.some((w) => w.includes('bank'))).toBe(true);
  });

  it('warns when the export was taken with buffs up', () => {
    const buffed = { ...JSON.parse(RAW), activeBuffs: ['Arcane Intellect', 'Flask of Supreme Power'] };
    const result = parseCharacterExport(JSON.stringify(buffed), MAGE);
    expect(result.warnings.some((w) => w.includes('unbuffed'))).toBe(true);
  });

  it('keeps an equipped item even when the proficiency table disagrees', () => {
    const odd = JSON.parse(RAW);
    odd.equipped.chest.subType = 'Plate';
    const c = parseCharacterExport(JSON.stringify(odd), MAGE).character!;
    expect(c.owned.some((i) => i.name === 'Robes of the Frozen Veil')).toBe(true);
  });

  it('imports without talent data and leaves the build code empty', () => {
    const result = parseCharacterExport(RAW);
    expect(result.character!.build).toBe('');
    expect(result.character!.specId).toBe(61);
  });
});

describe('talents', () => {
  const tabs = JSON.parse(RAW).talents;

  it('picks the spec with the most points', () => {
    expect(specIdFromTabs('mage', tabs)).toBe(61);
  });

  it('collects ranks by name and leaves out what is untaken', () => {
    const ranks = talentRanksFromExport(tabs);
    expect(ranks['Improved Frostbolt']).toBe(5);
    expect(ranks["Winter's Chill"]).toBe(5);
    expect(ranks.Ignite).toBeUndefined();
  });

  it('builds a code the calculator reads back to the same ranks', () => {
    const code = buildCodeFromExport('mage', tabs, MAGE);
    const parsed = parseCode(code)!;
    expect(parsed.classKey).toBe('mage');
    expect(parsed.level).toBe(60);

    const ranks = ranksFromCode(MAGE, parsed);
    MAGE.trees.forEach((tree, treeIdx) => {
      const tab = tabs.find((t: { tab: string }) => t.tab === tree.name);
      tree.talents.forEach((talent, i) => {
        const expected = tab.list.find((t: { name: string }) => t.name === talent.name).rank;
        expect(ranks[treeIdx]![i]).toBe(expected);
      });
    });
  });

  it('spends fifty-one points, which is the level sixty budget', () => {
    const code = buildCodeFromExport('mage', tabs, MAGE);
    const spent = [...code.split('/')[2]!].reduce((sum, ch) => sum + (Number(ch) || 0), 0);
    expect(spent).toBe(51);
  });

  it('falls back to the grid position when a talent was renamed', () => {
    const renamed = JSON.parse(JSON.stringify(tabs));
    const frost = renamed.find((t: { tab: string }) => t.tab === 'Frost');
    const entry = frost.list.find((t: { name: string }) => t.name === 'Improved Frostbolt');
    entry.name = 'Better Frostbolt';
    const code = buildCodeFromExport('mage', renamed, MAGE);
    const ranks = ranksFromCode(MAGE, parseCode(code)!);
    const treeIdx = MAGE.trees.findIndex((t) => t.name === 'Frost');
    const talentIdx = MAGE.trees[treeIdx]!.talents.findIndex((t) => t.name === 'Improved Frostbolt');
    expect(ranks[treeIdx]![talentIdx]).toBe(5);
  });

  it('matches tabs by name even when the client lists them in another order', () => {
    const shuffled = [...tabs].reverse();
    expect(specIdFromTabs('mage', shuffled)).toBe(61);
    expect(buildCodeFromExport('mage', shuffled, MAGE)).toBe(buildCodeFromExport('mage', tabs, MAGE));
  });
});

describe('proficiency', () => {
  const item = (equipLoc: string, subType: string) =>
    ({ id: 1, name: 'x', equipLoc, subType, quality: 3, stats: {}, location: { where: 'bag' } }) as const;

  it('keeps a mage off plate and out of a shield', () => {
    expect(canUse('mage', item('INVTYPE_CHEST', 'Plate')).usable).toBe(false);
    expect(canUse('mage', item('INVTYPE_SHIELD', 'Shields')).usable).toBe(false);
    expect(canUse('warrior', item('INVTYPE_SHIELD', 'Shields')).usable).toBe(true);
  });

  it('lets anyone wear a ring or a cloak whatever the subtype says', () => {
    expect(canUse('mage', item('INVTYPE_FINGER', 'Miscellaneous')).usable).toBe(true);
    expect(canUse('warrior', item('INVTYPE_CLOAK', 'Cloth')).usable).toBe(true);
  });

  it('knows which weapons a class trained', () => {
    expect(canUse('mage', item('INVTYPE_WEAPONMAINHAND', 'One-Handed Swords')).usable).toBe(true);
    expect(canUse('mage', item('INVTYPE_2HWEAPON', 'Two-Handed Axes')).usable).toBe(false);
    expect(canUse('rogue', item('INVTYPE_WEAPON', 'Daggers')).usable).toBe(true);
    expect(canUse('rogue', item('INVTYPE_2HWEAPON', 'Two-Handed Swords')).usable).toBe(false);
  });

  it('ignores a shirt', () => {
    expect(canUse('mage', item('INVTYPE_BODY', 'Cloth')).usable).toBe(false);
  });
});

describe('codec', () => {
  it('round trips a character', () => {
    const source = parseCharacterExport(RAW, MAGE).character!.source;
    const back = decodeCharacter(encodeCharacter(source))!;
    expect(back.name).toBe('Frostweaver');
    expect(back.bags).toHaveLength(source.bags.length);
    expect(Object.keys(back.equipped)).toHaveLength(17);
  });

  it('drops bags and bank from a shared link', () => {
    const source = parseCharacterExport(RAW, MAGE).character!.source;
    const trimmed = decodeCharacter(encodeCharacter(source, { trim: true }))!;
    expect(trimmed.bags).toHaveLength(0);
    expect(trimmed.bank).toHaveLength(0);
    expect(Object.keys(trimmed.equipped)).toHaveLength(17);
    expect(trimmed.talents).toHaveLength(3);
  });

  it('keeps a trimmed link small enough for a browser', () => {
    const source = parseCharacterExport(RAW, MAGE).character!.source;
    expect(encodeCharacter(source, { trim: true }).length).toBeLessThan(8000);
  });

  it('leaves the original alone when trimming', () => {
    const source = parseCharacterExport(RAW, MAGE).character!.source;
    trimForLink(source);
    expect(source.bags.length).toBeGreaterThan(0);
  });

  it('returns null for junk', () => {
    expect(decodeCharacter('')).toBeNull();
    expect(decodeCharacter('not-a-code')).toBeNull();
  });
});

describe('the bundled sample', () => {
  it('imports cleanly', () => {
    const result = parseCharacterExport(SAMPLE_EXPORT, MAGE);
    expect(result.error).toBeUndefined();
    expect(result.skipped).toHaveLength(0);
    expect(result.character!.specId).toBe(61);
    expect(result.character!.source.name).toBe('Sample');
  });
});
