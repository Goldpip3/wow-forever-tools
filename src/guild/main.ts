/**
 * The guild page: who plays what.
 *
 * Forever has no armory and no Warcraft Logs, so nothing on this page can be fetched
 * from the game. A member says what they play, and the addon export fills in the gear.
 * The bot holds it, and the bot decides who may edit it; this page only asks.
 */
import { renderFooter, renderHeader } from '../shared/header';
import { keepFocus } from '../shared/focus';
import { attachTooltips } from '../shared/tooltip';
import { itemForGearCell, itemTip, resetGearIndex } from '../shared/gear-view';
import {
  accountView,
  beginSignIn,
  currentUser,
  loadUser,
  onSignedOut,
  SIGN_IN_MESSAGE,
  takeSignInOutcome,
  type Me,
} from '../shared/session';
import { toast } from '../shared/toast';
import {
  createCharacter,
  deleteCharacter as apiDeleteCharacter,
  fetchCharacter,
  fetchCharacters,
  GuildApiError,
  deleteGear as apiDeleteGear,
  saveCharacter,
  saveGear,
  type CharacterDetail,
  type CharacterInput,
  type CharacterList,
} from './api';
import { demoCharacter, demoList } from './demo';
import { parseGuildHash, writeGuildHash } from './hash';
import { charactersOf, searchCharacters, sortCharacters } from './list';
import { namesDiffer, readPaste } from './paste';
import { chooseGuild } from './pick';
import { coverageOf } from './coverage';
import { el, empty, renderCoverage, renderEditor, renderList, renderProfile } from './render';

/* ------------------------------------------------------------------ state
   Every `let` this page keeps lives here, above the functions that read it.
   `draw()` runs during bootstrap, so a binding declared further down the file is
   still in its temporal dead zone when the first paint reads it, and the page dies
   with "Cannot access X before initialization". */

/** The server being looked at, or null when nobody has chosen one. */
let guildId: string | null = null;

/** The character whose profile is open, or null for the list. */
let characterId: number | null = null;

/** The offline sample, entered with #demo. No network, no account. */
let demo = false;

/** The list for the chosen server, or null before it has been read. */
let list: CharacterList | null = null;

/** The open profile, or null while the list is showing. */
let detail: CharacterDetail | null = null;

/** What is in the search box. */
let query = '';

/** Which form is open: nothing, a new character, or the one that is showing. */
let editing: 'none' | 'new' | 'existing' = 'none';

/** True while a request is in flight, so a second click cannot start another. */
let busy = false;

/** What the last save was refused for, shown above the form. */
let problem: string | null = null;

/** What went wrong reading the list, shown instead of it. */
let loadError: string | null = null;

/** Why the last paste was refused, shown above the box. */
let gearProblem: string | null = null;

const app = document.getElementById('app');

/* ------------------------------------------------------------------ reading */

async function loadList(): Promise<void> {
  if (demo) {
    list = demoList();
    loadError = null;
    return;
  }
  if (!guildId) {
    list = null;
    return;
  }
  try {
    list = await fetchCharacters(guildId);
    loadError = null;
  } catch (err) {
    list = null;
    loadError = err instanceof GuildApiError ? err.message : 'Could not read that Discord server.';
  }
}

async function loadDetail(id: number): Promise<void> {
  if (demo) {
    detail = demoCharacter(id);
    return;
  }
  if (!guildId) return;
  try {
    detail = await fetchCharacter(guildId, id);
  } catch (err) {
    detail = null;
    characterId = null;
    toast(err instanceof GuildApiError ? err.message : 'Could not open that character.');
  }
}

/* ------------------------------------------------------------------ writing */

async function save(input: CharacterInput, ownerId: string | null): Promise<void> {
  if (busy) return;

  if (demo) {
    // The sample has no server behind it, and nothing it does may reach the bot.
    problem = null;
    editing = 'none';
    toast('This is the sample. Nothing is saved.');
    draw();
    return;
  }
  if (!guildId) return;

  busy = true;
  problem = null;
  draw();

  try {
    if (editing === 'existing' && detail) {
      const saved = await saveCharacter(guildId, detail.character.id, input);
      characterId = saved.character.id;
    } else {
      const created = await createCharacter(
        guildId,
        ownerId ? { ...input, userId: ownerId } : input,
      );
      characterId = created.character.id;
    }
    editing = 'none';
    await loadList();
    if (characterId) await loadDetail(characterId);
    toast('Saved.');
  } catch (err) {
    // The bot writes these messages and knows what this page does not, such as whose
    // character a name already belongs to. Show its words rather than ours.
    problem =
      err instanceof GuildApiError
        ? [err.message, ...err.details].join(' ')
        : 'That could not be saved. Try again.';
  } finally {
    busy = false;
    draw();
  }
}

