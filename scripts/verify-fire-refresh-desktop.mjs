import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
const project=resolve('.'),output=resolve('output/playwright/fire-refresh-2026-10-12');
await mkdir(output,{recursive:true});
const {_electron}=await import(pathToFileURL('C:/Users/86199/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href);
const env={...process.env,WUJIAN_DESKTOP_PORT:'4321',WUJIAN_DESKTOP_PROFILE:'.runtime/refresh-acceptance-profile'};delete env.ELECTRON_RUN_AS_NODE;
const app=await _electron.launch({executablePath:resolve('.runtime/desktop-refresh-build/小木-win32-x64/小木.exe'),env,timeout:45000});
const base='http://127.0.0.1:4321',api=path=>fetch(base+path).then(r=>r.json()),errors=[],stages=[];
const pause=ms=>new Promise(r=>setTimeout(r,ms));let final;
try{
 const page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));await page.waitForSelector('#accountSelect option',{state:'attached',timeout:60000});
 const before=await api('/api/workbench/accounts');
 await page.locator('#mainNav [data-view=fire]').click();await page.waitForSelector('#refreshFire');
 await page.locator('#refreshFire').click();assert.equal(await page.locator('#refreshFire').isDisabled(),true);
 for(let i=0;i<600;i++){
  final=await api('/api/workbench/fire');const stage=final.refresh?.stage;
  if(stage!==stages.at(-1)){stages.push(stage);console.log(JSON.stringify({stage,at:new Date().toISOString(),dataDate:final.data_date}));}
  if(!final.refreshing&&['completed','failed'].includes(final.refresh?.status))break;
  await pause(2000);
 }
 assert.equal(final.refresh.status,'completed',JSON.stringify(final.refresh));
 assert.equal(final.rows.length,87);assert.equal(final.universe_size,87);
 assert.ok(final.refreshedAt>final.refresh.startedAt);
 assert.deepEqual(await api('/api/workbench/accounts'),before);
 for(const mode of ['month-week-day','month-week','week-day']){
  for(const row of final.rows.filter(r=>['多头观察','空头观察'].includes(r.modes?.[mode]))){assert.ok(row.volume>10000&&row.open_interest>10000);assert.equal(row.data_date,final.target_date);}
 }
 await page.waitForFunction(()=>document.querySelector('#fireRefreshStatus')?.textContent.includes('刷新完成'),{},{timeout:20000});
 const text=await page.locator('#content .section-head').first().innerText();assert.ok(text.includes('最后刷新'));assert.ok(!text.includes(' · 目标 '));
 for(const width of [1500,1100]){
  await page.setViewportSize({width,height:950});await pause(150);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:join(output,'fire-'+width+'.png')});
 }
 const state=JSON.parse(await readFile('.runtime/fire-refresh.json','utf8'));assert.equal(state.finishedAt,final.refresh.finishedAt);
 assert.deepEqual(errors,[]);
 await writeFile(join(output,'result.json'),JSON.stringify({passed:true,stages,refresh:final.refresh,scanDate:final.data_date,counts:final.counts,current:final.current_count,noTrade:final.no_trade_count,provisional:final.provisional_count,missing:final.rows.filter(r=>!r.market_current&&!r.no_trade).map(r=>({code:r.code,name:r.name,contract:r.main_contract,date:r.data_date,error:r.error})),accountBalancesUnchanged:true,errors},null,2));
 console.log(JSON.stringify({passed:true,refresh:final.refresh,counts:final.counts}));
}catch(error){await writeFile(join(output,'failure.json'),JSON.stringify({error:error.message,stages,refresh:final?.refresh,errors},null,2));throw error}
finally{await app.close()}
