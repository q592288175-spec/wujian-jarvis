# 盘点证据（只读）

本目录是 2026-11-03 建设 MCP/CLI 时从现行 `server.mjs` 与 `dist/` 前端提取的事实清单，
不是运行依赖。`mcp/catalog.mjs` 只读取 `mcp/endpoints.json` 与 `mcp/ui.json`。

- `api-inventory.json`：176 条路由，含方法、路径、分类、权限、参数、返回说明、源码行号。
- `ui-inventory.json`：23 个页面、210 个按钮/动作，含选择器、调用的 API、建议 MCP 工具、风险级别。
- `dsh/`：从 DSH 打包产物解包出的 `dsh-mcp-client` 配置 schema 与示例，用于 `adapters/AGENT-SETUP.md` 的 DSH 章节；不含凭据。

重新盘点时不要手工修改这些文件后再当运行时配置；以 `server.mjs` 和 `dist/` 当前代码为准。
