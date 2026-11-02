import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
const reportPath=resolve('docs/quick-audit-2026-10-30.md'),htmlPath=reportPath.replace(/\.md$/,'.html');
const live=JSON.parse(await readFile('output/quick-audit-2026-10-30/active-verification.json','utf8'));
const text=`# 小木工作台十分钟快审与优化验收

时间：2026-10-30 01:14 开始，01:22 完成主要修复、验收及正式启用。

## 本轮已修复

| 问题 | 修改结果 | 验证 |
|---|---|---|
| 切换页面重复读取品种详情，后台对比挤占前台 | 同请求去重、并发上限3、前台优先、离开页面取消后台；日期和行情版本独立 | 请求池4项回归；真实桌面快速切页3次 |
| 多个品种同时请求时反复计算整份行情 | 同日期同版本合并计算；后续实时报价仍重新读取 | 并发8请求只计算1次，后续报价更新及版本切换通过 |
| 席位历史按天反复查全市场数据 | 改为按品种批量读取席位和同日同合约结算价，保持原口径 | FU真实10天1774条席位，21次查询降为2次，26ms降为8ms，结果一致；单次测量非全场景承诺 |
| 两条异常收盘缓存被误认为有效，无法补取 | 检查具体合约、日期、来源、完成标记和有效收盘价，损坏或不匹配缓存重新请求 | 3项收盘采集测试通过；没有将结算价替换为收盘价 |
| 盘后全空结果覆盖上次成功行情 | 空结果仅记录失败状态，保留原market.json；首次无缓存明确标注 | 7项行情测试通过，包括原缓存字节保持不变 |
| 刷新中显示上次成功、超时状态不落盘 | 当前刷新状态优先；超时和异常记录失败，可重试；重复点击共用任务 | 3项刷新状态测试通过 |

## 实际验收

- 合并后的全量 Node 测试：**523/523通过**，0失败、0跳过。
- Python 针对性测试：**10/10通过**；相关Python及JS语法检查通过。快审初始全项目268个脚本语法检查0失败。
- 桌面构建成功，并启动独立桌面，使用真实数据副本点击市场总览、周期强弱、品种强弱、资金排行、资金动向、持仓动向、期货手续费、品种跟踪、席位动向。
- 第一次打开资金动向约3.44秒；连续三次品种强弱→资金动向热切换约193/161/163毫秒，均无超时。验证燃料油切换和持仓变化页签，页面脚本错误0条。
- 正式小木已在你确认退出后重新打开，服务版本与当前源文件一致；87个品种、81个有效可比收盘样本，收盘日期${live.closeDate}。旧数据缺口没有补造。
- 正式账户数据库与本轮前一致。五种入场手法、账户风控、批准边界、扫描阈值、品种排序和页面布局保持原样。主力认定算法没有修改。

## 已覆盖与剩余范围

本轮是限时快速审查，覆盖前后端请求、行情刷新与缓存、市场九页、已有交易/研究/语音/账户自动测试，以及相关关键边界源码核对。未逐一穷举所有业务操作，未真实拨打语音、调用外部AI研究或在正式库发起全市场行情刷新。外部网站可用性与长期压力测试不在本轮完成范围；当前缺口继续按真实状态展示。

## 可查找证据

- 点击记录：../output/quick-audit-2026-10-30/click-verification.json
- 正式启用记录：../output/quick-audit-2026-10-30/active-verification.json
- 全量测试日志：../output/quick-audit-2026-10-30/final-node-tests.txt
- 页面截图：../output/quick-audit-2026-10-30/funds.png、positions.png、home.png
- 旧文件与原桌面构建：../.runtime/ui-history/2026-10-30-quick-audit-before/
- 新构建：../.runtime/desktop-quick-audit-20261030/小木-win32-x64/小木.exe
- 正式入口：../.runtime/desktop-tq-verified-20261028/小木-win32-x64/小木.exe

正式服务版本：${live.build}
`;
await writeFile(reportPath,text);
const {marked}=await import('marked');
await writeFile(htmlPath,'<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>小木十分钟快审验收</title><style>body{font:16px/1.8 "Microsoft YaHei",sans-serif;color:#172841;background:#f5f7fc;margin:36px auto;max-width:1100px;padding:0 24px}table{border-collapse:collapse;background:white;width:100%}th,td{text-align:left;padding:12px;vertical-align:top;border-bottom:1px solid #dbe1ed}th{background:#345a9e;color:white}h1{font-size:28px}h2{margin-top:32px}strong{color:#176b4d}a{color:#345dcc}img{max-width:100%;background:white}li{margin:6px 0}</style>'+marked.parse(text)+'<h2>资金动向实际点击截图</h2><img src="../output/quick-audit-2026-10-30/funds.png" alt="资金动向验收截图"></html>');
const entries=[['D:/五简个人资料/2026年10月文件/01_10月决定记录.md','\n\n### 2026-10-30 Windows・Codex：小木十分钟快审优化\n已修复请求去重与切页取消、并发快照合并、席位批量查询、异常收盘缓存重取、全空行情保留旧快照、刷新状态与超时重试。全量523项、Python10项通过；市场九页独立桌面实际点击通过。本人确认退出后已启用正式新版，账户库核对未变。未实测外部AI/语音通话/正式全市场刷新。详见小木工作台/wujian-jarvis/docs/quick-audit-2026-10-30.md。\n'],['D:/五简个人资料/Codex/文件索引.md','\n\n- 2026-10-30｜小木十分钟快审优化与验收｜D:\\五简个人资料\\2026年10月文件\\小木工作台\\wujian-jarvis\\docs\\quick-audit-2026-10-30.html｜523项Node、10项Python通过；九页点击及正式启用，保留账户和交易规则。\n']];
for(const [path,entry] of entries){const old=await readFile(path,'utf8');if(!old.includes('quick-audit-2026-10-30'))await writeFile(path,old+entry)}
console.log(JSON.stringify({reportPath,htmlPath}));