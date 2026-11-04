# 小木 MCP + CLI

把现行小木 v0.5.x 工作台的全部 REST 接口、页面数据和只读信号，封装成一套标准 MCP Server 和命令行 CLI。
任何支持 MCP 的 Agent（Claude Desktop、Cursor、Codex、Cline、Continue、VS Code、DeepSeek Harness、自写客户端）
都可以直接读取；也提供 `openapi.json` 给只支持 HTTP 的 Agent。

- **不复制业务数据**：MCP 只调用本机 `http://127.0.0.1:4318`，服务端仍是唯一权限与数据边界。
- **不直接读写数据库**：不碰 `.runtime/five-workbench.sqlite`、`eod-market.sqlite`、知识库 SQLite。
- **默认只读**：写入、交易批准、研究/对话/刷新分别由三级开关显式放开。
- **全部接口可发现**：176 个路由、23 个页面、210 个按钮映射，统一在 `wujian_catalog` / `wujian_views` 中。
  其中 107 个会读写数据的按钮已映射到工具；103 个纯筛选/排序/缩放/主题/打印等浏览器 UI 控件保持 `ui-only`，
  其背后的数据查询仍由对应只读工具覆盖。
- **数据已做 Agent 友好裁剪**：`/api/live-market` 原始 12 MB、市场全景 3.9 MB、治理 526 KB，
  MCP 会去掉嵌套 K 线/长序列并压缩到几十 KB；需要明细时用专用工具（`wujian_bars`、`wujian_market_variety`）。

---

## 1. 快速开始

前置：Node.js 22+；小木服务已经启动。

```powershell
cd "D:\五简个人资料\2026年10月文件\小木工作台\wujian-jarvis"

# 1) 先确认小木在 4318
curl.exe -s http://127.0.0.1:4318/api/health

# 2) CLI 自检
node mcp/cli.mjs health
node mcp/cli.mjs brief
node mcp/cli.mjs signals --limit 5
node mcp/cli.mjs fire --mode month-week-day --limit 5

# 3) MCP 协议自检
node mcp/server.mjs --selftest

# 4) 启动 stdio MCP（给客户端配置用，不要手动长跑）
node mcp/server.mjs

# 5) 启动常驻 HTTP MCP（多 Agent 共享时）
node mcp/server.mjs --http --port 4319
# POST http://127.0.0.1:4319/mcp
```

`npm run mcp`、`npm run mcp:http`、`npm run wujian -- <命令>` 等价可用。

### 一键复制给任意 AI

打开工作台右上角的 **“复制接入提示词”** 按钮，直接把提示词粘贴给 Claude、Cursor、Codex、DSH 或其他 AI。
提示词会告诉它：项目路径、MCP 配置、CLI 自检、各客户端配置位置、权限边界和验收步骤。

同一个提示词也可以用 CLI 输出：

```powershell
node mcp/cli.mjs onboarding
node mcp/cli.mjs onboarding --out onboarding.txt
```

源文件：`dist/agent-onboarding.txt`（工作台静态读取，不需要重启服务）。

---

## 2. 权限：默认只读，逐级放开

| 级别 | 默认 | 开启方式 | 能做什么 |
| --- | --- | --- | --- |
| 只读 | 开 | 无需 | 行情、火扫描、报告、卡片、账户、监控、知识库、OpenAPI |
| 计算 | 开 | 无需 | 以损定量、导入预览、监控预览、飞书绑定状态 |
| 写入 | 关 | `WUJIAN_ALLOW_WRITES=1` | 保存卡片/余额/复盘/自选、研究取消、恢复归档卡 |
| 交易 | 关 | 再加 `WUJIAN_ALLOW_TRADING=1` | 批准计划、成交/执行、释放、删除、运行锁定开始 |
| 昂贵 | 关 | `WUJIAN_ALLOW_EXPENSIVE=1` | 深度研究、对话、火/盘后/全景/知识库刷新、备份 |

