/**
 * Every panel on the guild page. Pure builders: they take state and handlers and give
 * back nodes, so main.ts stays the only file that decides when anything changes.
 */

import { CLASSES, CLASS_IDS, type ClassId } from '../shared/classes';
import { iconImg } from '../shared/icons';
import { renderGearSheet, wornCount } from '../shared/gear-view';
import { specFromSignup, specKeyForSpecId } from '../raid/groupbuilder';
import type { Character, CharacterDetail, CharacterInput } from './api';
import {
  MAX_PROFESSION_SKILL,
  PRIMARY_PROFESSIONS,
  professionIcon,
  SECONDARY_PROFESSIONS,
  professionName,
  professionProblem,
  sortProfessions,
  type Profession,
  type ProfessionKey,
} from './professions';

export function el(tag: string, cls?: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

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
          ? 'Add yours, and anyone else in the server can add theirs. An officer can fill one in for somebody who has not signed in.'
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
    character.realm || null,
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

  /* Says where it goes before they paste it, not after. Everyone in the server can
     read a profile, and this is the one thing on the page that leaves their machine. */
  box.appendChild(
    el(
      'div',
      'drawer__hint',
      'Only what you are wearing is stored, never your bags or your bank. Everyone in this server can see it.',
    ),
  );
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
  onSave(input: CharacterInput, userId: string | null): void;
  onCancel(): void;
}

export interface EditorOptions {
  /** The character being changed, or null when this is a new one. */
  character: Character | null;
  /** Server members an officer may file a character for. Empty for everyone else. */
  people: ReadonlyArray<{ userId: string; displayName: string }>;
  canPickOwner: boolean;
  busy: boolean;
  /** What the last save said went wrong, shown above the fields. */
  problem: string | null;
}

