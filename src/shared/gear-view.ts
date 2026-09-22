/**
 * Showing a set of gear, without the machinery that ranks it.
 *
 * The gear page draws an interactive sheet: every square opens a tray of what else you
 * own that fits, scored against your stat weights. That needs the simulator, the item
 * database and the whole of `src/dps`. The guild page shows somebody else's gear and has
 * nothing to compare it to, so it needs the layout and the colours and none of the rest.
 *
 * Both live here so the two sheets cannot end up in a different order, and so the guild
 * page does not pull a 350 kB bundle in to draw sixteen squares.
 */

import type { ItemLocation, Slot, StatBlock } from '../dps/export-format';
import { SLOT_LABEL, STAT_KEYS, STAT_LABEL } from '../dps/export-format';
import { iconImg } from './icons';

/**
 * An item as a sheet or a tooltip shows it.
 *
 * Narrower than the gear page's ItemRef, which every field of this is a subset
 * of. The guild page stores less than the gear page imports — no raw item link,
 * no bag or bank location — and typing these functions to the wider shape would
 * have meant either storing fields nothing draws or lying about what is there.
 */
export interface ShownItem {
  name: string;
  quality: number;
  icon?: string;
  ilvl?: number;
  subType?: string;
  unique?: boolean;
  setName?: string;
  stats: StatBlock;
  weapon?: { min: number; max: number; speed: number };
  effects?: string[];
  /** Absent on a stored profile, where an equipped item is equipped. */
  location?: ItemLocation;
}

/** Poor, common, uncommon, rare, epic, legendary. */
const QUALITY_COLOR = ['#9d9d9d', '#ffffff', '#1eff00', '#0070dd', '#a335ee', '#ff8000'];

export function qualityColor(quality: number): string {
  return QUALITY_COLOR[Math.max(0, Math.min(QUALITY_COLOR.length - 1, Math.round(quality)))]!;
}

/**
 * The character sheet's own arrangement.
 *
 * Shirt and tabard sit in the left column in game and are missing here, because neither
 * carries a stat and the addon does not send them.
 */
export const PAPERDOLL: { left: Slot[]; right: Slot[]; weapons: Slot[] } = {
  left: ['head', 'neck', 'shoulder', 'back', 'chest', 'wrist'],
  right: ['hands', 'waist', 'legs', 'feet', 'finger1', 'finger2', 'trinket1', 'trinket2'],
  weapons: ['mainhand', 'offhand', 'ranged'],
};

export const PAPERDOLL_SLOTS: Slot[] = [
  ...PAPERDOLL.left,
  ...PAPERDOLL.right,
  ...PAPERDOLL.weapons,
];

function el(tag: string, cls?: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

/* ------------------------------------------------------------------ the index
   A cell carries an id rather than the item itself, so the tooltip can find what a
   square stands for after the page has been redrawn under it. */

const itemIndex = new Map<string, ShownItem>();
let itemSeq = 0;

function remember(item: ShownItem): string {
  itemSeq += 1;
  const id = 'g' + itemSeq;
  itemIndex.set(id, item);
  return id;
}

export function itemForGearCell(node: HTMLElement): ShownItem | undefined {
  return node.dataset.gearItem ? itemIndex.get(node.dataset.gearItem) : undefined;
}

export function resetGearIndex(): void {
  itemIndex.clear();
  itemSeq = 0;
}

/* ------------------------------------------------------------------ the sheet */

/** One square: what is worn in a slot, or that nothing is. */
function gearCell(slot: Slot, worn: ShownItem | undefined): HTMLElement {
  const cell = el('div', 'gcell');
  if (!worn) cell.classList.add('gcell--empty');
  if (worn) cell.dataset.gearItem = remember(worn);

  if (worn) cell.appendChild(iconImg(worn.icon, worn.name, 'gcell__icon'));
  else cell.appendChild(el('span', 'gcell__icon gcell__icon--empty'));

  const text = el('span', 'gcell__text');
  text.appendChild(el('span', 'gcell__slot', SLOT_LABEL[slot]));
  if (worn) {
    const name = el('span', 'gcell__name', worn.name);
    name.style.color = qualityColor(worn.quality);
    text.appendChild(name);
  } else {
    text.appendChild(el('span', 'gcell__name gcell__name--none', 'Nothing equipped'));
  }
  cell.appendChild(text);
  return cell;
}

function column(slots: Slot[], equipped: Partial<Record<Slot, ShownItem>>, cls: string): HTMLElement {
  const col = el('div', cls);
  for (const slot of slots) col.appendChild(gearCell(slot, equipped[slot]));
  return col;
}

/**
 * A read-only character sheet.
 *
 * Empty slots are drawn rather than skipped: an empty ring finger is the thing a raid
 * leader is looking for, and a sheet that hides it is answering a different question.
 */
export function renderGearSheet(equipped: Partial<Record<Slot, ShownItem>>): HTMLElement {
  const doll = el('div', 'gdoll');
  doll.appendChild(column(PAPERDOLL.left, equipped, 'gdoll__col'));
  doll.appendChild(column(PAPERDOLL.right, equipped, 'gdoll__col'));
  doll.appendChild(column(PAPERDOLL.weapons, equipped, 'gdoll__weapons'));
  return doll;
}

/** How many of the sheet's slots have something in them. */
export function wornCount(equipped: Partial<Record<Slot, ShownItem>>): number {
  return PAPERDOLL_SLOTS.filter((slot) => equipped[slot]).length;
}

/* ------------------------------------------------------------------ the tooltip */

function signed(value: number, digits = 0): string {
  const rounded = Number(value.toFixed(digits));
  return (rounded > 0 ? '+' : '') + rounded;
}

/** Stat lines for an item, in the order the stat table lists them. */
export function statLines(item: ShownItem): string[] {
  const out: string[] = [];
  for (const key of STAT_KEYS) {
    const value = item.stats[key];
    if (!value) continue;
    const pct = key === 'crit' || key === 'hit' || key === 'spellCrit' || key === 'spellHit';
    out.push(
      pct
        ? signed(value, 2) + '% ' + STAT_LABEL[key].replace(' %', '')
        : signed(value) + ' ' + STAT_LABEL[key],
    );
  }
  return out;
}

export interface ItemTipOptions {
  /**
   * A closing line the calling page adds.
   *
   * The gear page warns that a proc is not simulated, because it has a score that the
   * proc is missing from. The guild page has no score, so the same sentence there would
   * be answering a question nobody asked.
   */
  note?: string;
  /** False on a page showing somebody else's character, where "your bags" is wrong. */
  showLocation?: boolean;
}

export function itemTip(item: ShownItem, opts: ItemTipOptions = {}): HTMLElement {
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
      el(
        'div',
        'itip__weapon',
        item.weapon.min + ' - ' + item.weapon.max + ' damage, speed ' + item.weapon.speed.toFixed(2),
      ),
    );
  }

  for (const line of statLines(item)) box.appendChild(el('div', 'itip__stat', line));
  for (const effect of item.effects ?? []) box.appendChild(el('div', 'itip__effect', effect));
  if (item.setName) box.appendChild(el('div', 'itip__meta', item.setName));

  if ((opts.showLocation ?? true) && item.location) {
    const where =
      item.location.where === 'equipped'
        ? 'Equipped'
        : item.location.where === 'bank'
          ? 'In the bank'
          : 'In your bags';
    box.appendChild(el('div', 'itip__where', where));
  }

  if (opts.note) box.appendChild(el('div', 'itip__note', opts.note));
  return box;
}
