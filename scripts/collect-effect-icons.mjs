#!/usr/bin/env node
/**
 * Reads icon names out of the hand-written sources into scripts/extra-icons.json,
 * which is what the asset fetcher uses on top of the icons the talent data names.
 *
 * Two sources: the raid effect catalog, and the gear and DPS side, where the
 * sample character and the spell tables also name icons.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Directories to walk, with the files to skip in each. */
const SOURCES = [
  { dir: resolve(ROOT, 'src/raid/effects'), skip: new Set(['index.ts']) },
  { dir: resolve(ROOT, 'src/dps'), skip: new Set() },
  { dir: resolve(ROOT, 'src/dps/data'), skip: new Set() },
];

/** Matches icon: 'name', "icon": "name", and the escaped form inside sample.ts. */
const PATTERN = /["']?icon["']?\s*:\s*["']([a-z0-9_]+)["']/g;

const icons = new Set();
let fileCount = 0;

for (const { dir, skip } of SOURCES) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    continue; // A directory that does not exist yet is not an error.
  }
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.ts') || skip.has(entry.name)) continue;
    // Unescape first, so icons inside a JSON string literal match the same pattern.
    const text = (await readFile(resolve(dir, entry.name), 'utf8')).replace(/\\/g, '');
    for (const m of text.matchAll(PATTERN)) icons.add(m[1]);
    fileCount += 1;
  }
}

const sorted = [...icons].sort();
await writeFile(resolve(ROOT, 'scripts/extra-icons.json'), JSON.stringify(sorted, null, 2));
console.log('Collected ' + sorted.length + ' icons from ' + fileCount + ' files');
