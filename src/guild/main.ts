/**
 * The guild page: who plays what.
 *
 * Forever has no armory and no Warcraft Logs, so nothing on this page can be fetched
 * from the game. A member says what they play, and the addon export fills in the gear.
 * The bot holds it, and the bot decides who may edit it; this page only asks.
 */
import { contractProblem, GUILD_CAPABILITIES, loadApiIdentity } from '../shared/api-contract';
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
  sessionState,
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
import {
  DISCARD_ASK,
  draftChanged,
  draftFor,
  inputFrom,
  type EditorDraft,
} from './draft';
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

/**
 * What the open form holds, and what it held when it opened.
 *
 * The form draws these rather than keeping its values in its own fields, so a
 * redraw under a half-filled form draws the half-filled form. A refused save
 * used to reset every field to the stored character, taking with it both what
 * somebody had typed and their only chance to see what the bot objected to.
 */
let draft: EditorDraft | null = null;
let draftBase: EditorDraft | null = null;

/** The text in the gear box, for the same reason as the draft above. */
let gearText = '';

/** True while a request is in flight, so a second click cannot start another. */
let busy = false;

/** What the last save was refused for, shown above the form. */
let problem: string | null = null;

/** What went wrong reading the list, shown instead of it. */
let loadError: string | null = null;

/** True while the list is being read, so "nothing yet" and "reading" differ. */
let loadingList = false;

/** Why the last paste was refused, shown above the box. */
let gearProblem: string | null = null;

/**
 * Why this page and the bot it is talking to cannot work together.
 *
 * Null while nobody has asked, and null when they agree. The two deploy
 * separately: this page can be newer than the bot or older, and before it said
 * so the symptom was a field that would not save for no stated reason.
 */
let apiProblem: string | null = null;

/**
 * Which navigation a read belongs to.
 *
 * Every read carries the number that was current when it started and checks it
 * again when it lands. Without that, the answer to "show me this server" could
 * arrive after the reader had switched to another one and quietly replace it,
 * and the answer to a profile they had closed could reopen it.
 */
let epoch = 0;

/** Aborts the reads of the epoch that has just ended. */
let pending: AbortController | null = null;

/** True when this page pushed the open profile, so Back belongs to the list. */
let pushedProfile = false;

/** How the next hash write should land. Push only for opening a profile. */
let historyMode: 'push' | 'replace' = 'replace';

const app = document.getElementById('app');

/* ------------------------------------------------------------------ epochs */

/**
 * Start a navigation: drop what the last one was waiting for.
 *
 * Reads are abandoned; writes are not, and never carry one of these. A write
 * that is already at the bot will land whatever the page does next, and
 * pretending otherwise by aborting it is how a half-saved character happens.
 */
function startEpoch(): { seq: number; signal: AbortSignal } {
  pending?.abort();
  pending = new AbortController();
  epoch += 1;
  return { seq: epoch, signal: pending.signal };
}

/** Whether a read that has just landed still belongs to what is on screen. */
function current(seq: number): boolean {
  return seq === epoch;
}

/* ------------------------------------------------------------------ reading */

async function loadList(seq: number, signal: AbortSignal): Promise<void> {
  if (demo) {
    list = demoList();
    loadError = null;
    return;
  }
  if (!guildId) {
    list = null;
    return;
  }

  const forGuild = guildId;
  loadingList = true;
  try {
    const answer = await fetchCharacters(forGuild, signal);
    // Two checks, not one: the sequence catches a reader who moved on, and the
    // server id catches the same server being reopened while this was in flight.
    if (!current(seq) || guildId !== forGuild) return;
    list = answer;
    loadError = null;
  } catch (err) {
    if (err instanceof GuildApiError && err.aborted) return;
    if (!current(seq) || guildId !== forGuild) return;
    list = null;
    loadError = err instanceof GuildApiError ? err.message : 'Could not read that Discord server.';
  } finally {
    if (current(seq)) loadingList = false;
  }
}

