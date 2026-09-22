import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The response headers Cloudflare Pages serves, and the pages they cover.
 *
 * None of this can be proved from here: only the deployed site can say whether
 * the CDN honoured a header. What can be proved is that the file says what we
 * think it says, and that a page has not quietly gained a script the policy on
 * it would refuse. Both have gone wrong before in the other direction — a class
 * left in raid.css that another page needed — and this is the same shape of
 * mistake.
 */

const ROOT = resolve(__dirname, '..');
const HEADERS = readFileSync(resolve(ROOT, 'public/_headers'), 'utf8');

/** The file as a map of path to headers, ignoring comments and blank lines. */
function rules(): Map<string, Record<string, string>> {
  const out = new Map<string, Record<string, string>>();
  let current: Record<string, string> | undefined;
  for (const raw of HEADERS.split(/\r?\n/)) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue;
    if (!/^\s/.test(raw)) {
      current = {};
      out.set(raw.trim(), current);
      continue;
    }
    const cut = raw.indexOf(':');
    if (cut === -1 || !current) continue;
    current[raw.slice(0, cut).trim()] = raw.slice(cut + 1).trim();
  }
  return out;
}

/** The pages that hold characters, a roster token or a gear report. */
const PRIVATE_PAGES = ['guild', 'raid', 'dps'];

/** The pages that carry advertising, and deliberately have no policy. */
const PUBLIC_PAGES = ['index', 'talents', 'privacy'];

const html = (page: string) => readFileSync(resolve(ROOT, page + '.html'), 'utf8');

describe('advertising', () => {
  it('runs on none of the pages that hold somebody data', () => {
    for (const page of PRIVATE_PAGES) {
      expect(html(page)).not.toContain('googlesyndication');
    }
  });

  it('still runs on the pages that hold none', () => {
    // Not a security property, a revenue one. It is here so that removing the
    // last of it is a decision somebody makes rather than a side effect.
    for (const page of PUBLIC_PAGES) {
      expect(html(page)).toContain('googlesyndication');
    }
  });
});

describe('the policy on a private page', () => {
  const table = rules();

  it('covers both the extensionless path and the .html one', () => {
    for (const page of PRIVATE_PAGES) {
      expect(table.has('/' + page)).toBe(true);
      expect(table.has('/' + page + '.html')).toBe(true);
    }
  });

  it('serves the same policy for both, so the two paths cannot drift', () => {
    for (const page of PRIVATE_PAGES) {
      expect(table.get('/' + page)).toEqual(table.get('/' + page + '.html'));
    }
  });

  it('starts from nothing and names what may load', () => {
    for (const page of PRIVATE_PAGES) {
      const csp = table.get('/' + page)?.['Content-Security-Policy'] ?? '';
      expect(csp).toContain("default-src 'none'");
      expect(csp).toContain("script-src 'self'");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).toContain("object-src 'none'");
      expect(csp).not.toContain('googlesyndication');
      // A script may not be written into the page, only loaded from a file.
      expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
    }
  });

  it('allows the bot and a Discord avatar, and nothing else off this site', () => {
    for (const page of PRIVATE_PAGES) {
      const csp = table.get('/' + page)?.['Content-Security-Policy'] ?? '';
      expect(csp).toContain('connect-src ' + "'self'" + ' https://api.wowforever.us');
      expect(csp).toContain('https://cdn.discordapp.com');
      // The fonts are served from here now, so no font may come from anywhere else.
      expect(csp).toContain('font-src ' + "'self'" + ';');
      expect(csp).not.toContain('fonts.gstatic.com');
      expect(csp).not.toContain('fonts.googleapis.com');
    }
  });

  it('sends no referrer away from a page whose address names a server', () => {
    for (const page of PRIVATE_PAGES) {
      expect(table.get('/' + page)?.['Referrer-Policy']).toBe('no-referrer');
    }
  });

  it('allows every origin those pages actually load from', () => {
    for (const page of PRIVATE_PAGES) {
      const csp = table.get('/' + page)?.['Content-Security-Policy'] ?? '';
      const origins = [...html(page).matchAll(/https:\/\/[a-z0-9.-]+/g)].map((m) => m[0]);
      // There should be none left to allow: every file these pages load is ours.
      expect([...new Set(origins)]).toEqual([]);
      expect(csp).toContain("default-src 'none'");
    }
  });
});

describe('the headers every page gets', () => {
  const table = rules();

  it('refuses to be framed, and refuses to guess a content type', () => {
    const all = table.get('/*') ?? {};
    expect(all['X-Frame-Options']).toBe('DENY');
    expect(all['X-Content-Type-Options']).toBe('nosniff');
  });

  it('keeps a referrer from leaving with a path on it', () => {
    expect(table.get('/*')?.['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
  });
});
