import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {_electron} from 'file:///C:/Users/86199/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {databaseManifest} from './system-backup.mjs';
const out=resolve('output/quick-audit-2026-10-30');await mkdir(out,{recursive:true});
const preview=JSON.parse(await readFile('output/market-overview-2026-10-30/preview.json','utf8'));
const before=databaseManifest('.runtime/five-workbench.sqlite');
const protectedFiles=['integrations/gold-planning.mjs','integrations/team-governance.mjs','integrations/approval-boundary.mjs','scripts/fire_scan.py','dist/gold-methods.js','dist/sectors.js','dist/display-sectors.js'];
const hashes=Object.fromEntries(await Promise.all(protectedFiles.map(async p=>[p,createHash('sha256').update(await readFile(p)).digest('hex')])));
const env={...process.env,WUJIAN_DESKTOP_PORT:String(preview.port),WUJIAN_DESKTOP_PROFILE:join(preview.root,'quick-audit-profile')};delete env.ELECTRON_RUN_AS_NODE;
let app,page;const errors=[],checks=[];
try{
 app=await _electron.launch({executablePath:resolve('.runtime/desktop-quick-audit-20261030/小木-win32-x64/小木.exe'),env,timeout:45000});
 page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));await page.waitForSelector('#accountSelect option',{state:'attached',timeout:45000});
 await page.goto(preview.base+'/market-panorama.html#market/home');await page.waitForSelector('#homeHeatmap canvas',{timeout:45000});
 if(!(await page.locator('#autoToggle').innerText()).includes('已暂停'))await page.locator('#autoToggle').click();
 await page.setViewportSize({width:1920,height:1080});
 const nav=async(id,selector)=>{const t=performance.now();await page.locator(`[data-nav="${id}"]`).click();await page.waitForSelector(selector,{timeout:20000});return Math.round(performance.now()-t)};
 for(const [id,selector] of [['overview','.cycle-stat'],['strength','#comparisonStatus'],['rankings','#rankingTable'],['funds','#fundChart'],['positions','#positionChart'],['fees','#feeTable'],['variety','#priceChart'],['seat-flow','#seatFlowTable']])checks.push({page:id,ms:await nav(id,selector)});
 // Exercise the formerly slow path, leaving comparison work for a foreground detail.
 for(let i=0;i<3;i++){await nav('strength','#comparisonStatus');await page.waitForTimeout(150);checks.push({rapidSwitch:i+1,ms:await nav('funds','#fundChart')});assert.doesNotMatch(await page.locator('#marketContent').innerText(),/数据读取超时/)}
 const pick=page.locator('[data-pick="FU"]');if(await pick.count()){await pick.click();await page.waitForFunction(()=>document.querySelector('.funds-page')?.textContent.includes('燃料油'));checks.push({productPick:'FU',passed:true})}
 await page.waitForTimeout(350);await page.locator('#marketContent').screenshot({path:join(out,'funds.png')});
 await nav('positions','#positionChart');await page.locator('[data-position-tab="delta"]').click();await page.waitForSelector('#positionChart canvas');checks.push({positionDeltaClick:true});
 await page.locator('#marketContent').screenshot({path:join(out,'positions.png')});
 await nav('home','#homeHeatmap canvas');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.locator('.home-overview').screenshot({path:join(out,'home.png')});
 assert.deepEqual(errors,[]);assert.deepEqual(databaseManifest('.runtime/five-workbench.sqlite'),before);
 for(const [p,h] of Object.entries(hashes))assert.equal(createHash('sha256').update(await readFile(p)).digest('hex'),h,p);
 const result={passed:true,at:new Date().toISOString(),checks,errors,businessUnchanged:true,protectedFilesUnchanged:true,scope:'独立桌面进程与真实数据副本，正式账户无写入'};
 await writeFile(join(out,'click-verification.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}catch(e){await page?.screenshot({path:join(out,'failed.png')}).catch(()=>{});await writeFile(join(out,'click-verification-failed.json'),JSON.stringify({error:e.message,checks,errors},null,2));throw e}
finally{await app?.close().catch(()=>{})}