import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const promptPath = join(root, 'dist', 'agent-onboarding.txt');

test('AI onboarding prompt is complete and self-contained', () => {
  const prompt = readFileSync(promptPath, 'utf8');
  assert.ok(prompt.length > 3000, `prompt too short: ${prompt.length}`);
  for (const required of [
    'mcp\\server.mjs',
    'mcp\\cli.mjs',
    'WUJIAN_ALLOW_WRITES',
    'WUJIAN_ALLOW_TRADING',
    'WUJIAN_ALLOW_EXPENSIVE',
    'wujian_health',
    'wujian_brief',
    'claude_desktop_config.json',
    'cordis.patch.yml',
    'insert:',
    '--selftest'
  ]) assert.ok(prompt.includes(required), `missing ${required}`);
});

test('workbench exposes the copy button and copies the static prompt', () => {
  const html = readFileSync(join(root, 'dist', 'market-panorama.html'), 'utf8');
  assert.ok(html.includes('id="agentSetupButton"'));
  assert.ok(html.includes('复制接入提示词'));
  const js = readFileSync(join(root, 'dist', 'unified-workbench.js'), 'utf8');
  assert.ok(js.includes('copyAgentOnboarding'));
  assert.ok(js.includes('/agent-onboarding.txt'));
  assert.ok(js.includes("document.querySelector('#agentSetupButton')"));
});

test('CLI onboarding prints the same prompt', () => {
  const result = spawnSync(process.execPath, [join(root, 'mcp', 'cli.mjs'), 'onboarding'], {cwd: root, encoding: 'utf8', timeout: 60_000, windowsHide: true});
  assert.equal(result.status, 0, result.stderr);
  const expected = readFileSync(promptPath, 'utf8');
  assert.equal(result.stdout.trim(), expected.trim());
});