- `wujian_write` / `wujian_trading` 工具**只在对应开关打开时出现在 `tools/list`**。
- 写和交易工具还必须显式传 `confirm: true` 与 `reason`。
- 所有开关默认 `0`；环境变量写字符串 `"1"`，不要写数字。
- 小木原本的人工拍板、批准、审计和来源白名单不会被 MCP 绕过。

---

## 3. 工具清单

### 聚合与导航

| 工具 | 用途 |
| --- | --- |
| `wujian_health` | 服务版本、根目录、构建哈希、行情/模型状态 |
| `wujian_status` | `/api/status` 原始总状态 |
| `wujian_brief` | 一段式上下文：账户、火候选、趋势、盯盘、研究、数据健康 |
| `wujian_signals` | 跨源信号面板：火、趋势、盯盘事件、市场全景、研究进度 |
| `wujian_api` | 任意只读/纯计算 REST 接口 |
| `wujian_endpoint` | 按端点 ID 调用只读接口，自动替换路径参数 |
| `wujian_catalog` | 176 个端点、49 个工具、23 个页面，可搜索/过滤 |
| `wujian_views` | 页面深链与按钮映射（默认不返回 210 个按钮，需 `includeButtons=true`） |
| `wujian_permissions` | 当前进程权限与开启方式 |

### 市场与行情

| 工具 | 用途 |
| --- | --- |
| `wujian_market_snapshot` | 真实行情快照，默认研究池、默认不含 K 线 |
| `wujian_market_overview` | 板块等权涨跌、涨跌榜、多空距离、收盘覆盖 |
| `wujian_market_page` | 市场全景 9 个分页：strength/rankings/funds/positions/fees/seat-flow/catalog/snapshot |
| `wujian_market_variety` | 单品种：五周期信号、基差、仓单、展期、席位 |
| `wujian_market_intraday` | 单品种已采集 1 分钟分时 |
| `wujian_contract_spec` | 合约乘数、最小变动、每跳盈亏 |
| `wujian_market_refresh_status` | 盘后/全景/天勤/监控行情刷新状态 |
| `wujian_bars` | 具体合约日 K（最多 180 根） |
| `wujian_quote` | 中文名/代码/合约 → 最新报价 + 火判定 |

### 火、研究、交易卡

| 工具 | 用途 |
| --- | --- |
| `wujian_fire_scan` | 火扫描候选，按模式/方向/板块过滤 |
| `wujian_fire_detail` | 单品种三模式判定 + 可选日 K |
| `wujian_research_universe` | 87 品种研究宇宙、技术方向、证据等级、报告 ID |
| `wujian_research_reports` | 研究报告列表（摘要） |
| `wujian_research_report` | 报告正文、来源、复核、对照 |
| `wujian_research_batch` | 批量研究队列状态 |
| `wujian_workbench_summary` | 账户、卡片、待办、计划风险、规则版本 |
| `wujian_cards` | 交易卡列表，按账户/状态/归档过滤 |
| `wujian_card` | 单卡完整五行内容，可只取某一环节 |
| `wujian_accounts` | 账户列表 / 单账户余额变动 |
| `wujian_risk_calc` | 工作台以损定量纯计算，不批准、不下单 |
| `wujian_three_axes_size` | 三板斧独立参考手数（旧 `/api/three-axes/size`） |
| `wujian_governance` | 五行职责、运行锁定、历史轮次、问题 |
| `wujian_changes` | 业务变更/审计记录 |

### 监控、知识、资讯、连接

| 工具 | 用途 |
| --- | --- |
| `wujian_monitor` | 盯盘状态/规则/事件/合约/桌面待办 |
| `wujian_trend_monitor` | 全品种 MA10 监控状态/任务/事件/目录/微信 |
| `wujian_knowledge` | 知识库状态、语义检索、按片段读原文 |
| `wujian_postmarket` | 盘后复盘历史/当前/来源 |
| `wujian_news` | 上期所官方公告标题 |
| `wujian_rules` | 现行规则、登记、扫描规则详情 |
| `wujian_providers` | 外部数据源状态；读取 yfinance/FRED |
| `wujian_connections` | 模型/飞书/火山/GPT-Live/天勤/盘后/备份/归档状态 |
| `wujian_search` | 跨源搜索：行情、火、卡、报告、研究宇宙、可选知识库 |
| `wujian_openapi` | 生成 OpenAPI 3.1 描述 |

