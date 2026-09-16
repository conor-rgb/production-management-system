// Checks active Markdown links, the documentation inventory and preserved archive bytes.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
const archive = JSON.parse(fs.readFileSync(path.join(root, 'docs/archive/2026-09-16-before-direction-reset/manifest.json')));
for (const item of archive) assert.equal(hash(fs.readFileSync(path.join(root, item.archive))), item.sha256, `Changed historical document: ${item.original}`);
const inventory = JSON.parse(fs.readFileSync(path.join(root, 'docs/markdown-inventory.json')));
const listed = new Set(inventory.documents.map(item => item.path));
const actual = [];
function walk(dir) { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) { if (['.git', 'node_modules', 'storage', 'dist'].includes(entry.name)) continue; const file = path.join(dir, entry.name); if (entry.isDirectory()) walk(file); else if (entry.isFile() && file.endsWith('.md')) actual.push(path.relative(root, file)); } }
walk(root);
assert.deepEqual([...listed].sort(), actual.sort(), 'Markdown inventory must account for every repository-owned Markdown file');
const failures = [];
for (const item of inventory.documents) {
  const file = path.join(root, item.path); const text = fs.readFileSync(file, 'utf8');
  assert.equal(hash(Buffer.from(text)), item.sha256, `Refresh inventory hash: ${item.path}`);
  if (item.classification.startsWith('historical')) continue;
  for (const match of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    let target = match[1].split(/\s+"/)[0].replace(/^<|>$/g, '').split('#')[0];
    if (!target || /^(https?:|mailto:|app:)/.test(target)) continue;
    target = decodeURIComponent(target);
    if (!fs.existsSync(path.resolve(path.dirname(file), target))) failures.push(`${item.path} → ${target}`);
  }
}
assert.deepEqual(failures, [], 'Broken active documentation links');
console.log(`PASS: ${archive.length} preserved historical originals; ${inventory.documents.length} Markdown files classified; active local links resolve.`);
