/**
 * Every panel on the guild page. Pure builders: they take state and handlers and give
 * back nodes, so main.ts stays the only file that decides when anything changes.
 */

import { CLASSES, CLASS_IDS, type ClassId } from '../shared/classes';
import { el } from '../shared/dom';
import { iconImg } from '../shared/icons';
import { renderGearSheet, wornCount } from '../shared/gear-view';
import { specFromSignup, specKeyForSpecId } from '../raid/groupbuilder';
/* The cap the talent calculator already counts points against. Two copies of
   the number is how the two pages end up disagreeing about what 60 means. */
import { MAX_LEVEL as LEVEL_CAP } from '../talents/build';
import type { Character, CharacterDetail, CharacterList } from './api';
import { draftProblem, type EditorDraft } from './draft';
import { numberField } from './number-field';
import { headline, joinWords, type Coverage } from './coverage';
import {
  MAX_PROFESSION_SKILL,
  PRIMARY_PROFESSIONS,
  PROFESSION_KEYS as ALL_PROFESSIONS,
  professionIcon,
  SECONDARY_PROFESSIONS,
  professionName,
  sortProfessions,
  type Profession,
  type ProfessionKey,
} from './professions';
import { LIVE_RULESETS, RULESET_NAMES, rulesetName } from './rulesets';

/* Lives in shared/dom.ts now, because the number field needs it too and
   importing it from here would have meant importing the whole page. */
export { el };

function panel(title: string, count?: string): { panel: HTMLElement; body: HTMLElement } {
  const section = el('section', 'panel');
  const head = el('div', 'panel__head');
  head.appendChild(el('span', '', title));
  if (count) head.appendChild(el('span', 'panel__count', count));
  section.appendChild(head);
  const body = el('div', 'panel__body');
  section.appendChild(body);
  return { panel: section, body };
}

export function empty(title: string, detail: string): HTMLElement {
  const box = el('div', 'gempty');
  box.appendChild(el('div', 'gempty__title', title));
  box.appendChild(el('p', '', detail));
  return box;
}

/* ------------------------------------------------------------------ naming things
   The bot speaks in its own class and spec keys, the same ones the signup buttons use.
   `specFromSignup` is how roster mode already turns those into the site's classes, so
   both pages go through it rather than growing a second table that can drift. */

export function classIdOf(classKey: string): ClassId | null {
  return (CLASS_IDS as readonly string[]).includes(classKey) ? (classKey as ClassId) : null;
}

export function classNameOf(classKey: string): string {
  const id = classIdOf(classKey);
  return id ? CLASSES[id].name : classKey;
}

/** The spec's proper name, or null when the member never picked one. */
export function specNameOf(classKey: string, specKey: string | null): string | null {
  if (!specKey) return null;
  const mapped = specFromSignup(classKey, specKey);
  if (!mapped) return specKey;
  const spec = CLASSES[mapped.classId]?.specs.find((s) => s.id === mapped.specId);
  if (!spec) return specKey;
  // Feral Combat is one tree and two signup keys. The bear should read as the bear.
  if (specKey === 'guardian') return spec.name + ' (bear)';
  if (specKey === 'feral') return spec.name + ' (cat)';
  return spec.name;
}

function specIconOf(classKey: string, specKey: string | null): string | null {
  if (!specKey) return null;
  const mapped = specFromSignup(classKey, specKey);
  if (!mapped) return null;
  return CLASSES[mapped.classId]?.specs.find((s) => s.id === mapped.specId)?.icon ?? null;
}

const ROLE_NAME: Record<string, string> = {
  tank: 'Tank',
  healer: 'Healer',
  melee: 'Melee',
  ranged: 'Ranged',
};

/** How long ago, in the words somebody would say out loud. */
export function ago(unixSeconds: number, now: number = Date.now() / 1000): string {
  const seconds = Math.max(0, now - unixSeconds);
  const days = Math.floor(seconds / 86_400);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return days + ' days ago';
  const months = Math.floor(days / 30);
  if (months < 12) return months === 1 ? 'a month ago' : months + ' months ago';
  const years = Math.floor(days / 365);
  return years === 1 ? 'a year ago' : years + ' years ago';
}

/* ------------------------------------------------------------------ the list */

export interface ListHandlers {
  onOpen(id: number): void;
  onSearch(query: string): void;
  onAdd(): void;
}

function classMark(character: Character): HTMLElement {
  const id = classIdOf(character.classKey);
  const icon = specIconOf(character.classKey, character.specKey) ?? (id ? CLASSES[id].icon : null);
  return icon ? iconImg(icon, classNameOf(character.classKey), 'grow__icon') : el('span', 'grow__icon');
}

