import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {buildPostmarketReview} from '../integrations/postmarket-review.mjs';

const base='http://127.0.0.1:4318',output=resolve('output/playwright/postmarket-2026-10-09');
const json=async path=>{const r=await fetch(base+path);assert.ok(r.ok);return r.json()};
const acceptance=JSON.parse(await readFile(resolve(output,'桌面验收.json'),'utf8'));
for(const entry of acceptance.results){const restored=await json('/api/workbench/postmarket-reviews/'+entry.id+'/result');assert.equal(restored.inputHash,entry.inputHash)}
const saved=acceptance.results[0],input=JSON.parse(await readFile(resolve('.runtime/postmarket-reviews',saved.id,'input.json'),'utf8'));
const page=(await fetch('http://127.0.0.1:9229/json/list').then(r=>r.json())).find(p=>p.type==='page'&&p.url.startsWith(base+'/'));assert.ok(page);
const socket=new WebSocket(page.webSocketDebuggerUrl),pending=new Map();let seq=0;
await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject});socket.onmessage=e=>{const r=JSON.parse(e.data),p=pending.get(r.id);if(p){pending.delete(r.id);r.error?p.reject(Error(r.error.message)):p.resolve(r.result)}};
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}))});
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value};
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const waitFor=async expression=>{for(let n=0;n<80;n++){if(await evaluate(expression))return;await delay(150)}throw Error('页面等待超时：'+expression)};
const click=async selector=>evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
const screenshot=async name=>{const r=await send('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false});await writeFile(resolve(output,name+'.png'),Buffer.from(r.data,'base64'))};
const fixtureId='b1111111-1111-4111-8111-111111111111';
async function fixture(report,status='completed',error=''){
 report.id=fixtureId;
 await evaluate(`window.__reviewFixture=${JSON.stringify({report,job:{id:fixtureId,mode:report.mode,modeLabel:report.modeLabel,status,error,stage:status==='running'?'隔离验收：复盘进行中':status==='failed'?'隔离验收：复盘未完成':'隔离验收：计算已保存',date:report.date,createdAt:new Date().toISOString()},posts:0})}`);
}
try{
 await send('Page.enable');await send('Page.bringToFront');await send('Page.navigate',{url:base+'/?view=fire'});await delay(500);await waitFor(`!!document.querySelector('#postmarketReview')`);await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 await evaluate(`window.__realFetch=window.fetch;window.fetch=async(...args)=>{const path=new URL(String(args[0]),location.href).pathname,f=window.__reviewFixture;if(path==='/api/workbench/postmarket-reviews'){if(args[1]?.method==='POST'){f.posts++;return new Response(JSON.stringify(f.job),{status:202})}return new Response(JSON.stringify(f.posts?[f.job]:[]))}if(path==='/api/workbench/postmarket-reviews/'+f.job.id)return new Response(JSON.stringify(f.job));if(path==='/api/workbench/postmarket-reviews/'+f.job.id+'/result')return new Response(JSON.stringify(f.job.status==='failed'?{error:'隔离验收无报告'}:f.report),{status:f.job.status==='failed'?404:200});return window.__realFetch(...args)};`);
 const normal=buildPostmarketReview(input,'month-week-day');await fixture(normal,'running');await click('#postmarketReview');await waitFor(`document.querySelector('#postmarketReview').disabled`);
 await evaluate(`document.querySelector('#postmarketReview').click()`);assert.equal(await evaluate(`window.__reviewFixture.posts`),1);
 await evaluate(`window.__reviewFixture.job.status='failed';window.__reviewFixture.job.error='隔离验收：旧数据刷新失败，旧报告保留';`);await waitFor(`document.querySelector('#postmarketProgress').textContent.includes('旧数据刷新失败')&&!document.querySelector('#postmarketRetry').hidden`);
 await screenshot('隔离-刷新失败与重试');await evaluate(`window.__reviewFixture.job.status='completed';window.__reviewFixture.job.error='';`);await click('#postmarketRetry');await waitFor(`!!document.querySelector('[data-review-report]')`);assert.equal(await evaluate(`window.__reviewFixture.posts`),2);assert.ok(await evaluate(`document.querySelector('.review-ai').textContent.includes('未执行AI分析')`));await click('#modalClose');
 const emptyInput=structuredClone(input);emptyInput.scan.rows.forEach(r=>r.modes['month-week-day']='未纳入');await fixture(buildPostmarketReview(emptyInput,'month-week-day'));await click('#postmarketReview');await waitFor(`!!document.querySelector('.postmarket-report .empty')`);await screenshot('隔离-无候选');await click('#modalClose');
  const partialInput=structuredClone(input),code=normal.rows[0].code;partialInput.barSets[code].bars.pop();await fixture(buildPostmarketReview(partialInput,'month-week-day'),'partial');await click('#postmarketReview');await waitFor(`document.querySelector('.postmarket-report')?.textContent.includes('当日完整正式日K缺失或异常')`);assert.equal(await evaluate(`document.querySelectorAll('.postmarket-table tbody tr').length`),normal.rows.length);await click('[data-review-evidence] summary');await screenshot('隔离-部分缺失');await click('#modalClose');
  const rolled=structuredClone(input);rolled.barSets[code].bars=rolled.barSets[code].bars.filter(b=>String(b.date).slice(0,10)!==input.calendar.previousDate);await fixture(buildPostmarketReview(rolled,'month-week-day'),'partial');await click('#postmarketReview');await waitFor(`document.querySelector('.postmarket-report')?.textContent.includes('同合约上一交易日完整日K缺失')`);await click('[data-review-evidence] summary');await screenshot('隔离-换月缺可比前值');await click('#modalClose');
 await evaluate(`window.fetch=window.__realFetch;delete window.__reviewFixture;delete window.__realFetch;`);
 await send('Page.navigate',{url:base+'/?view=fire'});await waitFor(`!!document.querySelector('#postmarketReview')`);
 const before=JSON.parse(await readFile(resolve(output,'business-before.json'),'utf8')),{exportedAt,...after}=await json('/api/workbench/backup');assert.deepEqual(after,before);
 const results={passed:true,checkedAt:new Date().toISOString(),actualRestartHistory:acceptance.results.map(r=>r.id),isolatedBrowserFixtures:['进度与重复点击','刷新失败与重试','无AI计算','无候选','部分缺失保留名单','换月缺同合约前值'],productionBusinessMutation:false};await writeFile(resolve(output,'边界与重启验收.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
}finally{try{await evaluate(`if(window.__realFetch)window.fetch=window.__realFetch`);await send('Emulation.clearDeviceMetricsOverride')}catch{}socket.close()}
