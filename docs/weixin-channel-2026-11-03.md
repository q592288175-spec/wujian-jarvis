# 微信事件推送接入说明（2026-11-03）

## 当前真实状态

- 已下载并审阅腾讯官方 `@tencent-weixin/openclaw-weixin-cli` 2.1.4，源码及安装日志保存在 `.runtime/vendor/weixin-20261103/`。
- 已执行官方安装器。退出码1，提示未找到OpenClaw。本机不把它伪装为已安装成功，也没有安装无关的OpenClaw宿主。
- 小木新增独立通知适配 `integrations/weixin-channel.mjs`，按腾讯公开iLink协议直接扫码连接；兼容此次核验的官方插件协议元数据2.4.10。小木不依赖OpenClaw运行。
- 真实腾讯二维码接口已接通，能生成二维码。用户仍须扫码/确认；必要时输入手机微信显示的数字，并向机器人发送一条消息，以建立推送会话。此时才可验收真实手机接收。

## 对接入口

`createWeixinChannel({root,onChange})` → `await init()` → `start()`。

- `status()`：安全公开状态，含connected、pushReady、state、note、error及login。
- `startLogin()`：取得二维码，返回完整状态；login.qr / login.qrDataUrl 为可展示PNG data URL。
- `pollLogin(id)`：一次状态查询；start后后台也会轮询。
- `submitVerifyCode(id,code)`：仅在need_verifycode时接受手机显示数字。
- `sendMessage(text,{id:event.id})`：收件人固定为扫码者；接口接收返回accepted=true、delivered=false。网络结果不明抛deliveryStatus=unknown、retryable=false，禁止自动重发假定成功。
- `disconnect()`：断开当前绑定；`stop()`：停止本机轮询。

## 证据与边界

凭据、会话context_token及游标加密保存在 `.runtime/private/weixin-connection.enc`，使用已有Windows DPAPI，不写明文。入站正文不执行、不交给AI，只接收扫码者的会话令牌。HTTP仅允许官方weixin.qq.com的HTTPS域名；不自动跟随HTTP跳转。无会话、失效、接口非零及网络不明状态分别明确报告。

已通过5项接口回归，覆盖官方域名、绑定加密、收件人固定、无会话拒发、外人消息忽略、入站指令不执行、验证码、重定向和发送结果不明。未完成真实微信扫码、手机收取及长期定时推送实测。

官方参考：
- https://github.com/Tencent/openclaw-weixin
- https://github.com/Tencent/openclaw-weixin/blob/main/docs/protocol.md
- https://www.npmjs.com/package/@tencent-weixin/openclaw-weixin-cli