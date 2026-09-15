#!/usr/bin/env node
/**
 * Downloads the icons and talent-tree backgrounds named in scripts/asset-manifest.json
 * from Wowhead's CDN into public/assets. Skips files that already exist.
 * Anything that 404s is logged to scripts/missing-assets.txt and falls back to the
 * question-mark icon at runtime.
 */
import { writeFile, mkdir, readFile, access } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = resolve(ROOT, 'scripts/asset-manifest.json');
const ICON_DIR = resolve(ROOT, 'public/assets/icons');
const BG_DIR = resolve(ROOT, 'public/assets/bg');
const MISSING = resolve(ROOT, 'scripts/missing-assets.txt');

const ICON_URL = (name) => `https://wow.zamimg.com/images/wow/icons/large/${name}.jpg`;
const BG_URL = (id) => `https://wow.zamimg.com/images/wow/talents/backgrounds/classic/${id}.jpg`;
const UA = { 'User-Agent': 'Mozilla/5.0 (wow-forever-tools asset fetch)' };
const CONCURRENCY = 10;

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function download(url, dest, attempt = 1) {
  try {
    const res = await fetch(url, { headers: UA });
    if (res.status === 404) return { ok: false, reason: '404' };
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 200) return { ok: false, reason: `too small (${buf.length}B)` };
    await writeFile(dest, buf);
    return { ok: true, bytes: buf.length };
  } catch (err) {
    if (attempt < 3) {
      await new Promise((r) => setTimeout(r, 250 * attempt));
      return download(url, dest, attempt + 1);
    }
    return { ok: false, reason: err.message };
  }
}

async function runPool(jobs, worker) {
  const queue = [...jobs];
  const results = [];
  const runners = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    while (queue.length) {
      const job = queue.shift();
      results.push(await worker(job));
    }
  });
  await Promise.all(runners);
  return results;
}

async function main() {
  const manifest = JSON.parse(await readFile(MANIFEST, 'utf8'));
  await mkdir(ICON_DIR, { recursive: true });
  await mkdir(BG_DIR, { recursive: true });

  const jobs = [];
  for (const name of manifest.icons ?? []) {
    jobs.push({ kind: 'icon', name, url: ICON_URL(name), dest: resolve(ICON_DIR, `${name}.jpg`) });
  }
  for (const id of manifest.backgrounds ?? []) {
    jobs.push({ kind: 'bg', name: id, url: BG_URL(id), dest: resolve(BG_DIR, `${id}.jpg`) });
  }

  let skipped = 0;
  const todo = [];
  for (const job of jobs) {
    if (await exists(job.dest)) skipped += 1;
    else todo.push(job);
  }

  console.log(`${jobs.length} assets, ${skipped} already present, downloading ${todo.length}`);
  let done = 0;
  const missing = [];
  await runPool(todo, async (job) => {
    const result = await download(job.url, job.dest);
    done += 1;
    if (!result.ok) missing.push(`${job.kind}\t${job.name}\t${result.reason}`);
    if (done % 50 === 0 || done === todo.length) console.log(`  ${done}/${todo.length}`);
    return result;
  });

  if (missing.length) {
    await writeFile(MISSING, `${missing.join('\n')}\n`);
    console.log(`\n${missing.length} assets could not be fetched, listed in scripts/missing-assets.txt:`);
    for (const line of missing.slice(0, 20)) console.log(`  ${line}`);
  } else {
    console.log('\nEvery asset downloaded.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
