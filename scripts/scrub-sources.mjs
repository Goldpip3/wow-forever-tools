#!/usr/bin/env node
/**
 * Take the source attributions out of the shipped talent data.
 *
 * The upstream import records where each number was read: which streamer, which video,
 * which timestamp. That is good provenance for whoever collected it and it is not ours to
 * republish — it names people and points at particular broadcasts, and the file is served
 * publicly, so it can be traced back whether or not any of it is drawn on screen.
 *
 * What goes:
 *   seen      a spellbook's "Savix 4:36:54, Xaryu 5:01:27"
 *   src       218 per-spell notes like "Savix's Rogue, 12 Sep"
 *   sources   a free-text credit line
 *   changelog entries written around who saw what, and unreachable since the
 *             What changed button was removed
 *
 * What stays: every number, every tooltip and every note about the game itself. Where a
 * note happened to name a stream as its source, the clause naming it is removed and the
 * fact it was making is kept.
 *
 * Run after `npm run import`, which is what puts them back.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = resolve(ROOT, 'public/data/talents.generated.json');

/** Fields that are nothing but attribution. */
const DROP_FIELDS = new Set(['seen', 'src', 'sources']);

/** Anything naming a person, a channel or a video position. */
const NAMES = /Savix|Xaryu|Soda|Esfand|Warcraft Tavern/i;

/**
 * Attribution clauses, longest first so a bigger pattern wins over a smaller one inside
 * it. Each turns a sentence about who saw it into the same sentence about the demo.
 */
const REDACTIONS = [
  [/\s*\((?:from\s+)?(?:Savix|Xaryu|Soda|Esfand)(?:'s|’s)?[^)]*\)/gi, ''],
  [/\s*\((?:[^)]*\b(?:Savix|Xaryu|Soda|Esfand)\b[^)]*)\)/gi, ''],
  [/\bread from (?:Savix|Xaryu|Soda|Esfand)(?:'s|’s)\s+\w+/gi, 'read from the demo'],
  [/\bon (?:Savix|Xaryu|Soda|Esfand)(?:'s|’s)\s+stream\b/gi, 'in the demo'],
  [/\bseen on (?:Savix|Xaryu|Soda|Esfand)(?:'s|’s)\s+/gi, 'seen on a '],
  [/\b(?:Savix|Xaryu|Soda|Esfand)(?:'s|’s)\s+stream\b/gi, 'the demo'],
  [/\bWarcraft Tavern(?:'s|’s)?\s*/gi, ''],
  [/\b(?:Savix|Xaryu|Soda|Esfand)(?:'s|’s)\s+/gi, 'the demo '],
  [/\b(?:Savix|Xaryu|Soda|Esfand)\b/gi, 'the demo'],
  // Bare video positions, e.g. "4:36:54" or "1:02".
  [/\s*\b\d{1,2}:\d{2}(?::\d{2})?\b/g, ''],
];

function redact(text) {
  let out = text;
  for (const [pattern, replacement] of REDACTIONS) out = out.replace(pattern, replacement);
  return out
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;:])/g, '$1')
    .replace(/\(\s*\)/g, '')
    .replace(/,\s*,/g, ',')
    .trim();
}

let dropped = 0;
let changed = 0;

function scrubString(value) {
  if (!NAMES.test(value)) return value;
  const next = redact(value);
  if (next !== value) changed += 1;
  return next;
}

function scrub(node) {
  if (typeof node === 'string') return scrubString(node);
  if (node === null || typeof node !== 'object') return node;
  // Strings inside an array need redacting too. Notes are arrays, which is how the first
  // version of this walked straight past every one of them.
  if (Array.isArray(node)) return node.map(scrub);

  const out = {};
  for (const [key, value] of Object.entries(node)) {
    if (DROP_FIELDS.has(key)) {
      dropped += 1;
      continue;
    }
    if (typeof value === 'string') {
      out[key] = scrubString(value);
    } else {
      out[key] = scrub(value);
    }
  }
  return out;
}

const data = JSON.parse(readFileSync(FILE, 'utf8'));
delete data.changelog;
const cleaned = scrub(data);
writeFileSync(FILE, JSON.stringify(cleaned));

/* Prove it rather than trust the patterns: walk the result and fail loudly if a name
   survived, because a partial scrub is worse than none. */
const remaining = [];
(function check(node, path) {
  if (node === null || typeof node !== 'object') return;
  for (const [key, value] of Object.entries(node)) {
    if (typeof value === 'string') {
      if (NAMES.test(value)) remaining.push(path + '.' + key + ': ' + value.slice(0, 90));
    } else check(value, path + '.' + key);
  }
})(cleaned, '$');

console.log('dropped attribution fields :', dropped);
console.log('notes rewritten            :', changed);
console.log('names remaining            :', remaining.length);
for (const line of remaining.slice(0, 5)) console.log('   ', line);
if (remaining.length) process.exitCode = 1;
