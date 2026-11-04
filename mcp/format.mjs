// Output helpers shared by the MCP server and CLI.
import {writeFile, mkdir} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';

const SECRET_KEY = /^(password|passwd|secret|appsecret|app_secret|token|access_token|refresh_token|api_?key|authorization|cookie|client_secret|private_?key)$/i;

export function sanitize(value, depth = 0) {
  if (depth > 8) return '[深度截断]';
  if (Array.isArray(value)) return value.map(item => sanitize(item, depth + 1));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      if (SECRET_KEY.test(key) && typeof item === 'string' && item) out[key] = '[已隐藏]';
      else out[key] = sanitize(item, depth + 1);
    }
    return out;
  }
  return value;
}

export function byteLength(value) {
  try { return Buffer.byteLength(JSON.stringify(value), 'utf8'); } catch { return 0; }
}

/**
 * Keep tool responses usable in an LLM context. The first pass drops known
 * heavy series; the second pass truncates arrays/strings until it fits.
 */
export function compact(value, {maxBytes = 350_000, maxArray = 80} = {}) {
  const safe = sanitize(value);
  if (byteLength(safe) <= maxBytes) return safe;
  let current = safe;
  let limit = maxArray;
  for (let round = 0; round < 4 && byteLength(current) > maxBytes; round++) {
    current = walk(safe, {maxArray: limit, depth: 0});
    limit = Math.max(5, Math.floor(limit / 3));
  }
  const meta = {truncated: true, originalBytes: byteLength(safe), note: '结果过大，已裁剪数组/长字符串；需要完整原始数据请用 --out 或 wujian api --max-bytes 调大。'};
  if (Array.isArray(current)) return {items: current, _meta: meta};
  return {...current, _meta: meta};
}

function walk(value, {maxArray, depth, maxBytes}) {
  if (depth > 6) return '[深度截断]';
  if (typeof value === 'string') return value.length > 4000 ? value.slice(0, 4000) + `…[${value.length}字]` : value;
  if (Array.isArray(value)) {
    const rows = value.slice(0, maxArray).map(item => walk(item, {maxArray, depth: depth + 1, maxBytes}));
    if (value.length > maxArray) rows.push({_truncated: value.length - maxArray});
    return rows;
  }
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      // Nested chart series are the main size driver in /api/live-market.
      // Keep top-level bars (wujian_bars) and shallow arrays; drop deep series.
      if (['bars', 'closes', 'points', 'observations'].includes(key) && Array.isArray(item) && depth > 0 && item.length > 20) {
        out[key] = `[${item.length} 项图表序列，已省略；需要时用 wujian_bars / wujian_market_variety]`;
      } else out[key] = walk(item, {maxArray, depth: depth + 1, maxBytes});
    }
    return out;
  }
  return value;
}

export function pretty(value) {
  return JSON.stringify(value, null, 2);
}

export function oneLine(value) {
  return JSON.stringify(value);
}

export function truncateText(text, maxChars = 120_000) {
  const value = String(text ?? '');
  if (value.length <= maxChars) return value;
  return value.slice(0, maxChars) + `\n…（已截断，原长度 ${value.length} 字符；用 CLI --out 保存完整结果）`;
}

export function table(rows, columns = []) {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return '（无记录）';
  const cols = columns.length ? columns : inferColumns(list);
  const header = cols.map(item => typeof item === 'string' ? item : item.label || item.key);
  const body = list.map(row => cols.map(col => formatCell(typeof col === 'string' ? row?.[col] : row?.[col.key])));
  const widths = header.map((h, i) => Math.max(displayWidth(h), ...body.map(r => displayWidth(r[i]))));
  const line = values => values.map((v, i) => pad(v, widths[i])).join('  ');
  return [line(header), widths.map(w => '─'.repeat(w)).join('  '), ...body.map(line)].join('\n');
}

function inferColumns(rows) {
  const keys = [];
  for (const row of rows.slice(0, 5)) {
    if (row && typeof row === 'object') for (const key of Object.keys(row)) if (!keys.includes(key)) keys.push(key);
  }
  return keys.slice(0, 12);
}

function formatCell(value) {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'object') return JSON.stringify(value).slice(0, 80);
  return String(value);
}

function displayWidth(text) {
  let width = 0;
  for (const char of String(text)) width += /[\u1100-\uFFFF]/.test(char) ? 2 : 1;
  return width;
}

function pad(text, width) {
  const value = String(text);
  return value + ' '.repeat(Math.max(0, width - displayWidth(value)));
}

export async function saveOutput(value, file) {
  const target = resolve(file);
  await mkdir(dirname(target), {recursive: true});
  await writeFile(target, typeof value === 'string' ? value : pretty(value), 'utf8');
  return target;
}

export function print(value, config = {}) {
  if (config.out) return saveOutput(value, config.out);
  const text = config.json ? oneLine(value) : pretty(value);
  process.stdout.write(text + '\n');
  return '';
}