### 动作（需开关）

| 工具 | 开关 | 用途 |
| --- | --- | --- |
| `wujian_sync` | expensive | 盘后/全景/火/公告同步、完整备份 |
| `wujian_research_start` | expensive | 启动品种深度研究 |
| `wujian_research_cancel` | write | 取消研究 |
| `wujian_chat` | expensive | 小木文字研究助手 |
| `wujian_write` | write | 任意非交易写接口 |
| `wujian_trading` | write + trading | 批准/成交/执行/删除/运行锁定 |
| `wujian_expensive` | expensive | 任意昂贵/长任务接口（复盘、重建、备份、金分析等） |

---

## 4. CLI 速查

```powershell
node mcp/cli.mjs health
node mcp/cli.mjs status --json
node mcp/cli.mjs brief
node mcp/cli.mjs signals --limit 5
node mcp/cli.mjs catalog --kind endpoints --category market
node mcp/cli.mjs views --buttons

node mcp/cli.mjs market snapshot --scope research --limit 10 --table
node mcp/cli.mjs market overview --sector 有色
node mcp/cli.mjs market strength --limit 20 --table
node mcp/cli.mjs market rankings --sort amount
node mcp/cli.mjs market variety CU --bars
node mcp/cli.mjs market intraday CU

node mcp/cli.mjs fire --mode month-week-day --filter candidate --limit 10 --table
node mcp/cli.mjs detail AG --no-bars
node mcp/cli.mjs bars AG2612 --limit 30
node mcp/cli.mjs quote 沪铜
node mcp/cli.mjs search 铜 --knowledge

node mcp/cli.mjs research universe --filter completed
node mcp/cli.mjs research reports --limit 10
node mcp/cli.mjs research report <报告UUID> --out report.json
node mcp/cli.mjs card list --status 观察
node mcp/cli.mjs card get <交易卡UUID>
node mcp/cli.mjs account list
node mcp/cli.mjs risk --file risk.json
node mcp/cli.mjs size --file size.json
node mcp/cli.mjs monitor events --unread
node mcp/cli.mjs trend status --code AU
node mcp/cli.mjs knowledge search "黄金 规则"
node mcp/cli.mjs postmarket current
node mcp/cli.mjs news
node mcp/cli.mjs connections
node mcp/cli.mjs api GET /api/workbench/summary
node mcp/cli.mjs api GET /api/workbench/backup --raw --out backup.json
node mcp/cli.mjs openapi --out openapi.json

# 写入/长任务（显式授权）
node mcp/cli.mjs sync eod --confirm --allow-expensive
node mcp/cli.mjs research start 沪铜 --confirm --allow-expensive
node mcp/cli.mjs write POST /api/workbench/cards/<id>/water-notes --body '{"...":"..."}' --confirm --reason "本人补研究笔记" --allow-writes
```

通用参数：`--json` 紧凑 JSON、`--table` 表格、`--out <file>` 保存、`--quiet` 单行、
`--base <url>`、`--timeout <ms>`、`--allow-writes`、`--allow-trading`、`--allow-expensive`、`--confirm`。

---

## 5. Agent 接入

完整客户端配置见 [adapters/AGENT-SETUP.md](adapters/AGENT-SETUP.md)，包含 Claude Desktop、Cursor、Codex、
Continue、VS Code、Cline、DSH、通用 JSON 与 HTTP。项目根也已放一份可直接识别的 `.mcp.json`。
最小通用配置：