function characterRow(character: Character, handlers: ListHandlers): HTMLElement {
  const row = document.createElement('button');
  row.type = 'button';
  row.className = 'grow';
  row.addEventListener('click', () => handlers.onOpen(character.id));

  row.appendChild(classMark(character));

  const text = el('span', 'grow__text');

  const line = el('span', 'grow__line');
  const name = el('span', 'grow__name', character.name);
  const id = classIdOf(character.classKey);
  if (id) name.style.color = CLASSES[id].color;
  line.appendChild(name);
  if (character.isMain) {
    const pill = el('span', 'pill pill--new', 'main');
    pill.title = 'The character this member raids on.';
    line.appendChild(pill);
  }
  text.appendChild(line);

  const spec = specNameOf(character.classKey, character.specKey);
  const bits = [
    spec ? spec + ' ' + classNameOf(character.classKey) : classNameOf(character.classKey),
    character.level ? 'level ' + character.level : null,
    character.displayName,
  ].filter(Boolean);
  text.appendChild(el('span', 'grow__meta', bits.join(' · ')));

  const professions = sortProfessions(character.professions);
  if (professions.length) {
    const profs = el('span', 'grow__profs');
    for (const p of professions) {
      const tag = el('span', 'gprof gprof--sm');
      tag.appendChild(iconImg(professionIcon(p.key), professionName(p.key), 'gprof__icon'));
      tag.appendChild(el('span', '', professionName(p.key) + (p.skill ? ' ' + p.skill : '')));
      profs.appendChild(tag);
    }
    text.appendChild(profs);
  }

  row.appendChild(text);

  if (character.hasGear) {
    const pill = el('span', 'pill pill--same', 'gear');
    pill.title = 'This member has pasted an addon export.';
    row.appendChild(pill);
  }

  return row;
}

export function renderList(
  all: readonly Character[],
  shown: readonly Character[],
  query: string,
  canAdd: boolean,
  handlers: ListHandlers,
): HTMLElement {
  const { panel: section, body } = panel(
    'Characters',
    all.length === shown.length
      ? all.length + (all.length === 1 ? ' character' : ' characters')
      : shown.length + ' of ' + all.length,
  );

  const bar = el('div', 'gsearch');
  const input = document.createElement('input');
  input.className = 'drawer__input';
  input.type = 'search';
  input.placeholder = 'Search a character, a member or a profession';
  input.value = query;
  input.setAttribute('aria-label', 'Search characters');
  input.dataset.focusKey = 'guild-search';
  input.addEventListener('input', () => handlers.onSearch(input.value));
  bar.appendChild(input);

  if (canAdd) {
    const add = el('button', 'btn btn--gold', 'Add a character');
    add.addEventListener('click', () => handlers.onAdd());
    bar.appendChild(add);
  }
  body.appendChild(bar);

  if (!all.length) {
    body.appendChild(
      empty(
        'Nobody has added a character yet',
        canAdd
          ? 'Add yours, and anyone else in the Discord server can add theirs. An officer can fill one in for somebody who has not signed in.'
          : 'Add yours and it appears here.',
      ),
    );
    return section;
  }

  if (!shown.length) {
    body.appendChild(
      empty('Nothing matches “' + query + '”', 'Try part of a character name, a member’s name or a profession.'),
    );
    return section;
  }

  const list = el('div', 'glist');
  for (const character of shown) list.appendChild(characterRow(character, handlers));
  body.appendChild(list);
  return section;
}

/* ------------------------------------------------------------------ the profile */

export interface ProfileHandlers {
  onBack(): void;
  onEdit(): void;
  onDelete(): void;
  /** Another character the same member plays. */
  onOpen(id: number): void;
  /** The raw text of a /wfsync paste. */
  onPasteGear(text: string): void;
  onClearGear(): void;
  /** True while a paste is being sent, so a second press cannot start another. */
  busy: boolean;
  /** What the last paste was refused for. */
  gearProblem: string | null;
  /**
   * What is in the box.
   *
   * Held by the page rather than by the textarea, for the same reason the form
   * holds its own values: a refused paste redraws, and a redraw that rebuilt the
   * box empty threw away the export somebody had just pasted along with it.
   */
  gearText: string;
  onGearText(next: string): void;
}

function identityPanel(detail: CharacterDetail): HTMLElement {
  const { character } = detail;
  const { panel: section, body } = panel('Who this is');

  const head = el('div', 'gid');
  const id = classIdOf(character.classKey);
  const icon = specIconOf(character.classKey, character.specKey) ?? (id ? CLASSES[id].icon : null);
  if (icon) head.appendChild(iconImg(icon, classNameOf(character.classKey), 'gid__icon'));

  const text = el('div', 'gid__text');
  const title = el('div', 'gid__name', character.name);
  if (id) title.style.color = CLASSES[id].color;
  text.appendChild(title);

  const spec = specNameOf(character.classKey, character.specKey);
  const role = character.roleKey ? ROLE_NAME[character.roleKey] : null;
  const bits = [
    character.level ? 'Level ' + character.level : null,
    spec ? spec + ' ' + classNameOf(character.classKey) : classNameOf(character.classKey),
    role,
    rulesetName(character.ruleset),
  ].filter(Boolean);
  text.appendChild(el('div', 'gid__meta', bits.join(' · ')));
  text.appendChild(
    el('div', 'gid__meta', (character.isMain ? 'Main of ' : 'Alt of ') + character.displayName),
  );
  head.appendChild(text);
  body.appendChild(head);

  if (character.note) body.appendChild(el('p', 'gnote', character.note));

  /* Who typed this, and when. Nothing here came from the game, so the page has to say
     whose word it is and how old it is. */
  body.appendChild(
    el(
      'div',
      'drawer__hint',
      'Entered by hand, last changed ' + ago(character.updatedAt) + '.',
    ),
  );
  return section;
}

