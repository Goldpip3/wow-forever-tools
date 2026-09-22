import type { ChangelogEntry, LegacyTree, RaceInfo, TalentData } from './types';
import { iconImg } from '../shared/icons';
import { dataKeyFor } from './codec';

function el(tag: string, cls?: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** A panel whose body can be shown or hidden with a button in its header. */
export function collapsible(
  title: string,
  subtitle: string | undefined,
  body: HTMLElement,
  startOpen = false,
): HTMLElement {
  const panel = el('section', 'panel');
  const head = el('div', 'panel__head');

  const titles = el('div');
  titles.appendChild(el('span', '', title));
  if (subtitle) {
    const sub = el('div', 'hint', subtitle);
    sub.style.margin = '0';
    titles.appendChild(sub);
  }
  head.appendChild(titles);

  const toggle = el('button', 'btn btn--sm accordion__toggle', startOpen ? 'Hide' : 'Show');
  head.appendChild(toggle);
  panel.appendChild(head);

  const wrap = el('div', 'panel__body');
  wrap.appendChild(body);
  wrap.hidden = !startOpen;
  panel.appendChild(wrap);

  toggle.addEventListener('click', () => {
    wrap.hidden = !wrap.hidden;
    toggle.textContent = wrap.hidden ? 'Show' : 'Hide';
  });

  return panel;
}

/* -------------------------------------------------------------- new abilities */

export function renderClassAbilities(
  data: TalentData,
  classKey: string,
  className: string,
): HTMLElement | null {
  const list = data.class_abilities?.[dataKeyFor(classKey)] ?? [];
  if (!list.length) return null;

  const cards = el('div', 'cards');
  for (const [name, text, icon] of list) {
    const card = el('div', 'card');
    const head = el('div', 'card__head');
    head.appendChild(iconImg(icon, '', 'card__icon'));
    head.appendChild(el('div', 'card__name', name));
    card.appendChild(head);
    card.appendChild(el('div', 'card__text', text));
    cards.appendChild(card);
  }

  return collapsible(
    'New and changed ' + className + ' abilities',
    'Read off the BlizzCon demo, outside the talent trees.',
    cards,
    true,
  );
}

/* --------------------------------------------------------------------- racials */

export function renderRacials(data: TalentData, className: string): HTMLElement {
  const body = el('div');

  const controls = el('div', 'actions');
  const filterId = 'racial-filter';
  const check = document.createElement('input');
  check.type = 'checkbox';
  check.id = filterId;
  const label = document.createElement('label');
  label.htmlFor = filterId;
  label.textContent = 'Show races that cannot be a ' + className;
  label.style.color = 'var(--ink2)';
  label.style.fontSize = '12.5px';
  const count = el('span', 'hint');
  count.style.margin = '0';
  controls.append(check, label, count);
  body.appendChild(controls);

  const groups = el('div');
  body.appendChild(groups);

  const draw = () => {
    groups.replaceChildren();
    let eligible = 0;
    let total = 0;

    for (const [faction, races] of Object.entries(data.racials ?? {})) {
      const list = Object.values(races) as RaceInfo[];
      const section = el('div');
      section.appendChild(el('div', 'section-label', faction));
      const grid = el('div', 'races');
      let shown = 0;

      for (const race of list) {
        total += 1;
        const can = race.classes?.includes(className) ?? false;
        if (can) eligible += 1;
        if (!can && !check.checked) continue;
        shown += 1;

        const card = el('div', 'race' + (can ? '' : ' race--off'));
        const head = el('div', 'race__head');
        head.appendChild(iconImg(race.icon, '', 'race__icon'));
        head.appendChild(el('div', 'race__name', race.race));
        head.appendChild(el('div', 'race__tag', can ? '' : 'no ' + className));
        card.appendChild(head);

        const abilities = el('ul', 'race__abilities');
        for (const [name, text, icon] of race.abilities ?? []) {
          const li = el('li', 'race__ability');
          li.appendChild(iconImg(icon, '', ''));
          const col = el('div');
          col.appendChild(el('b', '', name));
          col.appendChild(el('span', '', text));
          li.appendChild(col);
          abilities.appendChild(li);
        }
        card.appendChild(abilities);
        grid.appendChild(card);
      }

      if (shown) {
        section.appendChild(grid);
        groups.appendChild(section);
      }
    }

    count.textContent = eligible + ' of ' + total + ' races can be a ' + className;
  };

  check.addEventListener('change', draw);
  draw();

  return collapsible('Racials', 'Two actives and two passives per race, including both Skyborne lines.', body);
}

/* --------------------------------------------------------------- legacy perks */

export function renderLegacy(legacy: { note: string; trees: LegacyTree[] } | undefined): HTMLElement | null {
  if (!legacy?.trees?.length) return null;
  const body = el('div');
  if (legacy.note) {
    const note = el('p', 'hint', legacy.note);
    note.style.marginTop = '0';
    body.appendChild(note);
  }

  const grid = el('div', 'perks');
  let perkCount = 0;
  for (const tree of legacy.trees) {
    const col = el('div');
    const head = el('div', 'card__head');
    head.appendChild(iconImg(tree.icon, '', 'card__icon'));
    head.appendChild(el('div', 'card__name', tree.name));
    col.appendChild(head);
    for (const perkData of tree.perks ?? []) {
      perkCount += 1;
      const perk = el('div', 'perk');
      perk.appendChild(iconImg(perkData.icon, '', ''));
      const info = el('div');
      const max = perkData.max ?? perkData.ranks?.length ?? 1;
      info.appendChild(el('b', '', perkData.name + (max > 1 ? ' (' + max + ' ranks)' : '')));
      /* The data carries a line per rank. The last one is what the perk does when it is
         finished, which is the number somebody deciding whether to chase it wants. */
      const ranks = perkData.ranks ?? [];
      info.appendChild(el('span', '', ranks[ranks.length - 1] ?? ''));
      perk.appendChild(info);
      col.appendChild(perk);
    }
    grid.appendChild(col);
  }
  body.appendChild(grid);

  return collapsible(
    'Legacy perks',
    'Account-wide bonuses earned from challenges. ' +
      perkCount +
      ' perks across ' +
      legacy.trees.map((t) => t.name).join(', ') +
      '.',
    body,
  );
}

/* ---------------------------------------------------------------- changelog */

export function renderChangelogModal(entries: ChangelogEntry[]): HTMLElement {
  const overlay = el('div', 'modal');
  const box = el('div', 'modal__box');

  const head = el('div', 'modal__head');
  const title = el('h2', 'modal__title', 'What changed on the source data');
  const close = el('button', 'btn btn--sm', 'Close');
  head.append(title, close);
  box.appendChild(head);

  const body = el('div', 'modal__body');
  if (!entries.length) {
    body.appendChild(el('p', 'hint', 'Nothing logged yet.'));
  }
  for (const entry of entries.slice(0, 40)) {
    const item = el('div', 'changelog__entry');
    item.appendChild(el('div', 'changelog__date', entry.date));
    item.appendChild(el('div', 'changelog__title', entry.title));
    item.appendChild(el('div', 'changelog__text', entry.text));
    body.appendChild(item);
  }
  box.appendChild(body);
  overlay.appendChild(box);

  const dismiss = () => overlay.remove();
  close.addEventListener('click', dismiss);
  overlay.addEventListener('click', (ev) => {
    if (ev.target === overlay) dismiss();
  });
  document.addEventListener(
    'keydown',
    (ev) => {
      if (ev.key === 'Escape') dismiss();
    },
    { once: true },
  );

  return overlay;
}
