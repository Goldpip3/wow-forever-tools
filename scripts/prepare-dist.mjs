#!/usr/bin/env node
/**
 * Strips licensed fonts out of dist before the site is published.
 *
 * Friz Quadrata is a commercial ITC typeface. Using your own copy locally is one
 * thing; putting it on a public web server is redistribution. The site falls back
 * to Alegreya without it and still looks right, so the safe thing is the default.
 *
 * Set KEEP_LICENSED_FONTS=1 if you hold a licence that permits web embedding.
 */
import { rm, access } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LICENSED = ['assets/fonts/FRIZQT__.TTF'];

if (process.env.KEEP_LICENSED_FONTS === '1') {
  console.log('Keeping licensed fonts in dist (KEEP_LICENSED_FONTS=1).');
  process.exit(0);
}

let removed = 0;
for (const rel of LICENSED) {
  const path = resolve(ROOT, 'dist', rel);
  try {
    await access(path);
    await rm(path);
    console.log('Removed ' + rel + ' from dist. The site uses Alegreya instead.');
    removed += 1;
  } catch {
    /* not there, nothing to do */
  }
}
if (!removed) console.log('No licensed fonts in dist.');
