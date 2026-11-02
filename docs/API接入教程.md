# 小木 API 接入教程

适用：2026-10-28 版小木源码仓库及源码 Release。教程按当前代码核对，不包含作者的密钥、账户或付费权限。服务商界面、型号和额度可能调整，以你自己的控制台为准。

**第一次使用，只配置 DeepSeek 即可接通文字问答和AI研究。** 其余连接按需增加，无须一次申请全部服务。

## 1. 先弄清每项连接的用途

| 想使用的功能 | 需要什么 | 配置位置 |
| --- | --- | --- |
| 小木文字问答、AI深度研究、复盘解释 | DeepSeek API Key | 项目根目录 `.env` |
| 增加研究的联网搜索来源 | 元宝搜索 WSA **服务 API Key**，可选 | `.env` |
| 语音通话 | 火山豆包语音凭据，以及已经配好的 DeepSeek | Windows本机配置向导，或 `.env` |
| 公开行情、盘后刷新 | 对应Python依赖与网络，一般无需上述模型密钥 | 页面“刷新盘后数据”“同步数据” |
| 天勤/快期行情或盯盘 | 自己的快期服务账号及行情权限，可选 | 顶部“行情连接”填写账号密码 |
| 飞书手机提醒 | 自己授权的飞书机器人和接收目标，可选 | 盯盘提醒“连接与通知”扫码绑定，或 `.env` |
| 金十MCP来源 | 自己的金十MCP Token，可选 | `.env` 或资料来源连接设置 |

服务商的聊天会员和API调用权限不是同一个概念。能在某款聊天软件里对话，不代表已经开通小木使用的API。

## 2. 找到正确的目录，创建配置文件

仓库和源码ZIP保留了以下结构：

```text
仓库或解压根目录/
  README.md
  小木工作台/
    wujian-jarvis/       ← 以下命令在这里执行
      package.json
      .env.example
      server.mjs
    资料包/
  1_交易/
```

进入 `小木工作台/wujian-jarvis`，能同时看到 `package.json`、`.env.example` 和 `server.mjs` 才是正确位置。

源码版先安装 Node.js 22以上、Python 3.13，并执行：

```powershell
npm ci
py -3.13 -m venv .venv-akshare
.\.venv-akshare\Scripts\python.exe -m pip install -r requirements.akshare.txt
```

在同一目录创建并打开配置文件。已有 `.env` 时保留原文件，只编辑需要变更的行：

```powershell
if (-not (Test-Path -LiteralPath .env)) {
    Copy-Item -LiteralPath .env.example -Destination .env
}
notepad .env
```

文件名必须是 `.env`，不是 `.env.txt`。每行写 `变量名=值`，同一变量只保留一行；包含空格或 `#` 等字符的值用双引号包住。保存为UTF-8。下文“填写你自己的……”都是占位文字，需要替换。

`.env` 由服务启动时读取。修改后，先保存页面里正在编辑的内容，再完全退出小木并重新启动；仅按Ctrl+R不会让后台重新读取密钥。源码启动命令为：

```powershell
npm start
```

打开 `http://127.0.0.1:4318/market-panorama.html`。不要把这个本机服务直接暴露到公网。

## 3. DeepSeek：先接通文字与研究