```json
{
  "mcpServers": {
    "wujian": {
      "command": "node",
      "args": ["D:\\五简个人资料\\2026年10月文件\\小木工作台\\wujian-jarvis\\mcp\\server.mjs"],
      "cwd": "D:\\五简个人资料\\2026年10月文件\\小木工作台\\wujian-jarvis",
      "env": {
        "WUJIAN_API_BASE": "http://127.0.0.1:4318",
        "WUJIAN_ALLOW_WRITES": "0",
        "WUJIAN_ALLOW_TRADING": "0",
        "WUJIAN_ALLOW_EXPENSIVE": "0"
      }
    }
  }
}
```

Agent 使用顺序建议：

1. `wujian_health` 确认服务在线；
2. `wujian_brief` 或 `wujian_signals` 建立上下文；
3. 需要具体品种：`wujian_quote` → `wujian_fire_detail` / `wujian_market_variety`；
4. 需要深度证据：`wujian_research_reports` → `wujian_research_report`；
5. 需要交易卡：`wujian_workbench_summary` → `wujian_cards` → `wujian_card`；
6. 需要规则：`wujian_rules`；需要知识库：`wujian_knowledge`；
7. 需要告诉用户去哪里看：`wujian_views` + 深链。

---

## 6. 资源与提示词

MCP resources：

- `wujian://brief`
- `wujian://signals`
- `wujian://catalog/api`
- `wujian://catalog/views`
- `wujian://market/snapshot`
- `wujian://workbench/summary`
- `wujian://reports`

MCP prompts：`wujian_daily_brief`、`wujian_analyze_product`、`wujian_review_card`、`wujian_monitor_alert`。

---

## 7. 文件结构

```
mcp/
  server.mjs       MCP stdio / HTTP 传输
  protocol.mjs     JSON-RPC 与 MCP 协议辅助
  cli.mjs          命令行
  config.mjs       环境变量与权限
  client.mjs       HTTP 客户端（补 Origin、重试、错误）
  catalog.mjs      176 端点 + 49 工具 + 投影裁剪 + OpenAPI
  endpoints.json   从 server.mjs 路由表盘点
  ui.json          23 页面 + 210 按钮映射
  openapi.json     161 个路径、176 个操作的 OpenAPI 3.1 描述
  format.mjs       JSON/表格/裁剪/脱敏
  adapters/        各 Agent 配置示例
  .research/       盘点原始证据（api-inventory.json、ui-inventory.json）
```

---

## 8. 验收

```powershell
node --check mcp/server.mjs
node --check mcp/cli.mjs
node mcp/server.mjs --selftest
node --test tests/mcp.test.mjs

node mcp/cli.mjs health
node mcp/cli.mjs brief
node mcp/cli.mjs signals --limit 5
node mcp/cli.mjs market snapshot --limit 5
node mcp/cli.mjs fire --limit 5
```

真实数据边界：MCP 不生成替代行情、不补造缺失值、不把信号当交易许可；服务不可用时直接报错并提示启动命令。

## 9. 排错

| 现象 | 处理 |
| --- | --- |
| `ECONNREFUSED` / 小木服务未响应 | 在项目根 `npm start`，确认 `http://127.0.0.1:4318/api/health` |
| 403 仅允许本地访问 | `WUJIAN_API_BASE` 必须是 `127.0.0.1:4318` 或 `localhost:4318` |
| 403 来源校验失败 | 不要绕过 MCP 直连；客户端会自动补 `Origin` |
| 没有 `wujian_write` | 设置 `WUJIAN_ALLOW_WRITES=1` 并重启客户端 |
| 没有 `wujian_trading` | 再加 `WUJIAN_ALLOW_TRADING=1` |
| 研究/对话工具不出现 | 设置 `WUJIAN_ALLOW_EXPENSIVE=1` |
| HTTP 401 | 设置/清空 `WUJIAN_MCP_TOKEN`，并带 `Authorization: Bearer` |
| CLI 中文乱码 | PowerShell 用 UTF-8：`$OutputEncoding=[Text.UTF8Encoding]::new()` |

协议与权限细节见 [SPEC.md](SPEC.md)。
