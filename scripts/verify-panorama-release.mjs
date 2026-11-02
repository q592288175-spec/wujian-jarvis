import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {databaseManifest} from './system-backup.mjs';

const root=resolve('.'),out=resolve('output/market-panorama'),base='http://127.0.0.1:4318';
await mkdir(out,{recursive:true});
const backup=JSON.parse(await readFile('.runtime/checkpoints/market-panorama-before-20261023/manifest.json','utf8'));
const baseline=JSON.parse(await readFile('output/market-panorama/fix-before-20261023-1505/business-manifest.json','utf8'));
assert.deepEqual(databaseManifest('.runtime/five-workbench.sqlite'),baseline);
const rulePaths=['data/contract-specs.json','.runtime/contract-specs/current.json','scripts/fire_scan.py','integrations/day-trend.mjs','dist/gold-methods.js'];
const rules=[];
for(const path of rulePaths){const entry=backup.files.find(f=>f.path==='project/'+path);assert.ok(entry,path+' 原始备份缺失');const hash=createHash('sha256').update(await readFile(path)).digest('hex');assert.equal(hash,entry.sha256,path+' 规则文件不应改变');rules.push({path,unchanged:true,sha256:hash})}
const health=await fetch(base+'/api/health').then(r=>r.json());assert.equal(health.projectRoot,root);
const {chromium}=await import(pathToFileURL('C:/Users/86199/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'));
const browser=await chromium.launch({headless:true,executablePath:'E:/AppCache/Playwright/chromium-1228/chrome-win64/chrome.exe'});
const errors=[];let result;
try{
 const page=await browser.newPage({viewport:{width:1500,height:980}});page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/market-panorama.html');await page.waitForFunction(()=>document.querySelector('#content').getAttribute('aria-busy')==='false');
 assert.equal(await page.locator('#navigation a').count(),9);
 const before=await fetch(base+'/api/market-panorama/status').then(r=>r.json());
 for(let i=0;i<70;i++){await page.waitForTimeout(1000);const s=await fetch(base+'/api/market-panorama/status').then(r=>r.json());if(s.revision>before.revision)break;if(i===69)throw Error('正式服务未收到自动刷新事件')}
 const after=await fetch(base+'/api/market-panorama/status').then(r=>r.json());
 await page.screenshot({path:resolve(out,'production-overview.png'),fullPage:true});
 await page.locator('[data-nav="fees"]').click();await page.locator('#mainOnly').uncheck();await page.locator('[data-fee-type="mixed"]').click();assert.ok(await page.locator('#content tbody tr').count()>100);
 await page.goto(base+'/?view=fire');await page.waitForSelector('a[href*="market-panorama"]');
 await page.goto(base+'/cockpit.html');await page.waitForSelector('a[href*="market-panorama"]');assert.equal(await page.locator('.version-switch a[href*="market-panorama"]').count(),0);
 const snap=await fetch(base+'/api/market-panorama/snapshot').then(r=>r.json());
 assert.ok(snap.products.length>=87);assert.ok(snap.counts.priced>70);assert.equal(snap.products.flatMap(p=>p.fees).filter(f=>f.price===0).length,0);
 assert.deepEqual(errors,[]);assert.ok(isDeepStrictEqual(databaseManifest('.runtime/five-workbench.sqlite'),baseline));
 result={passed:true,at:new Date().toISOString(),project:root,counts:snap.counts,dailyDate:snap.dates[0],seatDate:snap.seatDate,coverage:snap.coverage,automaticRefresh:{revisionBefore:before.revision,revisionAfter:after.revision,observed:true},businessUnchanged:true,rules,errors};
 await writeFile(resolve(out,'release-verification.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser.close()}
