import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {databaseManifest} from './system-backup.mjs';
import {latestStrength,COMPARISON_VERSION} from '../integrations/relative-strength.mjs';

const base=process.env.STRENGTH_BASE||'http://127.0.0.1:4318';
const out=resolve('output/playwright/strength-leaders-2026-10-19');await mkdir(out,{recursive:true});
const get=async path=>{const r=await fetch(base+path);assert.ok(r.ok,path);return r.json()};
const hashes=async()=>Object.fromEntries(await Promise.all(['integrations/day-trend.mjs','integrations/resonance-rule.mjs','integrations/five-workbench.mjs','scripts/fire_scan.py'].map(async path=>[path,createHash('sha256').update(await readFile(path)).digest('hex')])));
if(process.argv.includes('--capture')){
 const rules=await get('/api/workbench/rules'),fire=await get('/api/workbench/fire');
 await writeFile(resolve(out,'before.json'),JSON.stringify({business:databaseManifest(resolve('.runtime/five-workbench.sqlite')),files:await hashes(),ruleHash:rules.combinedHash,runId:rules.runId,fireCounts:fire.counts},null,2));
 console.log('BEFORE_CAPTURED');
}else{
 const before=JSON.parse(await readFile(resolve(out,'before.json'),'utf8')),data=await get('/api/workbench/relative-strength'),fire=await get('/api/workbench/fire');
 const uiBefore=databaseManifest(resolve('.runtime/five-workbench.sqlite'));
 const concurrentChanges=Object.keys(uiBefore.tables).filter(k=>JSON.stringify(uiBefore.tables[k])!==JSON.stringify(before.business.tables[k])).map(k=>({table:k,before:before.business.tables[k].count,now:uiBefore.tables[k].count}));
 assert.equal(data.version,COMPARISON_VERSION);assert.equal(data.selectionPolicy.sourceMode,'day-trend');
 const direct=await latestStrength(fire);
 // Electron and standalone Node can differ at the last floating-point bit.
 assert.deepEqual(direct.slots.map(s=>[s.long?.code,s.short?.code]),data.slots.map(s=>[s.long?.code,s.short?.code]));
 for(const side of ['longs','shorts'])for(const row of data[side]){
  const other=direct[side].find(r=>r.code===row.code);assert.ok(other);
  for(const key of ['return5','return20','efficiency20','adverse20','comparisonScore'])assert.ok(Math.abs(row[key]-other[key])<1e-10,key);
 }
 assert.equal(data.selectedLongs.length,3);assert.equal(data.selectedShorts.length,3);
 for(const side of ['selectedLongs','selectedShorts']){
  const families=data[side].map(i=>i.riskFamily).filter(Boolean);assert.equal(families.length,new Set(families).size);
 }
 for(const rel of data.relationships.filter(r=>r.a.side===r.b.side)){
  assert.ok(rel.value!==null&&rel.value<.8);assert.ok(rel.longWindow.value===null||rel.longWindow.value<.8);
 }
 const {chromium}=await import('file:///C:/Users/86199/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
 const browser=await chromium.launch({channel:'msedge',headless:true}),errors=[],writes=[],sizes=[];
 try{
  const page=await browser.newPage({viewport:{width:1500,height:1000}});
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!['GET','HEAD'].includes(r.method()))writes.push(r.url())});
  await page.goto(base+'/?view=fire');await page.locator('[data-strength-pair="2"]').waitFor();
  for(const mode of ['month-week-day','month-week','week-day','day-trend']){
   await page.locator('[data-mode="'+mode+'"]').click();await page.locator('[data-strength-pair="2"]').waitFor();
   assert.match(await page.locator('.strength-heading').innerText(),/日K顺势/);
  }
  for(const width of [1500,1100,390]){
   await page.setViewportSize({width,height:1000});await page.locator('.strength-summary').scrollIntoViewIfNeeded();
   const layout=await page.locator('.strength-summary').evaluate(n=>({pageWidth:document.documentElement.scrollWidth,width:innerWidth,right:n.getBoundingClientRect().right,clipped:[...n.querySelectorAll('.strength-pair,.strength-pair span')].filter(x=>x.scrollWidth>x.clientWidth+1).map(x=>x.textContent)}));
   assert.equal(layout.clipped.length,0);assert.ok(layout.pageWidth<=width+1);sizes.push({width,...layout});await page.screenshot({path:resolve(out,'stable-'+width+'.png')});
  }
  await page.setViewportSize({width:1500,height:1000});await page.locator('[data-strength-pair="0"]').click();
  assert.equal(await page.locator('.strength-table tbody tr').count(),6);
  await page.getByText('为什么没选其他品种', {exact:false}).click();
  assert.match(await page.locator('#modalBody').innerText(),/同方向国债利率仅保留/);
  assert.match(await page.locator('#modalBody').innerText(),/同方向原油及燃料链仅保留/);
  await page.screenshot({path:resolve(out,'detail.png')});await page.locator('#modalClose').click();
  await page.goto(base+'/fire-preview-dark.html');const frame=page.frameLocator('#workbenchPreview');
  await frame.locator('[data-strength-pair="2"]').waitFor();await frame.locator('.strength-summary').scrollIntoViewIfNeeded();
  assert.match(await frame.locator('.strength-heading').innerText(),/日K顺势/);await page.screenshot({path:resolve(out,'dark-preview.png')});
  // Synthetic vacancies are browser-only; no business API writes.
  await page.route('**/api/workbench/relative-strength',async route=>{
   const partial=structuredClone(data);partial.slots[2].long=null;partial.selectedLongs.pop();partial.pool.selectedLong=2;partial.missing.long=1;partial.pairs=partial.pairs.filter(p=>p.number!==3);partial.status='partial';
   await route.fulfill({json:partial});
  });
  await page.goto(base+'/?view=fire');await page.locator('[data-strength-pair="2"]').waitFor();
  assert.match(await page.locator('[data-strength-pair="2"]').innerText(),/多 暂缺合格候选/);
  assert.match(await page.locator('[data-strength-pair="2"]').innerText(),new RegExp(data.slots[2].short.name));
  await page.locator('[data-strength-pair="2"]').click();assert.equal(await page.locator('.strength-table tbody tr').count(),5);
  assert.match(await page.locator('#modalBody').innerText(),/多头缺 1 个/);
  assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);
 }finally{await browser.close()}
 const desktop=await chromium.connectOverCDP(process.env.STRENGTH_CDP||'http://127.0.0.1:9232');
 try{
  const page=desktop.contexts()[0].pages()[0];await page.goto(base+'/?view=fire');await page.locator('[data-strength-pair="2"]').waitFor();
  await page.locator('.strength-summary').scrollIntoViewIfNeeded();await page.screenshot({path:resolve(out,'windows-app.png')});
  await page.locator('[data-strength-pair="0"]').click();assert.equal(await page.locator('.strength-table tbody tr').count(),6);await page.locator('#modalClose').click();
 }finally{await desktop.close()}
 const rules=await get('/api/workbench/rules');assert.equal(rules.combinedHash,before.ruleHash);assert.equal(rules.runId,before.runId);
 assert.deepEqual(await hashes(),before.files);assert.deepEqual(databaseManifest(resolve('.runtime/five-workbench.sqlite')),uiBefore);
 assert.deepEqual((await get('/api/workbench/fire')).counts,before.fireCounts);
 const result={passed:true,checkedAt:new Date().toISOString(),dataDate:data.cutoff,version:data.version,sizes,errors,writes,recordsUnchangedDuringUiCheck:true,concurrentChangesBeforeUiCheck:concurrentChanges,ruleHashUnchanged:true,selection:data.slots.map(p=>({long:p.long.name,short:p.short.name})),inputHash:data.inputHash,desktopVerified:true,partialStateVerified:true};
 await writeFile(resolve(out,'verification.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}
