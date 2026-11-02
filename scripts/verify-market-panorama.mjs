import assert from 'node:assert/strict';
import {mkdir,writeFile,copyFile,readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {DatabaseSync,backup} from 'node:sqlite';
import {spawn} from 'node:child_process';
import net from 'node:net';
import {planFixture} from '../tests/helpers/plan-fixture.mjs';
import {latestFire} from '../integrations/five-workbench.mjs';
import {databaseManifest} from './system-backup.mjs';

const project=resolve('.'),out=resolve(process.env.WUJIAN_PANORAMA_VERIFY_OUT||'output/market-panorama/acceptance');await mkdir(out,{recursive:true});
const before=databaseManifest(resolve('.runtime/five-workbench.sqlite'));
const root=planFixture(project);const from=new DatabaseSync('.runtime/five-workbench.sqlite',{readOnly:true});await backup(from,join(root,'business.sqlite'));from.close();
await writeFile(join(root,'.runtime/fire-scan/.wujian-futures-multi-cycle-scan/test.json'),JSON.stringify(await latestFire()));
await copyFile('.runtime/market.json',join(root,'.runtime/market.json'));
const cache=join(root,'panorama');await mkdir(cache);const source=new DatabaseSync('.runtime/market-panorama/market.sqlite',{readOnly:true});await backup(source,join(cache,'market.sqlite'));source.close();
const listener=net.createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));const port=listener.address().port;await new Promise(r=>listener.close(r));
const env={...process.env,PORT:String(port),WUJIAN_WORKBENCH_DB:join(root,'business.sqlite'),WUJIAN_BUNDLE_ROOT:resolve('../资料包'),WUJIAN_OPERATION_DIR:join(root,'操作记录'),WUJIAN_MONITOR_DB:join(root,'monitor.sqlite'),WUJIAN_MONITOR_HOME:join(root,'monitor'),WUJIAN_PANORAMA_DIR:cache,WUJIAN_SKIP_EOD_SCHEDULE:'1',WUJIAN_PANORAMA_AUTOSYNC:'0',WUJIAN_DESKTOP_PORT:String(port),WUJIAN_DESKTOP_PROFILE:join(root,'profile')};
for(const k of Object.keys(env))if(/TQ_|FEISHU_|DEEPSEEK_|OPENAI_|VOLC_|ARK_|JIN10/.test(k)||k==='ELECTRON_RUN_AS_NODE')delete env[k];
const base='http://127.0.0.1:'+port;
const {chromium,_electron}=await import(pathToFileURL('C:/Users/86199/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'));
let service,browser,app;const errors=[],checks=[];let log='';
try{
 service=spawn(process.execPath,[join(project,'server.mjs')],{cwd:root,env,windowsHide:true,stdio:['ignore','pipe','pipe']});service.stderr.on('data',s=>log+=s);service.stdout.on('data',s=>log+=s);
 for(let i=0;i<100;i++){try{const h=await fetch(base+'/api/health').then(r=>r.json());assert.equal(h.projectRoot,project);break}catch(e){if(i===99)throw Error(log||e.message);await new Promise(r=>setTimeout(r,100))}}
 browser=await chromium.launch({headless:true,executablePath:'E:/AppCache/Playwright/chromium-1228/chrome-win64/chrome.exe'});
 const page=await browser.newPage({viewport:{width:1440,height:950},acceptDownloads:true});page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/market-panorama.html');await page.waitForFunction(()=>document.querySelector('#content').getAttribute('aria-busy')==='false');
 assert.equal(await page.locator('#navigation a').count(),9);assert.ok(await page.locator('#content tbody tr').count()>5);
 const pages=['home','overview','strength','rankings','funds','positions','fees','variety','seat-flow'];
 for(const view of pages){
  await page.locator(`[data-nav="${view}"]`).click();await page.waitForTimeout(['funds','positions','variety','strength'].includes(view)?1600:250);
  assert.equal(await page.locator('#navigation .active').getAttribute('data-nav'),view);
  assert.equal(await page.locator('#content .empty').filter({hasText:'正在读取品种'}).count(),0);
  const layout=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,text:document.querySelector('#content').innerText.slice(0,250),charts:[...document.querySelectorAll('#content canvas')].map(c=>{const ctx=c.getContext('2d');if(!ctx)return{pixels:0};const im=ctx.getImageData(0,0,c.width,c.height);let pixels=0;for(let i=3;i<im.data.length;i+=40)if(im.data[i]>0)pixels++;return{width:c.width,height:c.height,pixels}})}));
  assert.equal(layout.overflow,false,view+' 页面溢出');for(const c of layout.charts)assert.ok(c.pixels>30,view+' 图表为空');
  checks.push({page:view,...layout});await page.screenshot({path:join(out,view+'-1440.png'),fullPage:true});
 }
 const snapshot=await fetch(base+'/api/market-panorama/snapshot').then(r=>r.json()),fire=await fetch(base+'/api/workbench/fire').then(r=>r.json());
 for(const p of snapshot.products){const r=fire.rows.find(r=>r.code===p.code);if(r?.data_date<=snapshot.selectedDate)assert.equal(p.fireModes['day-trend'],r.modes['day-trend'],p.code+' 日K资格应与火页面一致')}
 await page.locator('[data-nav="funds"]').click();await page.waitForSelector('[data-member]');await page.locator('[data-pick="FU"]').click();await page.waitForSelector('[data-member]');
 const fuel=await fetch(base+'/api/market-panorama/variety?product=FU').then(r=>r.json()),member=fuel.pairs.find(p=>p.amount!==null)?.member;assert.ok(member);
 await page.locator('[data-fund-view="commodity"]').click();await page.locator('[data-member]').filter({hasText:member}).click();
 const expected=fuel.seatHistory.map(h=>{const vals=h.pairs.filter(p=>p.member===member&&p.amount!==null).map(p=>p.amount);return vals.length?vals.reduce((a,b)=>a+b,0)/1e8:null});
 const actual=await page.evaluate(()=>{const o=echarts.getInstanceByDom(document.querySelector('#fundChart')).getOption();return{unit:o.yAxis[0].name,data:o.series[0].data}});assert.equal(actual.unit,'亿元');assert.deepEqual(actual.data,expected,'按商品合计也必须跟随选中席位');
 await page.goto(base+'/market-panorama.html#strength');await page.waitForSelector('#strengthChart canvas');
 await page.route('**/api/market-panorama/variety?**',async route=>{if(new URL(route.request().url()).searchParams.get('product')==='CU')await new Promise(r=>setTimeout(r,650));await route.continue()});
 await page.locator('[data-compare="CU"]').click();await page.locator('[data-compare="CU"]').click();await page.locator('[data-compare="AL"]').click();await page.locator('#chartPeriod').selectOption('30m');await page.waitForTimeout(1200);
 const names=await page.evaluate(()=>echarts.getInstanceByDom(document.querySelector('#strengthChart')).getOption().series.map(s=>s.name));assert.ok(names.includes(snapshot.products.find(p=>p.code==='AL').name));assert.ok(!names.includes(snapshot.products.find(p=>p.code==='CU').name),'慢请求不能覆盖新选择');await page.unroute('**/api/market-panorama/variety?**');
 const today=snapshot.selectedDate;await page.route('**/api/market-panorama/snapshot?**',route=>new URL(route.request().url()).searchParams.get('date')==='2026-10-21'?route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'模拟来源中断'})}):route.continue());
 await page.locator('#date').fill('2026-10-21');await page.locator('#date').dispatchEvent('change');await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('读取失败'));assert.equal(await page.locator('#date').inputValue(),today);assert.ok((await page.locator('#status').innerText()).includes('仍显示 '+today));await page.unroute('**/api/market-panorama/snapshot?**');
 await page.locator('#autoToggle').click();await page.locator('#autoToggle').click();await page.waitForFunction(()=>!document.querySelector('.statusbar').classList.contains('error'));
 const retained=await page.locator('#content tbody tr').count();await page.context().setOffline(true);await page.locator('#autoToggle').click();await page.locator('#autoToggle').click();await page.waitForFunction(()=>document.querySelector('.statusbar').classList.contains('error'));assert.equal(await page.locator('#content tbody tr').count(),retained,'断线时保留已有数据');await page.context().setOffline(false);await page.locator('#autoToggle').click();await page.locator('#autoToggle').click();await page.waitForFunction(()=>!document.querySelector('.statusbar').classList.contains('error'));await page.waitForFunction(()=>document.querySelector('#connection').textContent.includes('已连接'));
 checks.push({polish:{dayTrend:true,memberAggregate:true,slowResponseRace:true,dateFailureRollback:true,offlineRecovery:true,chartUnits:true}});
 await page.locator('[data-nav="overview"]').click();await page.locator('[data-resonance="全多"]').click();assert.ok(await page.locator('#content').innerText());
 await page.locator('#search').fill('FU');await page.waitForTimeout(300);
 assert.equal(await page.locator('#mainTable tbody tr:has([data-product="FU"])').count(),snapshot.products.find(p=>p.code==='FU').resonance==='全多'?1:0,'搜索与方向组合条件应同时生效');
 await page.locator('[data-resonance="all"]').click();assert.equal(await page.locator('#mainTable tbody tr:has([data-product="FU"])').count(),1);await page.locator('#resetFilters').click();
 await page.locator('[data-nav="rankings"]').click();await page.locator('[data-rank="commodity"]').click();assert.ok(await page.locator('#content tbody tr').count()>20);assert.ok((await page.locator('#content').innerText()).includes('名义规模'));
 await page.locator('[data-nav="fees"]').click();await page.locator('#mainOnly').uncheck();assert.ok(await page.locator('#content tbody tr').count()>100);await page.locator('#closeType').selectOption('previous');
 await page.locator('[data-fee-type="mixed"]').click();assert.ok(await page.locator('#content tbody tr').count()>100);await page.locator('[data-fee-type="all"]').click();
 await page.locator('#exportButton').click();await page.waitForSelector('#toast.show');assert.ok((await page.locator('#toast').innerText()).includes('导出'));
 await page.locator('[data-nav="variety"]').click();await page.waitForTimeout(800);const beforeWatch=await page.locator('[data-watch]').first().innerText();await page.locator('[data-watch]').first().click();await page.waitForTimeout(300);assert.notEqual(await page.locator('[data-watch]').first().innerText(),beforeWatch);
 await page.locator('[data-nav="strength"]').click();await page.waitForTimeout(900);const canvas=await page.locator('#strengthChart canvas').first().elementHandle();await page.locator('[data-compare]').nth(4).click();await page.waitForTimeout(400);assert.ok(await canvas.evaluate(c=>c.isConnected),'更新不应重建图表画布');
 await page.locator('[data-replay]').click();await page.waitForTimeout(900);await page.locator('[data-live]').click();
 await page.locator('[data-image="strengthChart"]').click();await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('图表已导出'),null,{timeout:8000}).catch(async()=>{throw Error('图表导出：'+await page.locator('#toast').innerText())});
 await page.locator('#sourcesButton').click();assert.ok((await page.locator('#sourceBody').innerText()).includes('公开'));await page.locator('#sourcesDialog [data-close]').click();
 await page.locator('#autoToggle').click();assert.equal(await page.locator('#autoToggle').getAttribute('aria-pressed'),'false');
 for(const [width,height] of [[1920,1080],[1366,768],[390,844]]){await page.setViewportSize({width,height});for(const view of ['overview','fees','seat-flow']){await page.locator(`[data-nav="${view}"]`).click();await page.waitForTimeout(200);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,view+' 窄屏溢出');await page.screenshot({path:join(out,view+'-'+width+'.png'),fullPage:true})}}
 await page.setViewportSize({width:1440,height:950});
 await page.goto(base+'/?view=water&product=FU');await page.waitForSelector('[data-universe-refresh="FU"]');
 assert.ok(await page.locator('[data-universe-refresh="FU"]').isVisible());
 await page.goto(base+'/cockpit.html');await page.waitForSelector('a[href*="market-panorama"]');
 await page.goto(base+'/market-panorama.html#strength');await page.waitForSelector('#strengthChart canvas');await page.waitForTimeout(700);
 const cdp=await page.context().newCDPSession(page);await cdp.send('HeapProfiler.collectGarbage');
 const heapBefore=await cdp.send('Runtime.getHeapUsage');const canvases=await page.locator('canvas').count();
 await page.clock.install({time:new Date()});
 for(let i=0;i<60;i++){await page.clock.fastForward(30000);await page.waitForTimeout(120)}
 await page.clock.pauseAt(new Date(Date.now()+1800001));await cdp.send('HeapProfiler.collectGarbage');const heapAfter=await cdp.send('Runtime.getHeapUsage');
 assert.equal(await page.locator('canvas').count(),canvases,'定时刷新不应增加画布');assert.ok(heapAfter.usedSize-heapBefore.usedSize<30*1024*1024,'重复刷新不应显著增加常驻堆');
 checks.push({acceleratedTimerMinutes:30,wallClockSoak:false,heapBefore:heapBefore.usedSize,heapAfter:heapAfter.usedSize,canvases});
 if(process.argv.includes('--desktop')){
  app=await _electron.launch({executablePath:resolve('.runtime/desktop-market-panorama/小木-win32-x64/小木.exe'),env,timeout:45000});const native=await app.firstWindow();await native.waitForSelector('#accountSelect option',{state:'attached',timeout:45000});await native.goto(base+'/market-panorama.html');await native.waitForFunction(()=>document.querySelector('#content').getAttribute('aria-busy')==='false');
  await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];if(w.isMinimized())w.restore();w.show();w.focus()});await native.waitForSelector('#content tbody tr');await native.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await native.waitForTimeout(600);
  const capture=await app.evaluate(async({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];if(w.isMinimized())w.restore();w.show();const image=await w.webContents.capturePage();return {data:image.toPNG().toString('base64'),size:image.getSize()}});
  assert.ok(capture.size.width>1000&&capture.data.length>10000);await writeFile(join(out,'desktop-native.png'),Buffer.from(capture.data,'base64'));checks.push({nativeDesktop:true,screenshot:'Electron capturePage',size:capture.size});await app.close();app=null;
 }
 assert.deepEqual(databaseManifest(resolve('.runtime/five-workbench.sqlite')),before,'正式业务数据库不应发生变化');assert.deepEqual(errors,[]);
 const result={passed:true,at:new Date().toISOString(),checks,errors,businessUnchanged:true,source:'真实缓存的一致性副本',testRoot:root};await writeFile(join(out,'verification.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({passed:true,pages:pages.length,viewports:4,businessUnchanged:true,nativeDesktop:process.argv.includes('--desktop'),out}));
}finally{await app?.close().catch(()=>{});await browser?.close();service?.kill();await writeFile(join(out,'server.log'),log)}
