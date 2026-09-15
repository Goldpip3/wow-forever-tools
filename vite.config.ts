import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
        talents: resolve(__dirname, 'talents.html'),
        raid: resolve(__dirname, 'raid.html'),
        dps: resolve(__dirname, 'dps.html'),
      },
    },
  },
});
