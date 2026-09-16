import { renderFooter, renderHeader } from '../shared/header';
import {
  accountView,
  currentUser,
  loadUser,
  takeSignInOutcome,
  beginSignIn,
  signOut,
  SIGN_IN_MESSAGE,
  type Me,
} from '../shared/session';
import { copyText, toast } from '../shared/toast';
import { KEY_ROSTERS, readJson, writeJson } from '../shared/storage';
import { CLASSES, type ClassId } from '../shared/classes';
import { GROUP_COUNT, GROUP_SIZE, type Player, type Roster } from './types';
import { computeCoverage, emptyRoster } from './engine';
import { createPlayer, spreadChoices } from './loadout';
import { decodeRoster, encodeRoster, isEmptyRoster } from './codec';
import {
  renderAlertBar,
  renderBuffsPanel,
  renderDebuffsPanel,
  renderUtilityPanel,
  renderNotes,
  renderGroups,
  renderOverview,
  renderSpecPicker,
  renderSuggestions,
  renderToolbar,
  renderWarnings,
  renderPool,
  renderRosterBar,
  renderPublishConfirm,
  renderPublishResult,
  type RaidHandlers,
} from './render';
import {
  ApiError,
  Saver,
  explain,
  fetchRoster,
  makeGuest,
  publishRoster,
  readRosterLink,
  slotsFrom,
  stateFromPayload,
  demoPayload,
  isDemo,
  type ApiFailure,
  type RosterLink,
  type RosterState,
  fetchCommandDocs,
  fetchGuildEvents,
  type CommandDocs,
  type RosterAccess,
  type GuildEvent,
  type SaveState,
} from './roster-mode';
import { renderDrawer } from './drawer';
import { parseCode } from '../talents/codec';
import { applySuggestion, suggestSwaps, type Suggestion } from './suggestions';
import { asDiscordMessage, buildExport } from './export';
import { looksLikeGroupBuilder, rosterFromSignups } from './groupbuilder';
import { loadTalentData } from '../talents/data';
import { initSpellText } from './spelltext';

interface SavedRoster {
  id: string;
  name: string;
  code: string;
  savedAt: string;
}

const BASE = import.meta.env.BASE_URL ?? '/';
const href = (file: string) => (BASE.endsWith('/') ? BASE + file : BASE + '/' + file);

const app = document.getElementById('app');
let roster: Roster = emptyRoster(40);
let suppressHash = false;

/**
 * Planner mode invents people and lives in the URL hash. Roster mode holds a real
 * Discord event and is entered only by a signed link. Everything the two share reads
 * `mode` rather than guessing, and the hash is never rewritten in roster mode: the token
 * lives in it, so writing an encoded roster over the top would throw the token away and
 * break the page on reload.
 */
let mode: 'planner' | 'roster' | 'intro' = 'planner';
let link: RosterLink | null = null;
/*
 * How this roster is authorised: a signed link, a session, or both.
 *
 * Guard on this, never on `link`. Signing in and opening an event from your own server
 * list authorises by session and carries no link at all, and three things tested `link`
 * before reaching for `access` anyway: autosave never started, publish refused to run, and
 * a 409 could not refetch. What a raid leader saw was their seating quietly reverting,
 * because the roster had only ever been saved the once.
 */
let access: RosterAccess | null = null;
let rosterState: RosterState | null = null;
let saver: Saver | null = null;
let saveState: SaveState = 'idle';
let saveDetail: string | undefined;
/** Where the hash pointed last, so a same-document turn knows which way it travelled. */
let lastRail = 0;
/* Fetched once per page rather than once per render of the explainer. Declared up here
   with the other module state: drawRosterIntro runs during bootstrap, so a let further
   down the file is still in its dead zone when it is first read. */
let docsRequested = false;
let cachedDocs: CommandDocs | null = null;
/** Open events per guild, filled in only when somebody asks for them. */
let guildEvents: Record<string, GuildEvent[]> = {};

