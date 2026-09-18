# v0.2.0 接入预览与验收

本轮按用户提供的“创建私有仓库”对话方案实施第一步：现有实时语音改进和独立行情适配层。不是全阶段完成，也不是正式实盘行情验收通过。

## 已实现

- TqSdk 独立 Python 采集进程；显式 TqSim 内部模拟账户，只读取行情，未提供下单调用。
- 配置最多20个订阅，主连解析实际合约；日K、昨结算口径涨跌幅、成交持仓、买卖一、涨跌停、行情和接收时间。
- 快照原子写入，进程失败指数退避；Node 标注过期心跳；未获取数据不回退为随机价格。
- 数据来源页新增独立行情表和可切换实际合约日K。首页保留明确标记的演示面板。
- Agent 共享只读工具 get_market_snapshot / resolve_contract / get_bars。
- Realtime 语义VAD和中文转写、增量字幕、聆听/用户讲话/处理/工具/播报状态、停止播报按钮。停止播报不取消任务。
- 短暂断线等1.5秒，最多自动重建两次新会话，不重放旧对话或工具请求；旧会话异步结果不会注入新会话。
- 内存记录连接耗时、说完到音频开始耗时和停止播报时点；未声称获得实际延迟数字。

## 启动

Node 22+。`npm start` 启动工作台，`/cockpit.html` 打开驾驶舱。

行情另开一个终端：

```sh
python3 -m venv .venv-data
.venv-data/bin/python -m pip install -r integrations/tq-requirements.txt
# 在本机 .env 配置 TQ_USER / TQ_PASSWORD；不要提交文件或在聊天发送凭据。
npm run market
```

TQ_SYMBOLS 是逗号分隔的订阅列表，默认三条主连；可以改成实际合约。天勤服务账号不是期货实盘账号。数据权限以自己的订阅授权为准。

语音继续使用本机 OPENAI_API_KEY，真实通话需要配置后重启服务并进行麦克风验收。不会从 Codex 登录自动取得 API Key。

## 验收与未完成项

自动测试覆盖：缺快照、过期心跳、无效时间、连接失败；重复工具事件、旧会话结果隔离、停止播报不取消业务任务。另有本地HTTP验收：行情查询空值、工具通路、下单工具拒绝。

浏览器已检查数据来源页的未连接状态。没有天勤账号及模型Key，未完成真实行情核对、真麦克风、断网重连实测、噪音环境插话或延迟测量。

交易日字段明确 unknown：交易日历、节假日和夜盘跨日映射尚未实现。进程心跳不等于供应商连接正常，更不等于每条价格新鲜；当前状态使用“已收到行情 · 时效请核对”，展示供应商行情时间，不标为已验证实时。

自选管理目前通过配置列表实现；自动刷新主面板、多周期、过期行情门禁、持久任务、研究卡和 Codex Live 适配器属于后续工作。本轮未复制或集成 HomeRail 源码，不称为已接通 HomeRail。

## 回滚

本轮之前的提交为 `942057c`，保留 tag `baseline-before-data-voice-v2`。可在独立目录查看原版：

```sh
git worktree add ../wujian-jarvis-baseline baseline-before-data-voice-v2
```

退出当前服务，再从旧目录启动即可。不会覆盖当前代码、.env 或运行记录。

## 参考

- https://github.com/xiaotianfotos/homerail/blob/main/README.zh-CN.md （设计参考，未复制代码）
- https://developers.openai.com/api/docs/guides/realtime-vad
- https://doc.shinnytech.com/tqsdk/latest/reference/tqsdk.api.html
