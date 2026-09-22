import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import lz from 'lz-string';
const { compressToEncodedURIComponent, decompressFromEncodedURIComponent } = lz;

const API = 'https://api.wowforever.us';

/** Refuse everything that is not this site or the mocked bot, so a test can never go online. */
async function offline(context: BrowserContext): Promise<void> {
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith('http://127.0.0.1:4173/')) return route.continue();
    if (url.startsWith(API + '/api/v4/me')) return route.fulfill({ status: 401, body: '{}' });
    return route.abort();
  });
}

test.beforeEach(async ({ context }) => {
  await offline(context);
});

async function loadSample(page: Page, key: string): Promise<void> {
  const pick = page.locator('select').filter({ has: page.locator(`option[value="${key}"]`) });
  await pick.selectOption(key);
  await page.getByRole('button', { name: 'Load this sample' }).click();
  await expect(page.getByText(/\d+ items read/)).toBeVisible();
}

test('changing talent comparison keeps the gear page settings', async ({ page }) => {
  await page.goto('/dps.html');
  await loadSample(page, 'mage');
  const seconds = page.locator('input[type=number][max="1800"]');
  await seconds.fill('240');
  await seconds.dispatchEvent('change');

  await page.goto('/talents.html#mage/60/');
  await page.getByRole('button', { name: 'Compare to Classic' }).click();

  await page.goto('/dps.html');
  await loadSample(page, 'mage');
  await expect(page.locator('input[type=number][max="1800"]')).toHaveValue('240');
});

test('a reload keeps the bags and bank', async ({ page }) => {
  await page.goto('/dps.html');
  await loadSample(page, 'mage');
  await expect(page.getByText('21 items read')).toBeVisible();
  await page.reload();
  await expect(page.getByText('21 items read')).toBeVisible();
});

