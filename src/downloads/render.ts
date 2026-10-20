/**
 * Drawing the downloads page. No network here: main.ts asks, this draws what it was told.
 */
import { el } from '../shared/dom';
import { copyText } from '../shared/toast';
import type { Access, Package, PortalEvent, PortalUser, Release } from './api';
import { downloadHref } from './api';
import {
  accessMessage,
  describeEvent,
  formatBytes,
  formatDate,
  formatWhen,
  leadRelease,
  otherReleases,
  shortHash,
  STATUS_WORD,
} from './format';

export { el };

/* ------------------------------------------------------------- notices */

export type NoticeTone = 'gold' | 'bad' | 'ok' | 'quiet';

export function notice(title: string, body: string | string[], tone: NoticeTone = 'gold'): HTMLElement {
  const box = el('div', `dl-notice dl-notice--${tone}`);
  box.setAttribute('role', tone === 'bad' ? 'alert' : 'status');
  if (title) box.appendChild(el('h3', 'dl-notice__title', title));
  for (const line of Array.isArray(body) ? body : [body]) box.appendChild(el('p', undefined, line));
  return box;
}

export function button(label: string, onClick: () => void, cls = 'btn'): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = cls;
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}

/** The front door for somebody signed out. */
export function renderSignedOut(onSignIn: () => void): HTMLElement[] {
  const lead = el(
    'p',
    'dl-lead',
    'Addons and guide packages for WoW Forever, shared with people the owner has approved. Sign in with Discord to ask for access. The sign-in asks only who you are, and the site keeps no Discord token.',
  );
  const row = el('div', 'dl-signin');
  row.appendChild(button('Sign in with Discord', onSignIn, 'btn btn--gold'));
  row.appendChild(el('p', 'dl-signin__hint', 'After signing in you can ask for access once. The owner decides.'));
  return [lead, row];
}

/** What a pending, rejected or revoked person sees, with the one button there is. */
export function renderAccess(access: Access, onRequest: (() => void) | null, busy: boolean): HTMLElement {
  const text = accessMessage(access);
  const tone: NoticeTone = access.status === 'pending' ? 'gold' : 'bad';
  const box = notice(text.title, text.body, tone);
  if (text.canRequest && onRequest) {
    const b = button(busy ? 'Asking…' : 'Request access', onRequest, 'btn btn--gold');
    b.disabled = busy;
    box.appendChild(b);
  }
  return box;
}

/* --------------------------------------------------------------- cards */

function facts(release: Release): HTMLElement {
  const dl = el('dl', 'dl-facts');
  const add = (k: string, v: string | HTMLElement) => {
    if (!v) return;
    dl.appendChild(el('dt', undefined, k));
    const dd = el('dd');
    if (typeof v === 'string') dd.textContent = v;
    else dd.appendChild(v);
    dl.appendChild(dd);
  };
  add('Version', release.version);
  add('Works with', release.gameCompat);
  add('Covers', release.coverage);
  if (release.file) {
    add('Uploaded', formatDate(release.file.uploadedAt));
    add('Size', formatBytes(release.file.sizeBytes));
    const code = el('code', undefined, shortHash(release.file.sha256) + '…');
    code.title = release.file.sha256;
    const copy = button('Copy', () => void copyText(release.file!.sha256, 'SHA-256 copied'), 'btn btn--sm');
    copy.style.marginLeft = '6px';
    const wrap = el('span');
    wrap.append(code, copy);
    add('SHA-256', wrap);
  }
  return dl;
}

function fold(summary: string, body: HTMLElement, open = false): HTMLElement {
  const d = document.createElement('details');
  d.className = 'dl-fold';
  d.open = open;
  d.appendChild(el('summary', undefined, summary));
  d.appendChild(body);
  return d;
}

function pre(text: string): HTMLElement {
  return el('pre', 'dl-text', text);
}

function downloadLink(release: Release, label = 'Download'): HTMLAnchorElement {
  const a = document.createElement('a');
  a.className = 'btn btn--gold';
  a.href = downloadHref(release.id);
  a.textContent = `${label} ${release.file?.name ?? ''}`.trim();
  a.rel = 'noopener';
  return a;
}

