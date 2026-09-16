/**
 * The rotation, as a list you can move around.
 *
 * Every spec ships one written down, and this is the same list rather than a
 * picture of it: the engine reads what is here. A line is an ability and a
 * condition, the condition is checked as you type, and an error says what the
 * fight actually has rather than only that something is wrong.
 */

import { el } from './render';
import { check, variableNames } from './sim/apl';
import type { RotationLine } from './sim/rotation';
import type { SpecModule } from './sim/spec';

export interface RotationHandlers {
  onChange(lines: RotationLine[]): void;
  onReset(): void;
}

const AUTO_ATTACK = new Set(['auto-main', 'auto-off', 'auto-ranged']);

export function renderRotationPanel(
  spec: SpecModule,
  lines: RotationLine[],
  talents: Record<string, number>,
  handlers: RotationHandlers,
  edited: boolean,
): HTMLElement {
  const panel = el('section', 'panel');
  const head = el('div', 'panel__head', 'What the character presses');
  if (edited) head.appendChild(el('span', 'panel__count', 'yours, not the default'));
  panel.appendChild(head);
  const body = el('div', 'panel__body');

  body.appendChild(
    el(
      'p',
      '',
      'Read top to bottom: the first line whose ability is off cooldown, affordable and allowed ' +
        'is the one that gets pressed. A line with no condition is always allowed.',
    ),
  );

  const abilities = spec.spells.filter((s) => !AUTO_ATTACK.has(s.id));

  const list = el('div', 'daplist');
  lines.forEach((line, index) => {
    const row = el('div', 'dapl');

    const pick = document.createElement('select');
    pick.className = 'btn dapl__spell';
    for (const ability of abilities) {
      const option = document.createElement('option');
      option.value = ability.id;
      option.textContent = ability.name;
      option.selected = ability.id === line.spellId;
      pick.appendChild(option);
    }
    pick.addEventListener('change', () => {
      const next = [...lines];
      next[index] = { ...line, spellId: pick.value };
      handlers.onChange(next);
    });
    row.appendChild(pick);

    const when = document.createElement('input');
    when.type = 'text';
    when.className = 'btn dapl__when';
    when.value = line.text ?? '';
    when.placeholder = 'always';
    when.spellcheck = false;
    when.addEventListener('change', () => {
      const next = [...lines];
      const text = when.value.trim();
      next[index] = text ? { spellId: line.spellId, text } : { spellId: line.spellId };
      handlers.onChange(next);
    });
    row.appendChild(when);

    const buttons = el('span', 'dapl__buttons');

    const up = el('button', 'btn btn--sm', '↑');
    up.title = 'Move this line up';
    if (index === 0) up.setAttribute('disabled', '');
    up.addEventListener('click', () => {
      const next = [...lines];
      const above = next[index - 1];
      if (!above) return;
      next[index - 1] = next[index]!;
      next[index] = above;
      handlers.onChange(next);
    });

    const down = el('button', 'btn btn--sm', '↓');
    down.title = 'Move this line down';
    if (index === lines.length - 1) down.setAttribute('disabled', '');
    down.addEventListener('click', () => {
      const next = [...lines];
      const below = next[index + 1];
      if (!below) return;
      next[index + 1] = next[index]!;
      next[index] = below;
      handlers.onChange(next);
    });

    const drop = el('button', 'btn btn--sm', '×');
    drop.title = 'Take this line out';
    drop.addEventListener('click', () => handlers.onChange(lines.filter((_, i) => i !== index)));

    buttons.append(up, down, drop);
    row.appendChild(buttons);
    list.appendChild(row);

    const problem = check(line.text ?? '', { talents });
    if (problem) {
      const warn = el('div', 'dapl__error', problem);
      list.appendChild(warn);
    }
  });

  body.appendChild(list);

  const actions = el('div', 'spec-picker');

  const add = el('button', 'btn', 'Add a line');
  add.addEventListener('click', () => {
    const first = abilities[0];
    if (first) handlers.onChange([...lines, { spellId: first.id }]);
  });
  actions.appendChild(add);

  if (edited) {
    const reset = el('button', 'btn', "Back to the spec's own");
    reset.addEventListener('click', handlers.onReset);
    actions.appendChild(reset);
  }
  body.appendChild(actions);

  const help = document.createElement('details');
  help.className = 'dhowto';
  const summary = document.createElement('summary');
  summary.textContent = 'What a condition can say';
  help.appendChild(summary);

  const inner = el('div', 'panel__body');
  inner.appendChild(
    el(
      'p',
      '',
      'Compare something to a number, and join them with and, or and not. ' +
        'Brackets work where the order matters. For example: rage > 45, or ' +
        'buff.flurry.up and target_health_pct < 0.2.',
    ),
  );
  const names = el('p', 'drawer__hint', variableNames().join(' · '));
  inner.appendChild(names);
  help.appendChild(inner);
  body.appendChild(help);

  panel.appendChild(body);
  return panel;
}
