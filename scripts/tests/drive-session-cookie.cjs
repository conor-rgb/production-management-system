// Exercises real express-session serialization for a session created before
// the SameSite policy changed; no provider requests or business data writes.
const assert = require('node:assert/strict');
const express = require('../../backend/node_modules/express');
const session = require('../../backend/node_modules/express-session');
process.env.GOOGLE_CLIENT_ID = 'test-client';
process.env.GOOGLE_CLIENT_SECRET = 'test-secret';
process.env.GOOGLE_REDIRECT_URI = 'https://example.test/api/email/oauth/google/callback';
process.env.EMAIL_ENCRYPTION_KEY = '12345678901234567890123456789012';
const { default: drive, googleCallbackWithDrive } = require('../../backend/dist/routes/drive');
const { requireAuth } = require('../../backend/dist/middleware/auth');
let server;
(async () => {
  const app = express();
  app.use(session({ secret: 'test-only-session-secret', resave: false, saveUninitialized: false, cookie: { sameSite: 'strict', httpOnly: true, maxAge: 30 * 24 * 60 * 60_000 } }));
  app.get('/fixture-login', (req, res) => { req.session.userId = 'fixture'; res.send('ok'); });
  app.use('/api/drive', requireAuth, drive);
  app.get('/callback', googleCallbackWithDrive((_req, res) => res.status(418).end()));
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let response = await fetch(base + '/fixture-login');
  const oldCookie = response.headers.get('set-cookie'); assert.match(oldCookie, /SameSite=Strict/);
  const cookie = oldCookie.split(';')[0];
  response = await fetch(base + '/api/drive/oauth/start', { headers: { Cookie: cookie }, redirect: 'manual' });
  assert.equal(response.status, 302);
  const updated = response.headers.get('set-cookie');
  assert.ok(updated, 'OAuth start must reissue the session cookie');
  assert.match(updated, /SameSite=Lax/); assert.match(updated, /HttpOnly/);
  assert.equal(updated.split(';')[0], cookie, 'Keep the existing signed session');
  const state = new URL(response.headers.get('location')).searchParams.get('state');
  response = await fetch(base + '/callback?state=' + state, { headers: { Cookie: cookie } });
  assert.equal(response.status, 400, 'Authenticated cancellation reaches state validation, not a 401');
  response = await fetch(base + '/callback?state=' + state);
  assert.equal(response.status, 401, 'Missing session must still be rejected');
  console.log('PASS: existing Strict session receives Lax HttpOnly cookie, retains authentication on callback, missing session remains rejected.');
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(async () => {
  if(server) await new Promise(resolve => server.close(resolve));
});
