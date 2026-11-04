import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const root=resolve('.'),out=resolve('output/maintenance-2026-11-03');
const read=n=>JSON.parse(readFileSync(out+'/'+n,'utf8'));
const ui=read('desktop-click-verification.json'),api=read('data-and-api-audit.json'),security=read('dependency-audit-after.json'),build=read('build-verification.json'),preservation=read('preservation-verification.json'),activation=read('activation.json');
const active=activation.status==='activated',state=active?'已正式启用':'新版已验收并准备就绪，等待完全退出当前小木后启用';
const md=`# 小木全系统维护验收 · 2026-11-03

状态：${state}。

本轮对现有软件做检查和维护，未调整交易规则、账户权限、入场手法、风险档位或布局。正式账户、成交、余额流水逐表校验未变。

## 已修复

1. Windows 的均线拐点通知点击后进入“全品种监控”；普通到价通知仍进入原“盯盘提醒”。此前均线通知也会跳到通用提醒页。
2. 警报取消、标为已读或切换试听时，停止旧音频，继续队列中的下一条；旧合成或播放承诺迟到，不再打断新语音。清空的警报不能重播；已移出队列的去重记录随之释放。
3. 校验缓存音频的完整 WAV 头、采样率、位深和数据长度；损坏的缓存重新合成，失败结果不写入缓存，下次可重试。
4. 健康接口版本改为读取项目实际版本，消除接口仍显示 0.5.0、项目实际为 0.5.1 的不一致。
5. DOMPurify 3.4.15 → 3.4.17，同时更新实际前端内嵌副本；Electron 44.4.3 → 44.10.1；更新可兼容修复的间接依赖。桌面构建从锁定依赖读取版本，避免以后依赖更新但构建仍用旧版。

升级依据：[DOMPurify 官方修复版本](https://github.com/cure53/DOMPurify/releases/tag/3.4.17)、[Electron 官方版本](https://releases.electronjs.org/release/v44.10.1)。镜像下载文件已与 Electron 官方包内 SHA-256 清单逐字核对。

## 实际通过的检查

| 检查 | 结果 |
| --- | --- |
| JavaScript 全量测试 | 608 通过，0 失败、0 跳过 |
| 新版桌面内置 Node ${build.nodeVersion} 再跑全量测试 | 608 通过，0 失败、0 跳过；不重复计入测试总项数 |
| Python 测试 | 55 通过 |
| 脚本语法 | 308 个 JavaScript 文件通过；Python integrations/scripts 编译通过 |
| 正式数据库 | 业务、日K、市场全景、监控、知识库共 5 个，完整性均正常，关联检查无异常 |
| API | ${api.api.length} 个主要读取接口正常；无来源请求、非法音色和不存在事件均被拒绝 |
| MCP | 自检通过，只读权限保留 |
| 真实桌面 | Electron ${ui.electron} 构建并启动，18 个主要页面逐一点击，未捕获页面脚本异常 |
| 图表 | 资金品种切换、持仓 4 种视图、1100/1366/1920 窗口宽度通过 |
| 草稿 | 水研究未保存文本、助手输入跨页保留 |
| 账户 | 隔离副本中新增模拟账户 → 10万元改为10.1万元 → 差额1000元 → 删除，实际点击通过 |
| 故障恢复 | 注入品种读取503失败，可见重试，恢复后图表重新出现；该503是测试注入 |
| 语音 | 明确读出“测试提醒”，真实云端合成、原生弹窗音频输出、停止、跳转和确认通过；未发微信测试消息 |
| 当前选品 | 市场快照、收盘热力、火候选均满足成交量与持仓量严格＞1万手；历史数据保留 |
| 构建一致性 | 7 个原生文件与源码逐字一致；前端净化组件与已安装补丁一致；候选与待启用目录哈希一致 |

## 仍须如实说明

- 生产依赖扫描为 0 项已知漏洞；包括开发和打包工具时，仍有 ${security.metadata.vulnerabilities.moderate} 项中危告警，集中在 @electron/packager / asar / universal / glob / minimatch。严重、高危均为 0。npm 提议强制降级 packager 会引入破坏性变更，本轮未强制降级，也不宣称这些告警已消除。
- 正式微信当前 ${preservation.weixin.state}：绑定仍在，但缺少可用推送会话。需向已绑定机器人发一句“小木”后再核对。未更换绑定，未伪造送达结果。
- 大商所公开持仓来源仍标注备用转载、已核验主力、非全月份。缺失数据保持缺失，未补造。
- 采样时完成日K为11月2日，最新报价为11月3日；界面分别标注，没有把旧日K冒充当天收盘。
- 付费AI研究全流程、自然行情触发与手机真实送达未在本轮重新执行；算法、权限、失败处理由自动测试覆盖，实际现场覆盖不能等同于这些外部结果。
- 本轮未进入券商下单，也未批准任何真实方案。通过测试不能证明未来所有网络、外部服务和行情情境绝无缺陷。

## 启用和恢复

- ${state}。当前窗口未被关闭。
- 候选新版：${activation.source}
- 待启用副本：${activation.staged}
- 原快捷方式入口保留：${activation.active}\\小木.exe
- 源码、依赖清单及旧前端组件备份：${root}\\.runtime\\ui-history\\2026-11-03-maintenance-before
- 正式切换时保留原整套桌面文件，不覆盖业务数据库与微信绑定。

## 证据

目录：${out}

- node-tests-final.txt / packaged-runtime-tests.txt / python-tests.txt / source-check.txt
- data-and-api-audit.json / desktop-click-verification.json / preservation-verification.json
- dependency-audit.json / dependency-audit-after.json / production-dependency-audit.json
- build-verification.json / electron-download-verified.json / activation.json
- screenshots/：18页截图、语音弹窗

desktop-click-failure.json 保留过程中的验收脚本等待错误，不作为最终状态；最终以 desktop-click-verification.json 的通过结果和时间为准。正式启用状态以 activation.json 为准。
`;
const mdPath=resolve('docs/全系统维护验收-2026-11-03.md'),htmlPath=resolve('docs/全系统维护验收-2026-11-03.html');writeFileSync(mdPath,md);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>小木全系统维护验收</title><style>body{font:16px/1.8 'Microsoft YaHei',sans-serif;color:#1f3453;background:#f5f7fc;max-width:1150px;margin:30px auto;padding:0 20px}section{background:#fff;border-radius:12px;padding:24px;margin:20px 0}h1{font-size:28px}img{max-width:100%;border-radius:8px}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:14px/1.8 'Microsoft YaHei',sans-serif}.state{background:#fff1d8;padding:12px 16px;border-radius:8px}a{color:#264ec5}</style><h1>小木全系统维护验收</h1><p class="state">${esc(state)}</p><section><b>663项自动测试全部通过 · 18个主要页面实际点击通过</b><p>5个正式数据库正常，正式账户与交易规则未变。生产依赖扫描0项已知漏洞，打包工具链仍有5项中危告警。</p><p><a href="全系统维护验收-2026-11-03.md">完整验收记录</a></p></section>${[['market-home.png','市场总览'],['market-monitor.png','监控页：隔离验收未带微信与行情凭据，因此显示待连接'],['trade-metal.png','金：五种手法及原风控流程保留'],['local-speech-test.png','本机测试播报，没有推送手机']].map(([file,title])=>`<section><h2>${title}</h2><img src="../output/maintenance-2026-11-03/screenshots/${file}" alt="${title}"></section>`).join('')}<section><h2>详细结果与边界</h2><pre>${esc(md)}</pre></section></html>`;writeFileSync(htmlPath,html);
const indexPath=resolve('D:/五简个人资料/Codex/文件索引.md');let index=readFileSync(indexPath,'utf8');const label='小木全系统维护验收（663项自动测试、18页桌面点击）';if(!index.includes(label)){index+='\n- 2026-11-03｜'+label+'；新版待退出后启用；账户/规则未变，生产依赖扫描0项，打包工具中危5项保留说明。｜[验收报告](<'+htmlPath.replaceAll('\\','/')+'>)\n';writeFileSync(indexPath,index)}
console.log(JSON.stringify({mdPath,htmlPath,state}));
