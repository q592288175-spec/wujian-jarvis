import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {_electron} from 'file:///C:/Users/86199/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {databaseManifest} from './system-backup.mjs';
const out=resolve('output/follow-hour-2026-11-04'),preview=JSON.parse(await readFile(join(out,'preview.json'),'utf8')),base=preview.base;
const before=databaseManifest('.runtime/five-workbench.sqlite'),protectedFiles=['scripts/fire_scan.py','integrations/gold-planning.mjs','integrations/resonance-rule.mjs','integrations/approval-boundary.mjs'],hashes=Object.fromEntries(await Promise.all(protectedFiles.map(async p=>[p,createHash('sha256').update(await readFile(p)).digest('hex')])));
const env={...process.env,WUJIAN_DESKTOP_PORT:String(preview.port),WUJIAN_DESKTOP_PROFILE:join(preview.root,'profile'),WUJIAN_DESKTOP_INITIAL_ROUTE:'market/monitor'};delete env.ELECTRON_RUN_AS_NODE;
let app,page;const errors=[],checks=[];
const api=path=>fetch(base+'/api/trend-monitor/'+path).then(r=>r.json());
try{
 app=await _electron.launch({executablePath:resolve('.runtime/desktop-follow-hour-20261104/小木-win32-x64/小木.exe'),env,timeout:45000});page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));await page.waitForSelector('#accountSelect option',{state:'attached',timeout:45000});
 await page.goto(base+'/#market/monitor');await page.waitForSelector('[data-tm-watch-products] [data-tm-follow]',{timeout:45000});
 const initial=await api('status');assert.deepEqual(initial.watchlist.codes,[]);assert.equal(initial.coverage.subscribed,0);assert.equal(initial.alertIntervalMs,3600000);
 assert.equal(await page.locator('[data-tm-watch-code]').count(),0);assert.equal(await page.locator('[data-tm-selection-save]').count(),0);checks.push({defaultUnfollowed:true,noProductCheckboxes:true,noApplyStep:true,hourInterval:3600000});
 await page.locator('[data-tm-sector="有色"]').click();const cu=()=>page.locator('[data-tm-watch-products] [data-tm-follow="CU"]');
 assert.equal(await cu().innerText(),'关注');await cu().click();await page.waitForFunction(()=>document.querySelector('[data-tm-watch-products] [data-tm-follow="CU"]')?.textContent==='已关注');
 const watched=await api('status');assert.deepEqual(watched.watchlist.codes,['CU']);assert.equal(watched.coverage.subscribed,1);assert.equal(watched.rows.find(r=>r.code==='CU').watched,true);assert.equal(watched.rows.find(r=>r.code==='AL').watched,false);
 await page.locator('[data-tm-refresh]').click();await page.waitForTimeout(500);assert.equal(await cu().innerText(),'已关注');
 assert.equal(await page.locator('[data-tm-row="CU"] [data-tm-follow]').innerText(),'已关注');checks.push({singleClickPersists:true,backendOnlyFollowsCU:true,tableAndPickerAgree:true,refreshPreserves:true});
 await page.setViewportSize({width:1920,height:1080});await page.locator('.tm-watch-picker').screenshot({path:join(out,'follow-picker.png')});
 await cu().click();await page.waitForFunction(()=>document.querySelector('[data-tm-watch-products] [data-tm-follow="CU"]')?.textContent==='关注');let status=await api('status');assert.deepEqual(status.watchlist.codes,[]);assert.equal(status.coverage.subscribed,0);
 await page.reload();await page.waitForSelector('[data-tm-watch-products] [data-tm-follow]');status=await api('status');assert.deepEqual(status.watchlist.codes,[]);assert.equal(status.coverage.subscribed,0);checks.push({unfollowStopsSubscriptions:true,reloadDoesNotReenable:true});
 await page.locator('[data-tm-sector="有色"]').click();await page.locator('[data-tm-select-visible]').click();await page.waitForFunction(()=>document.querySelector('[data-tm-selection-state]')?.textContent.includes('已生效'));status=await api('status');assert.ok(status.watchlist.codes.includes('CU'));assert.ok(status.watchlist.codes.includes('AL'));await page.locator('[data-tm-clear-visible]').click();await page.waitForFunction(()=>document.querySelector('[data-tm-selection-state]')?.textContent.includes('已关注 0'));assert.deepEqual((await api('status')).watchlist.codes,[]);checks.push({explicitRangeFollowAndUnfollow:true});
 await page.screenshot({path:join(out,'monitor-page.png'),fullPage:true});assert.deepEqual(errors,[]);assert.deepEqual(databaseManifest('.runtime/five-workbench.sqlite'),before);for(const [p,h]of Object.entries(hashes))assert.equal(createHash('sha256').update(await readFile(p)).digest('hex'),h,p);
 const receipt={passed:true,at:new Date().toISOString(),checks,errors,businessUnchanged:true,tradingRulesUnchanged:true,scope:'独立桌面与测试监控库；真实周期重复触发由合成行情回归验证，未向本人发送测试警报'};await writeFile(join(out,'desktop-verification.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));
}catch(e){await page?.screenshot({path:join(out,'failed.png')}).catch(()=>{});await writeFile(join(out,'failed.json'),JSON.stringify({error:e.message,checks,errors},null,2));throw e}finally{await app?.close().catch(()=>{})}