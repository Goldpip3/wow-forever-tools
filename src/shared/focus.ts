/**
 * Keeping the keyboard's place when a page redraws.
 *
 * The pages rebuild their markup after every change, which drops focus back to the top of
 * the document. Someone working by keyboard then has to tab all the way back to where they
 * were after every point spent or every player seated. So a redraw notes which control had
 * focus and puts focus back on the control that stands in the same place afterwards.
 *
 * A control is recognised by its `data-focus-key` when it has one, which is what talent
 * cells, seats and pool rows carry. Anything else is matched on its tag, its accessible name
 * and its text, which is enough for the buttons in a toolbar.
 */

function keyOf(el: Element | null): string | null {
  if (!el || el === document.body || !(el instanceof HTMLElement)) return null;
  if (el.dataset.focusKey) return 'key:' + el.dataset.focusKey;
  const label = el.getAttribute('aria-label') ?? '';
  const text = (el.textContent ?? '').trim().slice(0, 60);
  if (!label && !text) return null;
  return 'tag:' + el.tagName + '|' + label + '|' + text;
}

function find(key: string, root: ParentNode = document): HTMLElement | null {
  if (key.startsWith('key:')) {
    const value = key.slice(4);
    return root.querySelector<HTMLElement>('[data-focus-key="' + CSS.escape(value) + '"]');
  }
  const [tag, label, text] = key.slice(4).split('|');
  for (const el of root.querySelectorAll<HTMLElement>(tag ?? '*')) {
    if ((el.getAttribute('aria-label') ?? '') === label && (el.textContent ?? '').trim().slice(0, 60) === text) {
      return el;
    }
  }
  return null;
}

/** Where focus is now, as something that can be found again after a redraw. */
export function focusKey(): string | null {
  return keyOf(document.activeElement);
}

/** Where the keyboard was, including the caret inside a text field. */
export interface FocusMark {
  key: string | null;
  start: number | null;
  end: number | null;
}

function isTextField(el: Element | null): el is HTMLInputElement | HTMLTextAreaElement {
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
}

/**
 * Focus and the caret, so a search box does not send the caret to the end of what
 * somebody typed every time the list under it redraws.
 *
 * A number field throws on selectionStart in some browsers rather than answering,
 * so reading it is guarded.
 */
export function focusMark(): FocusMark {
  const el = document.activeElement;
  const mark: FocusMark = { key: keyOf(el), start: null, end: null };
  if (!isTextField(el)) return mark;
  try {
    mark.start = el.selectionStart;
    mark.end = el.selectionEnd;
  } catch {
    /* a field whose type has no selection; focus alone is what we keep */
  }
  return mark;
}

/** Put focus and the caret back where the mark says. */
export function restoreFocusMark(mark: FocusMark): void {
  if (!mark.key) return;
  const el = find(mark.key);
  if (!el) return;
  el.focus({ preventScroll: true });
  if (mark.start === null || !isTextField(el)) return;
  try {
    el.setSelectionRange(mark.start, mark.end ?? mark.start);
  } catch {
    /* same as above: focus is the part that matters */
  }
}

/** Put focus back on the control a key names, if it is still on the page. */
export function restoreFocus(key: string | null): void {
  if (!key) return;
  const el = find(key);
  if (!el) return;
  el.focus({ preventScroll: true });
}

/** Run a redraw and keep the keyboard, and the caret, where they were. */
export function keepFocus(redraw: () => void): void {
  const mark = focusMark();
  redraw();
  restoreFocusMark(mark);
}

/**
 * Move focus into a dialog that has just been shown, and say where it came from, so the
 * page can hand focus back there when the dialog closes.
 */
export function focusIntoDialog(dialog: HTMLElement): string | null {
  const back = focusKey();
  const focusable = 'button:not([disabled]), select, input:not([disabled]), [tabindex]:not([tabindex="-1"])';
  // The first choice in the body rather than Cancel in the header, where there is a body.
  const body = dialog.querySelector<HTMLElement>('.modal__body, .drawer__body');
  const first = body?.querySelector<HTMLElement>(focusable) ?? dialog.querySelector<HTMLElement>(focusable);
  first?.focus({ preventScroll: true });
  return back;
}
