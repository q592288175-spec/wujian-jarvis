import assert from'node:assert/strict';import fs from'node:fs';import {resolve,join}from'node:path';import{randomUUID,createHash}from'node:crypto';
import{_electron}from'file:///C:/Users/86199/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import{MonitorStore}from'../integrations/monitor-store.mjs';import{hasLiquidity}from'../dist/liquidity.js';import{databaseManifest}from'./system-backup.mjs';
const info=JSON.parse(fs.readFileSync('output/monitor-alerts-2026-11-03/preview.json','utf8')),base=info.base,out=resolve('output/monitor-alerts-2026-11-03/spoken-alerts');fs.mkdirSync(out,{recursive:true});
const env={...process.env,WUJIAN_DESKTOP_PORT:String(info.port),WUJIAN_DESKTOP_PROFILE:join(info.root,'speech-profile'),WUJIAN_MONITOR_HOME:join(info.root,'monitor')};delete env.ELECTRON_RUN_AS_NODE;
const before=databaseManifest('.runtime/five-workbench.sqlite'),wxHash=createHash('sha256').update(fs.readFileSync('.runtime/private/weixin-connection.enc')).digest('hex');
const checks=[],voices=[];let app,page;
const get=async route=>fetch(base+route).then(r=>r.json());
try{
 app=await _electron.launch({executablePath:resolve('.runtime/desktop-spoken-alerts-20261103/小木-win32-x64/小木.exe'),env,timeout:45000});page=await app.firstWindow();await page.waitForSelector('#accountSelect option',{state:'attached',timeout:45000});await page.goto(base+'/market-panorama.html#market/monitor');await page.waitForSelector('[name=tmSound]');
 assert.equal(await page.locator('[name=tmSound]').count(),2);assert.doesNotMatch(await page.locator('[data-tm-sound-bar]').innerText(),/防空|声呐|电子警报/);checks.push('只保留台湾女声、清爽男声两个选项，旧三种警报不显示');
 let alarm;
 for(const id of ['taiwan-female','clear-male']){
  await page.locator('[name=tmSound][value="'+id+'"]').check();await page.waitForFunction(id=>window.xiaomuMonitor.alarmSettings().then(v=>v.voiceId===id),id);
  await page.locator('[data-tm-sound-preview="'+id+'"]').click();alarm=app.windows().find(w=>w!==page)||await app.waitForEvent('window',{predicate:w=>w!==page});await alarm.waitForFunction(id=>document.body.dataset.voiceId===id&&document.body.dataset.sound==='running',id,{timeout:30000});
  const data=await alarm.evaluate(()=>({voiceId:document.body.dataset.voiceId,text:document.getElementById('spoken').textContent,duration:audio.duration}));assert.match(data.text,/测试提醒。螺纹钢，三十分钟十均线向下拐头，价格下穿十均线/);assert.ok(data.duration>4);
  data.audible=false;for(let i=0;i<35&&!data.audible;i++){await alarm.waitForTimeout(100);data.audible=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().some(w=>w.webContents.getURL().includes('trend-alarm.html')&&w.webContents.isCurrentlyAudible()));}assert.ok(data.audible);voices.push(data);await alarm.screenshot({path:join(out,id+'-popup.png')});await alarm.locator('#mute').click();await alarm.locator('#ack').click();
 }
 checks.push('两种真实火山音色均可试听，文本逐字符合触发条件，有实际音频输出');await page.reload();await page.waitForSelector('[name=tmSound][value="clear-male"]:checked');checks.push('音色选择在重新载入后保留');
 // Replay genuine engine-generated test results through the isolated desktop queue.
 const original=JSON.parse(fs.readFileSync(JSON.parse(fs.readFileSync('output/monitor-alerts-2026-11-03/live-demo-latest.json','utf8')).out+'/test-inputs-and-events.json','utf8')).events;
 const events=original.map(e=>({...e,id:randomUUID(),triggeredAt:new Date().toISOString(),quoteAt:new Date().toISOString(),channels:['desktop'],source:'隔离语音验收，原算法结果回放，不推送微信'}));const store=new MonitorStore(join(info.root,'monitor.sqlite'));for(const e of events)store.recordEvent(e);store.close();
 await alarm.waitForFunction(()=>document.body.dataset.sound==='running'&&document.getElementById('spoken').textContent.includes('上证50股指'),{timeout:30000});await alarm.waitForFunction(()=>document.body.dataset.sound==='running'&&document.getElementById('spoken').textContent.includes('沪深300股指'),{timeout:30000});assert.match(await alarm.locator('#spoken').innerText(),/两小时十均线向上拐头，价格上穿十均线/);checks.push('30分钟向下与2小时向上测试自动逐条播报，没有抢话或自由改写');await alarm.locator('#ack').click();
 const failed=await get('/api/market-panorama/snapshot');assert.ok(failed.products.every(hasLiquidity));assert.ok(failed.closeOverview.products.every(hasLiquidity));assert.ok(!('monitorDiscovery' in failed));
 const fire=await get('/api/workbench/fire');assert.ok(fire.rows.every(hasLiquidity));const live=await get('/api/live-market');assert.ok(live.quotes.every(hasLiquidity));checks.push('市场快照、收盘热力、火选品及行情全部满足严格双1万手；内部补数目录不对外显示');
 const count=(await get('/api/trend-monitor/status')).rows.length;assert.equal(await page.locator('[data-tm-row]').count(),count);checks.push('监控页面只显示达标品种，UI与后台目录数量一致');
 for(const route of ['home','overview','strength','rankings','funds','positions','fees','variety','seat-flow']){await page.goto(base+'/market-panorama.html#market/'+route);await page.waitForTimeout(180);}
 await page.goto(base+'/market-panorama.html#market/monitor');await page.waitForSelector('[name=tmSound]');await page.screenshot({path:join(out,'monitor-new-voices.png'),fullPage:true});
 assert.deepEqual(databaseManifest('.runtime/five-workbench.sqlite'),before);assert.equal(createHash('sha256').update(fs.readFileSync('.runtime/private/weixin-connection.enc')).digest('hex'),wxHash);
 const result={passed:true,at:new Date().toISOString(),checks,voices,filteredPanorama:failed.products.length,filteredFire:fire.rows.length,filteredMonitor:count,businessUnchanged:true,weixinUnchanged:true};fs.writeFileSync(join(out,'desktop-verification.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}catch(e){await page?.screenshot({path:join(out,'failure.png')}).catch(()=>{});fs.writeFileSync(join(out,'failure.json'),JSON.stringify({error:e.message,checks,voices},null,2));throw e}finally{await app?.evaluate(({app})=>app.exit(0)).catch(()=>{});await app?.close().catch(()=>{})}
