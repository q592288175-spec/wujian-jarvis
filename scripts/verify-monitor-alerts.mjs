
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {_electron} from 'file:///C:/Users/86199/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {MonitorStore} from '../integrations/monitor-store.mjs';
import {evaluateTrend,validateTrendTask,defaultTrendTask} from '../integrations/trend-monitor-engine.mjs';
import {monitorMessage} from '../integrations/monitor-service.mjs';
import {databaseManifest} from './system-backup.mjs';
const out=resolve('output/monitor-alerts-2026-11-03'),p=JSON.parse(await readFile(join(out,'preview.json'),'utf8')),base=p.base;
assert.ok(p.root.startsWith(resolve('.runtime/test-monitor-alerts-')));
const get=async path=>fetch(base+'/api/trend-monitor/'+path).then(r=>r.json());
const business=databaseManifest('.runtime/five-workbench.sqlite'),bindingHash=createHash('sha256').update(await readFile('.runtime/private/weixin-connection.enc')).digest('hex');
const env={...process.env,WUJIAN_DESKTOP_PORT:String(p.port),WUJIAN_MONITOR_HOME:join(p.root,'monitor'),WUJIAN_DESKTOP_PROFILE:join(p.root,'desktop-alert-verify')};delete env.ELECTRON_RUN_AS_NODE;
let app,page;const checks=[],errors=[];
function signal(row,up,period){
 const now=Date.now(),day=new Date(now+28800000).toISOString().slice(0,10),days=[];let d=new Date(day+'T00:00:00Z');
 while(days.length<390){if(![0,6].includes(d.getUTCDay()))days.push(d.toISOString().slice(0,10));d.setUTCDate(d.getUTCDate()-1)}
 const daily=days.reverse().map((date,i)=>({stamp:date+'T00:00:00+08:00',date,close:up?40+i*.1:160-i*.1,complete:i<389}));
 const small=[up?90:110,...Array(9).fill(up?110:90)].map((close,i)=>({stamp:new Date(now-(10-i)*30*60000).toISOString(),close,complete:true}));small.push({stamp:new Date(now-15000).toISOString(),close:100,complete:false});
 const task={...validateTrendTask({...defaultTrendTask(),smallPeriods:[period]}),id:'isolated-qa',version:1};
 const frame=(price,at,seq)=>({symbol:row.symbol,code:row.code,name:'【验收测试】'+row.name,source:'合成多空行情，仅用于独立桌面验收',bars:{'1d':daily,[period]:small},quote:{last:price,quoteAt:new Date(at).toISOString(),receivedAt:new Date(at).toISOString(),sequence:seq,sessionActive:true,sessionKey:day+':qa',tradingDay:day}});
 const first=evaluateTrend({task,frame:frame(up?89:111,now-2000,1),period,now:now-2000,generation:'qa'}),result=evaluateTrend({task,frame:frame(up?111:89,now-1000,2),period,state:first.state,now:now-1000,generation:'qa'});
 assert.ok(result.event);result.event.evidence.test=true;return result.event;
}
try{
 app=await _electron.launch({executablePath:resolve('.runtime/desktop-monitor-alerts-20261103/小木-win32-x64/小木.exe'),env,timeout:45000});page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));
 await page.waitForSelector('#accountSelect option',{state:'attached',timeout:45000});await page.goto(base+'/market-panorama.html#market/monitor');await page.waitForSelector('[data-tm-watch-products] input',{timeout:30000});await page.setViewportSize({width:1500,height:980});

 async function period(id,checked){await page.locator('[data-tm-period="'+id+'"]').setChecked(checked);await page.waitForFunction(()=>{const el=document.querySelector('[data-tm-period-state]');return el&&!/正在/.test(el.textContent)});await page.waitForTimeout(80);}
 await period('1w',false);assert.deepEqual((await get('status')).tasks[0].bigPeriods,['1d']);checks.push('表头取消周K：后台仅以日K定向');
 await period('1d',false);assert.equal((await get('status')).tasks[0].status,'paused');assert.equal((await get('status')).coverage.subscribed,0);await page.reload();await page.waitForSelector('[data-tm-period]');assert.equal(await page.locator('[data-tm-period="1d"]').isChecked(),false);checks.push('环境全不选自动暂停并保存，重载保持');
 await period('1mo',true);await period('1w',true);await period('1d',true);assert.deepEqual((await get('status')).tasks[0].bigPeriods,['1mo','1w','1d']);checks.push('月周日全选要求三个环境周期同向');
 await period('1mo',false);await period('120m',true);await period('30m',false);assert.deepEqual((await get('status')).tasks[0].smallPeriods,['120m']);await period('120m',false);assert.equal((await get('status')).tasks[0].status,'paused');await period('30m',true);assert.deepEqual((await get('status')).tasks[0].smallPeriods,['30m']);await period('120m',true);assert.deepEqual((await get('status')).tasks[0].smallPeriods,['30m','120m']);checks.push('30分钟与2小时独立勾选；双选分别监控，取消全部暂停');
 await page.locator('[data-tm-selected-only]').uncheck();await page.locator('[data-tm-sector="all"]').click();await page.locator('[data-tm-clear-visible]').click();await page.locator('[data-tm-selection-save]').click();await page.waitForTimeout(600);assert.deepEqual((await get('status')).watchlist.codes,[]);assert.equal((await get('status')).coverage.subscribed,0);checks.push('全不选应用后后台订阅归零');
 await page.reload();await page.waitForSelector('[data-tm-watch-products] input');assert.equal(await page.locator('[data-tm-watch-products] input:checked').count(),0);checks.push('清空选择可持久保存，不回退为全部');
 await page.locator('[data-tm-sector="新能源"]').click();await page.locator('[data-tm-watch-products] input[data-tm-watch-code="SI"]').check();await page.locator('[data-tm-sector="化工"]').click();await page.locator('[data-tm-watch-products] input[data-tm-watch-code="BU"]').check();await page.locator('[data-tm-selection-save]').click();await page.waitForTimeout(700);assert.deepEqual((await get('status')).watchlist.codes.sort(),['BU','SI']);assert.equal((await get('status')).coverage.subscribed,2);checks.push('横向板块点选与SI/BU勾选真正控制监控范围');
 await page.locator('[data-tm-sector="all"]').click();await page.locator('[data-tm-selected-only]').check();assert.equal(await page.locator('[data-tm-row]').count(),2);
 const rows=(await get('status')).rows,events=[signal(rows.find(r=>r.code==='SI'),false,'30m'),signal(rows.find(r=>r.code==='BU'),true,'120m')];
 const store=new MonitorStore(join(p.root,'monitor.sqlite'));for(const old of store.events({limit:300}))store.read(old.id);for(const event of events)store.recordEvent(event);store.close();
 const alarm=app.windows().find(w=>w!==page)||await app.waitForEvent('window',{predicate:w=>w!==page,timeout:15000});await alarm.waitForSelector('#items article');await alarm.waitForFunction(()=>document.querySelector('#items').textContent.includes('2小时 MA10向上')&&document.querySelector('#items').textContent.includes('30分钟 MA10向下'));await alarm.waitForFunction(()=>document.body.dataset.sound==='running');
 const audible=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().some(w=>w.webContents.getURL().includes('trend-alarm.html')&&w.webContents.isCurrentlyAudible()));
 assert.ok(await alarm.locator('#items article').count()>=2);assert.match(await alarm.locator('#items').innerText(),/30分钟 MA10向下拐头/);assert.match(await alarm.locator('#items').innerText(),/2小时 MA10向上拐头/);await alarm.screenshot({path:join(out,'alarm-popup-test.png')});checks.push('合成30分钟下穿/2小时上穿通过真实算法写入独立库，原生警报窗合并显示且声音状态running');
 await page.locator('[data-tm-refresh]').click();await page.waitForSelector('.tm-alert-unread');await page.waitForTimeout(3100);assert.match(await page.locator('[data-tm-row="SI"] .tm-alert').innerText(),/向下拐头，价格下穿MA10/);assert.match(await page.locator('[data-tm-row="BU"] .tm-alert').innerText(),/向上拐头，价格上穿MA10/);await page.screenshot({path:join(out,'monitor-selection-and-alerts.png'),fullPage:true});
 await alarm.locator('#mute').click();assert.equal(await alarm.locator('body').getAttribute('data-sound'),'muted');await alarm.locator('#ack').click();await page.locator('[data-tm-refresh]').click();await page.waitForFunction(()=>!document.querySelector('.tm-alert-unread'));checks.push('静音有效，已收到写入已读状态并停止闪烁，保留历史');
 for(const e of (await get('status')).events.filter(e=>events.some(x=>x.id===e.id))){assert.ok(e.readAt);assert.equal(e.deliveries.find(d=>d.channel==='weixin').status,'pending')}
 assert.match(monitorMessage(events[0]),/30分钟MA10向下拐头且价格下穿MA10/);assert.match(monitorMessage(events[1]),/2小时MA10向上拐头且价格上穿MA10/);checks.push('同一事件生成微信内容和待发送记录；独立验收未绑定手机，不发测试行情到正式微信');
 await page.locator('[data-tm-selected-only]').uncheck();await page.setViewportSize({width:1100,height:800});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:join(out,'monitor-1100.png'),fullPage:true});checks.push('1100像素窗口无页面横向溢出');

 const soundChecks=[];
 for(const id of ['air-raid','urgent','sonar']){
  await page.locator('[name=tmSound][value="'+id+'"]').check();await page.waitForFunction(id=>window.xiaomuMonitor.alarmSettings().then(v=>v.soundId===id),id);await page.locator('[data-tm-sound-preview="'+id+'"]').click();
  await alarm.waitForFunction(id=>document.body.dataset.soundId===id&&document.body.dataset.sound==='running',id);
  const media=await alarm.evaluate(async()=>{const decoded=await new AudioContext().decodeAudioData(await (await fetch(audio.src)).arrayBuffer());return {duration:decoded.duration,samples:decoded.length,peak:Math.max(...decoded.getChannelData(0).slice(0,40000).map(Math.abs)),src:audio.src};});
  assert.ok(media.duration>3);let heard=false;for(let i=0;i<35&&!heard;i++){await alarm.waitForTimeout(100);heard=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().some(w=>w.webContents.getURL().includes('trend-alarm.html')&&w.webContents.isCurrentlyAudible()));}assert.ok(heard,'audio output '+id);soundChecks.push({id,...media,audible:heard});await alarm.locator('#mute').click();await alarm.locator('#ack').click();
 }
 await page.reload();await page.waitForSelector('[name=tmSound][value="sonar"]:checked');checks.push('三种授权音频均解码、试听有音频输出，单选自动持久化');
 assert.equal(JSON.parse(await readFile(join(p.root,'monitor/alarm-settings.json'),'utf8')).soundId,'sonar');await page.screenshot({path:join(out,'period-checkboxes-and-sounds.png'),fullPage:true});
 await writeFile(join(out,'sounds-verification.json'),JSON.stringify(soundChecks,null,2));
 assert.deepEqual(errors,[]);assert.deepEqual(databaseManifest('.runtime/five-workbench.sqlite'),business);assert.equal(createHash('sha256').update(await readFile('.runtime/private/weixin-connection.enc')).digest('hex'),bindingHash);
 const result={passed:true,at:new Date().toISOString(),checks,audioContextRunning:true,electronAudioOutputAudible:audible,businessUnchanged:true,formalWeixinUnchanged:true,errors,limitations:['合成行情验收不等于当日真实交易信号','本轮未更换微信也未向正式手机发送合成行情','扬声器实际音量需用户试听；已核验Electron音频输出状态']};await writeFile(join(out,'verification.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}catch(e){await page?.screenshot({path:join(out,'failure.png'),fullPage:true}).catch(()=>{});await writeFile(join(out,'failure.json'),JSON.stringify({message:e.message,checks,errors},null,2));throw e}
finally{await app?.evaluate(({app})=>app.exit(0)).catch(()=>{});await app?.close().catch(()=>{})}
