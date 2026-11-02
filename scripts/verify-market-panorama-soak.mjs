import assert from 'node:assert/strict';
import {writeFile,mkdir,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {databaseManifest} from './system-backup.mjs';

const root=resolve('.'),out=resolve('output/market-panorama/soak'),base='http://127.0.0.1:4318';
await mkdir(out,{recursive:true});
const baseline=JSON.parse(await readFile('output/market-panorama/fix-before-20261023-1505/business-manifest.json','utf8'));
const health=await fetch(base+'/api/health').then(r=>r.json());assert.equal(health.projectRoot,root);
const {chromium}=await import(pathToFileURL('C:/Users/86199/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'));
const browser=await chromium.launch({headless:true,executablePath:'E:/AppCache/Playwright/chromium-1228/chrome-win64/chrome.exe'});
const errors=[],samples=[];let snapshots=0,streams=0,passed=false;
try{
 const page=await browser.newPage({viewport:{width:1440,height:950}});page.on('pageerror',e=>errors.push(e.message));
 page.on('response',r=>{if(r.ok()&&r.url().includes('/api/market-panorama/snapshot'))snapshots++});
 page.on('request',r=>{if(r.url().endsWith('/api/market-panorama/events'))streams++});
 await page.goto(base+'/market-panorama.html#strength');await page.waitForSelector('#strengthChart canvas');await page.waitForTimeout(1500);
 const canvas=await page.locator('#strengthChart canvas').first().elementHandle(),cdp=await page.context().newCDPSession(page);
 await cdp.send('HeapProfiler.collectGarbage');const firstHeap=(await cdp.send('Runtime.getHeapUsage')).usedSize;
 const first=await fetch(base+'/api/market-panorama/status').then(r=>r.json()),start=Date.now();
 await page.screenshot({path:resolve(out,'start.png')});
 for(let i=1;i<=60;i++){
  await new Promise(r=>setTimeout(r,30000));
  assert.ok(await canvas.evaluate(c=>c.isConnected&&c===document.querySelector('#strengthChart canvas')),'自动更新不应重建当前画布');
  assert.equal(await page.locator('canvas').count(),1);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  if(i%10===0){await cdp.send('HeapProfiler.collectGarbage');const heap=(await cdp.send('Runtime.getHeapUsage')).usedSize;const status=await fetch(base+'/api/market-panorama/status').then(r=>r.json());samples.push({elapsedMs:Date.now()-start,heap,snapshots,streams,revision:status.revision});await writeFile(resolve(out,'progress.json'),JSON.stringify({status:'running',samples},null,2));console.log(JSON.stringify(samples.at(-1)))}
 }
 const elapsed=Date.now()-start,last=await fetch(base+'/api/market-panorama/status').then(r=>r.json());
 assert.ok(elapsed>=1800000);assert.ok(snapshots>=50,'真实30分钟内应有持续读取');assert.ok(last.revision>first.revision,'应实际收到正式服务更新');assert.ok(streams<=3,'不应重复建立大量订阅');
 assert.ok(samples.at(-1).heap-firstHeap<30*1024*1024,'回收后常驻堆不应持续大幅增长');assert.deepEqual(errors,[]);
 assert.ok(isDeepStrictEqual(databaseManifest('.runtime/five-workbench.sqlite'),baseline),'与本轮业务基线不一致，需核对外部操作');
 await page.screenshot({path:resolve(out,'end.png')});
 const result={passed:true,startedAt:new Date(start).toISOString(),endedAt:new Date().toISOString(),wallClockSoak:true,elapsedMs:elapsed,firstHeap,samples,snapshots,streams,revisionBefore:first.revision,revisionAfter:last.revision,businessUnchanged:true,errors};
 await writeFile(resolve(out,'verification.json'),JSON.stringify(result,null,2));await writeFile(resolve(out,'progress.json'),JSON.stringify({status:'completed',...result},null,2));passed=true;console.log(JSON.stringify({passed:true,elapsedMs:elapsed,snapshots,streams,heapGrowth:samples.at(-1).heap-firstHeap}));
}catch(error){await writeFile(resolve(out,'failure.json'),JSON.stringify({passed:false,error:error.message,samples,errors},null,2));throw error}
finally{await browser.close();if(!passed)console.error('长时间验证未通过，请查看失败记录。')}
