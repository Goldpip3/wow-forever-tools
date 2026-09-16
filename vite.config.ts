import { defineConfig } from 'vite';
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

export default defineConfig({
  base: './',
  define: {
    __SIM_REVISION__: JSON.stringify(simRevision()),
  },
  build: {
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
        talents: resolve(__dirname, 'talents.html'),
        raid: resolve(__dirname, 'raid.html'),
        dps: resolve(__dirname, 'dps.html'),
        privacy: resolve(__dirname, 'privacy.html'),
      },
    },
  },
});