/** One package: its latest release in full, the rest folded. */
export function renderCard(pkg: Package): HTMLElement {
  const card = el('section', 'panel dl-card');
  const head = el('div', 'panel__head');
  head.appendChild(el('h3', 'dl-card__title', pkg.title));
  const lead = leadRelease(pkg);
  if (lead) {
    head.appendChild(el('span', 'dl-card__version', lead.version));
    if (lead.latest) head.appendChild(el('span', 'pill pill--latest', 'Latest'));
  }
  card.appendChild(head);

  const body = el('div', 'panel__body');
  body.appendChild(el('p', 'dl-card__desc', pkg.description));
  if (lead) {
    body.appendChild(facts(lead));
    if (lead.changelog) body.appendChild(fold(`What changed in ${lead.version}`, pre(lead.changelog)));
  }
  if (pkg.installInstructions) body.appendChild(fold('How to install', pre(pkg.installInstructions)));

  const older = lead ? otherReleases(pkg, lead) : [];
  if (older.length) {
    const list = el('div', 'dl-older');
    for (const r of older) {
      const row = el('div', 'dl-older__row');
      row.appendChild(el('span', 'dl-card__version', r.version));
      if (r.gameCompat) row.appendChild(el('span', 'muted', r.gameCompat));
      if (r.file) row.appendChild(el('span', 'muted', `${formatBytes(r.file.sizeBytes)}, ${formatDate(r.file.uploadedAt)}`));
      if (r.file) {
        const a = downloadLink(r, 'Download');
        a.className = 'btn btn--sm';
        a.textContent = 'Download';
        row.appendChild(a);
      }
      list.appendChild(row);
    }
    body.appendChild(fold(`${older.length} older ${older.length === 1 ? 'version' : 'versions'}`, list));
  }

  const actions = el('div', 'dl-actions');
  if (lead?.file) {
    actions.appendChild(downloadLink(lead));
    actions.appendChild(
      el('p', 'dl-actions__hint', 'The link works only while you are signed in and approved. Check the SHA-256 after saving if you want to be sure of the file.'),
    );
  } else {
    actions.appendChild(el('p', 'dl-actions__hint', 'No file has been uploaded for this release yet.'));
  }
  body.appendChild(actions);
  card.appendChild(body);
  return card;
}

export function renderCards(packages: Package[]): HTMLElement {
  const grid = el('div', 'dl-cards');
  for (const pkg of packages) grid.appendChild(renderCard(pkg));
  return grid;
}

/* --------------------------------------------------------------- owner */

export interface OwnerHandlers {
  decide(userId: string, status: 'approved' | 'rejected' | 'revoked'): void;
  createPackage(input: { title: string; description: string; installInstructions: string }): void;
  savePackage(id: number, input: { title: string; description: string; installInstructions: string }): void;
  createRelease(packageId: number, input: { version: string; gameCompat: string; coverage: string; changelog: string }): void;
  saveRelease(id: number, input: { version: string; gameCompat: string; coverage: string; changelog: string }): void;
  setPublished(id: number, published: boolean): void;
  upload(releaseId: number, file: File): void;
  reload(): void;
}

export interface OwnerState {
  tab: 'people' | 'packages' | 'log';
  users: PortalUser[] | null;
  packages: Package[] | null;
  events: PortalEvent[] | null;
  error: string | null;
  busy: Set<string>;
  /** releaseId -> 0..1 while an upload is in flight. */
  uploads: Map<number, number>;
  maxUploadMb: number;
  /** The owner, whose own row has no buttons: the owner is set on the server. */
  ownerId: string;
}

function field(label: string, input: HTMLInputElement | HTMLTextAreaElement): HTMLElement {
  const l = el('label');
  l.append(label, input);
  return l;
}

function text(value = '', placeholder = ''): HTMLInputElement {
  const i = document.createElement('input');
  i.type = 'text';
  i.value = value;
  i.placeholder = placeholder;
  return i;
}