async function loadDetail(id: number, seq: number, signal: AbortSignal): Promise<void> {
  if (demo) {
    detail = demoCharacter(id);
    return;
  }
  if (!guildId) return;

  const forGuild = guildId;
  try {
    const answer = await fetchCharacter(forGuild, id, signal);
    if (!current(seq) || guildId !== forGuild || characterId !== id) return;
    detail = answer;
  } catch (err) {
    if (err instanceof GuildApiError && err.aborted) return;
    if (!current(seq) || guildId !== forGuild || characterId !== id) return;
    detail = null;
    characterId = null;
    toast(err instanceof GuildApiError ? err.message : 'Could not open that character.');
  }
}

/** Read the list, then the open profile if the link named one. */
function refresh(): void {
  const { seq, signal } = startEpoch();
  void loadList(seq, signal).then(() => {
    if (!current(seq)) return;
    draw();
    if (characterId) void loadDetail(characterId, seq, signal).then(() => current(seq) && draw());
  });
}

/* ------------------------------------------------------------------ writing */

async function save(input: CharacterInput, ownerId: string | null): Promise<void> {
  if (busy) return;

  if (demo) {
    // The sample has no server behind it, and nothing it does may reach the bot.
    problem = null;
    closeEditor();
    toast('This is the sample. Nothing is saved.');
    draw();
    return;
  }
  if (!guildId) return;

  busy = true;
  problem = null;
  draw();

  const forGuild = guildId;
  try {
    let savedId: number;
    if (editing === 'existing' && detail) {
      const saved = await saveCharacter(forGuild, detail.character.id, input);
      savedId = saved.character.id;
    } else {
      const created = await createCharacter(
        forGuild,
        ownerId ? { ...input, userId: ownerId } : input,
      );
      savedId = created.character.id;
    }

    /* Saved. Everything after this is a refresh, and a refresh that fails must
       not read as a save that failed. */
    closeEditor();
    characterId = savedId;

    const { seq, signal } = startEpoch();
    await loadList(seq, signal);
    if (current(seq)) await loadDetail(savedId, seq, signal);
    toast(loadError ? 'Saved. The list could not be read back; try again.' : 'Saved.');
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
    'Delete ' +
      name +
      '? This removes the profile, its professions and the gear pasted on it, for ' +
      'everyone in this Discord server. It cannot be undone.',
  );
  if (!sure) return;

  busy = true;
  draw();
  const forGuild = guildId;
  try {
    await apiDeleteCharacter(forGuild, detail.character.id);
    detail = null;
    characterId = null;
    closeEditor();

    const { seq, signal } = startEpoch();
    await loadList(seq, signal);
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
  const forGuild = guildId;
  const character = detail.character;
  try {
    await saveGear(forGuild, character.id, reading.upload);

    /* The export knows things the profile may not: the level, the class, and from
       version 2 the professions. Filling a blank field in beats making somebody type
       what the addon just read. Anything already entered is left alone. */
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

    /* The gear is saved by this point. A failure here leaves the two disagreeing,
       which is worth saying plainly rather than reporting as a failed paste. */
    let profileFailed = false;
    if (changed) {
      try {
        await saveCharacter(forGuild, character.id, patch);
      } catch {
        profileFailed = true;
      }
    }

    // The box has done its job; keeping the text would only invite a second paste.
    gearText = '';

    const { seq, signal } = startEpoch();
    await loadList(seq, signal);
    if (current(seq)) await loadDetail(character.id, seq, signal);

    toast(
      profileFailed
        ? 'Gear saved, but the level and professions from it were not. Try the form.'
        : reading.partial
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
  const forGuild = guildId;
  const id = detail.character.id;
  try {
    await apiDeleteGear(forGuild, id);

    const { seq, signal } = startEpoch();
    await loadList(seq, signal);
    if (current(seq)) await loadDetail(id, seq, signal);
    toast('Gear removed.');
  } catch (err) {
    toast(err instanceof GuildApiError ? err.message : 'Could not remove that gear.');
  } finally {
    busy = false;
    draw();
  }
}

/* ------------------------------------------------------------------ the form */

function openEditor(mode: 'new' | 'existing'): void {
  editing = mode;
  draft = draftFor(mode === 'existing' && detail ? detail.character : null);
  draftBase = draft;
  problem = null;
  draw();
}

function closeEditor(): void {
  editing = 'none';
  draft = null;
  draftBase = null;
  problem = null;
}

/** Whether the form may be thrown away, asking first when there is something in it. */
function mayLeaveEditor(): boolean {
  if (editing === 'none' || !draft || !draftBase) return true;
  if (!draftChanged(draft, draftBase)) return true;
  return confirm(DISCARD_ASK);
}

function leaveEditor(): void {
  if (!mayLeaveEditor()) return;
  closeEditor();
  draw();
}

/* ------------------------------------------------------------------ navigation */

function openCharacter(id: number): void {
  if (!mayLeaveEditor()) return;
  characterId = id;
  closeEditor();
  gearProblem = null;
  gearText = '';
  detail = null;
  // A profile is a place to come back from, so it gets its own history entry.
  pushedProfile = true;
  historyMode = 'push';
  const { seq, signal } = startEpoch();
  draw();
  void loadDetail(id, seq, signal).then(() => current(seq) && draw());
}

function backToList(): void {
  if (!mayLeaveEditor()) return;
  /* We pushed the profile, so the entry behind it is the list this reader came
     from, with their search still in it. Going back is the honest move; pushing
     another entry would make Back walk forwards. */
  if (pushedProfile) {
    pushedProfile = false;
    history.back();
    return;
  }
  characterId = null;
  detail = null;
  closeEditor();
  gearProblem = null;
  gearText = '';
  draw();
}

function chooseServer(next: string | null): void {
  if (!mayLeaveEditor()) return;
  guildId = next;
  characterId = null;
  detail = null;
  list = null;
  query = '';
  loadError = null;
  pushedProfile = false;
  closeEditor();
  gearText = '';
  draw();
  refresh();
}

/**
 * The address bar changed under us: Back, Forward, or a pasted link.
 *
 * Applies whatever it says. It is the only navigation that does not write the
 * hash back, because the browser has already written it.
 */
function onHashChange(): void {
  const opened = parseGuildHash(location.hash);
  if (opened.demo === demo && opened.guildId === guildId && opened.characterId === characterId) {
    return;
  }

  // Leaving by the browser's Back button is not a place to ask a question: the
  // page has already moved. The form goes, and says so.
  if (editing !== 'none' && draft && draftBase && draftChanged(draft, draftBase)) {
    toast('The form was left behind. Nothing was saved.');
  }
  closeEditor();

  demo = opened.demo;
  const wasCharacter = characterId;
  guildId = opened.guildId ?? guildId;
  characterId = opened.characterId;
  gearProblem = null;
  gearText = '';
  if (characterId === null) {
    detail = null;
    pushedProfile = false;
    draw();
    return;
  }

  if (characterId !== wasCharacter) {
    detail = null;
    const { seq, signal } = startEpoch();
    draw();
    void loadDetail(characterId, seq, signal).then(() => current(seq) && draw());
    return;
  }
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
    refresh();
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

function messagePanel(title: string, detailText: string, retry: null | (() => void)): HTMLElement {
  const section = el('section', 'panel');
  const body = el('div', 'panel__body');
  body.appendChild(empty(title, detailText));
  if (retry) {
    const again = el('button', 'btn', 'Try again');
    again.addEventListener('click', retry);
    const row = el('div', 'spec-picker');
    row.appendChild(again);
    body.appendChild(row);
  }
  section.appendChild(body);
  return section;
}

/** The two builds disagree. Said once, above everything, before it is asked for. */
function versionPanel(problemText: string): HTMLElement {
  const section = el('section', 'panel');
  const body = el('div', 'panel__body');
  const warn = el('div', 'gwarn', problemText);
  warn.setAttribute('role', 'alert');
  body.appendChild(warn);
  section.appendChild(body);
  return section;
}

function renderBody(): HTMLElement {
  if (loadError) {
    return messagePanel('Could not read the characters', loadError, () => {
      loadError = null;
      draw();
      refresh();
    });
  }
  if (!list) {
    return loadingList
      ? messagePanel('Reading the characters', 'One moment.', null)
      : messagePanel('Nothing read yet', 'Choose a Discord server above.', null);
  }

  if (editing === 'new' && draft) {
    return renderEditor(
      {
        character: null,
        draft,
        people: knownPeople(),
        canPickOwner: list.you.isOfficer,
        busy,
        problem,
      },
      {
        onSave: (next) => void save(inputFrom(next), next.ownerId),
        onCancel: leaveEditor,
        onChange: (next) => {
          draft = next;
        },
      },
    );
  }

  if (characterId && detail) {
    if (editing === 'existing' && draft) {
      return renderEditor(
        { character: detail.character, draft, people: [], canPickOwner: false, busy, problem },
        {
          onSave: (next) => void save(inputFrom(next), null),
          onCancel: leaveEditor,
          onChange: (next) => {
            draft = next;
          },
        },
      );
    }
    const open = detail;
    const others = charactersOf(list.characters, open.character.userId).filter(
      (c) => c.id !== open.character.id,
    );
    return renderProfile(open, others, {
      busy,
      gearProblem,
      gearText,
      onGearText: (next) => {
        gearText = next;
      },
      onPasteGear: (text) => void pasteGear(text),
      onClearGear: () => void clearGear(),
      onBack: backToList,
      onEdit: () => openEditor('existing'),
      onDelete: () => void remove(),
      onOpen: openCharacter,
    });
  }

  if (characterId && !detail) {
    return messagePanel('Opening that character', 'One moment.', null);
  }

  const shown = query ? searchCharacters(list.characters, query) : sortCharacters(list.characters);
  const roster = renderList(list.characters, shown, query, true, {
    onOpen: openCharacter,
    onSearch: (next) => {
      query = next;
      draw();
    },
    onAdd: () => openEditor('new'),
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
    closeEditor();
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

    // Whichever of the two is behind, saying so beats the reader working it out
    // from a save that quietly does nothing.
    if (apiProblem && !demo) app.appendChild(versionPanel(apiProblem));

    const me = currentUser();
    if (demo) {
      app.appendChild(demoBar());
      app.appendChild(renderBody());
    } else if (!me) {
      /* Four answers, not two. Before the first one arrives this drew a sign-in
         button at somebody who was already signed in, and when the bot was down
         it drew one that could not work. */
      const state = sessionState();
      if (state === 'checking') {
        app.appendChild(messagePanel('Checking your sign-in', 'One moment.', null));
      } else if (state === 'unreachable') {
        app.appendChild(
          messagePanel(
            'Could not reach the bot',
            'It may be offline, or your connection may be down. Your sign-in is not the problem.',
            () => {
              draw();
              void loadUser(() => {
                draw();
                if (guildId) refresh();
              }, true);
            },
          ),
        );
      } else {
        app.appendChild(renderSignedOut());
      }
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

  writeGuildHash({ guildId, characterId, demo }, historyMode);
  historyMode = 'replace';
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

window.addEventListener('hashchange', onHashChange);

/* A half-filled form is worth a browser prompt on the way out. The wording is the
   browser's; nothing said here reaches the reader. */
window.addEventListener('beforeunload', (event) => {
  if (editing === 'none' || !draft || !draftBase) return;
  if (!draftChanged(draft, draftBase)) return;
  event.preventDefault();
  event.returnValue = '';
});

onSignedOut(() => {
  // What was on screen belonged to the account, so it goes with it.
  startEpoch();
  guildId = null;
  characterId = null;
  list = null;
  detail = null;
  query = '';
  gearText = '';
  loadError = null;
  closeEditor();
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

/* What the bot on the other end is, so a mismatch reads as a mismatch. Needs no
   session, so it is asked even while signing in is what is broken. */
void loadApiIdentity().then((identity) => {
  const next = contractProblem(identity, GUILD_CAPABILITIES);
  if (!next) return;
  apiProblem = next;
  draw();
});