async function remove(): Promise<void> {
  if (busy || !detail) return;

  const name = detail.character.name;
  if (demo) {
    toast('This is the sample. Nothing is deleted.');
    return;
  }
  if (!guildId) return;

  // Deleting takes the gear with it and cannot be undone, so it is asked before rather
  // than reported after.
  const sure = confirm(
    'Delete ' + name + '? This removes the profile and its gear, and cannot be undone.',
  );
  if (!sure) return;

  busy = true;
  draw();
  try {
    await apiDeleteCharacter(guildId, detail.character.id);
    detail = null;
    characterId = null;
    editing = 'none';
    await loadList();
    toast(name + ' deleted.');
  } catch (err) {
    toast(err instanceof GuildApiError ? err.message : 'Could not delete that character.');
  } finally {
    busy = false;
    draw();
  }
}

/**
 * Read a /wfsync paste and send what the profile shows.
 *
 * The reading happens here rather than on the bot because the export is the addon's
 * format, which this repository owns; the bot only stores what it is handed.
 */
async function pasteGear(text: string): Promise<void> {
  if (busy || !detail) return;

  const hadProblem = gearProblem !== null;
  gearProblem = null;

  const result = readPaste(text);
  if (!result.ok) {
    gearProblem = result.error;
    draw();
    return;
  }

  // This paste read cleanly, so the last one's complaint has to come off the screen
  // even on the paths below that stop before saving.
  if (hadProblem) draw();

  const { reading } = result;

  /* A wrong alt is a real mistake people make, and so is renaming a character, so the
     mismatch is a question rather than a refusal. */
  if (namesDiffer(detail.character.name, reading.name)) {
    const sure = confirm(
      'That export is for ' +
        reading.name +
        ', and this profile is ' +
        detail.character.name +
        '. Put it on ' +
        detail.character.name +
        ' anyway?',
    );
    if (!sure) return;
  }

  if (demo) {
    toast('This is the sample, so the gear is read but never saved.');
    return;
  }
  if (!guildId) return;

  busy = true;
  draw();
  try {
    await saveGear(guildId, detail.character.id, reading.upload);

    /* The export knows things the profile may not: the level, the class, and from
       version 2 the professions. Filling a blank field in beats making somebody type
       what the addon just read. Anything already entered is left alone. */
    const character = detail.character;
    const patch = {
      name: character.name,
      ruleset: character.ruleset ?? reading.ruleset,
      classKey: character.classKey,
      specKey: character.specKey,
      roleKey: character.roleKey,
      level: character.level ?? reading.level,
      isMain: character.isMain,
      professions: character.professions.length ? character.professions : reading.professions,
      note: character.note,
    };
    const changed =
      patch.ruleset !== character.ruleset ||
      patch.level !== character.level ||
      patch.professions.length !== character.professions.length;
    if (changed) await saveCharacter(guildId, character.id, patch);

    await loadList();
    await loadDetail(character.id);
    toast(
      reading.partial
        ? 'Gear saved. The addon said the read was incomplete, so something may be missing.'
        : 'Gear saved.',
    );
  } catch (err) {
    gearProblem =
      err instanceof GuildApiError
        ? [err.message, ...err.details].join(' ')
        : 'That could not be saved. Try again.';
  } finally {
    busy = false;
    draw();
  }
}

async function clearGear(): Promise<void> {
  if (busy || !detail) return;
  if (demo) {
    toast('This is the sample. Nothing is removed.');
    return;
  }
  if (!guildId) return;
  if (!confirm('Remove the gear from ' + detail.character.name + '? The profile stays.')) return;

  busy = true;
  gearProblem = null;
  draw();
  try {
    await apiDeleteGear(guildId, detail.character.id);
    await loadList();
    await loadDetail(detail.character.id);
    toast('Gear removed.');
  } catch (err) {
    toast(err instanceof GuildApiError ? err.message : 'Could not remove that gear.');
  } finally {
    busy = false;
    draw();
  }
}

/* ------------------------------------------------------------------ navigation */

function openCharacter(id: number): void {
  characterId = id;
  editing = 'none';
  problem = null;
  gearProblem = null;
  detail = null;
  draw();
  void loadDetail(id).then(draw);
}

function backToList(): void {
  characterId = null;
  detail = null;
  editing = 'none';
  problem = null;
  gearProblem = null;
  draw();
}

function chooseServer(next: string | null): void {
  guildId = next;
  characterId = null;
  detail = null;
  list = null;
  query = '';
  editing = 'none';
  draw();
  void loadList().then(draw);
}

function leaveEditor(): void {
  editing = 'none';
  problem = null;
  draw();
}

/* ------------------------------------------------------------------ signed out */

