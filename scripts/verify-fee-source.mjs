import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {_electron} from 'file:///C:/Users/86199/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {databaseManifest} from './system-backup.mjs';
const out=resolve('output/jiaoyixingqiu-fees-2026-11-04'),preview=JSON.parse(await readFile(join(out,'preview.json'),'utf8')),base=preview.base;
const business=databaseManifest('.runtime/five-workbench.sqlite'),rules=['integrations/gold-planning.mjs','integrations/resonance-rule.mjs','scripts/fire_scan.py','integrations/approval-boundary.mjs'];
const hashes=Object.fromEntries(await Promise.all(rules.map(async p=>[p,createHash('sha256').update(await readFile(p)).digest('hex')])));
const env={...process.env,WUJIAN_DESKTOP_PORT:String(preview.port),WUJIAN_DESKTOP_PROFILE:join(preview.root,'profile')};delete env.ELECTRON_RUN_AS_NODE;
let app,page;const errors=[],checks=[];
try{
 app=await _electron.launch({executablePath:resolve('.runtime/desktop-fees-jiaoyixingqiu-20261104/小木-win32-x64/小木.exe'),env,timeout:45000});page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));
 await page.waitForSelector('#accountSelect option',{state:'attached',timeout:45000});await page.goto(base+'/#market/fees');await page.waitForSelector('#feeTable',{timeout:45000});
 if(!(await page.locator('#autoToggle').innerText()).includes('已暂停'))await page.locator('#autoToggle').click();
 const snap=await fetch(base+'/api/market-panorama/snapshot').then(r=>r.json());assert.equal(snap.feeSourceStatus.status,'ok');assert.equal(snap.feeSourceStatus.exchanges.length,6);assert.ok(snap.feeSourceStatus.rows>700);
 await page.locator('[data-picker-sector="能源"]').click();await page.locator('[data-fee-product="FU"]').click();
 const table=()=>page.locator('#feeTable').innerText();assert.match(await table(),/FU2701/);assert.match(await table(),/交易星球/);assert.match(await table(),/万分之0\.5/);assert.match(await table(),/2026-11-03/);assert.match(await table(),/2026-11-04/);
 const headers=await page.locator('#feeTable th').allTextContents();const costIndex=headers.findIndex(s=>s.includes('一开一平成本'));
 const fu=snap.products.find(p=>p.code==='FU').fees.find(f=>f.contract==='FU2701');
 const shownCost=async()=>Number((await page.locator('#feeTable tbody tr').first().locator('td').nth(costIndex).innerText()).replaceAll(',',''));
 assert.equal(await shownCost(),Number((fu.open+fu.today).toFixed(2)));await page.locator('#closeType').selectOption('previous');assert.equal(await shownCost(),Number((fu.open+fu.previous).toFixed(2)));
 await page.locator('#closeType').selectOption('today');await page.locator('[data-fee-type="free"]').click();assert.match(await table(),/FU2701/);await page.locator('[data-fee-type="all"]').click();
 await page.locator('#feeTable .fee-source summary').first().click();assert.match(await page.locator('#feeTable .fee-source a').first().getAttribute('href'),/jiaoyixingqiu.com\/shouxufei\/heyue\/fu/);
 checks.push({tableSourceDates:true,rawFeeRules:true,contractMatch:true,freeToday:true,openAndCloseCost:true,sourceLink:true});
 await page.locator('#mainOnly').uncheck();await page.locator('#mainOnly').check();checks.push({mainOnlyToggle:true});
 await page.locator('[data-fee-refresh]').click();
 await page.waitForFunction(()=>document.querySelector('#refreshButton')?.disabled===true,{},{timeout:5000});
 await page.waitForFunction(()=>document.querySelector('#refreshButton')?.disabled===false,{},{timeout:60000});
 await page.waitForTimeout(500);const after=await fetch(base+'/api/market-panorama/snapshot').then(r=>r.json());assert.ok(after.feeSourceStatus.checkedAt>snap.feeSourceStatus.checkedAt);assert.equal(after.feeSourceStatus.status,'ok');
 checks.push({actualFeeRefreshClick:true,autoPausedManualReload:true,newCheckedAt:after.feeSourceStatus.checkedAt});
 await page.setViewportSize({width:1920,height:1080});await page.screenshot({path:join(out,'desktop-fees.png'),fullPage:true});
 assert.deepEqual(errors,[]);assert.deepEqual(databaseManifest('.runtime/five-workbench.sqlite'),business);for(const [p,h]of Object.entries(hashes))assert.equal(createHash('sha256').update(await readFile(p)).digest('hex'),h);
 const receipt={passed:true,at:new Date().toISOString(),checks,errors,source:after.feeSourceStatus,formalBusinessUnchanged:true,protectedRulesUnchanged:true};
 await writeFile(join(out,'desktop-verification.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));
}catch(e){await page?.screenshot({path:join(out,'failed.png')}).catch(()=>{});await writeFile(join(out,'failed.json'),JSON.stringify({error:e.message,checks,errors},null,2));throw e}
finally{await app?.close().catch(()=>{})}