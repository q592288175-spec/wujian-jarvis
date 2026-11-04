# 小木 MCP 客户端接入指南（任意 Agent）

> 目标：任何支持 MCP 的 Agent —— Claude Desktop、Cursor、Codex CLI、Continue、VS Code、Cline、
> DeepSeek Harness（DSH）或自写客户端 —— 都能用同一套配置接到小木工作台，只读优先、写入可控。
>
> 项目根（下文 `<PROJECT_ROOT>`）：
> `D:\五简个人资料\2026年10月文件\小木工作台\wujian-jarvis`
>
> **实现状态**：`mcp/server.mjs`、`mcp/cli.mjs`、`mcp/catalog.mjs` 已于 2026-11-03 落地并实测。
> 当前盘点 176 个 REST 端点、49 个工具（默认只读 42 个）、23 个页面、210 个按钮映射；
> `node mcp/server.mjs --selftest` 已通过 initialize → tools/list → tools/call → resources/read。
> 配置里的命令、路径、环境变量名与工具名均已按实现核对。

---

## 最快方式：让 AI 自己接入

打开小木工作台右上角的 **“复制接入提示词”**，把提示词直接粘贴给任意 AI；它包含本文的命令、
配置位置、权限开关和验收步骤，可自行修改本机配置。也可以用：

```powershell
node mcp/cli.mjs onboarding
```

提示词源文件：`dist/agent-onboarding.txt`（工作台静态读取，改完刷新页面即生效）。

## 0. 三十秒结论

1. 统一 stdio 命令：`node "<PROJECT_ROOT>\mcp\server.mjs"`，工作目录为 `<PROJECT_ROOT>`。
2. HTTP 方式：`node mcp/server.mjs --http --port 4319`，然后 `POST http://127.0.0.1:4319/mcp`。
3. **小木业务服务必须先启动**（`127.0.0.1:4318`）。MCP 只是桥，不会替你拉起小木。
4. 默认只读。写入/交易/昂贵动作分别由 `WUJIAN_ALLOW_WRITES`、`WUJIAN_ALLOW_TRADING`、
   `WUJIAN_ALLOW_EXPENSIVE` 三级开关逐级放开，默认全是 `0`。