function area(value = '', placeholder = ''): HTMLTextAreaElement {
  const t = document.createElement('textarea');
  t.value = value;
  t.placeholder = placeholder;
  return t;
}

function packageForm(
  initial: { title: string; description: string; installInstructions: string },
  submitLabel: string,
  onSubmit: (input: { title: string; description: string; installInstructions: string }) => void,
): HTMLElement {
  const form = el('div', 'dl-form');
  const title = text(initial.title, 'ForeverXP');
  const description = area(initial.description, 'What it is, in a sentence or two.');
  const instructions = area(initial.installInstructions, 'Where the folder goes and what to restart.');
  const error = el('p', 'dl-form__error');
  form.append(
    field('Title', title),
    field('Description', description),
    field('How to install', instructions),
    error,
    button(submitLabel, () => {
      if (!title.value.trim()) {
        error.textContent = 'A package needs a title.';
        return;
      }
      error.textContent = '';
      onSubmit({ title: title.value.trim(), description: description.value, installInstructions: instructions.value });
    }, 'btn btn--gold'),
  );
  return form;
}

function releaseForm(
  initial: { version: string; gameCompat: string; coverage: string; changelog: string },
  submitLabel: string,
  onSubmit: (input: { version: string; gameCompat: string; coverage: string; changelog: string }) => void,
): HTMLElement {
  const form = el('div', 'dl-form');
  const version = text(initial.version, '1.2');
  const compat = text(initial.gameCompat, 'Forever beta 1.60');
  const coverage = text(initial.coverage, 'Both factions, all classes');
  const changelog = area(initial.changelog, 'What changed since the last version.');
  const error = el('p', 'dl-form__error');
  const row = el('div', 'dl-form__row');
  const v = field('Version', version);
  const c = field('Works with', compat);
  const f = field('Covers', coverage);
  for (const x of [v, c, f]) x.classList.add('dl-form__grow');
  row.append(v, c, f);
  form.append(
    row,
    field('Changelog', changelog),
    error,
    button(submitLabel, () => {
      if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(version.value.trim())) {
        error.textContent = 'A version is letters, digits, dots and dashes, like 1.2 or 2.0-beta.';
        return;
      }
      error.textContent = '';
      onSubmit({ version: version.value.trim(), gameCompat: compat.value.trim(), coverage: coverage.value.trim(), changelog: changelog.value });
    }, 'btn btn--gold'),
  );
  return form;
}

function person(u: PortalUser, h: OwnerHandlers, busy: Set<string>, isOwner: boolean): HTMLElement {
  const row = el('div', `dl-person${u.status === 'pending' && u.requestedAt ? ' dl-person--asked' : ''}`);
  const img = document.createElement('img');
  img.className = 'dl-person__avatar';
  img.alt = '';
  if (u.avatarUrl) img.src = u.avatarUrl;
  row.appendChild(img);

  const who = el('div');
  const name = el('div', 'dl-person__name');
  name.append(u.username || '(no name)', ' ');
  name.appendChild(el('span', `pill pill--${u.status}`, STATUS_WORD[u.status]));
  who.appendChild(name);
  const meta = el('div', 'dl-person__meta');
  const bits = [`id ${u.userId}`, `first seen ${formatDate(u.since)}`];
  if (u.requestedAt) bits.push(`asked ${formatDate(u.requestedAt)}`);
  if (u.decidedAt) bits.push(`decided ${formatDate(u.decidedAt)}`);
  if (u.note) bits.push(`note: ${u.note}`);
  meta.textContent = bits.join(' · ');
  who.appendChild(meta);
  row.appendChild(who);

  const acts = el('div', 'dl-person__acts');
  const working = busy.has('user:' + u.userId);
  const act = (label: string, status: 'approved' | 'rejected' | 'revoked', cls = 'btn btn--sm') => {
    const b = button(label, () => h.decide(u.userId, status), cls);
    b.disabled = working;
    return b;
  };
  if (isOwner) {
    acts.appendChild(el('span', 'dl-person__meta', 'Owner, set on the server'));
  } else if (u.status === 'pending') {
    acts.append(act('Approve', 'approved', 'btn btn--sm btn--gold'), act('Reject', 'rejected'));
  } else if (u.status === 'approved') {
    acts.append(act('Revoke', 'revoked'));
  } else {
    acts.append(act('Approve', 'approved', 'btn btn--sm btn--gold'));
  }
  row.appendChild(acts);
  return row;
}

