#!/usr/bin/env node
// wujian — command line access to the same read-only workbench tools as MCP.
import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadConfig, parseFlags, permissionSummary} from './config.mjs';
import {createClient} from './client.mjs';
import {
  callTool, tools, availableTools, endpoints, views, buttons, buildOpenApi, endpointStats,
  matchEndpoint, classifyAccess, accessAllowed, accessReason
} from './catalog.mjs';
import {pretty, oneLine, table, saveOutput, compact, byteLength} from './format.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const VALUE_FLAGS = new Set([
  'base', 'timeout', 'out', 'max-bytes', 'body', 'query', 'file', 'input', 'reason',
  'interval', 'count', 'limit', 'mode', 'filter', 'sector', 'date', 'scope', 'symbols',
  'sort', 'account', 'status', 'section', 'code', 'product', 'id', 'chunk-id', 'provider',
  'kind', 'category', 'access', 'messages-file', 'port', 'host', 'context-symbol', 'card',
  'bar-limit', 'message', 'text'
]);

function parseArgv(argv) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const item = String(argv[i]);
    if (!item.startsWith('--')) { positional.push(item); continue; }
    const eq = item.indexOf('=');
    const key = (eq >= 0 ? item.slice(2, eq) : item.slice(2)).toLowerCase();
    if (!key) continue;
    let value = '1';
    if (eq >= 0) value = item.slice(eq + 1);
    else if (VALUE_FLAGS.has(key) && argv[i + 1] !== undefined && !String(argv[i + 1]).startsWith('--')) { value = String(argv[++i]); }
    if (key === 'query') {
      flags.query = flags.query || {};
      const [k, ...rest] = value.split('=');
      flags.query[k] = rest.join('=');
    } else flags[key] = value;
  }
  return {flags, positional};
}

const {flags, positional} = parseArgv(process.argv.slice(2));
// `--query k=v` belongs to `api`; for catalog/search commands a lone
// `--query 铜` is a plain text filter.
if (flags.query && typeof flags.query === 'object') {
  const keys = Object.keys(flags.query);
  if (keys.length === 1 && flags.query[keys[0]] === '1') flags.queryText = keys[0];
}
const config = loadConfig({argv: process.argv.slice(2)});
const client = createClient(config);
const command = positional[0] || 'help';
const rest = positional.slice(1);

function boolFlag(name) { return ['1', 'true', 'yes', 'on'].includes(String(flags[name] ?? '').toLowerCase()); }

function jsonArg(value) {
  if (!value) return {};
  try { return JSON.parse(value); } catch (cause) { throw new Error(`JSON 解析失败：${cause.message}`); }
}

async function bodyArg() {
  if (!flags.body) return undefined;
  const text = String(flags.body);
  if (text.startsWith('@')) return jsonArg(await readFile(text.slice(1), 'utf8'));
  return jsonArg(text);
}

function rowsOf(value) {
  if (Array.isArray(value)) return value;
  for (const key of ['rows', 'items', 'cards', 'quotes', 'hits', 'endpoints', 'tools', 'views', 'pages', 'observations', 'events', 'reports', 'news']) {
    if (Array.isArray(value?.[key])) return value[key];
  }
  return null;
}

async function emit(value) {
  if (flags.out) {
    const target = await saveOutput(value, String(flags.out));
    process.stderr.write(`已保存：${target}\n`);
    return;
  }
  if (flags.table) {
    const rows = rowsOf(value) || (Array.isArray(value) ? value : []);
    process.stdout.write(table(rows) + '\n');
    return;
  }
  if (flags.quiet) {
    process.stdout.write((typeof value === 'string' ? value : oneLine(value)) + '\n');
    return;
  }
  process.stdout.write((flags.json ? oneLine(value) : pretty(value)) + '\n');
}

async function runTool(name, args = {}) {
  if (!availableTools(config).some(tool => tool.name === name)) {
    throw new Error(`工具 ${name} 在当前权限下不可用（${permissionSummary(config).mode}）`);
  }
  const result = await callTool(name, args, {client, config});
  await emit(result);
  return result;
}

