import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const base='http://127.0.0.1:4318',out=resolve('output/playwright/navigation-rules-2026-10-10');
const json=async path=>{const response=await fetch(base+path);assert.ok(response.ok,path);return response.json()};
const before=await json('/api/workbench/backup'),rules=await json('/api/workbench/rules/detail');
const pages=await fetch('http://127.0.0.1:9229/json/list').then(response=>response.json());
const page=pages.find(item=>item.type==='page'&&item.url.startsWith(base));assert.ok(page,'Windows APP未打开');
const socket=new WebSocket(page.webSocketDebuggerUrl),pending=new Map();let seq=0;
await new Promise((done,fail)=>{socket.onopen=done;socket.onerror=fail});
socket.onmessage=event=>{const message=JSON.parse(event.data),task=pending.get(message.id);if(task){pending.delete(message.id);message.error?task.reject(Error(message.error.message)):task.resolve(message.result)}};
const send=(method,params={})=>new Promise((done,fail)=>{const id=++seq,timer=setTimeout(()=>fail(Error(method+' timeout')),20000);pending.set(id,{resolve:value=>{clearTimeout(timer);done(value)},reject:error=>{clearTimeout(timer);fail(error)}});socket.send(JSON.stringify({id,method,params}))});
const evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value};
const delay=ms=>new Promise(done=>setTimeout(done,ms));
async function wait(expression){for(let i=0;i<100;i++){if(await evaluate(`Boolean(${expression})`))return;await delay(100)}throw Error('等待超时：'+expression)}
async function click(selector){
 await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'nearest'})`);
 const point=await evaluate(`(()=>{const box=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:box.left+box.width/2,y:box.top+box.height/2}})()`);
 await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});
 await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});
}
async function shot(name){const image=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(resolve(out,name+'.png'),Buffer.from(image.data,'base64'))}
async function viewport(width,height=980){await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await delay(150)}
async function headerLayout(selectors){return evaluate(`(()=>{const items=${JSON.stringify(selectors)}.map(selector=>{const node=document.querySelector(selector),box=node.getBoundingClientRect();return{selector,x:box.x,y:box.y,width:box.width,height:box.height,visible:box.width>0&&box.height>0&&box.left>=0&&box.right<=innerWidth&&box.top>=0&&box.bottom<=innerHeight}});return{width:innerWidth,items,overlap:items.some((a,index)=>items.slice(index+1).some(b=>Math.min(a.x+a.width,b.x+b.width)>Math.max(a.x,b.x)+1&&Math.min(a.y+a.height,b.y+b.height)>Math.max(a.y,b.y)+1))}})()`)}
const layouts=[];
try{
 await mkdir(out,{recursive:true});await send('Page.enable');
 await send('Page.navigate',{url:base+'/?view=fire'});await wait(`document.querySelector('#accountSelect option')&&document.querySelector('[data-mode]')`);
 for(const width of [1500,1100,1024,390,320]){
  await viewport(width);
  const layout=await headerLayout(['#assistantButton','#ruleVersion','#printButton','.version-link','#addAccount']);
  assert.ok(layout.items.every(item=>item.visible),JSON.stringify(layout));assert.ok(!layout.overlap,JSON.stringify(layout));
  await click('#ruleVersion');await wait(`document.querySelector('#modal .rule-mode-tabs')`);
  const ruleLayout=await evaluate(`(()=>{const modal=document.querySelector('#modal'),box=modal.getBoundingClientRect();return{open:modal.open,fits:box.left>=0&&box.right<=innerWidth&&box.top>=0&&box.bottom<=innerHeight,selected:modal.querySelector('[aria-selected="true"]').dataset.ruleMode}})()`);
  assert.ok(ruleLayout.open&&ruleLayout.fits);assert.equal(ruleLayout.selected,'month-week-day');layouts.push({view:'stable',...layout,ruleLayout});
  if(width===1500)await shot('稳定版-规则详情');
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await wait(`!document.querySelector('#modal').open`);
  if([1500,390].includes(width))await shot('稳定版-'+width);
 }
 await viewport(1500);await click('#assistantButton');await wait(`!document.querySelector('#assistantDrawer').hidden`);
 assert.equal(await evaluate(`document.activeElement.id`),'assistantInput');await shot('稳定版-小木对话');await click('#closeAssistant');
 assert.equal(await evaluate(`document.querySelector('#assistantButton').getAttribute('aria-expanded')`),'false');
 await click('[data-mode="month-week"]');await click('#ruleVersion');await wait(`document.querySelector('#modal [aria-selected="true"]')?.dataset.ruleMode==='month-week'`);
 for(const mode of ['month-week-day','month-week','week-day']){await click(`[data-rule-mode="${mode}"]`);assert.equal(await evaluate(`document.querySelector('#modal [aria-selected="true"]').dataset.ruleMode`),mode)}
 await click('#modalClose');
 await evaluate(`window.__savedRuleFetch=window.fetch;window.fetch=async(path,options)=>path==='/api/workbench/rules/detail'?new Response(JSON.stringify({error:'隔离验收：规则服务离线'}),{status:503}):window.__savedRuleFetch.call(window,path,options)`);
 await click('#ruleVersion');await wait(`document.querySelector('#modal .rule-retry')`);
 assert.match(await evaluate(`document.querySelector('#modalBody').textContent`),/规则读取失败/);
 await evaluate(`window.fetch=window.__savedRuleFetch;delete window.__savedRuleFetch`);await click('.rule-retry');await wait(`document.querySelector('#modal .rule-mode-tabs')`);await click('#modalClose');
 await click('#mainNav [data-view="rules"]');await wait(`document.querySelector('#accountForm')`);
 await evaluate(`window.__savedOpen=window.open;window.open=url=>{window.__printUrl=url;return null}`);await click('#printButton');await wait(`window.__printUrl`);
 const printUrl=await evaluate(`window.__printUrl`);assert.equal(new URL(printUrl,base).searchParams.get('type'),'account');
 await evaluate(`window.open=window.__savedOpen;delete window.__savedOpen`);
 await send('Page.navigate',{url:new URL(printUrl,base).href});await wait(`document.querySelector('#paper h1')?.textContent==='账户风险总表'`);
 assert.ok(await evaluate(`document.querySelector('.toolbar button').textContent.includes('保存 PDF')`));
 await send('Page.navigate',{url:base+'/?view=fire'});await wait(`document.querySelector('#accountSelect option')&&document.querySelector('[data-mode]')`);
 await click('.version-link');await wait(`location.pathname==='/cockpit.html'&&document.querySelector('#opportunityList [data-code]')`);
 assert.equal(await evaluate(`document.querySelectorAll('.version-switch a').length`),1);
 assert.equal(await evaluate(`document.querySelector('.version-switch a').textContent`),'稳定版');
 assert.equal(await evaluate(`document.querySelector('#ruleVersion').textContent`),rules.version);
 for(const width of [1500,1100,1024,390,320]){
  await viewport(width);await evaluate('window.scrollTo(0,0)');
  const layout=await headerLayout(['#assistantButton','#ruleVersion','.version-switch']);
  assert.ok(layout.items.every(item=>item.visible),JSON.stringify(layout));assert.ok(!layout.overlap,JSON.stringify(layout));
  await click('#ruleVersion');await wait(`document.querySelector('#ruleDialog .rule-mode-tabs')`);
  assert.equal(await evaluate(`document.querySelector('#ruleDialog [aria-selected="true"]').dataset.ruleMode`),'month-week-day');
  const fits=await evaluate(`(()=>{const box=document.querySelector('#ruleDialog').getBoundingClientRect();return box.left>=0&&box.right<=innerWidth&&box.top>=0&&box.bottom<=innerHeight})()`);assert.ok(fits);
  if(width===1500)await shot('全息版-规则详情');
  await click('#ruleDialogClose');layouts.push({view:'holographic',...layout,ruleDialogFits:fits});
  if([1500,390].includes(width))await shot('全息版-'+width);
 }
 await viewport(1500);await click('#assistantButton');await wait(`!document.querySelector('#callPanel').hidden`);assert.equal(await evaluate('document.activeElement.id'),'chatInput');await click('#minCall');
 await click('.version-switch a');await wait(`location.pathname==='/'&&document.querySelector('#accountSelect option')`);
 const after=await json('/api/workbench/backup'),{exportedAt:beforeTime,...beforeData}=before,{exportedAt:afterTime,...afterData}=after;assert.deepEqual(afterData,beforeData,'验收不应修改生产交易记录');
 assert.equal((await json('/api/workbench/rules')).combinedHash,before.rules.combinedHash,'UI修改不应改变交易规则哈希');
 await writeFile(resolve(out,'验收.json'),JSON.stringify({passed:true,checkedAt:new Date().toISOString(),layouts,roundTrip:true,chatOpened:true,printAccountPage:true,ruleTabs:true,errorRetry:true,productionMutation:false,ruleHashUnchanged:true},null,2));
 await send('Page.navigate',{url:base+'/?view=fire'});await wait(`document.querySelector('[data-mode]')`);await send('Page.bringToFront');
 console.log(JSON.stringify({passed:true,layouts:layouts.length,roundTrip:true,chatOpened:true,printAccountPage:true,ruleTabs:true,errorRetry:true,productionMutation:false,ruleHashUnchanged:true,out}));
}finally{
 try{await evaluate(`if(window.__savedRuleFetch){window.fetch=window.__savedRuleFetch;delete window.__savedRuleFetch}if(window.__savedOpen){window.open=window.__savedOpen;delete window.__savedOpen}`);await send('Emulation.clearDeviceMetricsOverride')}catch{}
 socket.close();
}
