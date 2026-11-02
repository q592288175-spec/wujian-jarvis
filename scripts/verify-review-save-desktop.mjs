import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';

const base=process.env.WUJIAN_VERIFY_BASE||'http://127.0.0.1:4318',debug=process.env.WUJIAN_VERIFY_DEBUG||'http://127.0.0.1:9229';
const saveAllowed=process.env.WUJIAN_VERIFY_SAVE==='1',output=resolve(process.env.WUJIAN_VERIFY_OUTPUT||'output/playwright/review-save-2026-10-09');
const json=async path=>{const r=await fetch(base+path);assert.ok(r.ok,path);return r.json()},delay=ms=>new Promise(r=>setTimeout(r,ms));
const page=(await fetch(debug+'/json/list').then(r=>r.json())).find(p=>p.type==='page'&&p.url.startsWith(base+'/'));assert.ok(page,'APP须已加载本次源码');
const socket=new WebSocket(page.webSocketDebuggerUrl),pending=new Map();let seq=0;
await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject});socket.onmessage=e=>{const r=JSON.parse(e.data),p=pending.get(r.id);if(p){pending.delete(r.id);r.error?p.reject(Error(r.error.message)):p.resolve(r.result)}};
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error(method+'超时'))},30000);pending.set(id,{resolve:r=>{clearTimeout(timer);resolve(r)},reject:e=>{clearTimeout(timer);reject(e)}});socket.send(JSON.stringify({id,method,params}))});
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value};
const waitFor=async(expression,timeout=15000)=>{const until=Date.now()+timeout;while(Date.now()<until){if(await evaluate(expression))return;await delay(200)}throw Error('等待超时：'+expression)};
const click=async selector=>{await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center'})`);const p=await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...p});await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...p})};
const shot=async name=>{const r=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(join(output,name+'.png'),Buffer.from(r.data,'base64'))};
const business=({exportedAt,...rest})=>rest;
try{
 await mkdir(output,{recursive:true});const health=await json('/api/health'),before=business(await json('/api/workbench/backup')),historyBefore=await json('/api/workbench/postmarket-reviews');
 assert.equal(resolve(health.projectRoot),resolve('.'));
 const sources=['server.mjs','integrations/five-workbench.mjs','integrations/trade-ledger.mjs','integrations/team-governance.mjs','integrations/approval-boundary.mjs','integrations/assistant.mjs','integrations/team-context.mjs','integrations/postmarket-review.mjs','scripts/postmarket_calendar.py'];
 const chunks=[];for(const path of sources)chunks.push(await readFile(path));assert.equal(health.serverBuild,createHash('sha256').update(Buffer.concat(chunks)).digest('hex'));
 await send('Page.enable');await send('Page.bringToFront');await send('Page.navigate',{url:base+'/?view=fire'});await waitFor(`!!document.querySelector('#postmarketSaved')`);
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 await evaluate(`window.__reviewCalls=[];window.__originalFetch=window.fetch;window.fetch=(...args)=>{if(String(args[0]).includes('/postmarket-reviews'))window.__reviewCalls.push({path:String(args[0]),method:args[1]?.method||'GET'});return window.__originalFetch(...args)}`);
 const placement=await evaluate(`(()=>{const s=document.querySelector('#postmarketSaved').getBoundingClientRect(),a=document.querySelector('#postmarketReview').getBoundingClientRect();return{savedOnLeft:s.right<a.left,sameRow:Math.abs(s.top-a.top)<2}})()`);assert.ok(placement.savedOnLeft&&placement.sameRow);await shot('01-保存历史入口');
 await click('#postmarketSaved');await waitFor(historyBefore.length?`!!document.querySelector('[data-review-report]')`:`document.querySelector('#postmarketProgress').textContent.includes('还没有')`);
 assert.equal(await evaluate(`window.__reviewCalls.filter(r=>r.method==='POST').length`),0);await shot('02-已保存历史');await click('#modalClose');
 await click('#postmarketReview');await waitFor(`!!document.querySelector('[data-review-report]')`,360000);
 const id=await evaluate(`document.querySelector('[data-review-report]').dataset.reviewReport`);
 let job;const end=Date.now()+360000;do{job=await json('/api/workbench/postmarket-reviews/'+id);if(job.status!=='running')break;await delay(750)}while(Date.now()<end);
 assert.ok(['completed','partial'].includes(job.status));await waitFor(`!document.querySelector('#postmarketSave').disabled`,20000);
 assert.equal((await json('/api/workbench/postmarket-reviews')).length,historyBefore.length);assert.equal(existsSync(resolve('.runtime/postmarket-reviews',id)),false);
 const report=await json('/api/workbench/postmarket-reviews/'+id+'/result');assert.equal(report.saved,false);assert.ok(report.rows.length>0);await shot('03-分析完成未保存');
 const viewports=[];for(const width of [1440,1100,390]){
  await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});
  const layout=await evaluate(`(()=>{const d=document.querySelector('#modal'),r=d.getBoundingClientRect(),s=document.querySelector('#postmarketSave').getBoundingClientRect(),h=document.querySelector('#postmarketHistory').getBoundingClientRect();return{width:innerWidth,dialogWithin:r.left>=-1&&r.right<=innerWidth+1,noOverflow:d.scrollWidth<=d.clientWidth+1,saveVisible:s.width>0&&s.right<=r.right,controlsSeparate:s.top>=h.bottom-1||s.left>=h.right-1}})()`);
  assert.ok(layout.dialogWithin&&layout.noOverflow&&layout.saveVisible&&layout.controlsSeparate);viewports.push(layout);await evaluate(`document.querySelector('#modal').scrollTop=0`);await shot('04-窗口-'+width);
 }
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 if(saveAllowed){
  await click('#postmarketSave');await waitFor(`document.querySelector('#postmarketSave').textContent==='已保存'`);
  const list=await json('/api/workbench/postmarket-reviews');assert.equal(list.length,historyBefore.length+1);assert.equal(list[0].id,id);
  const saved=await json('/api/workbench/postmarket-reviews/'+id+'/result');assert.equal(saved.saved,true);assert.ok(existsSync(join(saved.storagePath,'复盘报告.md')));assert.equal(saved.inputHash,report.inputHash);await shot('05-主动保存完成');
  await click('#modalClose');await click('#postmarketSaved');await waitFor(`document.querySelector('[data-review-report]')?.dataset.reviewReport===${JSON.stringify(id)}&&document.querySelector('#postmarketHistory').value===${JSON.stringify(id)}`);await shot('06-历史找回');
 }
 assert.deepEqual(business(await json('/api/workbench/backup')),before);
 const calls=await evaluate('window.__reviewCalls'),analysisCalls=calls.filter(r=>r.method==='POST'&&!r.path.endsWith('/save')).length;assert.equal(analysisCalls,1);
 const evidence={passed:true,checkedAt:new Date().toISOString(),project:health.projectRoot,serverBuild:health.serverBuild,id,date:report.date,candidates:report.rows.length,ai:report.ai.status,manualSaveVerified:saveAllowed,historyBefore:historyBefore.length,noAutomaticSave:true,inputHash:report.inputHash,placement,viewports,analysisCalls,businessUnchanged:true};await writeFile(join(output,'保存与历史验收.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));await click('#modalClose');
}finally{try{await evaluate('if(window.__originalFetch)window.fetch=window.__originalFetch');await send('Emulation.clearDeviceMetricsOverride')}catch{}socket.close()}
