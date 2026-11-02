import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {applyResonanceRule as previousRule} from '../.runtime/rule-history/2026-10-07-week-day-before/resonance-rule.mjs';

const base='http://127.0.0.1:4318';
const json=async path=>{const r=await fetch(base+path,{signal:AbortSignal.timeout(10000)});assert.ok(r.ok);return r.json()};
const pages=await fetch('http://127.0.0.1:9229/json/list').then(r=>r.json());
const page=pages.find(p=>p.type==='page'&&p.url.startsWith(base+'/'));
assert.ok(page,'未找到小木桌面窗口');
const socket=new WebSocket(page.webSocketDebuggerUrl),pending=new Map();let seq=0;
await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject});
socket.onmessage=e=>{const r=JSON.parse(e.data),p=pending.get(r.id);if(p){pending.delete(r.id);r.error?p.reject(Error(r.error.message)):p.resolve(r.result)}};
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error('桌面检查超时：'+method))},10000);pending.set(id,{resolve:r=>{clearTimeout(timer);resolve(r)},reject:e=>{clearTimeout(timer);reject(e)}});socket.send(JSON.stringify({id,method,params}))});
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text);return r.result.value};
try{
 const before=await json('/api/workbench/backup'),health=await json('/api/health'),fire=await json('/api/workbench/fire');
 assert.equal(resolve(health.projectRoot),resolve('.'));
 const candidates=fire.rows.filter(r=>['多头观察','空头观察'].includes(r.modes['week-day']));
 assert.equal(candidates.length,12);
 assert.equal(candidates.filter(r=>r.modes['week-day']==='多头观察').length,4);
 assert.equal(candidates.filter(r=>r.modes['week-day']==='空头观察').length,8);
 assert.ok(candidates.every(r=>r.volume>10000&&r.open_interest>10000));
 if(process.argv.includes('--all-strict'))for(const mode of ['month-week','week-day','month-week-day']){
  for(const row of fire.rows)if(['多头观察','空头观察'].includes(row.modes[mode]))assert.ok(row.volume>10000&&row.open_interest>10000);
 }
 const baseline=previousRule(JSON.parse(await readFile('.runtime/rule-history/2026-10-07-week-day-before/2026-09-30.json','utf8')));
 for(const mode of ['month-week','month-week-day']){
  const field=process.argv.includes('--all-strict')?'technical_modes':'modes';
  assert.deepEqual(fire.rows.map(r=>r[field][mode]),baseline.rows.map(r=>r[field][mode]));
 }
 await send('Page.enable');await send('Emulation.clearDeviceMetricsOverride');await send('Page.bringToFront');
 await send('Page.navigate',{url:base+'/?view=fire'});
 for(let n=0;n<50;n++){if(await evaluate(`!!document.querySelector('[data-mode="week-day"]')`))break;await new Promise(r=>setTimeout(r,200))}
 if(process.argv.includes('--all-strict'))for(const mode of ['month-week','month-week-day']){
  await evaluate(`document.querySelector('[data-mode="${mode}"]').click()`);
  const hint=await evaluate(`document.querySelector('#content .status-line').textContent`);
  assert.ok(hint.includes('严格＞1万手'));assert.ok(!hint.includes('2万')&&!hint.includes('≥1万'));
 }
 await evaluate(`document.querySelector('[data-mode="week-day"]').click()`);
 const snapshot=()=>evaluate(`({tab:document.querySelector('[data-mode="week-day"]')?.textContent,active:document.querySelector('[data-mode="week-day"]')?.classList.contains('active'),hint:document.querySelector('#content .status-line')?.textContent,rows:Array.from(document.querySelectorAll('#content tr')).filter(r=>r.querySelector('[data-fire-detail]')).map(r=>({code:r.querySelector('[data-fire-detail]').dataset.fireDetail,text:r.textContent,select:!!r.querySelector('[data-fire-select]:not(:disabled)')}))})`);
 const shown=await snapshot();
 assert.ok(shown.active);assert.ok(shown.tab.includes('12'));
 assert.ok(shown.hint.includes('严格＞1万手'));assert.ok(shown.hint.includes('不要求周线突破'));
 assert.equal(shown.rows.length,12);assert.ok(shown.rows.every(r=>r.select));
 assert.deepEqual(shown.rows.map(r=>r.code).sort(),candidates.map(r=>r.code).sort());
 const propylene=shown.rows.find(r=>r.code==='PL');assert.ok(propylene?.text.includes('13,093'));assert.ok(propylene.text.includes('已通过'));
 await evaluate(`(()=>{const f=document.querySelector('#fireFilter');f.value='illiquid';f.dispatchEvent(new Event('change',{bubbles:true}))})()`);
 const illiquid=await snapshot();assert.equal(illiquid.rows.length,10);
 assert.deepEqual(illiquid.rows.map(r=>r.code).sort(),fire.rows.filter(r=>r.ok&&!r.week_day_liquidity_ok).map(r=>r.code).sort());
 await evaluate(`(()=>{const f=document.querySelector('#fireFilter');f.value='candidate';f.dispatchEvent(new Event('change',{bubbles:true}))})()`);
 const after=await json('/api/workbench/backup');
 const {exportedAt:beforeTime,...beforeData}=before,{exportedAt:afterTime,...afterData}=after;
 assert.deepEqual(afterData,beforeData);
 const output=resolve(process.argv.includes('--all-strict')?'output/strict-liquidity-2026-10-07':'output/week-day-2026-10-07');await mkdir(output,{recursive:true});
 let screenshotAvailable=false,screenshotError=null;
 try{const screenshot=await send('Page.captureScreenshot',{format:'png',fromSurface:false,captureBeyondViewport:false});await writeFile(resolve(output,'周日小周期.png'),Buffer.from(screenshot.data,'base64'));screenshotAvailable=true}catch(e){screenshotError=e.message}
 const result={passed:true,checkedAt:new Date().toISOString(),health,dataDate:fire.data_date,rule:fire.week_day_rule,counts:fire.counts['week-day'],shown,illiquidCount:illiquid.rows.length,...(process.argv.includes('--all-strict')?{allModesStrictLiquidity:true,technicalConditionsUnchanged:true}:{otherModesUnchanged:true}),productionMutation:false,screenshotAvailable,screenshotError};
 await writeFile(resolve(output,'页面验收.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{socket.close()}
