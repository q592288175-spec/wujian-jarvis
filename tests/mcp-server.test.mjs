import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn, spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const node = process.execPath;
const server = join(root, 'mcp', 'server.mjs');
const cli = join(root, 'mcp', 'cli.mjs');

function run(args, env = {}) {
  return spawnSync(node, args, {cwd: root, encoding: 'utf8', timeout: 120_000, env: {...process.env, ...env}, windowsHide: true});
}

test('MCP selftest completes initialize/tools/resources', () => {
  const result = run([server, '--selftest']);
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, true);
  assert.equal(report.server.name, 'wujian-mcp');
  assert.ok(report.tools >= 30);
  assert.ok(report.checks.some(item => item.step === 'initialize' && item.ok));
  assert.ok(report.checks.some(item => item.step === 'resources/read wujian://brief' && item.ok));
});

test('write/trading/expensive tools are hidden by default and appear with switches', () => {
  const base = JSON.parse(run([server, '--selftest']).stdout);
  const writable = JSON.parse(run([server, '--selftest'], {WUJIAN_ALLOW_WRITES: '1'}).stdout);
  const trading = JSON.parse(run([server, '--selftest'], {WUJIAN_ALLOW_WRITES: '1', WUJIAN_ALLOW_TRADING: '1'}).stdout);
  const expensive = JSON.parse(run([server, '--selftest'], {WUJIAN_ALLOW_EXPENSIVE: '1'}).stdout);
  assert.equal(base.permissions.writes, false);
  assert.equal(writable.tools, base.tools + 2);
  assert.equal(trading.tools, writable.tools + 1);
  assert.equal(expensive.tools, base.tools + 4);
});

test('CLI health and catalog use the same tool layer', () => {
  const health = run([cli, 'health', '--json']);
  assert.equal(health.status, 0, health.stderr);
  const value = JSON.parse(health.stdout);
  assert.equal(value.service.app, 'wujian-jarvis');

  const catalog = run([cli, 'catalog', '--kind', 'tools', '--limit', '3', '--json']);
  assert.equal(catalog.status, 0, catalog.stderr);
  assert.ok(JSON.parse(catalog.stdout).tools.length <= 3);
});

test('HTTP transport answers initialize and tools/list', async () => {
  const port = 43000 + Math.floor(Math.random() * 500);
  const child = spawn(node, [server, '--http', '--port', String(port)], {
    cwd: root,
    stdio: ['ignore', 'ignore', 'pipe'],
    windowsHide: true
  });
  let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk; });
  try {
    const deadline = Date.now() + 15_000;
    let health;
    while (Date.now() < deadline) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/health`, {signal: AbortSignal.timeout(1000)});
        if (response.ok) { health = await response.json(); break; }
      } catch {}
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    assert.ok(health, `HTTP server did not start: ${stderr}`);
    assert.equal(health.ok, true);
    const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({jsonrpc: '2.0', id: 1, method: 'tools/list'})
    });
    const body = await response.json();
    assert.equal(body.jsonrpc, '2.0');
    assert.ok(body.result.tools.length >= 30);
    const openapi = await fetch(`http://127.0.0.1:${port}/openapi.json`);
    assert.equal(openapi.status, 200);
    assert.equal((await openapi.json()).openapi, '3.1.0');
  } finally {
    child.kill();
  }
});