function el(tag: string, cls?: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

function savedRosters(): SavedRoster[] {
  return readJson<SavedRoster[]>(KEY_ROSTERS, []);
}

/* ------------------------------------------------------------ roster helpers */

/** Everyone currently on the roster, seated or benched. */
function onRoster(): Player[] {
  const out: Player[] = [];
  for (const group of roster.groups) for (const p of group) if (p) out.push(p);
  for (const p of roster.bench) out.push(p);
  return out;
}

function findPlayer(id: string): { player: Player; group: number; slot: number } | null {
  for (let g = 0; g < roster.groups.length; g += 1) {
    for (let s = 0; s < GROUP_SIZE; s += 1) {
      const p = roster.groups[g]?.[s];
      if (p?.id === id) return { player: p, group: g, slot: s };
    }
  }
  return null;
}

function syncHash(): void {
  // The roster-mode hash carries the event id and the auth token. Never overwrite it.
  if (mode === 'roster') return;
  suppressHash = true;
  const next = isEmptyRoster(roster) ? '' : '#' + encodeRoster(roster);
  history.replaceState(null, '', location.pathname + location.search + next);
  window.setTimeout(() => {
    suppressHash = false;
  }, 0);
}

function update(): void {
  if (mode === 'roster') {
    rosterChanged();
    return;
  }
  syncHash();
  draw();
}

/** Any edit to a real roster: redraw at once, and save a second after the last one. */
function rosterChanged(): void {
  draw();
  saver?.queue();
}

/* --------------------------------------------------------------- sample raid */

function fillSample(): void {
  roster = emptyRoster(40);
  const comp: Array<[ClassId, number]> = [
    ['warrior', 163], ['paladin', 383], ['druid', 281], ['rogue', 181], ['rogue', 181],
    ['warrior', 163], ['warrior', 161], ['warrior', 164], ['shaman', 263], ['rogue', 182],
    ['warrior', 161], ['warrior', 164], ['warrior', 161], ['shaman', 263], ['rogue', 183],
    ['hunter', 363], ['hunter', 361], ['mage', 61], ['mage', 61], ['priest', 201],
    ['mage', 41], ['mage', 81], ['warlock', 302], ['warlock', 303], ['priest', 203],
    ['warlock', 301], ['warlock', 302], ['druid', 283], ['shaman', 261], ['priest', 202],
    ['priest', 202], ['priest', 202], ['druid', 282], ['shaman', 262], ['paladin', 382],
    ['paladin', 382], ['paladin', 381], ['hunter', 362], ['hunter', 361], ['warrior', 164],
  ];
  comp.forEach(([classId, specId], i) => {
    const g = Math.floor(i / GROUP_SIZE);
    const s = i % GROUP_SIZE;
    if (g < GROUP_COUNT) roster.groups[g]![s] = spreadChoices(createPlayer(classId, specId), onRoster());
  });
  update();
  toast('Filled a sample 40-man');
}

/* ------------------------------------------------------------------ handlers */

const handlers: RaidHandlers = {
  onPickSeat: (group, slot) => openPicker(group, slot),

  onDropSpec: (classId, specId, group, slot) => {
    roster.groups[group]![slot] = spreadChoices(createPlayer(classId, specId), onRoster());
    update();
  },

  onMovePlayer: (playerId, group, slot) => {
    const found = findPlayer(playerId);
    if (!found) return;
    const target = roster.groups[group]![slot] ?? null;
    roster.groups[group]![slot] = found.player;
    roster.groups[found.group]![found.slot] = target;
    update();
  },

  onRemove: (group, slot) => {
    // A real person is never deleted by clearing their seat: they go back to the pool,
    // where they are standby rather than silently gone from the roster entirely.
    if (mode === 'roster' && rosterState) {
      const sitting = rosterState.roster.groups[group]?.[slot] ?? null;
      rosterState.roster.groups[group]![slot] = null;
      if (sitting) returnToPool(sitting);
      rosterChanged();
      return;
    }
    roster.groups[group]![slot] = null;
    update();
  },

  onRename: (playerId, name) => {
    const found = findPlayer(playerId);
    if (!found) return;
    const clean = name.trim();
    if (clean === found.player.name) return;
    found.player.name = clean || found.player.name;
    syncHash();
  },

  onOpenLoadout: (playerId) => openLoadout(playerId),
  onFocusPlayer: (playerId) => openLoadout(playerId),

  onSize: (size) => {
    roster.size = size;
    update();
  },

  onCap: (cap) => {
    // 0 turns the limit off, which is the default.
    roster.settings.debuffCap = Math.max(0, Math.min(99, Math.round(cap) || 0));
    update();
  },

  onReset: () => {
    roster = emptyRoster(roster.size);
    update();
    toast('Roster cleared');
  },

  onCopyLink: () => {
    if (isEmptyRoster(roster)) {
      toast('Add someone first');
      return;
    }
    void copyText(location.origin + location.pathname + '#' + encodeRoster(roster), 'Link copied');
  },

  onCopyDiscord: () => {
    if (isEmptyRoster(roster)) {
      toast('Add someone first');
      return;
    }
    const text = asDiscordMessage(
      roster,
      computeCoverage(roster),
      location.origin + location.pathname,
    );
    void copyText(text, 'Discord summary copied');
  },

  onFillSample: fillSample,

  onApplySuggestion: (s: Suggestion) => {
    applySuggestion(roster, s);
    update();
    toast('Applied: ' + s.title);
  },
};

/* --------------------------------------------------------------- the picker */

function openPicker(group: number, slot: number): void {
  closeOverlays();
  document.body.appendChild(
    renderSpecPicker(
      group,
      slot,
      (classId, specId) => {
        roster.groups[group]![slot] = spreadChoices(createPlayer(classId, specId), onRoster());
        closeOverlays();
        update();
      },
      closeOverlays,
    ),
  );
}

function openLoadout(playerId: string): void {
  closeOverlays();
  const found = findPlayer(playerId);
  if (!found) return;
  const specAtOpen = found.player.specId;

  document.body.appendChild(
    renderDrawer(found.player, {
      onChange: () => {
        syncHash();
        draw();
        if (found.player.specId !== specAtOpen) openLoadout(playerId);
      },
      onClose: closeOverlays,
    }),
  );
}

function closeOverlays(): void {
  document.querySelector('.drawer')?.remove();
  document.querySelector('.modal')?.remove();
}

/* ------------------------------------------------- import from Group Builder */

/** Reads an event export from the signup bot and seats everyone. */
function importFromText(raw: string): boolean {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    toast('That is not JSON. Paste the event export from the bot.');
    return false;
  }
  if (!looksLikeGroupBuilder(parsed)) {
    toast('No signups in there. It needs an event with a signUps list.');
    return false;
  }

  const result = rosterFromSignups(parsed as never, roster.size);
  if (!result.players.length) {
    toast('Read it, but nobody was signed up to play.');
    return false;
  }

  roster = result.roster;
  update();
  const benched = result.bench.length ? ', ' + result.bench.length + ' benched' : '';
  toast('Seated ' + result.players.length + ' players' + benched);
  return true;
}

function renderImportPanel(): HTMLElement {
  const panel = el('section', 'panel');
  panel.appendChild(el('div', 'panel__head', 'Import from Group Builder'));
  const body = el('div', 'panel__body');

  body.appendChild(
    el(
      'p',
      'drawer__hint',
      'Paste an event export from the signup bot and everyone lands in a seat. It reads the internal rows and the v4 API shape, keeps bench and late statuses, and puts a bear Druid with the tanks.',
    ),
  );

  const box = document.createElement('textarea');
  box.className = 'btn drawer__input';
  box.rows = 3;
  box.placeholder = 'Paste the event JSON here';
  box.style.fontFamily = 'var(--font-narrow)';
  box.style.resize = 'vertical';
  body.appendChild(box);

  const row = el('div', 'spec-picker');
  const go = el('button', 'btn btn--gold', 'Seat these signups');
  go.addEventListener('click', () => {
    if (importFromText(box.value.trim())) box.value = '';
  });

  const copyJson = el('button', 'btn', 'Copy roster as JSON');
  copyJson.addEventListener('click', () => {
    const data = buildExport(roster, computeCoverage(roster), location.origin + location.pathname);
    void copyText(JSON.stringify(data, null, 2), 'Roster JSON copied');
  });

  row.append(go, copyJson);
  body.appendChild(row);
  panel.appendChild(body);
  return panel;
}

/* -------------------------------------------------------------- saved rosters */

