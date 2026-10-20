/**
 * The downloads page: addons and guide packages for people the owner has approved.
 *
 * The bot decides who may download and who is the owner; this page only asks
 * (PORTAL-SPEC). A download is a link to the API, which checks the cookie on every
 * request, so nothing here protects a file. The page hides what you cannot do and
 * says why.
 */
import { contractProblem, hasCapability, loadApiIdentity } from '../shared/api-contract';
import { renderFooter, renderHeader } from '../shared/header';
import {
  accountView,
  beginSignIn,
  loadUser,
  onSignedOut,
  sessionState,
  SIGN_IN_MESSAGE,
  takeSignInOutcome,
} from '../shared/session';
import { toast } from '../shared/toast';
import {
  createPackage,
  createRelease,
  decideUser,
  fetchAdminPackages,
  fetchEvents,
  fetchPackages,
  fetchPortalMe,
  fetchUsers,
  PortalApiError,
  requestAccess,
  updatePackage,
  updateRelease,
  uploadReleaseFile,
  type Package,
  type PortalMe,
} from './api';
import { fileProblem } from './format';
import { el, notice, renderAccess, renderCards, renderOwner, renderSignedOut, type OwnerState } from './render';

/* ------------------------------------------------------------------ state
   Every `let` lives here, above the functions. draw() runs during bootstrap, and a
   binding declared further down is still in its temporal dead zone when the first
   paint reads it. */

type Load = 'idle' | 'loading' | 'ready' | 'error';

let me: PortalMe | null = null;
let meState: Load = 'idle';
let meError = '';

let packages: Package[] | null = null;
let packagesState: Load = 'idle';
let packagesError = '';

let requesting = false;

const owner: OwnerState = {
  tab: 'people',
  users: null,
  packages: null,
  events: null,
  error: null,
  busy: new Set<string>(),
  uploads: new Map<number, number>(),
  maxUploadMb: 100,
  ownerId: '',
};
let ownerLoaded = false;

const app = document.getElementById('app')!;

/* ------------------------------------------------------------------ data */

async function loadMe(): Promise<void> {
  meState = 'loading';
  draw();
  try {
    me = await fetchPortalMe();
    meState = 'ready';
    if (me.maxUploadMb) owner.maxUploadMb = me.maxUploadMb;
    if (me.isOwner) owner.ownerId = me.user.id;
  } catch (err) {
    me = null;
    meState = 'error';
    meError = err instanceof Error ? err.message : 'Could not load.';
  }
  draw();
  if (me?.canDownload) void loadPackages();
  if (me?.isOwner && !ownerLoaded) void loadOwner();
}

async function loadPackages(): Promise<void> {
  packagesState = 'loading';
  draw();
  try {
    packages = (await fetchPackages()).packages;
    packagesState = 'ready';
  } catch (err) {
    packagesState = 'error';
    packagesError = err instanceof Error ? err.message : 'Could not load.';
    // A 403 here means the answer about you changed since the page loaded.
    if (err instanceof PortalApiError && err.status === 403 && me && err.access) {
      me = { ...me, access: err.access, canDownload: false };
    }
  }
  draw();
}

async function loadOwner(): Promise<void> {
  ownerLoaded = true;
  owner.error = null;
  draw();
  const results = await Promise.allSettled([fetchUsers(), fetchAdminPackages(), fetchEvents()]);
  const [users, pkgs, events] = results;
  if (users.status === 'fulfilled') owner.users = users.value.users;
  if (pkgs.status === 'fulfilled') owner.packages = pkgs.value.packages;
  if (events.status === 'fulfilled') owner.events = events.value.events;
  const failed = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
  if (failed) owner.error = failed.reason instanceof Error ? failed.reason.message : 'Could not load the owner tools.';
  draw();
}

function problem(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong. Try again.';
}

/** Run an owner action, mark what it touches as busy, then reload everything it changed. */
async function ownerAction(key: string, work: () => Promise<unknown>, done: string): Promise<void> {
  owner.busy.add(key);
  draw();
  try {
    await work();
    toast(done);
  } catch (err) {
    toast(problem(err), 4000);
  } finally {
    owner.busy.delete(key);
  }
  await Promise.all([loadOwner(), me?.canDownload ? loadPackages() : Promise.resolve()]);
}

