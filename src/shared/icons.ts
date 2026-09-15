/** Icon and background URL helpers. Assets are downloaded into /public by scripts/fetch-assets.mjs. */

const BASE = import.meta.env.BASE_URL ?? '/';

function join(path: string): string {
  return BASE.endsWith('/') ? BASE + path : `${BASE}/${path}`;
}

export const FALLBACK_ICON = 'inv_misc_questionmark';

export function iconUrl(name: string | undefined | null): string {
  const clean = (name ?? FALLBACK_ICON).trim().toLowerCase().replace(/\.(jpg|png)$/, '');
  return join(`assets/icons/${clean || FALLBACK_ICON}.jpg`);
}

export function bgUrl(id: number | string): string {
  return join(`assets/bg/${id}.jpg`);
}

export function dataUrl(file: string): string {
  return join(`data/${file}`);
}

/** <img> that quietly swaps to the question mark when an icon is missing. */
export function iconImg(name: string | undefined, alt = '', cls = ''): HTMLImageElement {
  const img = document.createElement('img');
  img.src = iconUrl(name);
  img.alt = alt;
  img.loading = 'lazy';
  img.decoding = 'async';
  if (cls) img.className = cls;
  img.addEventListener(
    'error',
    () => {
      if (!img.dataset.fallback) {
        img.dataset.fallback = '1';
        img.src = iconUrl(FALLBACK_ICON);
      }
    },
    { once: true },
  );
  return img;
}
