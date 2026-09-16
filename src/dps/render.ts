/**
 * Every panel on the gear and DPS page. Pure builders: they take state and
 * handlers and give back nodes, so main.ts stays the only file that decides
 * when anything changes.
 */

import { CLASSES, specById } from '../shared/classes';
import { bgUrl, iconImg } from '../shared/icons';
import { copyText } from '../shared/toast';
import { ADDON_INFO } from './addon-info';
import { SAMPLES, sampleByKey } from './samples';
import type { ItemRef, Slot } from './export-format';
import { SLOT_LABEL, STAT_KEYS, STAT_LABEL } from './export-format';
import type { Character, ImportIssue } from './types';
import type { SavedCharacter } from './codec';
import { candidatesFor, equippedIn, slotsInUse } from './gear';

export interface DpsHandlers {
  onImport(text: string): void;
  onLoadSample(key: string): void;
  onClear(): void;
  onSave(name: string): void;
  onLoadSaved(id: string): void;
  onDeleteSaved(id: string): void;
  onCopyLink(): void;
  onCopyJson(): void;
}

export function el(tag: string, cls?: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

/* ------------------------------------------------------------------ helpers */

const QUALITY_COLOR = ['#9d9d9d', '#ffffff', '#1eff00', '#0070dd', '#a335ee', '#ff8000'];

export function qualityColor(quality: number): string {
  return QUALITY_COLOR[Math.max(0, Math.min(QUALITY_COLOR.length - 1, Math.round(quality)))]!;
}

function signed(value: number, digits = 0): string {
  const rounded = Number(value.toFixed(digits));
  return (rounded > 0 ? '+' : '') + rounded;
}

/** Stat lines for an item, in the order the stat table lists them. */
export function statLines(item: ItemRef): string[] {
  const out: string[] = [];
  for (const key of STAT_KEYS) {
    const value = item.stats[key];
    if (!value) continue;
    const pct = key === 'crit' || key === 'hit' || key === 'spellCrit' || key === 'spellHit';
    out.push(pct ? signed(value, 2) + '% ' + STAT_LABEL[key].replace(' %', '') : signed(value) + ' ' + STAT_LABEL[key]);
  }
  return out;
}

export function itemTip(item: ItemRef): HTMLElement {
  const box = el('div', 'itip');
  const name = el('div', 'itip__name', item.name);
  name.style.color = qualityColor(item.quality);
  box.appendChild(name);

  const meta: string[] = [];
  if (item.ilvl) meta.push('Item level ' + item.ilvl);
  if (item.subType) meta.push(item.subType);
  if (item.unique) meta.push('Unique');
  if (meta.length) box.appendChild(el('div', 'itip__meta', meta.join(' · ')));

  if (item.weapon) {
    box.appendChild(
      el('div', 'itip__weapon', item.weapon.min + ' - ' + item.weapon.max + ' damage, speed ' + item.weapon.speed.toFixed(2)),
    );
  }

  for (const line of statLines(item)) box.appendChild(el('div', 'itip__stat', line));

  for (const effect of item.effects ?? []) box.appendChild(el('div', 'itip__effect', effect));

  if (item.setName) box.appendChild(el('div', 'itip__meta', item.setName));

  const where =
    item.location.where === 'equipped'
      ? 'Equipped'
      : item.location.where === 'bank'
        ? 'In the bank'
        : 'In your bags';
  box.appendChild(el('div', 'itip__where', where));

  if (item.effects?.length) {
    box.appendChild(el('div', 'itip__note', 'Use and proc effects are not simulated yet, so they add nothing to the score.'));
  }

  return box;
}

const BASE = import.meta.env.BASE_URL ?? '/';
const href = (file: string) => (BASE.endsWith('/') ? BASE + file : `${BASE}/${file}`);

/* --------------------------------------------------- getting a character in */

function kilobytes(bytes: number): string {
  return (bytes / 1024).toFixed(1) + ' kB';
}

/** A line of path or command text with a button that copies it. */
function copyLine(text: string, label = 'Copy'): HTMLElement {
  const row = el('div', 'dcopy');
  const code = el('code', 'dcopy__text', text);
  const button = el('button', 'btn btn--sm', label);
  button.addEventListener('click', () => void copyText(text, 'Copied'));
  row.append(code, button);
  return row;
}

/** One numbered step, with a heading and whatever it needs underneath. */
function step(title: string, ...content: Array<HTMLElement | string>): HTMLElement {
  const li = document.createElement('li');
  li.className = 'dstep';
  li.appendChild(el('div', 'dstep__title', title));
  for (const part of content) {
    li.appendChild(typeof part === 'string' ? el('p', 'dstep__body', part) : part);
  }
  return li;
}

/**
 * How to get a character out of the game and into this page.
 *
 * Shown open before anything is imported, and folded away once a character is
 * loaded, because by then you have already done it once.
 */
export function renderHowTo(collapsed = false): HTMLElement {
  const panel = el('section', 'panel');

  const intro = el(
    'p',
    '',
    'This page needs to know what your character actually has on. A small addon reads that ' +
      'in game and gives you a block of text to paste here. It takes about a minute, once.',
  );

  const steps = document.createElement('ol');
  steps.className = 'dsteps';

  /* 1. the download */
  const download = document.createElement('a');
  download.className = 'btn btn--gold btn--big';
  download.href = href(ADDON_INFO.file);
  download.setAttribute('download', ADDON_INFO.name + '.zip');
  download.textContent = 'Download ' + ADDON_INFO.name + ' ' + ADDON_INFO.version;

  const size = el(
    'p',
    'dstep__note',
    kilobytes(ADDON_INFO.bytes) + ', ' + ADDON_INFO.files + ' files, no installer. ' +
      'It is plain text you can read before you run it.',
  );
  steps.appendChild(step('Download the addon', download, size));

  /* 2. where it goes */
  steps.appendChild(
    step(
      'Unzip it into your AddOns folder',
      copyLine('World of Warcraft\\_classic_era_\\Interface\\AddOns'),
      'The zip already has the folder inside it, so drop that folder in whole rather than the ' +
        'loose files. When it is right you will have an AddOns folder containing WoWForeverSync, ' +
        'with WoWForeverSync.toc inside that.',
    ),
  );

  /* 3. turn it on */
  steps.appendChild(
    step(
      'Restart the game',
      'If it is already running, ' + 'type /reload instead. If nothing happens when you try the ' +
        'command below, go back to the character select screen, press AddOns in the bottom left, ' +
        'and make sure it is ticked.',
    ),
  );

  /* 4. in game */
  const wfsync = copyLine('/wfsync', 'Copy');
  steps.appendChild(
    step(
      'Type the command in game',
      wfsync,
      'Two things worth doing first. Take your buffs off, because the addon sends your character ' +
        'sheet as the game shows it and a flask you are running would then be counted twice. ' +
        'And open your bank if you want the bank read, which only has to happen once in a while.',
    ),
  );

  /* 5. back here */
  steps.appendChild(
    step(
      'Copy the box and paste it below',
      'Everything is already selected when the window opens, so the copy key is usually all it takes.',
    ),
  );

  const privacy = el(
    'p',
    'drawer__hint',
    'Nothing is uploaded anywhere. The addon only puts text on your clipboard, and the character ' +
      'stays in this browser unless you copy a link yourself.',
  );

  const sample = el(
    'p',
    'dstep__note',
    'Not ready to install anything? Load a sample below and the whole tool works on a made-up ' +
      'character of any class that has a simulation.',
  );

  if (collapsed) {
    const details = document.createElement('details');
    details.className = 'dhowto';
    const summary = document.createElement('summary');
    summary.textContent = 'How do I get this text? Download the addon and run /wfsync';
    details.appendChild(summary);

    const inner = el('div', 'panel__body');
    inner.append(intro, steps, privacy);
    details.appendChild(inner);

    panel.appendChild(el('div', 'panel__head', 'Getting your character in here'));
    panel.appendChild(details);
    return panel;
  }

  panel.appendChild(el('div', 'panel__head', 'Getting your character in here'));
  const body = el('div', 'panel__body');
  body.append(intro, steps, privacy, sample);
  panel.appendChild(body);
  return panel;
}

/* ------------------------------------------------------------------ import */

export function renderImportPanel(handlers: DpsHandlers, hasCharacter: boolean): HTMLElement {
  const panel = el('section', 'panel');
  panel.appendChild(el('div', 'panel__head', hasCharacter ? 'Import another character' : 'Paste your export'));
  const body = el('div', 'panel__body');

  // A textarea wearing .btn inherited button padding and nowrap and came out as a narrow
  // box with a scrollbar. It is a field, so it is styled as one.
  const box = document.createElement('textarea');
  box.className = 'dimport__box';
  box.rows = 4;
  box.placeholder = 'Paste the box from /wfsync here';
  body.appendChild(box);

  const row = el('div', 'spec-picker');

  const go = el('button', 'btn btn--gold', 'Read this character');
  go.addEventListener('click', () => {
    const text = box.value.trim();
    if (text) handlers.onImport(text);
  });

  // One sample per class that has a simulation: a mage, a warrior and a rogue
  // each exercise a different half of the engine, so they are a choice rather
  // than a single button.
  const pick = document.createElement('select');
  pick.className = 'btn';
  for (const sample of SAMPLES) {
    const option = document.createElement('option');
    option.value = sample.key;
    option.textContent = sample.label;
    pick.appendChild(option);
  }

  const load = el('button', 'btn', 'Load this sample');
  load.title = 'A made-up character, so you can try the tool without the addon';
  load.addEventListener('click', () => {
    const sample = sampleByKey(pick.value);
    if (!sample) return;
    box.value = sample.text;
    handlers.onLoadSample(sample.key);
  });

  row.append(go, pick, load);

  if (hasCharacter) {
    const clear = el('button', 'btn', 'Clear');
    clear.addEventListener('click', handlers.onClear);
    row.appendChild(clear);
  }

  body.appendChild(row);
  panel.appendChild(body);
  return panel;
}

/* --------------------------------------------------------------- the notes */

export function renderNotes(warnings: string[], skipped: ImportIssue[]): HTMLElement | null {
  if (!warnings.length && !skipped.length) return null;

  const panel = el('section', 'panel');
  const head = el('div', 'panel__head', 'Worth knowing');
  head.appendChild(el('span', 'panel__count', warnings.length + skipped.length + ' notes'));
  panel.appendChild(head);
  const body = el('div', 'panel__body');

  for (const warning of warnings) {
    const row = el('div', 'warn warn--warn');
    row.appendChild(el('div', 'warn__title', warning));
    body.appendChild(row);
  }

  if (skipped.length) {
    const list = el('div', 'dskip');
    list.appendChild(el('div', 'dskip__head', 'Left out of the gear list'));
    for (const issue of skipped) {
      const row = el('div', 'dskip__row');
      row.appendChild(el('span', 'dskip__name', issue.name));
      row.appendChild(el('span', 'dskip__why', issue.reason));
      list.appendChild(row);
    }
    body.appendChild(list);
  }

  panel.appendChild(body);
  return panel;
}

/* ----------------------------------------------------------- the character */

export function renderCharacterPanel(character: Character): HTMLElement {
  const panel = el('section', 'panel');
  panel.appendChild(el('div', 'panel__head', 'Character'));
  const body = el('div', 'panel__body');

  const info = CLASSES[character.classId];
  const spec = specById(character.specId);

  const head = el('div', 'dchar');
  const mark = el('div', 'dchar__mark');
  mark.appendChild(iconImg(spec?.icon ?? info.icon, info.name));
  head.appendChild(mark);

  const titles = el('div', 'dchar__titles');
  const name = el('div', 'dchar__name', character.source.name);
  name.style.color = info.color;
  titles.appendChild(name);

  const line = [
    'Level ' + character.source.level,
    character.source.race,
    spec ? spec.name + ' ' + info.name : info.name,
  ]
    .filter(Boolean)
    .join(' · ');
  titles.appendChild(el('div', 'dchar__sub', line));
  if (character.source.realm) titles.appendChild(el('div', 'dchar__realm', character.source.realm));
  head.appendChild(titles);

  if (character.build) {
    const link = document.createElement('a');
    link.className = 'btn btn--sm';
    link.href = href('talents.html') + '#' + character.build;
    link.textContent = 'Open this build';
    link.title = 'See these talents in the calculator';
    head.appendChild(link);
  }

  body.appendChild(head);
  panel.appendChild(body);
  return panel;
}

/* -------------------------------------------------------------- the sheet */

/** The handful of sheet numbers that actually decide a caster's damage. */
const SHEET_ROWS: Array<[string, (c: Character) => string]> = [
  ['Intellect', (c) => String(Math.round(c.source.stats.intellect))],
  ['Stamina', (c) => String(Math.round(c.source.stats.stamina))],
  ['Spirit', (c) => String(Math.round(c.source.stats.spirit))],
  ['Mana', (c) => String(Math.round(c.source.stats.mana))],
  ['Spell damage', (c) => String(Math.round(topSchool(c.source.stats.spellPower)))],
  ['Spell crit', (c) => topSchool(c.source.stats.spellCrit).toFixed(2) + '%'],
  ['Spell hit from gear', (c) => (c.source.stats.spellHit ?? 0).toFixed(2) + '%'],
  ['Attack power', (c) => String(Math.round(c.source.stats.attackPower))],
  ['Melee crit', (c) => c.source.stats.meleeCrit.toFixed(2) + '%'],
  ['Armor', (c) => String(Math.round(c.source.stats.armor))],
];

function topSchool(values: Partial<Record<string, number>>): number {
  const numbers = Object.values(values).filter((n): n is number => typeof n === 'number');
  return numbers.length ? Math.max(...numbers) : 0;
}

export function renderSheetPanel(character: Character): HTMLElement {
  const panel = el('section', 'panel');
  panel.appendChild(el('div', 'panel__head', 'Character sheet'));
  const body = el('div', 'panel__body');

  const grid = el('div', 'dstats');
  for (const [label, read] of SHEET_ROWS) {
    const cell = el('div', 'dstat');
    cell.appendChild(el('span', 'dstat__label', label));
    cell.appendChild(el('span', 'dstat__value', read(character)));
    grid.appendChild(cell);
  }
  body.appendChild(grid);

  body.appendChild(
    el(
      'p',
      'drawer__hint',
      'These are the numbers the game showed at export time. Everything the simulator does starts here: ' +
        'take the stats off what you are wearing and what is left is your baseline, so a swap only ever moves the difference.',
    ),
  );

  panel.appendChild(body);
  return panel;
}

/* ---------------------------------------------------------------- the gear */

export interface SlotRowExtras {
  /** Score line under the item name, filled in once weights exist. */
  note?: string;
  /** Sorted alternatives with their gain, filled in once weights exist. */
  candidates?: Array<{ item: ItemRef; note: string; better: boolean }>;
}

/**
 * The character sheet's own arrangement: head down to wrist on the left, hands
 * down to trinkets on the right, weapons in a row underneath.
 *
 * Shirt and tabard sit in the left column in game and are missing here, because
 * neither carries a stat and the addon does not send them.
 */
export const PAPERDOLL: { left: Slot[]; right: Slot[]; weapons: Slot[] } = {
  left: ['head', 'neck', 'shoulder', 'back', 'chest', 'wrist'],
  right: ['hands', 'waist', 'legs', 'feet', 'finger1', 'finger2', 'trinket1', 'trinket2'],
  weapons: ['mainhand', 'offhand', 'ranged'],
};

function itemCell(item: ItemRef, note?: string): HTMLElement {
  const cell = el('div', 'ditem');
  cell.dataset.item = itemRefId(item);
  cell.appendChild(iconImg(item.icon, item.name, 'ditem__icon'));
  const text = el('div', 'ditem__text');
  const name = el('div', 'ditem__name', item.name);
  name.style.color = qualityColor(item.quality);
  text.appendChild(name);
  if (note) text.appendChild(el('div', 'ditem__note', note));
  cell.appendChild(text);
  return cell;
}

/** A per-render id so a tooltip can find the item a cell stands for. */
const itemIndex = new Map<string, ItemRef>();
let itemSeq = 0;

function itemRefId(item: ItemRef): string {
  itemSeq += 1;
  const id = 'i' + itemSeq;
  itemIndex.set(id, item);
  return id;
}

export function itemForCell(el: HTMLElement): ItemRef | undefined {
  return el.dataset.item ? itemIndex.get(el.dataset.item) : undefined;
}

export function resetItemIndex(): void {
  itemIndex.clear();
  itemSeq = 0;
}

interface Alternative {
  item: ItemRef;
  note: string;
  better: boolean;
}

/** What else fits this slot, scored once the weights are in and plain before that. */
function alternativesFor(character: Character, slot: Slot, extra?: SlotRowExtras): Alternative[] {
  return (
    extra?.candidates ?? candidatesFor(character, slot).map((item) => ({ item, note: '', better: false }))
  );
}

/** How the alternatives are announced, on the cell and again above the tray. */
function alternativesLine(alternatives: Alternative[]): string {
  const better = alternatives.filter((a) => a.better).length;
  if (better) return better + ' of ' + alternatives.length + ' you own score higher';
  return alternatives.length + ' other' + (alternatives.length === 1 ? '' : 's') + ' you own';
}

/**
 * One square of the sheet. It is a button because clicking a slot is how you
 * reach everything else you own that fits it.
 */
function slotCell(
  character: Character,
  slot: Slot,
  extra: SlotRowExtras | undefined,
  open: boolean,
  onSelect: (slot: Slot) => void,
): HTMLElement {
  const worn = equippedIn(character, slot);
  const alternatives = alternativesFor(character, slot, extra);
  const better = alternatives.filter((a) => a.better).length;

  const cell = document.createElement('button');
  cell.type = 'button';
  cell.className = 'dcell';
  if (!worn) cell.classList.add('dcell--empty');
  if (open) cell.classList.add('dcell--open');
  cell.setAttribute('aria-expanded', open ? 'true' : 'false');
  if (worn) cell.dataset.item = itemRefId(worn);

  if (worn) cell.appendChild(iconImg(worn.icon, worn.name, 'dcell__icon'));
  else cell.appendChild(el('span', 'dcell__icon dcell__icon--empty'));

  const text = el('span', 'dcell__text');
  text.appendChild(el('span', 'dcell__slot', SLOT_LABEL[slot]));

  if (worn) {
    const name = el('span', 'dcell__name', worn.name);
    name.style.color = qualityColor(worn.quality);
    text.appendChild(name);
    if (extra?.note) text.appendChild(el('span', 'dcell__note', extra.note));
  } else {
    text.appendChild(el('span', 'dcell__name dcell__name--none', 'Nothing equipped'));
  }
  cell.appendChild(text);

  if (better) {
    const badge = el('span', 'dcell__up', '↑' + better);
    badge.setAttribute('aria-label', alternativesLine(alternatives));
    cell.appendChild(badge);
  }

  cell.addEventListener('click', () => onSelect(slot));
  return cell;
}

function slotColumn(
  character: Character,
  slots: Slot[],
  extras: Partial<Record<Slot, SlotRowExtras>>,
  selected: Slot | null,
  onSelect: (slot: Slot) => void,
  cls: string,
): HTMLElement {
  const column = el('div', cls);
  for (const slot of slots) {
    column.appendChild(slotCell(character, slot, extras[slot], slot === selected, onSelect));
  }
  return column;
}

/** Everything else you own that fits the slot you clicked. */
function altTray(
  character: Character,
  slot: Slot,
  extra: SlotRowExtras | undefined,
  onSelect: (slot: Slot) => void,
): HTMLElement {
  const tray = el('div', 'dtray');
  const alternatives = alternativesFor(character, slot, extra);

  const head = el('div', 'dtray__head');
  head.appendChild(el('span', 'dtray__slot', SLOT_LABEL[slot]));
  if (alternatives.length) head.appendChild(el('span', 'dtray__count', alternativesLine(alternatives)));

  const close = el('button', 'btn btn--sm', 'Close');
  close.addEventListener('click', () => onSelect(slot));
  head.appendChild(close);
  tray.appendChild(head);

  if (!alternatives.length) {
    tray.appendChild(el('p', 'empty-note', 'Nothing else you own fits here.'));
    return tray;
  }

  const list = el('div', 'dtray__list');
  for (const alt of alternatives) {
    const cell = itemCell(alt.item, alt.note);
    if (alt.better) cell.classList.add('ditem--up');
    list.appendChild(cell);
  }
  tray.appendChild(list);
  return tray;
}

export function renderGearPanel(
  character: Character,
  extras: Partial<Record<Slot, SlotRowExtras>> = {},
  selected: Slot | null = null,
  onSelect: (slot: Slot) => void = () => {},
): HTMLElement {
  const panel = el('section', 'panel');
  const head = el('div', 'panel__head', 'Gear');
  head.appendChild(el('span', 'panel__count', character.owned.length + ' items read'));
  panel.appendChild(head);
  const body = el('div', 'panel__body');

  if (!slotsInUse(character).length) {
    body.appendChild(el('p', 'empty-note', 'No gear came through in that export.'));
    panel.appendChild(body);
    return panel;
  }

  const doll = el('div', 'doll');
  // The spec's own talent artwork, the same picture the calculator puts behind a
  // tree, dimmed far enough that item names stay readable on top of it.
  doll.style.backgroundImage =
    'linear-gradient(rgba(18,18,18,.80), rgba(18,18,18,.90)), url(' + bgUrl(character.specId) + ')';

  doll.appendChild(
    slotColumn(character, PAPERDOLL.left, extras, selected, onSelect, 'doll__col doll__col--left'),
  );
  doll.appendChild(
    slotColumn(character, PAPERDOLL.right, extras, selected, onSelect, 'doll__col doll__col--right'),
  );
  doll.appendChild(slotColumn(character, PAPERDOLL.weapons, extras, selected, onSelect, 'doll__weapons'));

  body.appendChild(doll);
  if (selected) body.appendChild(altTray(character, selected, extras[selected], onSelect));

  panel.appendChild(body);
  return panel;
}

/* ------------------------------------------------------------ save and share */

export function renderSaveBar(
  handlers: DpsHandlers,
  saved: SavedCharacter[],
  suggestedName: string,
): HTMLElement {
  const panel = el('section', 'panel');
  panel.appendChild(el('div', 'panel__head', 'Save and share'));
  const body = el('div', 'panel__body');

  const row = el('div', 'spec-picker');
  const nameInput = document.createElement('input');
  nameInput.className = 'btn';
  nameInput.placeholder = 'Character name';
  nameInput.value = suggestedName;
  nameInput.style.minWidth = '170px';

  const save = el('button', 'btn btn--gold', 'Save on this device');
  save.addEventListener('click', () => handlers.onSave(nameInput.value.trim() || suggestedName));

  const link = el('button', 'btn', 'Copy link');
  link.addEventListener('click', handlers.onCopyLink);

  const json = el('button', 'btn', 'Copy JSON');
  json.addEventListener('click', handlers.onCopyJson);

  row.append(nameInput, save, link, json);
  body.appendChild(row);

  body.appendChild(
    el(
      'p',
      'drawer__hint',
      'A link carries the sheet, the talents and what you are wearing, which is everything the simulator needs. ' +
        'Bags and the bank stay on this device, because a full bank does not fit in a URL.',
    ),
  );

  if (saved.length) {
    const list = el('div', 'spec-picker');
    list.style.marginTop = '8px';
    for (const entry of saved) {
      const pair = el('span');
      pair.style.display = 'inline-flex';
      pair.style.gap = '2px';

      const load = el('button', 'btn btn--sm', entry.name);
      load.addEventListener('click', () => handlers.onLoadSaved(entry.id));

      const del = el('button', 'btn btn--sm', '×');
      del.title = 'Delete ' + entry.name;
      del.addEventListener('click', () => handlers.onDeleteSaved(entry.id));

      pair.append(load, del);
      list.appendChild(pair);
    }
    body.appendChild(list);
  }

  panel.appendChild(body);
  return panel;
}
