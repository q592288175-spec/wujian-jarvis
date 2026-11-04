#!/usr/bin/env node
// 小木 MCP server: stdio (default) and stateless HTTP.
// It only talks to the running workbench at WUJIAN_API_BASE; no database access.
import http from 'node:http';
import readline from 'node:readline';
import {loadConfig, parseFlags, permissionSummary} from './config.mjs';
import {createClient} from './client.mjs';
import {
  availableTools, callTool, toolDescriptor, buildOpenApi, endpoints, views, buttons,
  endpointStats, accessReason
} from './catalog.mjs';
import {compact, pretty, truncateText} from './format.mjs';
import {
  RPC_ERRORS, PROTOCOL_VERSION, SUPPORTED_PROTOCOLS, RpcError, result, error, toolError,
  textContent, chooseProtocol, isNotification
} from './protocol.mjs';

const argv = process.argv.slice(2);
const flags = parseFlags(argv);
const config = loadConfig({argv});
const client = createClient(config);
const SERVER_INFO = {name: 'wujian-mcp', title: '小木工作台 MCP', version: '1.0.0'};
const INSTRUCTIONS = [
  '小木是国内期货研究工作台，MCP 只读优先。',
  '第一次调用先 wujian_health，随后用 wujian_brief 或 wujian_signals 建立上下文。',
  '需要具体行情/品种用 wujian_quote、wujian_market_variety、wujian_fire_detail；需要研究证据用 wujian_research_reports / wujian_research_report。',
  '默认无写入、无交易、无研究/对话权限；对应工具不会出现在 tools/list。',
  '信号是环境与观察候选，不是交易许可；不要编造缺失数据，不要代替五简拍板。'
].join('\n');

const RESOURCES = [
  {uri: 'wujian://brief', name: 'brief', title: '小木 Agent 简报', description: '账户、火候选、趋势、盯盘、研究、数据健康', mimeType: 'application/json', tool: 'wujian_brief', args: {candidateLimit: 8}},
  {uri: 'wujian://signals', name: 'signals', title: '跨源信号面板', description: '火、趋势、盯盘、市场、研究信号聚合', mimeType: 'application/json', tool: 'wujian_signals', args: {limit: 10}},
  {uri: 'wujian://catalog/api', name: 'api-catalog', title: 'API 目录', description: '176 个 REST 端点', mimeType: 'application/json', tool: 'wujian_catalog', args: {kind: 'endpoints', limit: 400}},
  {uri: 'wujian://catalog/views', name: 'views', title: '页面目录', description: '23 个页面与按钮映射', mimeType: 'application/json', tool: 'wujian_views', args: {includeButtons: false, limit: 50}},
  {uri: 'wujian://market/snapshot', name: 'market-snapshot', title: '行情快照', description: '研究池真实报价，不含 K 线', mimeType: 'application/json', tool: 'wujian_market_snapshot', args: {limit: 100}},
  {uri: 'wujian://workbench/summary', name: 'workbench-summary', title: '账户与交易卡', description: '账户、卡片、待办、计划风险', mimeType: 'application/json', tool: 'wujian_workbench_summary', args: {}},
  {uri: 'wujian://reports', name: 'reports', title: '研究报告', description: '最近研究报告摘要', mimeType: 'application/json', tool: 'wujian_research_reports', args: {limit: 20}},
  {uri: 'wujian://permissions', name: 'permissions', title: 'MCP 权限', description: '当前只读/写入/交易/昂贵权限', mimeType: 'application/json', tool: 'wujian_permissions', args: {}}
];

