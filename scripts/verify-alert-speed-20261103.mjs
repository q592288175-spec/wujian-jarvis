import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {_electron} from 'file:///C:/Users/86199/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {MonitorStore} from '../integrations/monitor-store.mjs';
const out=resolve('output/alert-double-speed-2026-11-03'),p=JSON.parse(readFileSync(out+'/preview.json','utf8')),env={...process.env,WUJIAN_DESKTOP_PORT:String(p.port),WUJIAN_DESKTOP_PROFILE:join(p.root,'speed-profile'),WUJIAN_MONITOR_HOME:join(p.root,'monitor')};delete env.ELECTRON_RUN_AS_NODE;
let app,page;const checks=[];
try{
 app=await _electron.launch({executablePath:resolve('.runtime/desktop-alert-double-speed-20261103/小木-win32-x64/小木.exe'),env,timeout:45000});page=await app.firstWindow();await page.waitForSelector('#accountSelect option',{state:'attached',timeout:45000});await page.goto(p.base+'/market-panorama.html#market/monitor');await page.waitForSelector('[data-tm-sound-preview]');let alarm;
 for(const voice of ['taiwan-female','clear-male']){
  await page.locator(`[data-tm-sound-preview="${voice}"]`).click();alarm=app.windows().find(w=>w!==page)||await app.waitForEvent('window');await alarm.waitForFunction(id=>document.body.dataset.voiceId===id&&document.body.dataset.sound==='running',voice,{timeout:35000});
  await alarm.waitForFunction(()=>audio?.currentTime>.2&&document.body.dataset.sound==='running');const first=await alarm.evaluate(()=>({rate:audio.playbackRate,pitch:audio.preservesPitch,text:document.querySelector('#spoken').textContent,duration:audio.duration}));assert.equal(first.rate,2);assert.equal(first.pitch,true);assert.match(first.text,/测试提醒/);
  const clock=await alarm.evaluate(async()=>{const player=audio,start=player.currentTime,at=performance.now();await new Promise(r=>setTimeout(r,800));return{advanced:player.currentTime-start,wallSeconds:(performance.now()-at)/1000}});const ratio=clock.advanced/clock.wallSeconds;assert.ok(ratio>1.6&&ratio<2.4,'音频时钟应约以2倍速度推进：'+JSON.stringify(clock));checks.push({voice,playbackRate:first.rate,preservesPitch:first.pitch,sourceDuration:first.duration,clock,measuredSpeed:ratio,preview:true});await alarm.locator('#mute').click();await alarm.locator('#ack').click();
 }
 const store=new MonitorStore(join(p.root,'monitor.sqlite'));store.recordEvent({id:randomUUID(),kind:'ma-turn',name:'螺纹钢',symbol:'SHFE.RB2701',period:'120m',direction:'up',label:'【测试】两倍速自动播报',condition:'【测试】周日同向，两小时向上拐头，价格上穿MA10',triggeredAt:new Date().toISOString(),quoteAt:new Date().toISOString(),channels:['desktop'],evidence:{test:true},source:'独立验收库测试，不是交易信号'});store.close();
 await alarm.waitForFunction(()=>document.body.dataset.sound==='running'&&document.querySelector('#spoken').textContent.includes('两小时'),null,{timeout:35000});const automatic=await alarm.evaluate(()=>({rate:audio.playbackRate,pitch:audio.preservesPitch,text:document.querySelector('#spoken').textContent}));assert.equal(automatic.rate,2);assert.equal(automatic.pitch,true);assert.match(automatic.text,/测试提醒/);checks.push({automatic});await alarm.screenshot({path:join(out,'double-speed-popup.png')});await alarm.locator('#mute').click();await alarm.locator('#ack').click();
 const result={passed:true,at:new Date().toISOString(),checks,phoneSent:false,scope:'独立桌面与监控副本；试听、自动警报使用同一两倍速播放器'};writeFileSync(join(out,'desktop-verification.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}catch(e){writeFileSync(join(out,'failure.json'),JSON.stringify({error:e.message,checks},null,2));throw e}
finally{await app?.evaluate(({app})=>app.exit(0)).catch(()=>{});await app?.close().catch(()=>{})}
