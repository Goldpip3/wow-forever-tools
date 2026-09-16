import type { Coverage, EffectCoverage, Player, Roster } from './types';
import { GROUP_COUNT, GROUP_SIZE } from './types';
import {
  CLASSES,
  CLASS_LIST,
  specById,
  ARCHETYPE_LABEL,
  ROLE_LABEL,
  ROLE_ORDER,
  ROLE_SHORT,
  archetypeFor,
  type ClassId,
} from '../shared/classes';
import { iconImg } from '../shared/icons';
import { attachTooltips } from '../shared/tooltip';
import { lookupEffectText } from './spelltext';
import { CATEGORIES, META_ORDER, type MetaCategory } from './categories';
import { activeGroupCount, specLabel } from './engine';
import { effectById } from './effects/index';
import { overview, profileGroups, seatValue, type GroupProfile, type Suggestion } from './suggestions';

function el(tag: string, cls?: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

export interface RaidHandlers {
  onPickSeat: (group: number, slot: number) => void;
  onDropSpec: (classId: ClassId, specId: number, group: number, slot: number) => void;
  onMovePlayer: (playerId: string, group: number, slot: number) => void;
  onRemove: (group: number, slot: number) => void;
  onRename: (playerId: string, name: string) => void;
  onOpenLoadout: (playerId: string) => void;
  onSize: (size: 40 | 20 | 10) => void;
  onCap: (cap: number) => void;
  onReset: () => void;
  onCopyLink: () => void;
  onCopyDiscord: () => void;
  onFillSample: () => void;
  onApplySuggestion: (s: Suggestion) => void;
  onFocusPlayer: (playerId: string) => void;
  /* Roster mode only. Planner mode leaves these unset and never shows a pool. */
  onSeatFromPool?: (userId: string, group: number, slot: number) => void;
  onReturnToPool?: (playerId: string) => void;
  onCut?: (userId: string) => void;
  onUncut?: (userId: string) => void;
  onPublish?: () => void;
  onAddGuest?: () => void;
}

/* ------------------------------------------------------------------ toolbar */

export function renderToolbar(roster: Roster, coverage: Coverage, h: RaidHandlers): HTMLElement {
  const bar = el('div', 'rtoolbar');

  const left = el('div', 'rtoolbar__group');
  const size = document.createElement('select');
  size.className = 'btn';
  size.setAttribute('aria-label', 'Raid size');
  for (const n of [40, 20, 10] as const) {
    const opt = document.createElement('option');
    opt.value = String(n);
    opt.textContent = n + '-player raid';
    if (roster.size === n) opt.selected = true;
    size.appendChild(opt);
  }
  size.addEventListener('change', () => h.onSize(Number(size.value) as 40 | 20 | 10));
  left.appendChild(size);

  const sample = el('button', 'btn', 'Sample raid');
  sample.addEventListener('click', h.onFillSample);
  const reset = el('button', 'btn', 'Clear');
  reset.addEventListener('click', h.onReset);
  left.append(sample, reset);
  bar.appendChild(left);

  const right = el('div', 'rtoolbar__group');

  const capWrap = el('label', 'rtoolbar__field');
  capWrap.appendChild(el('span', 'rtoolbar__label', 'Debuff limit'));
  const cap = document.createElement('input');
  cap.type = 'number';
  cap.className = 'btn rtoolbar__cap';
  cap.min = '0';
  cap.max = '99';
  cap.value = String(roster.settings.debuffCap);
  cap.setAttribute('aria-label', 'Debuff limit, 0 for none');
  cap.addEventListener('change', () => h.onCap(Number(cap.value)));
  capWrap.appendChild(cap);
  right.appendChild(capWrap);

  const capped = coverage.debuffCap > 0;
  const used = el(
    'span',
    'rtoolbar__meter' + (capped && coverage.debuffSlotsUsed > coverage.debuffCap ? ' rtoolbar__meter--over' : ''),
    capped
      ? coverage.debuffSlotsUsed + '/' + coverage.debuffCap + ' debuffs'
      : coverage.debuffSlotsUsed + ' debuffs',
  );
  used.title = capped ? 'Debuffs on the target, against your limit' : 'Debuffs on the target. No limit set.';
  right.appendChild(used);

  const discord = el('button', 'btn', 'Copy for Discord');
  discord.addEventListener('click', h.onCopyDiscord);
  const link = el('button', 'btn btn--gold', 'Share');
  link.addEventListener('click', h.onCopyLink);
  right.append(discord, link);
  bar.appendChild(right);

  return bar;
}

/* ------------------------------------------------------------- groups on top */

function seatCard(
  roster: Roster,
  group: number,
  slot: number,
  profile: GroupProfile | undefined,
  h: RaidHandlers,
): HTMLElement {
  const player = roster.groups[group]?.[slot] ?? null;
  const cell = el('div', 'seat' + (player ? ' seat--filled' : ' seat--empty'));
  cell.dataset.group = String(group);
  cell.dataset.slot = String(slot);

  cell.addEventListener('dragover', (ev) => {
    ev.preventDefault();
    cell.classList.add('seat--drop');
  });
  cell.addEventListener('dragleave', () => cell.classList.remove('seat--drop'));
  cell.addEventListener('drop', (ev) => {
    ev.preventDefault();
    cell.classList.remove('seat--drop');
    const raw = ev.dataTransfer?.getData('text/plain');
    if (!raw) return;
    try {
      const data = JSON.parse(raw) as
        | { kind: 'spec'; classId: ClassId; specId: number }
        | { kind: 'player'; playerId: string }
        | { kind: 'pool'; userId: string };
      if (data.kind === 'spec') h.onDropSpec(data.classId, data.specId, group, slot);
      else if (data.kind === 'pool') h.onSeatFromPool?.(data.userId, group, slot);
      else h.onMovePlayer(data.playerId, group, slot);
    } catch {
      /* ignore malformed drags */
    }
  });

  if (!player) {
    const add = el('button', 'seat__add', '+');
    add.title = 'Add a player to group ' + (group + 1);
    add.setAttribute('aria-label', 'Add a player to group ' + (group + 1));
    add.addEventListener('click', () => h.onPickSeat(group, slot));
    cell.appendChild(add);
    return cell;
  }

  const info = CLASSES[player.classId];
  const spec = specById(player.specId);
  const arch = archetypeFor(player);

  cell.draggable = true;
  cell.style.setProperty('--class-color', info.color);
  cell.addEventListener('dragstart', (ev) => {
    ev.dataTransfer?.setData('text/plain', JSON.stringify({ kind: 'player', playerId: player.id }));
    if (ev.dataTransfer) ev.dataTransfer.effectAllowed = 'move';
  });

  // Flag a seat only when this group's party buffs do nothing at all for them.
  const wasted = !!profile && profile.buffs.length > 0 && seatValue(player, profile) === 0;
  if (wasted) {
    cell.classList.add('seat--misfit');
    cell.title =
      profile!.buffs.map((b) => b.name).join(', ') +
      ' in this group does nothing for a ' + ARCHETYPE_LABEL[arch].toLowerCase().replace(/s$/, '') + '.';
  }

  cell.appendChild(iconImg(spec?.icon ?? info.icon, '', 'seat__icon'));

  const body = el('div', 'seat__body');
  const nameInput = document.createElement('input');
  nameInput.className = 'seat__name';
  nameInput.value = player.name;
  nameInput.setAttribute('aria-label', 'Player name');
  nameInput.style.color = info.color;
  nameInput.addEventListener('change', () => h.onRename(player.id, nameInput.value));
  nameInput.addEventListener('blur', () => h.onRename(player.id, nameInput.value));
  nameInput.addEventListener('dragstart', (ev) => ev.preventDefault());
  body.appendChild(nameInput);

  /* In roster mode the seat holds a real person, so the spec line also carries what that
     person said when they signed up. That is the member speaking, not the leader's
     decision about them, which is why it sits next to their name and not in place of it. */
  const specLine = el('div', 'seat__spec');
  specLine.appendChild(el('span', '', spec?.short ?? ''));
  if (player.discord && player.discord.signupStatus !== 'primary') {
    const mark = el('span', 'seat__signup', SIGNUP_LABEL[player.discord.signupStatus] ??
      player.discord.signupStatus);
    mark.title = SIGNUP_TITLE[player.discord.signupStatus] ??
      'Signed up as ' + player.discord.signupStatus;
    mark.dataset.status = player.discord.signupStatus;
    specLine.appendChild(mark);
  }
  body.appendChild(specLine);
  cell.appendChild(body);

  const btns = el('div', 'seat__btns');
  const gear = el('button', 'seat__btn', '⚙');
  gear.title = 'Buffs and loadout for ' + player.name;
  gear.setAttribute('aria-label', 'Loadout for ' + player.name);
  gear.addEventListener('click', () => h.onOpenLoadout(player.id));
  const remove = el('button', 'seat__btn', '×');
  remove.title = 'Remove ' + player.name;
  remove.setAttribute('aria-label', 'Remove ' + player.name);
  remove.addEventListener('click', () => h.onRemove(group, slot));
  btns.append(gear, remove);
  cell.appendChild(btns);

  return cell;
}

export function renderGroups(roster: Roster, coverage: Coverage, h: RaidHandlers): HTMLElement {
  const panel = el('section', 'panel groups-panel');
  const head = el('div', 'panel__head');
  head.appendChild(el('span', '', 'Groups'));
  const filled = roster.groups.flat().filter(Boolean).length;
  head.appendChild(el('span', 'panel__count', filled + ' of ' + roster.size + ' seats filled'));
  panel.appendChild(head);

  const wrap = el('div', 'groups');
  const active = activeGroupCount(roster.size);
  const profiles = profileGroups(roster, coverage);
  const byIndex = new Map(profiles.map((p) => [p.index, p]));

  for (let g = 0; g < GROUP_COUNT; g += 1) {
    const inRaid = g < active;
    const profile = byIndex.get(g);
    const group = el('div', 'group' + (inRaid ? '' : ' group--off'));

    const gHead = el('div', 'group__head');
    gHead.appendChild(el('span', 'group__title', 'Group ' + (g + 1)));
    if (inRaid && profile?.dominant) {
      gHead.appendChild(el('span', 'group__suits', ROLE_SHORT[profile.dominant]));
    } else if (!inRaid) {
      gHead.appendChild(el('span', 'group__suits', 'not in raid'));
    }
    group.appendChild(gHead);

    const slots = el('div', 'group__seats');
    for (let s = 0; s < GROUP_SIZE; s += 1) {
      slots.appendChild(seatCard(roster, g, s, profile, h));
    }
    group.appendChild(slots);

    if (inRaid) {
      const buffs = el('div', 'group__buffs');
      const seen = new Set<string>();
      for (const cov of coverage.byEffect.values()) {
        if (cov.effect.scope !== 'party' || !cov.groups[g]) continue;
        if (cov.effect.kind === 'list') continue;
        if (seen.has(cov.effect.id)) continue;
        seen.add(cov.effect.id);
        const img = iconImg(cov.effect.icon, cov.effect.name);
        img.dataset.effect = cov.effect.id;
        buffs.appendChild(img);
      }
      if (!seen.size) buffs.appendChild(el('span', 'group__buffs-none', 'no party buffs'));
      group.appendChild(buffs);
    }

    wrap.appendChild(group);
  }

  attachTooltips(
    wrap,
    (target) => (target.closest('.group__buffs img') as HTMLElement | null),
    (img) => {
      const id = img.dataset.effect;
      const cov = id ? coverage.byEffect.get(id) : undefined;
      return cov ? buildEffectTip(cov, active) : null;
    },
  );

  panel.appendChild(wrap);
  return panel;
}

/* ------------------------------------------------------------ overview, left */

export function renderOverview(roster: Roster, h: RaidHandlers): HTMLElement {
  const panel = el('section', 'panel');
  const head = el('div', 'panel__head');
  head.appendChild(el('span', '', 'Overview'));
  panel.appendChild(head);

  const body = el('div', 'panel__body ov');
  const view = overview(roster);

  const tally = el('div', 'ov__tally');
  for (const bucket of ROLE_ORDER) {
    const chip = el('div', 'ov__chip');
    chip.appendChild(el('span', 'ov__chip-n', String(view.counts[bucket])));
    chip.appendChild(el('span', 'ov__chip-l', ROLE_SHORT[bucket]));
    tally.appendChild(chip);
  }
  body.appendChild(tally);

  for (const bucket of ROLE_ORDER) {
    const list = view.players[bucket];
    const section = el('div', 'ov__section');
    const label = el('div', 'ov__label');
    label.appendChild(el('span', '', ROLE_LABEL[bucket]));
    label.appendChild(el('span', 'ov__label-n', String(list.length)));
    section.appendChild(label);

    if (!list.length) {
      section.appendChild(el('div', 'ov__none', 'none'));
    } else {
      for (const { player, group } of list) {
        const row = el('button', 'ov__row');
        const info = CLASSES[player.classId];
        const spec = specById(player.specId);
        row.appendChild(iconImg(spec?.icon ?? info.icon, '', 'ov__icon'));
        const name = el('span', 'ov__name', player.name);
        name.style.color = info.color;
        row.appendChild(name);
        row.appendChild(el('span', 'ov__group', 'G' + (group + 1)));
        row.title = specLabel(player) + ', group ' + (group + 1);
        row.addEventListener('click', () => h.onFocusPlayer(player.id));
        section.appendChild(row);
      }
    }
    body.appendChild(section);
  }

  panel.appendChild(body);
  return panel;
}

/* --------------------------------------------------- suggestions and warnings */

export function renderSuggestions(suggestions: Suggestion[], h: RaidHandlers): HTMLElement {
  const panel = el('section', 'panel');
  const head = el('div', 'panel__head');
  head.appendChild(el('span', '', 'Suggested moves'));
  head.appendChild(el('span', 'panel__count', suggestions.length ? suggestions.length + ' found' : 'none'));
  panel.appendChild(head);

  const body = el('div', 'panel__body');
  if (!suggestions.length) {
    body.appendChild(
      el(
        'p',
        'empty-note',
        'No seat changes would help. Every player is in a group whose buffs they actually use.',
      ),
    );
  } else {
    const list = el('div', 'sugg-list');
    for (const s of suggestions) {
      const item = el('div', 'sugg');
      const top = el('div', 'sugg__top');
      top.appendChild(el('span', 'sugg__title', s.title));
      top.appendChild(el('span', 'sugg__gain', '+' + s.gain));
      item.appendChild(top);
      item.appendChild(el('div', 'sugg__detail', s.detail));
      const apply = el('button', 'btn btn--sm', s.kind === 'move' ? 'Move them' : 'Swap them');
      apply.addEventListener('click', () => h.onApplySuggestion(s));
      item.appendChild(apply);
      list.appendChild(item);
    }
    body.appendChild(list);
  }
  panel.appendChild(body);
  return panel;
}

/**
 * Only two of these are things to act on. Anything informational is not a problem
 * and does not belong in a list headed "what to fix", so it lives in Notes instead.
 */
const LEVELS = [
  { key: 'error', label: 'Problems', mark: '✖', blurb: 'The raid loses something until you fix these.' },
  { key: 'warn', label: 'Warnings', mark: '⚠', blurb: 'Working, but a buff is going to waste.' },
] as const;

/** A strip under the toolbar so real problems are visible without scrolling. */
export function renderAlertBar(coverage: Coverage): HTMLElement | null {
  const counts = { error: 0, warn: 0 };
  for (const w of coverage.warnings) {
    if (w.level === 'error') counts.error += 1;
    else if (w.level === 'warn') counts.warn += 1;
  }
  if (!counts.error && !counts.warn) return null;

  const bar = el('div', 'alertbar');
  for (const level of LEVELS) {
    const n = counts[level.key];
    if (!n) continue;
    const item = el('button', 'alertbar__item alertbar__item--' + level.key);
    item.appendChild(el('span', 'alertbar__mark', level.mark));
    item.appendChild(el('span', 'alertbar__n', String(n)));
    const word = n === 1 ? level.label.toLowerCase().replace(/s$/, '') : level.label.toLowerCase();
    item.appendChild(el('span', 'alertbar__label', word));
    item.title = 'Jump to the list';
    item.addEventListener('click', () => {
      document.getElementById('problems')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    bar.appendChild(item);
  }
  bar.appendChild(el('span', 'alertbar__hint', 'Details in "What to fix", under the groups.'));
  return bar;
}

export function renderWarnings(coverage: Coverage): HTMLElement {
  const panel = el('section', 'panel');
  panel.id = 'problems';

  const actionable = coverage.warnings.filter((w) => w.level !== 'info');
  const counts = { error: 0, warn: 0 };
  for (const w of actionable) {
    if (w.level === 'error') counts.error += 1;
    else counts.warn += 1;
  }

  const head = el('div', 'panel__head');
  head.appendChild(el('span', '', 'What to fix'));
  const tally = el('span', 'panel__count');
  if (counts.error) tally.appendChild(el('span', 'tally tally--error', counts.error + (counts.error === 1 ? ' problem' : ' problems')));
  if (counts.warn) tally.appendChild(el('span', 'tally tally--warn', counts.warn + (counts.warn === 1 ? ' warning' : ' warnings')));
  if (!actionable.length) tally.appendChild(el('span', 'tally tally--ok', 'all clear'));
  head.appendChild(tally);
  panel.appendChild(head);

  const body = el('div', 'panel__body');
  if (!actionable.length) {
    body.appendChild(
      el(
        'p',
        'empty-note',
        'No problems and no warnings. Anything else worth reading is in Notes below.',
      ),
    );
    panel.appendChild(body);
    return panel;
  }

  for (const level of LEVELS) {
    const rows = actionable.filter((w) => w.level === level.key);
    if (!rows.length) continue;

    const group = el('div', 'problems__group');
    const label = el('div', 'problems__label problems__label--' + level.key);
    label.appendChild(el('span', 'problems__mark', level.mark));
    label.appendChild(el('span', '', level.label));
    label.appendChild(el('span', 'problems__blurb', level.blurb));
    group.appendChild(label);

    for (const w of rows) {
      const item = el('div', 'warn warn--' + level.key);
      const col = el('div');
      col.appendChild(el('div', 'warn__title', w.title));
      col.appendChild(el('div', 'warn__detail', w.detail));
      item.appendChild(col);
      group.appendChild(item);
    }
    body.appendChild(group);
  }

  panel.appendChild(body);
  return panel;
}

let notesOpen = false;

/**
 * Things that are true but need no action: a buff that only reaches some groups,
 * two effects that do the same job, an effect Forever has not confirmed. Folded
 * away by default so they do not read as faults.
 */
export function renderNotes(coverage: Coverage): HTMLElement | null {
  const notes = coverage.warnings.filter((w) => w.level === 'info');
  if (!notes.length) return null;

  const panel = el('section', 'panel');
  const head = el('div', 'panel__head');
  head.appendChild(el('span', '', 'Notes'));
  head.appendChild(el('span', 'panel__count', notes.length + (notes.length === 1 ? ' note' : ' notes')));
  const toggle = el('button', 'btn btn--sm', notesOpen ? 'Hide' : 'Show');
  head.appendChild(toggle);
  panel.appendChild(head);

  const body = el('div', 'panel__body');
  const list = el('div', 'notes');
  for (const w of notes) {
    const item = el('div', 'note');
    item.appendChild(el('div', 'note__title', w.title));
    item.appendChild(el('div', 'note__detail', w.detail));
    list.appendChild(item);
  }
  body.appendChild(list);
  body.hidden = !notesOpen;
  panel.appendChild(body);

  toggle.addEventListener('click', () => {
    notesOpen = !notesOpen;
    body.hidden = !notesOpen;
    toggle.textContent = notesOpen ? 'Hide' : 'Show';
  });

  return panel;
}

/* --------------------------------------------- buffs and debuffs, right column */

function providerClass(cov: EffectCoverage): string {
  const first = cov.providers[0] ?? null;
  const classId = first ? first.classId : cov.effect.providers[0]?.classId;
  return classId ? CLASSES[classId as ClassId].color : 'var(--line)';
}

/** Who in this raid brings it, or which classes could. */
function providerLine(cov: EffectCoverage): string {
  if (cov.providers.length) return cov.providers.map((p) => p.name).join(', ');
  if (cov.possibleBy.length) {
    const names = cov.possibleBy.map((p) => p.name);
    const shown = names.slice(0, 3).join(', ');
    return shown + (names.length > 3 ? ' and ' + (names.length - 3) + ' more' : '') + ' could bring it';
  }
  const classes = cov.effect.providers
    .map((p) => CLASSES[p.classId as ClassId].name)
    .filter((v, i, a) => a.indexOf(v) === i)
    .join(', ');
  return 'No one in this raid. Comes from: ' + classes;
}

/**
 * Three states, not two. An effect that is covered but overlaps something else
 * already in the raid is working, yet only one of the pair actually applies, so it
 * reads differently from a clean cover.
 */
type CoverState = 'covered' | 'overlaps' | 'available' | 'missing';

function coverState(cov: EffectCoverage): CoverState {
  if (cov.covered) return (cov.overriddenBy ?? []).length > 0 ? 'overlaps' : 'covered';
  // Someone here can bring it, they are just set to something else.
  return cov.possibleBy.length ? 'available' : 'missing';
}

const STATE_LABEL: Record<CoverState, string> = {
  covered: 'Covered',
  overlaps: 'Does not stack',
  // Not 'Available': a Paladin with five available blessings read as a Paladin who
  // brings five blessings, when one of them is a one-at-a-time choice they have not made.
  available: 'Not assigned',
  missing: 'Missing',
};

/**
 * A game-style tooltip: the spell's own name, cost and cast lines, and its real
 * text. The wording comes from the imported data, not from anything written here,
 * so a talent reads as the talent does and a spellbook entry as the spellbook does.
 */
export function buildEffectTip(cov: EffectCoverage, active: number): HTMLElement {
  const tip = el('div');
  tip.appendChild(el('div', 'tip__name', cov.effect.name));

  const real = lookupEffectText(cov.effect);

  if (real?.rank || real?.level) {
    const meta = el('div', 'tip__meta');
    meta.textContent = [real.rank, real.level].filter(Boolean).join('  ');
    tip.appendChild(meta);
  }

  // Cost on the left, range on the right, the way the game lays it out.
  for (const [left, right] of real?.lines ?? []) {
    if (!left && !right) continue;
    const row = el('div', 'tip__cost');
    row.appendChild(el('span', '', left));
    if (right) row.appendChild(el('span', '', right));
    tip.appendChild(row);
  }

  tip.appendChild(el('div', 'tip__body', real?.text ?? ''));

  if (real?.source === 'estimated') {
    tip.appendChild(el('div', 'tip__est', 'Higher ranks were scaled from the rank the demo showed.'));
  }

  if (real?.classic) {
    tip.appendChild(el('div', 'tip__hr'));
    const label = el('div', 'tip__classic-label');
    label.appendChild(el('span', '', 'In Classic'));
    tip.appendChild(label);
    tip.appendChild(el('div', 'tip__classic-text', real.classic));
  }

  tip.appendChild(el('div', 'tip__hr'));

  const scope =
    cov.effect.scope === 'raid'
      ? 'Raid buff'
      : cov.effect.scope === 'party'
        ? 'Party buff, caster group only'
        : cov.effect.scope === 'target'
          ? 'Debuff on the target'
          : 'Self buff';
  tip.appendChild(el('div', 'tip__meta', scope));

  const state = coverState(cov);
  const cls = state === 'missing' ? 'tip__req' : state === 'available' ? 'tip__meta' : 'tip__next';
  const line = el('div', cls);
  line.textContent =
    state === 'missing'
      ? 'Missing. ' + providerLine(cov)
      : state === 'available'
        ? 'Not assigned. ' + providerLine(cov)
        : STATE_LABEL[state] + ': ' + providerLine(cov);
  tip.appendChild(line);

  if (state === 'available') {
    tip.appendChild(el('div', 'tip__note', 'Open that player and pick it, or tick the talent.'));
  }

  if (state === 'overlaps') {
    const others = (cov.overriddenBy ?? []).map((id) => effectById(id)?.name ?? id).join(', ');
    tip.appendChild(el('div', 'tip__note', 'Does not stack with ' + others + '.'));
  }

  if (cov.effect.scope === 'party' && cov.covered) {
    const missing: number[] = [];
    for (let g = 0; g < active; g += 1) if (!cov.groups[g]) missing.push(g + 1);
    if (missing.length) {
      tip.appendChild(el('div', 'tip__req', 'Not in groups ' + missing.join(', ')));
    }
  }

  if (cov.effect.providers.some((p) => p.talent)) {
    tip.appendChild(el('div', 'tip__meta', 'Needs a talent'));
  }
  if (cov.effect.providers.some((p) => p.pet)) {
    tip.appendChild(el('div', 'tip__meta', 'Needs the right pet out'));
  }

  return tip;
}

/**
 * Two lines rather than one. Cramming the name, the pills, the group strip and
 * the status onto a single row made all four of them unreadable in a narrow column.
 */
function effectRow(cov: EffectCoverage, active: number, expanded: boolean): HTMLElement {
  const state = coverState(cov);
  const row = el('div', 'buff buff--' + state);
  row.dataset.effect = cov.effect.id;
  row.style.setProperty('--buff-color', providerClass(cov));

  const head = el('button', 'buff__head');
  head.appendChild(iconImg(cov.effect.icon, '', 'buff__icon'));

  const mid = el('div', 'buff__mid');

  const top = el('div', 'buff__top');
  top.appendChild(el('span', 'buff__name', cov.effect.name));
  top.appendChild(el('span', 'buff__status buff__status--' + state, STATE_LABEL[state]));
  mid.appendChild(top);

  const meta = el('div', 'buff__meta');
  meta.appendChild(
    el('span', 'scope scope--' + cov.effect.scope, cov.effect.scope === 'target' ? 'boss' : cov.effect.scope),
  );
  const status = cov.effect.forever.status;
  if (status !== 'same') {
    const pill = el('span', 'pill pill--' + status, status);
    pill.title = status === 'unverified' ? 'Not confirmed for Forever yet' : status + ' since Classic';
    meta.appendChild(pill);
  }
  if (cov.effect.providers.some((p) => p.talent)) meta.appendChild(el('span', 'tag', 'talent'));
  if (cov.effect.providers.some((p) => p.pet)) meta.appendChild(el('span', 'tag', 'pet'));

  if (cov.effect.scope === 'party' && cov.covered) {
    const strip = el('div', 'strip');
    for (let g = 0; g < active; g += 1) {
      strip.appendChild(el('div', 'strip__cell' + (cov.groups[g] ? ' strip__cell--on' : ''), String(g + 1)));
    }
    meta.appendChild(strip);
  }

  mid.appendChild(meta);
  head.appendChild(mid);
  row.appendChild(head);

  const detail = el('div', 'buff__detail');
  detail.appendChild(el('div', 'buff__who', providerLine(cov)));
  const real = lookupEffectText(cov.effect);
  if (real?.text) detail.appendChild(el('div', 'buff__blurb', real.text));
  if (state === 'overlaps') {
    const others = (cov.overriddenBy ?? []).map((id) => effectById(id)?.name ?? id).join(', ');
    detail.appendChild(el('div', 'buff__clash', 'Does not stack with ' + others + '. Only the stronger one applies.'));
  }
  detail.hidden = !expanded;
  row.appendChild(detail);

  head.addEventListener('click', () => {
    detail.hidden = !detail.hidden;
    if (detail.hidden) openEffects.delete(cov.effect.id);
    else openEffects.add(cov.effect.id);
  });

  return row;
}

const openEffects = new Set<string>();
let buffFilter: 'all' | 'missing' = 'all';

function filterToggle(onChange: () => void): HTMLElement {
  const btn = el('button', 'btn btn--sm' + (buffFilter === 'missing' ? ' btn--on' : ''));
  btn.textContent = 'Missing only';
  btn.title = 'Show everything, or only what this raid is missing';
  btn.addEventListener('click', () => {
    buffFilter = buffFilter === 'all' ? 'missing' : 'all';
    onChange();
  });
  return btn;
}

function panelHead(title: string, covered: number, total: number, extra?: HTMLElement): HTMLElement {
  const head = el('div', 'panel__head');
  head.appendChild(el('span', '', title));
  const count = el('span', 'panel__count');
  count.appendChild(
    el('span', 'tally' + (covered === total ? ' tally--ok' : ''), covered + '/' + total),
  );
  head.appendChild(count);
  if (extra) head.appendChild(extra);
  return head;
}

/** Sorted so the gaps rise to the top of each section. */
function ordered(rows: EffectCoverage[]): EffectCoverage[] {
  return rows
    .filter((c) => (buffFilter === 'all' ? true : !c.covered))
    .sort((a, b) => {
      if (a.covered !== b.covered) return a.covered ? -1 : 1;
      return a.effect.name.localeCompare(b.effect.name);
    });
}

function section(label: string, rows: EffectCoverage[], active: number): HTMLElement | null {
  const shown = ordered(rows);
  if (!shown.length) return null;
  const wrap = el('div', 'buffs__section');
  const head = el('div', 'section-label');
  head.appendChild(el('span', '', label));
  head.appendChild(el('span', 'ov__label-n', shown.filter((r) => r.covered).length + '/' + shown.length));
  wrap.appendChild(head);
  for (const cov of shown) wrap.appendChild(effectRow(cov, active, openEffects.has(cov.effect.id)));
  return wrap;
}

function tipWiring(body: HTMLElement, coverage: Coverage, active: number): void {
  attachTooltips(
    body,
    (target) => (target.closest('.buff') as HTMLElement | null),
    (rowEl) => {
      const id = rowEl.dataset.effect;
      const cov = id ? coverage.byEffect.get(id) : undefined;
      return cov ? buildEffectTip(cov, active) : null;
    },
  );
}

/* ------------------------------------------------------------------ the buffs */

export function renderBuffsPanel(
  roster: Roster,
  coverage: Coverage,
  onChange: () => void,
): HTMLElement {
  const active = activeGroupCount(roster.size);
  const rows = [...coverage.byEffect.values()].filter((c) => c.effect.kind === 'buff');

  const panel = el('section', 'panel');
  panel.appendChild(
    panelHead('Buffs', rows.filter((c) => c.covered).length, rows.length, filterToggle(onChange)),
  );

  const body = el('div', 'panel__body buffs');
  const sections: Array<[string, EffectCoverage[]]> = [
    ['Raid buffs', rows.filter((c) => c.effect.scope === 'raid')],
    ['Party buffs', rows.filter((c) => c.effect.scope === 'party')],
    ['Self buffs', rows.filter((c) => c.effect.scope === 'self')],
  ];
  let any = false;
  for (const [label, list] of sections) {
    const node = section(label, list, active);
    if (node) {
      body.appendChild(node);
      any = true;
    }
  }
  if (!any) body.appendChild(el('p', 'empty-note', 'Every buff is covered.'));

  tipWiring(body, coverage, active);
  panel.appendChild(body);
  return panel;
}

/* ---------------------------------------------------------------- the debuffs */

export function renderDebuffsPanel(
  roster: Roster,
  coverage: Coverage,
  onChange: () => void,
): HTMLElement {
  const active = activeGroupCount(roster.size);
  // Only things that change what the boss does or takes. A warlock's Corruption is
  // a damage tick, not a raid debuff: it costs a slot, but nobody plans around it.
  const rows = [...coverage.byEffect.values()].filter(
    (c) => c.effect.kind === 'debuff' && c.effect.categories.length > 0,
  );

  const panel = el('section', 'panel');
  panel.appendChild(
    panelHead('Debuffs', rows.filter((c) => c.covered).length, rows.length, filterToggle(onChange)),
  );

  const has = (c: EffectCoverage, ids: string[]) => c.effect.categories.some((x) => ids.includes(x));
  const body = el('div', 'panel__body buffs');
  const sections: Array<[string, EffectCoverage[]]> = [
    [
      'Physical debuffs',
      rows.filter((c) =>
        has(c, [
          'reduced-armor',
          'reduced-melee-attack-power',
          'reduced-attack-speed',
          'reduced-hit-chance',
          'physical-damage-taken',
        ]),
      ),
    ],
    [
      'Magic debuffs',
      rows.filter((c) =>
        has(c, [
          'increased-fire-damage-taken',
          'increased-frost-damage-taken',
          'increased-shadow-damage-taken',
          'increased-arcane-damage-taken',
          'increased-nature-damage-taken',
          'reduced-fire-resistance',
          'reduced-frost-resistance',
          'reduced-shadow-resistance',
          'reduced-arcane-resistance',
          'increased-chance-to-be-crit-by-frost',
        ]),
      ),
    ],
    ['Other debuffs', rows.filter((c) => has(c, ['reduced-casting-speed', 'reduced-movement-speed']))],
  ];

  let any = false;
  for (const [label, list] of sections) {
    const node = section(label, list, active);
    if (node) {
      body.appendChild(node);
      any = true;
    }
  }
  if (!any) body.appendChild(el('p', 'empty-note', 'Every debuff is covered.'));

  tipWiring(body, coverage, active);
  panel.appendChild(body);
  return panel;
}

/* ---------------------------------------------------------------- the utility */

const openCategories = new Set<string>();

export function renderUtilityPanel(roster: Roster, coverage: Coverage): HTMLElement {
  const active = activeGroupCount(roster.size);
  const cats = CATEGORIES.filter((c) => c.meta === 'Other' || c.meta === 'Lists');

  const panel = el('section', 'panel');
  panel.appendChild(
    panelHead(
      'Utility',
      cats.filter((c) => (coverage.categoryCounts.get(c.id) ?? 0) > 0).length,
      cats.length,
    ),
  );

  const body = el('div', 'panel__body buffs');

  for (const meta of META_ORDER.filter((m) => m === 'Other' || m === 'Lists')) {
    const inMeta = CATEGORIES.filter((c) => c.meta === (meta as MetaCategory));
    const block = el('div', 'buffs__section');
    const label = el('div', 'section-label');
    label.appendChild(
      el('span', '', meta === 'Other' ? 'Dispels and interrupts' : 'Crowd control and cooldowns'),
    );
    label.appendChild(
      el(
        'span',
        'ov__label-n',
        inMeta.filter((c) => (coverage.categoryCounts.get(c.id) ?? 0) > 0).length + '/' + inMeta.length,
      ),
    );
    block.appendChild(label);

    for (const cat of inMeta) {
      const count = coverage.categoryCounts.get(cat.id) ?? 0;
      const effects = coverage.categoryEffects.get(cat.id) ?? [];
      const box = el('div', 'cat' + (count ? '' : ' cat--empty'));

      const toggle = el('button', 'cat__head');
      toggle.appendChild(el('span', 'cat__count' + (count ? ' cat__count--on' : ''), String(count)));
      toggle.appendChild(el('span', 'cat__name', cat.name));
      toggle.appendChild(
        el(
          'span',
          'buff__status buff__status--' + (count ? 'covered' : 'missing'),
          count ? 'Covered' : 'Missing',
        ),
      );
      box.appendChild(toggle);

      const inner = el('div', 'cat__body');
      if (!effects.length) {
        inner.appendChild(el('div', 'buff__blurb', 'Nobody in this raid covers it.'));
      } else {
        for (const cov of effects) inner.appendChild(effectRow(cov, active, true));
      }
      inner.hidden = !openCategories.has(cat.id);
      box.appendChild(inner);

      toggle.addEventListener('click', () => {
        inner.hidden = !inner.hidden;
        if (inner.hidden) openCategories.delete(cat.id);
        else openCategories.add(cat.id);
      });

      block.appendChild(box);
    }
    body.appendChild(block);
  }

  tipWiring(body, coverage, active);
  panel.appendChild(body);
  return panel;
}

/* -------------------------------------------------------------- the seat picker */

export function renderSpecPicker(
  group: number,
  slot: number,
  onPick: (classId: ClassId, specId: number) => void,
  onClose: () => void,
): HTMLElement {
  const overlay = el('div', 'modal');
  const box = el('div', 'modal__box picker');

  const head = el('div', 'modal__head');
  head.appendChild(el('h2', 'modal__title', 'Group ' + (group + 1) + ', seat ' + (slot + 1)));
  const close = el('button', 'btn btn--sm', 'Cancel');
  close.addEventListener('click', onClose);
  head.appendChild(close);
  box.appendChild(head);

  const body = el('div', 'modal__body');
  const grid = el('div', 'picker__grid');

  for (const info of CLASS_LIST) {
    const card = el('div', 'picker__class');
    card.style.setProperty('--class-color', info.color);
    const name = el('div', 'picker__class-name', info.name);
    name.style.color = info.color;
    card.appendChild(name);

    const specs = el('div', 'picker__specs');
    for (const spec of info.specs) {
      const btn = el('button', 'picker__spec');
      btn.appendChild(iconImg(spec.icon, '', 'picker__spec-icon'));
      btn.appendChild(el('span', 'picker__spec-name', spec.short));
      btn.title = spec.name + ' ' + info.name;
      btn.addEventListener('click', () => onPick(info.id, spec.id));
      specs.appendChild(btn);
    }
    card.appendChild(specs);
    grid.appendChild(card);
  }

  body.appendChild(grid);
  box.appendChild(body);
  overlay.appendChild(box);

  overlay.addEventListener('click', (ev) => {
    if (ev.target === overlay) onClose();
  });
  return overlay;
}

export function playerLabel(player: Player): string {
  return player.name + ' — ' + specLabel(player);
}

/* ===========================================================================
   Roster mode
   ===========================================================================
   None of this renders unless main.ts is in roster mode, and every handler it uses is
   optional on RaidHandlers, so planner mode is untouched by all of it. */

/** What the member said when they signed up, short enough to sit on a seat. */
const SIGNUP_LABEL: Record<string, string> = {
  primary: 'in',
  late: 'late',
  tentative: 'maybe',
  bench: 'benched self',
  absence: 'absent',
  queued: 'queued',
  guest: 'guest',
  withdrawn: 'withdrew',
};

const SIGNUP_TITLE: Record<string, string> = {
  primary: 'Signed up to play',
  late: 'Signed up, arriving late',
  tentative: 'Signed up as a maybe',
  bench: 'Asked to be benched',
  absence: 'Said they cannot come',
  queued: 'In the queue',
  guest: 'Added by the leader, never signed up, and cannot be messaged',
  withdrawn: 'On this roster but their signup is gone. Check with them.',
};

export interface PoolView {
  pool: Player[];
  cut: Player[];
  canEdit: boolean;
  /** Signups whose class or spec the planner could not read. */
  unmapped: Array<{ name: string; classKey: string; specKey: string | null }>;
}

function poolRow(player: Player, h: RaidHandlers, canEdit: boolean, cut: boolean): HTMLElement {
  const info = CLASSES[player.classId];
  const spec = specById(player.specId);
  const row = el('div', 'poolrow' + (cut ? ' poolrow--cut' : ''));
  row.style.setProperty('--class-color', info.color);

  if (canEdit) {
    row.draggable = true;
    row.addEventListener('dragstart', (ev) => {
      const userId = player.discord?.userId;
      if (!userId) return;
      ev.dataTransfer?.setData('text/plain', JSON.stringify({ kind: 'pool', userId }));
      if (ev.dataTransfer) ev.dataTransfer.effectAllowed = 'move';
    });
  }

  row.appendChild(iconImg(spec?.icon ?? info.icon, '', 'poolrow__icon'));

  const body = el('div', 'poolrow__body');
  const name = el('div', 'poolrow__name', player.name);
  name.style.color = info.color;
  body.appendChild(name);

  const sub = el('div', 'poolrow__sub');
  sub.appendChild(el('span', '', spec?.short ?? ''));
  const status = player.discord?.signupStatus;
  if (status && status !== 'primary') {
    const mark = el('span', 'poolrow__signup', SIGNUP_LABEL[status] ?? status);
    mark.title = SIGNUP_TITLE[status] ?? status;
    mark.dataset.status = status;
    sub.appendChild(mark);
  }
  body.appendChild(sub);
  row.appendChild(body);

  if (canEdit) {
    const btn = el('button', 'poolrow__btn', cut ? 'Put back' : 'Cut');
    btn.title = cut
      ? 'Put ' + player.name + ' back in the pool as standby'
      : 'Cut ' + player.name + '. They hear nothing at all, not even standby.';
    btn.setAttribute('aria-label', btn.title);
    btn.addEventListener('click', () => {
      const userId = player.discord?.userId;
      if (!userId) return;
      if (cut) h.onUncut?.(userId);
      else h.onCut?.(userId);
    });
    row.appendChild(btn);
  }

  return row;
}

/**
 * The pool: everyone who signed up and is not in a seat.
 *
 * Anyone still here at publish time is standby, which is a real outcome for a real
 * person, so the panel says it rather than leaving it to be inferred. Cut is separate and
 * has to be chosen deliberately, because it is the one state where somebody hears
 * nothing at all.
 */
export function renderPool(view: PoolView, h: RaidHandlers): HTMLElement {
  const panel = el('section', 'panel pool-panel');
  const head = el('div', 'panel__head');
  head.appendChild(el('span', '', 'Not seated'));
  head.appendChild(el('span', 'panel__count', String(view.pool.length)));
  panel.appendChild(head);

  const body = el('div', 'panel__body pool');

  if (view.canEdit) {
    body.addEventListener('dragover', (ev) => {
      ev.preventDefault();
      body.classList.add('pool--drop');
    });
    body.addEventListener('dragleave', () => body.classList.remove('pool--drop'));
    body.addEventListener('drop', (ev) => {
      ev.preventDefault();
      body.classList.remove('pool--drop');
      const raw = ev.dataTransfer?.getData('text/plain');
      if (!raw) return;
      try {
        const data = JSON.parse(raw) as { kind: string; playerId?: string };
        if (data.kind === 'player' && data.playerId) h.onReturnToPool?.(data.playerId);
      } catch {
        /* ignore malformed drags */
      }
    });
  }

  body.appendChild(
    el(
      'p',
      'drawer__hint',
      view.pool.length
        ? 'Everyone left here when you publish is told they are standby.'
        : 'Everyone who signed up has a seat.',
    ),
  );

  for (const player of view.pool) body.appendChild(poolRow(player, h, view.canEdit, false));

  if (view.cut.length) {
    body.appendChild(el('div', 'section-label', 'Cut'));
    body.appendChild(
      el('p', 'drawer__hint', 'Cut players are not messaged at all, not even as standby.'),
    );
    for (const player of view.cut) body.appendChild(poolRow(player, h, view.canEdit, true));
  }

  if (view.unmapped.length) {
    body.appendChild(el('div', 'section-label', 'Could not read'));
    for (const s of view.unmapped) {
      body.appendChild(
        el(
          'p',
          'drawer__hint',
          s.name + ' signed up as ' + s.classKey + (s.specKey ? ' / ' + s.specKey : '') +
            ', which this planner does not recognise, so they are not on the roster.',
        ),
      );
    }
  }

  panel.appendChild(body);
  return panel;
}

export interface RosterBarView {
  title: string;
  /** Unix seconds, exactly as the API sends it. */
  startTime: number;
  size: number;
  seated: number;
  standby: number;
  cut: number;
  saveState: 'idle' | 'dirty' | 'saving' | 'saved' | 'error';
  saveDetail?: string;
  status: string;
  canEdit: boolean;
  canPublish: boolean;
  /** The made-up roster at #roster=demo, which never touches the network. */
  demo?: boolean;
}

const SAVE_TEXT: Record<RosterBarView['saveState'], string> = {
  idle: 'No changes',
  dirty: 'Unsaved changes',
  saving: 'Saving',
  saved: 'Saved',
  error: 'Not saved',
};

/**
 * The roster-mode toolbar.
 *
 * Deliberately missing the raid-size select, Sample raid and Clear. Those three exist to
 * throw a hypothetical roster away and start again; here they would wipe a real one that
 * people are relying on.
 */
export function renderRosterBar(view: RosterBarView, h: RaidHandlers): HTMLElement {
  const bar = el('div', 'rtoolbar rtoolbar--roster');

  const left = el('div', 'rtoolbar__group');
  const titles = el('div', 'rbar__titles');
  titles.appendChild(el('div', 'rbar__title', view.title));
  const when = new Date(view.startTime * 1000);
  titles.appendChild(
    el(
      'div',
      'rbar__when',
      when.toLocaleString(undefined, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      }),
    ),
  );
  left.appendChild(titles);
  bar.appendChild(left);

  const mid = el('div', 'rtoolbar__group');
  mid.appendChild(
    el(
      'span',
      'rbar__tally',
      view.seated + ' of ' + view.size + ' seated, ' + view.standby + ' standby' +
        (view.cut ? ', ' + view.cut + ' cut' : ''),
    ),
  );
  if (view.status === 'published') {
    const pill = el('span', 'pill pill--new', 'published');
    pill.title = 'Already posted to Discord. Saving again does not unpublish it.';
    mid.appendChild(pill);
  }
  if (!view.canEdit) {
    const ro = el('span', 'pill pill--unverified', 'read only');
    ro.title = 'You can look at this roster but not change it.';
    mid.appendChild(ro);
  }
  bar.appendChild(mid);

  const right = el('div', 'rtoolbar__group');
  if (view.demo) {
    const pill = el('span', 'rbar__save', 'Demo, nothing is saved');
    pill.dataset.state = 'demo';
    pill.title = 'Made-up signups. This roster is not stored and cannot be published.';
    right.appendChild(pill);
  }
  const save = el('span', 'rbar__save', SAVE_TEXT[view.saveState]);
  if (view.demo) save.hidden = true;
  save.dataset.state = view.saveState;
  if (view.saveDetail) save.title = view.saveDetail;
  right.appendChild(save);

  if (view.canEdit && h.onAddGuest) {
    const guest = el('button', 'btn', 'Add a guest');
    guest.title = 'Seat someone who never signed up. They cannot be messaged.';
    guest.addEventListener('click', () => h.onAddGuest?.());
    right.appendChild(guest);
  }

  const publish = document.createElement('button');
  publish.className = 'btn btn--gold';
  publish.textContent = 'Publish to Discord';
  publish.disabled = !view.canPublish || view.seated === 0;
  publish.title = view.demo
    ? 'The demo has nobody real to message. Open a roster from Discord to publish one.'
    : view.seated === 0
      ? 'Seat somebody first'
      : 'Post the roster and message everyone on it';
  publish.addEventListener('click', () => h.onPublish?.());
  right.appendChild(publish);

  bar.appendChild(right);
  return bar;
}

/** Publishing posts to a channel and messages people. It is not undoable, so it is asked. */
export function renderPublishConfirm(
  view: { seated: number; standby: number; cut: number; republish: boolean },
  onConfirm: () => void,
  onCancel: () => void,
): HTMLElement {
  const overlay = el('div', 'modal');
  const box = el('div', 'modal__box');

  const head = el('div', 'modal__head');
  head.appendChild(
    el('h2', 'modal__title', view.republish ? 'Publish again?' : 'Publish this roster?'),
  );
  const close = el('button', 'btn btn--sm', 'Cancel');
  close.addEventListener('click', onCancel);
  head.appendChild(close);
  box.appendChild(head);

  const body = el('div', 'modal__body');
  body.appendChild(
    el(
      'p',
      '',
      'This posts the roster in the event channel and sends direct messages. It cannot be undone.',
    ),
  );

  const list = document.createElement('ul');
  const line = (text: string) => {
    const li = document.createElement('li');
    li.textContent = text;
    list.appendChild(li);
  };
  line(view.seated + ' selected, each of them messaged.');
  line(view.standby + ' standby, told to stay reachable.');
  if (view.cut) line(view.cut + ' cut, who hear nothing.');
  if (view.republish) line('Only people whose position changed are messaged again.');
  body.appendChild(list);

  const row = el('div', 'spec-picker');
  const go = el('button', 'btn btn--gold', 'Publish');
  go.addEventListener('click', onConfirm);
  const cancel = el('button', 'btn', 'Not yet');
  cancel.addEventListener('click', onCancel);
  row.append(go, cancel);
  body.appendChild(row);

  box.appendChild(body);
  overlay.appendChild(box);
  overlay.addEventListener('click', (ev) => {
    if (ev.target === overlay) onCancel();
  });
  return overlay;
}

/** What came back from a publish, including everyone the bot could not reach. */
export function renderPublishResult(
  result: {
    selected: number;
    standby: number;
    notified: number;
    couldNotDm: Array<{ userId: string; displayName: string }>;
    skippedTestAccounts?: Array<{ userId: string; displayName: string }>;
    messageUrl: string;
    dmMode: string;
  },
  onClose: () => void,
): HTMLElement {
  const overlay = el('div', 'modal');
  const box = el('div', 'modal__box');

  const head = el('div', 'modal__head');
  head.appendChild(el('h2', 'modal__title', 'Published'));
  const close = el('button', 'btn btn--sm', 'Done');
  close.addEventListener('click', onClose);
  head.appendChild(close);
  box.appendChild(head);

  const body = el('div', 'modal__body');
  body.appendChild(
    el(
      'p',
      '',
      result.selected + ' selected and ' + result.standby + ' standby. ' +
        result.notified + (result.notified === 1 ? ' was messaged.' : ' were messaged.'),
    ),
  );

  const link = document.createElement('a');
  link.href = result.messageUrl;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = 'Open the post in Discord';
  body.appendChild(link);

  /* Never hidden and never summarised away. These people have direct messages closed, so
     they heard nothing at all, and the leader is the only one who can chase them. */
  if (result.couldNotDm.length) {
    body.appendChild(
      el('div', 'section-label', 'Could not message ' + result.couldNotDm.length),
    );
    body.appendChild(
      el(
        'p',
        '',
        'These people have direct messages closed, so they have not been told anything. You will have to reach them yourself.',
      ),
    );
    body.appendChild(
      el('p', 'rbar__nodm', result.couldNotDm.map((p) => p.displayName).join(', ')),
    );
  }

  /* Test accounts are reported separately and in a calm colour. They were skipped on
     purpose and nothing is wrong, which is the opposite of the list above. */
  const skipped = result.skippedTestAccounts ?? [];
  if (skipped.length) {
    body.appendChild(el('div', 'section-label', 'Test accounts skipped ' + skipped.length));
    body.appendChild(
      el(
        'p',
        'drawer__hint',
        'Made-up signups from a test event. There is nobody behind them to message, so they were left out rather than counted as unreachable.',
      ),
    );
    body.appendChild(
      el('p', 'rbar__skipped', skipped.map((p) => p.displayName).join(', ')),
    );
  }

  box.appendChild(body);
  overlay.appendChild(box);
  return overlay;
}