5. DSH **不使用** JSON 的 `mcpServers` 字段；它在 profile 的 `cordis.patch.yml` 里加一条
   `@deepseek-ai/dsh-mcp-client` 的 YAML 配置，样例见 [4.8](#48-deepseek-harnessdsh实际可用)。

---

## 1. 架构与前置条件

### 1.1 链路

```
Agent（任意 MCP 客户端）
      │  stdio JSON-RPC（推荐）  或  HTTP POST /mcp
      ▼
mcp/server.mjs   tools / resources / prompts
      │  复用同一套调用与权限判定
      ▼
mcp/client.mjs   HTTP → http://127.0.0.1:4318/api/...
      ▼
小木 server.mjs（唯一业务与权限边界，只读源码、不直连数据库）
```

依据 [mcp/SPEC.md](D:\五简个人资料\2026年10月文件\小木工作台\wujian-jarvis\mcp\SPEC.md:14) 第 2 节：
MCP 不直接读写 `.runtime` 数据库，所有数据都走运行中的小木 HTTP 接口。

### 1.2 Node 版本

- 项目 `engines.node` 为 `>=22`（[package.json](D:\五简个人资料\2026年10月文件\小木工作台\wujian-jarvis\package.json:14)）。
- 本机实测 `node v26.4.0`，可执行文件 `C:\Program Files\nodejs\node.exe`。
- MCP Server 为零依赖实现（SPEC §3），**不需要** `npm install` 任何 MCP SDK。
- 用 `node --version` 确认；低于 22 请升级后再接入。

### 1.3 服务必须先启动

MCP 连接的是本机小木服务，而不是数据库。启动方式（二选一）：

```powershell
cd "D:\五简个人资料\2026年10月文件\小木工作台\wujian-jarvis"
npm start
```

或双击项目根里的 `启动工作台.command`。

服务侧事实（[server.mjs](D:\五简个人资料\2026年10月文件\小木工作台\wujian-jarvis\server.mjs:48)）：

- 端口 `PORT` 默认 `4318`，只监听 `127.0.0.1`；
- `Host` 头必须是 `localhost:4318` / `127.0.0.1:4318`，否则 403「仅允许本地访问」；
- `POST/PATCH/DELETE` 还会校验 `Origin` 必须是 `http://localhost:4318` 或 `http://127.0.0.1:4318`，
  这个头由 `mcp/client.mjs` 自动补（SPEC §3），客户端不用管。

**服务没起时**，MCP 连接本身可能成功，但任何取数工具都会返回连接失败（`ECONNREFUSED`）。
先确认下面这条能返回 JSON，再排查 MCP 配置：

```powershell
curl.exe -s http://127.0.0.1:4318/api/status
```

### 1.4 自检

```powershell
cd "D:\五简个人资料\2026年10月文件\小木工作台\wujian-jarvis"
node mcp/server.mjs --selftest
```

按 SPEC §8，`--selftest` 应走完 `initialize → tools/list → tools/call → resources/read`。
没有输出工具列表，就先解决 Node 版本与服务启动，再改客户端配置。

---

## 2. 统一命令与环境变量

所有 stdio 客户端使用同一条命令：

| 项 | 值 |
| --- | --- |
| command | `node`（GUI 客户端不继承终端 PATH 时，改 `C:\Program Files\nodejs\node.exe`） |
| args | `["D:\\五简个人资料\\2026年10月文件\\小木工作台\\wujian-jarvis\\mcp\\server.mjs"]` |
| cwd | `D:\五简个人资料\2026年10月文件\小木工作台\wujian-jarvis`（支持该键的客户端才填） |

环境变量（SPEC §3「config.mjs」）：

| 变量 | 默认 | 作用 |
| --- | --- | --- |
| `WUJIAN_API_BASE` | `http://127.0.0.1:4318` | 小木服务地址；换端口/远程机时改这里 |
| `WUJIAN_TIMEOUT_MS` | `30000` | 单次 API 超时（毫秒） |
| `WUJIAN_ALLOW_WRITES` | `0` | `1` 才出现 `wujian_write`（保存卡片、余额、复盘、自选、导入） |
| `WUJIAN_ALLOW_TRADING` | `0` | `1` 才出现 `wujian_trading`（批准/执行/删除/释放锁） |
| `WUJIAN_ALLOW_EXPENSIVE` | `0` | `1` 才放开研究、对话、同步、刷新等有成本/长任务 |
| `WUJIAN_MCP_TOKEN` | 空 | **仅 HTTP 模式**使用；设置后请求必须带 `Authorization: Bearer <token>` |

约定：

- 环境变量值在 JSON 里必须是字符串，所以开关写 `"0"` / `"1"`，不要写 `0` / `1`。
- 不设置任何 `ALLOW_*` 即为**纯只读 Agent**，这是推荐默认值。
- 不要把真实 Token 写进任何入库文件；本目录的样例文件只留空值/占位。

---

## 3. 四级权限：只读 / 写入 / 交易 / 昂贵动作

SPEC §4 的权限表（[SPEC.md:63](D:\五简个人资料\2026年10月文件\小木工作台\wujian-jarvis\mcp\SPEC.md:63)）：

| 级别 | 触发条件 | 默认 | 典型动作 |
| --- | --- | --- | --- |
| 只读 `read` | GET，无需开关 | 允许 | 行情、报告、卡片、监控、知识库 |
| 计算 `calc` | POST 但纯计算、不落盘 | 允许 | `/api/workbench/risk`、`/api/three-axes/size` |
| 写入 `write` | `WUJIAN_ALLOW_WRITES=1` | 关闭 | 保存卡片、余额、复盘、自选、导入 |
| 交易 `trading` | 再需 `WUJIAN_ALLOW_TRADING=1` | 关闭 | approve、trade、executions、release、delete |
| 昂贵 `expensive` | 再需 `WUJIAN_ALLOW_EXPENSIVE=1` | 关闭 | `research/run`、`chat`、`fire/refresh`、`panorama/refresh` |

要点：

1. 通用工具 `wujian_api` **只允许** `read` / `calc`；写和交易永远走专用工具。
2. `wujian_write`、`wujian_trading` 是**按开关动态出现**的——没开就 `tools/list` 里根本没有，
   Agent 不会「看见但被拒」。
3. 高风险端点即使开关全开，也要求显式 `confirm: true` 并附原因（CLI 用 `--confirm`）。
4. 永不返回 `.env`、token、App Secret、密码、完整本机密钥路径。
5. `stream` 类 SSE 端点不直接订阅，MCP 已转成轮询工具；客户端不需要 SSE 能力。

**推荐起步配置**：先只读跑通（全部 `"0"`），需要写复盘/卡片时只开 `WUJIAN_ALLOW_WRITES=1`；
交易与研究权限建议长期保持 `0`，用 CLI 人工执行。

---

## 4. 各客户端配置

先给出位置速查，后面每节都有可直接复制的完整内容。

> 下面每一段都是「**新增一个服务器条目**」。客户端已有配置文件时请**合并**进去，
> 不要整份覆盖——尤其 Codex 的 `config.toml`、Continue 的 `config.yaml` 往往还有模型和技能配置。

| 客户端 | 配置文件 | 顶层键 |
| --- | --- | --- |
| Claude Desktop | `%APPDATA%\Claude\claude_desktop_config.json` | `mcpServers` |
| Cursor | 项目 `.cursor/mcp.json` 或全局 `~/.cursor/mcp.json` | `mcpServers` |
| Codex CLI | `~/.codex/config.toml` | `[mcp_servers.<name>]` |
| Continue | `~/.continue/config.yaml` | `mcpServers:`（列表） |
| VS Code | 项目 `.vscode/mcp.json` 或用户配置 | `servers` |
| Cline | `~/.cline/data/settings/cline_mcp_settings.json` | `mcpServers` |
| 通用 JSON | 任意客户端指定文件 | `mcpServers` |
| DSH | `%USERPROFILE%\.dsh\profiles\<profile>\cordis.patch.yml` | YAML 数组条目 |
| HTTP | 任意支持 Streamable HTTP 的客户端 | `url` + `headers` |

### 4.1 Claude Desktop

- 位置：`%APPDATA%\Claude\claude_desktop_config.json`
  （即 `C:\Users\<你>\AppData\Roaming\Claude\claude_desktop_config.json`）。
- 入口：应用菜单 **Settings → Developer → Edit Config**（会自动创建该文件）。
- 生效：**完全退出** Claude Desktop 再打开；只关窗口不算。
- 日志：`%APPDATA%\Claude\logs\mcp-server-wujian.log`（stderr 会落在这里）。

```json
{
  "mcpServers": {
    "wujian": {
      "command": "node",
      "args": [
        "D:\\五简个人资料\\2026年10月文件\\小木工作台\\wujian-jarvis\\mcp\\server.mjs"
      ],
      "env": {
        "WUJIAN_API_BASE": "http://127.0.0.1:4318",
        "WUJIAN_TIMEOUT_MS": "30000",
        "WUJIAN_ALLOW_WRITES": "0",
        "WUJIAN_ALLOW_TRADING": "0",
        "WUJIAN_ALLOW_EXPENSIVE": "0"
      }
    }
  }
}
```

说明：

- Claude Desktop 没有 `cwd` 字段，路径请全部写绝对路径（本配置里已全是绝对路径）。
- 若提示找不到 node，把 `"command"` 改成 `"C:\\Program Files\\nodejs\\node.exe"`。
- Claude Desktop 的本地配置只支持 stdio；要连 HTTP 端点需另加 stdio→HTTP 桥（见第 5 节末尾）。
- 成品文件：[claude_desktop_config.json](D:\五简个人资料\2026年10月文件\小木工作台\wujian-jarvis\mcp\adapters\claude_desktop_config.json)。

### 4.2 Cursor

- 项目级：`<项目>\.cursor\mcp.json`（可提交给团队）。
- 全局：`C:\Users\<你>\.cursor\mcp.json`（所有项目）。
- 两个文件会合并；同名服务器**项目级优先**。
- 生效：保存后重启 Cursor；日志在 Output 面板选 **MCP Logs**。

```json
{
  "mcpServers": {
    "wujian": {
      "command": "node",
      "args": [
        "D:\\五简个人资料\\2026年10月文件\\小木工作台\\wujian-jarvis\\mcp\\server.mjs"
      ],
      "env": {
        "WUJIAN_API_BASE": "http://127.0.0.1:4318",
        "WUJIAN_ALLOW_WRITES": "0",
        "WUJIAN_ALLOW_TRADING": "0",
        "WUJIAN_ALLOW_EXPENSIVE": "0",
        "WUJIAN_TIMEOUT_MS": "30000"
      }
    }
  }
}
```

成品文件：[cursor_mcp.json](D:\五简个人资料\2026年10月文件\小木工作台\wujian-jarvis\mcp\adapters\cursor_mcp.json)
（拷到 `.cursor\mcp.json` 即可用）。

### 4.3 Codex CLI

- 位置：`C:\Users\<你>\.codex\config.toml`。
- 生效：改完**重启 Codex**；新增的 MCP 工具只在新会话里出现。
- 本机已有同类配置可对照：`~/.codex/config.toml` 里
  `[mcp_servers.ima]`（`command` + `args` + `startup_timeout_sec`）与
  `[mcp_servers.jin10]`（`url` + `bearer_token_env_var`），本文格式与之完全一致。

```toml
[mcp_servers.wujian]
command = "node"
args = ['D:\五简个人资料\2026年10月文件\小木工作台\wujian-jarvis\mcp\server.mjs']
cwd = 'D:\五简个人资料\2026年10月文件\小木工作台\wujian-jarvis'
startup_timeout_sec = 30.0
env = { WUJIAN_API_BASE = "http://127.0.0.1:4318", WUJIAN_TIMEOUT_MS = "30000", WUJIAN_ALLOW_WRITES = "0", WUJIAN_ALLOW_TRADING = "0", WUJIAN_ALLOW_EXPENSIVE = "0" }
```

说明：

- TOML 单引号是字面量字符串，Windows 反斜杠**不用**转义；若改用双引号则必须写 `\\`。
- 部分 Codex 版本不接受 `cwd` 键；删掉这一行不影响运行（args 里已是绝对路径）。
- 成品文件：[codex_config.toml](D:\五简个人资料\2026年10月文件\小木工作台\wujian-jarvis\mcp\adapters\codex_config.toml)。

### 4.4 Continue

- 位置：`C:\Users\<你>\.continue\config.yaml`（旧版 `config.json` 已弃用）。
- `mcpServers` 是**列表**，每项必须写 `name` 和 `command`，可选 `args`、`env`、`cwd`、
  `connectionTimeout`（Continue 官方 config.yaml 参考）。

```yaml
name: My Config
version: 1.0.0
schema: v1
mcpServers:
  - name: wujian
    command: node
    args:
      - 'D:\五简个人资料\2026年10月文件\小木工作台\wujian-jarvis\mcp\server.mjs'
    cwd: 'D:\五简个人资料\2026年10月文件\小木工作台\wujian-jarvis'
    env:
      WUJIAN_API_BASE: 'http://127.0.0.1:4318'
      WUJIAN_TIMEOUT_MS: '30000'
      WUJIAN_ALLOW_WRITES: '0'
      WUJIAN_ALLOW_TRADING: '0'
      WUJIAN_ALLOW_EXPENSIVE: '0'
```

YAML 单引号里的 `\` 不会被当转义符，中文路径可原样写。

### 4.5 VS Code（Copilot MCP）

- 项目级：`.vscode\mcp.json`；全局：命令面板 **MCP: Open User Configuration**。
- 注意顶层键是 **`servers`**（不是 `mcpServers`），每项要写 `type: "stdio"`。
- 生效：保存后 VS Code 提示信任/启动该服务器；`MCP: List Servers` 可重启与看输出。

```json
{
  "servers": {
    "wujian": {
      "type": "stdio",
      "command": "node",
      "args": [
        "D:\\五简个人资料\\2026年10月文件\\小木工作台\\wujian-jarvis\\mcp\\server.mjs"
      ],
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

VS Code 的 stdio 条目没有 `cwd` 字段；同样以绝对路径运行即可。

### 4.6 Cline

- 位置（CLI）：`~/.cline/data/settings/cline_mcp_settings.json`，
  可用环境变量 `CLINE_MCP_SETTINGS_PATH` 覆盖。
- IDE 内路径：Cline 面板 → **MCP Servers** 图标 → **Configure** →
  **Configure MCP Servers**，打开的 JSON 里在 `mcpServers` 下加条目。
- 本地服务器用 `command` + `args`；远程服务器用 `url`。

```json
{
  "mcpServers": {
    "wujian": {
      "command": "node",
      "args": [
        "D:\\五简个人资料\\2026年10月文件\\小木工作台\\wujian-jarvis\\mcp\\server.mjs"
      ],
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

Cline 保存后会自动拉起进程；若工具没出现，先在 MCP Servers 页看该服务器的 stderr 输出。

### 4.7 任意通用 JSON

绝大多数客户端（Claude 系、Cursor、Cline、以及自写脚本）共用这一份 `mcpServers` 结构。
把下面的内容放进客户端要求的文件即可；多出来的 `cwd` 键若客户端不认，删掉不影响运行。

```json
{
  "mcpServers": {
    "wujian": {
      "command": "node",
      "args": [
        "D:\\五简个人资料\\2026年10月文件\\小木工作台\\wujian-jarvis\\mcp\\server.mjs"
      ],
      "cwd": "D:\\五简个人资料\\2026年10月文件\\小木工作台\\wujian-jarvis",
      "env": {
        "WUJIAN_API_BASE": "http://127.0.0.1:4318",
        "WUJIAN_TIMEOUT_MS": "30000",
        "WUJIAN_ALLOW_WRITES": "0",
        "WUJIAN_ALLOW_TRADING": "0",
        "WUJIAN_ALLOW_EXPENSIVE": "0"
      }
    }
  }
}
```

成品文件：[generic_stdio.json](D:\五简个人资料\2026年10月文件\小木工作台\wujian-jarvis\mcp\adapters\generic_stdio.json)。

### 4.8 DeepSeek Harness（DSH，实际可用）

**结论先说**：DSH 不读 `mcpServers` 这类 JSON。它的 MCP 配置是 **profile patch 层里的一条
Cordis Loader 条目**，插件包名 `@deepseek-ai/dsh-mcp-client`。

证据（当前 checkout 为打包的
[app.asar](E:\软件应用中心\deepseek\resources\app.asar)，解包副本在
`mcp\.research\dsh\`）：

1. 全库里检索 `mcpServers` 只有 202 处，全部落在第三方 vendored SDK
   （`@agentclientprotocol/sdk/dist/acp.js`、`@anthropic-ai/sdk/.../agents.ts`），
   **不是** DSH 自己的配置项；DSH 侧没有任何 `mcpServers` 配置 schema。
2. 真正的 MCP 入口是 `dsh-mcp-client`，其 `Config` schema 在
   [lib/index.js:781](D:\五简个人资料\2026年10月文件\小木工作台\wujian-jarvis\mcp\.research\dsh\dsh-mcp-client\lib\index.js:781)：
   `transport: "stdio" | "streamable-http"`、`serverName`、`command`、`args`、`env`、`cwd`、
   `url`、`headers`、`toolCallTimeoutMs`、`failOnStartupError`、`maxInstructionBytes`、`reconnect.*`。
3. 本机 profile 是 `C:\Users\<你>\.dsh\profiles\desktop\`：
   [cordis.yml](C:\Users\86199\.dsh\profiles\desktop\cordis.yml:1) 是空入口，注释写明树是
   「bundle → cordis.patch.yml → --patch」三层组合；
   [cordis.patch.yml](C:\Users\86199\.dsh\profiles\desktop\cordis.patch.yml:1) 才是用户补丁层。
4. `dsh-base` 只随附了 `mcp-resources`（资源读取工具），**没有**随附 `mcp-client`
   （见 [dsh-base/cordis.patch.yml:492](D:\五简个人资料\2026年10月文件\小木工作台\wujian-jarvis\mcp\.research\dsh\misc\pkg-dsh-base\cordis.patch.yml:492)）。
   所以必须自己加一行。
5. checkout 的设置类包里没有 MCP 配置页（`settings` 分区只有 account / general / models /
   agent-loop / subagent / web-search / shell / plugins / session-log 等），
   配置入口就是 profile patch 文件，不是图形设置。

> 说明：DSH 的 `app.asar\dsh\` 是打包产物里的虚拟路径，磁盘上并不存在同名目录；
> 上面的证据是把 asar 内对应文件解包到 `mcp\.research\dsh\` 后读到的。

配置位置：`C:\Users\<你>\.dsh\profiles\desktop\cordis.patch.yml`
（顶层是 YAML 数组）。**新增行必须包在 `insert:` 下**，直接写 `- id:` 只会去覆盖同 id 的已有行：

```yaml
- insert:
    - id: mcp-wujian
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: wujian
        transport: stdio
        command: 'C:\Program Files\nodejs\node.exe'
        args:
          - 'D:\五简个人资料\2026年10月文件\小木工作台\wujian-jarvis\mcp\server.mjs'
        cwd: 'D:\五简个人资料\2026年10月文件\小木工作台\wujian-jarvis'
        env:
          WUJIAN_API_BASE: 'http://127.0.0.1:4318'
          WUJIAN_TIMEOUT_MS: '30000'
          WUJIAN_ALLOW_WRITES: '0'
          WUJIAN_ALLOW_TRADING: '0'
          WUJIAN_ALLOW_EXPENSIVE: '0'
        toolCallTimeoutMs: 60000
        failOnStartupError: false
```

为什么必须 `insert:`——这是 app-boot 的 patch 语义，不是风格问题：

- 带 `insert` 的条目：`id` 指向已有 group 就插进去，没有 `id` 就整体追加到根
  （`data.push(...insert)`）；
- 不带 `insert` 的条目：按 `id` 找到已有行后**整体替换**它的字段；找不到就
  `warn("patch: entry %C not found")` 并跳过。

见 [app-boot/lib/index.js:61](D:\五简个人资料\2026年10月文件\小木工作台\wujian-jarvis\mcp\.research\dsh\misc\pkg-dsh-app-boot\lib\index.js:61) 的 `applyEntryPatches`。
`dsh-mcp-client` README 里的「最小配置」是**行片段**（不含 `insert` 包装），
官方 skill 模板 [templates/mcp/cordis.patch.yml](D:\五简个人资料\2026年10月文件\小木工作台\wujian-jarvis\mcp\.research\dsh\misc\pkg-dsh-agent-preset\skills\cordis-plugin-development\templates\mcp\cordis.patch.yml:1)
用的就是 `- insert:` 形式，直接照它写。

> 注意：`dsh-base` 的 patch 是「一次 insert 铺满空 profile 根」，之后各层都按 id 改写；
> 所以 `cordis.patch.yml` 里已有的 `- id: agent-default-model` 那几条是覆盖，不是新增。
> 不要把 MCP 条目写成同样形状，否则会被静默跳过（只在 stderr 留一条警告）。

关键细节（都来自 `dsh-mcp-client` 源码/文档，不要凭猜测改）：

| 事项 | 规则 |
| --- | --- |
| `serverName` | 必填，`[A-Za-z0-9_-]{1,32}`，同一作用域内唯一；重名会在加载时报错 |
| 工具名 | 模型看到的是 `mcp__<serverName>__<原始工具名>`，即 `mcp__wujian__wujian_brief` |
| 环境清洗 | stdio 子进程环境会删掉匹配 `/KEY|PASSWORD|SECRET|TOKEN/i` 的变量名和所有 `DSH_*`，**再合并**你写的 `env`。所以 `WUJIAN_API_BASE`、`WUJIAN_MCP_TOKEN` 必须在 `env` 里显式写，不会自动继承 |
| 启动失败 | `failOnStartupError` 默认 `false`：连不上不阻塞 DSH 启动，只是工具不出现并记一条错误 |
| 生效方式 | 启用 `dsh-hmr` 时，profile 的两份 patch 文件会被监视并热重载；HMR 关闭时改完要重启 DSH |
| 资源工具 | `dsh-base` 已挂 `mcp-resources`，配置服务器后自动出现 `list_mcp_resources` / `list_mcp_resource_templates` / `read_mcp_resource`，不用额外配置 |
| 提示词模板 | DSH 不支持 MCP prompts 模板；`resources` 按需读取 |

DSH 走 HTTP 时改成（同样要 `insert:` 包装）：

```yaml
- insert:
    - id: mcp-wujian-http
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: wujian
        transport: streamable-http
        url: 'http://127.0.0.1:4319/mcp'
        headers:
          Authorization: !!js '`Bearer ${process.env.WUJIAN_MCP_TOKEN}`'
```

`cordis.patch.yml` 顶部注释明确允许 `!!js` 表达式，所以 Token 从环境变量注入、不落文件。
注意 `serverName` 在同一作用域内唯一：stdio 和 HTTP 两条不要同时启用，或者把 `serverName` 改成不同值。

> 若你用的是别的 DSH profile（如 headless / 自定义目录），把同样的条目写进该 profile 的
> `cordis.patch.yml` 即可；不要把条目写进 `cordis.yml`（它是空入口，会被上层覆盖）。

---

## 5. HTTP 方式（Streamable HTTP）

### 5.1 启动

```powershell
cd "D:\五简个人资料\2026年10月文件\小木工作台\wujian-jarvis"
$env:WUJIAN_MCP_TOKEN = "换成一个足够长的随机串"   # 可选；设置后必须带 Bearer
node mcp/server.mjs --http --port 4319
```

- 默认绑定 `127.0.0.1:4319`，**不暴露到公网**（SPEC §3）。
- 协议端点：`POST http://127.0.0.1:4319/mcp`（JSON-RPC 2.0）。
- 辅助端点：`GET /health`、`GET /catalog`、`GET /openapi.json`。
- `WUJIAN_MCP_TOKEN` 为空 → 不校验；非空 → 每个请求都要
  `Authorization: Bearer <token>`，否则 401。

### 5.2 手测

```powershell
# 健康检查（未设 token 时可直接访问；若返回 401 就补上 -H "Authorization: Bearer ..."）
curl.exe -s http://127.0.0.1:4319/health

# 列出工具（设置了 token 才需要 -H）
curl.exe -s -X POST http://127.0.0.1:4319/mcp `
  -H "Content-Type: application/json" `
  -H "Authorization: Bearer $env:WUJIAN_MCP_TOKEN" `
  -d '{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\"}'
```

PowerShell 里也可以：

```powershell
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:4319/mcp `
  -ContentType 'application/json' `
  -Headers @{ Authorization = "Bearer $env:WUJIAN_MCP_TOKEN" } `
  -Body '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

### 5.3 各客户端接 HTTP

- **Cursor**（`mcpServers` 条目支持 `url`/`headers`）：

  ```json
  {
    "mcpServers": {
      "wujian": {
        "url": "http://127.0.0.1:4319/mcp",
        "headers": { "Authorization": "Bearer 你的TOKEN" }
      }
    }
  }
  ```

- **VS Code**（`servers` + `type: "http"`，敏感值用 input 变量，避免入库）：

  ```json
  {
    "inputs": [
      { "type": "promptString", "id": "wujian-token", "description": "小木 MCP Token", "password": true }
    ],
    "servers": {
      "wujian": {
        "type": "http",
        "url": "http://127.0.0.1:4319/mcp",
        "headers": { "Authorization": "Bearer ${input:wujian-token}" }
      }
    }
  }
  ```

- **Codex**（只写环境变量名，不写明文）：

  ```toml
  [mcp_servers.wujian-http]
  url = "http://127.0.0.1:4319/mcp"
  bearer_token_env_var = "WUJIAN_MCP_TOKEN"
  ```

- **Cline**：远程服务器页填 **Server URL** = `http://127.0.0.1:4319/mcp`，传输选
  **Streamable HTTP**（不要选已弃用的 SSE）。
- **Continue**：把 `mcpServers` 条目改成 `url` 形式，并在 `requestOptions.headers` 里带
  `Authorization`（Continue 的 `requestOptions` 与模型配置同格式）。
- **Claude Desktop**：本地配置只支持 stdio，连 HTTP 需要额外的 stdio→HTTP 桥进程
  （如社区 `mcp-remote`）。本仓库不内置该桥，**未验证**；本机建议直接用 stdio 模式。

> 只连本机时优先 stdio：无端口、无 token、随客户端启停，故障面最小。HTTP 适合
> 多个 Agent 共享一个常驻进程，或客户端只支持远程 MCP 的情况。

---

## 6. Windows 路径与转义

中文目录与空格都不影响 MCP，只要按各格式的转义规则写：

| 格式 | 写法 | 注意 |
| --- | --- | --- |
| JSON | `"D:\\五简个人资料\\...\\server.mjs"` 或 `"D:/五简个人资料/.../server.mjs"` | 反斜杠必须双写；不要用 `\u` 转义中文 |
| TOML | `'D:\五简个人资料\...\server.mjs'` | 单引号字面量免转义；双引号内需 `\\` |
| YAML（DSH / Continue） | `'D:\五简个人资料\...\server.mjs'` | 单引号免转义；双引号内 `\` 是转义符，容易踩坑 |
| PowerShell 命令 | `node "D:\五简个人资料\...\server.mjs"` | 路径含空格/中文时一定要加引号 |

其它坑：

1. **GUI 客户端不继承终端 PATH**：Claude Desktop、Cursor 从图形界面启动时可能找不到 `node`。
   把 `command` 改成绝对路径 `C:\Program Files\nodejs\node.exe`。
2. **不要用 `~` 或相对路径**：MCP 子进程的工作目录由客户端决定，`~\` 在 Windows 上不展开。
3. **不要复制 `\\?\` 长路径前缀**：部分客户端会拒绝。
4. **JSON 不允许注释和尾逗号**：改完先用 `node -e "JSON.parse(require('fs').readFileSync('文件','utf8'))"` 校验。
5. **改完必须重启客户端**：Claude Desktop 要完全退出；Codex 新会话才加载新工具。
6. 本机 `.env` 只在 `npm start` 时通过 `--env-file-if-exists` 读取，**不会**传给 MCP 子进程；
   MCP 的变量一律写在客户端配置的 `env` 里。

---

## 7. 排错顺序

按顺序排查，基本能定位到层：

| 现象 | 大概率原因 | 处理 |
| --- | --- | --- |
| 客户端里没有 `wujian` 服务器 | 配置写错位置/键名 | 对照第 4 节：VS Code 是 `servers`，其余多为 `mcpServers` |
| 服务器显示已连接但没有工具 | 服务没起 / 权限开关导致工具为空 | 先 `curl.exe http://127.0.0.1:4318/api/status`；只读工具本应存在 |
| 工具调用报 `ECONNREFUSED` | 小木服务未启动 | `npm start`，确认 4318 监听 |
| 403「仅允许本地访问」 | 访问用了机器名或非 4318 端口 | `WUJIAN_API_BASE` 必须是 `http://127.0.0.1:4318` |
| 403「来源校验失败」 | 直连小木发 POST 没带 Origin | 别绕过 MCP 直连；用 MCP 工具或 CLI |
| HTTP 401 | 设了 `WUJIAN_MCP_TOKEN` 但没带 Bearer | 补 `Authorization` 头，或重启时清空该变量 |
| 没有 `wujian_write` / `wujian_trading` | 对应 `ALLOW_*` 仍是 `"0"` | 逐级打开，改完重启客户端 |
| `node: command not found`（DSH/Claude） | 客户端 PATH 里没有 node | `command` 写 `C:\Program Files\nodejs\node.exe` |
| DSH 报 `serverName ... already in use` | 同一作用域重复 `serverName` | 换名或删掉重复条目 |
| DSH 工具不出现但 DSH 正常启动 | 首次连接失败（`failOnStartupError: false`） | 看 DSH 日志里 `mcp-client(wujian)` 的错误，手动跑一遍命令复现 |

手动复现（排除客户端因素）：

```powershell
cd "D:\五简个人资料\2026年10月文件\小木工作台\wujian-jarvis"
node mcp/server.mjs --selftest
```

---

## 8. 安全边界

- 默认全只读，写/交易/昂贵动作三级开关默认 `0`；这是刻意的默认值。
- Token、App Secret、API Key 只放本机 `.env` 或客户端的环境变量；**不要**写进
  `mcp/adapters/*`、`.cursor/mcp.json`、`.vscode/mcp.json` 这些会进版本库的文件。
- HTTP 只绑 `127.0.0.1`，不要用反向代理把它开到公网；确需远程访问时先加 TLS 与鉴权。
- MCP 不直连数据库、不写 `.runtime`，所有写操作仍受小木服务端权限与人工批准约束。
- 给 Agent 的提示词里不要贴真实 Token；DSH 用 `!!js process.env.WUJIAN_MCP_TOKEN` 注入。

---

## 9. 事实来源

| 结论 | 来源 |
| --- | --- |
| 环境变量、HTTP 端口、权限分级、工具清单 | [mcp/SPEC.md](D:\五简个人资料\2026年10月文件\小木工作台\wujian-jarvis\mcp\SPEC.md:30) §3–§5、§8 |
| Node `>=22` | [package.json:14](D:\五简个人资料\2026年10月文件\小木工作台\wujian-jarvis\package.json:14) |
| 4318 端口、只监听 127.0.0.1、Host/Origin 校验 | [server.mjs:48](D:\五简个人资料\2026年10月文件\小木工作台\wujian-jarvis\server.mjs:48)、[server.mjs:62](D:\五简个人资料\2026年10月文件\小木工作台\wujian-jarvis\server.mjs:62)、[server.mjs:267](D:\五简个人资料\2026年10月文件\小木工作台\wujian-jarvis\server.mjs:267) |
| DSH 用 Cordis 条目而非 `mcpServers` | DSH 打包产物 `E:\软件应用中心\deepseek\resources\app.asar` 内 `@deepseek-ai/dsh-mcp-client`；解包副本 [README.zh.md](D:\五简个人资料\2026年10月文件\小木工作台\wujian-jarvis\mcp\.research\dsh\dsh-mcp-client\README.zh.md:28) 与 [lib/index.js:781](D:\五简个人资料\2026年10月文件\小木工作台\wujian-jarvis\mcp\.research\dsh\dsh-mcp-client\lib\index.js:781) |
| DSH profile 三层组合、`!!js` 允许 | [cordis.yml](C:\Users\86199\.dsh\profiles\desktop\cordis.yml:1)、[cordis.patch.yml](C:\Users\86199\.dsh\profiles\desktop\cordis.patch.yml:1) |
| DSH 新增行必须用 `insert:` | [app-boot/lib/index.js:61](D:\五简个人资料\2026年10月文件\小木工作台\wujian-jarvis\mcp\.research\dsh\misc\pkg-dsh-app-boot\lib\index.js:61) `applyEntryPatches`；官方模板 [cordis.patch.yml](D:\五简个人资料\2026年10月文件\小木工作台\wujian-jarvis\mcp\.research\dsh\misc\pkg-dsh-agent-preset\skills\cordis-plugin-development\templates\mcp\cordis.patch.yml:1) |
| Codex `[mcp_servers.*]` 键名与 `bearer_token_env_var` | 本机 `C:\Users\<你>\.codex\config.toml` 既有 `[mcp_servers.ima]` / `[mcp_servers.jin10]` |
| Claude Desktop 配置位置与格式 | [modelcontextprotocol.io 本地服务器指南](https://modelcontextprotocol.io/docs/develop/connect-local-servers) |
| Cursor `.cursor/mcp.json`、全局合并规则 | [Cursor MCP 文档](https://cursor.com/help/customization/mcp) |
| VS Code `servers` / `type: stdio` / `inputs` | [VS Code MCP 配置参考](https://code.visualstudio.com/docs/copilot/reference/mcp-configuration) |
| Continue `config.yaml` 的 `mcpServers` 列表与 `cwd` | [Continue config.yaml 参考](https://docs.continue.org.cn/reference) |
| Cline `cline_mcp_settings.json`、`CLINE_MCP_SETTINGS_PATH` | [Cline MCP 文档](https://docs.cline.bot/mcp/mcp-overview) |
