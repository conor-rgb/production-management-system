// Run with the frontend dev server on port 5175. All APIs are fixtures;
// this test never writes production data.
const { chromium } = require('../../backend/node_modules/playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const project = { id: 'p1', title: 'Hair Lab', jobCode: '2657', clientName: 'Yves Rocher', status: 'PRE_PRO', dates: [], crewMembers: [], emailThreads: [], quotedValue: 0, actualSpend: 0, variance: 0, variancePercent: 0, freeAgentInvoiceStatus: 'NOT_RAISED' };
  let rows = ['Reply to Jeanne', 'Review Camille response'].map((title, i) => ({ id: `a${i}`, productionId: 'p1', production: project, title, status: i ? 'WAITING' : 'BLOCKED', actionType: 'TASK', updatedAt: '2026-09-16T10:00:00Z', createdAt: '2026-09-16T10:00:00Z' }));
  let failNext = false;
  await page.route('**/api/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    let body = {};
    if (path === '/api/auth/me') body = { email: 'conor@example.test' };
    else if (path === '/api/productions/summary') body = [project];
    else if (path === '/api/productions/p1') body = project;
    else if (path === '/api/project-actions') body = rows;
    else if (path.startsWith('/api/project-actions/actions/') && request.method() === 'PATCH') {
      if (failNext) { failNext = false; return route.fulfill({ status: 500, json: { error: 'Test failure' } }); }
      const id = path.split('/').pop();
      const patch = request.postDataJSON();
      rows = rows.map(r => r.id === id ? { ...r, ...patch } : r);
      body = rows.find(r => r.id === id);
    } else if (path.endsWith('/p1/actions') && request.method() === 'POST') {
      body = { ...request.postDataJSON(), id: 'new-action', productionId: 'p1', production: project, updatedAt: '2026-09-16T10:00:00Z' }; rows.push(body);
    } else if (path === '/api/email/drafts') body = [];
    else if (path === '/api/email/unread-count') body = { count: 0 };
    await route.fulfill({ json: body });
  });
  try {
    await page.goto('http://127.0.0.1:5175');
    await page.getByRole('heading', { name: /Good/ }).waitFor();
    await page.getByRole('link', { name: 'Hair Lab', exact: true }).waitFor();
    await page.screenshot({ path: '/tmp/unlimited-home.png', fullPage: true });
    await page.getByRole('link', { name: 'All actions' }).click();
    const title = page.getByRole('textbox', { name: 'Title for Reply to Jeanne' });
    await title.fill('Send product details'); await title.press('Enter');
    await page.getByRole('textbox', { name: 'Title for Send product details' }).waitFor();
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await title.waitFor();
    await page.waitForFunction(() => !document.querySelector('input[aria-label="Title for Reply to Jeanne"]').disabled);
    failNext = true;
    await title.fill('Should fail'); await title.press('Enter');
    await page.getByRole('alert').filter({ hasText: 'could not be saved' }).waitFor();
    assert.equal(await title.inputValue(), 'Reply to Jeanne');
    await page.getByRole('checkbox', { name: 'Select visible actions' }).check();
    await page.getByRole('combobox', { name: 'Bulk update status' }).selectOption('IN_PROGRESS');
    await page.waitForFunction(() => [...document.querySelectorAll('select[aria-label^="Status for"]')].every(el => el.value === 'IN_PROGRESS' && !el.disabled));
    await title.evaluate(el => { const data = new DataTransfer(); data.setData('text/plain', 'First chase\nSecond chase'); el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true })); });
    await page.getByRole('textbox', { name: 'Title for Second chase' }).waitFor({ timeout: 10000 }).catch(async e => { console.log('Paste state:', rows, await page.locator('body').innerText()); throw e; });
    await page.getByRole('button', { name: 'Details', exact: true }).first().click();
    await page.getByLabel('Notes', { exact: true }).fill('Waiting for product specifications.');
    await page.getByRole('button', { name: 'Save notes' }).click();
    await page.getByRole('button', { name: 'Save notes' }).waitFor();
    await page.keyboard.press('Escape');
    await page.getByRole('textbox', { name: 'New action title' }).fill('Approve treatment');
    await page.getByRole('combobox', { name: 'Project for new action' }).selectOption('p1');
    await page.getByRole('button', { name: 'Add action', exact: true }).click();
    await page.getByRole('textbox', { name: 'Title for Approve treatment' }).waitFor();
    await page.reload();
    await page.getByRole('textbox', { name: 'Title for Approve treatment' }).waitFor();
    await page.keyboard.press('Control+k');
    const search = page.getByRole('textbox', { name: 'Search projects and navigation' }).filter({ visible: true });
    await search.fill('Hair Lab'); await search.press('Enter');
    await page.getByRole('heading', { name: 'Hair Lab', exact: true }).last().waitFor();
    await page.getByRole('heading', { name: 'Next up', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Actions', exact: true }).click();
    await page.getByRole('textbox', { name: 'Title for First chase' }).waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.keyboard.press('Control+k');
    assert.equal(await page.locator('dialog[open]').count(), 1);
    await page.keyboard.press('Escape');
    await page.screenshot({ path: '/tmp/unlimited-mobile.png', fullPage: true });
    assert.deepEqual(errors, []);
    console.log('PASS: home, inline save, undo, rollback, bulk status, multi-row paste, notes, creation, reload, project navigation, and mobile command menu.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
