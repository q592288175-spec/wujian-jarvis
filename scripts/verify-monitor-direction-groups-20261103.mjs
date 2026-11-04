import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {_electron} from 'file:///C:/Users/86199/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {firePoolCodes,monitorFirePools} from '../dist/trend-monitor-ui.js';
import {databaseManifest} from './system-backup.mjs';
const out=resolve('output/monitor-direction-groups-2026-11-03'),preview=JSON.parse(readFileSync(out+'/preview.json','utf8')),base=preview.base;
const before=databaseManifest('.runtime/five-workbench.sqlite'),checks=[],errors=[],env={...process.env,WUJIAN_DESKTOP_PORT:String(preview.port),WUJIAN_DESKTOP_PROFILE:join(preview.root,'pool-profile'),WUJIAN_MONITOR_HOME:join(preview.root,'monitor')};delete env.ELECTRON_RUN_AS_NODE;let app,page;
const get=path=>fetch(base+path).then(r=>r.json());
try{
 app=await _electron.launch({executablePath:resolve('.runtime/desktop-monitor-direction-groups-20261103/小木-win32-x64/小木.exe'),env,timeout:45000});page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));await page.waitForSelector('#accountSelect option',{state:'attached',timeout:45000});await page.setViewportSize({width:1920,height:1080});await page.goto(base+'/market-panorama.html#market/monitor');
 await page.waitForFunction(()=>document.querySelector('[data-tm-fire-pool="month-week-day"]')?.disabled===false);
 const fire=await get('/api/workbench/fire'),status=await get('/api/trend-monitor/status'),available=new Set(status.rows.map(r=>r.code)),originalWatch=JSON.stringify(status.watchlist),originalTasks=JSON.stringify(status.tasks);
 for(const [mode,label]of monitorFirePools){
  await page.locator(`[data-tm-fire-pool="${mode}"]`).click();const expected=[...firePoolCodes(fire,mode)].filter(c=>available.has(c)).sort();const actual=await page.locator('[data-tm-row]').evaluateAll(rows=>rows.map(r=>r.dataset.tmRow).sort());assert.deepEqual(actual,expected,label);
  assert.match(await page.locator(`[data-tm-fire-pool="${mode}"]`).innerText(),new RegExp('\\b'+firePoolCodes(fire,mode).size+'\\b'));const sides={};for(const side of ['long','short']){const wanted=side==='long'?'多头观察':'空头观察',expectedSide=fire.rows.filter(r=>r.modes?.[mode]===wanted&&available.has(r.code)).map(r=>r.code).sort(),actualSide=await page.locator(`[data-tm-direction-group="${side}"] [data-tm-watch-code]`).evaluateAll(nodes=>nodes.map(n=>n.dataset.tmWatchCode).sort());assert.deepEqual(actualSide,expectedSide);sides[side]=actualSide.length;}checks.push({mode,label,fireCount:firePoolCodes(fire,mode).size,monitorCount:actual.length,sides});
 }
 assert.equal(JSON.stringify((await get('/api/trend-monitor/status')).watchlist),originalWatch);checks.push({poolBrowsingKeepsOriginalWatchlist:true});
 await page.locator('[data-tm-fire-pool="month-week-day"]').click();await page.locator('[data-tm-sector="化工"]').click();const intersection=status.rows.filter(r=>r.sector==='化工'&&firePoolCodes(fire,'month-week-day').has(r.code)).map(r=>r.code).sort();assert.deepEqual(await page.locator('[data-tm-row]').evaluateAll(rows=>rows.map(r=>r.dataset.tmRow).sort()),intersection);await page.locator('[data-tm-sector="all"]').click();
 await page.screenshot({path:join(out,'monitor-fire-pools-1920.png')});await page.setViewportSize({width:1366,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:join(out,'monitor-fire-pools-1366.png')});checks.push({sectorIntersection:true,responsiveWidths:[1920,1366]});
 const expected=[...firePoolCodes(fire,'month-week-day')].filter(c=>available.has(c)).sort();await page.locator('[data-tm-pool-only]').click();await page.waitForFunction(count=>document.querySelector('[data-tm-selection-state]')?.textContent.includes('已勾选 '+count+' /')&&document.querySelector('[data-tm-selection-state]')?.textContent.includes('已生效'),expected.length);
 const after=await get('/api/trend-monitor/status');assert.deepEqual([...after.watchlist.codes].sort(),expected);assert.equal(JSON.stringify(after.tasks),originalTasks);assert.ok(after.rows.filter(r=>r.monitored).every(r=>expected.includes(r.code)));checks.push({backendWatchlistActuallyRestricted:true,taskPeriodsAndChannelsUnchanged:true});
 await page.locator('[data-tm-fire-pool="all"]').click();assert.equal(await page.locator('[data-tm-row]').count(),status.rows.length);checks.push({allProductsStillAvailable:true});
 assert.deepEqual(errors,[]);assert.deepEqual(databaseManifest('.runtime/five-workbench.sqlite'),before);
 const result={passed:true,at:new Date().toISOString(),checks,errors,source:'/api/workbench/fire',dataDate:fire.dataDate||fire.data_date,formalBusinessUnchanged:true,scope:'真实扫描副本；仅隔离监控库的名单被修改；未发送微信、未创建方案'};writeFileSync(join(out,'desktop-verification.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}catch(e){await page?.screenshot({path:join(out,'failure.png')}).catch(()=>{});writeFileSync(join(out,'failure.json'),JSON.stringify({error:e.message,checks,errors},null,2));throw e}
finally{await app?.evaluate(({app})=>app.exit(0)).catch(()=>{});await app?.close().catch(()=>{})}
