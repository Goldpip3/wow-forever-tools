/**
 * The one-line element builder every page writes by hand otherwise.
 *
 * It lived in `src/guild/render.ts`, which meant anything else that wanted it had
 * to import the whole of the guild page's rendering. `render.ts` re-exports this
 * so the existing imports keep working.
 */

export function el(tag: string, cls?: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}
