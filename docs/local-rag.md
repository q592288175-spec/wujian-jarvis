# 小木本地知识库使用说明

## 作用

小木文字助手会先检索同级 `资料包\资料实验基地`，再根据问题决定是否读取行情或联网查询官方资料。回答下方显示本地文件和网页来源；点击本地来源可在工作台查看实际命中文段。

原资料只读。索引、中文语义模型和运行记录保存在：

`D:\五简个人资料\项目\wujian-jarvis\.runtime\knowledge`

行情库、五行业务库和知识库彼此独立。

## 首次安装

使用项目现有 Python 环境安装依赖：

```powershell
.\.venv-akshare\Scripts\python.exe -m pip install -r requirements.akshare.txt
```

首次点击助手中的“增量更新知识库”会下载 `BAAI/bge-small-zh-v1.5`，约 90 MB。下载后可离线使用。模型不可用时，系统自动使用中文全文和精确词检索，并在助手顶部显示“全文降级”。

## 更新

日常使用助手顶部的刷新图标即可。更新按 SHA-256 判断变化，只重建新增或修改的文件；内容重复的文件保留所有路径，但不重复生成分块。

命令行增量更新：

```powershell
.\.venv-akshare\Scripts\python.exe -X utf8 integrations\knowledge_rag.py --db .runtime\knowledge\knowledge.sqlite --cache .runtime\knowledge\models --root "..\资料包\资料实验基地" reindex
```

完全重建时在末尾增加 `--full`。只验证解析、不生成向量时增加 `--no-embeddings`。

## 状态与检索

```powershell
.\.venv-akshare\Scripts\python.exe -X utf8 integrations\knowledge_rag.py --db .runtime\knowledge\knowledge.sqlite --cache .runtime\knowledge\models status
.\.venv-akshare\Scripts\python.exe -X utf8 integrations\knowledge_rag.py --db .runtime\knowledge\knowledge.sqlite --cache .runtime\knowledge\models search "单轮风险上限"
```

本机服务同时提供：

- `GET /api/knowledge/status`
- `POST /api/knowledge/reindex`
- `POST /api/knowledge/search`
- `GET /api/knowledge/source/:chunkId`

## 权威与边界

默认顺序是当前系统手册与正式规则、当前工具说明、证据资料、研究报告、运行记录、历史资料。出现冲突时，小木必须显示来源和缺口，不自行把不同版本合成新规则。

聊天沟通偏好与交易规则分开保存。当前已确认简体中文、先结论后依据、品种中文名、资料不足不猜、一次只问一个关键问题、交易由用户人工批准。引用聊天 `01a0e190-e0cb-7072-8a41-6c14d835b36c` 因本轮环境没有 `read_thread` 工具，保持待导入状态。

联网结果默认只服务当前回答，不自动写入正式知识库。助手没有自动下单、自动批准或自动修改规则的权限。

## 2026-09-29 验收记录

- 资料台账：368个有效文件；359个全文解析、7张PNG仅登记、2个重复内容保留来源，解析失败0个。`__pycache__`中的4个`.pyc`生成缓存按规则排除。
- 索引：15,489个分块，15,489个中文语义向量，状态`ready`；无变化增量扫描约1.4秒。
- 真实检索：火扫描问题优先命中当前系统手册“火：识别机会”，正确返回具体主力成交量和持仓量均严格大于2万手；金规则问题命中冻结预算不因浮盈扩充、换月不重置。
- 真实联网：DeepSeek调用上期所官网公告工具，返回公告日期、标题和原文链接；标题未冒充全文。
- 界面：桌面1440×900和手机390×844均无横向溢出；助手状态、会话、来源列表和原文弹窗实际可用。截图在`output/playwright/knowledge-assistant-*.png`。
- 自动检查：127项Node测试、7项Python测试通过；知识库脚本和相关JavaScript语法检查通过。
