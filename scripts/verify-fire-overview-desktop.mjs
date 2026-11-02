import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {sortFireCandidates,fireStrengthTones} from '../dist/fire-display.js';

const base='http://127.0.0.1:4318',output=resolve(process.env.WUJIAN_UI_EVIDENCE||'output/playwright/fire-overview-2026-10-08');
const json=async path=>{const r=await fetch(base+path,{signal:AbortSignal.timeout(10000)});assert.ok(r.ok);return r.json()};
const pages=await fetch('http://127.0.0.1:9229/json/list').then(r=>r.json());
const page=pages.find(p=>p.type==='page'&&p.url.startsWith(base+'/'));assert.ok(page);
const socket=new WebSocket(page.webSocketDebuggerUrl),pending=new Map();let seq=0;
await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject});
socket.onmessage=e=>{const r=JSON.parse(e.data),p=pending.get(r.id);if(p){pending.delete(r.id);r.error?p.reject(Error(r.error.message)):p.resolve(r.result)}};
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error(method+'超时'))},15000);pending.set(id,{resolve:r=>{clearTimeout(timer);resolve(r)},reject:e=>{clearTimeout(timer);reject(e)}});socket.send(JSON.stringify({id,method,params}))});
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value};
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const expectedPalette={'long-strong':'rgb(255, 66, 69)','long-medium':'rgb(255, 132, 134)','long-weak':'rgb(255, 189, 190)','short-strong':'rgb(48, 209, 88)','short-medium':'rgb(120, 225, 146)','short-weak':'rgb(183, 239, 197)'};
const luminance=rgb=>{const v=rgb.match(/[\d.]+/g).slice(0,3).map(Number).map(n=>n/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4);return .2126*v[0]+.7152*v[1]+.0722*v[2]};
try{
 const health=await json('/api/health'),before=await json('/api/workbench/backup'),fire=await json('/api/workbench/fire');
 assert.equal(resolve(health.projectRoot),resolve('.'));await mkdir(output,{recursive:true});
 await send('Page.enable');await send('Page.bringToFront');await send('Page.navigate',{url:base+'/?view=fire'});
 for(let n=0;n<50;n++){if(await evaluate(`!!document.querySelector('.fire-overview')`))break;await delay(200)}
 const modes=['month-week-day','month-week','week-day'],results=[];
 for(const width of [1440,1024,390]){
  await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});
  for(const mode of modes){
   await evaluate(`document.querySelector('[data-mode="${mode}"]').click()`);await delay(80);
   const shown=await evaluate(`(()=>{const root=document.querySelector('.fire-overview'),box=e=>{const r=e.getBoundingClientRect();return{top:r.top,bottom:r.bottom,left:r.left,right:r.right}};return {groups:[...root.querySelectorAll('[data-overview-side]')].map(g=>({side:g.dataset.overviewSide,codes:[...g.querySelectorAll('[data-fire-detail]')].map(b=>b.dataset.fireDetail),ranks:[...g.querySelectorAll('.fire-rank')].map(s=>Number(s.textContent))})),table:[...document.querySelectorAll('.table-wrap [data-fire-detail]')].map(b=>b.dataset.fireDetail),placement:box(document.querySelector('.tabs')).bottom<=box(root).top&&box(root).bottom<=box(document.querySelector('.filters')).top,overflow:[...root.querySelectorAll('li')].some(li=>[...li.children].some(c=>box(c).right>box(li).right+1)),width:box(root).right-box(root).left,withinViewport:box(root).left>=0&&box(root).right<=innerWidth+1}})()`);
   const expected=sortFireCandidates(fire.rows.filter(r=>['多头观察','空头观察'].includes(r.modes[mode])),mode);
   const actualTones=await evaluate(`[...document.querySelectorAll('.fire-overview [data-fire-detail]')].map(b=>b.dataset.strength)`),expectedTones=fireStrengthTones(expected,mode);
   assert.deepEqual(actualTones,expected.map(row=>expectedTones.get(row)));
   const palette=await evaluate(`[...document.querySelectorAll('.fire-overview [data-strength]')].map(b=>({key:b.closest('[data-overview-side]').dataset.overviewSide+'-'+b.dataset.strength,background:getComputedStyle(b).backgroundColor,color:getComputedStyle(b).color,codeColor:getComputedStyle(b.querySelector('small')).color,codeOpacity:getComputedStyle(b.querySelector('small')).opacity}))`);
   for(const sample of palette){
    if(sample.key.endsWith('-unknown'))continue;
    assert.equal(sample.background,expectedPalette[sample.key]);assert.equal(sample.codeOpacity,'1');
    for(const color of [sample.color,sample.codeColor]){const [hi,lo]=[luminance(sample.background),luminance(color)].sort((a,b)=>b-a);assert.ok((hi+.05)/(lo+.05)>=4.5)}
   }
   assert.deepEqual(shown.groups.map(g=>g.side),['long','short']);
   assert.deepEqual(shown.groups.flatMap(g=>g.codes),expected.map(r=>r.code));
   assert.deepEqual(shown.table,expected.map(r=>r.code));
   for(const g of shown.groups)assert.deepEqual(g.ranks,g.codes.map((_,i)=>i+1));
   assert.ok(shown.placement);assert.ok(!shown.overflow);assert.ok(shown.withinViewport);
   results.push({width,mode,...shown,paletteVerified:true,palette});
   if(mode==='month-week-day'||process.env.WUJIAN_UI_EVIDENCE){
    await evaluate(`document.querySelector('.tabs').scrollIntoView({block:'start'});scrollBy(0,-90)`);await delay(100);
    const screenshot=await send('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false});
    await writeFile(resolve(output,`${mode}-${width}.png`),Buffer.from(screenshot.data,'base64'));
   }
  }
 }
 await send('Emulation.clearDeviceMetricsOverride');await evaluate(`document.querySelector('[data-mode="month-week-day"]').click();window.scrollTo(0,0)`);
 const first=await evaluate(`document.querySelector('.fire-overview [data-fire-detail]').dataset.fireDetail`);
 await evaluate(`document.querySelector('.fire-overview [data-fire-detail]').click()`);
 assert.ok(await evaluate(`document.querySelector('#modal').open`));
 assert.ok((await evaluate(`document.querySelector('#modalTitle').textContent`)).includes(fire.rows.find(r=>r.code===first).name));
 await evaluate(`document.querySelector('#modal').close()`);
 const after=await json('/api/workbench/backup'),{exportedAt:bt,...bd}=before,{exportedAt:at,...ad}=after;
 assert.deepEqual(ad,bd);
 const result={passed:true,checkedAt:new Date().toISOString(),health,dataDate:fire.data_date,results,detailClickPassed:true,productionMutation:false};
 await writeFile(resolve(output,'页面验收.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({passed:true,dataDate:fire.data_date,viewports:[1440,1024,390],modes:3,detailClickPassed:true,productionMutation:false,output},null,2));
}finally{try{await send('Emulation.clearDeviceMetricsOverride')}catch{}socket.close()}
