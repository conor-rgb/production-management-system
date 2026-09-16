// Creates and drops an isolated PostgreSQL schema. Google requests are mocked;
// no live Drive files or application records are touched.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
require('../../backend/node_modules/dotenv').config({ path: path.resolve(__dirname, '../../backend/.env') });
const { Client } = require('../../backend/node_modules/pg');
const schema = `hub_test_${Date.now()}`;
const original = process.env.DATABASE_URL;
if (!original) throw new Error('DATABASE_URL is required for the isolated test schema.');
const url = new URL(original); url.searchParams.set('schema', schema);
process.env.DATABASE_URL = url.toString();
process.env.EMAIL_ENCRYPTION_KEY = '12345678901234567890123456789012';
// Keep the fallback case explicit even if an imported service reloads dotenv.
process.env.GOOGLE_DRIVE_REDIRECT_URI = "";
process.env.GOOGLE_REDIRECT_URI = 'https://example.test/api/email/oauth/google/callback';
process.env.GOOGLE_CLIENT_ID = 'test-client'; process.env.GOOGLE_CLIENT_SECRET = 'test-secret';
const adminUrl = new URL(original); adminUrl.search = '';
const admin = new Client({ connectionString: adminUrl.toString() });
let prisma, server, temp;
const originalFetch = global.fetch;
(async () => {
  await admin.connect(); await admin.query(`CREATE SCHEMA "${schema}"`);
  execFileSync(process.execPath, [path.resolve(__dirname, '../../backend/node_modules/prisma/build/index.js'), 'db', 'push', '--schema', path.resolve(__dirname, '../../backend/prisma/schema.prisma'), '--skip-generate'], { env: process.env, stdio: 'pipe' });
  // Exercise the actual additive migration against the prior table shape, in this schema only.
  await admin.query('BEGIN');
  await admin.query(`SET LOCAL search_path TO "${schema}"`);
  await admin.query('ALTER TABLE "pms_productions" DROP COLUMN "driveFolderId", DROP COLUMN "driveFolderName"');
  await admin.query('ALTER TABLE "pms_job_files" DROP COLUMN "driveFileId", DROP COLUMN "driveWebViewLink", DROP COLUMN "driveSyncStatus", DROP COLUMN "driveSyncError", DROP COLUMN "driveSyncedAt", DROP COLUMN "driveLeaseUntil"');
  await admin.query('DROP TABLE "pms_drive_connection"');
  await admin.query(await fs.readFile(path.resolve(__dirname, '../../backend/prisma/migrations/20260916130000_project_drive_storage/migration.sql'), 'utf8'));
  await admin.query('COMMIT');
  prisma = require('../../backend/dist/prisma').default;
  const { encrypt } = require('../../backend/dist/services/encryptionService');
  const { DriveClient, driveId, DEFAULT_PROJECTS_ROOT: root } = require('../../backend/dist/services/driveClient');
  const { processDriveQueue } = require('../../backend/dist/services/driveStorage');
  const { autoFileDocument } = require('../../backend/dist/services/fileStorage');
  assert.equal(driveId(`https://drive.google.com/open?id=${root}`), root);
  assert.throws(() => driveId('https://evil.test/folders/1234567890'));
  assert.throws(() => driveId("abc' or trashed = false"));
  let uploads = 0, loseResponse = true, denyTokens = false;
  const items = new Map([
    [root, { id: root, name: '_PROJECTS', mimeType: 'application/vnd.google-apps.folder', capabilities: { canAddChildren: true } }],
    ['project_folder', { id: 'project_folder', name: 'Test project', mimeType: 'application/vnd.google-apps.folder', parents: [root], capabilities: { canAddChildren: true } }],
    ['outside_folder', { id: 'outside_folder', name: 'Outside', mimeType: 'application/vnd.google-apps.folder', parents: [], capabilities: { canAddChildren: true } }],
  ]);
  const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
  global.fetch = async (input, init = {}) => {
    const u = new URL(String(input));
    if (u.hostname === '127.0.0.1') return originalFetch(input, init);
    if (u.hostname === 'oauth2.googleapis.com') {
      if (init.body.get('grant_type') === 'authorization_code') {
        assert.equal(init.body.get('redirect_uri'), process.env.GOOGLE_REDIRECT_URI);
        return json({ access_token: 'test-access', refresh_token: 'drive-only-refresh', scope: 'https://www.googleapis.com/auth/drive' });
      }
      return denyTokens ? json({}, 401) : json({ access_token: 'test-access' });
    }
    assert.equal(u.hostname, 'www.googleapis.com');
    if (u.pathname.endsWith('/generateIds')) return json({ ids: ['reserved_file_id'] });
    if (u.searchParams.get('alt') === 'media') return new Response('%PDF-from-drive', { headers: { 'Content-Type': 'application/pdf' } });
    const id = u.pathname.match(/\/files\/([^/]+)$/)?.[1];
    if (id) return items.has(id) ? json(items.get(id)) : json({}, 404);
    if (!init.method || init.method === 'GET') {
      const q = u.searchParams.get('q') || '';
      const parent = q.match(/^'([^']+)' in parents/)?.[1];
      const name = q.match(/and name = '([^']+)'/)?.[1];
      return json({ files: [...items.values()].filter(f => parent && f.parents?.includes(parent) && (!name || f.name === name)) });
    }
    if (u.pathname.startsWith('/upload/')) {
      uploads++;
      const text = Buffer.from(init.body).toString();
      const meta = JSON.parse(text.split('\r\n\r\n')[1].split('\r\n')[0]);
      items.set(meta.id, { ...meta, mimeType: 'application/pdf', webViewLink: 'https://drive.google.com/file/d/reserved_file_id/view' });
      if (loseResponse) { loseResponse = false; throw new Error('Simulated lost upload response'); }
      return json(items.get(meta.id));
    }
    const meta = JSON.parse(init.body);
    const item = { ...meta, id: `folder_${items.size}` }; items.set(item.id, item); return json(item);
  };
  temp = await fs.mkdtemp(path.join(os.tmpdir(), 'hub-drive-test-'));
  const project = await prisma.production.create({ data: { title: 'Test job', jobCode: 'TEST', storagePath: temp, driveFolderId: 'project_folder' } });
  await prisma.driveConnection.create({ data: { id: 'workspace', refreshToken: encrypt('test-refresh'), rootFolderId: root } });
  const file = await autoFileDocument(project.id, 'Estimates', Buffer.from('%PDF-test'), 'Estimate V1.pdf', 'application/pdf');
  assert.equal(file.driveSyncStatus, 'PENDING');
  await processDriveQueue();
  let saved = await prisma.jobFile.findUniqueOrThrow({ where: { id: file.id } });
  assert.equal(saved.driveSyncStatus, 'ERROR'); assert.equal(saved.driveFileId, 'reserved_file_id');
  await prisma.jobFile.update({ where: { id: file.id }, data: { driveSyncStatus: 'PENDING' } });
  await processDriveQueue();
  saved = await prisma.jobFile.findUniqueOrThrow({ where: { id: file.id } });
  assert.equal(saved.driveSyncStatus, 'SYNCED'); assert.equal(uploads, 1, 'Retry must recover the same Drive file after a lost response');
  assert.ok(saved.driveWebViewLink); assert.equal(await fs.readFile(path.join(temp, 'Estimates', saved.storedFilename), 'utf8'), '%PDF-test');
  await assert.rejects(() => new DriveClient('test').withinRoot('outside_folder', root), /inside/);
  denyTokens = true;
  await prisma.jobFile.update({ where: { id: file.id }, data: { driveSyncStatus: 'PENDING' } });
  await processDriveQueue();
  assert.equal((await prisma.jobFile.findUniqueOrThrow({ where: { id: file.id } })).driveSyncStatus, 'ERROR');
  denyTokens = false;
  const express = require('../../backend/node_modules/express');
  const app = express(); app.use(express.json());
  const testSession = { userId: 'test', cookie: { sameSite: 'strict' }, save: cb => cb() };
  app.use((req, _res, next) => { req.session = testSession; next(); });
  let gmailCalls = 0;
  app.get('/api/email/oauth/google/callback', require('../../backend/dist/routes/drive').googleCallbackWithDrive((_req, res) => { gmailCalls++; res.send('gmail'); }));
  app.use('/api/drive', require('../../backend/dist/routes/drive').default);
  app.use('/api/productions', require('../../backend/dist/routes/productions').default);
  app.use('/api/files', require('../../backend/dist/routes/files').default);
  server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let response = await originalFetch(`${base}/api/productions/summary`); assert.equal(response.status, 200);
  const summary = await response.json(); assert.equal(summary.length, 1); assert.equal(summary[0].crewCount, 0);
  assert.ok(!('emailThreads' in summary[0])); assert.ok(!('jobFiles' in summary[0])); assert.ok(JSON.stringify(summary).length < 3000);
  response = await originalFetch(`${base}/api/drive/projects/${project.id}/link`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ folderId: 'outside_folder' }) }); assert.equal(response.status, 400);
  const newProject = await prisma.production.create({ data: { title: 'New shoot', jobCode: 'TEST2' } });
  response = await originalFetch(`${base}/api/drive/projects/${newProject.id}/create-folder`, { method: 'POST' }); assert.equal(response.status, 200);
  const folderId = (await response.json()).driveFolderId;
  const folderCount = items.size;
  response = await originalFetch(`${base}/api/drive/projects/${newProject.id}/create-folder`, { method: 'POST' }); assert.equal(response.status, 200); assert.equal((await response.json()).driveFolderId, folderId); assert.equal(items.size, folderCount);
  response = await originalFetch(`${base}/api/drive/oauth/callback?state=wrong&code=test`); assert.equal(response.status, 400);
  response = await originalFetch(`${base}/api/files/${file.id}`, { method: 'DELETE' }); assert.equal(response.status, 409);
  await prisma.jobFile.update({ where: { id: file.id }, data: { driveSyncStatus: 'SYNCED' } });
  response = await originalFetch(`${base}/api/files/${file.id}/download`); assert.equal(response.status, 200); assert.equal(await response.text(), '%PDF-from-drive');
  await prisma.jobFile.update({ where: { id: file.id }, data: { driveSyncStatus: 'ERROR' } });
  response = await originalFetch(`${base}/api/drive/projects/${project.id}/publish`, { method: 'POST' }); assert.equal(response.status, 200); assert.equal((await response.json()).queued, 1);
  const shared = `${base}/api/email/oauth/google/callback`;
  const emailCount = await prisma.emailAccount.count();
  response = await originalFetch(`${base}/api/drive/oauth/start`, { redirect: 'manual' });
  assert.equal(response.status, 302);
  assert.equal(testSession.cookie.sameSite, 'lax', 'Upgrade existing Strict sessions before Google redirect');
  const authUrl = new URL(response.headers.get('location'));
  assert.equal(authUrl.searchParams.get('redirect_uri'), process.env.GOOGLE_REDIRECT_URI);
  const state = authUrl.searchParams.get('state'); assert.match(state, /^drive\.[a-f0-9]{64}$/);
  response = await originalFetch(`${shared}?state=${state}&code=test`, { redirect: 'manual' });
  assert.equal(response.status, 302); assert.equal(gmailCalls, 0);
  assert.equal(await prisma.emailAccount.count(), emailCount);
  assert.equal(testSession.driveOAuth, undefined);
  response = await originalFetch(`${shared}?state=${state}&code=test`); assert.equal(response.status, 400);
  testSession.driveOAuth = { state, expiresAt: Date.now() - 1000 };
  response = await originalFetch(`${shared}?state=${state}&code=test`); assert.equal(response.status, 400);
  testSession.driveOAuth = { state, expiresAt: Date.now() + 60_000 };
  response = await originalFetch(`${shared}?state=wrong&code=test`); assert.equal(response.status, 400);
  response = await originalFetch(`${shared}?state=${state}&state=other&code=test`); assert.equal(response.status, 400);
  delete testSession.userId;
  response = await originalFetch(`${shared}?state=${state}&code=test`); assert.equal(response.status, 401);
  testSession.userId = 'test';
  response = await originalFetch(`${shared}?code=gmail-test`); assert.equal(response.status, 200); assert.equal(gmailCalls, 1);
  console.log('PASS: shared callback success, same URI for exchange, no Gmail account writes, expired/wrong/replayed/duplicate state rejected, login required, Gmail dispatch retained.');
  console.log('PASS: isolated DB, atomic queue, lost-response recovery without duplicate upload, retained source, root boundary, revoked access, summary payload, OAuth state rejection, published-file protection, explicit retry.');
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(async () => {
  global.fetch = originalFetch;
  if (server) await new Promise(resolve => server.close(resolve));
  if (prisma) await prisma.$disconnect();
  if (temp) await fs.rm(temp, { recursive: true, force: true });
  await admin.query('ROLLBACK').catch(() => {});
  await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(() => {});
  await admin.end();
});