function renderSignedOut(): HTMLElement {
  const section = el('section', 'panel');
  const head = el('div', 'panel__head');
  head.appendChild(el('span', '', 'Your guild'));
  section.appendChild(head);
  const body = el('div', 'panel__body');
  section.appendChild(body);

  body.appendChild(
    el(
      'p',
      '',
      'Every member says which characters they play: class, spec, professions and the gear from their last export. Sign in and you see everyone in the Discord servers you share with the bot.',
    ),
  );
  body.appendChild(
    el(
      'p',
      'drawer__hint',
      'Discord is asked only to confirm who you are. What you may edit comes from your Discord roles, read at the moment you click.',
    ),
  );

  const row = el('div', 'spec-picker');
  const go = el('button', 'btn btn--gold', 'Sign in with Discord');
  go.addEventListener('click', () => beginSignIn());
  row.appendChild(go);

  const look = el('button', 'btn', 'Look at the sample first');
  look.addEventListener('click', () => {
    demo = true;
    guildId = null;
    characterId = null;
    draw();
    void loadList().then(draw);
  });
  row.appendChild(look);
  body.appendChild(row);
  return section;
}

/* ------------------------------------------------------------------ signed in */

const ROLE_LABEL: Record<Me['guilds'][number]['role'], string> = {
  admin: 'Administrator',
  manager: 'Manager',
  assistant: 'Assistant',
  member: 'Member',
};

function renderServerPicker(me: Me): HTMLElement {
  const section = el('section', 'panel');
  const head = el('div', 'panel__head');
  head.appendChild(el('span', '', 'Discord server'));
  section.appendChild(head);
  const body = el('div', 'panel__body');
  section.appendChild(body);

  if (!me.guilds.length) {
    body.appendChild(
      empty(
        'The bot is not in any of your Discord servers',
        'Invite it to the one your guild uses, and its members appear here.',
      ),
    );
    return section;
  }

  const row = el('div', 'gpick');
  row.appendChild(el('span', 'gpick__label', 'Guild'));

  const select = document.createElement('select');
  select.className = 'btn';

  /* With several servers and none chosen, the select would otherwise show the first one
     while the page below it showed nothing, which reads as a page that failed to load. */
  if (!guildId) {
    const ask = document.createElement('option');
    ask.value = '';
    ask.textContent = 'Choose a Discord server';
    ask.selected = true;
    select.appendChild(ask);
  }

  for (const guild of me.guilds) {
    const option = document.createElement('option');
    option.value = guild.id;
    option.textContent = guild.name;
    if (guild.id === guildId) option.selected = true;
    select.appendChild(option);
  }
  select.addEventListener('change', () => chooseServer(select.value || null));
  row.appendChild(select);

  const chosen = me.guilds.find((g) => g.id === guildId);
  if (chosen) {
    const pill = el('span', 'pill', ROLE_LABEL[chosen.role]);
    pill.classList.add(chosen.role === 'member' ? 'pill--same' : 'pill--new');
    row.appendChild(pill);
  }
  body.appendChild(row);

  if (chosen?.role === 'member') {
    body.appendChild(
      el(
        'div',
        'drawer__hint',
        'You are in this Discord server but not an officer. You can read every profile and edit your own.',
      ),
    );
  }

  return section;
}

/** Everyone who already has a character here, so an officer can file one for them. */
function knownPeople(): Array<{ userId: string; displayName: string }> {
  const seen = new Map<string, string>();
  for (const character of list?.characters ?? []) {
    if (!seen.has(character.userId)) seen.set(character.userId, character.displayName);
  }
  return [...seen].map(([userId, displayName]) => ({ userId, displayName }));
}

function messagePanel(title: string, detailText: string, retry: boolean): HTMLElement {
  const section = el('section', 'panel');
  const body = el('div', 'panel__body');
  body.appendChild(empty(title, detailText));
  if (retry) {
    const again = el('button', 'btn', 'Try again');
    again.addEventListener('click', () => {
      loadError = null;
      draw();
      void loadList().then(draw);
    });
    const row = el('div', 'spec-picker');
    row.appendChild(again);
    body.appendChild(row);
  }
  section.appendChild(body);
  return section;
}

