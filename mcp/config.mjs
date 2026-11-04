// Shared configuration for the MCP server and CLI.
// No business data lives here; everything is read from the local 小木 service.

const truthy = value => ['1', 'true', 'yes', 'on', 'y'].includes(String(value ?? '').trim().toLowerCase());

export const DEFAULT_BASE = 'http://127.0.0.1:4318';
export const DEFAULT_HTTP_PORT = 4319;
export const DEFAULT_TIMEOUT_MS = 30_000;
export const DEFAULT_MAX_RESULT_BYTES = 350_000;

export function normalizeBase(value = DEFAULT_BASE) {
  const raw = String(value || DEFAULT_BASE).trim().replace(/\/+$/, '');
  const url = new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('WUJIAN_API_BASE 必须是 http(s) 地址');
  url.pathname = url.pathname.replace(/\/+$/, '');
  return url.href.replace(/\/+$/, '');
}

export function originFor(base = DEFAULT_BASE) {
  const url = new URL(normalizeBase(base));
  // server.mjs only accepts the exact local origins. A reverse proxy or LAN
  // address must be configured in the workbench itself before it will answer.
  return `${url.protocol}//${url.host}`;
}

export function loadConfig({ argv = [], env = process.env, overrides = {} } = {}) {
  const flags = parseFlags(argv);
  const base = normalizeBase(overrides.baseUrl ?? flags.base ?? env.WUJIAN_API_BASE ?? DEFAULT_BASE);
  const timeoutMs = positiveInt(overrides.timeoutMs ?? flags.timeout ?? env.WUJIAN_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
  const maxResultBytes = positiveInt(
    overrides.maxResultBytes ?? flags['max-bytes'] ?? env.WUJIAN_MAX_RESULT_BYTES,
    DEFAULT_MAX_RESULT_BYTES
  );
  const allowWrites = bool(overrides.allowWrites ?? flags['allow-writes'] ?? env.WUJIAN_ALLOW_WRITES);
  const allowTrading = allowWrites && bool(overrides.allowTrading ?? flags['allow-trading'] ?? env.WUJIAN_ALLOW_TRADING);
  const allowExpensive = bool(overrides.allowExpensive ?? flags['allow-expensive'] ?? env.WUJIAN_ALLOW_EXPENSIVE);
  return {
    baseUrl: base,
    origin: originFor(base),
    timeoutMs,
    maxResultBytes,
    allowWrites,
    allowTrading,
    allowExpensive,
    token: String(overrides.token ?? flags.token ?? env.WUJIAN_MCP_TOKEN ?? ''),
    httpHost: String(overrides.httpHost ?? flags.host ?? env.WUJIAN_MCP_HOST ?? '127.0.0.1'),
    httpPort: positiveInt(overrides.httpPort ?? flags.port ?? env.WUJIAN_MCP_PORT, DEFAULT_HTTP_PORT),
    json: bool(flags.json ?? false),
    quiet: bool(flags.quiet ?? false),
    out: flags.out ? String(flags.out) : '',
    confirm: bool(flags.confirm ?? false),
    projectRoot: flags.root ? String(flags.root) : (env.WUJIAN_ROOT || '')
  };
}

export function parseFlags(argv = []) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const item = String(argv[i]);
    if (!item.startsWith('--')) continue;
    const eq = item.indexOf('=');
    const key = (eq >= 0 ? item.slice(2, eq) : item.slice(2)).toLowerCase();
    if (!key) continue;
    if (eq >= 0) { out[key] = item.slice(eq + 1); continue; }
    const next = argv[i + 1];
    if (next !== undefined && !String(next).startsWith('--')) { out[key] = String(next); i++; }
    else out[key] = '1';
  }
  return out;
}

export function bool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  return truthy(value);
}

export function positiveInt(value, fallback) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : fallback;
}

export function permissionSummary(config) {
  return {
    mode: config.allowTrading ? 'trading-enabled' : config.allowWrites ? 'write-enabled' : 'read-only',
    reads: true,
    writes: !!config.allowWrites,
    trading: !!config.allowTrading,
    expensive: !!config.allowExpensive
  };
}

export function describeServiceHint(config = {}) {
  const base = config.baseUrl || DEFAULT_BASE;
  return `小木服务未响应（${base}）。请先在项目根执行 npm start，或双击“启动工作台.command”，确认 ${base}/api/health 返回 JSON。`;
}