function professionsPanel(character: Character): HTMLElement {
  const { panel: section, body } = panel('Professions');
  const list = sortProfessions(character.professions);

  if (!list.length) {
    body.appendChild(
      empty('None entered', 'Nobody has said what this character can make. That is not the same as none.'),
    );
    return section;
  }

  const row = el('div', 'gprofs');
  for (const p of list) {
    const tag = el('span', 'gprof');
    tag.appendChild(iconImg(professionIcon(p.key), professionName(p.key), 'gprof__icon'));
    tag.appendChild(el('span', 'gprof__name', professionName(p.key)));
    if (p.skill !== null) tag.appendChild(el('span', 'gprof__skill', String(p.skill)));
    else tag.appendChild(el('span', 'gprof__skill gprof__skill--none', 'no skill given'));
    row.appendChild(tag);
  }
  body.appendChild(row);
  return section;
}

/** The box a member pastes their /wfsync export into. */
function pasteBox(handlers: ProfileHandlers, replacing: boolean): HTMLElement {
  const box = el('div', 'gpaste');

  if (handlers.gearProblem) {
    const warn = el('div', 'gwarn', handlers.gearProblem);
    warn.setAttribute('role', 'alert');
    box.appendChild(warn);
  }

  const area = document.createElement('textarea');
  area.className = 'drawer__input';
  area.rows = 2;
  area.placeholder = 'Paste the /wfsync export here';
  area.setAttribute('aria-label', 'Addon export');
  area.dataset.focusKey = 'guild-paste';
  area.value = handlers.gearText;
  area.addEventListener('input', () => handlers.onGearText(area.value));
  box.appendChild(area);

  const row = el('div', 'gactions');
  const save = el('button', 'btn btn--gold', handlers.busy ? 'Reading…' : replacing ? 'Replace the gear' : 'Show my gear');
  (save as HTMLButtonElement).disabled = handlers.busy;
  save.addEventListener('click', () => handlers.onPasteGear(area.value));
  row.appendChild(save);

  if (replacing) {
    const clear = el('button', 'btn', 'Remove it');
    clear.addEventListener('click', () => handlers.onClearGear());
    row.appendChild(clear);
  }
  box.appendChild(row);

  /* Every category, named, before they paste rather than after. This used to say
     only that bags and bank stay behind, which is true and is not the same as
     saying what does go: the sheet totals, the talents, the race and the level all
     travel with the gear. Everyone in the server can read a profile, and this is
     the one thing on the page that leaves their machine. */
  const sent = el('div', 'drawer__hint');
  sent.appendChild(
    el(
      'span',
      '',
      'Sent: the seventeen slots you are wearing, each item name and the stats on it, ' +
        'your level, your race, your character sheet totals and your talent trees.',
    ),
  );
  sent.appendChild(document.createElement('br'));
  sent.appendChild(
    el('span', '', 'Not sent: your bags, your bank, or where any item was sitting.'),
  );
  sent.appendChild(document.createElement('br'));
  sent.appendChild(
    el('span', '', 'Everyone in this Discord server can read it once it is saved.'),
  );
  box.appendChild(sent);
  return box;
}

function gearPanel(detail: CharacterDetail, handlers: ProfileHandlers): HTMLElement {
  const { gear } = detail;
  const canEdit = detail.permissions.canEdit;
  const { panel: section, body } = panel(
    'Gear',
    gear ? wornCount(gear.equipped) + ' of 17 slots' : undefined,
  );

  if (!gear) {
    body.appendChild(
      empty(
        'No gear pasted',
        canEdit
          ? 'Run /wfsync in game and paste the export below, and this shows what you are wearing.'
          : 'This member has not pasted an addon export, so there is nothing to show.',
      ),
    );
    if (canEdit) body.appendChild(pasteBox(handlers, false));
    return section;
  }

  /* The date is the export's, not the paste's. A sheet from five weeks ago is not what
     they are wearing tonight, and saying when it was read is the only honest version. */
  body.appendChild(
    el(
      'div',
      'drawer__hint',
      'Read from the game ' + ago(gear.generatedAt) + ', with addon ' + (gear.addonVersion || 'unknown') + '.',
    ),
  );
  body.appendChild(renderGearSheet(gear.equipped));
  if (canEdit) body.appendChild(pasteBox(handlers, true));
  return section;
}

function attendancePanel(detail: CharacterDetail): HTMLElement {
  const { attendance } = detail;
  const { panel: section, body } = panel('Attendance');

  if (!attendance.events) {
    body.appendChild(
      empty('No raids recorded', 'This member has not been in a finished event since the bot started keeping count.'),
    );
    return section;
  }

  const row = el('div', 'gstats');
  const stat = (label: string, value: string) => {
    const box = el('div', 'gstat');
    box.appendChild(el('div', 'gstat__value num', value));
    box.appendChild(el('div', 'gstat__label', label));
    return box;
  };
  row.appendChild(stat('raids', String(attendance.events)));
  row.appendChild(stat('turned up', String(attendance.present)));
  row.appendChild(stat('late', String(attendance.late)));
  row.appendChild(stat('absent', String(attendance.absent)));
  body.appendChild(row);

  if (attendance.last !== null) {
    body.appendChild(el('div', 'drawer__hint', 'Last raid ' + ago(attendance.last) + '.'));
  }
  /* The log records a Discord account, never which character came. Saying so stops a
     leader reading an alt's page as that alt's attendance. */
  body.appendChild(
    el(
      'div',
      'drawer__hint',
      'Counted per Discord account, so it covers every character ' + detail.character.displayName + ' plays.',
    ),
  );
  return section;
}

