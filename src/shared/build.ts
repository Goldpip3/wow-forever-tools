/**
 * Which build of this site is running.
 *
 * Cloudflare Pages deploys from `master` and the bot is deployed by hand, so the
 * two are often different ages. In September 2026 they were three commits apart
 * and nothing on either side said so: the deployed guild form still asked for a
 * realm while the source in the branch asked for a ruleset, and working that out
 * took reading git rather than reading the page.
 *
 * The commit is not a secret. It is in a public repository, and a bug report
 * that names it is worth more than one that does not.
 */

declare const __BUILD_ID__: string | undefined;

/** The commit this bundle was built from, or 'dev' when built outside git. */
export const BUILD_ID: string = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev';
