# 小木 MCP + CLI 建设规格（v1）

目标：把 2026-11-03 现行小木 v0.5.x 的只读数据、研究资产、监控信号和人工工作流，封装成
同一套 MCP Server 与命令行 CLI，让任意 Agent 通过标准协议读取，不复制、不猜测、不绕过人工权限。

## 1. 事实来源

- 运行中的本机服务：`http://127.0.0.1:4318`（server.mjs，约 120 个 REST 路由）。
- 业务数据库：`.runtime/five-workbench.sqlite`、`.runtime/eod-market.sqlite`、
  `.runtime/knowledge/knowledge.sqlite` 等，**只通过服务 API 读取**，MCP 不直接写库。
- 前端视图：`dist/market-panorama.html` + `unified-workbench.js` 路由，18 个页面。
- 现有服务已经做了来源白名单、行情时效、交易权限、人工批准、去重与审计；MCP 必须复用这些边界。

## 2. 架构

```
Agent (Claude/Cursor/Codex/DSH/任意 MCP 客户端)
        │ stdio JSON-RPC（推荐）或 HTTP /mcp
        ▼
mcp/server.mjs  ── tools / resources / prompts
        │  统一调用
        ▼
mcp/client.mjs ── HTTP → http://127.0.0.1:4318/api/...
        │
        ▼
小木 server.mjs（唯一业务与权限边界）
```

CLI 与 MCP 共用 `client.mjs` 和 `catalog.mjs`，不允许各自维护一份端点清单。

## 3. 文件与接口契约

- `mcp/config.mjs`：解析环境变量与 CLI 参数。
  - `WUJIAN_API_BASE` 默认 `http://127.0.0.1:4318`
  - `WUJIAN_TIMEOUT_MS` 默认 `30000`
  - `WUJIAN_ALLOW_WRITES` 默认 `0`
  - `WUJIAN_ALLOW_TRADING` 默认 `0`
  - `WUJIAN_ALLOW_EXPENSIVE` 默认 `0`（研究、对话、同步、刷新等有成本/长任务）
  - `WUJIAN_MCP_TOKEN` 可选；HTTP 模式要求 `Authorization: Bearer ...`
- `mcp/client.mjs`：导出 `createClient(config)`，返回：
  - `request(method, path, {query, body, headers, timeoutMs})`
  - `get(path, options)` / `post(path, body, options)`
  - 自动设置 `Origin: http://127.0.0.1:<port>`，把非 2xx 转成带 status/path/body 的 `WujianError`。
  - 对 GET 做 3 次短退避重试（连接失败/502/503），写请求不重试。
- `mcp/catalog.mjs`：导出
  - `endpoints`: 数组，字段 `{id, method, path, category, summary, params, access, expensive, returns}`
  - `tools`: MCP tool 定义数组，字段 `{name, title, description, inputSchema, handler}`
  - `views`: 18 个页面 + 旧版全息页 + 打印页，字段 `{id, group, title, hash, url, purpose, keyActions}`
  - `resources` / `prompts`
  - `findEndpoint(id)`、`classifyAccess(method, path)`。
- `mcp/server.mjs`：零依赖 MCP 实现。
  - stdio：逐行 JSON-RPC 2.0；只把协议消息写 stdout，日志写 stderr。
  - 支持 `initialize`、`notifications/initialized`、`ping`、`tools/list`、`tools/call`、
    `resources/list`、`resources/read`、`prompts/list`、`prompts/get`、`logging/setLevel`。
  - `tools/call` 返回 `content:[{type:'text',text}]`，同时带 `structuredContent`（MCP 2025-06-18 客户端可用）。
  - HTTP：`--http`，默认 `127.0.0.1:4319`，`POST /mcp` JSON-RPC；`GET /health`、
    `GET /catalog`、`GET /openapi.json`；不暴露到公网。
- `mcp/cli.mjs`：命令 `wujian`，默认输出可读 JSON；`--json` 紧凑 JSON；`--table` 表格；
  `--out <file>` 保存；`--quiet` 只输出值。
- `mcp/protocol.mjs`：JSON-RPC 错误码、版本协商、SSE/JSON 响应小工具。
- `mcp/format.mjs`：JSON、表格、CSV、截断与敏感字段过滤。

## 4. 权限分级

| access | 含义 | 默认 | 例子 |
| --- | --- | --- | --- |
| `read` | GET，只读 | 允许 | 行情、报告、卡片、监控、知识库 |
| `calc` | POST 但纯计算、无持久化 | 允许 | `/api/workbench/risk`、`/api/three-axes/size` |
| `write` | 会持久化业务数据 | `WUJIAN_ALLOW_WRITES=1` | 保存卡片、余额、复盘、自选、导入 |
| `trading` | 批准/执行/删除/运行锁定 | 再需 `WUJIAN_ALLOW_TRADING=1` | approve、trade、executions、release、delete |
| `expensive` | 触发模型/长任务/外部抓取 | 再需 `WUJIAN_ALLOW_EXPENSIVE=1` | research/run、chat、fire/refresh、panorama/refresh |
| `stream` | SSE，MCP 不直接订阅 | 转为轮询工具 | `/api/monitor/stream`、`/api/trend-monitor/stream` |