/**
 * Where an armory and a log would go.
 *
 * Forever has neither yet: Blizzard has published no character API for it and Warcraft
 * Logs has no site for it. Saying that is better than an outbound link that 404s.
 */
function linksPanel(): HTMLElement {
  const { panel: section, body } = panel('Armory and logs');
  body.appendChild(
    el(
      'p',
      '',
      'Blizzard has not published a character API for Forever, and Warcraft Logs does not cover it. When either arrives, this is where the links go.',
    ),
  );
  return section;
}

export function renderProfile(
  detail: CharacterDetail,
  others: readonly Character[],
  handlers: ProfileHandlers,
): HTMLElement {
  const wrap = el('div', 'gprofile');

  const bar = el('div', 'gbar');
  const back = el('button', 'btn btn--sm', '← All characters');
  back.addEventListener('click', () => handlers.onBack());
  bar.appendChild(back);

  if (detail.permissions.canEdit) {
    const edit = el('button', 'btn btn--sm', 'Edit');
    edit.addEventListener('click', () => handlers.onEdit());
    bar.appendChild(edit);

    const remove = el('button', 'btn btn--sm', 'Delete');
    remove.addEventListener('click', () => handlers.onDelete());
    bar.appendChild(remove);
  }
  wrap.appendChild(bar);

  wrap.appendChild(identityPanel(detail));
  wrap.appendChild(professionsPanel(detail.character));
  wrap.appendChild(gearPanel(detail, handlers));
  wrap.appendChild(attendancePanel(detail));

  if (others.length) {
    const { panel: section, body } = panel('Also plays');
    const list = el('div', 'glist');
    for (const other of others) {
      list.appendChild(
        characterRow(other, { onOpen: handlers.onOpen, onSearch: () => {}, onAdd: () => {} }),
      );
    }
    body.appendChild(list);
    wrap.appendChild(section);
  }

  wrap.appendChild(linksPanel());
  return wrap;
}

/* ------------------------------------------------------------------ the editor */

export interface EditorHandlers {
  onSave(draft: EditorDraft): void;
  onCancel(): void;
  /** What was typed into the owner lookup. */
  onOwnerQuery?(text: string): void;
  /** The person chosen, or null for the officer filling it in. */
  onOwnerPick?(userId: string | null, displayName: string | null): void;
  /**
   * Every change, so the page holds what is being typed.
   *
   * It does not redraw on a keystroke; it only puts the value where a redraw can
   * find it. A refused save then redraws the form as it was left, with the
   * refusal above it, rather than as the character was last stored.
   */
  onChange(draft: EditorDraft): void;
}

/**
 * Choosing whose character this is, which only an officer may do.
 *
 * `people` are the ones who already have a character here, which the page knows
 * without asking anybody. They are not the people this picker is for: an officer
 * files a character for somebody who has not got one, and the old picker could
 * not name a single one of them. `results` are what the server answered for what
 * was typed.
 */
export interface OwnerPicker {
  people: ReadonlyArray<{ userId: string; displayName: string }>;
  /** False when the bot is older than this feature. The list alone is then all there is. */
  canSearch: boolean;
  query: string;
  results: ReadonlyArray<{ userId: string; displayName: string }>;
  searching: boolean;
  /** What the lookup said went wrong, in its own words. */
  problem: string | null;
  /** The chosen person, when they came from a search rather than the list. */
  chosenName: string | null;
}

export interface EditorOptions {
  /** The character being changed, or null when this is a new one. */
  character: Character | null;
  /** What to draw in the fields. Held by the page, not by the fields. */
  draft: EditorDraft;
  /** How to choose an owner. Absent for everyone who may only file their own. */
  owner: OwnerPicker | null;
  busy: boolean;
  /** What the last save said went wrong, shown above the fields. */
  problem: string | null;
}

/**
 * A labelled field.
 *
 * A label around one input is what a label is for. Around a group of controls
 * it is a trap: a click anywhere in it is forwarded to the first control it
 * contains, so pressing the slider in the level field would also press the
 * minus button next to it. Those get a plain box, and their controls carry
 * their own names.
 */
function field(label: string, control: HTMLElement, hint?: string): HTMLElement {
  const single = /^(INPUT|SELECT|TEXTAREA)$/.test(control.tagName);
  const wrap = el(single ? 'label' : 'div', 'gfield');
  wrap.appendChild(el('span', 'gfield__label', label));
  wrap.appendChild(control);
  if (hint) wrap.appendChild(el('span', 'gfield__hint', hint));
  return wrap;
}

function option(value: string, label: string, selected: boolean): HTMLOptionElement {
  const node = document.createElement('option');
  node.value = value;
  node.textContent = label;
  node.selected = selected;
  return node;
}

/**
 * The form.
 *
 * Draws what the page hands it and reports every change back, so a redraw under a
 * half-filled form draws the half-filled form. It used to read its values out of
 * the DOM on save, which was fine until a save was refused: the redraw that showed
 * the refusal also rebuilt every field from the stored character, and what somebody
 * had just typed went with it.
 */
