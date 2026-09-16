/**
 * The character open on the gear page, kept whole on this device.
 *
 * A link carries the sheet, the talents and what is worn, and never the bags or the bank:
 * a full bank does not fit in a URL, and nobody sharing a link means to share their bank.
 * So the whole character is kept here as a draft, apart from the named saves and apart
 * from any link.
 *
 * Which one opens:
 *
 *   - A report link opens what the report holds. The draft is never read for it.
 *   - A character link opens what the link holds. When the draft is that very character,
 *     trimmed to the link and compared byte for byte, the draft's bags and bank come back:
 *     that is a reload, or the owner opening their own link. Any other character opens
 *     exactly as linked, and nothing from the draft is added to it.
 *   - Only a character that belongs on this device is written as the draft: one imported,
 *     loaded from a save, or recovered from the draft. Opening somebody else's link does
 *     not overwrite the owner's draft.
 *   - Clear removes the draft.
 */

import { KEY_DPS_CURRENT, readJson, remove, writeJson } from '../shared/storage';
import { decodeCharacter, encodeCharacter, fullCharacterFor } from './codec';
import type { CharacterExport } from './export-format';

export function readDraft(): string | null {
  return readJson<string | null>(KEY_DPS_CURRENT, null, (v): v is string => typeof v === 'string');
}

/** False when the browser would not keep it, full or blocked, so the page can say so. */
export function writeDraft(source: CharacterExport): boolean {
  return writeJson(KEY_DPS_CURRENT, encodeCharacter(source));
}

export function clearDraft(): void {
  remove(KEY_DPS_CURRENT);
}

/**
 * The character a `#c=` link opens, and whether its bags and bank came from this device.
 * Null when the link does not read.
 */
export function openCharacterLink(
  linkCode: string,
  draft: string | null = readDraft(),
): { source: CharacterExport; recovered: boolean } | null {
  const full = fullCharacterFor(linkCode, draft);
  if (full) return { source: full, recovered: true };
  const shared = decodeCharacter(linkCode);
  return shared ? { source: shared, recovered: false } : null;
}
