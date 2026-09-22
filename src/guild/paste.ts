/**
 * Reading a /wfsync paste on the guild page.
 *
 * The gear page turns an export into a simulated character: items filtered by what the
 * class can wear, talent codes, stat weights. None of that is wanted here. This page
 * stores what somebody is wearing so a raid leader can look at it, so the export is
 * checked for shape and then trimmed to the parts the profile shows.
 *
 * Bags and bank are dropped before anything is sent. Nobody needs to read another
 * member's inventory, and the bot refuses a payload that carries one anyway.
 */

import type { CharacterExport, ItemRef, Slot } from '../dps/export-format';
import { EXPORT_PREFIX, EXPORT_VERSION, stripPrefix } from '../dps/export-format';
import { isCharacterShape } from '../dps/validate';
import { CLASS_IDS, type ClassId } from '../shared/classes';
import { isProfessionKey, MAX_PROFESSION_SKILL, type Profession } from './professions';

/** Exactly what the gear route accepts. Nothing else is sent. */
export interface GearUpload {
  v: number;
  addonVersion: string;
  generatedAt: number;
  name: string;
  realm: string;
  race: string;
  level: number | null;
  stats: Record<string, number>;
  equipped: Partial<Record<Slot, ItemRef>>;
  talents: unknown[];
  professions: Profession[];
}

export interface PasteReading {
  upload: GearUpload;
  /** The character the export is of, for checking against the profile it is going on. */
  name: string;
  realm: string;
  classId: ClassId | null;
  level: number | null;
  /** From export version 2. Empty from an older addon, which is not "none learned". */
  professions: Profession[];
  /** True when the addon said the read was incomplete. */
  partial: boolean;
}

export type PasteResult = { ok: true; reading: PasteReading } | { ok: false; error: string };

/** Only the numbers, so a stray string in the sheet cannot reach the bot. */
function numbersOnly(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'number' && Number.isFinite(value)) out[key] = value;
  }
  return out;
}

/** The profession rows, dropping any key or number this site does not recognise. */
export function readProfessions(raw: unknown): Profession[] {
  if (!Array.isArray(raw)) return [];
  const out: Profession[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const { key, skill } = entry as { key?: unknown; skill?: unknown };
    if (typeof key !== 'string' || !isProfessionKey(key)) continue;
    if (out.some((p) => p.key === key)) continue;
    const rank = typeof skill === 'number' && Number.isFinite(skill) ? Math.round(skill) : null;
    out.push({ key, skill: rank !== null && rank >= 1 && rank <= MAX_PROFESSION_SKILL ? rank : null });
  }
  return out;
}

/**
 * Read a paste, or say why it could not be read.
 *
 * Every message names what to do next, because the person holding the paste is the only
 * one who can fix any of these.
 */
export function readPaste(raw: string): PasteResult {
  const text = stripPrefix(raw);
  if (!text) {
    return { ok: false, error: 'Nothing to read. Run /wfsync in game and paste the whole box.' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      ok: false,
      error:
        'That is not the export. Copy the whole box from the addon, starting at ' +
        EXPORT_PREFIX +
        '.',
    };
  }

  if (!isCharacterShape(parsed)) {
    return { ok: false, error: 'That does not look like a character export from the sync addon.' };
  }

  const source = parsed as CharacterExport & { professions?: unknown; partial?: unknown };
  const version = Math.round(Number(source.v));
  if (!Number.isFinite(version) || version < 1) {
    return { ok: false, error: 'That export has no version number, so it cannot be read safely.' };
  }
  if (version > EXPORT_VERSION) {
    return {
      ok: false,
      error:
        'That export came from a newer addon (version ' +
        version +
        ') than this site reads (' +
        EXPORT_VERSION +
        '). The site is updated soon after the addon is.',
    };
  }

  const classId = (CLASS_IDS as readonly string[]).includes(String(source.classId).toLowerCase())
    ? (String(source.classId).toLowerCase() as ClassId)
    : null;

  const level =
    typeof source.level === 'number' && source.level >= 1 && source.level <= 100
      ? Math.round(source.level)
      : null;

  const professions = readProfessions(source.professions);

  const upload: GearUpload = {
    v: version,
    addonVersion: typeof source.addonVersion === 'string' ? source.addonVersion.slice(0, 32) : '',
    generatedAt: Math.max(0, Math.round(Number(source.generatedAt) || 0)),
    name: String(source.name ?? '').trim().slice(0, 32),
    realm: String(source.realm ?? '').trim().slice(0, 64),
    race: String(source.race ?? '').slice(0, 32),
    level,
    stats: numbersOnly(source.stats),
    equipped: source.equipped ?? {},
    talents: Array.isArray(source.talents) ? source.talents : [],
    professions,
  };

  return {
    ok: true,
    reading: {
      upload,
      name: upload.name,
      realm: upload.realm,
      classId,
      level,
      professions,
      partial: source.partial === true,
    },
  };
}

/**
 * Whether the paste is of the character it is being put on.
 *
 * Names are compared folded, because somebody typing their own profile in may not have
 * matched the game's capitals. A mismatch is a question rather than a refusal: people do
 * paste the wrong alt, and they also rename characters.
 */
export function namesDiffer(profileName: string, pastedName: string): boolean {
  if (!pastedName) return false;
  return profileName.trim().toLowerCase() !== pastedName.trim().toLowerCase();
}