function field(label: string, control: HTMLElement, hint?: string): HTMLElement {
  const wrap = el('label', 'gfield');
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
 * Reads its own values on save rather than keeping them in module state, so a redraw
 * under a half-filled form cannot lose what somebody typed into a field they had not
 * finished with.
 */
export function renderEditor(opts: EditorOptions, handlers: EditorHandlers): HTMLElement {
  const existing = opts.character;
  const { panel: section, body } = panel(existing ? 'Edit ' + existing.name : 'Add a character');

  if (opts.problem) {
    const warn = el('div', 'gwarn', opts.problem);
    warn.setAttribute('role', 'alert');
    body.appendChild(warn);
  }

  const form = document.createElement('form');
  form.className = 'gform';
  form.noValidate = true;

  /* -------- who it belongs to */
  let owner: HTMLSelectElement | null = null;
  if (opts.canPickOwner && !existing) {
    owner = document.createElement('select');
    owner.className = 'btn';
    owner.appendChild(option('', 'Me', true));
    for (const person of opts.people) {
      owner.appendChild(option(person.userId, person.displayName, false));
    }
    form.appendChild(
      field(
        'Whose character',
        owner,
        'You can file one for somebody who has not signed in yet. They can edit it themselves once they do.',
      ),
    );
  }

  /* -------- name and realm */
  const name = document.createElement('input');
  name.className = 'drawer__input';
  name.type = 'text';
  name.maxLength = 12;
  name.autocomplete = 'off';
  name.value = existing?.name ?? '';
  name.placeholder = 'Thrallsbane';
  name.dataset.focusKey = 'guild-name';
  form.appendChild(field('Character name', name, '2 to 12 letters, spelled as it is in game.'));

  const realm = document.createElement('input');
  realm.className = 'drawer__input';
  realm.type = 'text';
  realm.maxLength = 64;
  realm.autocomplete = 'off';
  realm.value = existing?.realm ?? '';
  realm.placeholder = 'Nightslayer';
  form.appendChild(field('Realm', realm, 'Optional.'));

  /* -------- class, spec and role */
  const classSelect = document.createElement('select');
  classSelect.className = 'btn';
  for (const id of CLASS_IDS) {
    classSelect.appendChild(option(id, CLASSES[id].name, existing?.classKey === id));
  }

  const specSelect = document.createElement('select');
  specSelect.className = 'btn';

  const roleSelect = document.createElement('select');
  roleSelect.className = 'btn';

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

  fillSpecs(existing?.specKey ?? null);
  fillRoles(existing?.roleKey ?? null);

  classSelect.addEventListener('change', () => {
    fillSpecs(null);
    fillRoles(null);
  });
  specSelect.addEventListener('change', () => fillRoles(roleSelect.value || null));

  form.appendChild(field('Class', classSelect));
  form.appendChild(field('Spec', specSelect));
  form.appendChild(
    field('Role', roleSelect, 'Only set this when the spec does not say it: a bear, or a Shadow priest who heals.'),
  );

  const level = document.createElement('input');
  level.className = 'drawer__input';
  level.type = 'number';
  level.min = '1';
  level.max = '100';
  level.value = existing?.level ? String(existing.level) : '';
  level.placeholder = '60';
  form.appendChild(field('Level', level, 'Optional.'));

  /* -------- main or alt */
  const mainWrap = el('label', 'gcheck');
  const main = document.createElement('input');
  main.type = 'checkbox';
  main.checked = existing?.isMain ?? false;
  mainWrap.appendChild(main);
  mainWrap.appendChild(el('span', '', 'This is the character they raid on'));
  form.appendChild(mainWrap);
  form.appendChild(
    el('span', 'gfield__hint', 'Marking one as the main clears it from their other characters.'),
  );

  /* -------- professions */
  const profsBox = el('div', 'gprofedit');
  const chosen = new Map<ProfessionKey, number | null>();
  for (const p of existing?.professions ?? []) chosen.set(p.key, p.skill);

  function professionRow(key: ProfessionKey): HTMLElement {
    const row = el('label', 'gprofrow');
    const tick = document.createElement('input');
    tick.type = 'checkbox';
    tick.checked = chosen.has(key);
    tick.dataset.profession = key;

    const skill = document.createElement('input');
    skill.className = 'gprofrow__skill';
    skill.type = 'number';
    skill.min = '1';
    skill.max = String(MAX_PROFESSION_SKILL);
    skill.placeholder = '—';
    skill.value = chosen.get(key) != null ? String(chosen.get(key)) : '';
    skill.disabled = !tick.checked;
    skill.setAttribute('aria-label', professionName(key) + ' skill');

    tick.addEventListener('change', () => {
      skill.disabled = !tick.checked;
      if (!tick.checked) skill.value = '';
    });

    row.appendChild(tick);
    row.appendChild(iconImg(professionIcon(key), professionName(key), 'gprof__icon'));
    row.appendChild(el('span', 'gprofrow__name', professionName(key)));
    row.appendChild(skill);
    return row;
  }

  profsBox.appendChild(el('div', 'section-label', 'Primary, two at most'));
  const primaries = el('div', 'gprofgrid');
  for (const key of PRIMARY_PROFESSIONS) primaries.appendChild(professionRow(key));
  profsBox.appendChild(primaries);

  profsBox.appendChild(el('div', 'section-label', 'Secondary'));
  const secondaries = el('div', 'gprofgrid');
  for (const key of SECONDARY_PROFESSIONS) secondaries.appendChild(professionRow(key));
  profsBox.appendChild(secondaries);
  form.appendChild(field('Professions', profsBox));

  /* -------- note */
  const note = document.createElement('textarea');
  note.className = 'drawer__input';
  note.rows = 2;
  note.maxLength = 500;
  note.value = existing?.note ?? '';
  note.placeholder = 'Anything the raid leader should know.';
  form.appendChild(field('Note', note, 'Optional, and everyone in the server can read it.'));

  /* -------- read the form back */
  function readProfessions(): Profession[] {
    const out: Profession[] = [];
    for (const row of form.querySelectorAll<HTMLInputElement>('input[data-profession]')) {
      if (!row.checked) continue;
      const key = row.dataset.profession as ProfessionKey;
      const skillInput = row.parentElement?.querySelector<HTMLInputElement>('.gprofrow__skill');
      const raw = skillInput?.value.trim() ?? '';
      out.push({ key, skill: raw === '' ? null : Number(raw) });
    }
    return out;
  }

  const actions = el('div', 'gactions');
  const save = el('button', 'btn btn--gold', opts.busy ? 'Saving…' : 'Save');
  (save as HTMLButtonElement).type = 'submit';
  (save as HTMLButtonElement).disabled = opts.busy;
  actions.appendChild(save);

  const cancel = el('button', 'btn', 'Cancel');
  (cancel as HTMLButtonElement).type = 'button';
  cancel.addEventListener('click', () => handlers.onCancel());
  actions.appendChild(cancel);
  form.appendChild(actions);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (opts.busy) return;

    const professions = readProfessions();
    // Answered here so an obvious mistake does not cost a round trip. The bot checks
    // the same things again, and its answer is the one that decides.
    const problem = professionProblem(professions);
    if (problem) {
      const warn = form.querySelector('.gwarn') ?? el('div', 'gwarn');
      warn.textContent = problem;
      warn.setAttribute('role', 'alert');
      if (!warn.parentElement) form.prepend(warn);
      return;
    }

    handlers.onSave(
      {
        name: name.value.trim(),
        realm: realm.value.trim(),
        classKey: classSelect.value,
        specKey: specSelect.value || null,
        roleKey: roleSelect.value || null,
        level: level.value.trim() === '' ? null : Number(level.value),
        isMain: main.checked,
        professions,
        note: note.value.trim(),
      },
      owner?.value || null,
    );
  });

  body.appendChild(form);
  return section;
}
