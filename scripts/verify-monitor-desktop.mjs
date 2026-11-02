import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {MonitorStore} from '../integrations/monitor-store.mjs';
import {MonitorEngine} from '../integrations/monitor-engine.mjs';

const base='http://127.0.0.1:4319',out=resolve('output/monitor-acceptance'),db=resolve(out,'monitor.sqlite');
const json=async(path,input)=>{const response=await fetch(base+path,input===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify(input)});const value=await response.json();assert.ok(response.ok,JSON.stringify(value));return value;};
const pages=await fetch('http://127.0.0.1:'+(process.env.WUJIAN_MONITOR_CDP||9229)+'/json/list').then(r=>r.json()),page=pages.find(p=>p.type==='page'&&p.url.startsWith(base));assert.ok(page,'请启动4319隔离验收APP');
const socket=new WebSocket(page.webSocketDebuggerUrl),pending=new Map();let seq=0;
await new Promise((done,fail)=>{socket.onopen=done;socket.onerror=fail;});
socket.onmessage=e=>{const m=JSON.parse(e.data),p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}};
const send=(method,params={})=>new Promise((done,fail)=>{const id=++seq,timer=setTimeout(()=>fail(Error(method+' timeout')),25000);pending.set(id,{resolve:r=>{clearTimeout(timer);done(r)},reject:e=>{clearTimeout(timer);fail(e)}});socket.send(JSON.stringify({id,method,params}));});
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(expression){for(let i=0;i<100;i++){if(await evaluate(`Boolean(${expression})`))return;await delay(150);}throw Error('等待超时 '+expression);}
async function click(selector){if(process.env.WUJIAN_MONITOR_DOM_CLICK==='1')return evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'nearest'})`);const point=await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});}
async function shot(name){const r=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(resolve(out,name+'.png'),Buffer.from(r.data,'base64'));}
const layouts=[];
try{
 await mkdir(out,{recursive:true});await send('Page.enable');await evaluate(`localStorage.removeItem('wj-assistant-history')`);for(const rule of (await json('/api/monitor/rules')).items)await json('/api/monitor/rules/'+rule.id+'/archive',{});await send('Page.navigate',{url:base+'/?view=monitor'});await wait(`document.querySelector('#monitorCreate')`);
 assert.equal((await json('/api/monitor/status')).market.configured,false);
 await click('#assistantButton');await wait(`!document.querySelector('#assistantDrawer').hidden`);
 await evaluate(`document.querySelector('#assistantInput').value='提醒我沪铜涨到80000'`);await click('#assistantForm button');await wait(`document.querySelector('[data-monitor-draft]')`);
 let saved=(await json('/api/monitor/rules')).items.find(r=>r.status==='draft');assert.ok(saved);assert.equal(saved.status,'draft');
 await click('[data-monitor-draft]');await wait(`document.querySelector('#monitorDialog').open&&document.querySelector('#monitorRuleForm')`);await shot('提醒草稿确认');
 await evaluate(`document.querySelector('#monitorRuleForm [name="feishu"]').checked=false`);
 await click('#monitorRuleForm button[type="submit"]');await wait(`!document.querySelector('#monitorDialog').open`);saved=(await json('/api/monitor/rules')).items.find(r=>r.id===saved.id);assert.equal(saved.status,'active');
 await click('#closeAssistant');await wait(`document.querySelector('[data-rule="${saved.id}"][data-action="pause"]')`);
 for(const width of [1500,1100,390,320]){
  await send('Emulation.setDeviceMetricsOverride',{width,height:980,deviceScaleFactor:1,mobile:false});await delay(250);await evaluate('window.scrollTo(0,0)');
  const layout=await evaluate(`(()=>{const selectors=['#monitorBell','#assistantButton','#printButton'];const boxes=selectors.map(s=>{const r=document.querySelector(s).getBoundingClientRect();return {s,x:r.x,y:r.y,w:r.width,h:r.height,visible:r.width>0&&r.x>=0&&r.right<=innerWidth}});return {width:innerWidth,boxes,overlap:boxes.some((a,i)=>boxes.slice(i+1).some(b=>Math.min(a.x+a.w,b.x+b.w)>Math.max(a.x,b.x)+1&&Math.min(a.y+a.h,b.y+b.h)>Math.max(a.y,b.y)+1))}})()`);
  layouts.push({view:'stable',...layout});assert.ok(layout.boxes.every(b=>b.visible)&&!layout.overlap,JSON.stringify(layout));
  await click('#monitorCreate');await wait(`document.querySelector('#monitorDialog').open&&document.querySelector('#monitorRuleForm')`);
  assert.ok(await evaluate(`(()=>{const r=document.querySelector('#monitorDialog').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight})()`));
  await shot('稳定版-'+width);await click('#monitorDialog .monitor-close');
 }
 await send('Emulation.clearDeviceMetricsOverride');await click(`[data-rule="${saved.id}"][data-action="pause"]`);await wait(`document.querySelector('[data-rule="${saved.id}"][data-action="activate"]')`);
 await click(`[data-edit="${saved.id}"]`);await wait(`document.querySelector('#monitorDialog').open&&document.querySelector('#monitorRuleForm')`);await evaluate(`document.querySelector('#monitorRuleForm [name="threshold"]').value=80010`);await click('#monitorSaveDraft');await wait(`!document.querySelector('#monitorDialog').open`);assert.equal((await json('/api/monitor/rules')).items.find(r=>r.id===saved.id).status,'draft');
 await click(`[data-rule="${saved.id}"][data-action="activate"]`);await wait(`document.querySelector('[data-rule="${saved.id}"][data-action="pause"]')`);
 // Quotes are injected into the isolated database only; production has no replay endpoint.
 const store=new MonitorStore(db);const actual=store.getRule(saved.id);const fixture=store.saveRule({...actual,title:'隔离模拟验收',members:actual.members.map(m=>({...m,name:'验收模拟（铜）'})),threshold:100,channels:['desktop']});store.setStatus(fixture.id,'active');
 const engine=new MonitorEngine({store});const result=engine.ingest({symbol:fixture.members[0].symbol,last:100,sequence:1,quoteAt:new Date().toISOString(),sessionActive:true,sessionKey:'isolated-synthetic',tradingDay:'isolated-synthetic',source:'隔离合成行情'});assert.equal(result.events.length,1);const eventId=result.events[0].id;store.close();
 for(let i=0;i<80;i++){const event=await json('/api/monitor/events/'+eventId);if(event.deliveries[0].status==='accepted')break;await delay(250);}
 const event=await json('/api/monitor/events/'+eventId);assert.equal(event.deliveries[0].status,'accepted',JSON.stringify(event));
 await click('#monitorBell');await wait(`document.querySelector('#monitorDialog [data-event="${eventId}"]')`);await click(`#monitorDialog [data-event="${eventId}"]`);await wait(`document.querySelector('.monitor-evidence')`);assert.match(await evaluate(`document.querySelector('.monitor-evidence').textContent`),/隔离合成行情/);assert.ok((await json('/api/monitor/events/'+eventId)).readAt);await shot('触发证据与Windows回执');await click('#monitorDialog .monitor-close');
 await send('Page.navigate',{url:base+'/?view=fire'});await wait(`document.querySelector('[data-fire-detail]')`);await click('[data-fire-detail] + .monitor-bell');await wait(`document.querySelector('#monitorDialog').open&&document.querySelector('#monitorRuleForm')`);await click('#monitorDialog .monitor-close');
 await send('Page.navigate',{url:base+'/cockpit.html'});await wait(`document.querySelector('#focusMonitor')`);
 for(const width of [1500,1100,390,320]){
  await send('Emulation.setDeviceMetricsOverride',{width,height:980,deviceScaleFactor:1,mobile:false});await delay(250);await evaluate('window.scrollTo(0,0)');
  const layout=await evaluate(`(()=>{const selectors=['#monitorBell','#assistantButton','.version-switch'];const boxes=selectors.map(s=>{const r=document.querySelector(s).getBoundingClientRect();return {s,x:r.x,y:r.y,w:r.width,h:r.height,visible:r.width>0&&r.x>=0&&r.right<=innerWidth}});return {width:innerWidth,boxes,overlap:boxes.some((a,i)=>boxes.slice(i+1).some(b=>Math.min(a.x+a.w,b.x+b.w)>Math.max(a.x,b.x)+1&&Math.min(a.y+a.h,b.y+b.h)>Math.max(a.y,b.y)+1))}})()`);layouts.push({view:'holographic',...layout});assert.ok(layout.boxes.every(b=>b.visible)&&!layout.overlap,JSON.stringify(layout));await shot('全息版-'+width);
 }
 await send('Emulation.clearDeviceMetricsOverride');await click('#focusMonitor');await wait(`document.querySelector('#monitorDialog').open&&document.querySelector('#monitorRuleForm')`);await click('#monitorDialog .monitor-close');
 await click('#monitorBell');await wait(`document.querySelector('#monitorInboxManage')`);await click('#monitorInboxManage');await wait(`document.querySelector('#monitorCreate')`);
 await click('[data-monitor-tab="settings"]');await wait(`document.querySelector('#monitorBind')`);await shot('连接与通知');
 await click('#monitorBind');await wait(`document.querySelector('#monitorDialog').open&&document.querySelector('#monitorBindState')`);await delay(2500);await shot('飞书本人绑定');if(await evaluate(`document.querySelector('#monitorDialog').open`))await click('#monitorDialog .monitor-close');
 const backup=await json('/api/workbench/backup'),before=JSON.parse(await readFile('.runtime/ui-history/2026-10-10-monitor-before/business-backup.json','utf8'));
 delete backup.exportedAt;delete before.exportedAt;assert.deepEqual(backup,before,'监控测试不得改变交易业务库');
 await writeFile(resolve(out,process.env.WUJIAN_MONITOR_DOM_CLICK==='1'?'验收-独立窗口DOM.json':'验收.json'),JSON.stringify({passed:true,interaction:process.env.WUJIAN_MONITOR_DOM_CLICK==='1'?'DOM control activation':'CDP mouse input',at:new Date().toISOString(),layouts,dialogFits:true,assistantDraftConfirmed:true,editInvalidates:true,syntheticTrigger:event,windowsAccepted:true,phoneBound:false,realMarketConfigured:false,productionMutation:false},null,2));
 console.log(JSON.stringify({passed:true,out,windowsAccepted:true,phoneBound:false,realMarketConfigured:false,layouts:layouts.length}));
}finally{try{await send('Emulation.clearDeviceMetricsOverride')}catch{}socket.close();}