function renderSaveBar(): HTMLElement {
  const panel = el('section', 'panel');
  panel.appendChild(el('div', 'panel__head', 'Save and share'));
  const body = el('div', 'panel__body');

  const row = el('div', 'spec-picker');
  const nameInput = document.createElement('input');
  nameInput.className = 'btn';
  nameInput.placeholder = 'Roster name';
  nameInput.style.minWidth = '170px';

  const save = el('button', 'btn btn--gold', 'Save on this device');
  save.addEventListener('click', () => {
    if (isEmptyRoster(roster)) {
      toast('Add someone first');
      return;
    }
    const list = savedRosters();
    const entry: SavedRoster = {
      id: 'r' + Date.now().toString(36),
      name: nameInput.value.trim() || 'Roster ' + (list.length + 1),
      code: encodeRoster(roster),
      savedAt: new Date().toISOString(),
    };
    list.unshift(entry);
    if (writeJson(KEY_ROSTERS, list.slice(0, 25))) {
      toast('Saved ' + entry.name);
      draw();
    } else {
      toast('This browser would not let me save');
    }
  });

  const discord = el('button', 'btn', 'Copy for Discord');
  discord.addEventListener('click', handlers.onCopyDiscord);
  row.append(nameInput, save, discord);
  body.appendChild(row);
  body.appendChild(
    el(
      'p',
      'drawer__hint',
      'The link carries every name, spec and loadout, so it opens the same anywhere. Copy for Discord gives you a text summary to paste in chat.',
    ),
  );

  const list = savedRosters();
  if (list.length) {
    const ul = el('div', 'spec-picker');
    ul.style.marginTop = '8px';
    for (const item of list) {
      const load = el('button', 'btn btn--sm', item.name);
      load.addEventListener('click', () => {
        const next = decodeRoster(item.code);
        if (!next) {
          toast('That saved roster would not load');
          return;
        }
        roster = next;
        update();
        toast('Loaded ' + item.name);
      });
      const del = el('button', 'btn btn--sm', '×');
      del.title = 'Delete ' + item.name;
      del.addEventListener('click', () => {
        writeJson(KEY_ROSTERS, savedRosters().filter((r) => r.id !== item.id));
        draw();
      });
      const pair = el('span');
      pair.style.display = 'inline-flex';
      pair.style.gap = '2px';
      pair.append(load, del);
      ul.appendChild(pair);
    }
    body.appendChild(ul);
  }

  panel.appendChild(body);
  return panel;
}

/* ------------------------------------------------------------------- drawing */

function draw(): void {
  if (mode === 'roster') {
    drawRoster();
    return;
  }
  /* The explainer is a mode, not a one-off render: the talent data lands a moment after
     boot and calls draw() again, which would otherwise paint the planner over it. */
  if (mode === 'intro') {
    drawRosterIntro();
    return;
  }
  if (!app) return;
  const scrollY = window.scrollY;
  app.replaceChildren();

  const coverage = computeCoverage(roster);
  const suggestions = suggestSwaps(roster, coverage);

  renderHeader({ page: 'raid', account: accountView(draw) });

  app.appendChild(renderToolbar(roster, coverage, handlers));
  const alerts = renderAlertBar(coverage);
  if (alerts) app.appendChild(alerts);

  const main = el('div', 'rmain');

  // Overview left, the groups themselves in the middle, coverage on the right.
  const left = el('div', 'rcol rcol--overview');
  left.appendChild(renderOverview(roster, handlers));
  main.appendChild(left);

  const centre = el('div', 'rcol rcol--centre');
  centre.appendChild(renderGroups(roster, coverage, handlers));
  centre.appendChild(renderWarnings(coverage));
  centre.appendChild(renderSuggestions(suggestions, handlers));
  const notes = renderNotes(coverage);
  if (notes) centre.appendChild(notes);
  centre.appendChild(renderImportPanel());
  centre.appendChild(renderSaveBar());
  main.appendChild(centre);

  // Buffs, debuffs and utility side by side: no tabs, nothing hidden.
  const buffs = el('div', 'rcol rcol--buffs');
  buffs.appendChild(renderBuffsPanel(roster, coverage, draw));
  main.appendChild(buffs);

  const debuffs = el('div', 'rcol rcol--debuffs');
  debuffs.appendChild(renderDebuffsPanel(roster, coverage, draw));
  main.appendChild(debuffs);

  const utility = el('div', 'rcol rcol--utility');
  utility.appendChild(renderUtilityPanel(roster, coverage));
  main.appendChild(utility);

  app.appendChild(main);
  app.appendChild(renderFooter());

  window.scrollTo({ top: scrollY });
}

/* -------------------------------------------------------------------- routing */

function readHash(): void {
  const hash = location.hash.replace(/^#/, '');
  if (!hash) {
    draw();
    return;
  }

  // A build handed over from the talent calculator seeds one player.
  if (hash.startsWith('import=')) {
    const code = decodeURIComponent(hash.slice('import='.length));
    const parsed = parseCode(code);
    if (parsed) {
      roster = emptyRoster(40);
      const player = createPlayer(parsed.classKey as ClassId, guessSpec(parsed));
      player.build = code;
      roster.groups[0]![0] = player;
      update();
      toast('Added your build as the first player');
      return;
    }
  }

  // A direct hand-off from the signup bot: #gb=<url-encoded event JSON>.
  if (hash.startsWith('gb=')) {
    try {
      if (importFromText(decodeURIComponent(hash.slice(3)))) return;
    } catch {
      toast('That Group Builder link could not be read');
    }
  }

  const decoded = decodeRoster(hash);
  if (decoded) {
    roster = decoded;
    draw();
    return;
  }
  draw();
}

/**
 * Picks the spec whose tree holds the most points in a pasted build code.
 * CLASSES lists specs in the same order as the talent data lists trees.
 */
function guessSpec(parsed: { classKey: string; trees: string[] }): number {
  const specs = (CLASSES[parsed.classKey as ClassId]?.specs ?? []).map((s) => s.id);
  let best = specs[0] ?? 161;
  let bestPoints = -1;
  parsed.trees.forEach((tree, i) => {
    const points = [...tree].reduce((sum, c) => sum + (Number(c) || 0), 0);
    if (points > bestPoints && specs[i] !== undefined) {
      bestPoints = points;
      best = specs[i]!;
    }
  });
  return best;
}

document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape') closeOverlays();
});