const handlers = {
  decide(userId: string, status: 'approved' | 'rejected' | 'revoked') {
    const verb = status === 'approved' ? 'Approved.' : status === 'rejected' ? 'Rejected.' : 'Access removed. Their next request is refused.';
    if (status === 'revoked' && !confirm('Remove this person’s access? Every link they have stops working at once.')) return;
    void ownerAction('user:' + userId, () => decideUser(userId, status), verb);
  },
  createPackage(input: { title: string; description: string; installInstructions: string }) {
    owner.tab = 'packages';
    void ownerAction('package:new', () => createPackage(input), 'Package created. Add a release to it.');
  },
  savePackage(id: number, input: { title: string; description: string; installInstructions: string }) {
    void ownerAction('package:' + id, () => updatePackage(id, input), 'Package saved.');
  },
  createRelease(packageId: number, input: { version: string; gameCompat: string; coverage: string; changelog: string }) {
    void ownerAction('package:' + packageId, () => createRelease(packageId, input), 'Release created. Upload its archive next.');
  },
  saveRelease(id: number, input: { version: string; gameCompat: string; coverage: string; changelog: string }) {
    void ownerAction('release:' + id, () => updateRelease(id, input), 'Release saved.');
  },
  setPublished(id: number, published: boolean) {
    void ownerAction(
      'release:' + id,
      () => updateRelease(id, { published }),
      published ? 'Published. Everyone approved can download it now.' : 'Unpublished. Nobody but you sees it.',
    );
  },
  upload(releaseId: number, file: File) {
    const why = fileProblem(file, owner.maxUploadMb);
    if (why) {
      toast(why, 4000);
      return;
    }
    owner.uploads.set(releaseId, 0);
    void ownerAction(
      'release:' + releaseId,
      () =>
        uploadReleaseFile(releaseId, file, (fraction) => {
          owner.uploads.set(releaseId, fraction);
          draw();
        }).finally(() => owner.uploads.delete(releaseId)),
      'Archive stored. Publish the release when you are ready.',
    );
  },
  reload() {
    void loadOwner();
    if (me?.canDownload) void loadPackages();
  },
};

/* ------------------------------------------------------------------ draw */

function draw(): void {
  renderHeader({ page: 'downloads', account: accountView(draw) });
  app.replaceChildren();
  app.appendChild(el('h2', 'page-title', 'Downloads'));

  const state = sessionState();
  if (state === 'checking') {
    app.appendChild(notice('', 'Checking who you are…', 'quiet'));
  } else if (state === 'unreachable') {
    app.appendChild(notice('Could not reach the download service', ['The bot that answers for this page is not responding. Nothing is wrong with your account.', 'Try again in a minute.'], 'bad'));
    app.appendChild(el('div')).appendChild(buttonRetry());
  } else if (state === 'out') {
    for (const node of renderSignedOut(() => beginSignIn())) app.appendChild(node);
  } else {
    drawSignedIn();
  }

  app.appendChild(renderFooter());
}

function buttonRetry(): HTMLElement {
  const b = document.createElement('button');
  b.className = 'btn';
  b.type = 'button';
  b.textContent = 'Try again';
  b.addEventListener('click', () => void loadUser(onSession, true));
  return b;
}

function drawSignedIn(): void {
  const mismatch = contractProblem(loadedIdentity, ['portal']);
  if (mismatch) app.appendChild(notice('This page and the bot disagree', mismatch, 'bad'));

  if (meState === 'loading' || meState === 'idle') {
    app.appendChild(notice('', 'Loading your access…', 'quiet'));
    return;
  }
  if (meState === 'error' || !me) {
    app.appendChild(notice('Could not load your access', [meError, 'Try again in a minute.'], 'bad'));
    app.appendChild(buttonRetry());
    return;
  }

  if (!me.canDownload) {
    app.appendChild(renderAccess(me.access, me.access.status === 'pending' ? onRequest : null, requesting));
    return;
  }

  if (me.isOwner) {
    app.appendChild(el('p', 'dl-lead', 'You are the owner. The cards below are what an approved person sees; your tools are underneath.'));
  } else {
    app.appendChild(el('p', 'dl-lead', 'Everything published for people the owner has approved. Each download is logged with your Discord id.'));
  }

  if (packagesState === 'loading' || packagesState === 'idle') {
    app.appendChild(notice('', 'Loading packages…', 'quiet'));
  } else if (packagesState === 'error') {
    app.appendChild(notice('Could not load the packages', [packagesError, 'Try again in a minute.'], 'bad'));
  } else if (!packages?.length) {
    app.appendChild(notice('Nothing published yet', me.isOwner ? 'Create a package below, add a release, upload its archive and publish it.' : 'The owner has not published anything yet. Check back later.', 'quiet'));
  } else {
    app.appendChild(renderCards(packages));
  }

  if (me.isOwner) {
    app.appendChild(
      renderOwner(owner, handlers, (tab) => {
        owner.tab = tab;
        draw();
      }),
    );
  }
}

async function onRequest(): Promise<void> {
  if (requesting) return;
  requesting = true;
  draw();
  try {
    const result = await requestAccess();
    if (me) me = { ...me, access: result.access };
    toast('Asked. The owner decides from here.');
  } catch (err) {
    if (err instanceof PortalApiError && err.status === 409 && me) {
      // Already asked, or no longer pending: refresh what we know rather than guessing.
      await loadMe();
    }
    toast(problem(err), 4000);
  } finally {
    requesting = false;
  }
  draw();
}

/* ------------------------------------------------------------- bootstrap */

let loadedIdentity: Awaited<ReturnType<typeof loadApiIdentity>> = null;

function onSession(): void {
  draw();
  if (sessionState() === 'in') void loadMe();
}

const outcome = takeSignInOutcome();
if (outcome) toast(SIGN_IN_MESSAGE[outcome]);

onSignedOut(() => {
  me = null;
  meState = 'idle';
  packages = null;
  packagesState = 'idle';
  ownerLoaded = false;
  owner.users = null;
  owner.packages = null;
  owner.events = null;
  draw();
});

draw();
void loadApiIdentity().then((identity) => {
  loadedIdentity = identity;
  if (identity && !hasCapability('portal')) draw();
});
void loadUser(onSession);
