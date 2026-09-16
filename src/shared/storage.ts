/** localStorage wrappers that never throw: private windows and blocked site data return defaults. */

export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
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
