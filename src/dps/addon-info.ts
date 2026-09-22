/**
 * Written by scripts/pack-addon.mjs. Do not edit.
 *
 * Lets the page name the addon's version and size without fetching anything,
 * and keeps the download link and the packed zip from drifting apart.
 */

export const ADDON_INFO = {
  name: 'WoWForeverSync',
  version: '1.2.1',
  /** The client this build declares itself compatible with. */
  interfaceVersion: '16001, 11508, 11509',
  /** Relative to the site root, which is where public/ ends up. */
  file: 'downloads/WoWForeverSync.zip',
  bytes: 14953,
  files: 6,
} as const;