test('a talent link that breaks the rules is repaired and says so, and an illegal removal is refused', async ({ page }) => {
  await page.goto('/talents.html#warrior/10/05000000000000000-000000000000000000-000000000000000000');
  await expect(page.locator('#toast')).toContainText('4 points in that link broke the talent rules');
  await expect(page).toHaveURL(/#warrior\/10\/01000000000000000-/);

  await page.goto('/talents.html#warrior/60/');
  const deflection = page.locator('.cell[data-tree="0"][data-talent="1"]');
  for (let i = 0; i < 5; i += 1) await deflection.click();
  await page.locator('.cell[data-tree="0"][data-talent="3"]').click();
  await deflection.click({ modifiers: ['Shift'] });
  await expect(page.locator('#toast')).toContainText('Improved Charge needs 5 points in the rows above it');
  await expect(page).toHaveURL(/#warrior\/60\/05010/);
});

test('a run on real workers reopens as a report, and a character link opens, in a fresh browser', async ({ page, browser }) => {
  await page.goto('/dps.html');
  await loadSample(page, 'warrior');
  const characterLink = new URL(page.url()).hash;
  expect(characterLink).toMatch(/^#c=/);

  expect(await page.evaluate(() => typeof Worker)).toBe('function');
  await page.getByRole('button', { name: 'Run the simulation' }).click();
  await expect(page.locator('.dtimeline')).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText(/^Simulator version [0-9a-f]{12}, this page/)).toBeVisible();
  const code = await page.evaluate(() => JSON.parse(localStorage.getItem('wf.reports') ?? '[]')[0]?.code as string);
  expect(code).toBeTruthy();

  const fresh = await browser.newContext();
  await offline(fresh);
  const other = await fresh.newPage();
  await other.goto('/dps.html#r=' + code);
  await expect(other.locator('.dtimeline')).toBeVisible();
  await expect(other.getByText(/^Simulator version/)).toBeVisible();

  await other.goto('/dps.html' + characterLink);
  await other.reload();
  await expect(other.getByText(/\d+ items read/)).toBeVisible();
  await fresh.close();
});

test('Stop ends a run on the workers with no result', async ({ page }) => {
  await page.goto('/dps.html');
  await loadSample(page, 'warrior');
  await page.locator('select').filter({ has: page.locator('option[value="20000"]') }).selectOption('20000');
  await page.getByRole('button', { name: 'Run the simulation' }).click();
  await page.getByRole('button', { name: 'Stop' }).click();
  await expect(page.getByRole('button', { name: 'Stop' })).toHaveCount(0, { timeout: 5_000 });
  await expect(page.locator('.dtimeline')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Run the simulation' })).toBeEnabled();
});

test('a worker that cannot start fails the run visibly instead of hanging', async ({ page, context }) => {
  await context.route('**/assets/worker-*.js', (route) => route.fulfill({ status: 404, body: '' }));
  await page.goto('/dps.html');
  await loadSample(page, 'warrior');
  await page.getByRole('button', { name: 'Run the simulation' }).click();
  await expect(page.getByRole('button', { name: 'Stop' })).toHaveCount(0, { timeout: 15_000 });
  await expect(page.locator('#toast')).not.toBeEmpty();
  await expect(page.locator('.dtimeline')).toHaveCount(0);
});

test('a roster saves before it publishes, and the demo after it sends nothing', async ({ page, context }) => {
  const log: string[] = [];
  let revision = 3;
  const signups = [0, 1, 2].map((i) => ({
    signupId: i + 1, userId: 'u' + i, name: 'P' + i, classKey: 'warrior', specKey: 'arms', roleKey: 'melee', status: 'primary', position: i + 1,
  }));
  await context.route(API + '/api/v4/events/**', async (route) => {
    const request = route.request();
    const body = request.postDataJSON() as { revision?: number } | null;
    log.push(request.method() + '@' + (body?.revision ?? '-'));
    if (request.method() === 'GET') {
      return route.fulfill({ json: {
        event: { id: '42', title: 'Smoke', startTime: 1789063200, guildId: 'g', channelId: 'c', size: 40 },
        signups, roster: { revision: 3, status: 'draft', publishedAt: null, slots: [] },
        permissions: { canEdit: true, canPublish: true },
      } });
    }
    // A slow save, so publishing has something to wait for.
    if (request.method() === 'PUT') {
      await new Promise((r) => setTimeout(r, 600));
      revision += 1;
      return route.fulfill({ json: { revision, status: 'draft', slotCount: 3 } });
    }
    revision += 1;
    return route.fulfill({ json: { revision, selected: 3, standby: 0, cut: 0, messageUrl: '', notified: 3, couldNotDm: [], skippedTestAccounts: [], dmMode: 'dm' } });
  });

  await page.goto('/raid.html#roster=42&t=smoke-token');
  await page.getByRole('button', { name: 'Seat everyone' }).click();
  await page.getByRole('button', { name: 'Publish to Discord' }).click();
  await page.locator('.modal').getByRole('button', { name: 'Publish', exact: true }).click();
  await expect.poll(() => log.join(' ')).toBe('GET@- PUT@3 POST@4');

  await page.evaluate(() => (location.hash = 'roster'));
  await page.evaluate(() => (location.hash = 'roster=demo'));
  await expect(page.getByText('Demo, nothing is saved')).toBeVisible();
  const before = log.length;
  await page.getByRole('button', { name: 'Seat everyone' }).click();
  await page.waitForTimeout(1500);
  expect(log.length).toBe(before);
});

test('counters fall back cleanly with no Arial Narrow file to fetch', async ({ page }) => {
  const fontRequests: string[] = [];
  page.on('request', (request) => {
    if (/\.(ttf|otf|woff2?)(\?|$)/i.test(request.url())) fontRequests.push(request.url());
  });
  await page.goto('/talents.html#warrior/60/');
  const counter = page.locator('.tree__count').first();
  await expect(counter).toBeVisible();
  const family = await counter.evaluate((el) => getComputedStyle(el).fontFamily);
  expect(family).toMatch(/WoW Narrow/);
  expect(family).toMatch(/Alegreya/);
  await page.evaluate(() => document.fonts.ready);
  expect(fontRequests.some((url) => /ARIALN/i.test(url))).toBe(false);
});

test('an incomplete report shows a recovery message without crashing', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/dps.html');
  await loadSample(page, 'warrior');
  await page.getByRole('button', { name: 'Run the simulation' }).click();
  await expect(page.locator('.dtimeline')).toBeVisible({ timeout: 45_000 });
  const code = await page.evaluate(() => JSON.parse(localStorage.getItem('wf.reports')!)[0].code as string);
  const packed = JSON.parse(decompressFromEncodedURIComponent(code));
  delete packed[1].summary.histogram.min;
  await page.goto('/dps.html#r=' + compressToEncodedURIComponent(JSON.stringify(packed)));
  await expect(page.locator('#toast')).toContainText('incomplete or invalid');
  await expect(page.getByRole('button', { name: 'Load this sample' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('beta feedback includes a version but excludes private access data', async ({ page }) => {
  await page.goto('/privacy.html?token=private-query#roster=private-event&t=private-token');
  await expect(page.locator('.site-beta')).toHaveText('Beta');
  await page.getByText('Report a bug', { exact: true }).click();
  const draft = page.getByRole('textbox', { name: 'Bug report' });
  await expect(draft).toBeVisible();
  const content = await draft.inputValue();
  expect(content).toMatch(/Simulator version: [a-f0-9]{12}/);
  expect(content).not.toContain('private-');
  await draft.fill(content + '\nThe page stopped responding.');
  const destination = await page.getByRole('link', { name: 'Continue to GitHub' }).getAttribute('href');
  const issue = new URL(destination!);
  expect(issue.origin + issue.pathname).toBe('https://github.com/Goldpip3/wow-forever-tools/issues/new');
  expect(issue.searchParams.get('body')).toContain('The page stopped responding.');
  expect(issue.searchParams.get('body')).not.toContain('private-');
  await expect(page.getByText('Discord and real event rosters', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

/* ------------------------------------------------------------------ the guild page */

/** A character the mocked API hands back. */
function member(over: Record<string, unknown> = {}) {
  return {
    id: 1,
    userId: 'u1',
    displayName: 'Ava',
    name: 'Thrallsbane',
    realm: 'Nightslayer',
    classKey: 'warrior',
    specKey: 'prot_war',
    roleKey: 'tank',
    level: 60,
    isMain: true,
    professions: [{ key: 'mining', skill: 300 }],
    note: '',
    updatedBy: 'u1',
    updatedAt: 1_790_000_000,
    hasGear: false,
    ...over,
  };
}

test('the guild sample runs with no account and no network', async ({ page }) => {
  await page.goto('/guild.html#demo');
  await expect(page.getByText('Sample guild. Nobody here is real, and nothing is saved.')).toBeVisible();

  // Searching narrows to the one character, by a profession rather than a name.
  const search = page.getByRole('searchbox', { name: 'Search characters' });
  // Tailoring rather than Enchanting: the sample deliberately has no enchanter,
  // so the leader's panel has a gap to point at.
  await search.fill('tailoring');
  await expect(page.locator('.grow')).toHaveCount(1);
  await expect(page.locator('.grow')).toContainText('Brightwell');

  await search.fill('thrall');
  await page.locator('.grow').first().click();

  // The sheet draws every slot, including the empty ones, which is the thing a raid
  // leader is looking for.
  await expect(page.getByText('13 of 17 slots')).toBeVisible();
  await expect(page.locator('.gcell')).toHaveCount(17);
  await expect(page.locator('.gcell--empty')).toHaveCount(4);
  await expect(page.getByText('Sulfuras, Hand of Ragnaros')).toBeVisible();

  // Forever has no armory and no logs, and the page says so rather than linking nowhere.
  await expect(page.getByText(/Blizzard has not published a character API for Forever/)).toBeVisible();

  // The address bar keeps the open character, so the link survives a reload.
  await expect(page).toHaveURL(/#demo&c=1/);
  await page.reload();
  await expect(page.getByText('13 of 17 slots')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

test('a signed-out visitor is asked to sign in, not shown an empty guild', async ({ page }) => {
  // The harness answers /api/v4/me with a 401, which is the signed-out answer. A
  // bot that cannot be reached at all is a different state and draws differently.
  await page.goto('/guild.html');
  await expect(page.getByRole('button', { name: 'Sign in with Discord' })).toBeVisible();
  await expect(page.locator('.grow')).toHaveCount(0);
});

test('a bot that cannot be reached does not read as being signed out', async ({ page, context }) => {
  // Overrides the harness answer: this request fails rather than answering 401.
  await context.route(API + '/api/v4/me', (route) => route.abort());

  await page.goto('/guild.html');
  await expect(page.getByText('Could not reach the bot')).toBeVisible();
  // Offering a sign-in button here sends somebody to fix the one thing that is
  // not broken.
  await expect(page.getByRole('button', { name: 'Sign in with Discord' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
});

test('back goes from a profile to the list it was opened from', async ({ page }) => {
  await page.goto('/guild.html#demo');

  const search = page.getByRole('searchbox', { name: 'Search characters' });
  await search.fill('thrall');
  await expect(page.locator('.grow')).toHaveCount(1);

  await page.locator('.grow').first().click();
  await expect(page).toHaveURL(/#demo&c=1/);
  await expect(page.locator('.gid__name')).toHaveText('Thrallsbane');

  // Back used to leave the site from here, because opening a profile replaced the
  // history entry rather than pushing one.
  await page.goBack();
  await expect(page).toHaveURL(/#demo$/);
  await expect(page.locator('.grow')).toHaveCount(1);
  // The search the reader came from is still in the box.
  await expect(search).toHaveValue('thrall');
});

test('a half-filled form is not thrown away without asking', async ({ page }) => {
  await page.goto('/guild.html#demo');
  await page.getByRole('button', { name: 'Add a character' }).click();
  await page.getByRole('textbox', { name: 'Character name' }).fill('Thrallsbane');

  // Dismissed, which is the same as saying no.
  page.once('dialog', (dialog) => {
    expect(dialog.message()).toContain(String.fromCharCode(110, 111, 116, 32, 115, 97, 118, 101, 100));
    void dialog.dismiss();
  });
  await page.getByRole('button', { name: 'Cancel' }).click();

  // Still open, and still holding what was typed.
  await expect(page.getByRole('textbox', { name: 'Character name' })).toHaveValue('Thrallsbane');

  // Accepted this time, and the form goes.
  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.locator('.gform')).toHaveCount(0);
});

test('a pasted export sends the gear without the bags or the bank', async ({ page, context }) => {
  const sent: Array<Record<string, unknown>> = [];
  let hasGear = false;

  await context.route(API + '/api/v4/me', (route) =>
    route.fulfill({ json: { user: { id: 'u1', username: 'Ava' }, guilds: [{ id: '900000000000000001', name: 'Nightfall', role: 'manager', canCreate: true, canEditAny: true }] } }),
  );

  await context.route(API + '/api/v4/guilds/**', async (route) => {
    const request = route.request();
    const url = request.url();

    if (request.method() === 'PUT' && url.endsWith('/gear')) {
      sent.push(request.postDataJSON() as Record<string, unknown>);
      hasGear = true;
      return route.fulfill({ json: { gear: null } });
    }
    if (request.method() === 'PUT') {
      return route.fulfill({ json: { character: member({ hasGear }) } });
    }
    if (url.endsWith('/characters/1')) {
      return route.fulfill({ json: {
        character: member({ hasGear }),
        gear: hasGear
          ? { addonVersion: '1.2.0', generatedAt: 1_790_000_000, race: 'Orc', level: 60, stats: {}, equipped: { head: { id: 12640, name: 'Lionheart Helm', equipLoc: 'INVTYPE_HEAD', quality: 4, stats: {}, location: { where: 'equipped' } } }, talents: [] }
          : null,
        attendance: { events: 0, present: 0, late: 0, absent: 0, last: null },
        permissions: { canEdit: true },
      } });
    }
    return route.fulfill({ json: {
      guild: { id: '900000000000000001', name: 'Nightfall' },
      you: { userId: 'u1', isOfficer: true },
      characters: [member({ hasGear })],
    } });
  });

  await page.goto('/guild.html#guild=900000000000000001&c=1');
  await expect(page.getByText('No gear pasted')).toBeVisible();

  const paste = page.getByRole('textbox', { name: 'Addon export' });
  await paste.fill('WFSYNC1' + JSON.stringify({
    v: 2, addonVersion: '1.2.0', generatedAt: 1_790_000_000,
    name: 'Thrallsbane', realm: 'Nightslayer', classId: 'warrior', level: 60, race: 'Orc',
    talents: [{ tab: 'Arms', points: 31, list: [] }],
    stats: { strength: 200 }, skills: { Swords: 300 },
    professions: [{ key: 'mining', skill: 300 }],
    equipped: { head: { id: 12640, name: 'Lionheart Helm', equipLoc: 'INVTYPE_HEAD', quality: 4, stats: { strength: 18 }, location: { where: 'equipped' } } },
    bags: [{ id: 999, name: 'A Secret In A Bag', equipLoc: 'INVTYPE_HEAD', quality: 1, stats: {}, location: { where: 'bag' } }],
    bank: [{ id: 998, name: 'A Secret In The Bank', equipLoc: 'INVTYPE_HEAD', quality: 1, stats: {}, location: { where: 'bank' } }],
  }));
  await page.getByRole('button', { name: 'Show my gear' }).click();

  await expect.poll(() => sent.length).toBe(1);
  const payload = JSON.stringify(sent[0]);
  expect(payload).toContain('Lionheart Helm');
  expect(payload).not.toContain('A Secret In A Bag');
  expect(payload).not.toContain('A Secret In The Bank');
  expect(Object.keys(sent[0])).not.toContain('bags');
  expect(Object.keys(sent[0])).not.toContain('bank');

  await expect(page.getByText('1 of 17 slots')).toBeVisible();
});

test('a paste that is not an export says what to do about it', async ({ page, context }) => {
  await context.route(API + '/api/v4/me', (route) =>
    route.fulfill({ json: { user: { id: 'u1', username: 'Ava' }, guilds: [{ id: '900000000000000001', name: 'Nightfall', role: 'member', canCreate: false, canEditAny: false }] } }),
  );
  await context.route(API + '/api/v4/guilds/**', (route) => {
    if (route.request().url().endsWith('/characters/1')) {
      return route.fulfill({ json: {
        character: member(), gear: null,
        attendance: { events: 0, present: 0, late: 0, absent: 0, last: null },
        permissions: { canEdit: true },
      } });
    }
    return route.fulfill({ json: {
      guild: { id: '900000000000000001', name: 'Nightfall' },
      you: { userId: 'u1', isOfficer: false },
      characters: [member()],
    } });
  });

  await page.goto('/guild.html#guild=900000000000000001&c=1');
  await page.getByRole('textbox', { name: 'Addon export' }).fill('just some words');
  await page.getByRole('button', { name: 'Show my gear' }).click();
  await expect(page.getByRole('alert')).toContainText('WFSYNC1');
});

test('the character form previews what it is describing, and its fields are legible', async ({ page }) => {
  await page.goto('/guild.html#demo');
  await page.getByRole('button', { name: 'Add a character' }).click();

  // Nothing typed yet, so the preview says what it is waiting for.
  await expect(page.locator('.gpreview__name')).toHaveText('Your character');

  await page.getByRole('textbox', { name: 'Character name' }).fill('Thrallsbane');
  // By what the select contains, not by position: an officer also gets an owner
  // picker ahead of these, and this form is shown to one.
  await page.locator('select').filter({ has: page.locator('option[value="druid"]') }).selectOption('druid');
  await page.locator('select').filter({ has: page.locator('option[value="guardian"]') }).selectOption('guardian');

  // The preview follows the fields, and the bear is read as a tank.
  await expect(page.locator('.gpreview__name')).toHaveText('Thrallsbane');
  await expect(page.locator('.gpreview__meta')).toContainText('Feral Combat (bear) Druid');
  await expect(page.locator('.gpreview__meta')).toContainText('Tank');

  // A profession is a chip that toggles, and the skill row arrives with it.
  const mining = page.locator('.gchip').filter({ hasText: 'Mining' });
  await expect(mining).not.toHaveClass(/gchip--on/);
  await expect(mining.locator('.gnum')).toHaveCount(0);
  await mining.locator('.gchip__tick').check();
  await expect(mining).toHaveClass(/gchip--on/);
  await expect(mining.locator('.gnum')).toHaveCount(1);

  // Nudged, jumped to the top of the range, and typed into: one value behind
  // all three, and the slider follows it.
  const skill = mining.getByRole('textbox', { name: 'Mining skill' });
  // From an empty field a nudge lands on the bottom of the range, not on the
  // step: five is not the smallest a skill can be.
  await mining.getByRole('button', { name: 'Up 5' }).click();
  await expect(skill).toHaveValue('1');
  await mining.getByRole('button', { name: 'Up 5' }).click();
  await expect(skill).toHaveValue('6');
  await mining.getByRole('button', { name: 'Max' }).click();
  await expect(skill).toHaveValue('300');
  await expect(mining.locator('.gnum__slider')).toHaveValue('300');
  await skill.fill('285');
  await expect(mining.locator('.gnum__slider')).toHaveValue('285');

  // Unticking it takes the row and the number with it, because keeping the
  // number would put it back the moment the chip was ticked again.
  await mining.locator('.gchip__tick').uncheck();
  await expect(mining.locator('.gnum')).toHaveCount(0);
  await mining.locator('.gchip__tick').check();
  await expect(mining.getByRole('textbox', { name: 'Mining skill' })).toHaveValue('');

  // The level is the same control, against the level cap.
  const level = page.getByRole('textbox', { name: 'Level' });
  const levelField = page.locator('.gfield').filter({ has: level });
  await levelField.getByRole('button', { name: 'Max' }).click();
  await expect(level).toHaveValue('60');
  await expect(page.locator('.gpreview__meta')).toContainText('Level 60');
  await levelField.getByRole('button', { name: 'Down 1' }).click();
  await expect(level).toHaveValue('59');
  // Letters are not a level, and the field does not hold them.
  await level.fill('abc');
  await expect(level).toHaveValue('');

  // Every field was the browser's white box on black text before this; a dark
  // field on a dark panel is the whole point of the change.
  const field = page.getByRole('textbox', { name: 'Character name' });
  const paint = await field.evaluate((el) => {
    const c = getComputedStyle(el);
    return { bg: c.backgroundColor, color: c.color };
  });
  expect(paint.bg).not.toBe('rgb(255, 255, 255)');
  expect(paint.color).not.toBe('rgb(0, 0, 0)');

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});