export function renderEditor(opts: EditorOptions, handlers: EditorHandlers): HTMLElement {
  const existing = opts.character;
  const { panel: section, body } = panel(existing ? 'Edit ' + existing.name : 'Add a character');

  const form = document.createElement('form');
  form.className = 'gform';
  form.noValidate = true;

  if (opts.problem) {
    const warn = el('div', 'gwarn', opts.problem);
    warn.setAttribute('role', 'alert');
    form.appendChild(warn);
  }

  /* ---------------------------------------------------------------- controls
     Every control is built before any of it is arranged, because the preview and
     the three linked pickers all read each other. */

  const draft = opts.draft;

  /* Whose character this is. Held here rather than read off a control, because
     the person may have come from a lookup and not be in any list on the page. */
  let ownerId: string | null = draft.ownerId;
  const picker = !existing ? opts.owner : null;

  const name = document.createElement('input');
  name.className = 'drawer__input';
  name.type = 'text';
  // 12 for the first name, a space, and 12 for the surname Forever gives it.
  name.maxLength = 25;
  name.autocomplete = 'off';
  name.value = draft.name;
  name.placeholder = 'Ana Forever';
  name.dataset.focusKey = 'guild-name';

  /* Forever is realmless. This used to ask for a realm, which meant nothing on
     a Forever character and was filled in with a Classic Era name out of habit. */
  const ruleset = document.createElement('select');
  ruleset.className = 'btn';
  ruleset.appendChild(option('', 'Not said', !draft.ruleset));
  for (const key of LIVE_RULESETS) {
    ruleset.appendChild(option(key, RULESET_NAMES[key], draft.ruleset === key));
  }
  // A character already filed on Hardcore reads correctly even though the picker
  // does not offer it yet.
  if (draft.ruleset === 'hardcore') {
    ruleset.appendChild(option('hardcore', RULESET_NAMES.hardcore, true));
  }

  /* Held here rather than read back off a field, so the stepper, the slider and
     the typed number are all the same value. */
  let levelValue = draft.level;

  const level = numberField({
    value: levelValue,
    min: 1,
    max: LEVEL_CAP,
    step: 1,
    // Not the number itself: beside a readout already showing 60, a button
    // saying 60 reads as a second answer rather than as a way to get there.
    maxLabel: 'Max',
    ariaLabel: 'Level',
    focusKey: 'guild-level',
    placeholder: '\u2014',
    onChange: (next) => {
      levelValue = next;
      touched();
    },
  });

  const classSelect = document.createElement('select');
  classSelect.className = 'btn';
  for (const id of CLASS_IDS) {
    classSelect.appendChild(option(id, CLASSES[id].name, draft.classKey === id));
  }

  const specSelect = document.createElement('select');
  specSelect.className = 'btn';

  const roleSelect = document.createElement('select');
  roleSelect.className = 'btn';

  const main = document.createElement('input');
  main.type = 'checkbox';
  main.checked = draft.isMain;

  const note = document.createElement('textarea');
  note.className = 'drawer__input';
  note.rows = 3;
  note.maxLength = 500;
  note.value = draft.note;
  note.placeholder = 'Anything the raid leader should know.';

  /* ------------------------------------------------------------- the preview
     The character as it is being described, redrawn on every change. It is the
     one part of this form that is not a field: filling in a long form is easier
     when you can see what you are making. */

  const preview = el('div', 'gpreview');
  const previewIcon = el('span', 'gpreview__icon');
  const previewName = el('div', 'gpreview__name');
  const previewMeta = el('div', 'gpreview__meta');
  const previewText = el('div', 'gpreview__text');
  previewText.append(previewName, previewMeta);
  preview.append(previewIcon, previewText);

  function drawPreview(): void {
    const classId = classIdOf(classSelect.value);
    const icon = specIconOf(classSelect.value, specSelect.value || null)
      ?? (classId ? CLASSES[classId].icon : null);

    previewIcon.replaceChildren();
    if (icon) previewIcon.appendChild(iconImg(icon, classNameOf(classSelect.value), 'gpreview__img'));

    const typed = name.value.trim();
    previewName.textContent = typed || 'Your character';
    previewName.classList.toggle('gpreview__name--empty', !typed);
    if (classId) previewName.style.color = CLASSES[classId].color;

    const spec = specNameOf(classSelect.value, specSelect.value || null);
    const role = roleSelect.value || roleForSpec();
    const bits = [
      levelValue.trim() ? 'Level ' + levelValue.trim() : null,
      spec ? spec + ' ' + classNameOf(classSelect.value) : classNameOf(classSelect.value),
      role ? ROLE_NAME[role] : null,
      rulesetName(ruleset.value || null),
      main.checked ? 'main' : null,
    ].filter(Boolean);
    previewMeta.textContent = bits.join(' · ');

    // The accent follows the class, so the form belongs to the character being made.
    if (classId) form.style.setProperty('--class-accent', CLASSES[classId].color);
  }

  /* ------------------------------------------------------- the linked pickers */

  /** Refill the spec list for whichever class is chosen, keeping the spec if it fits. */
  function fillSpecs(keepSpecKey: string | null): void {
    const classId = classIdOf(classSelect.value) ?? 'warrior';
    specSelect.replaceChildren();
    specSelect.appendChild(option('', 'Not decided', !keepSpecKey));
    for (const spec of CLASSES[classId].specs) {
      // Feral Combat is one tree the bot splits into a cat and a bear, so it needs
      // two entries where the site has one.
      const keys =
        classId === 'druid' && spec.name === 'Feral Combat'
          ? [
              { key: 'feral', label: 'Feral Combat (cat)' },
              { key: 'guardian', label: 'Feral Combat (bear)' },
            ]
          : [{ key: specKeyForSpecId(spec.id) ?? '', label: spec.name }];
      for (const entry of keys) {
        if (!entry.key) continue;
        specSelect.appendChild(option(entry.key, entry.label, entry.key === keepSpecKey));
      }
    }
  }

  /** The role the chosen spec plays, which is what the picker starts on. */
  function roleForSpec(): string {
    /* No spec means no role to infer. specFromSignup falls back to the class's first
       spec, which would have a spec-less warrior offering "From the spec (Melee)". */
    if (!specSelect.value) return '';
    const mapped = specFromSignup(classSelect.value, specSelect.value);
    if (!mapped) return '';
    if (mapped.role) return mapped.role;
    const spec = CLASSES[mapped.classId]?.specs.find((s) => s.id === mapped.specId);
    return spec?.role ?? '';
  }

  function fillRoles(keep: string | null): void {
    const suggested = roleForSpec();
    roleSelect.replaceChildren();
    roleSelect.appendChild(
      option('', suggested ? 'From the spec (' + (ROLE_NAME[suggested] ?? suggested) + ')' : 'Not decided', !keep),
    );
    for (const key of ['tank', 'healer', 'melee', 'ranged']) {
      roleSelect.appendChild(option(key, ROLE_NAME[key], key === keep));
    }
  }

  fillSpecs(draft.specKey);
  fillRoles(draft.roleKey);

  /* Redraw the preview and hand the values up. Nothing repaints the page on a
     keystroke: this only puts what was typed somewhere a redraw can find it. */
  function touched(): void {
    drawPreview();
    handlers.onChange(readDraft());
  }

  classSelect.addEventListener('change', () => {
    fillSpecs(null);
    fillRoles(null);
    touched();
  });
  specSelect.addEventListener('change', () => {
    fillRoles(roleSelect.value || null);
    touched();
  });
  name.addEventListener('input', touched);
  note.addEventListener('input', touched);
  ruleset.addEventListener('change', touched);
  for (const control of [roleSelect, main]) control.addEventListener('change', touched);


  /* ------------------------------------------------------------- professions
     A chip per profession rather than a checkbox in a row: the whole thing is the
     target, it carries its own icon, and a chosen one is obvious at a glance. */

  /* What each profession is at, as the chips hold it. A chip that is off keeps
     no number: unticking one is a way of saying you do not have it, and leaving
     the old skill behind would put it back the moment it was ticked again. */
  const live = new Map<ProfessionKey, { on: boolean; skill: string }>();
  for (const key of ALL_PROFESSIONS) {
    const held = draft.professions.find((p) => p.key === key);
    live.set(key, {
      on: held !== undefined,
      skill: held?.skill != null ? String(held.skill) : '',
    });
  }

  /**
   * One profession.
   *
   * Closed it is a tick, an icon and a name. Ticked it grows a row for the skill,
   * so the twelve of them are not twelve half-visible number boxes at once. The
   * row appears in place rather than through a redraw, which is what keeps the
   * keyboard where it was.
   */
  function professionChip(key: ProfessionKey): HTMLElement {
    const state = live.get(key)!;
    const chip = el('div', 'gchip');

    const top = el('label', 'gchip__top');
    const tick = document.createElement('input');
    tick.type = 'checkbox';
    tick.className = 'gchip__tick';
    tick.checked = state.on;
    tick.dataset.profession = key;
    top.append(
      tick,
      iconImg(professionIcon(key), professionName(key), 'gchip__icon'),
      el('span', 'gchip__name', professionName(key)),
    );
    chip.appendChild(top);

    /* Built when the chip is ticked and thrown away when it is not, so the row
       always shows what the chip holds. Keeping one row and hiding it left the
       old number on screen after an untick had cleared it. */
    let row: HTMLElement | null = null;

    function show(): void {
      chip.classList.toggle('gchip--on', state.on);
      if (state.on && !row) {
        row = el('div', 'gchip__skill');
        row.appendChild(
          numberField({
            value: state.skill,
            min: 1,
            max: MAX_PROFESSION_SKILL,
            step: 5,
            maxLabel: 'Max',
            ariaLabel: professionName(key) + ' skill',
            placeholder: '\u2014',
            focusKey: 'guild-skill-' + key,
            onChange: (next) => {
              state.skill = next;
              touched();
            },
          }),
        );
        chip.appendChild(row);
      }
      if (!state.on && row) {
        row.remove();
        row = null;
      }
    }

    tick.addEventListener('change', () => {
      state.on = tick.checked;
      if (!state.on) state.skill = '';
      show();
      touched();
    });

    show();
    return chip;
  }

  function chipGrid(keys: readonly ProfessionKey[]): HTMLElement {
    const grid = el('div', 'gchips');
    for (const key of keys) grid.appendChild(professionChip(key));
    return grid;
  }

  /* ------------------------------------------------------------- whose it is
     A lookup rather than a list. The officer is filing for somebody who has no
     character yet, and a list of people who have one cannot name them. */

  function ownerField(state: OwnerPicker): HTMLElement {
    const box = el('div', 'gowner');

    if (state.canSearch) {
      const search = document.createElement('input');
      search.className = 'drawer__input';
      search.type = 'search';
      search.placeholder = 'Find somebody by their Discord name';
      search.setAttribute('aria-label', 'Find a member');
      search.dataset.focusKey = 'guild-owner';
      search.value = state.query;
      search.addEventListener('input', () => handlers.onOwnerQuery?.(search.value));
      box.appendChild(search);
    }

    if (state.problem) {
      const warn = el('div', 'gwarn', state.problem);
      warn.setAttribute('role', 'alert');
      box.appendChild(warn);
    }

    const row = el('div', 'gowner__list');

    const choice = (id: string | null, label: string): HTMLElement => {
      const button = el('button', 'gowner__pick', label);
      (button as HTMLButtonElement).type = 'button';
      button.classList.toggle('gowner__pick--on', ownerId === id);
      button.addEventListener('click', () => {
        ownerId = id;
        handlers.onOwnerPick?.(id, id === null ? null : label);
        handlers.onChange(readDraft());
        for (const other of row.querySelectorAll('.gowner__pick')) {
          other.classList.toggle('gowner__pick--on', other === button);
        }
        drawPreview();
      });
      return button;
    };

    row.appendChild(choice(null, 'Me'));

    const shown = state.query.trim().length >= 2 ? state.results : state.people;
    for (const person of shown.slice(0, 15)) {
      row.appendChild(choice(person.userId, person.displayName));
    }

    /* Somebody chosen a search ago, still chosen, and in neither list now. */
    if (ownerId && state.chosenName && !shown.some((p) => p.userId === ownerId)) {
      row.appendChild(choice(ownerId, state.chosenName));
    }
    box.appendChild(row);

    if (state.searching) {
      box.appendChild(el('div', 'drawer__hint', 'Looking…'));
    } else if (state.canSearch && state.query.trim().length === 1) {
      box.appendChild(el('div', 'drawer__hint', 'Two letters at least.'));
    } else if (state.canSearch && state.query.trim().length >= 2 && !state.results.length) {
      box.appendChild(
        el('div', 'drawer__hint', 'Nobody in this Discord server matches that.'),
      );
    }

    return field(
      'Whose character',
      box,
      state.canSearch
        ? 'File one for somebody who has not signed in yet. They can edit it themselves once they do.'
        : 'This bot is older than the member lookup, so only people who already have a character are listed.',
    );
  }

  /* ------------------------------------------------------------- arrangement */

  function group(title: string, hint?: string): { group: HTMLElement; rows: HTMLElement } {
    const wrap = el('section', 'ggroup');
    const head = el('div', 'ggroup__head');
    head.appendChild(el('h3', 'ggroup__title', title));
    if (hint) head.appendChild(el('span', 'ggroup__hint', hint));
    wrap.appendChild(head);
    const rows = el('div', 'ggrid');
    wrap.appendChild(rows);
    return { group: wrap, rows };
  }

  form.appendChild(preview);

  const who = group('Who this is');
  if (picker) who.rows.appendChild(ownerField(picker));
  who.rows.appendChild(
    field(
      'Character name',
      name,
      'As it is in game, surname and all. Forever gives every character one.',
    ),
  );
  who.rows.appendChild(
    field(
      'Ruleset',
      ruleset,
      'Forever has no realms. A character stays on the ruleset it was made on, and cannot group across them.',
    ),
  );
  who.rows.appendChild(field('Level', level, 'Optional.'));
  form.appendChild(who.group);

  const what = group('What they play');
  what.rows.appendChild(field('Class', classSelect));
  what.rows.appendChild(field('Spec', specSelect));
  what.rows.appendChild(
    field('Role', roleSelect, 'Only set this when the spec does not say it: a bear, or a Shadow priest who heals.'),
  );
  const mainWrap = el('label', 'gcheck gfield--wide');
  mainWrap.append(main, el('span', '', 'This is the character they raid on'));
  what.rows.appendChild(mainWrap);
  what.rows.appendChild(
    el('span', 'gfield__hint gfield--wide', 'Marking one as the main clears it from their other characters.'),
  );
  form.appendChild(what.group);

  const profs = group('Professions', 'Two primary at most');
  const profsBox = el('div', 'gfield--wide');
  profsBox.appendChild(el('div', 'section-label', 'Primary'));
  profsBox.appendChild(chipGrid(PRIMARY_PROFESSIONS));
  profsBox.appendChild(el('div', 'section-label', 'Secondary'));
  profsBox.appendChild(chipGrid(SECONDARY_PROFESSIONS));
  profs.rows.appendChild(profsBox);
  form.appendChild(profs.group);

  const extra = group('Anything else');
  const noteField = field('Note', note, 'Optional, and everyone in the Discord server can read it.');
  noteField.classList.add('gfield--wide');
  extra.rows.appendChild(noteField);
  form.appendChild(extra.group);

  /* ---------------------------------------------------------------- the bar */

  const actions = el('div', 'gactions');
  const save = el('button', 'btn btn--gold', opts.busy ? 'Saving…' : existing ? 'Save changes' : 'Add the character');
  (save as HTMLButtonElement).type = 'submit';
  (save as HTMLButtonElement).disabled = opts.busy;

  const cancel = el('button', 'btn', 'Cancel');
  (cancel as HTMLButtonElement).type = 'button';
  cancel.addEventListener('click', () => handlers.onCancel());

  actions.append(save, cancel);
  form.appendChild(actions);

  /* ------------------------------------------------------ reading it back */

  /* From what the chips hold, in the order the game lists them, so two saves of
     the same form produce the same list. */
  function readProfessions(): Profession[] {
    const out: Profession[] = [];
    for (const key of ALL_PROFESSIONS) {
      const state = live.get(key);
      if (!state?.on) continue;
      const raw = state.skill.trim();
      out.push({ key, skill: raw === '' ? null : Number(raw) });
    }
    return out;
  }

  /** The form as it stands. Untrimmed: what is in the field is what is held. */
  function readDraft(): EditorDraft {
    return {
      ownerId,
      name: name.value,
      ruleset: ruleset.value || null,
      classKey: classSelect.value,
      specKey: specSelect.value || null,
      roleKey: roleSelect.value || null,
      level: levelValue,
      isMain: main.checked,
      professions: readProfessions(),
      note: note.value,
    };
  }

  /** Field-level complaints go next to the field, and take focus with them. */
  const FIELD_CONTROL: Record<string, HTMLElement> = {
    name,
    level: level.querySelector<HTMLElement>('.gnum__value') ?? level,
    professions: profsBox,
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (opts.busy) return;

    const next = readDraft();
    handlers.onChange(next);

    /* Answered here so an obvious mistake does not cost a round trip, and so the
       cursor lands on the field that is wrong. The bot checks all of it again, and
       its answer is the one that decides. */
    const problem = draftProblem(next);
    if (problem) {
      const warn = form.querySelector('.gwarn') ?? el('div', 'gwarn');
      warn.textContent = problem.message;
      warn.setAttribute('role', 'alert');
      if (!warn.parentElement) form.prepend(warn);
      FIELD_CONTROL[problem.field]?.focus?.();
      return;
    }

    handlers.onSave(next);
  });

  drawPreview();
  body.appendChild(form);
  return section;
}

