import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {applyResonanceRule} from '../integrations/resonance-rule.mjs';
import {buildScanRuleDetails,scanRuleDetails} from '../integrations/scan-rule-details.mjs';
import {createRuleDetails,ruleDetailsHtml} from '../dist/rule-details.js';

const method=await readFile('../资料包/技能包/wujian-futures-multi-cycle-scan/references/method.md','utf8');
const registry={version:'当前三模式规则',combinedHash:'test-hash',files:[]};
const fire=applyResonanceRule({baseline_rule_version:'v2.5',data_date:'2026-09-30',rows:[]});
const details=buildScanRuleDetails(registry,fire,method);

test('详情使用工作台生效元数据，旧技能包共振突破与2万门槛不混入',()=>{
 assert.deepEqual(details.modes.map(mode=>mode.id),['month-week-day','month-week','week-day']);
 assert.equal(details.common.liquidity,fire.resonance_rule.liquidity);
 assert.ok(details.modes[0].direction.startsWith(fire.resonance_rule.direction));
 assert.match(details.modes[0].direction,/空头：月、周、日MA10均下降/);
 assert.match(details.common.directionBoundary,/走平或方向不一致不进入观察候选/);
 assert.equal(details.modes[0].breakout,fire.resonance_rule.breakout);
 assert.equal(details.modes[0].version,fire.resonance_rule.version);
 assert.match(details.modes[0].structure,/不参与筛选/);
 assert.match(details.modes[2].structure,/周K、日K高低点结构仅作辅助展示，不参与筛选/);
 assert.match(details.modes[2].direction,/最新完成日K收盘价 > 动态周MA10/);
 assert.match(details.modes[2].direction,/最新完成日K收盘价 < 动态周MA10/);
 assert.match(details.modes[2].direction,/相等不纳入/);
 assert.equal(details.modes[2].breakout,'不要求周线突破');
 assert.match(details.modes[1].direction,/本周低点高于上周低点/);
 assert.match(details.modes[1].breakout,/最近3个月 对比 再向前12个月/);
 assert.doesNotMatch(JSON.stringify([details.modes[0],details.modes[2]]),/前12月|20,000|20000/);
 assert.match(details.common.direction,/走平 = 当前MA10 = 上一MA10/);
});

test('没有方法和扫描元数据时明确未知，不猜测筛选规则',()=>{
 const missing=buildScanRuleDetails(registry,{});
 assert.equal(missing.dataDate,null);
 assert.equal(missing.scanVersion,null);
 assert.ok(missing.modes.every(mode=>mode.version===null&&mode.direction.includes('未取得')));
});

test('锁定轮次读取冻结原文，冻结内容缺失时不读取现行文件',async()=>{
 const frozen=method.replace(/月线突破窗口 = [^\n]+/,'月线突破窗口 = 锁定原文测试窗口');
 const locked=await scanRuleDetails({...registry,runId:'locked',sourceChanged:true,contents:[{name:'火扫描技能包方法',content:frozen}]},fire);
 assert.match(locked.modes[1].breakout,/锁定原文测试窗口/);
 assert.equal(locked.sourceChanged,true);
 const absent=await scanRuleDetails({...registry,runId:'locked',files:[{name:'火扫描技能包方法',available:true,path:'invalid-path'}]},fire);
 assert.match(absent.modes[1].direction,/未取得/);
});

test('规则文本和错误内容转义，不暴露可执行HTML',()=>{
 const html=ruleDetailsHtml({...details,version:'<img src=x onerror=alert(1)>',sourceChanged:true});
 const dom=new JSDOM(html);
 assert.equal(dom.window.document.querySelector('img'),null);
 assert.match(dom.window.document.body.textContent,/<img src=x onerror=alert\(1\)>/);
 assert.match(dom.window.document.querySelector('[role="alert"]').textContent,/锁定/);
 dom.window.close();
});

function harness(api){
 const dom=new JSDOM('<dialog><h2></h2><main></main></dialog>');
 const dialog=dom.window.document.querySelector('dialog'),body=dialog.querySelector('main');
 dialog.showModal=()=>{dialog.open=true};
 dialog.close=()=>{dialog.open=false;dialog.dispatchEvent(new dom.window.Event('close'))};
 const viewer=createRuleDetails({api,dialog,title:dialog.querySelector('h2'),body,getMode:()=>'week-day'});
 return{dom,dialog,body,viewer};
}

test('打开当前模式、鼠标与方向键切换三个规则页签',async()=>{
 const {dom,dialog,body,viewer}=harness(async()=>details);
 await viewer.open();
 assert.ok(dialog.open&&dialog.classList.contains('scan-rule-dialog'));
 assert.equal(body.querySelector('[aria-selected="true"]').dataset.ruleMode,'week-day');
 const first=body.querySelector('[data-rule-mode="month-week-day"]');first.click();
 assert.equal(body.querySelector('[aria-selected="true"]'),first);
 first.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
 assert.equal(body.querySelector('[aria-selected="true"]').dataset.ruleMode,'month-week');
 assert.equal(body.querySelectorAll('[role="tabpanel"]:not([hidden])').length,1);
 dialog.close();assert.ok(!dialog.classList.contains('scan-rule-dialog'));
 dom.window.close();
});

test('网络错误可重试，关闭后的迟到响应不会覆盖其他弹窗',async()=>{
 let fail=true;
 const {dom,body,viewer,dialog}=harness(async()=>{if(fail)throw Error('<b>服务离线</b>');return details});
 await viewer.open();assert.match(body.textContent,/服务离线/);assert.equal(body.querySelector('b'),null);
 fail=false;await body.querySelector('.rule-retry').onclick();assert.ok(body.querySelector('[role="tablist"]'));
 dialog.close();
 let finish;
 const delayed=createRuleDetails({api:()=>new Promise(resolve=>{finish=resolve}),dialog,title:dialog.querySelector('h2'),body});
 const pending=delayed.open();dialog.close();body.textContent='另一个弹窗';dialog.showModal();finish(details);await pending;
 assert.equal(body.textContent,'另一个弹窗');
 dom.window.close();
});

test('统一市场全景保留对话、语音、打印和规则入口，旧首页只作兼容跳转',async()=>{
 const legacy=await readFile('dist/index.html','utf8');assert.match(legacy,/unified-entry\.js/);
 const stable=new JSDOM(await readFile('dist/market-panorama.html','utf8'));
 const holographic=new JSDOM(await readFile('dist/cockpit.html','utf8'));
 const document=stable.window.document;
 assert.equal(document.querySelector('.topbar .version-link').textContent,'全息版');
 assert.equal(document.querySelector('.side-nav #assistantButton').textContent,'小木对话');
 assert.equal(document.querySelector('#printButton').textContent,'A4打印');
 assert.equal(document.querySelector('#voiceButton').textContent,'语音通话');
 assert.ok(document.querySelector('#marketSurface #marketContent'));assert.ok(document.querySelector('#tradeSurface #content'));
 const ids=[...document.querySelectorAll('[id]')].map(e=>e.id);assert.equal(new Set(ids).size,ids.length,'共享页面不得出现重复ID');
 assert.equal(document.querySelectorAll('#assistantButton').length,1);
 assert.equal(document.querySelector('.preview-link'),null);
 assert.equal(holographic.window.document.querySelectorAll('.version-switch a').length,1);
 assert.equal(holographic.window.document.querySelector('.version-switch a').textContent,'市场全景');
 for(const dom of [stable,holographic]){assert.equal(dom.window.document.querySelector('#ruleVersion').tagName,'BUTTON');dom.window.close()}
});
