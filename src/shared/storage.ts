/** localStorage wrappers that never throw: private windows and blocked site data return defaults. */

export function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** Whether each of these fields is a string, which is what a saved list entry needs to draw. */
export function hasStrings(value: unknown, keys: string[]): value is Record<string, string> {
  return isRecord(value) && keys.every((k) => typeof value[k] === 'string');
}

/** The same kind of JSON value as the fallback: a list for a list, an object for an object. */
function sameShape(value: unknown, fallback: unknown): boolean {
  if (fallback === null || fallback === undefined) return true;
  if (Array.isArray(fallback)) return Array.isArray(value);
  if (typeof fallback === 'object') return isRecord(value);
  return typeof value === typeof fallback;
}

/**
 * Read a stored value, or the fallback when it is missing, unreadable or the wrong shape.
 *
 * Anything in storage may have been written by an older version of the page, another
 * tab, or a person with the console open, so the type asked for is checked rather than
 * trusted. Without `check`, the value only has to be the same kind as the fallback.
 */
export function readJson<T>(key: string, fallback: T, check?: (value: unknown) => value is T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const value: unknown = JSON.parse(raw);
    const ok = check ? check(value) : sameShape(value, fallback);
    return ok ? (value as T) : fallback;
  } catch {
    return fallback;
  }
}

/** A stored list with every entry that fails `isItem` left out, so one bad row cannot break the rest. */
export function readList<T>(key: string, isItem: (value: unknown) => value is T): T[] {
  return readJson<unknown[]>(key, []).filter(isItem);
}

export function writeJson(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/**
 * Change some fields of a stored object and keep the rest.
 *
 * `wf.prefs` is shared by every page, so writing a whole object over it throws away what
 * the other pages keep there. Anything stored that is not a plain object is replaced.
 */
export function patchJson(key: string, patch: Record<string, unknown>): boolean {
  const current = readJson<unknown>(key, {});
  const base =
    current && typeof current === 'object' && !Array.isArray(current)
      ? (current as Record<string, unknown>)
      : {};
  return writeJson(key, { ...base, ...patch });
}

/**
 * The one preferences object every page shares, and who owns which part of it.
 *
 * The talent calculator owns `compare`; the gear page owns `dps`. Each page changes only its
 * own part through patchPrefs, so neither can wipe the other's, and a preference saved by
 * an older version of either page is kept as it was.
 */
export interface SitePrefs {
  compare?: boolean;
  dps?: Record<string, unknown>;
}

export function readPrefs(): SitePrefs {
  const raw = readJson<Record<string, unknown>>(KEY_PREFS, {});
  const out: SitePrefs = {};
  if (typeof raw.compare === 'boolean') out.compare = raw.compare;
  if (isRecord(raw.dps)) out.dps = raw.dps;
  return out;
}

/** Change one page's part of the preferences. False when the browser would not store it. */
export function patchPrefs(patch: Partial<SitePrefs>): boolean {
  return patchJson(KEY_PREFS, patch as Record<string, unknown>);
}

export function remove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export const KEY_BUILDS = 'wf.builds';
export const KEY_ROSTERS = 'wf.rosters';
export const KEY_CHARACTERS = 'wf.characters';
export const KEY_PREFS = 'wf.prefs';
export const KEY_REPORTS = 'wf.reports';
/** The character open in the simulator, whole, so a reload keeps its bags and bank. */
export const KEY_DPS_CURRENT = 'wf.dps.current';