/* ------------------------------------------------------------------ coverage */

export interface CoveragePanelOptions {
  coverage: Coverage;
  missing: CharacterList['missing'];
}

/**
 * What the guild has not got, for whoever runs it.
 *
 * Drawn only for a leader. It is a list of things people have not done, which is
 * not everybody's business, and a member opening the page wants the roster rather
 * than a report on their friends.
 */
export function renderCoverage(opts: CoveragePanelOptions): HTMLElement {
  const { coverage, missing } = opts;
  const { panel: section, body } = panel(
    'What the guild is missing',
    coverage.characters + ' characters, ' + coverage.members + ' members',
  );

  const line = headline(coverage, missing?.without.length ?? 0);
  body.appendChild(
    line
      ? el('div', 'gheadline', line)
      : el('div', 'gheadline gheadline--ok', 'Everything is covered and everyone has filed a character.'),
  );

  /* -------- raiders who have filed nothing */
  if (missing) {
    const box = el('div', 'gcov');
    box.appendChild(el('div', 'gcov__title', 'Nothing entered'));
    if (!missing.configured) {
      box.appendChild(
        el(
          'p',
          'drawer__hint',
          'This Discord server has not said which role means raider, so there is nobody to compare against. Set one with /settings raider_role.',
        ),
      );
    } else if (!missing.without.length) {
      box.appendChild(
        el('p', 'drawer__hint', 'All ' + missing.raiders + ' raiders have entered at least one character.'),
      );
    } else {
      const names = el('div', 'gnames');
      for (const raider of missing.without) {
        const tag = el('span', 'gname', raider.displayName);
        names.appendChild(tag);
      }
      box.appendChild(names);
      box.appendChild(
        el('div', 'drawer__hint', missing.without.length + ' of ' + missing.raiders + ' raiders.'),
      );
    }
    body.appendChild(box);
  }

  /* -------- professions */
  const profs = el('div', 'gcov');
  profs.appendChild(el('div', 'gcov__title', 'Professions'));
  const profRow = el('div', 'gcovgrid');
  for (const p of coverage.professions) {
    const tag = el('span', 'gcov__item');
    if (!p.characters) tag.classList.add('gcov__item--none');
    tag.appendChild(iconImg(professionIcon(p.key), p.name, 'gprof__icon'));
    tag.appendChild(el('span', 'gcov__name', p.name));
    tag.appendChild(
      el('span', 'gcov__count', p.characters ? String(p.members) : 'none'),
    );
    if (p.best !== null) tag.title = p.name + ', best skill ' + p.best;
    profRow.appendChild(tag);
  }
  profs.appendChild(profRow);
  body.appendChild(profs);

  /* -------- roles and classes */
  const comp = el('div', 'gcov');
  comp.appendChild(el('div', 'gcov__title', 'Roles and classes'));
  const roleRow = el('div', 'gstats');
  for (const r of coverage.roles) {
    const box = el('div', 'gstat');
    if (!r.characters) box.classList.add('gstat--none');
    box.appendChild(el('div', 'gstat__value num', String(r.characters)));
    box.appendChild(el('div', 'gstat__label', ROLE_NAME[r.role].toLowerCase()));
    roleRow.appendChild(box);
  }
  comp.appendChild(roleRow);

  if (coverage.missingClasses.length) {
    comp.appendChild(
      el(
        'div',
        'drawer__hint',
        'Nobody plays ' + joinWords(coverage.missingClasses.map((id) => CLASSES[id].name)) + '.',
      ),
    );
  }
  body.appendChild(comp);

  /* -------- gear */
  if (coverage.withoutGear) {
    body.appendChild(
      el(
        'div',
        'drawer__hint',
        coverage.withoutGear +
          ' of ' +
          coverage.characters +
          ' characters have no gear pasted, so there is nothing to look at on those profiles.',
      ),
    );
  }

  return section;
}