window.addEventListener('hashchange', () => {
  if (suppressHash) return;

  /* A fresh signed link pasted into a tab already in roster mode. This is what a leader
     does after being told their link expired, so it has to work: reload onto the new
     token rather than sit there. */
  const arriving = readRosterLink();
  if (mode === 'roster' && arriving && link) {
    if (arriving.token !== link.token || arriving.eventId !== link.eventId) {
      saver?.flush();
      location.reload();
    }
    return;
  }

  /* Roster, the explainer and the planner are all raid.html, so moving between them is a
     hash change and the browser will not turn the page for them. Leaving roster mode this
     way used to return without rendering anything, so the address bar said planner while
     the roster stayed on screen. */
  const to = railPosition(location.hash);
  const direction: 'fwd' | 'back' = to > lastRail ? 'fwd' : 'back';
  lastRail = to;

  if (arriving) {
    void enterRosterMode(arriving);
    return;
  }
  if (/^#?roster=demo/.test(location.hash)) {
    sameDocumentTurn(direction, enterDemoMode);
    return;
  }
  if (/^#?roster/.test(location.hash)) {
    sameDocumentTurn(direction, drawRosterIntro);
    return;
  }

  // Back to the planner. Drop any roster state so its pool and bar do not linger.
  sameDocumentTurn(direction, () => {
    if (mode !== 'planner') {
      saver?.flush();
      saver?.dispose();
      saver = null;
      rosterState = null;
      link = null;
      mode = 'planner';
      roster = emptyRoster(40);
    }
    readHash();
  });
});

/* A signed roster link wins over every other reading of the hash. #roster with no token
   is the nav button, which lands on the explainer. Without either the page is exactly what
   it has always been, with no network call and no account. */
/* The sign-in callback comes back with #signin=ok|cancelled|expired|failed. Read and
   clear it before anything routes on the hash, or it looks like an unknown roster. */
/* Asked once for the whole page, not once per mode. It used to live inside the roster
   explainer, so the planner drew a Sign in button to somebody already signed in. */
void loadUser(draw);

const signIn = takeSignInOutcome();
if (signIn) window.setTimeout(() => toast(SIGN_IN_MESSAGE[signIn]), 0);