function renderPeople(state: OwnerState, h: OwnerHandlers): HTMLElement {
  const wrap = el('div');
  if (!state.users) {
    wrap.appendChild(notice('', 'Loading people…', 'quiet'));
    return wrap;
  }
  const asked = state.users.filter((u) => u.status === 'pending' && u.requestedAt);
  const quiet = state.users.filter((u) => u.status === 'pending' && !u.requestedAt);
  const approved = state.users.filter((u) => u.status === 'approved');
  const out = state.users.filter((u) => u.status === 'rejected' || u.status === 'revoked');

  const group = (label: string, list: PortalUser[], emptyText: string) => {
    wrap.appendChild(el('div', 'section-label', `${label} (${list.length})`));
    if (!list.length) {
      wrap.appendChild(el('p', 'dl-form__hint', emptyText));
      return;
    }
    const grid = el('div', 'dl-people');
    for (const u of list) grid.appendChild(person(u, h, state.busy, u.userId === state.ownerId));
    wrap.appendChild(grid);
  };
  group('Asked for access', asked, 'Nobody is waiting on you.');
  group('Signed in, not asked', quiet, 'Nobody.');
  group('Approved', approved, 'Nobody yet.');
  group('Rejected or revoked', out, 'Nobody.');
  return wrap;
}

function releaseAdmin(r: Release, state: OwnerState, h: OwnerHandlers): HTMLElement {
  const box = el('div', 'dl-release-admin');
  const head = el('div', 'dl-release-admin__head');
  head.appendChild(el('span', 'dl-card__version', r.version));
  head.appendChild(el('span', `pill pill--${r.published ? 'latest' : 'draft'}`, r.published ? 'Published' : 'Not published'));
  if (r.latest) head.appendChild(el('span', 'pill pill--latest', 'Latest'));
  const fileLine = el('span', 'dl-release-admin__file');
  fileLine.textContent = r.file
    ? `${r.file.name}, ${formatBytes(r.file.sizeBytes)}, uploaded ${formatDate(r.file.uploadedAt)}${r.originalName ? `, from ${r.originalName}` : ''}`
    : 'No archive yet.';
  head.appendChild(fileLine);
  box.appendChild(head);

  const working = state.busy.has('release:' + r.id);
  const acts = el('div', 'dl-form__row');
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.zip,.rar';
  input.hidden = true;
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (file) h.upload(r.id, file);
    input.value = '';
  });
  const pick = button(r.file ? 'Replace archive' : 'Upload archive', () => input.click(), 'btn btn--sm');
  pick.disabled = working || state.uploads.has(r.id);
  acts.append(input, pick);
  if (r.file) {
    const pub = button(r.published ? 'Unpublish' : 'Publish', () => h.setPublished(r.id, !r.published), r.published ? 'btn btn--sm' : 'btn btn--sm btn--gold');
    pub.disabled = working;
    acts.appendChild(pub);
    const a = document.createElement('a');
    a.className = 'btn btn--sm';
    a.href = downloadHref(r.id);
    a.textContent = 'Download to check';
    acts.appendChild(a);
  }
  box.appendChild(acts);
  if (!r.published) {
    box.appendChild(el('p', 'dl-form__hint', r.file ? 'Publishing shows this to everyone approved. It can be unpublished again.' : `Upload a .zip or .rar up to ${state.maxUploadMb} MB. The archive is stored as is and never opened on the server.`));
  }

  const progress = state.uploads.get(r.id);
  if (progress !== undefined) {
    const bar = el('div', 'dl-progress');
    const fill = el('div', 'dl-progress__bar');
    fill.style.width = `${Math.round(progress * 100)}%`;
    bar.appendChild(fill);
    box.appendChild(bar);
    box.appendChild(el('p', 'dl-form__hint', progress < 1 ? `Uploading, ${Math.round(progress * 100)}%` : 'Checking and storing…'));
  }

  box.appendChild(fold('Edit this release', releaseForm(r, 'Save release', (input) => h.saveRelease(r.id, input))));
  return box;
}