- 通用工具 `wujian_api` 只允许 `read`/`calc`。
- `wujian_write` 只在 `WUJIAN_ALLOW_WRITES=1` 时存在；`wujian_trading` 只在 `WUJIAN_ALLOW_TRADING=1` 时存在。
- 高风险端点即使开启也必须显式传 `confirm: true` 与原因（CLI 用 `--confirm`）。
- 永不返回 `.env`、token、App Secret、密码、完整本机密钥路径。

## 5. 工具清单（首版）

聚合读取：
1. `wujian_health`：服务版本、根目录、构建哈希、可用性。
2. `wujian_status`：`/api/status`，模型/行情/任务概览。
3. `wujian_brief`：给 Agent 的一段式上下文（市场、火候选、监控、研究、账户）。
4. `wujian_signals`：跨源信号聚合（火扫描、趋势监控、盯盘事件、强弱、盘后状态）。
5. `wujian_api`：任意只读 API。
6. `wujian_catalog`：端点、视图、工具清单，可按关键词/分类过滤。
7. `wujian_views`：18 个页面、深链、页面按钮与对应工具。

市场：
8. `wujian_market_snapshot`（live-market，scope）
9. `wujian_market_overview`（panorama snapshot / overview）
10. `wujian_market_page`（strength/rankings/funds/positions/fees/seat-flow）
11. `wujian_market_variety`（品种详情）
12. `wujian_market_intraday`（分时）
13. `wujian_contract_spec`
14. `wujian_market_refresh_status`（eod、panorama）

火/研究：
15. `wujian_fire_scan`（mode、candidate、limit）
16. `wujian_fire_detail`（单品种、bars）
17. `wujian_research_universe`
18. `wujian_research_reports`
19. `wujian_research_report`
20. `wujian_research_batch_status`

交易卡/账户：
21. `wujian_workbench_summary`
22. `wujian_cards`
23. `wujian_card`
24. `wujian_accounts`
25. `wujian_risk_calc`（纯计算）
26. `wujian_governance`
27. `wujian_changes`

监控/知识/资讯：
28. `wujian_monitor`
29. `wujian_trend_monitor`
30. `wujian_knowledge`
31. `wujian_postmarket`
32. `wujian_news`
33. `wujian_rules`
34. `wujian_providers`
35. `wujian_connections`（feishu/llm/voice/tq/eod/backup）

动作（按权限出现）：
36. `wujian_research_start` / `wujian_research_cancel`
37. `wujian_write` / `wujian_trading`
38. `wujian_sync`（eod refresh、panorama refresh、fire refresh）
39. `wujian_chat`

## 6. CLI 命令

```
wujian serve [--http] [--port 4319]
wujian health | status | brief | signals | catalog | views
wujian api <GET|POST> <path> [--query k=v] [--body JSON] [--confirm]
wujian market snapshot|overview|strength|rankings|funds|positions|fees|seat-flow|variety|intraday
wujian fire [--mode month-week-day] [--candidate] [--limit N]
wujian research universe|reports|report|batch
wujian card list|get|...
wujian account list|summary
wujian risk --file input.json
wujian monitor status|events|rules|trend
wujian knowledge status|search "..." 
wujian postmarket list|current|sources
wujian news | rules | providers | external yfinance
wujian connections
wujian watch <path> --interval 5 --count 1
wujian openapi [--out openapi.json]
```

## 7. Agent 接入

- 通用 stdio 配置模板（`mcp/adapters/generic-stdio.json`）
- Claude Desktop（`claude_desktop_config.json`）
- Cursor（`.cursor/mcp.json`）
- Codex（`config.toml` 片段）
- DSH（当前 checkout 的 MCP 配置说明）
- HTTP（`POST /mcp`、`/openapi.json`）

## 8. 验收

- `node mcp/server.mjs --selftest` 完成 initialize → tools/list → tools/call → resources/read。
- `node mcp/cli.mjs health`、`status`、`signals`、`market snapshot`、`fire --candidate` 对运行中服务返回真实数据。
- 对 120 个路由执行只读巡检：GET 端点 2xx 或明确的 4xx（非 5xx）。
- 写操作默认拒绝的测试；开启后仍要求确认。
- 不修改小木业务代码、不写 `.runtime` 数据库；新增文件限定在 `mcp/`、`tests/mcp*.mjs`、`docs/mcp-cli-*.md`。
