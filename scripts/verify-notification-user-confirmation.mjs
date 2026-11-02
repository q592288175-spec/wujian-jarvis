import assert from 'node:assert/strict';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {databaseManifest} from './system-backup.mjs';

// Read-only acceptance check: this script never sends another notification.
const base = 'http://127.0.0.1:4318';
const oldId = '82e9297d-b46e-4295-a4ad-489c76713751';
const newId = 'a73b2ef7-995b-474d-b6bd-658ac034a7dc';
const get = async path => {
  const response = await fetch(base + path);
  assert.ok(response.ok, path);
  return response.json();
};
const oldEvent = await get('/api/monitor/events/' + oldId);
const newEvent = await get('/api/monitor/events/' + newId);
const status = await get('/api/monitor/status');
assert.ok(oldEvent.deliveries.every(item => item.receipt?.received === false));
assert.deepEqual(newEvent.channels, ['desktop']);
assert.equal(newEvent.deliveries[0].status, 'accepted');
assert.equal(newEvent.deliveries[0].receipt?.received, true);
assert.equal(status.desktop.lastDelivery.receipt?.received, true);
assert.equal(status.phone.lastDelivery.receipt?.received, false);
const baseline = JSON.parse(await readFile(resolve('output/final-release/verification.json'), 'utf8'));
const current = databaseManifest(resolve('.runtime/five-workbench.sqlite'));
assert.equal(current.integrity, 'ok');
const business = baseline.business.map(item => {
  assert.deepEqual(current.tables[item.table], item.after, item.table);
  return {table: item.table, unchanged: true, ...current.tables[item.table]};
});
const rules = [];
for (const item of baseline.rules) {
  const hash = createHash('sha256').update(await readFile(resolve(item.path))).digest('hex');
  assert.equal(hash, item.sha256, item.path);
  rules.push({path: item.path, unchanged: true, sha256: hash});
}
const result = {
  checkedAt: new Date(Date.now() + 28800000).toISOString().replace('Z', '+08:00'),
  oldEvent: {id: oldId, deliveries: oldEvent.deliveries},
  newEvent: {id: newId, deliveries: newEvent.deliveries},
  userConfirmedDesktopBanner: true, phoneConfirmedReceived: false,
  sentNotifications: 0, business, rules, passed: true,
};
const out = resolve('output/notification-receipt-2026-10-16');
await mkdir(out, {recursive: true});
await writeFile(resolve(out, 'user-confirmation.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify({passed: true, userConfirmedDesktopBanner: true, phoneConfirmedReceived: false, businessTablesUnchanged: business.length, ruleFilesUnchanged: rules.length, sentNotifications: 0}));
