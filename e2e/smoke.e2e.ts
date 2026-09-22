import { expect, test, type BrowserContext, type Page } from '@playwright/test';

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