const PROMPTS = [
  {
    name: 'wujian_daily_brief',
    title: '小木每日简报',
    description: '读取小木当前数据并给出结构化简报',
    arguments: [],
    messages: () => [{
      role: 'user',
      content: '请先调用 wujian_health，再调用 wujian_brief 和 wujian_signals。给出：1) 行情与数据健康；2) 火观察候选；3) 趋势/盯盘未读信号；4) 研究进度；5) 今天需要人工处理的事项。只引用工具返回的数据，明确缺口，不把候选当交易许可。'
    }]
  },
  {
    name: 'wujian_analyze_product',
    title: '分析一个品种',
    description: '按小木数据链路分析品种',
    arguments: [{name: 'product', description: '品种名称或代码，例如 沪铜、CU', required: true}],
    messages: ({product} = {}) => [{
      role: 'user',
      content: `请分析品种「${product || '当前品种'}」。先 wujian_quote 定位合约，再 wujian_fire_detail 和 wujian_market_variety 读取结构、基差、仓单、席位；如有研究报告，用 wujian_research_report 读取。输出：主驱动、支持证据、最强反证、触发/失效条件、缺失项。不得编造，不得给出仓位或下单指令。`
    }]
  },
  {
    name: 'wujian_review_card',
    title: '复核交易卡',
    description: '读取一张交易卡并按五行流程复核',
    arguments: [{name: 'cardId', description: '交易卡 UUID', required: true}],
    messages: ({cardId} = {}) => [{
      role: 'user',
      content: `请复核交易卡 ${cardId || '<cardId>'}：先 wujian_card 读取火/水/金/土/木全部环节，再用 wujian_governance 和 wujian_rules 核对当前运行与规则版本。指出证据缺口、计划是否自洽、执行记录是否完整、下一步由谁处理。只做复核，不批准、不改写。`
    }]
  },
  {
    name: 'wujian_monitor_alert',
    title: '盯盘/趋势警报摘要',
    description: '读取未读提醒并给出优先级',
    arguments: [],
    messages: () => [{
      role: 'user',
      content: '请调用 wujian_monitor（events，unreadOnly）和 wujian_trend_monitor（status），按紧急程度汇总未读警报：品种、合约、周期、触发条件、时间、是否已读、可能失效条件。没有触发的规则也要说明待命状态。不要把警报直接解释成买卖建议。'
    }]
  }
];

function resourceFor(uri) {
  return RESOURCES.find(item => item.uri === uri) || null;
}

function promptFor(name) {
  return PROMPTS.find(item => item.name === name) || null;
}

function protocolResult(id, protocolVersion) {
  return result(id, {
    protocolVersion,
    capabilities: {
      tools: {listChanged: false},
      resources: {subscribe: false, listChanged: false},
      prompts: {listChanged: false},
      logging: {}
    },
    serverInfo: SERVER_INFO,
    instructions: INSTRUCTIONS
  });
}

async function handleToolCall(params) {
  const name = params?.name;
  if (typeof name !== 'string' || !name) throw new RpcError(RPC_ERRORS.invalidParams, 'tools/call 缺少 name');
  const args = params?.arguments && typeof params.arguments === 'object' && !Array.isArray(params.arguments) ? params.arguments : {};
  const tool = availableTools(config).find(item => item.name === name);
  if (!tool) {
    const all = availableTools({allowWrites: true, allowTrading: true, allowExpensive: true});
    const hidden = all.some(item => item.name === name);
    const message = hidden ? accessReason(toolByNameAccess(name), config) : `未知工具：${name}`;
    return toolError(message, {name, available: availableTools(config).map(item => item.name)});
  }
  try {
    const data = await callTool(name, args, {client, config});
    const safe = compact(data, {maxBytes: config.maxResultBytes});
    const text = truncateText(pretty(safe), 120_000);
    return {content: textContent(text), structuredContent: safe};
  } catch (cause) {
    const message = cause?.message || String(cause);
    return toolError(message, {name, status: cause?.status || null, path: cause?.path || null});
  }
}

function toolByNameAccess(name) {
  // Keep the error helpful even when a tool is hidden by permissions.
  const map = {
    wujian_write: 'write', wujian_trading: 'trading', wujian_sync: 'expensive',
    wujian_research_start: 'expensive', wujian_chat: 'expensive', wujian_research_cancel: 'write'
  };
  return map[name] || 'read';
}