lastRail = railPosition(location.hash);
const rosterLink = readRosterLink();
if (rosterLink) void enterRosterMode(rosterLink);
else if (/^#?roster=demo/.test(location.hash)) enterDemoMode();
else if (/^#?roster/.test(location.hash)) drawRosterIntro();
else readHash();

// The game's own spell text lives in the talent data. The page draws straight
// away with what it has, then redraws once that lands so every tooltip carries
// the real wording rather than a summary.
void loadTalentData()
  .then((data) => {
    initSpellText(data);
    draw();
  })
  .catch(() => {
    /* tooltips fall back to the short descriptions */
  });

/* =========================================================================
   Roster mode
   ========================================================================= */

/** Everyone the roster knows about, wherever they currently sit. */
function allRosterPlayers(): Player[] {
  if (!rosterState) return [];
  return [
    ...rosterState.roster.groups.flat().filter((p): p is Player => !!p),
    ...rosterState.pool,
    ...rosterState.cut,
  ];
}

function takeFromPoolOrCut(userId: string): Player | null {
  if (!rosterState) return null;
  const fromPool = rosterState.pool.findIndex((p) => p.discord?.userId === userId);
  if (fromPool >= 0) return rosterState.pool.splice(fromPool, 1)[0]!;
  const fromCut = rosterState.cut.findIndex((p) => p.discord?.userId === userId);
  if (fromCut >= 0) return rosterState.cut.splice(fromCut, 1)[0]!;
  return null;
}

function seatOf(playerId: string): { group: number; slot: number } | null {
  if (!rosterState) return null;
  for (let g = 0; g < GROUP_COUNT; g += 1) {
    for (let s = 0; s < GROUP_SIZE; s += 1) {
      if (rosterState.roster.groups[g]?.[s]?.id === playerId) return { group: g, slot: s };
    }
  }
  return null;
}

/** Back to the pool, sorted, so a returned player does not land at the bottom. */
function returnToPool(player: Player): void {
  if (!rosterState) return;
  rosterState.pool.push(player);
  rosterState.pool.sort((a, b) => a.name.localeCompare(b.name));
}

const rosterHandlers: Partial<RaidHandlers> = {
  onSeatFromPool: (userId, group, slot) => {
    if (!rosterState?.permissions.canEdit) return;
    const player = takeFromPoolOrCut(userId);
    if (!player) return;
    // Whoever was in that seat goes back to the pool rather than disappearing.
    const displaced = rosterState.roster.groups[group]?.[slot] ?? null;
    rosterState.roster.groups[group]![slot] = player;
    if (displaced) returnToPool(displaced);
    rosterChanged();
  },

  onReturnToPool: (playerId) => {
    if (!rosterState?.permissions.canEdit) return;
    const at = seatOf(playerId);
    if (!at) return;
    const player = rosterState.roster.groups[at.group]![at.slot]!;
    rosterState.roster.groups[at.group]![at.slot] = null;
    returnToPool(player);
    rosterChanged();
  },

  onCut: (userId) => {
    if (!rosterState?.permissions.canEdit) return;
    const player = takeFromPoolOrCut(userId);
    if (!player) return;
    rosterState.cut.push(player);
    rosterChanged();
  },

  onUncut: (userId) => {
    if (!rosterState?.permissions.canEdit) return;
    const player = takeFromPoolOrCut(userId);
    if (!player) return;
    returnToPool(player);
    rosterChanged();
  },

  onAddGuest: () => {
    if (!rosterState?.permissions.canEdit) return;
    openGuestPicker();
  },

  onPublish: () => {
    if (!rosterState?.permissions.canPublish) return;
    openPublishConfirm();
  },
};

Object.assign(handlers, rosterHandlers);

/** A guest is seated by picking a spec, then named. They have no Discord account. */
function openGuestPicker(): void {
  closeOverlays();
  const free = firstFreeSeat();
  if (!free) {
    toast('Every seat is full.');
    return;
  }
  document.body.appendChild(
    renderSpecPicker(
      free.group,
      free.slot,
      (classId, specId) => {
        if (!rosterState) return;
        const taken = new Set(
          allRosterPlayers().map((p) => p.discord?.userId).filter((id): id is string => !!id),
        );
        const name = window.prompt('What is the guest called?')?.trim();
        if (!name) {
          closeOverlays();
          return;
        }
        const guest = makeGuest(classId, specId, name, taken);
        rosterState.roster.groups[free.group]![free.slot] = guest;
        closeOverlays();
        rosterChanged();
        toast(guest.name + ' seated. Guests are never messaged.');
      },
      closeOverlays,
    ),
  );
}

function firstFreeSeat(): { group: number; slot: number } | null {
  if (!rosterState) return null;
  const active = Math.ceil(rosterState.roster.size / GROUP_SIZE);
  for (let g = 0; g < Math.min(active, GROUP_COUNT); g += 1) {
    for (let s = 0; s < GROUP_SIZE; s += 1) {
      if (!rosterState.roster.groups[g]?.[s]) return { group: g, slot: s };
    }
  }
  return null;
}

function seatedCount(): number {
  return rosterState ? rosterState.roster.groups.flat().filter(Boolean).length : 0;
}

/* ------------------------------------------------------------------ saving */

function onSaveState(state: SaveState, failure?: ApiFailure): void {
  saveState = state;
  saveDetail = failure ? explain(failure) : undefined;
  if (failure) handleFailure(failure);
  else draw();
}

/**
 * What to do when the bot refuses.
 *
 * A 409 is never retried. Retrying it with the revision the server just handed back is
 * precisely the silent overwrite that the revision number exists to prevent, so the
 * leader is told their copy is stale and shown the fresh one instead.
 */
function handleFailure(failure: ApiFailure): void {
  const message = explain(failure);
  if (failure.kind === 'conflict') {
    toast(message);
    saver?.dispose();
    saver = null;
    void reloadRoster('Reloaded. Somebody else had already saved.');
    return;
  }
  if (failure.kind === 'auth' || failure.kind === 'forbidden') {
    // Stop writing. Nothing this tab does from here on can succeed.
    saver?.dispose();
    saver = null;
    if (rosterState) rosterState.permissions = { canEdit: false, canPublish: false };
  }
  toast(message);
  draw();
}

async function reloadRoster(note?: string): Promise<void> {
  if (!access) return;
  try {
    const payload = await fetchRoster(access!);
    rosterState = stateFromPayload(payload);
    startSaver();
    saveState = 'idle';
    saveDetail = undefined;
    draw();
    if (note) toast(note);
  } catch (err) {
    if (err instanceof ApiError) handleFailure(err.failure);
    else toast('Could not reload the roster.');
  }
}

function startSaver(): void {
  if (!access || !rosterState?.permissions.canEdit) return;
  saver?.dispose();
  saver = new Saver(
    access!,
    () => ({ slots: slotsFrom(rosterState!), revision: rosterState!.revision }),
    (revision, status) => {
      if (!rosterState) return;
      rosterState.revision = revision;
      // A published roster stays published through later saves; do not force it back.
      rosterState.status = status;
    },
    onSaveState,
  );
}

/* --------------------------------------------------------------- publishing */

let publishing = false;

function openPublishConfirm(): void {
  if (!rosterState) return;
  closeOverlays();
  document.body.appendChild(
    renderPublishConfirm(
      {
        seated: seatedCount(),
        standby: rosterState.pool.length,
        cut: rosterState.cut.length,
        republish: rosterState.status === 'published',
      },
      () => {
        closeOverlays();
        void doPublish();
      },
      closeOverlays,
    ),
  );
}

/** One publish per user action: the button cannot be made to fire twice. */
async function doPublish(): Promise<void> {
  if (!access || !rosterState || publishing) return;
  publishing = true;
  draw();
  try {
    // Land any pending edit first, so what is published is what is on screen.
    saver?.flush();
    const result = await publishRoster(access!, rosterState.revision);
    rosterState.revision = result.revision;
    rosterState.status = 'published';
    draw();
    document.body.appendChild(renderPublishResult(result, closeOverlays));
  } catch (err) {
    if (err instanceof ApiError) handleFailure(err.failure);
    else toast('Publishing failed.');
  } finally {
    publishing = false;
    draw();
  }
}

/* ---------------------------------------------------------------- drawing it */

function drawRoster(): void {
  if (!app || !rosterState) return;
  const scrollY = window.scrollY;
  app.replaceChildren();

  roster = rosterState.roster;
  const coverage = computeCoverage(roster);
  const suggestions = suggestSwaps(roster, coverage);
  const canEdit = rosterState.permissions.canEdit;

  renderHeader({ page: 'roster', account: accountView(draw) });

  app.appendChild(
    renderRosterBar(
      {
        title: rosterState.event.title,
        startTime: rosterState.event.startTime,
        size: rosterState.event.size,
        seated: seatedCount(),
        standby: rosterState.pool.length,
        cut: rosterState.cut.length,
        saveState,
        saveDetail,
        status: rosterState.status,
        isTest: rosterState.event.isTest,
        canEdit,
        canPublish: rosterState.permissions.canPublish && !publishing,
        demo: isDemo(rosterState),
      },
      handlers,
    ),
  );

  const alerts = renderAlertBar(coverage);
  if (alerts) app.appendChild(alerts);

  const main = el('div', 'rmain rmain--roster');

  const left = el('div', 'rcol rcol--overview');
  left.appendChild(renderOverview(roster, handlers));
  main.appendChild(left);

  const centre = el('div', 'rcol rcol--centre');
  centre.appendChild(renderGroups(roster, coverage, handlers));
  centre.appendChild(
    renderPool(
      {
        pool: rosterState.pool,
        cut: rosterState.cut,
        canEdit,
        statusOnly: rosterState.statusOnly.map((s) => ({ name: s.name, status: s.classKey })),
        unmapped: rosterState.unmapped.map((s) => ({
          name: s.name,
          classKey: s.classKey,
          specKey: s.specKey,
        })),
      },
      handlers,
    ),
  );
  centre.appendChild(renderWarnings(coverage));
  centre.appendChild(renderSuggestions(suggestions, handlers));
  const notes = renderNotes(coverage);
  if (notes) centre.appendChild(notes);
  main.appendChild(centre);

  const buffs = el('div', 'rcol rcol--buffs');
  buffs.appendChild(renderBuffsPanel(roster, coverage, draw));
  main.appendChild(buffs);

  const debuffs = el('div', 'rcol rcol--debuffs');
  debuffs.appendChild(renderDebuffsPanel(roster, coverage, draw));
  main.appendChild(debuffs);

  const utility = el('div', 'rcol rcol--utility');
  utility.appendChild(renderUtilityPanel(roster, coverage));
  main.appendChild(utility);

  app.appendChild(main);
  app.appendChild(renderFooter());
  window.scrollTo({ top: scrollY });
}


/** The Roster nav button with no signed link: explain the whole thing from nothing. */
function drawRosterIntro(): void {
  if (!app) return;
  mode = 'intro';
  app.replaceChildren();
  renderHeader({ page: 'roster', account: accountView(draw) });
  app.appendChild(renderRosterIntro());
  app.appendChild(renderFooter());


  /* The bot describes its own commands, so the steps above stop being this page's guess.
     Fired after the render and ignored if it fails: most people reading this have not set
     the bot up yet, so being unreachable is the normal case rather than an error. */
  if (!docsRequested) {
    docsRequested = true;
    void fetchCommandDocs().then((docs) => {
      cachedDocs = docs;
      if (docs && mode === 'intro') enhanceRosterIntro(docs);
    });
  } else if (cachedDocs && mode === 'intro') {
    enhanceRosterIntro(cachedDocs);
  }
}

/**
 * Roster mode against made-up signups, with no bot and no network.
 *
 * The saver is deliberately never started and canPublish is false, so there is no path
 * from here to a request. Everything else is the real interface.
 */
function enterDemoMode(): void {
  mode = 'roster';
  link = null;
  rosterState = stateFromPayload(demoPayload());
  saveState = 'idle';
  saveDetail = undefined;
  draw();
}
/** Something went wrong before there is any roster to show. */
function drawRosterError(message: string): void {
  if (!app) return;
  app.replaceChildren();
  renderHeader({ page: 'roster', account: accountView(draw) });
  const panel = el('section', 'panel');
  panel.appendChild(el('div', 'panel__head', 'This roster did not open'));
  const body = el('div', 'panel__body');
  body.appendChild(el('p', '', message));
  body.appendChild(
    el(
      'p',
      'drawer__hint',
      'Roster mode is opened from Discord. Run /roster on the event and use the link the bot sends you.',
    ),
  );
  panel.appendChild(body);
  app.appendChild(panel);
  app.appendChild(renderFooter());
}

function accessFor(found: RosterLink | null, eventId?: string): RosterAccess {
  return { eventId: found?.eventId ?? eventId ?? '', link: found };
}

/** Enter roster mode, by signed link or by session. */
async function enterRosterMode(found: RosterLink | null, eventId?: string): Promise<void> {
  mode = 'roster';
  link = found;
  access = accessFor(found, eventId);
  if (app) {
    app.replaceChildren();
    renderHeader({ page: 'roster', account: accountView(draw) });
    app.appendChild(el('p', 'drawer__hint', 'Opening the roster…'));
  }
  try {
    const payload = await fetchRoster(access!);
    rosterState = stateFromPayload(payload);
    startSaver();
    draw();
    if (!payload.permissions.canEdit) {
      toast('You can look at this roster but not change it.');
    }
  } catch (err) {
    if (err instanceof ApiError) drawRosterError(explain(err.failure));
    else drawRosterError('Something went wrong opening this roster.');
  }
}

/* A tab closing must not lose the last drag. A debounced save would, so the pending one
   is flushed with keepalive, which lets the request outlive the page. */
window.addEventListener('pagehide', () => saver?.flush(true));
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') saver?.flush(true);
});

