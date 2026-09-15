#!/usr/bin/env node
/**
 * Fetches talentsforever.com/data.json, writes the subset the site needs to
 * public/data/talents.generated.json, and collects every icon name and tree
 * background id into scripts/asset-manifest.json for fetch-assets.mjs.
 *
 * Data is CC BY 4.0 from talentsforever.com; the footer credits it with a link.
 */
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = process.env.TF_URL ?? 'https://talentsforever.com/data.json';
const OUT_DATA = resolve(ROOT, 'public/data/talents.generated.json');
const OUT_MANIFEST = resolve(ROOT, 'scripts/asset-manifest.json');

async function main() {
  console.log(`Fetching ${SOURCE}`);
  const res = await fetch(SOURCE, { headers: { 'User-Agent': 'Mozilla/5.0 (wow-forever-tools importer)' } });
  if (!res.ok) throw new Error(`${SOURCE} returned ${res.status}`);
  const data = await res.json();

  const icons = new Set();
  const backgrounds = new Set();
  const addIcon = (name) => {
    if (typeof name === 'string' && name.trim()) icons.add(name.trim().toLowerCase());
  };

  // --- talents: class icon, tree icons + backgrounds, talent icons
  for (const [className, cls] of Object.entries(data.talents ?? {})) {
    addIcon(cls.icon);
    for (const tree of cls.trees ?? []) {
      addIcon(tree.icon);
      if (tree.bg != null) backgrounds.add(String(tree.bg));
      for (const t of tree.talents ?? []) addIcon(t.icon);
      for (const r of tree.removed ?? []) addIcon(r.icon);
    }
    if (!cls.trees?.length) console.warn(`  ! ${className} has no trees`);
  }

  // --- racials: race icon + each ability icon (abilities are [name, text, icon])
  for (const races of Object.values(data.racials ?? {})) {
    for (const race of Object.values(races)) {
      addIcon(race.icon);
      for (const ab of race.abilities ?? []) addIcon(ab[2]);
    }
  }
  for (const list of Object.values(data.class_racials ?? {})) {
    for (const ab of Array.isArray(list) ? list : []) addIcon(ab[2]);
  }

  // --- class_abilities: [name, text, icon]
  for (const list of Object.values(data.class_abilities ?? {})) {
    for (const ab of list ?? []) addIcon(ab[2]);
  }

  // --- legacy perks: [name, max, text, icon]
  for (const tree of data.legacy?.trees ?? []) {
    addIcon(tree.icon);
    for (const p of tree.perks ?? []) addIcon(p[3]);
  }

  // --- extras the UI needs regardless of the data file
  for (const extra of [
    'inv_misc_questionmark', 'inv_misc_book_09', 'inv_misc_grouplooking',
    'classicon_warrior', 'classicon_paladin', 'classicon_hunter', 'classicon_rogue',
    'classicon_priest', 'classicon_shaman', 'classicon_mage', 'classicon_warlock', 'classicon_druid',
  ]) addIcon(extra);

  // Keep icons the raid catalog needs; that file is hand-maintained.
  const extraPath = resolve(ROOT, 'scripts/extra-icons.json');
  if (existsSync(extraPath)) {
    const extras = JSON.parse(await readFile(extraPath, 'utf8'));
    for (const name of extras) addIcon(name);
    console.log(`  + ${extras.length} icons from extra-icons.json`);
  }

  const out = {
    generated: data.generated,
    imported: new Date().toISOString().slice(0, 10),
    license: data.license,
    attribution: data.attribution,
    source: SOURCE,
    talents: data.talents,
    spellbooks: data.spellbooks,
    spell_desc: data.spell_desc,
    racials: data.racials,
    class_racials: data.class_racials,
    class_abilities: data.class_abilities,
    legacy: data.legacy,
    changelog: data.changelog,
  };

  await mkdir(dirname(OUT_DATA), { recursive: true });
  await writeFile(OUT_DATA, JSON.stringify(out));
  await writeFile(
    OUT_MANIFEST,
    JSON.stringify({ icons: [...icons].sort(), backgrounds: [...backgrounds].sort() }, null, 2),
  );

  const classCount = Object.keys(out.talents ?? {}).length;
  const talentCount = Object.values(out.talents ?? {}).reduce(
    (n, c) => n + (c.trees ?? []).reduce((m, t) => m + (t.talents?.length ?? 0), 0),
    0,
  );
  console.log(`Wrote ${OUT_DATA}`);
  console.log(`  classes ${classCount}, talents ${talentCount}, data generated ${out.generated}`);
  console.log(`Wrote ${OUT_MANIFEST}`);
  console.log(`  icons ${icons.size}, backgrounds ${backgrounds.size}`);
  if (classCount !== 9) console.warn(`  ! expected 9 classes, got ${classCount}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
