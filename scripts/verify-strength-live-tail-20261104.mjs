import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {databaseManifest} from './system-backup.mjs';
import {chromium} from 'file:///C:/Users/86199/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const out=resolve('output/strength-live-2026-11-04'),prior=JSON.parse(await readFile(join(out,'failure.json'),'utf8'));
assert.match(prior.error,/strict mode violation/);assert.ok(prior.checks.some(x=>x.moreThanTwelveLabels));assert.ok(prior.checks.some(x=>x.automaticRefreshObserved));
await writeFile(join(out,'first-ui-run-selector-issue.json'),JSON.stringify(prior,null,2));
const checks=[...prior.checks],errors=[],browser=await chromium.connectOverCDP('http://127.0.0.1:9236'),page=browser.contexts()[0].pages()[0];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.reload();await page.waitForSelector('#strengthChart canvas',{timeout:60000});
 await page.locator('.observation-pool-row [data-strength-pool="all"]').click();await page.locator('[data-strength-group="股指"]').click();
 await page.waitForFunction(()=>{const e=document.querySelector('#strengthChart'),o=echarts.getInstanceByDom(e)?.getOption();return o?.series?.length===4&&o.series.every(s=>['IH','IF','IC','IM'].includes(s.id))},{},{timeout:60000});checks.push({sectorActuallyFiltersChart:true,stockIndexSeries:4});
 await page.locator('[data-strength-group="all"]').click();
 for(const key of ['month-week-day','week-day','day-trend']){const button=page.locator('.observation-pool-row [data-strength-pool="'+key+'"]');await button.click();assert.equal(await button.getAttribute('aria-pressed'),'true')};checks.push({existingPoolsStillClickable:true});
 await page.locator('.observation-pool-row [data-strength-pool="quote"]').click();await page.waitForFunction(()=>document.querySelector('#comparisonStatus')?.textContent.includes('12 / 12'),{},{timeout:60000});
 await page.locator('.strength-board').scrollIntoViewIfNeeded();await page.screenshot({path:join(out,'final-desktop.png'),animations:'disabled'});await page.locator('.strength-board').screenshot({path:join(out,'final-board.png'),animations:'disabled'});
 assert.deepEqual(errors,[]);
 const before=JSON.parse(await readFile(join(out,'preservation-before.json'),'utf8')),after=databaseManifest('.runtime/five-workbench.sqlite'),changed=Object.keys(before.business.tables).filter(k=>JSON.stringify(before.business.tables[k])!==JSON.stringify(after.tables[k]));
 const sameFiles=Object.fromEntries(await Promise.all(Object.keys(before.rules).map(async p=>[p,createHash('sha256').update(await readFile(p)).digest('hex')])));assert.deepEqual(sameFiles,before.rules);assert.ok(changed.every(k=>k==='scan_runs'));
 const hashes=await Promise.all(['.runtime/desktop-strength-live-20261104/小木-win32-x64/resources/app.asar','.runtime/desktop-strength-live-20261104-release/小木-win32-x64/resources/app.asar'].map(async p=>createHash('sha256').update(await readFile(p)).digest('hex')));assert.equal(hashes[0],hashes[1]);
 const result={passed:true,at:new Date().toISOString(),checks,errors,writes:[],protectedRulesUnchanged:true,businessChangedTables:changed,nativeBuildsIdentical:true,nativeAsarHash:hashes[0],scope:'独立桌面APP；真实2026-11-04主力报价与分钟线；无微信消息，无账户修改',priorQaCorrection:'验收脚本的月周日按钮选择器重复，已限定观察池区域后实际补验通过。'};await writeFile(join(out,'desktop-verification.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{await browser.close()}