/**
 * What someone sees at raid.html#roster with no signed link.
 *
 * The Roster button in the nav lands here, which means most people arriving have never
 * heard of the bot. It has to explain the whole thing from nothing: what roster mode is
 * for, why it is separate from the planner, and the five steps to get there. Nobody
 * reaches roster mode by typing a URL, so the page cannot simply say "open it from
 * Discord" and stop.
 */
export function renderRosterIntro(): HTMLElement {
  const wrap = el('div');

  wrap.appendChild(renderAccount());

  const intro = el('section', 'panel');
  intro.appendChild(el('div', 'panel__head', 'Rosters'));
  const body = el('div', 'panel__body');
  body.appendChild(
    el(
      'p',
      '',
      'Signing up is not the same as going. Roster mode takes the people who signed up to a raid in Discord, lets you drag the ones you want into groups, and then tells everybody where they stand.',
    ),
  );
  body.appendChild(
    el(
      'p',
      '',
      'The planner next door does the same seating with made-up players, which is the right tool for working out a composition. This one holds real people who get a message when you publish, so it is opened from Discord rather than from here.',
    ),
  );
  intro.appendChild(body);
  wrap.appendChild(intro);

  /* --- what you get --- */
  const what = el('section', 'panel');
  what.appendChild(el('div', 'panel__head', 'What it does'));
  const whatBody = el('div', 'panel__body');
  const list = document.createElement('ul');
  const point = (text: string) => {
    const li = document.createElement('li');
    li.textContent = text;
    list.appendChild(li);
  };
  point('Everyone who signed up appears in a pool beside the groups, with their class, spec and what they said when they signed up.');
  point('Drag them into seats. The buff panel updates as you go, so you can see a group losing Windfury before you have finished moving people.');
  point('Anyone still in the pool when you publish is told they are standby. Cutting someone is a separate, deliberate choice, and they hear nothing at all.');
  point('Publishing posts the roster in the event channel and sends direct messages. Anyone with direct messages closed is named afterwards, so you know who to chase.');
  point('Your work saves a second after you stop dragging. Closing the tab does not lose it.');
  whatBody.appendChild(list);
  what.appendChild(whatBody);
  wrap.appendChild(what);

  /* --- how to get one --- */
  const how = el('section', 'panel');
  how.appendChild(el('div', 'panel__head', 'Setting it up'));
  const howBody = el('div', 'panel__body');
  howBody.appendChild(
    el(
      'p',
      'drawer__hint',
      'Rosters need Group Builder, a free signup bot that runs on your own machine. It is the half that knows who signed up; this page is the half that decides who plays.',
    ),
  );

  const steps = document.createElement('ol');
  steps.className = 'rsteps';
  const step = (title: string, detail: string) => {
    const li = document.createElement('li');
    li.appendChild(el('div', 'rsteps__title', title));
    li.appendChild(el('div', 'rsteps__detail', detail));
    steps.appendChild(li);
  };
  step(
    'Run the bot on your server',
    'Group Builder keeps everything in one SQLite file and needs no database to install. Its README walks through creating the Discord application and inviting it.',
  );
  step(
    'Post an event',
    'Use /create in the channel you raid from. Members click a class button, pick a spec, and the post updates itself.',
  );
  step(
    'Wait for people to sign up',
    'Signing up puts them in the pool. It does not give them a seat, which is the whole point of this page.',
  );
  step(
    'Run /roster on the event',
    'The bot checks you lead the raid and sends you a private link to this page, already loaded with your signups.',
  );
  step(
    'Seat people and publish',
    'The link works for two hours and covers one event. If it expires, run /roster again for a fresh one.',
  );
  const stepsHost = el('div');
  stepsHost.id = 'rsteps-host';
  stepsHost.appendChild(steps);
  howBody.appendChild(stepsHost);

  howBody.appendChild(
    el(
      'p',
      'drawer__hint',
      'Nobody but the raid leader and anyone they have made an assistant can open a roster, and the link only ever opens the one event it was made for.',
    ),
  );
  how.appendChild(howBody);
  wrap.appendChild(how);

  /* --- get on with something useful --- */
  const next = el('section', 'panel');
  next.id = 'rintro-tail';
  next.appendChild(el('div', 'panel__head', 'While you set that up'));
  const nextBody = el('div', 'panel__body');
  nextBody.appendChild(
    el(
      'p',
      '',
      'The demo opens roster mode against seventeen made-up signups, so you can see the whole thing before installing anything. Nothing there is saved and nobody is messaged. The planner next to it does everything except the messaging, with players you invent yourself.',
    ),
  );
  const row = el('div', 'spec-picker');

  /* The demo is the first button because it answers the question the page raises: what
     does this actually look like. It needs no bot and no account. */
  const demo = document.createElement('a');
  demo.className = 'btn btn--gold';
  demo.href = href('raid.html') + '#roster=demo';
  demo.textContent = 'Try a demo roster';

  const open = document.createElement('a');
  open.className = 'btn';
  open.href = href('raid.html');
  open.textContent = 'Open the raid planner';
  const sample = document.createElement('a');
  sample.className = 'btn';
  sample.href = href('raid.html');
  sample.textContent = 'Start from a sample 40-man';
  sample.addEventListener('click', (ev) => {
    ev.preventDefault();
    location.hash = '';
    fillSample();
  });
  row.append(demo, open, sample);
  nextBody.appendChild(row);
  next.appendChild(nextBody);
  wrap.appendChild(next);

  return wrap;
}