1. 打开 [DeepSeek开放平台](https://platform.deepseek.com/)，登录自己的账号。
2. 在API密钥管理页面创建密钥，并确认账号具有可用余额或额度。
3. 参考 [官方首次调用说明](https://api-docs.deepseek.com/zh-cn/) 核对模型名称。当前小木默认使用 `deepseek-flash`。
4. 在 `.env` 填写：

```dotenv
DEEPSEEK_API_KEY=填写你自己的DeepSeek密钥
DEEPSEEK_MODEL=deepseek-flash
PORT=4318
```

当前适配器固定请求 `https://api.deepseek.com/chat/completions`，同时使用工具调用与思考模式参数。不能把另一家平台的Key直接填进来，就当成已经切换模型；本版没有通用的模型Base URL设置界面。

### 怎么确认成功

重新启动后，在PowerShell执行：

```powershell
Invoke-RestMethod http://127.0.0.1:4318/api/llm/status |
    Select-Object provider, model, configured
```

`provider` 应为 `DeepSeek`，`configured` 应为 `True`。**True只说明程序读到了配置，不代表密钥已通过平台验证。** 随后在“小木对话”发送一句简单的连接测试，收到正常回答，才能确认实际调用成功。

再从“火·识别机会”选一个品种进入“水·分析机会”，点击“启动AI深度研究”，核对报告状态、来源链接及数据日期。首次研究时间取决于数据源和模型响应，不以固定秒数作为成功标准。

## 4. 元宝搜索 WSA：为研究增加联网来源

此项可选；未配置时，小木仍尝试现有公开来源，并显示取得的证据和缺口。

1. 进入 [腾讯云元宝搜索控制台](https://console.cloud.tencent.com/wsa)，按控制台要求开通服务。
2. 按 [服务API KEY方式](https://cloud.tencent.com/document/product/1806/130615)，在“概览 → 服务API KEY方式”创建服务密钥。
3. 将这一个服务Key填写到 `.env`：

```dotenv
TENCENTCLOUD_WSA_APIKEY=填写你自己的元宝搜索服务Key
WUJIAN_SEARCH_DAILY_LIMIT=60
```

**这里填写的是元宝搜索服务 API Key，不是腾讯云账户级 SecretId 或 SecretKey。** 当前代码使用 Bearer 鉴权调用 `https://api.wsa.cloud.tencent.com/SearchPro`，并未实现SecretId/SecretKey签名接入。

`60` 是本机代码限制的每日最多请求次数，不是腾讯云赠送额度。可以按需要调小；设为 `0` 会阻止本机WSA调用，仍可回退公开来源。实际收费、试用额度、并发限制和服务开通状态以官方控制台为准。

### 怎么确认成功

重启后，在项目目录执行以下只读配置检查，不会发起搜索：

```powershell
node --env-file-if-exists=.env --input-type=module -e "import {searchStatus} from './integrations/research-search.mjs'; console.log(searchStatus());"
```

配置后应看到 `configured: true` 及设置的 `dailyLimit`。随后由你主动启动一次水研究，查看该次报告的来源、搜索错误或缺口；配置状态为True不等于搜索请求已成功。搜索返回空、限额或授权失败时，程序可能使用公开来源继续研究，不应把这种回退理解为WSA已接通。

## 5. 火山豆包语音：接通“小木语音通话”

先完成第3节的DeepSeek配置。当前默认语音入口需要语音服务凭据，研究回答仍交给DeepSeek。

### 在哪申请

进入 [火山引擎控制台](https://console.volcengine.com/)，开通需要的豆包实时语音能力，并在语音服务对应项目的API管理页面创建Key。项目和服务权限要与所调用的能力一致。参考 [官方控制台指引](https://docs.volcengine.com/docs/DoubaoVoice/console-guidance?lang=zh) 和 [API Key使用说明](https://docs.volcengine.com/docs/DoubaoVoice/APIKeyUsage?lang=en)。

小木接受语音服务的 **API Key**，或平台为该语音能力提供的 **APP ID + Access Token**；不使用账户级AK/SK，也不能拿普通文本模型的Ark Key冒充语音Key。

### Windows推荐配置方式

在项目目录运行：

```powershell
powershell.exe -NoProfile -File .\scripts\configure-voice.ps1
```

按提示选择“API Key”或“APP ID + Access Token”。密钥通过隐藏输入填写，保存到本机 `.runtime/private/voice.enc`，使用Windows当前用户加密。随后完全退出并重启小木。

若电脑策略阻止脚本运行，按设备管理员的规定处理，或使用下面的环境变量方式，不要关闭系统安全防护。

### 环境变量方式

已有加密配置优先于环境变量。没有本机加密配置时，可在 `.env` 使用以下一种方式：

```dotenv
VOLC_VOICE_PROTOCOL=duplex
VOLC_VOICE_API_KEY=填写你自己的语音服务Key
```

或：

```dotenv
VOLC_VOICE_PROTOCOL=duplex
VOLC_VOICE_APP_ID=填写语音服务的数字APP_ID
VOLC_VOICE_ACCESS_TOKEN=填写对应AccessToken
```

若已经通过向导保存过配置，之后要换Key，应重新运行向导；只改 `.env` 可能仍沿用加密配置。不要把别人的 `voice.enc` 复制到自己电脑使用。

### 怎么确认成功

打开 `http://127.0.0.1:4318/api/volc/status` 检查配置状态，再在小木点击“语音通话”，允许麦克风，说一句简单问题，核对识别文字和实际声音。状态显示已配置不能代替实际听到回复。

`.env.example` 中的 `OPENAI_API_KEY` 属于另一条可选链路，不是本节默认方案的必填项。本教程不将尚未验证的其他语音链路作为开通保证。

## 6. 行情：先分清公开源与天勤

### 公开行情

安装盘后依赖后，在火页面“刷新盘后数据”，或市场页“同步数据”。公开源可能延迟、拒绝访问或缺少部分合约；核对页面显示的时间、合约和缺口即可，不需要为此填写DeepSeek、WSA或语音Key。

### 天勤/快期账号

使用 [快期账户中心](https://account.shinnytech.com/) 的服务账号，并核对你自己的行情权限。这个账号不是券商实盘资金账号。账号准备及SDK使用见 [TqSdk官方入门](https://doc.shinnytech.com/tqsdk/latest/quickstart.html)。数据数量、历史范围、用途和费用由官方及你的账号权限决定，本教程不保证固定免费根数。

源码版在项目目录建立独立环境：

```powershell
py -3.13 -m venv .venv-data
.\.venv-data\Scripts\python.exe -m pip install -r requirements.monitor.txt
```

小木已提供直接登录入口，Windows APP、浏览器和全息版共用同一个本机行情连接：

1. 点击顶部 **行情连接**，填写快期 / 天勤服务账号和密码。
2. Windows上可以勾选“在这台电脑加密记住”，重启后自动连接；不勾选则仅本次服务运行期间保留。
3. 点击 **登录并连接行情**。先显示登录核验，收到服务端心跳及报价后再核对“已连接”、合约数、实际价格和行情时间。
4. 休市时保留最后报价及原始时间；个别合约不可用会单列提示，其他可用合约继续接收。
5. 无需先创建盯盘提醒，也无需为了这个入口编辑 `.env` 或另外生成 API Key。认证失败、权限不足和运行库缺失都会分别显示。

天勤的同合约报价会用于市场全景的最新价、相对昨结涨跌幅、成交量和持仓量；每个品种保留实际来源与时间。尚未收到天勤报价的品种仍保留原来源标识。历史K线、席位、仓单、手续费和基本面继续使用各自来源，不会因为登录成功就冒充天勤数据。天勤没有为本机连接承诺覆盖所有品种或固定免费历史根数。

密码通过本机POST请求和采集器标准输入传递，不放在命令参数、页面存储或导出文件中。记住密码使用Windows当前用户加密，文件位于本机监控目录的 `tq-login.enc`；退出按钮会清除该保存凭据。旧桌面凭据在需要时兼容导入，已有规则和记录保持。

本机只读数据接口：`GET /api/tq/status` 查看连接与权限状态；`GET /api/tq/quotes` 获取实际收到的报价。登录为 `POST /api/tq/login`，字段为 `user`、`password`、`remember`。只能从本机受信任的小木页面提交。状态、报价和仓库都不回传账号密码。

若要运行项目的独立天勤行情脚本，在 `.env` 中填写：

```dotenv
TQ_USER=填写你自己的快期账号
TQ_PASSWORD=填写你自己的快期密码
TQ_PYTHON=.venv-data/Scripts/python.exe
TQ_SYMBOLS=KQ.m@SHFE.cu,KQ.m@SHFE.au,KQ.m@SHFE.rb
```

`TQ_SYMBOLS` 仅用于该独立脚本的订阅。完成后，在另一个项目终端运行：

```powershell
node --env-file-if-exists=.env integrations/start-market.mjs
```

此处不要运行 `npm run market` 来代替：当前这个npm命令启动的是盘后采集脚本。历史配置向导若提示该旧命令，以本节和实际 `package.json` 为准。以上连接是读取行情，不会赋予小木下单权限。

## 7. 飞书：把提醒发到自己的手机

### 先尝试小木内扫码

1. 打开“盯盘提醒 → 连接与通知”。
2. 点击“飞书扫码绑定”，用自己的飞书账号确认。
3. 在本人和机器人的单聊里按提示发送“绑定提醒”。
4. 点击“测试手机通知”，以手机实际收到为准；电脑通知需要单独测试。

若扫码方式受账号或组织策略限制，按平台管理员要求处理，或使用自己已经获授权的自建应用，不必反复生成二维码。

### 已有自建应用的手动配置

在 [飞书开放平台](https://open.feishu.cn/app) 创建或选择应用，开启机器人，取得App ID及App Secret。按功能开通发送消息、读取本人单聊，以及需要时的群内@机器人权限；接收事件使用长连接和 `im.message.receive_v1`。发布应用版本并确认使用者在可用范围内。参考 [官方消息与事件说明](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/im-v1)。

仅本人单聊的配置示例：

```dotenv
FEISHU_APP_ID=填写你自己的应用ID
FEISHU_APP_SECRET=填写你自己的应用Secret
FEISHU_ALLOWED_OPEN_IDS=填写你在该应用下的本人OpenID
FEISHU_RECEIVE_ID_TYPE=open_id
FEISHU_RECEIVE_ID=填写同一个本人OpenID
```

Open ID通常以 `ou_` 开头，应由当前应用的合法消息事件或官方工具取得；不要填写手机号、用户名或另一应用的用户ID。多个授权用户用英文逗号分隔。群聊需另外配置允许的群ID、机器人Open ID与目标类型，不能直接把单聊ID换成群名。

本机加密扫码绑定结果优先于环境变量。已有扫码绑定时，按页面管理或解除绑定后再切换配置，不要把两种方式混在一起排错。重启后可查看 `http://127.0.0.1:4318/api/feishu/status`；`configured`、`ready`、`targetConfigured` 分别表示配置、连接与目标校验，不等于手机已经送达。

本机服务关闭、电脑断网或休眠时，手机提醒也可能停止。开启定时推送与启用提醒是后续独立操作，绑定本身不代表已经启用全部通知。

## 8. 金十与其他外部来源

金十MCP使用自己的Token，申请与权限见 [金十MCP文档](https://mcp.jin10.com/app/doc.html)。在 `.env` 填入：

```dotenv
JIN10_MCP_TOKEN=填写你自己的金十MCP令牌
```

资料来源连接设置里保存的金十配置可能覆盖环境变量。是否可用，以实际复盘中取得的结果为准。

IMA连接依赖自己配置的外部客户端和知识库权限，并非填一项通用API Key即可使用；开源包不包含作者的IMA登录态或私人知识库。先使用已随仓库提供的本地框架与公开来源，确有需要再按对应适配器接入。

## 9. 按现象排错

| 现象 | 优先检查 |
| --- | --- |
| AI显示未配置 | `.env` 是否在 `package.json` 同一目录；是否误存为 `.env.txt`；是否完全重启后台 |
| DeepSeek 401 | 密钥是否来自DeepSeek、是否复制完整、是否多了空格或粘入了整个请求头 |
| DeepSeek 402 | 对应API账号余额或额度；聊天会员不能代替API余额 |
| 429或调用频率受限 | 平台额度、并发和频率；先停下重复点击，稍后重试 |
| 模型不存在或参数不支持 | 模型名、平台权限，以及是否误用另一服务商的密钥；核对官方可用型号 |
| WSA已配置但没有新来源 | 检查服务开通、服务Key、本机日限额和报告中的搜索错误；可能已经回退公开来源 |
| 语音更换Key后仍用旧配置 | 检查Windows加密配置的优先级，重新运行本机向导 |
| 语音有字无声音 | 分别检查语音服务回执、音频输出设备、浏览器麦克风/声音权限和实际播放；不要只看“已连接” |
| 飞书21001或访问策略拒绝 | 核对账号所属组织、应用可用范围及访问控制策略；不要据此认定测试消息已经到手机 |
| 飞书已绑定但没消息 | 目标ID与允许列表、本人单聊“绑定提醒”、应用发布和消息权限；检查真实送达 |
| 天勤连接失败 | 服务账号、密码、Python解释器、SDK依赖和该账号的行情权限 |
| 提示4318端口冲突 | 保存工作后正常退出旧小木，再重新启动；不要随意结束其他程序 |

## 10. 分享和备份时保留什么

可以分享源码、空白 `.env.example`、许可证和这份教程。自己的 `.env`、`.runtime/private`、登录配置、账户数据库、研究记录和操作记录只保存在自己的设备或授权备份中。

若密钥误传到公开仓库，先到服务商控制台撤销或轮换，再处理仓库历史；仅删除页面上的一行不能撤回已泄露的密钥。正常配置和排错不需要把密码、Token或完整配置文件发给作者。

## 代码核对入口

- [环境变量示例](../.env.example)
- [DeepSeek适配器](../integrations/deepseek.mjs)
- [元宝搜索适配器](../integrations/research-search.mjs)
- [语音配置优先级](../integrations/voice-config.mjs)
- [行情进程启动](../integrations/start-market.mjs)
- [盯盘行情连接](../integrations/monitor-service.mjs)
- [飞书配置与允许列表](../integrations/feishu.mjs)
- [金十配置优先级](../integrations/postmarket-sources.mjs)

教程已核对字段、脚本和本机状态接口；没有用读者尚未提供的密钥替读者完成付费调用或验证其账号权限。
