import assert from 'node:assert/strict';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {databaseManifest} from './system-backup.mjs';

const root=resolve('.'), out=resolve('output/playwright/day-trend-2026-10-18');
await mkdir(out,{recursive:true});
const base='http://127.0.0.1:4318';
const get=async path=>{const r=await fetch(base+path);assert.ok(r.ok,path);return r.json()};
const snapshot=async()=>{
 const rules=await get('/api/workbench/rules');
 return {fire:await get('/api/workbench/fire'),business:databaseManifest(resolve('.runtime/five-workbench.sqlite')),
  registry:{runId:rules.runId,hash:rules.combinedHash,sourceChanged:rules.sourceChanged}};
};
if(process.argv.includes('--capture')){
 await writeFile(resolve(out,'before.json'),JSON.stringify(await snapshot(),null,2));
 console.log(JSON.stringify({captured:true,output:out}));
}else{
 const before=JSON.parse(await readFile(resolve(out,'before.json'),'utf8')),after=await snapshot();
 assert.deepEqual(after.business,before.business,'正式业务表发生变化');
 assert.deepEqual(after.registry,before.registry,'本轮锁定版本发生变化');
 for(const mode of ['month-week-day','month-week','week-day']){
  assert.deepEqual(after.fire.counts[mode],before.fire.counts[mode]);
  assert.deepEqual(after.fire.rows.map(r=>r.modes[mode]),before.fire.rows.map(r=>r.modes[mode]));
 }
 const checks=[];
 for(const row of after.fire.rows){
  let bars;
  try{bars=JSON.parse(await readFile(resolve(root,'.runtime/fire-scan/contract-bars',row.main_contract+'.json'),'utf8'))}catch{continue}
  const daily=bars.filter(b=>String(b.date).slice(0,10)<=after.fire.target_date).sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  if(daily.length<11||row.modes['day-trend']==='数据不足')continue;
  const last=daily.at(-1),previous=daily.at(-2),mean=items=>items.reduce((sum,item)=>sum+Number(item.close),0)/10;
  assert.equal(String(last.date).slice(0,10),after.fire.target_date,row.code+' 合约日线日期');
  const currentMa=mean(daily.slice(-10)),previousMa=mean(daily.slice(-11,-1));
  assert.ok(Math.abs(currentMa-row.day_ma10)<0.000001,row.code+' MA10');
  assert.ok(Math.abs(previousMa-row.previous_day_ma10)<0.000001,row.code+' 昨日MA10');
  const expected=Number(last.volume)<=10000||Number(last.open_interest)<=10000?'流动性不合格'
   :currentMa>previousMa&&Number(last.low)>Number(previous.low)?'多头观察'
   :currentMa<previousMa&&Number(last.high)<Number(previous.high)?'空头观察':'未纳入';
  assert.equal(row.modes['day-trend'],expected,row.code+' 独立原始K线复算');
  checks.push({code:row.code,contract:row.main_contract,result:expected});
 }
 assert.ok(checks.length>=70,'可独立复算的具体合约样本不足');
 const {chromium}=await import('file:///C:/Users/86199/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
 const browser=await chromium.connectOverCDP('http://127.0.0.1:9229');
 const errors=[],sizes=[];
 try{
  const page=browser.contexts()[0].pages()[0];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/?view=fire');await page.locator('[data-mode="day-trend"]').click();
  assert.equal(await page.locator('[data-mode]').count(),4);
  await page.waitForFunction(()=>document.querySelector('.fire-overview')?.textContent.includes('个品种'));
  for(const width of [1500,1100,390]){
   await page.setViewportSize({width,height:1000});await page.locator('.fire-modebar').scrollIntoViewIfNeeded();
   const positions=await page.locator('.fire-modebar').evaluate(node=>({right:node.getBoundingClientRect().right,buttons:[...node.querySelectorAll('[data-mode]')].map(b=>{const r=b.getBoundingClientRect();return {mode:b.dataset.mode,left:r.left,right:r.right,scroll:b.scrollWidth,client:b.clientWidth}})}));
   assert.ok(positions.right<=width+1);
   assert.ok(positions.buttons.every(b=>b.left>=-1&&b.right<=width+1&&b.scroll<=b.client+1));
   await page.screenshot({path:resolve(out,'day-trend-'+width+'.png')});sizes.push({width,...positions});
  }
  await page.setViewportSize({width:1500,height:1000});
  const mainTable=page.locator('main table').last();
  const headers=await mainTable.locator('thead').innerText();assert.match(headers,/日 MA10/);assert.doesNotMatch(headers,/周K结构/);
  assert.equal(await page.locator('.fire-overview-group.fire-long [data-fire-detail]').count(),after.fire.counts['day-trend'].long);
  assert.equal(await page.locator('.fire-overview-group.fire-short [data-fire-detail]').count(),after.fire.counts['day-trend'].short);
  await page.locator('.fire-overview [data-fire-detail]').first().click();
  await page.locator('#contractChart canvas,#contractChart svg').first().waitFor();
  assert.equal(await page.locator('#detailResearch').isEnabled(),true);
  await page.locator('#modal').evaluate(d=>d.close());
  await page.locator('#fireFilter').selectOption('all');assert.equal(await mainTable.locator('tbody tr').count(),87);
  assert.equal(await page.locator('.fire-cycle').filter({hasText:'日K顺势'}).count(),87);
  await page.locator('#fireFilter').selectOption('candidate');
  await page.locator('[data-mode="week-day"]').click();assert.match(await mainTable.locator('thead').innerText(),/周 \/ 日 MA10/);
  await page.locator('[data-mode="day-trend"]').click();
  await page.locator('.fire-modebar').scrollIntoViewIfNeeded();
 }finally{await browser.close()}
 assert.deepEqual(errors,[]);
 const final=await snapshot();assert.deepEqual(final.business,before.business);assert.deepEqual(final.registry,before.registry);
 const result={checkedAt:new Date(Date.now()+28800000).toISOString().replace('Z','+08:00'),passed:true,
  dataDate:after.fire.data_date,counts:after.fire.counts['day-trend'],originalModesUnchanged:true,
  businessTablesUnchanged:Object.keys(after.business.tables).length,lockedRegistryUnchanged:true,rawBarsChecked:checks.length,checks,sizes,errors};
 await writeFile(resolve(out,'verification.json'),JSON.stringify(result,null,2));
 console.log(JSON.stringify({...result,checks:undefined,sizes:undefined}));
}