function renderPackagesAdmin(state: OwnerState, h: OwnerHandlers): HTMLElement {
  const wrap = el('div');
  wrap.appendChild(fold('New package', packageForm({ title: '', description: '', installInstructions: '' }, 'Create package', h.createPackage)));
  if (!state.packages) {
    wrap.appendChild(notice('', 'Loading packages…', 'quiet'));
    return wrap;
  }
  if (!state.packages.length) {
    wrap.appendChild(notice('Nothing here yet', 'Create a package above, add a release to it, upload the archive, then publish.', 'quiet'));
    return wrap;
  }
  for (const pkg of state.packages) {
    const panel = el('section', 'panel');
    const head = el('div', 'panel__head');
    head.appendChild(el('h3', 'dl-card__title', pkg.title));
    head.appendChild(el('span', 'panel__count', `${pkg.releases.length} ${pkg.releases.length === 1 ? 'release' : 'releases'}`));
    panel.appendChild(head);
    const body = el('div', 'panel__body');
    body.appendChild(fold('Edit title, description and install steps', packageForm(pkg, 'Save package', (input) => h.savePackage(pkg.id, input))));
    body.appendChild(fold('New release', releaseForm({ version: '', gameCompat: '', coverage: '', changelog: '' }, 'Create release', (input) => h.createRelease(pkg.id, input))));
    for (const r of pkg.releases) body.appendChild(releaseAdmin(r, state, h));
    panel.appendChild(body);
    wrap.appendChild(panel);
  }
  return wrap;
}

function renderLog(state: OwnerState): HTMLElement {
  const wrap = el('div');
  if (!state.events) {
    wrap.appendChild(notice('', 'Loading the log…', 'quiet'));
    return wrap;
  }
  if (!state.events.length) {
    wrap.appendChild(notice('Nothing logged yet', 'Sign-ins, requests, decisions, uploads, publishes and downloads appear here.', 'quiet'));
    return wrap;
  }
  const names = new Map((state.users ?? []).map((u) => [u.userId, u.username || u.userId]));
  const nameOf = (id: string) => names.get(id) ?? id;
  const table = el('table', 'dl-log');
  for (const e of state.events) {
    const tr = el('tr');
    tr.appendChild(el('td', undefined, formatWhen(e.at)));
    tr.appendChild(el('td', undefined, describeEvent(e, nameOf)));
    table.appendChild(tr);
  }
  wrap.appendChild(table);
  return wrap;
}

export function renderOwner(state: OwnerState, h: OwnerHandlers, setTab: (tab: OwnerState['tab']) => void): HTMLElement {
  const section = el('section', 'dl-owner');
  const bar = el('div', 'dl-owner__bar');
  bar.appendChild(el('div', 'section-label', 'Owner tools'));
  const tabs: Array<[OwnerState['tab'], string, number | null]> = [
    ['people', 'People', state.users ? state.users.filter((u) => u.status === 'pending' && u.requestedAt).length : null],
    ['packages', 'Packages', state.packages ? state.packages.length : null],
    ['log', 'Log', null],
  ];
  for (const [tab, label, count] of tabs) {
    const b = button(label, () => setTab(tab), `btn btn--sm${state.tab === tab ? ' btn--on' : ''}`);
    if (count) b.appendChild(el('span', 'dl-owner__count', String(count)));
    bar.appendChild(b);
  }
  bar.appendChild(button('Refresh', h.reload, 'btn btn--sm'));
  section.appendChild(bar);
  if (state.error) section.appendChild(notice('Could not load', state.error, 'bad'));
  section.appendChild(state.tab === 'people' ? renderPeople(state, h) : state.tab === 'packages' ? renderPackagesAdmin(state, h) : renderLog(state));
  return section;
}