function numberFlag(name, fallback) {
  const value = Number(flags[name]);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function textOf(list) {
  return list.filter(Boolean).join(' ').trim();
}

function help() {
  const lines = [
    'wujian — 小木工作台 CLI（与 MCP 共用同一套工具）',
    '',
    '用法：node mcp/cli.mjs <命令> [参数] [全局参数]',
    '',
    '基础',
    '  onboarding                 输出“复制给 AI 的接入提示词”',
    '  health | status | brief | signals | permissions | connections',
    '  catalog [--kind endpoints|tools|views|all] [--category] [--access] [--query] [--limit]',
    '  views [--id trade/fire] [--group market|trade|entry] [--buttons] [--query]',
    '  openapi [--out openapi.json]',
    '  api <GET|POST> <path> [--query k=v ...] [--body JSON|@file] [--max-bytes N] [--raw]',
    '',
    '市场',
    '  market snapshot [--scope research|all] [--symbols CU,AG] [--bars] [--limit]',
    '  market overview|strength|rankings|funds|positions|fees|seat-flow|catalog [--date] [--sector] [--query] [--sort] [--limit]',
    '  market variety <product> [--bars] [--seats]',
    '  market intraday <product> [--limit]',
    '  quote <名称/代码/合约>',
    '  bars <具体合约> [--limit]',
    '  search <关键词> [--knowledge] [--limit]',
    '',
    '火 / 研究',
    '  fire [--mode month-week-day|month-week|week-day|day-trend] [--filter candidate|long|short|all|illiquid|missing] [--sector] [--limit]',
    '  detail <code> [--mode] [--no-bars] [--bar-limit]',
    '  research universe [--filter all|researchable|completed|pending|long|short] [--sector] [--limit]',
    '  research reports [--status] [--card] [--limit]',
    '  research report <id> [--sources] [--evidence] [--no-report]',
    '  research batch | research start <product> --confirm --allow-expensive | research cancel <id> --confirm --allow-writes',
    '',
    '工作台',
    '  card list [--account] [--status] [--archived] [--limit]',
    '  card get <id> [--section fire|water|plan|executions|reviews|timeline|trade]',
    '  account list | account get <id>',
    '  risk --file input.json | risk --input \'{...}\'',
    '  size --file input.json | size --input \'{...}\'   # 三板斧独立参考',
    '  governance | changes | rules [rules|registry|detail]',
    '',
    '监控 / 知识 / 资讯',
    '  monitor [status|events|rules|contracts|pending] [--unread] [--limit]',
    '  trend [status|tasks|events|catalog|weixin] [--code AU] [--limit]',
    '  knowledge [status|search <query>|source <chunkId>]',
    '  postmarket [reviews|current|sources] [--mode]',
    '  news | providers [yfinance|fred]',
    '',
    '动作（默认关闭）',
    '  sync <eod|panorama|fire|monitor-sources|backup> --confirm --allow-expensive [--mode]',
    '  chat <文本...> | chat --messages-file chat.json --context-symbol SHFE.CU2612',
    '  write <POST|PATCH|DELETE> <path> --body JSON --confirm --reason 文本 --allow-writes',
    '  trading <POST|PATCH|DELETE> <path> --body JSON --confirm --reason 文本 --allow-writes --allow-trading',
    '  expensive <POST|PATCH> <path> --body JSON --confirm --reason 文本 --allow-expensive',
    '  watch <path> [--interval 5] [--count 1]',
    '  serve [--http] [--port 4319]',
    '',
    '全局参数：--json --table --out FILE --quiet --confirm --base URL --timeout MS',
    '          --allow-writes --allow-trading --allow-expensive',
    '',
    '示例：',
    '  node mcp/cli.mjs brief',
    '  node mcp/cli.mjs fire --mode month-week-day --limit 10 --table',
    '  node mcp/cli.mjs market variety CU --bars',
    '  node mcp/cli.mjs research report <uuid> --out report.json',
    '  node mcp/cli.mjs watch /api/workbench/fire --interval 10 --count 5'
  ];
  process.stdout.write(lines.join('\n') + '\n');
}

async function main() {
  if (boolFlag('version')) { process.stdout.write('wujian 1.0.0\n'); return; }
  if (boolFlag('help') || command === 'help') return help();

  if (command === 'serve') {
    const serverArgs = process.argv.slice(2).filter(item => item !== 'serve');
    const child = spawn(process.execPath, [join(here, 'server.mjs'), ...serverArgs], {stdio: 'inherit', env: process.env});
    child.on('error', error => { console.error('启动 MCP 失败：' + error.message); process.exitCode = 1; });
    child.on('exit', code => { process.exitCode = code || 0; });
    return;
  }

  if (command === 'onboarding') {
    const text = await readFile(join(here, '..', 'dist', 'agent-onboarding.txt'), 'utf8');
    if (flags.out) { const target = await saveOutput(text, String(flags.out)); process.stderr.write(`已保存：${target}\n`); }
    else process.stdout.write(text);
    return;
  }
  if (command === 'health') return runTool('wujian_health');
  if (command === 'status') return runTool('wujian_status');
  if (command === 'brief') return runTool('wujian_brief', {accountId: flags.account, candidateLimit: numberFlag('limit', 8)});
  if (command === 'signals') return runTool('wujian_signals', {mode: flags.mode, limit: numberFlag('limit', 12), unreadOnly: flags.unread ? true : undefined});
  if (command === 'permissions') return runTool('wujian_permissions');
  if (command === 'connections') return runTool('wujian_connections');

  if (command === 'catalog') return runTool('wujian_catalog', {
    kind: flags.kind || 'endpoints', category: flags.category, access: flags.access,
    query: textOf(rest) || flags.queryText, limit: numberFlag('limit', 120)
  });
  if (command === 'views') return runTool('wujian_views', {
    id: flags.id || rest[0], group: flags.group, includeButtons: boolFlag('buttons'),
    query: flags.queryText, limit: numberFlag('limit', 30)
  });
  if (command === 'openapi') {
    const spec = buildOpenApi(config.baseUrl);
    await emit(spec);
    return;
  }

  if (command === 'api') {
    const method = (rest[0] || 'GET').toUpperCase();
    const path = method.startsWith('/') ? rest[0] : rest[1];
    if (!path) throw new Error('用法：api <GET|POST> <path> [--raw]');
    const verb = method.startsWith('/') ? 'GET' : method;
    if (boolFlag('raw')) {
      const endpoint = matchEndpoint(verb, path);
      const access = endpoint?.access || classifyAccess(verb, path);
      if (!accessAllowed(access, config) || !['read', 'calc'].includes(access)) throw new Error(accessReason(access, config));
      const data = await client.request(verb, path, {query: flags.query, body: await bodyArg()});
      return emit(data);
    }
    return runTool('wujian_api', {method: verb, path, query: flags.query, body: await bodyArg(), maxBytes: numberFlag('max-bytes', undefined)});
  }

  if (command === 'market') {
    const sub = rest[0] || 'snapshot';
    if (sub === 'snapshot') return runTool('wujian_market_snapshot', {
      scope: flags.scope || 'research', symbols: flags.symbols ? String(flags.symbols).split(',').map(s => s.trim()).filter(Boolean) : undefined,
      query: flags.queryText, includeBars: boolFlag('bars'), barLimit: numberFlag('bar-limit', 30), limit: numberFlag('limit', 200)
    });
    if (sub === 'overview') return runTool('wujian_market_overview', {date: flags.date, sector: flags.sector, query: flags.queryText, limit: numberFlag('limit', 100)});
    if (['strength', 'rankings', 'funds', 'positions', 'fees', 'seat-flow', 'catalog', 'snapshot'].includes(sub)) {
      return runTool('wujian_market_page', {page: sub, date: flags.date, sector: flags.sector, query: flags.queryText, sort: flags.sort, limit: numberFlag('limit', 100)});
    }
    if (sub === 'variety') {
      const product = rest[1] || flags.product;
      if (!product) throw new Error('用法：market variety <product>');
      return runTool('wujian_market_variety', {product, date: flags.date, includeBars: boolFlag('bars'), includeSeats: boolFlag('seats'), barLimit: numberFlag('bar-limit', 60)});
    }
    if (sub === 'intraday') {
      const product = rest[1] || flags.product;
      if (!product) throw new Error('用法：market intraday <product>');
      return runTool('wujian_market_intraday', {product, date: flags.date, limit: numberFlag('limit', 300)});
    }
    throw new Error(`未知 market 子命令：${sub}（见 help）`);
  }

  if (command === 'fire') return runTool('wujian_fire_scan', {
    mode: flags.mode, filter: flags.filter || 'candidate', sector: flags.sector,
    query: flags.queryText, limit: numberFlag('limit', 50)
  });
  if (command === 'detail') {
    const code = rest[0] || flags.code;
    if (!code) throw new Error('用法：detail <code>');
    return runTool('wujian_fire_detail', {code, mode: flags.mode, includeBars: !boolFlag('no-bars'), barLimit: numberFlag('bar-limit', 60)});
  }
  if (command === 'bars') {
    const contract = rest[0] || flags.contract;
    if (!contract) throw new Error('用法：bars <具体合约>');
    return runTool('wujian_bars', {contract, limit: numberFlag('limit', 80)});
  }
  if (command === 'quote') {
    const query = textOf(rest);
    if (!query) throw new Error('用法：quote <名称/代码/合约>');
    return runTool('wujian_quote', {query, includeFire: !boolFlag('no-fire')});
  }
  if (command === 'search') {
    const query = textOf(rest);
    if (!query) throw new Error('用法：search <关键词>');
    return runTool('wujian_search', {query, includeKnowledge: boolFlag('knowledge'), limit: numberFlag('limit', 8)});
  }

  if (command === 'research') {
    const sub = rest[0] || 'reports';
    if (sub === 'universe') return runTool('wujian_research_universe', {filter: flags.filter || 'all', sector: flags.sector, query: flags.queryText, limit: numberFlag('limit', 100)});
    if (sub === 'reports') return runTool('wujian_research_reports', {status: flags.status, cardId: flags.card, query: flags.queryText, limit: numberFlag('limit', 30)});
    if (sub === 'report') {
      const id = rest[1] || flags.id;
      if (!id) throw new Error('用法：research report <id>');
      return runTool('wujian_research_report', {id, includeReport: !boolFlag('no-report'), includeSources: boolFlag('sources'), includeEvidence: boolFlag('evidence')});
    }
    if (sub === 'batch') return runTool('wujian_research_batch');
    if (sub === 'start') {
      const product = textOf(rest.slice(1)) || flags.product;
      if (!product) throw new Error('用法：research start <product> --confirm --allow-expensive');
      return runTool('wujian_research_start', {product, cardId: flags.card, confirm: boolFlag('confirm')});
    }
    if (sub === 'cancel') {
      const id = rest[1] || flags.id;
      if (!id) throw new Error('用法：research cancel <id> --confirm --allow-writes');
      return runTool('wujian_research_cancel', {id, confirm: boolFlag('confirm')});
    }
    throw new Error(`未知 research 子命令：${sub}`);
  }

  if (command === 'card') {
    const sub = rest[0] || 'list';
    if (sub === 'list') return runTool('wujian_cards', {accountId: flags.account, status: flags.status, includeArchived: boolFlag('archived'), query: flags.queryText, limit: numberFlag('limit', 50)});
    if (sub === 'get') {
      const id = rest[1] || flags.id;
      if (!id) throw new Error('用法：card get <id>');
      return runTool('wujian_card', {id, section: flags.section || 'all'});
    }
    throw new Error(`未知 card 子命令：${sub}`);
  }

  if (command === 'account') {
    const sub = rest[0] || 'list';
    if (sub === 'list') return runTool('wujian_accounts', {});
    if (sub === 'get') {
      const id = rest[1] || flags.id || flags.account;
      if (!id) throw new Error('用法：account get <id>');
      return runTool('wujian_accounts', {accountId: id});
    }
    throw new Error(`未知 account 子命令：${sub}`);
  }

  if (command === 'risk') {
    const input = flags.file ? jsonArg(await readFile(String(flags.file), 'utf8')) : flags.input ? jsonArg(String(flags.input)) : {};
    return runTool('wujian_risk_calc', input);
  }
  if (command === 'size') {
    const input = flags.file ? jsonArg(await readFile(String(flags.file), 'utf8')) : flags.input ? jsonArg(String(flags.input)) : {};
    return runTool('wujian_three_axes_size', input);
  }

  if (command === 'monitor') {
    const section = rest[0] || 'status';
    return runTool('wujian_monitor', {section, limit: numberFlag('limit', 30), unreadOnly: boolFlag('unread')});
  }
  if (command === 'trend') {
    const section = rest[0] || 'status';
    return runTool('wujian_trend_monitor', {section, code: flags.code, limit: numberFlag('limit', 50)});
  }
  if (command === 'knowledge') {
    const sub = rest[0] || 'status';
    if (sub === 'status') return runTool('wujian_knowledge', {action: 'status'});
    if (sub === 'search') return runTool('wujian_knowledge', {action: 'search', query: textOf(rest.slice(1)) || flags.queryText, limit: numberFlag('limit', 6)});
    if (sub === 'source') return runTool('wujian_knowledge', {action: 'source', chunkId: Number(rest[1] || flags['chunk-id'])});
    throw new Error(`未知 knowledge 子命令：${sub}`);
  }
  if (command === 'postmarket') {
    const section = rest[0] || 'reviews';
    return runTool('wujian_postmarket', {section, mode: flags.mode, limit: numberFlag('limit', 10)});
  }
  if (command === 'news') return runTool('wujian_news');
  if (command === 'rules') return runTool('wujian_rules', {section: rest[0] || 'rules'});
  if (command === 'providers') return runTool('wujian_providers', {provider: rest[0] || flags.provider});
  if (command === 'governance') return runTool('wujian_governance');
  if (command === 'changes') return runTool('wujian_changes');

  if (command === 'sync') {
    const target = rest[0] || flags.target;
    if (!target) throw new Error('用法：sync <eod|panorama|fire|monitor-sources> --confirm --allow-expensive');
    return runTool('wujian_sync', {target, mode: flags.mode || 'closes', confirm: boolFlag('confirm')});
  }

  if (command === 'chat') {
    let messages;
    if (flags['messages-file']) messages = jsonArg(await readFile(String(flags['messages-file']), 'utf8'));
    else {
      const text = textOf(rest);
      if (!text) throw new Error('用法：chat <文本...> 或 --messages-file chat.json');
      messages = [{role: 'user', content: text}];
    }
    return runTool('wujian_chat', {messages, contextSymbol: flags['context-symbol'], cardId: flags.card});
  }

  if (command === 'write' || command === 'trading' || command === 'expensive') {
    const method = (rest[0] || 'POST').toUpperCase();
    const path = rest[1];
    if (!path) throw new Error(`用法：${command} <POST|PATCH|DELETE> <path> --body JSON --confirm --reason 文本`);
    const tool = command === 'write' ? 'wujian_write' : command === 'trading' ? 'wujian_trading' : 'wujian_expensive';
    return runTool(tool, {
      method, path, query: flags.query, body: await bodyArg(), confirm: boolFlag('confirm'), reason: flags.reason
    });
  }

  if (command === 'watch') {
    const path = rest[0] || flags.path;
    if (!path) throw new Error('用法：watch <path> [--interval 5] [--count 1]');
    return watch(path, numberFlag('interval', 5), Number(flags.count ?? 1));
  }

  throw new Error(`未知命令：${command}（运行 node mcp/cli.mjs help）`);
}

async function watch(path, intervalSeconds, count) {
  let previous = '';
  let seen = 0;
  while (true) {
    const value = await callTool('wujian_api', {path}, {client, config});
    const text = oneLine(value);
    if (text !== previous) {
      await emit(value);
      previous = text;
      seen++;
    }
    if (count > 0 && seen >= count) return;
    await new Promise(resolve => setTimeout(resolve, Math.max(1, intervalSeconds) * 1000));
  }
}

try {
  await main();
} catch (cause) {
  const message = cause?.message || String(cause);
  console.error(`错误：${message}`);
  if (cause?.status) console.error(`HTTP ${cause.status}${cause.path ? ' · ' + cause.path : ''}`);
  const mode = permissionSummary(config).mode;
  if (/权限|未启用|confirm/.test(message)) console.error(`当前模式：${mode}。用 --allow-writes / --allow-trading / --allow-expensive 或环境变量开启。`);
  process.exitCode = 1;
}
