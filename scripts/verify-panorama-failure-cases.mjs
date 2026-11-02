import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {sortPanoramaProducts} from '../dist/market-panorama-display.js';

const base='http://127.0.0.1:4318',out=resolve('output/market-panorama/failure-cases');await mkdir(out,{recursive:true});
const {chromium}=await import(pathToFileURL('C:/Users/86199/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'));
const browser=await chromium.launch({headless:true,executablePath:'E:/AppCache/Playwright/chromium-1228/chrome-win64/chrome.exe'}),errors=[],checks={};
try{
 const page=await browser.newPage({viewport:{width:1440,height:950}});page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/market-panorama.html#strength');await page.waitForSelector('#strengthChart canvas');
 await page.locator('#autoToggle').click();await page.waitForTimeout(600);await page.route('**/api/market-panorama/snapshot?**',async()=>{});
 const start=Date.now();await page.locator('#autoToggle').click();await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('超时'),null,{timeout:26000});
 assert.ok(Date.now()-start>=19000);assert.ok(await page.locator('#strengthChart canvas').count());checks.requestTimeout={elapsedMs:Date.now()-start,oldChartRetained:true};await page.close();
 const p=await browser.newPage({viewport:{width:1440,height:950}});p.on('pageerror',e=>errors.push(e.message));await p.goto(base+'/market-panorama.html#rankings');await p.waitForSelector('[data-rank-group="外资"]');
 const s=await fetch(base+'/api/market-panorama/snapshot').then(r=>r.json()),f=await fetch(base+'/api/workbench/fire').then(r=>r.json());
 for(const row of s.products){const r=f.rows.find(r=>r.code===row.code);if(r?.data_date<=s.selectedDate)assert.equal(row.fireModes['day-trend'],r.modes['day-trend'])}checks.liveDayTrend=true;
 await p.locator('[data-rank-group="外资"]').click();const product=s.products.find(p=>p.pairs.some(x=>x.groups.includes('外资')));assert.ok(product);const pairs=product.pairs.filter(x=>x.groups.includes('外资'));
 const tr=p.locator(`tr:has([data-product="${product.code}"])`);assert.ok((await tr.innerText()).includes(`公开双侧样本 ${pairs.filter(x=>x.complete).length}/${pairs.length}`));checks.groupCoverage=true;
 await p.locator('[data-rank-group="all"]').click();await p.locator('[data-seats="FU"]').click();await p.locator('#detailBody [data-sort="net"]').click();
 const values=await p.locator('#detailBody tbody tr td:nth-child(4)').allTextContents(),known=values.map(v=>Number(v.replaceAll(',',''))).filter(Number.isFinite);assert.deepEqual(known,[...known].sort((a,b)=>b-a));await p.locator('#detailDialog [data-close]').click();checks.modalSort=true;
 const exported=p.waitForResponse(r=>r.url().endsWith('/api/market-panorama/export'));await p.locator('#exportButton').click();const csvResult=await(await exported).json(),csv=await readFile(csvResult.path,'utf8');assert.ok(csv.includes('"来源"')&&csv.includes('"单位"')&&csv.includes('"计算口径"'));assert.ok(csv.includes('净仓=公开多仓-公开空仓'));assert.ok(csv.includes('行情：')&&csv.includes('席位：'));checks.csvEvidence=true;
 await p.locator('[data-nav="strength"]').click();await p.waitForSelector('#strengthChart canvas');await p.waitForTimeout(1000);const image=p.waitForResponse(r=>r.url().endsWith('/api/market-panorama/image'));await p.locator('[data-image="strengthChart"]').click();const imageResult=await(await image).json();assert.ok(imageResult.metadataPath);const metadata=JSON.parse(await readFile(imageResult.metadataPath,'utf8'));assert.equal(metadata['单位'],'涨跌幅（%）');assert.ok(metadata['来源']);assert.ok(metadata['截至时间']);checks.imageEvidence={path:imageResult.path,metadataPath:imageResult.metadataPath};
 await p.screenshot({path:resolve(out,'units-and-provenance.png'),fullPage:true});
 await p.locator('[data-nav="funds"]').click();await p.waitForSelector('[data-member]');const financial=sortPanoramaProducts(s.products).find(p=>p.exchange==='CFFEX');
 await p.route('**/api/market-panorama/variety?**',route=>new URL(route.request().url()).searchParams.get('product')===financial.code?route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'模拟品种读取失败'})}):route.continue());
 await p.locator('#scope').selectOption('financial');await p.waitForSelector('[data-retry-detail]');assert.equal(await p.locator('#fundChart').count(),0);await p.unroute('**/api/market-panorama/variety?**');await p.locator('[data-retry-detail]').click();await p.waitForSelector('#fundChart canvas');assert.ok(await p.locator(`[data-pick="${financial.code}"].active`).count());
 await p.locator('#search').fill('NO-MATCH-TEST');await p.waitForFunction(()=>document.querySelector('#content').textContent.includes('当前筛选没有可研究的品种'));assert.equal(await p.locator('#content canvas').count(),0);await p.locator('#resetFilters').click();await p.waitForSelector('#fundChart canvas');checks.filteredProductAndEmptyState=true;checks.detailRetry=true;
 assert.deepEqual(errors,[]);await writeFile(resolve(out,'verification.json'),JSON.stringify({passed:true,at:new Date().toISOString(),checks,errors},null,2));console.log(JSON.stringify({passed:true,checks,errors}));
}finally{await browser.close()}