/**
 * Turn the page when the document does not change.
 *
 * Roster, the roster explainer and the planner are all raid.html, so moving between them
 * is a hash change rather than a navigation. The cross-document view transition in
 * base.css never fires for them, so those three swapped instantly while every other tab
 * in the bar slid — which reads as the page glitching rather than as a different design.
 *
 * This runs the same animation by hand. `data-nav` is the same attribute page-turn.js
 * sets before a real navigation, so a same-document turn and a cross-document one are
 * driven by exactly one set of rules in the stylesheet.
 */
function sameDocumentTurn(direction: 'fwd' | 'back', render: () => void): void {
  const root = document.documentElement;
  const start = (
    document as Document & { startViewTransition?: (cb: () => void) => { finished: Promise<void> } }
  ).startViewTransition;

  let reduced = false;
  try {
    reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    /* a browser that cannot answer gets the animation */
  }

  if (!start || reduced) {
    render();
    return;
  }

  root.setAttribute('data-nav', direction);
  /* Clicking two tabs quickly starts a turn while one is still running, and the browser
     rejects the second with InvalidStateError. The render still has to happen, so it
     falls back to doing it plainly rather than leaving the page on the old view. */
  let transition: { finished: Promise<void> };
  try {
    transition = start.call(document, render);
  } catch {
    root.removeAttribute('data-nav');
    render();
    return;
  }
  // Leave the attribute alone until the turn is over, or the rules stop matching midway
  // and the page finishes the animation in the wrong direction.
  void transition.finished.catch(() => {}).finally(() => root.removeAttribute('data-nav'));
}

/**
 * Which way the bar reads between the three states raid.html can be in.
 *
 * Roster sits to the right of Raid planner in the nav, and the explainer and the demo are
 * both reached through Roster, so they travel with it.
 */
function railPosition(hash: string): number {
  return /^#?roster/.test(hash) ? 1 : 0;
}

/**
 * Replace the hand-written setup steps with the bot's own, once they arrive.
 *
 * The page has already rendered and is already useful; this only ever improves it. If the
 * bot is unreachable — which is most of the time, for anyone who has not set it up yet —
 * nothing happens and the static steps stand.
 */
function enhanceRosterIntro(docs: CommandDocs): void {
  const host = document.getElementById('rsteps-host');
  if (!host || !docs.guide.setup.length) return;

  const steps = document.createElement('ol');
  steps.className = 'rsteps';
  for (const step of docs.guide.setup) {
    const li = document.createElement('li');
    li.appendChild(el('div', 'rsteps__title', step.title));
    const body = el('div', 'rsteps__detail', step.body);
    if (step.link) {
      const a = document.createElement('a');
      a.href = step.link;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = 'Open';
      a.style.marginLeft = '6px';
      body.appendChild(a);
    }
    li.appendChild(body);
    steps.appendChild(li);
  }
  host.replaceChildren(steps);

  /* What the bot actually accepts, rather than what this page remembers it accepting.
     adminOnly marks Manage Server, which is only /settings. The event commands are gated
     on a role each server configures for itself, and the command definition cannot know
     that, so it is said in prose rather than invented as a flag. */
  const cmds = el('section', 'panel');
  cmds.appendChild(el('div', 'panel__head', 'The commands'));
  const cbody = el('div', 'panel__body');

  /* The same rail as the setup steps above, because it reads the same way: a name to
     scan down the left, and a line of prose under it. The marker is a slash rather
     than a number, since commands are a list and not a sequence. */
  const list = document.createElement('ol');
  list.className = 'rsteps rsteps--cmds';

  for (const c of docs.commands) {
    const row = document.createElement('li');

    const head = el('div', 'rsteps__title');
    head.appendChild(el('span', 'rsteps__cmd', '/' + c.name));
    if (c.adminOnly) {
      const pill = el('span', 'pill pill--unverified', 'manage server');
      pill.title = 'Needs the Manage Server permission in Discord.';
      head.appendChild(pill);
    }
    row.appendChild(head);

    row.appendChild(el('div', 'rsteps__detail', c.description));

    // One chip each, written out in full, so a subcommand can be read and typed
    // rather than picked out of a run-on line.
    if (c.subcommands.length) {
      const subs = el('div', 'rsubs');
      for (const s of c.subcommands) {
        subs.appendChild(el('code', 'rsub', '/' + c.name + ' ' + s.name));
      }
      row.appendChild(subs);
    }

    list.appendChild(row);
  }
  cbody.appendChild(list);
  cbody.appendChild(
    el(
      'p',
      'drawer__hint',
      'Creating events needs the manager or assistant role, which each server sets for itself with /settings. That is why it is not marked above: the command itself does not know, the server does.',
    ),
  );
  cmds.appendChild(cbody);

  const anchor = document.getElementById('rintro-tail');
  anchor?.parentNode?.insertBefore(cmds, anchor);

  if (docs.guide.gotchas.length) {
    const gotchas = el('section', 'panel');
    gotchas.appendChild(el('div', 'panel__head', 'When it does not work'));
    const gbody = el('div', 'panel__body');

    // The third list on this page, so it uses the same rail as the other two.
    // The marker is an exclamation, since each one is something that went wrong.
    const problems = document.createElement('ol');
    problems.className = 'rsteps rsteps--gotchas';
    for (const g of docs.guide.gotchas) {
      const item = document.createElement('li');
      item.appendChild(el('div', 'rsteps__title', g.problem));
      item.appendChild(el('div', 'rsteps__detail', g.answer));
      problems.appendChild(item);
    }
    gbody.appendChild(problems);
    gotchas.appendChild(gbody);
    anchor?.parentNode?.insertBefore(gotchas, anchor);
  }
}

