import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const pages=await fetch('http://127.0.0.1:9229/json/list').then(response=>response.json());
const page=pages.find(item=>item.type==='page'&&item.url.startsWith('http://127.0.0.1:4318/'));
if(!page)throw Error('未找到小木 Electron 页面，请使用 --remote-debugging-port=9229 启动');

const socket=new WebSocket(page.webSocketDebuggerUrl),pending=new Map();let id=0;
await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject});
socket.onmessage=event=>{const message=JSON.parse(event.data);if(message.id&&pending.has(message.id)){const {resolve,reject}=pending.get(message.id);pending.delete(message.id);message.error?reject(Error(message.error.message)):resolve(message.result)}};
const send=(method,params={})=>new Promise((resolve,reject)=>{const commandId=++id;pending.set(commandId,{resolve,reject});socket.send(JSON.stringify({id:commandId,method,params}))});
const evaluate=async expression=>(await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true})).result.value;
await send('Page.enable');await send('Runtime.enable');

import assert from 'node:assert/strict';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const fire=()=>fetch('http://127.0.0.1:4318/api/workbench/fire').then(r=>r.json());
try{
 let data=await fire();
 for(let i=0;data.refreshing&&i<90;i++){await pause(2000);data=await fire()}
 assert.equal(data.refreshing,false,'Prior refresh did not complete');
 await send('Page.reload',{ignoreCache:true});await pause(1200);
 await evaluate(`document.querySelector('[data-view="fire"]').click()`);await pause(600);
 const before=data.refreshedAt;
 await evaluate(`document.querySelector('#refreshFire').click()`);
 await pause(2000);
 data=await fire();
 for(let i=0;i<120;i++){
  if(!data.refreshing&&data.refreshedAt!==before)break;
  await pause(2000);data=await fire();
 }
 assert.equal(data.refreshing,false);
 assert.notEqual(data.refreshedAt,before);
 assert.equal(data.refreshError,null);
 assert.equal(data.rule_version,'v2.2');
 assert.equal(data.rows.length,87);
 for(const code of ['J','SF','CU','ZN']){
  const row=data.rows.find(r=>r.code===code);
  assert.equal(row.data_date,data.target_date);
  assert.equal(row.week_higher_low,false,code+' current week low must fail');
  assert.notEqual(row.modes['month-week'],'多头观察');
 }
 const sf=data.rows.find(r=>r.code==='SF');
 const chart=await fetch('http://127.0.0.1:4318/api/workbench/fire/bars?contract='+sf.main_contract).then(r=>r.json());
 assert.equal(chart.bars.at(-1).date,sf.data_date);
 assert.equal(chart.bars.at(-1).low,sf.latest_bar.low);
 assert.equal(chart.bars.at(-1).close,sf.latest_bar.close);
 await pause(3500);
 for(const width of [1100,1500]){
  await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
  await pause(200);
  const overflow=await evaluate('document.documentElement.scrollWidth>innerWidth');
  assert.equal(overflow,false,'Page overflows at '+width);
 }
 await evaluate(`document.querySelector('[data-mode="month-week-day"]').click()`);await pause(300);
 const headings=await evaluate(`[...document.querySelectorAll('main th')].map(x=>x.textContent)`);
 assert.ok(headings.includes('周K结构')&&headings.includes('日K结构'));
 await evaluate(`document.querySelector('#fireFilter').value='all';document.querySelector('#fireFilter').dispatchEvent(new Event('change'))`);
 await pause(300);
 await evaluate(`document.querySelector('[data-fire-detail="SF"]').click()`);await pause(500);
 assert.ok(await evaluate(`document.querySelector('[data-ma="10"]')!==null`));
 await mkdir(resolve('output/playwright'),{recursive:true});
 const shot=await send('Page.captureScreenshot',{format:'png'});
 await writeFile(resolve('output/playwright/eod-chart.png'),Buffer.from(shot.data,'base64'));
 await evaluate(`document.querySelector('#modal').close();document.querySelector('#fireFilter').value='candidate';document.querySelector('#fireFilter').dispatchEvent(new Event('change'))`);
 await pause(300);
 const screenshot=await send('Page.captureScreenshot',{format:'png'});
 await writeFile(resolve('output/playwright/eod-refresh.png'),Buffer.from(screenshot.data,'base64'));
 const result={target:data.target_date,current:data.current_count,noTrade:data.no_trade_count,provisional:data.provisional_count,missing:data.universe_size-data.current_count-data.no_trade_count,refreshedAt:data.refreshedAt};
 await writeFile(resolve('output/playwright/eod-verification.json'),JSON.stringify(result,null,2));
 console.log(JSON.stringify(result));
}finally{
 await send('Emulation.clearDeviceMetricsOverride');socket.close();
}

