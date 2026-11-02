import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {_electron} from 'file:///C:/Users/86199/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {closeRows,sectorHeat,hotProducts,homeExchanges} from '../dist/market-home.js';
import {databaseManifest} from './system-backup.mjs';
const out=resolve('output/market-overview-2026-10-30'),preview=JSON.parse(await readFile(join(out,'preview.json'),'utf8')),base=preview.base;
const checks=[],errors=[],snap=await fetch(base+'/api/market-panorama/snapshot').then(r=>r.json());
const rows=closeRows(snap.products,snap.closeOverview),valid=rows.filter(p=>p.eod.status==='ok'),missing=rows.filter(p=>p.eod.status!=='ok');
assert.equal(snap.products.length,87);assert.equal(valid.length,81);assert.equal(snap.closeOverview.day,'2026-10-29');assert.equal(snap.closeOverview.previousDay,'2026-10-28');
for(const p of valid)assert.ok(Math.abs(p.eod.changePct-(p.eod.close/p.eod.previousClose-1)*100)<1e-9);
checks.push({closePairs:true,valid:valid.length,missing:missing.map(p=>({code:p.code,reason:p.eod.reason})),dates:[snap.closeOverview.day,snap.closeOverview.previousDay]});
const env={...process.env,WUJIAN_DESKTOP_PORT:String(preview.port),WUJIAN_DESKTOP_PROFILE:join(preview.root,'desktop-verify-profile')};delete env.ELECTRON_RUN_AS_NODE;
let app,page;
try{
 app=await _electron.launch({executablePath:resolve('.runtime/desktop-market-overview-20261030/小木-win32-x64/小木.exe'),env,timeout:45000});
 page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));
 await page.waitForSelector('#accountSelect option',{state:'attached',timeout:45000});await page.goto(base+'/market-panorama.html#market/home');await page.waitForSelector('#homeHeatmap canvas');
 const codes=()=>page.locator('#homeHotTable tbody tr[data-product-code]').evaluateAll(es=>es.map(e=>e.dataset.productCode));
 const click=async selector=>{await page.locator(selector).click();await page.waitForTimeout(100)};
 if(!(await page.locator('#autoToggle').innerText()).includes('已暂停'))await click('#autoToggle');
 assert.deepEqual(await codes(),hotProducts(rows).map(p=>p.code));
 const uiGroups=await page.locator('#homeHeatmap').evaluate(e=>echarts.getInstanceByDom(e).getOption().series[0].data);
 for(const g of sectorHeat(rows)){const actual=uiGroups.find(x=>x.name===g.name);assert.ok(g.mean===null?actual.mean===null:Math.abs(actual.mean-g.mean)<1e-10);assert.equal(actual.count,g.count)}
 for(const [ex] of homeExchanges){await click(`[data-home-exchange="${ex}"]`);assert.deepEqual(await codes(),hotProducts(rows,{exchange:ex}).map(p=>p.code))}
 await click('[data-home-exchange="all"]');checks.push({sixExchangeFilters:true});
 for(const order of ['gainers','losers','volume']){await click(`[data-home-order="${order}"]`);assert.deepEqual(await codes(),hotProducts(rows,{order}).map(p=>p.code))}
 // Click the actual ECharts rectangle, not only the equivalent accessibility button.
 const tile=await page.locator('#homeHeatmap').evaluate(e=>{const c=echarts.getInstanceByDom(e),s=c.getModel().getSeriesByIndex(0),d=s.getData(),i=Array.from({length:d.count()},(_,i)=>i).find(i=>d.getName(i)==='化工'),r=d.getItemLayout(i);return{x:r.x+r.width/2,y:r.y+r.height/2}});
 await page.locator('#homeHeatmap').click({position:tile});await page.waitForTimeout(100);
 assert.match(await page.locator('.home-hot-panel h2').innerText(),/化工/);assert.deepEqual(await codes(),hotProducts(rows,{sector:'化工'}).map(p=>p.code));
 await click('[data-home-sector="all"]');assert.deepEqual(await codes(),hotProducts(rows).map(p=>p.code));checks.push({actualHeatmapTileClick:true,sectorLinkAndClear:true,volumeGainLossSorts:true});
 const first=(await codes())[0],e=rows.find(p=>p.code===first).eod;await click(`[data-home-evidence="${first}"]`);await page.waitForSelector('#detailDialog[open]');
 assert.match(await page.locator('#detailBody').innerText(),new RegExp(e.contract));assert.match(await page.locator('#detailBody').innerText(),/2026-10-28/);
 await page.locator('#detailDialog').screenshot({path:join(out,'desktop-close-evidence.png')});await click('#detailDialog [data-close]');
 await page.locator('#scope').selectOption('financial');await page.waitForTimeout(150);assert.ok((await codes()).every(c=>['IF','IH','IC','IM','T','TF','TS','TL'].includes(c)));await page.locator('#scope').selectOption('all');await page.waitForTimeout(150);
 await page.locator('#search').fill('NOT-EXISTENT-VERIFY');await page.waitForTimeout(300);assert.equal((await codes()).length,0);assert.match(await page.locator('#homeHotTable').innerText(),/没有可比收盘数据/);await click('#resetFilters');checks.push({sameContractEvidenceDialog:true,allFuturesRetained:true,financialScope:true,emptySearch:true});
 await page.waitForTimeout(350);const widthChecks=[];
 for(const width of [1920,1440,1100]){
  await page.setViewportSize({width,height:1080});await page.waitForTimeout(400);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.locator('.home-overview').screenshot({path:join(out,'desktop-overview-'+width+'.png')});
  widthChecks.push({width,noHorizontalOverflow:true,chart:await page.locator('#homeHeatmap').evaluate(e=>{const c=echarts.getInstanceByDom(e);return {data:c.getOption().series[0].data.map(x=>x.name),drawn:c.getZr().storage.getDisplayList().length}})});
 }
 checks.push({responsive:widthChecks});
 await page.setViewportSize({width:1920,height:1080});
 await page.locator('.home-data-gaps summary').click();assert.match(await page.locator('.home-data-gaps').innerText(),/WR 线材/);await page.locator('.home-data-gaps').screenshot({path:join(out,'desktop-data-gaps.png')});
 await page.locator('.home-data-gaps summary').click();
 // Date replay must not borrow data from a future main-contract mapping.
 await page.locator('#date').fill('2026-10-28');await page.locator('#date').dispatchEvent('change');await page.waitForFunction(()=>document.querySelector('.home-close-summary')?.textContent.includes('完成收盘2026-10-28'));
 await page.locator('.home-close-summary').screenshot({path:join(out,'desktop-history.png')});await page.locator('#date').fill(snap.selectedDate);await page.locator('#date').dispatchEvent('change');await page.waitForFunction(()=>document.querySelector('.home-close-summary')?.textContent.includes('完成收盘2026-10-29'));
 checks.push({historicalDateReplay:true});
 // Only new collection writes in isolated market copy; duplicate clicks remain guarded.
 await click('[data-home-refresh]');await page.waitForFunction(()=>document.querySelector('[data-home-refresh]')?.disabled===true);assert.equal(await page.locator('#refreshButton').isDisabled(),true);
 await page.waitForFunction(()=>document.querySelector('[data-home-refresh]')?.disabled===false,{},{timeout:90000});
 checks.push({actualSyncClick:true,duplicateClickGuard:true});
 const otherPages=process.argv.includes('--focused')?[]:[['overview','.cycle-stat'],['strength','#comparisonStatus'],['rankings','#rankingTable'],['funds','#fundChart'],['positions','#positionChart'],['fees','#feeTable'],['variety','#priceChart'],['seat-flow','#seatFlowTable']];
 for(const [id,selector] of otherPages){
  await click(`[data-nav="${id}"]`);await page.waitForSelector(selector,{timeout:30000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 }
 checks.push({eightOtherMarketPagesOpened:otherPages.length===8,focusedRerun:process.argv.includes('--focused')});await click('[data-nav="home"]');await page.waitForSelector('#homeHeatmap canvas');
 await page.locator('.home-overview').screenshot({path:join(out,'desktop-overview-final.png')});
 assert.deepEqual(errors,[]);
 const baseline=JSON.parse(await readFile(join(out,'baseline.json'),'utf8'));
 // Business manifest and protected file hashes are recorded before this task.
 const manifest=databaseManifest('.runtime/five-workbench.sqlite');assert.deepEqual(manifest,baseline.business);
 const hashResults={};for(const [name,expected] of Object.entries(baseline.hashes||{})){const hash=createHash('sha256').update(await readFile(name)).digest('hex');assert.equal(hash,expected,name);hashResults[name]=hash}
 const result={passed:true,at:new Date().toISOString(),checks,errors,manifest,hashResults,scope:'真实收盘数据副本；新版独立桌面实际点击，不产生交易卡或批准'};
 await writeFile(join(out,'verification.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({passed:true,checks:checks.length,valid:valid.length,missing:missing.length,errors}));
}catch(e){const detail=await page?.evaluate(()=>({route:location.hash,context:window.xiaomuContext(),body:document.querySelector('#marketContent')?.innerText.slice(0,2200)})).catch(()=>null);await page?.screenshot({path:join(out,'failure-screen.png')}).catch(()=>{});await writeFile(join(out,'verification-failure.json'),JSON.stringify({error:e.message,stack:e.stack,checks,errors,detail},null,2));throw e}
finally{await app?.close().catch(()=>{})}
