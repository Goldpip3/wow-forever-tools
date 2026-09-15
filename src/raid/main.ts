import { renderFooter, renderHeader } from '../shared/header';
import { copyText, toast } from '../shared/toast';
import { KEY_ROSTERS, readJson, writeJson } from '../shared/storage';
import { CLASSES, type ClassId } from '../shared/classes';
import { GROUP_COUNT, GROUP_SIZE, type Player, type Roster } from './types';
import { computeCoverage, emptyRoster, rosterSummary } from './engine';
import { createPlayer } from './loadout';
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
  type RaidHandlers,
} from './render';
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

const app = document.getElementById('app');
let roster: Roster = emptyRoster(40);
let suppressHash = false;

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
  suppressHash = true;
  const next = isEmptyRoster(roster) ? '' : '#' + encodeRoster(roster);
  history.replaceState(null, '', location.pathname + location.search + next);
  window.setTimeout(() => {
    suppressHash = false;
  }, 0);
}

function update(): void {
  syncHash();
  draw();
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
    if (g < GROUP_COUNT) roster.groups[g]![s] = createPlayer(classId, specId);
  });
  update();
  toast('Filled a sample 40-man');
}

/* ------------------------------------------------------------------ handlers */

const handlers: RaidHandlers = {
  onPickSeat: (group, slot) => openPicker(group, slot),

  onDropSpec: (classId, specId, group, slot) => {
    roster.groups[group]![slot] = createPlayer(classId, specId);
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
        roster.groups[group]![slot] = createPlayer(classId, specId);
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
  if (!app) return;
  const scrollY = window.scrollY;
  app.replaceChildren();

  const coverage = computeCoverage(roster);
  const suggestions = suggestSwaps(roster, coverage);

  app.appendChild(
    renderHeader({
      page: 'raid',
      title: 'Raid Planner',
      subtitle: rosterSummary(roster),
    }),
  );

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
  readHash();
});

readHash();

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
