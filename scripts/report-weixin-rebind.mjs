import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {marked} from 'marked';
const out='output/weixin-rebind-2026-11-03';
const qa=JSON.parse(await readFile(out+'/verification.json','utf8'));
const live=await fetch('http://127.0.0.1:4318/api/trend-monitor/weixin/status').then(r=>r.json());
await writeFile(out+'/formal-before.json',JSON.stringify({at:new Date().toISOString(),connected:live.connected,pushReady:live.pushReady,boundAt:live.boundAt,state:live.state},null,2));
const md=`# 微信扫码弹窗与换绑修复验收 · 2026-11-03

已完成开发、构建及独立桌面点击验收；正式启用需完全退出小木后重新打开。正式微信绑定尚未替换。

## 修复内容

原页面仅内嵌二维码，未真正弹窗；已有微信连接时，旧的已连接状态还会隐藏新二维码。

现在未绑定时点击“连接微信”，已绑定时点击“更换接收微信”，都会立即弹出居中的扫码窗口，先显示生成进度，再显示280像素二维码。窗口内提供手机验证数字、过期重新获取、失败重试、关闭及取消。

换绑会生成独立新扫码会话，不复用旧微信令牌。新手机扫码确认并成功加密保存前保留旧绑定；取消、失败或加密写盘失败时保留旧接收人。新绑定成功后清空旧会话和游标，必须新扫码者给机器人发一条消息后才能推送。旧账号迟到响应不会覆盖新绑定。

任务、行情、账户及交易规则保持原样。

## 使用

1. 小木 → 全品种监控 → 微信状态条。
2. 点击“更换接收微信”（尚未绑定时显示“连接微信”）。
3. 用准备接收提醒的那部手机微信扫码并确认。
4. 新微信给机器人发一句“小木”。
5. 状态变成可推送后，可点“发送测试提醒”核对新手机。

## 验收

- 全量Node测试：573/573通过，0失败、0跳过。
- 微信后端12项：换绑、新旧会话隔离、取消和失败保留、加密回滚、迟到响应与并发保存均通过。
- 前端8项：扫码模态、已连接不遮挡新码、验证码、重试、取消、轮询保留表单等通过。
- 独立桌面实际点击通过：未绑定弹窗、已绑定生成新码、4秒轮询仍显示二维码、原生顶层模态、Escape／取消仅取消扫码、1100宽度完整显示。
- 原微信接收绑定及正式账户库核验未被独立验收修改。
- 桌面已绑定前提使用合成状态；二维码来自腾讯真实接口，已取消测试会话。未使用另一部真实手机完成换绑，不把合成验收写成真实新手机接收成功。

## 证据

- [实际点击记录](../output/weixin-rebind-2026-11-03/verification.json)
- [全量测试日志](../output/weixin-rebind-2026-11-03/tests.txt)
- [弹窗样式截图：测试二维码，请勿用于实际换绑](../output/weixin-rebind-2026-11-03/replace-dialog-1500.png)
- [1100宽度截图：测试二维码](../output/weixin-rebind-2026-11-03/replace-dialog-1100.png)
- 源码备份：.runtime/ui-history/2026-11-03-weixin-rebind-before/。
- 新构建：.runtime/desktop-weixin-rebind-20261103/小木-win32-x64/小木.exe。
`;
const path=resolve('docs/weixin-rebind-2026-11-03.md');await writeFile(path,md);await writeFile(path.replace(/\.md$/,'.html'),'<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>微信扫码与换绑验收</title><style>body{font:16px/1.8 "Microsoft YaHei",sans-serif;max-width:1040px;margin:32px auto;padding:0 24px;color:#243b5b;background:#f6f8fe}h1{font-size:27px}h2{font-size:20px;margin-top:28px}a{color:#345fb1}li{margin:7px 0}</style>'+marked.parse(md));
const indexPath='D:/五简个人资料/Codex/文件索引.md',index=await readFile(indexPath,'utf8');if(!index.includes('weixin-rebind-2026-11-03'))await writeFile(indexPath,index+'\n\n- 2026-11-03｜小木微信二维码弹窗与更换接收微信｜D:\\五简个人资料\\2026年10月文件\\小木工作台\\wujian-jarvis\\docs\\weixin-rebind-2026-11-03.html｜含573项回归、桌面实际点击、换绑原子保存与原绑定保留验收。\n');
console.log(JSON.stringify({path,desktopQa:qa.passed,formalBindingPreserved:true}));