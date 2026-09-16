import type { Player } from './types';
import { CLASSES, specById } from '../shared/classes';
import { iconImg } from '../shared/icons';
import { choicesFor, petGatedFor, talentGatedFor } from './loadout';
import { resetPlayerToSpec } from './codec';
import { parseCode } from '../talents/codec';
import { attachTooltips } from '../shared/tooltip';
import { effectById } from './effects/index';
import { buildSpellTip } from './render';

function el(tag: string, cls?: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

export interface DrawerHandlers {
  onChange: () => void;
  onClose: () => void;
}

function section(title: string, hint?: string): { wrap: HTMLElement; body: HTMLElement } {
  const wrap = el('div', 'drawer__section');
  wrap.appendChild(el('div', 'drawer__section-head', title));
  const body = el('div');
  wrap.appendChild(body);
  if (hint) wrap.appendChild(el('p', 'drawer__hint', hint));
  return { wrap, body };
}

function optionRow(
  id: string,
  name: string,
  icon: string,
  selected: boolean,
  type: 'radio' | 'checkbox',
  onToggle: (next: boolean) => void,
): HTMLElement {
  const label = el('label', 'opt' + (selected ? ' opt--on' : ''));
  // Read back by the tooltip below, so hovering Retribution Aura says what it does.
  label.dataset.effect = id;
  const input = document.createElement('input');
  input.type = type;
  input.checked = selected;
  input.addEventListener('change', () => {
    onToggle(input.checked);
    // Keep the highlight on the row the radio or checkbox now points at.
    const group = label.closest('.opt-list');
    if (type === 'radio' && group) {
      for (const other of group.querySelectorAll('.opt')) other.classList.remove('opt--on');
    }
    label.classList.toggle('opt--on', input.checked);
  });
  label.appendChild(input);
  label.appendChild(iconImg(icon, ''));
  label.appendChild(el('span', 'opt__name', name));
  return label;
}

export function renderDrawer(player: Player, h: DrawerHandlers): HTMLElement {
  const overlay = el('div', 'drawer');
  const panel = el('div', 'drawer__panel');

  /* header */
  const head = el('div', 'drawer__head');
  const info = CLASSES[player.classId];
  const spec = specById(player.specId);
  const title = el('h2', 'drawer__title', player.name);
  title.style.color = info.color;
  const sub = el('div', 'drawer__hint', spec ? spec.name + ' ' + info.name : info.name);
  const titles = el('div');
  titles.append(title, sub);
  const close = el('button', 'btn btn--sm', 'Done');
  close.addEventListener('click', h.onClose);
  head.append(titles, close);
  panel.appendChild(head);

  const body = el('div', 'drawer__body');

  /* name */
  const nameSec = section('Name');
  const nameInput = document.createElement('input');
  nameInput.className = 'btn drawer__input';
  nameInput.value = player.name;
  nameInput.addEventListener('input', () => {
    player.name = nameInput.value;
  });
  nameInput.addEventListener('change', () => {
    player.name = nameInput.value;
    title.textContent = player.name;
    h.onChange();
  });
  nameSec.body.appendChild(nameInput);
  body.appendChild(nameSec.wrap);

  /* spec */
  const specSec = section('Spec', 'Changing spec resets this player to that spec’s usual buffs.');
  const picker = el('div', 'spec-picker');
  for (const option of info.specs) {
    const btn = el('button', 'btn btn--sm' + (option.id === player.specId ? ' btn--on' : ''));
    btn.appendChild(iconImg(option.icon, ''));
    btn.appendChild(el('span', '', option.short));
    btn.style.display = 'inline-flex';
    btn.style.alignItems = 'center';
    btn.style.gap = '5px';
    btn.addEventListener('click', () => {
      if (option.id === player.specId) return;
      resetPlayerToSpec(player, option.id);
      h.onChange();
    });
    picker.appendChild(btn);
  }
  specSec.body.appendChild(picker);
  body.appendChild(specSec.wrap);

  /* choice groups */
  for (const choice of choicesFor(player)) {
    const hint =
      choice.limit === 1
        ? 'One at a time. Picking another turns this one off.'
        : 'Up to ' + choice.limit + ' at a time.';
    const sec = section(choice.label, hint);
    const list = el('div', 'opt-list');
    const picked = player.loadout[choice.group] ?? [];

    for (const option of choice.options) {
      const row = optionRow(
        option.id,
        option.name,
        option.icon,
        option.selected,
        choice.limit === 1 ? 'radio' : 'checkbox',
        (next) => {
          const current = new Set(player.loadout[choice.group] ?? []);
          if (choice.limit === 1) {
            player.loadout[choice.group] = next ? [option.id] : [];
          } else {
            if (next) {
              current.add(option.id);
              // Drop the oldest pick once the limit is passed.
              while (current.size > choice.limit) {
                const first = [...current][0]!;
                current.delete(first);
              }
            } else {
              current.delete(option.id);
            }
            player.loadout[choice.group] = [...current];
          }
          h.onChange();
        },
      );
      const input = row.querySelector('input')!;
      if (choice.limit === 1) input.name = player.id + '-' + choice.group;
      list.appendChild(row);
    }

    if (!picked.length && choice.limit === 1) {
      sec.body.appendChild(el('p', 'drawer__hint', 'Nothing picked, so this slot is empty.'));
    }
    sec.body.appendChild(list);
    body.appendChild(sec.wrap);
  }

  /* talent gates */
  const talents = talentGatedFor(player);
  if (talents.length) {
    const sec = section(
      'Talents',
      'These only count when the player actually has the talent.',
    );
    const list = el('div', 'opt-list');
    for (const t of talents) {
      list.appendChild(
        optionRow(t.id, t.name, t.icon, t.on, 'checkbox', (next) => {
          player.talentToggles[t.id] = next;
          h.onChange();
        }),
      );
    }
    sec.body.appendChild(list);

    /* paste a build */
    const paste = document.createElement('input');
    paste.className = 'btn drawer__input';
    paste.placeholder = 'Paste a talent link to fill this in';
    paste.style.marginTop = '6px';
    paste.addEventListener('change', () => {
      const parsed = parseCode(paste.value);
      if (!parsed) {
        paste.value = '';
        paste.placeholder = 'That did not look like a talent link';
        return;
      }
      player.build = paste.value.trim();
      h.onChange();
    });
    sec.body.appendChild(paste);
    if (player.build) {
      sec.body.appendChild(el('p', 'drawer__hint', 'Build saved on this player.'));
    }
    body.appendChild(sec.wrap);
  }

  /* pets */
  const pets = petGatedFor(player);
  if (pets.length) {
    const sec = section('Pet', 'Whichever pet is out decides which of these the raid gets.');
    const names = [...new Set(pets.map((p) => p.pet))].join(', ');
    sec.body.appendChild(el('p', 'drawer__hint', 'Options: ' + names));
    body.appendChild(sec.wrap);
  }

  panel.appendChild(body);

  /* Hovering a buff shows the spell's own text, the same tooltip the coverage lists use.
     Picking between six blessings means nothing if you have to already know what they do. */
  attachTooltips(
    panel,
    (target) => (target.closest('.opt[data-effect]') as HTMLElement | null),
    (row) => {
      const effect = effectById(row.dataset.effect ?? '');
      return effect ? buildSpellTip(effect) : null;
    },
  );

  overlay.appendChild(panel);

  overlay.addEventListener('click', (ev) => {
    if (ev.target === overlay) h.onClose();
  });

  return overlay;
}
