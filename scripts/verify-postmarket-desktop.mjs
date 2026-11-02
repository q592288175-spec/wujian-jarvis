import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {sortFireCandidates} from '../dist/fire-display.js';

const base='http://127.0.0.1:4318',output=resolve('output/playwright/postmarket-2026-10-09');
const json=async path=>{const r=await fetch(base+path,{signal:AbortSignal.timeout(10000)});assert.ok(r.ok,path);return r.json()};
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const pages=await fetch('http://127.0.0.1:9229/json/list').then(r=>r.json()),page=pages.find(p=>p.type==='page'&&p.url.startsWith(base+'/'));assert.ok(page,'实际APP页面必须存在');
const socket=new WebSocket(page.webSocketDebuggerUrl),pending=new Map();let seq=0;
await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject});
socket.onmessage=e=>{const r=JSON.parse(e.data),p=pending.get(r.id);if(p){pending.delete(r.id);r.error?p.reject(Error(r.error.message)):p.resolve(r.result)}};
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error(method+'超时'))},20000);pending.set(id,{resolve:r=>{clearTimeout(timer);resolve(r)},reject:e=>{clearTimeout(timer);reject(e)}});socket.send(JSON.stringify({id,method,params}))});
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value};
const waitFor=async(expression,timeout=15000)=>{const end=Date.now()+timeout;while(Date.now()<end){if(await evaluate(expression))return;await delay(200)}throw Error('页面等待超时：'+expression)};
const click=async selector=>{await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center'})`);const point=await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point})};
const screenshot=async name=>{const r=await send('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false});await writeFile(resolve(output,name+'.png'),Buffer.from(r.data,'base64'))};
const business=({exportedAt,...data})=>data;
try{
 await mkdir(output,{recursive:true});const health=await json('/api/health'),before=business(await json('/api/workbench/backup')),fire=await json('/api/workbench/fire');
 const sources=['server.mjs','integrations/five-workbench.mjs','integrations/trade-ledger.mjs','integrations/team-governance.mjs','integrations/approval-boundary.mjs','integrations/assistant.mjs','integrations/team-context.mjs','integrations/postmarket-review.mjs','scripts/postmarket_calendar.py'];
 const buffers=[];for(const path of sources)buffers.push(await readFile(path));assert.equal(health.serverBuild,createHash('sha256').update(Buffer.concat(buffers)).digest('hex'));
 assert.equal(resolve(health.projectRoot),resolve('.'));await writeFile(resolve(output,'business-before.json'),JSON.stringify(before,null,2));
 await send('Page.enable');await send('Page.bringToFront');await send('Page.navigate',{url:base+'/?view=fire'});await waitFor(`!!document.querySelector('#postmarketReview')`);
 const results=[];
 for(const mode of ['month-week-day','month-week','week-day']){
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await click(`[data-mode="${mode}"]`);
  const placement=await evaluate(`(()=>{const b=document.querySelector('#postmarketReview').getBoundingClientRect(),r=document.querySelector('#refreshFire').getBoundingClientRect();return{below:b.top>=r.bottom,rightAligned:Math.abs(b.right-r.right)<2,within:b.left>=0&&b.right<=innerWidth,top:b.top,left:b.left}})()`);
  assert.ok(placement.below&&placement.rightAligned&&placement.within);await screenshot(mode+'-button');
  await click('#postmarketReview');await waitFor(`document.querySelector('#modal').open&&!!document.querySelector('#postmarketProgress')`);
  let job,stage='';const end=Date.now()+6*60*1000;
  while(Date.now()<end){
   job=(await json('/api/workbench/postmarket-reviews')).find(j=>j.mode===mode);if(!job){await delay(500);continue}
   if(job.stage!==stage){stage=job.stage;console.log(mode+': '+stage)}
   if(job.status!=='running')break;await delay(1000);
  }
  assert.ok(job&&['completed','partial'].includes(job.status),'真实复盘应保存计算结果');
  const report=await json('/api/workbench/postmarket-reviews/'+job.id+'/result'),expected=sortFireCandidates(fire.rows.filter(r=>['多头观察','空头观察'].includes(r.modes[mode])),mode);
  assert.equal(report.date,fire.data_date);assert.deepEqual(report.rows.map(r=>r.code),expected.map(r=>r.code));assert.ok(report.rows.every(r=>r.valid&&!r.gaps.length));
  await waitFor(`document.querySelector('[data-review-report="${job.id}"]')&&document.querySelector('.review-ai').textContent.includes(${JSON.stringify(report.ai.status==='completed'?report.ai.model:'真实计算')})`,15000);
  assert.equal(await evaluate(`document.querySelectorAll('.postmarket-table tbody tr').length`),expected.length);
  const selectValue=await evaluate(`(()=>{const s=document.querySelector('#postmarketHistory');s.value=${JSON.stringify(job.id)};s.dispatchEvent(new Event('change'));return s.value})()`);assert.equal(selectValue,job.id);
  await click('[data-review-evidence] summary');assert.ok(await evaluate(`document.querySelector('[data-review-evidence]').open`));
  const viewports=[];
  for(const width of [1440,1024,390]){
   await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});
   const layout=await evaluate(`(()=>{const d=document.querySelector('#modal'),r=d.getBoundingClientRect();return{width,dialogWithin:r.left>=-1&&r.right<=innerWidth+1,bodyOverflow:d.scrollWidth>d.clientWidth+1,tableScrollable:document.querySelector('.postmarket-table').scrollWidth>document.querySelector('.postmarket-table').clientWidth,closeVisible:document.querySelector('#modalClose').getBoundingClientRect().right<=r.right}})()` .replace('{width,','{width:innerWidth,'));
   assert.ok(layout.dialogWithin&&!layout.bodyOverflow&&layout.closeVisible);viewports.push(layout);
   await evaluate(`document.querySelector('#modal').scrollTop=0`);await screenshot(mode+'-report-'+width);
  }
  results.push({mode,id:job.id,date:report.date,count:report.rows.length,long:report.rows.filter(r=>r.direction==='long').length,short:report.rows.filter(r=>r.direction==='short').length,ai:report.ai.status,model:report.ai.model,inputHash:report.inputHash,placement,viewports,historyClicked:true,evidenceClicked:true});
  await click('#modalClose');assert.equal(await evaluate(`document.querySelector('#modal').open`),false);
 }
 assert.deepEqual(business(await json('/api/workbench/backup')),before);
 const evidence={passed:true,checkedAt:new Date().toISOString(),health,results,productionBusinessMutation:false};await writeFile(resolve(output,'桌面验收.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));
}finally{try{await send('Emulation.clearDeviceMetricsOverride')}catch{}socket.close()}
