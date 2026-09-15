import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import type { CharacterExport, ItemRef, Slot } from './export-format';

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

/** Fields dropped from a shared link because they only matter for gear ranking. */
export function trimForLink(source: CharacterExport): CharacterExport {
  const equipped: Partial<Record<Slot, ItemRef>> = {};
  for (const [slot, item] of Object.entries(source.equipped) as Array<[Slot, ItemRef | undefined]>) {
    if (item) equipped[slot] = item;
  }
  return { ...source, equipped, bags: [], bank: [], bankStale: false };
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