async function handleRpc(message) {
  if (!message || typeof message !== 'object' || Array.isArray(message)) throw new RpcError(RPC_ERRORS.invalidRequest, '无效 JSON-RPC 请求');
  const {id, method, params} = message;
  if (typeof method !== 'string') throw new RpcError(RPC_ERRORS.invalidRequest, '缺少 method');
  if (isNotification(message)) {
    // notifications/initialized, notifications/cancelled, ... need no response.
    return null;
  }
  switch (method) {
    case 'initialize': {
      const requested = params?.protocolVersion;
      const version = chooseProtocol(requested);
      return protocolResult(id, version);
    }
    case 'ping':
      return result(id, {});
    case 'tools/list':
      return result(id, {tools: availableTools(config).map(toolDescriptor)});
    case 'tools/call':
      return result(id, await handleToolCall(params || {}));
    case 'resources/list':
      return result(id, {resources: RESOURCES.map(({tool, args, ...item}) => item)});
    case 'resources/read': {
      const uri = params?.uri;
      const resource = resourceFor(uri);
      if (!resource) throw new RpcError(RPC_ERRORS.invalidParams, `未知资源：${uri}`);
      const value = await callTool(resource.tool, resource.args || {}, {client, config});
      const safe = compact(value, {maxBytes: config.maxResultBytes});
      return result(id, {contents: [{uri, mimeType: 'application/json', text: truncateText(pretty(safe), 120_000)}]});
    }
    case 'prompts/list':
      return result(id, {prompts: PROMPTS.map(({messages, ...item}) => item)});
    case 'prompts/get': {
      const prompt = promptFor(params?.name);
      if (!prompt) throw new RpcError(RPC_ERRORS.invalidParams, `未知提示词：${params?.name}`);
      const args = params?.arguments || {};
      return result(id, {description: prompt.description, messages: prompt.messages(args)});
    }
    case 'logging/setLevel':
      return result(id, {});
    case 'completion/complete':
      return result(id, {completion: {values: []}});
    default:
      throw new RpcError(RPC_ERRORS.methodNotFound, `不支持的方法：${method}`);
  }
}

async function processRpcPayload(payload) {
  if (Array.isArray(payload)) {
    const responses = [];
    for (const item of payload) {
      try {
        const response = await handleRpc(item);
        if (response) responses.push(response);
      } catch (cause) {
        responses.push(toErrorResponse(item, cause));
      }
    }
    return responses.length ? responses : null;
  }
  try {
    return await handleRpc(payload);
  } catch (cause) {
    return toErrorResponse(payload, cause);
  }
}

function toErrorResponse(message, cause) {
  const id = message && !Array.isArray(message) ? message.id ?? null : null;
  if (cause instanceof RpcError) return error(id, cause.code, cause.message, cause.data);
  return error(id, RPC_ERRORS.internal, cause?.message || '内部错误');
}

function writeStdio(value) {
  if (value === null || value === undefined) return;
  process.stdout.write(JSON.stringify(value) + '\n');
}

async function runStdio() {
  process.stderr.write(`[wujian-mcp] stdio ready; api=${config.baseUrl}; mode=${permissionSummary(config).mode}\n`);
  const rl = readline.createInterface({input: process.stdin, crlfDelay: Infinity});
  rl.on('line', async line => {
    if (!line.trim()) return;
    let payload;
    try {
      payload = JSON.parse(line);
    } catch (cause) {
      writeStdio(error(null, RPC_ERRORS.parse, 'JSON 解析失败', cause.message));
      return;
    }
    const response = await processRpcPayload(payload);
    writeStdio(response);
  });
  rl.on('close', () => process.exit(0));
}

