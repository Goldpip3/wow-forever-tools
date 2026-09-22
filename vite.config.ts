import { defineConfig } from 'vite';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { relative, resolve } from 'node:path';

/**
 * A fingerprint of everything that decides what a simulation comes out as: the engine,
 * the class data, the stat model and the importer. A saved run records it, so a run made
 * by different code is shown as what it was rather than replayed as though nothing moved.
 * It changes only when one of those files does, not on every deploy.
 */
function simRevision(): string {
  const roots = ['src/dps/sim', 'src/dps/data', 'src/dps/stats.ts', 'src/dps/importer.ts'];
  const files: string[] = [];
  const walk = (path: string): void => {
    if (statSync(path).isDirectory()) for (const name of readdirSync(path)) walk(resolve(path, name));
    else if (path.endsWith('.ts')) files.push(path);
  };
  for (const root of roots) walk(resolve(__dirname, root));
  const hash = createHash('sha256');
  for (const file of files.sort()) {
    hash.update(relative(__dirname, file).replace(/\\/g, '/'));
    hash.update(readFileSync(file, 'utf8').replace(/\r\n/g, '\n'));
  }
  return hash.digest('hex').slice(0, 12);
}

/**
 * The commit this bundle was built from, so a page can say which build it is.
 *
 * Pages deploys from master and the bot is deployed by hand, so the two drift.
 * Reading a commit off the page beats reading git to work out which fixes are
 * live, which is what it took the last time they were three commits apart.
 */
function buildId(): string {
  if (process.env.CF_PAGES_COMMIT_SHA) return process.env.CF_PAGES_COMMIT_SHA.slice(0, 12);
  try {
    const head = execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], {
      cwd: __dirname,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    const dirty = execFileSync('git', ['status', '--porcelain'], {
      cwd: __dirname,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    // A build made over uncommitted work is not that commit, and a bug report
    // that claims it is sends the reader to the wrong code.
    return dirty ? head + '+' : head;
  } catch {
    // No git: a source archive, or a checkout without history.
    return 'dev';
  }
}

export default defineConfig({
  base: './',
  define: {
    __SIM_REVISION__: JSON.stringify(simRevision()),
    __BUILD_ID__: JSON.stringify(buildId()),
  },
  build: {
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
        talents: resolve(__dirname, 'talents.html'),
        raid: resolve(__dirname, 'raid.html'),
        dps: resolve(__dirname, 'dps.html'),
        guild: resolve(__dirname, 'guild.html'),
        privacy: resolve(__dirname, 'privacy.html'),
      },
    },
  },
});
