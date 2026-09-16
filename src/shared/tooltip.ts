/**
 * One floating tooltip for the whole page. Follows the cursor on a mouse,
 * and docks to a bottom sheet on touch so a tap can still place a point.
 */

let tipEl: HTMLElement | null = null;
let sheetEl: HTMLElement | null = null;
let activeAnchor: Element | null = null;

const GAP = 14;

function els(): { tip: HTMLElement | null; sheet: HTMLElement | null } {
  if (!tipEl) tipEl = document.getElementById('tip');
  if (!sheetEl) sheetEl = document.getElementById('sheet');
  return { tip: tipEl, sheet: sheetEl };
}

export function isTouchLayout(): boolean {
  return window.matchMedia('(max-width: 768px), (hover: none)').matches;
}

function place(tip: HTMLElement, x: number, y: number): void {
  const rect = tip.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let left = x + GAP;
  let top = y + GAP;
  if (left + rect.width > vw - 8) left = Math.max(8, x - GAP - rect.width);
  if (top + rect.height > vh - 8) top = Math.max(8, vh - rect.height - 8);
  tip.style.left = left + 'px';
  tip.style.top = top + 'px';
}

/** Show tooltip content. Pass a node so callers can build rich markup safely. */
export function showTip(content: Node, x: number, y: number, anchor?: Element): void {
  const { tip, sheet } = els();
  activeAnchor = anchor ?? null;
  if (isTouchLayout()) {
    if (!sheet) return;
    sheet.replaceChildren(content);
    sheet.hidden = false;
    if (tip) tip.hidden = true;
    return;
  }
  if (!tip) return;
  if (sheet) sheet.hidden = true;
  tip.replaceChildren(content);
  tip.hidden = false;
  place(tip, x, y);
}

export function moveTip(x: number, y: number): void {
  const { tip } = els();
  if (!tip || tip.hidden || isTouchLayout()) return;
  place(tip, x, y);
}

export function hideTip(anchor?: Element): void {
  const { tip, sheet } = els();
  if (anchor && activeAnchor && anchor !== activeAnchor) return;
  activeAnchor = null;
  if (tip) tip.hidden = true;
  if (sheet) sheet.hidden = true;
}

/**
 * Wires hover and touch behaviour onto a container using event delegation.
 * `match` picks the hoverable element; `build` returns its tooltip content.
 */
export function attachTooltips(
  container: HTMLElement,
  match: (target: Element) => HTMLElement | null,
  build: (el: HTMLElement) => Node | null,
): void {
  container.addEventListener('pointerover', (ev) => {
    const target = ev.target as Element | null;
    if (!target) return;
    const el = match(target);
    if (!el) return;
    const content = build(el);
    if (content) showTip(content, ev.clientX, ev.clientY, el);
  });

  container.addEventListener('pointermove', (ev) => {
    if (ev.pointerType !== 'mouse') return;
    moveTip(ev.clientX, ev.clientY);
  });

  container.addEventListener('pointerout', (ev) => {
    const target = ev.target as Element | null;
    if (!target) return;
    const el = match(target);
    if (!el) return;
    const next = (ev as PointerEvent).relatedTarget as Element | null;
    if (next && el.contains(next)) return;
    hideTip(el);
  });

  // A keyboard reaches the same things a pointer hovers, so focus shows the tip too,
  // beside the element rather than at a cursor that is not there.
  container.addEventListener('focusin', (ev) => {
    const target = ev.target as Element | null;
    const el = target ? match(target) : null;
    if (!el) return;
    const content = build(el);
    if (!content) return;
    const rect = el.getBoundingClientRect();
    showTip(content, rect.right, rect.top, el);
  });

  container.addEventListener('focusout', (ev) => {
    const target = ev.target as Element | null;
    const el = target ? match(target) : null;
    if (!el) return;
    const next = (ev as FocusEvent).relatedTarget as Element | null;
    if (next && el.contains(next)) return;
    hideTip(el);
  });

  container.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') hideTip();
  });

  // On touch, refresh the sheet after a tap so the new rank shows.
  container.addEventListener('click', (ev) => {
    if (!isTouchLayout()) return;
    const target = ev.target as Element | null;
    if (!target) return;
    const el = match(target);
    if (!el) {
      hideTip();
      return;
    }
    window.setTimeout(() => {
      const content = build(el);
      if (content) showTip(content, 0, 0, el);
    }, 0);
  });
}

/** Re-render the open tooltip, e.g. after a rank changed. */
export function refreshTip(build: () => Node | null): void {
  const { tip, sheet } = els();
  const open = (tip && !tip.hidden) || (sheet && !sheet.hidden);
  if (!open) return;
  const content = build();
  if (!content) return;
  if (tip && !tip.hidden) tip.replaceChildren(content);
  if (sheet && !sheet.hidden) sheet.replaceChildren(content);
}