async function selftest() {
  const checks = [];
  const init = await handleRpc({jsonrpc: '2.0', id: 1, method: 'initialize', params: {protocolVersion: PROTOCOL_VERSION, clientInfo: {name: 'selftest', version: '1'}}});
  checks.push({step: 'initialize', ok: !!init?.result?.capabilities, protocolVersion: init?.result?.protocolVersion});
  const list = await handleRpc({jsonrpc: '2.0', id: 2, method: 'tools/list'});
  checks.push({step: 'tools/list', ok: Array.isArray(list?.result?.tools), count: list?.result?.tools?.length});
  let health;
  try {
    health = await handleRpc({jsonrpc: '2.0', id: 3, method: 'tools/call', params: {name: 'wujian_health', arguments: {}}});
    const payload = health?.result?.structuredContent || {};
    checks.push({step: 'tools/call wujian_health', ok: health?.result?.isError !== true, service: payload.service?.version || null, error: health?.result?.isError ? health?.result?.content?.[0]?.text : null});
  } catch (cause) {
    checks.push({step: 'tools/call wujian_health', ok: false, error: cause.message});
  }
  try {
    const read = await handleRpc({jsonrpc: '2.0', id: 4, method: 'resources/read', params: {uri: 'wujian://brief'}});
    checks.push({step: 'resources/read wujian://brief', ok: !!read?.result?.contents?.[0]?.text, bytes: read?.result?.contents?.[0]?.text?.length || 0});
  } catch (cause) {
    checks.push({step: 'resources/read wujian://brief', ok: false, error: cause.message});
  }
  const output = {
    ok: checks.every(item => item.ok),
    server: SERVER_INFO,
    apiBase: config.baseUrl,
    permissions: permissionSummary(config),
    tools: availableTools(config).length,
    endpoints: endpoints.length,
    views: views.length,
    checks
  };
  process.stdout.write(JSON.stringify(output, null, 2) + '\n');
  process.exitCode = output.ok ? 0 : 1;
}

function sendJson(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(body)});
  res.end(body);
}

function authorized(req) {
  if (!config.token) return true;
  const header = req.headers.authorization || '';
  return header === `Bearer ${config.token}`;
}

async function readBody(req, limit = 2 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error('请求体超过 2MB');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function runHttp() {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization, Mcp-Session-Id', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'});
      return res.end();
    }
    if (!authorized(req)) return sendJson(res, 401, {error: '需要 Authorization: Bearer <WUJIAN_MCP_TOKEN>'});
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) {
      let service = null;
      let errorMessage = null;
      try { service = await client.get('/api/health'); } catch (cause) { errorMessage = cause.message; }
      return sendJson(res, 200, {
        ok: !!service,
        server: SERVER_INFO,
        apiBase: config.baseUrl,
        permissions: permissionSummary(config),
        tools: availableTools(config).length,
        endpoints: endpoints.length,
        views: views.length,
        service,
        error: errorMessage
      });
    }
    if (req.method === 'GET' && url.pathname === '/catalog') {
      return sendJson(res, 200, {
        counts: {endpoints: endpoints.length, tools: availableTools(config).length, views: views.length, buttons: buttons.length},
        endpoints: endpointStats(),
        tools: availableTools(config).map(tool => ({name: tool.name, title: tool.title, access: tool.access, description: tool.description})),
        views: views.map(({id, group, title, hash, url, purpose}) => ({id, group, title, hash, url, purpose}))
      });
    }
    if (req.method === 'GET' && url.pathname === '/openapi.json') {
      return sendJson(res, 200, buildOpenApi(config.baseUrl));
    }
    if (req.method === 'POST' && url.pathname === '/mcp') {
      let payload;
      try {
        const text = await readBody(req);
        payload = JSON.parse(text);
      } catch (cause) {
        return sendJson(res, 400, error(null, RPC_ERRORS.parse, 'JSON 解析失败或请求体过大', cause.message));
      }
      const response = await processRpcPayload(payload);
      if (response === null) { res.writeHead(202); return res.end(); }
      return sendJson(res, 200, response);
    }
    return sendJson(res, 404, {error: 'MCP HTTP 端点：POST /mcp；辅助：GET /health、/catalog、/openapi.json'});
  });
  server.on('error', cause => {
    process.stderr.write(`[wujian-mcp] HTTP 启动失败：${cause.message}\n`);
    process.exit(1);
  });
  server.listen(config.httpPort, config.httpHost, () => {
    process.stderr.write(`[wujian-mcp] HTTP ready: http://${config.httpHost}:${config.httpPort}/mcp\n`);
    process.stderr.write(`[wujian-mcp] api=${config.baseUrl}; mode=${permissionSummary(config).mode}\n`);
  });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
}

if (flags.selftest) {
  await selftest();
} else if (flags.http) {
  await runHttp();
} else {
  await runStdio();
}