function renderBody(): HTMLElement {
  if (loadError) return messagePanel('Could not read the characters', loadError, true);
  if (!list) return messagePanel('Reading the characters', 'One moment.', false);

  if (editing === 'new') {
    return renderEditor(
      {
        character: null,
        people: knownPeople(),
        canPickOwner: list.you.isOfficer,
        busy,
        problem,
      },
      { onSave: (input, ownerId) => void save(input, ownerId), onCancel: leaveEditor },
    );
  }

  if (characterId && detail) {
    if (editing === 'existing') {
      return renderEditor(
        { character: detail.character, people: [], canPickOwner: false, busy, problem },
        { onSave: (input) => void save(input, null), onCancel: leaveEditor },
      );
    }
    const open = detail;
    const others = charactersOf(list.characters, open.character.userId).filter(
      (c) => c.id !== open.character.id,
    );
    return renderProfile(open, others, {
      busy,
      gearProblem,
      onPasteGear: (text) => void pasteGear(text),
      onClearGear: () => void clearGear(),
      onBack: backToList,
      onEdit: () => {
        editing = 'existing';
        problem = null;
        draw();
      },
      onDelete: () => void remove(),
      onOpen: openCharacter,
    });
  }

  if (characterId && !detail) {
    return messagePanel('Opening that character', 'One moment.', false);
  }

  const shown = query ? searchCharacters(list.characters, query) : sortCharacters(list.characters);
  const roster = renderList(list.characters, shown, query, true, {
    onOpen: openCharacter,
    onSearch: (next) => {
      query = next;
      draw();
    },
    onAdd: () => {
      editing = 'new';
      problem = null;
      draw();
    },
  });

  /* A leader gets the gaps above the roster. Nobody else does: it is a list of
     things people have not done, and a member opening this page came for the
     roster rather than a report on their friends. Searching hides it, because
     then the answer on screen is the search rather than the guild. */
  if (!list.you.isLeader || query) return roster;

  const wrap = el('div', 'gstack');
  wrap.appendChild(
    renderCoverage({
      coverage: coverageOf(list.characters),
      missing: list.missing,
    }),
  );
  wrap.appendChild(roster);
  return wrap;
}

function demoBar(): HTMLElement {
  const bar = el('div', 'gdemo');
  bar.appendChild(el('span', '', 'Sample guild. Nobody here is real, and nothing is saved.'));
  const out = el('button', 'btn btn--sm', 'Leave the sample');
  out.addEventListener('click', () => {
    demo = false;
    list = null;
    detail = null;
    characterId = null;
    query = '';
    editing = 'none';
    draw();
  });
  bar.appendChild(out);
  return bar;
}

/* ------------------------------------------------------------------ paint */

function draw(): void {
  if (!app) return;

  // Every square the tooltip can ask about is about to be replaced.
  resetGearIndex();

  keepFocus(() => {
    renderHeader({ page: 'guild', account: accountView(draw) });
    app.replaceChildren();

    app.appendChild(el('h2', 'page-title', 'Guild'));
    app.appendChild(
      el(
        'p',
        'page-lead',
        'Look up anyone in your Discord server by character name, and see what they play.',
      ),
    );

    const me = currentUser();
    if (demo) {
      app.appendChild(demoBar());
      app.appendChild(renderBody());
    } else if (!me) {
      app.appendChild(renderSignedOut());
    } else {
      // Honours the link when it names a server this account can see, falls back to the
      // only one there is, and otherwise leaves the picker to ask.
      const settled = chooseGuild(me.guilds, guildId);
      if (settled !== guildId) {
        guildId = settled;
        characterId = null;
        detail = null;
      }

      app.appendChild(renderServerPicker(me));
      if (guildId) app.appendChild(renderBody());
    }

    app.appendChild(renderFooter());
  });

  writeGuildHash({ guildId, characterId, demo });
}

/** Read the list, then the open profile if the link named one. */
function refresh(): void {
  void loadList().then(() => {
    draw();
    if (characterId) void loadDetail(characterId).then(draw);
  });
}

/* ------------------------------------------------------------------ bootstrap */

/* Attached once, to the container that outlives every redraw. Inside draw() this
   added a fresh listener on every repaint, and the gear tooltip would eventually be
   built a dozen times per hover. Delegation means it still reaches squares drawn
   later. */
if (app) {
  attachTooltips(
    app,
    (target) => (target as Element).closest<HTMLElement>('.gcell'),
    (node) => {
      const item = itemForGearCell(node);
      // No location line: "In your bags" is wrong on somebody else's character, and
      // only equipped items are ever stored here.
      return item ? itemTip(item, { showLocation: false }) : null;
    },
  );
}

const outcome = takeSignInOutcome();
const opened = parseGuildHash(location.hash);
guildId = opened.guildId;
characterId = opened.characterId;
demo = opened.demo;

onSignedOut(() => {
  // What was on screen belonged to the account, so it goes with it.
  guildId = null;
  characterId = null;
  list = null;
  detail = null;
  query = '';
  editing = 'none';
  draw();
});

draw();
if (outcome) toast(SIGN_IN_MESSAGE[outcome]);

if (demo) refresh();

void loadUser(() => {
  draw();
  // Which server to read is only known once we know who is signed in.
  if (!demo && guildId) refresh();
});
