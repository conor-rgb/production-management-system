const assert = require('node:assert/strict');
const { DriveClient } = require('../../backend/dist/services/driveClient');
const original = global.fetch;
(async () => {
  for (const [body, expected] of [
    [{error:{errors:[{reason:'accessNotConfigured'}]}}, /API is not enabled/],
    [{error:{details:[{reason:'SERVICE_DISABLED'}]}}, /API is not enabled/],
    [{error:{details:[{reason:'ACCESS_TOKEN_SCOPE_INSUFFICIENT'}]}}, /permission is missing/],
    [{error:{errors:[{reason:'domainPolicy'}]}}, /Workspace policy/],
    [{error:{errors:[{reason:'userRateLimitExceeded'}]}}, /quota/],
    [{error:{errors:[{reason:'insufficientFilePermissions'}], message:'PRIVATE PROVIDER DATA'}}, /connected account and folder permissions/],
    [{error:{errors:'invalid',details:{}}}, /denied access/],
  ]) {
    global.fetch = async () => new Response(JSON.stringify(body), {status:403});
    await assert.rejects(() => new DriveClient('private-test-token').folder('test-folder'), error => {
      assert.match(error.message, expected); assert.ok(!error.message.includes('PRIVATE')); return true;
    });
  }
  global.fetch = async () => new Response('non-JSON provider failure', {status:403});
  await assert.rejects(() => new DriveClient('private-test-token').folder('test-folder'), /denied access/);
  console.log('PASS: Drive 403 reasons distinguish disabled API, scopes, policy, quota and folder access without exposing provider payloads.');
})().catch(error => { console.error(error.message); process.exitCode=1; }).finally(() => {global.fetch=original;});
