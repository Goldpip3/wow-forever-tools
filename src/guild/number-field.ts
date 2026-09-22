/**
 * Saying a number: a level, or how far a profession has got.
 *
 * Both were a small box with the browser's spinners taken off, which left a
 * 46-pixel field with no label sitting inside a profession chip at half opacity.
 * It was hard to read, harder to hit on a phone, and it gave no sense of the
 * range: 285 out of 300 looks the same as 85 out of 300 when it is four
 * characters in a box.
 *
 * So the number is a value you can nudge, drag or type, with the top of the
 * range one press away, because "the maximum" is what most answers are. Level 60
 * is the cap, and a profession somebody bothers to enter is usually at 300 or on
 * its way there.
 *
 * Empty stays possible and stays meaningful. A level is optional, and a
 * profession with no skill against it is "named but not measured", which the
 * profile prints differently from a zero.
 */

import { el } from '../shared/dom';

export interface NumberFieldOptions {
  /** The value as typed, which may be empty. */
  value: string;
  min: number;
  max: number;
  /** How much the buttons and the slider move it. */
  step: number;
  /** What the button that jumps to the top of the range says. */
  maxLabel: string;
  /** For the readout, which has no visible label of its own. */
  ariaLabel: string;
  /** Keeps the keyboard in place across a redraw. */
  focusKey?: string;
  placeholder?: string;
  onChange(next: string): void;
}

/**
 * The value after a nudge, as a string, clamped to the range.
 *
 * Pure, because the arithmetic is the part that is worth a test: stepping off
 * the end, stepping from empty, and stepping from something that is not a
 * number at all because somebody pasted into the field.
 */
export function stepValue(current: string, by: number, min: number, max: number): string {
  const parsed = Number(current.trim());
  const nothing = current.trim() === '' || !Number.isFinite(parsed);
  /* Pulled into the range before it is stepped, not after. From a field holding
     900 out of 300, pressing the minus button should leave you below the top of
     the range rather than sitting on it. */
  const from = nothing
    ? (by > 0 ? min - by : min)
    : Math.min(max, Math.max(min, parsed));
  const next = Math.round(from + by);
  return String(Math.min(max, Math.max(min, next)));
}

/** What the slider should show for a value that may be empty or nonsense. */
export function sliderValue(current: string, min: number, max: number): number {
  const parsed = Number(current.trim());
  if (current.trim() === '' || !Number.isFinite(parsed)) return min;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

export function numberField(opts: NumberFieldOptions): HTMLElement {
  const box = el('div', 'gnum');

  const readout = document.createElement('input');
  readout.className = 'gnum__value';
  /* Text rather than number: a number field will not hold "6" on the way to
     "60" in every browser, and this page keeps what was typed rather than what
     parses. The keypad on a phone is the same either way. */
  readout.type = 'text';
  readout.inputMode = 'numeric';
  readout.autocomplete = 'off';
  readout.value = opts.value;
  readout.setAttribute('aria-label', opts.ariaLabel);
  if (opts.placeholder) readout.placeholder = opts.placeholder;
  if (opts.focusKey) readout.dataset.focusKey = opts.focusKey;

  const slider = document.createElement('input');
  slider.className = 'gnum__slider';
  slider.type = 'range';
  slider.min = String(opts.min);
  slider.max = String(opts.max);
  /* One, not the button's step. A range input can only stop on min + n*step, so
     a skill sliding in fives from one stops at 296 and can never reach 300 —
     which is the number most people are reaching for. The buttons keep the
     bigger step; the drag is free to land anywhere. */
  slider.step = '1';
  slider.value = String(sliderValue(opts.value, opts.min, opts.max));
  slider.setAttribute('aria-label', opts.ariaLabel);
  // The readout says the number; a second announcement of it is noise.
  slider.setAttribute('aria-hidden', 'false');
  slider.classList.toggle('gnum__slider--unset', opts.value.trim() === '');

  /** One place that moves both halves and tells the page. */
  function set(next: string): void {
    readout.value = next;
    slider.value = String(sliderValue(next, opts.min, opts.max));
    slider.classList.toggle('gnum__slider--unset', next.trim() === '');
    opts.onChange(next);
  }

  const nudge = (by: number, label: string, title: string): HTMLElement => {
    const button = el('button', 'gnum__step', label);
    (button as HTMLButtonElement).type = 'button';
    button.title = title;
    button.setAttribute('aria-label', title);
    button.addEventListener('click', () => set(stepValue(readout.value, by, opts.min, opts.max)));
    return button;
  };

  readout.addEventListener('input', () => {
    // Anything but digits is dropped as it is typed, so the field cannot hold
    // something the save will refuse.
    const cleaned = readout.value.replace(/[^0-9]/g, '').slice(0, 4);
    if (cleaned !== readout.value) readout.value = cleaned;
    set(cleaned);
  });

  slider.addEventListener('input', () => set(slider.value));

  const top = el('button', 'gnum__max', opts.maxLabel);
  (top as HTMLButtonElement).type = 'button';
  top.title = 'Set it to ' + opts.max;
  top.addEventListener('click', () => set(String(opts.max)));

  /* The slider comes last so that, in a column too narrow for all of it, the
     slider is what wraps onto its own line rather than the buttons. */
  box.append(
    nudge(-opts.step, '−', 'Down ' + opts.step),
    readout,
    nudge(opts.step, '+', 'Up ' + opts.step),
    top,
    slider,
  );
  return box;
}
