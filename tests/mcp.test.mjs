import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createClient} from '../mcp/client.mjs';
import {loadConfig} from '../mcp/config.mjs';
import {accessAllowed, callTool, endpoints, matchEndpoint, tools, views, buttons, buildOpenApi} from '../mcp/catalog.mjs';
import {compact, byteLength} from '../mcp/format.mjs';

const base = 'http://127.0.0.1:4318';
const config = loadConfig({argv: [], env: {}});
const client = createClient(config);

async function online() {
  try {
    const response = await fetch(base + '/api/health', {signal: AbortSignal.timeout(10_000)});
    return response.ok;
  } catch {
    return false;
  }
}

test('catalog covers all routes and tools uniquely', () => {
  assert.ok(endpoints.length >= 150, `endpoints=${endpoints.length}`);
  assert.ok(tools.length >= 30, `tools=${tools.length}`);
  assert.ok(views.length >= 18, `views=${views.length}`);
  assert.ok(buttons.length >= 100, `buttons=${buttons.length}`);
  const keys = new Set();
  for (const endpoint of endpoints) {
    const key = endpoint.method + ' ' + endpoint.path;
    assert.ok(!keys.has(key), `duplicate endpoint ${key}`);
    keys.add(key);
  }
  const names = new Set();
  for (const tool of tools) {
    assert.ok(tool.name.startsWith('wujian_'), tool.name);
    assert.ok(!names.has(tool.name), `duplicate tool ${tool.name}`);
    names.add(tool.name);
    assert.equal(tool.inputSchema.type, 'object');
  }
  const openapi = buildOpenApi();
  assert.equal(openapi.openapi, '3.1.0');
  assert.ok(Object.keys(openapi.paths).length > 100);
});

test('permissions are read-only by default and never allow writes', () => {
  assert.equal(accessAllowed('read', config), true);
  assert.equal(accessAllowed('calc', config), true);
  assert.equal(accessAllowed('write', config), false);
  assert.equal(accessAllowed('trading', config), false);
  assert.equal(accessAllowed('expensive', config), false);
  assert.equal(accessAllowed('stream', config), false);
});

test('endpoint matching handles path parameters and query strings', () => {
  assert.equal(matchEndpoint('GET', '/api/workbench/cards/abc')?.id, 'workbench-card');
  assert.equal(matchEndpoint('GET', '/api/workbench/cards/abc?x=1')?.id, 'workbench-card');
  assert.equal(matchEndpoint('POST', '/api/workbench/cards/abc/approve')?.id, 'workbench-card-approve');
  assert.equal(matchEndpoint('DELETE', '/api/workbench/accounts/abc')?.id, 'workbench-account-delete');
});

test('generic API rejects writes by default', async t => {
  if (!(await online())) return t.skip('小木服务未启动');
  await assert.rejects(
    () => callTool('wujian_api', {method: 'POST', path: '/api/workbench/cards', body: {}}, {client, config}),
    /写入|权限|未启用/
  );
  assert.equal(accessAllowed('write', loadConfig({argv: [], env: {WUJIAN_ALLOW_WRITES: '1'}})), true);
});

test('compact keeps tool payloads small without dropping top-level bars', async t => {
  if (!(await online())) return t.skip('小木服务未启动');
  const raw = await client.get('/api/live-market');
  const reduced = compact(raw, {maxBytes: 120_000});
  assert.ok(byteLength(reduced) <= 120_000, `bytes=${byteLength(reduced)}`);
  assert.equal(reduced.quotes.length, raw.quotes.length);
  assert.equal(typeof reduced.quotes[0].bars, 'string');
  const bars = await client.get('/api/workbench/fire/bars', {query: {contract: 'AG2612'}});
  const kept = compact(bars, {maxBytes: 120_000});
  assert.ok(Array.isArray(kept.bars));
  assert.ok(kept.bars.length > 10);
});

test('tool calls return real workbench data', async t => {
  if (!(await online())) return t.skip('小木服务未启动');
  const health = await callTool('wujian_health', {}, {client, config});
  assert.equal(health.ok, true);
  assert.equal(health.service.app, 'wujian-jarvis');

  const fire = await callTool('wujian_fire_scan', {mode: 'month-week-day', filter: 'candidate', limit: 3}, {client, config});
  assert.equal(fire.mode, 'month-week-day');
  assert.ok(Array.isArray(fire.rows));
  assert.ok(fire.rows.length <= 3);
  for (const row of fire.rows) assert.ok(['多头观察', '空头观察'].includes(row.modes[fire.mode]));

  const quote = await callTool('wujian_quote', {query: '沪铜'}, {client, config});
  assert.ok(quote.matched > 0);
  assert.equal(quote.matches[0].actualContract, 'CU2612');

  const snapshot = await callTool('wujian_market_snapshot', {limit: 5}, {client, config});
  assert.ok(snapshot.quotes.length > 0);
  assert.ok(snapshot.quotes.length <= 5);
  assert.equal(snapshot.quotes[0].bars, undefined);

  const summary = await callTool('wujian_workbench_summary', {}, {client, config});
  assert.ok(summary.account);
  assert.ok(Array.isArray(summary.cards));
});

test('endpoint-ID tool resolves path parameters and keeps writes closed', async t => {
  if (!(await online())) return t.skip('小木服务未启动');
  const cards = await client.get('/api/workbench/cards');
  const card = await callTool('wujian_endpoint', {id: 'workbench-card', pathParams: {id: cards[0].id}}, {client, config});
  assert.equal(card.endpoint.id, 'workbench-card');
  assert.equal(card.data.id, cards[0].id);
  const spec = await callTool('wujian_endpoint', {id: 'workbench-contract-spec', query: {symbol: 'CU'}}, {client, config});
  assert.equal(spec.data.symbol, 'CU');
  await assert.rejects(
    () => callTool('wujian_endpoint', {id: 'workbench-card-delete', pathParams: {id: cards[0].id}}, {client, config}),
    /交易|权限|未启用/
  );
});