/* ========================================================================
   Signed in
   ======================================================================== */

const ROLE_LABEL_WEB: Record<Me['guilds'][number]['role'], string> = {
  admin: 'Administrator',
  manager: 'Manager',
  assistant: 'Assistant',
  member: 'Member',
};

/** The panel at the top of the Roster page: who you are, or a way to become somebody. */
function renderAccount(): HTMLElement {
  const panel = el('section', 'panel');
  const head = el('div', 'panel__head');
  head.appendChild(el('span', '', currentUser() ? 'Signed in' : 'Your servers'));
  panel.appendChild(head);
  const body = el('div', 'panel__body');

  if (!currentUser()) {
    body.appendChild(
      el(
        'p',
        '',
        'Sign in with Discord and the servers you help run appear here, with their events, so you can open a roster without waiting for a link.',
      ),
    );
    body.appendChild(
      el(
        'p',
        'drawer__hint',
        'Discord is asked only to confirm who you are. What you are allowed to do comes from your roles in each server, read at the moment you click.',
      ),
    );
    const row = el('div', 'spec-picker');
    const go = el('button', 'btn btn--gold', 'Sign in with Discord');
    go.addEventListener('click', () => beginSignIn());
    row.appendChild(go);
    body.appendChild(row);
    panel.appendChild(body);
    return panel;
  }

  const who = el('div', 'acct');
  if (currentUser()!.user.avatarUrl) {
    const img = document.createElement('img');
    img.className = 'acct__avatar';
    img.src = currentUser()!.user.avatarUrl!;
    img.alt = '';
    who.appendChild(img);
  }
  who.appendChild(el('div', 'acct__name', currentUser()!.user.username));
  const out = el('button', 'btn btn--sm', 'Sign out');
  out.addEventListener('click', () => {
    void signOut().then(() => {
      guildEvents = {};
      draw();
      toast('Signed out');
    });
  });
  who.appendChild(out);
  body.appendChild(who);

  if (!currentUser()!.guilds.length) {
    body.appendChild(
      el(
        'p',
        'drawer__hint',
        'None of your servers have the bot in them yet. Invite it to one and its events appear here.',
      ),
    );
    panel.appendChild(body);
    return panel;
  }

  for (const guild of currentUser()!.guilds) {
    const row = el('div', 'guildrow');
    const title = el('div', 'guildrow__head');
    title.appendChild(el('span', 'guildrow__name', guild.name));
    const pill = el('span', 'pill', ROLE_LABEL_WEB[guild.role]);
    pill.classList.add(guild.role === 'member' ? 'pill--same' : 'pill--new');
    title.appendChild(pill);
    row.appendChild(title);

    /* A guild where somebody is only a member is listed rather than hidden. Being told
       "you are in this server but not an officer" is an answer; a missing server is a
       puzzle they write to the raid leader about. */
    if (guild.role === 'member') {
      row.appendChild(
        el(
          'div',
          'drawer__hint',
          'You are in this server but not an officer, so you cannot build its rosters.',
        ),
      );
      body.appendChild(row);
      continue;
    }

    const events = guildEvents[guild.id];
    if (events === undefined) {
      const load = el('button', 'btn btn--sm', 'Show events');
      load.addEventListener('click', () => {
        load.textContent = 'Loading…';
        void fetchGuildEvents(guild.id)
          .then((list) => {
            guildEvents[guild.id] = list;
            drawRosterIntro();
          })
          .catch(() => {
            guildEvents[guild.id] = [];
            drawRosterIntro();
            toast('Could not read that server’s events.');
          });
      });
      row.appendChild(load);
    } else if (!events.length) {
      row.appendChild(el('div', 'drawer__hint', 'No open events in this server.'));
    } else {
      const list = el('div', 'evlist');
      for (const ev of events) list.appendChild(eventRow(ev));
      row.appendChild(list);
    }

    body.appendChild(row);
  }

  panel.appendChild(body);
  return panel;
}

function eventRow(ev: GuildEvent): HTMLElement {
  const row = el('div', 'evrow');
  const left = el('div', 'evrow__body');
  const title = el('div', 'evrow__title');
  title.appendChild(el('span', '', ev.title));
  if (ev.isTest) {
    const pill = el('span', 'pill pill--changed', 'test');
    pill.title = 'A throwaway event. Its signups are invented.';
    title.appendChild(pill);
  }
  left.appendChild(title);
  left.appendChild(
    el(
      'div',
      'evrow__meta',
      new Date(ev.startTime * 1000).toLocaleString(undefined, {
        weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
      }) + ' · ' + ev.signups + (ev.signups === 1 ? ' signup' : ' signups'),
    ),
  );
  row.appendChild(left);

  if (ev.canEdit) {
    const open = el('button', 'btn btn--sm btn--gold', 'Build roster');
    open.addEventListener('click', () => {
      // The session authorises this; there is no token and nothing goes in the URL.
      void enterRosterMode(null, ev.id);
    });
    row.appendChild(open);
  } else {
    const note = el('span', 'drawer__hint', 'Not yours to edit');
    row.appendChild(note);
  }
  return row;
}
