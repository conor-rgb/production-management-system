const { chromium } = require('../../backend/node_modules/playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = []; const requests = [];
  page.on('pageerror', error => { errors.push(error.message); console.log('Browser error:', error.message); });
  let linked = false, queued = false, failBrowse = false, deckName = "Casting working deck";
  const project = { id: 'p1', title: 'Hair Lab', jobCode: '2657', clientName: 'Yves Rocher', status: 'PRE_PRO', crewCount: 0, quotedValue: 10000, actualSpend: 3000, variance: 7000, overBudget: false, nextDate: null, budget: { currencyBase: 'GBP', status: 'DRAFT', currentRevision: { revisionNumber: 1, status: 'DRAFT' } } };
  await page.route('**/api/**', async route => {
    const request = route.request(); const url = new URL(request.url()); const path = url.pathname; requests.push(path);
    let data = {};
    if (path === '/api/auth/me') data = { email: 'conor@example.test' };
    else if (path === '/api/productions/summary') data = [project];
    else if (path === '/api/project-finance') data = [];
    else if (path === '/api/files/all') data = { files: [], page: 1, hasMore: false, total: 0 };
    else if (path === '/api/email/drafts') data = [];
    else if (path === '/api/email/unread-count') data = { count: 0 };
    else if (path === '/api/drive/status') data = { configured: true, connected: true, rootFolderId: 'root_folder' };
    else if (path === '/api/drive/folders') data = { files: [{ id: 'hair_folder', name: '2657 | Hair Lab', mimeType: 'application/vnd.google-apps.folder' }] };
    else if (path === '/api/drive/projects/p1') data = { driveFolderId: linked ? 'hair_folder' : null, driveFolderName: linked ? '2657 | Hair Lab' : null, counts: queued ? { PENDING: 2 } : { LOCAL: 2 }, failures: [] };
    else if (path.endsWith('/link')) { assert.equal(request.postDataJSON().folderId, 'hair_folder'); linked = true; data = { driveFolderId: 'hair_folder' }; }
    else if (path.endsWith('/publish')) { queued = true; data = { queued: 2 }; }
    else if (path.endsWith('/browse')) {
      if (failBrowse) { return route.fulfill({ status: 400, json: { error: 'Google Drive denied access.' } }); }
      data = { files: url.searchParams.get('folderId') === 'hair_folder' ? [{ id: 'exports_folder', name: 'Exports', mimeType: 'application/vnd.google-apps.folder' }] : [{ id: 'pdf_file', name: 'Casting V8.pdf', mimeType: 'application/pdf', webViewLink: 'https://drive.google.com/file/d/pdf_file/view' }, { id: 'slides_file', name: deckName, mimeType: 'application/vnd.google-apps.presentation', webViewLink: 'https://docs.google.com/presentation/d/slides_file/edit' }] };
    }
    await route.fulfill({ json: data });
  });
  try {
    await page.goto('http://127.0.0.1:5175/budgets');
    await page.getByRole('heading', { name: 'Finance', exact: true }).waitFor().catch(async e => { console.log(await page.locator('body').innerText()); throw e; });
    await page.getByRole('link', { name: '2657 · Hair Lab' }).waitFor();
    assert.equal(await page.getByRole('link', { name: 'Costs', exact: true }).getAttribute('href'), '/productions?production=p1&tab=Budget');
    await page.screenshot({ path: '/tmp/unlimited-finance.png', fullPage: true });
    await page.goto('http://127.0.0.1:5175/files');
    await page.getByText('Drive connected.', { exact: false }).waitFor();
    await page.locator('select').filter({ has: page.locator('option[value="p1"]') }).selectOption('p1');
    await page.getByLabel('Link this project to its existing Drive folder').selectOption('hair_folder');
    await page.getByRole('button', { name: 'Link folder', exact: true }).click();
    await page.getByRole('button', { name: 'Browse Drive', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Publish existing files / retry' }).click();
    await page.getByText('2 files queued for Drive.', { exact: true }).waitFor();
    failBrowse = true;
    await page.getByRole('button', { name: 'Browse Drive', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'denied access' }).waitFor();
    failBrowse = false;
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await page.getByRole('button', { name: 'Exports', exact: true }).click();
    await page.getByRole('link', { name: 'Casting V8.pdf' }).waitFor();
    assert.equal(await page.getByRole('link', { name: deckName }).getAttribute('href'), 'https://docs.google.com/presentation/d/slides_file/edit');
    deckName = 'Casting deck renamed in Google';
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.getByRole('link', { name: deckName }).waitFor();
    deckName = 'Casting deck updated again';
    await page.getByRole('button', { name: 'Refresh Drive files' }).click();
    await page.getByRole('link', { name: deckName }).waitFor();
    await page.screenshot({ path: '/tmp/unlimited-drive.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: '/tmp/unlimited-drive-mobile.png', fullPage: true });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'No mobile horizontal overflow');
    assert.ok(!requests.includes('/api/productions'), 'Index screens must not fetch full projects');
    assert.deepEqual(errors, []);
    console.log('PASS: Finance links, slim requests, Drive folder selection/linking, publishing status, browse failure/retry, nested folders, document links and mobile layout.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
