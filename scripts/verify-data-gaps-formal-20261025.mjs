import {chromium,project} from './redesign-harness.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {databaseManifest} from './system-backup.mjs';
import assert from 'node:assert/strict';
const base='http://127.0.0.1:4318',out='output/data-gaps-2026-10-25',errors=[],checks=[];
const health=await fetch(base+'/api/health').then(r=>r.json());assert.equal(health.projectRoot,project);
const browser=await chromium.launch({headless:true,executablePath:'E:/AppCache/Playwright/chromium-1228/chrome-win64/chrome.exe'});
try{
 const p=await browser.newPage({viewport:{width:1440,height:900}});p.on('pageerror',e=>errors.push(e.message));
 await p.goto(base+'/market-panorama.html#variety');await p.waitForSelector('.detail-identity');
 await p.locator('[data-picker-sector="农产品"]').click();await p.locator('[data-pick=M]').click();
 await p.waitForSelector('[data-evidence=warehouse] details');await p.locator('[data-evidence=warehouse] summary').click();
 assert.match(await p.locator('[data-evidence=warehouse]').innerText(),/67 条历史/);
 await p.locator('[data-evidence=warehouse]').scrollIntoViewIfNeeded();await p.screenshot({path:out+'/formal-warehouse-click.png'});checks.push('正式服务豆粕67条仓单历史展开');
 await p.locator('[data-picker-sector="有色"]').click();await p.locator('[data-pick=CU]').click();
 await p.waitForFunction(()=>document.querySelector('[data-evidence=roll]')?.textContent.includes('ln('),null,{timeout:30000});
 await p.locator('[data-evidence=roll]').scrollIntoViewIfNeeded();await p.screenshot({path:out+'/formal-roll-click.png'});checks.push('正式服务沪铜展期参考可见');
 const detail=async code=>fetch(base+'/api/market-panorama/variety?product='+code+'&date=2026-10-25').then(r=>r.json());
 const sc=await detail('SC'),ap=await detail('AP'),ec=await detail('EC'),m=await detail('M');
 assert.equal(sc.rollYield.exchange,'INE');assert.equal(ap.warrantStatus.status,'stale');assert.equal(ec.warrantStatus.status,'empty');assert.match(m.rollStatus.reason,/412/);
 checks.push('能源中心品种未重复计入上期所','旧仓单、无记录、大商所412均保留真实状态');
 await p.locator('#sourcesButton').click();const sources=await p.locator('#sourceBody').innerText();assert.match(sources,/4904 条/);assert.match(sources,/58 条/);await p.screenshot({path:out+'/formal-sources-click.png'});
 const baseline=JSON.parse(await readFile(out+'/baseline.json','utf8')),hashes={};
 for(const[f,h]of Object.entries(baseline.hashes))hashes[f]=createHash('sha256').update(await readFile(f)).digest('hex')===h;
 assert.ok(Object.values(hashes).every(Boolean));const businessUnchanged=JSON.stringify(databaseManifest('.runtime/five-workbench.sqlite'))===JSON.stringify(baseline.business);assert.ok(businessUnchanged);assert.deepEqual(errors,[]);
 await writeFile(out+'/formal-activation.json',JSON.stringify({checkedAt:new Date().toISOString(),base,projectRoot:health.projectRoot,checks,errors,hashes,businessUnchanged,tradeRulesChanged:false,accountDatabaseWritten:false},null,2));console.log(JSON.stringify({checks,errors,hashes,businessUnchanged}));
}finally{await browser.close()}
