import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const folder='output/unified-workbench-2026-10-25',read=async path=>JSON.parse(await readFile(folder+'/'+path,'utf8'));
const [ui,desktop,voiceUI,voice,preservation]=await Promise.all(['ui-verification.json','desktop-verification.json','voice-ui-verification.json','live-voice-verification.json','preservation-verification.json'].map(read));
assert.deepEqual(ui.errors,[]);assert.deepEqual(ui.failedRequests,[]);assert.deepEqual(desktop.errors,[]);assert.deepEqual(voiceUI.errors,[]);assert.equal(voice.reason,'audio-complete');assert.equal(voice.realModel,true);assert.equal(preservation.allBusinessRowsUnchanged,true);
const health=await fetch('http://127.0.0.1:4318/api/health').then(r=>r.json()),voiceStatus=await fetch('http://127.0.0.1:4318/api/volc/status').then(r=>r.json());assert.equal(health.projectRoot,resolve('.'));assert.equal(voiceStatus.configured,true);
const release={at:new Date().toISOString(),status:'enabled',entry:'http://127.0.0.1:4318/market-panorama.html',desktop:resolve('.runtime/desktop-unified-20261025/小木-win32-x64/小木.exe'),project:health.projectRoot,serverBuild:health.serverBuild,pages:17,focusedTests:{passed:47,failed:0},businessTables:preservation.businessTables.length,businessRows:preservation.businessTables.reduce((s,t)=>s+t.count,0),ruleFiles:preservation.ruleFiles.length,ruleHash:preservation.ruleHash,voiceConfigured:voiceStatus.configured,voice:{syntheticInput:true,realProvider:true,realModel:true,audioBytes:voice.audioBytes,humanMicrophone:false,humanListening:false},evidence:['ui-verification.json','desktop-verification.json','voice-ui-verification.json','live-voice-verification.json','preservation-verification.json','shortcuts-verification.json']};
await writeFile(folder+'/release-verification.json',JSON.stringify(release,null,2));
const doc='docs/市场全景合并交付-2026-10-25.md';
const report=`# 小木市场全景合并交付

2026-10-25，已实施并启用。原桌面“小木交易工作台”和开始菜单“小木”快捷方式已更新，实际启动的新应用窗口为“市场总览 · 小木市场全景”。

## 现在怎么使用

- 日常统一进入市场全景：看市场九页、做交易六页、系统两页，共17页。
- 从左侧菜单直接切换市场与交易内容；共享账户、助手和页面框架，不再整页来回切换。
- 左下保留“小木对话”和“语音通话”；顶部保留全息版、盯盘提醒及交易页A4打印。
- 全息版保留七彩地球、12个板块入口及原业务流程，返回入口统一为市场全景。
- 旧首页和带品种、交易卡参数的链接仍可使用，自动进入统一主界面。

当前桌面程序：\`${release.desktop}\`。

## 已完成的修改

1. 合并主入口和桌面菜单，市场与交易内容使用同一套导航、品牌和账户状态。
2. 恢复交易及市场页的语音入口，复用原语音配置和聊天记录。支持静音、停止播报、挂断、放大和缩小；市场全景内部切页保持会话。研究对象改变时更新会话上下文，丢弃上一对象的迟到回答。
3. 修复白底白色铃铛，保留深色全息版的浅色图标；相关提醒编辑功能继续使用原逻辑。
4. 统一中文字体、标题、表格、按钮和关键内容字重；五行使用克制的分区点缀，多空红绿及强弱深浅分级保留。
5. 三组多强空弱卡片突出品种名，多空分别配浅色区域；候选及排序算法保持原样。
6. 页面切换保留助手输入、当前账户、市场筛选状态及交易页未保存的表单内容与展开状态；支持页面后退、前进和刷新恢复位置对应的页面。

## 验证结果

| 检查 | 结果 |
|---|---|
| 浏览器17页真实点击、单一侧栏、旧链接兼容 | 通过，无页面脚本错误和失败HTTP请求 |
| 不同窗口 | 1366×768、1920×1080、1100×720、390×844通过，无整页横向溢出 |
| 实际桌面 | 新EXE启动通过，100%与125%应用缩放检查完成 |
| 燃油流程 | 在隔离数据库中从火候选进入水研究并打开金计划，正式账户未创建测试交易卡 |
| 未保存编辑 | 水研究编辑后切到市场再返回，输入和展开状态保留 |
| 全息版 | 地球正常、12板块、返回统一工作台通过，界面没有稳定版入口 |
| 语音界面 | 模拟输入验证接通、静音、停止、切页、上下文、挂断释放音轨和拒绝权限后的文字通道 |
| 真实语音服务与模型 | 合成音频实际完成识别→模型回答→语音返回；返回音频${voice.audioBytes}字节，检测到非零音频信号 |
| 聚焦测试 | 47项通过，覆盖语音、规则详情、品种排序、强弱色级和对话 |
| 交易记录 | 20张业务表、168条记录逐表内容哈希与备份完全一致 |
| 交易规则 | 24个有效规则文件逐项哈希一致，组合哈希未变 |
| 知识资料 | 11张知识库表记录数量与备份一致 |

真实麦克风硬件、电脑扬声器和本人主观听感没有代替用户验证。已完成的真实语音验证使用既有合成测试音频；不是录取用户现场声音。跨到全息版属于整页切换，活动通话时会先提示是否结束通话。

界面测试使用隔离业务副本。测试截图中的账户、卡片和日期仅用于说明界面，不构成正式交易记录。行情日期、缺口及延迟继续如实显示，本次没有改行情口径或发起交易。

## 可恢复备份与证据

备份目录：\`${preservation.checkpoint}\`。保存了修改前源码、桌面入口、配置及四个数据库快照。桌面快捷方式另存了备份及目标核验记录。

证据目录：\`${resolve(folder)}\`。\`release-verification.json\`汇总实际运行路径和检查结果；各验证JSON与改前改后截图保存在同一目录。

规则组合哈希：\`${preservation.ruleHash}\`。

## 改前改后

### 火页面修改前

![修改前](../output/unified-workbench-2026-10-25/before-fire.png)

### 合并后的火页面

![修改后](../output/unified-workbench-2026-10-25/production-fire.png)

### 水研究（隔离副本）

![水研究](../output/unified-workbench-2026-10-25/desktop-water-with-card.png)

### 全息版

![全息版](../output/unified-workbench-2026-10-25/desktop-holographic.png)
`;
await writeFile(doc,report);
let desktopDoc=await readFile('docs/desktop-app.md','utf8');desktopDoc=desktopDoc.replace('# 小木五行交易工作台 Windows 本机版','# 小木五简交易系统 Windows 本机版').replace('应用首页为今日交易总览，全息地球保留在“全息预览”。','当前统一主入口为市场全景，完整交易流程纳入同一界面；全息地球保留在“全息版”。').replace('应用生成于 `.runtime/desktop-build/小木-win32-x64/小木.exe`。','当前启用构建为 `.runtime/desktop-unified-20261025/小木-win32-x64/小木.exe`。详见[2026-10-25合并交付](市场全景合并交付-2026-10-25.md)。').replace('语音：当前仍为浏览器识别/合成加DeepSeek，Electron中的实际识别能力待用户测试；GPT-Live尚未配置，也未声称已完成全双工通话。','语音：复用现有火山双向语音服务与DeepSeek回答。合成音频的真实识别、模型回答和语音返回已通过验证；实际麦克风与主观听感需在正常使用时核对。旧版验收记录按当时状态保留。');await writeFile('docs/desktop-app.md',desktopDoc);
const plan='docs/plans/2026-10-25-unified-workbench/修改方案_待确认.md';let p=await readFile(plan,'utf8');p=p.replace('状态：**待用户确认，尚未实施程序修改**。','状态：**用户已确认，已实施；验收与限制见 [合并交付](../../市场全景合并交付-2026-10-25.md)**。');await writeFile(plan,p);
console.log(JSON.stringify({release:resolve(folder+'/release-verification.json'),report:resolve(doc),status:release.status}));
