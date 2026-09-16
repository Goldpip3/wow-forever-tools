import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import type { CharacterExport, ItemRef, Slot } from './export-format';
import type { FightConfig, SimResult } from './sim/types';

/**
 * Characters travel in the URL hash as compressed JSON, the same trick the raid
 * planner uses for a roster.
 *
 * A full export with a stocked bank runs to eighty kilobytes, which no browser
 * will carry in a link, so the shared form is trimmed to what the simulator
 * needs: the sheet, the talents and what the character is wearing. The whole
 * export stays in localStorage on the device that imported it.
 */

type Packed = [number, CharacterExport];

const VERSION = 1;

/**
 * Fields dropped from a shared link because they only matter for gear ranking.
 *
 * The talents lose their empty rows too. An export lists every talent in the
 * tree whether or not a point went into it, which is two thirds of the talent
 * block and a quarter of the whole link spent saying zero. Everything that
 * reads them back either skips a zero already or treats a missing talent as
 * one, and the points per tab are carried separately.
 */
export function trimForLink(source: CharacterExport): CharacterExport {
  const equipped: Partial<Record<Slot, ItemRef>> = {};
  for (const [slot, item] of Object.entries(source.equipped) as Array<[Slot, ItemRef | undefined]>) {
    if (item) equipped[slot] = item;
  }
  const talents = source.talents.map((tab) => ({
    ...tab,
    list: tab.list.filter((entry) => entry.rank > 0),
  }));
  return { ...source, talents, equipped, bags: [], bank: [], bankStale: false };
}

export interface EncodeOptions {
  /** Drop bags and bank so the link stays inside what a browser will carry. */
  trim?: boolean;
}

export function encodeCharacter(source: CharacterExport, opts: EncodeOptions = {}): string {
  const payload: Packed = [VERSION, opts.trim ? trimForLink(source) : source];
  return compressToEncodedURIComponent(JSON.stringify(payload));
}

export function decodeCharacter(text: string): CharacterExport | null {
  const clean = (text ?? '').replace(/^#/, '').trim();
  if (!clean) return null;
  try {
    const json = decompressFromEncodedURIComponent(clean);
    if (!json) return null;
    const parsed = JSON.parse(json) as Packed;
    if (!Array.isArray(parsed) || parsed[0] !== VERSION) return null;
    const source = parsed[1];
    return source && typeof source === 'object' ? source : null;
  } catch {
    return null;
  }
}

/* -------------------------------------------------------- saved characters */

export interface SavedCharacter {
  id: string;
  name: string;
  /** The full export, compressed. Saved on this device, so nothing is trimmed. */
  code: string;
  savedAt: string;
}

/** How many saved characters a device keeps. Full exports are not small. */
export const MAX_SAVED = 10;

/* ---------------------------------------------------------------- reports */

/**
 * A finished run, small enough to travel in a link.
 *
 * The character is trimmed the same way a shared character is, and the result
 * is rounded on the way in: a damage figure to a tenth is the precision the
 * panel prints anyway, and carrying fifteen digits of it would spend the link's
 * whole budget on noise. The notes are not carried at all, because they are
 * rebuilt from the spec and the fight when the link opens, which also means an
 * old link picks up a caveat added since.
 *
 * What is never carried is the record of the representative fight. It is
 * reproducible from its seed, so the page runs it again rather than shipping it.
 */
export interface ReportSummary {
  dps: number;
  dpsStdev: number;
  dpsStderr: number;
  iterations: number;
  duration: number;
  abilities: SimResult['abilities'];
  resources: SimResult['resources'];
  histogram: SimResult['histogram'];
  auras: SimResult['auras'];
  representative: SimResult['representative'];
}

export interface Report {
  character: CharacterExport;
  fight: FightConfig;
  rotation?: string;
  summary: ReportSummary;
}

type PackedReport = [number, Report];

const REPORT_VERSION = 2;

/** Everything on the way into a link is rounded to what the panel prints. */
const round = (value: number, digits = 2): number => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

export function summarise(result: SimResult): ReportSummary {
  return {
    dps: round(result.dps, 2),
    dpsStdev: round(result.dpsStdev, 2),
    dpsStderr: round(result.dpsStderr, 3),
    iterations: result.iterations,
    duration: result.duration,
    abilities: result.abilities.map((a) => ({
      ...a,
      casts: round(a.casts, 2),
      hits: round(a.hits, 2),
      crits: round(a.crits, 2),
      misses: round(a.misses, 2),
      avoided: round(a.avoided, 2),
      glances: round(a.glances, 2),
      damage: round(a.damage, 1),
      dps: round(a.dps, 2),
      share: round(a.share, 4),
    })),
    resources: {
      ...result.resources,
      timeIdle: round(result.resources.timeIdle, 1),
      manaSpent: round(result.resources.manaSpent, 0),
      rageGained: round(result.resources.rageGained, 0),
      energySpent: round(result.resources.energySpent, 0),
      starvedFor: round(result.resources.starvedFor, 1),
      ...(result.resources.oomAt !== undefined ? { oomAt: round(result.resources.oomAt, 1) } : {}),
    },
    histogram: {
      min: round(result.histogram.min, 2),
      max: round(result.histogram.max, 2),
      bins: result.histogram.bins,
    },
    auras: result.auras.map((a) => ({ ...a, uptime: round(a.uptime, 1) })),
    representative: result.representative,
  };
}

/** How long a link may be before browsers and pasting start to suffer. */
export const REPORT_BUDGET = 6000;

export function encodeReport(report: Report): string {
  const trimmed: Report = { ...report, character: trimForLink(report.character) };
  const full = compressToEncodedURIComponent(JSON.stringify([REPORT_VERSION, trimmed] as PackedReport));
  if (full.length <= REPORT_BUDGET) return full;

  // Too long: drop the shape of the spread, then the per-ability detail. Both
  // are worth having and neither is worth losing the link over.
  const lighter: Report = {
    ...trimmed,
    summary: { ...trimmed.summary, histogram: { min: 0, max: 0, bins: [] } },
  };
  const withoutHistogram = compressToEncodedURIComponent(
    JSON.stringify([REPORT_VERSION, lighter] as PackedReport),
  );
  if (withoutHistogram.length <= REPORT_BUDGET) return withoutHistogram;

  const lightest: Report = { ...lighter, summary: { ...lighter.summary, abilities: [], auras: [] } };
  return compressToEncodedURIComponent(JSON.stringify([REPORT_VERSION, lightest] as PackedReport));
}

export function decodeReport(text: string): Report | null {
  const clean = (text ?? '').replace(/^#/, '').trim();
  if (!clean) return null;
  try {
    const json = decompressFromEncodedURIComponent(clean);
    if (!json) return null;
    const parsed = JSON.parse(json) as PackedReport;
    if (!Array.isArray(parsed) || parsed[0] !== REPORT_VERSION) return null;
    const report = parsed[1];
    if (!report || typeof report !== 'object' || !report.character || !report.summary) return null;
    return report;
  } catch {
    return null;
  }
}

/* -------------------------------------------------------- saved reports */

export interface SavedReport {
  id: string;
  /** Character name and spec, for the list. */
  name: string;
  specId: number;
  dps: number;
  at: string;
  /** The encoded report, so opening one needs nothing else. */
  code: string;
}

/** How many runs a device remembers. */
export const MAX_REPORTS = 20;
