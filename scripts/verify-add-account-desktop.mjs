import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const base='http://127.0.0.1:4318',out=resolve('output/add-account-2026-10-08');
const json=path=>fetch(base+path).then(r=>r.json());
const before=await json('/api/workbench/backup');
const pages=await fetch('http://127.0.0.1:9229/json/list').then(r=>r.json());
const page=pages.find(p=>p.type==='page'&&p.url.startsWith(base));assert.ok(page);
const socket=new WebSocket(page.webSocketDebuggerUrl),pending=new Map();let seq=0;
await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject});
socket.onmessage=e=>{const r=JSON.parse(e.data),p=pending.get(r.id);if(p){pending.delete(r.id);r.error?p.reject(Error(r.error.message)):p.resolve(r.result)}};
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>reject(Error(method+' timeout')),15000);pending.set(id,{resolve:r=>{clearTimeout(timer);resolve(r)},reject:e=>{clearTimeout(timer);reject(e)}});socket.send(JSON.stringify({id,method,params}))});
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value};
const delay=ms=>new Promise(r=>setTimeout(r,ms));
try{
 await send('Page.enable');await send('Page.navigate',{url:base+'/?view=fire'});
 for(let i=0;i<50;i++){if(await evaluate(`!!document.querySelector('#accountSelect option')`))break;await delay(100)}
 await mkdir(out,{recursive:true});
 const widths=[];
 for(const width of [1440,1024,390]){
  await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});
  await evaluate(`document.querySelector('#addAccount').click()`);await delay(80);
  const layout=await evaluate(`(()=>{const b=document.querySelector('#addAccount').getBoundingClientRect(),d=document.querySelector('#modal').getBoundingClientRect();return{open:document.querySelector('#modal').open,buttonVisible:b.width>0&&b.left>=0&&b.right<=innerWidth,modalFits:d.left>=0&&d.right<=innerWidth,fields:[...document.querySelectorAll('#addAccountForm input')].map(e=>e.name)}})()`);
  assert.ok(layout.open&&layout.buttonVisible&&layout.modalFits);assert.deepEqual(layout.fields,['alias','equityNumber']);widths.push({width,...layout});
  if(width===1440){const shot=await send('Page.captureScreenshot',{format:'png',fromSurface:true});await writeFile(resolve(out,'添加账户弹窗.png'),Buffer.from(shot.data,'base64'))}
  await evaluate(`document.querySelector('#cancelAddAccount').click()`);
 }
 await send('Emulation.clearDeviceMetricsOverride');
 // Exercise save/error/selection without creating accounts in the production database.
 await evaluate(`window.__accountTest={fetch:window.fetch,previous:localStorage.getItem('wj-account'),calls:0,paths:[],fail:true};window.fetch=async(path,options={})=>{const t=window.__accountTest;t.paths.push(String(path));if(path==='/api/workbench/accounts'&&options.method==='POST'){t.calls++;t.payload=JSON.parse(options.body);await new Promise(r=>setTimeout(r,80));if(t.fail)return new Response(JSON.stringify({error:'隔离验证：保存失败'}),{status:400});t.fake={id:'isolated-ui-account',...t.payload,tier:'unknown'};return new Response(JSON.stringify(t.fake),{status:201})}const response=await t.fetch.call(window,path,options);if(String(path).startsWith('/api/workbench/summary')&&String(path).includes('isolated-ui-account')){const data=await response.json();data.account=t.fake;data.accounts=[...data.accounts,t.fake];data.cards=[];return new Response(JSON.stringify(data))}return response}`);
 await evaluate(`document.querySelector('#addAccount').click()`);await delay(80);
 await evaluate(`const form=document.querySelector('#addAccountForm');form.elements.alias.value='隔离验收账户';form.elements.equityNumber.value='1100000';form.requestSubmit()`);await delay(150);
 assert.ok(await evaluate(`document.querySelector('#modal').open&&!document.querySelector('#addAccountError').hidden&&document.querySelector('#addAccountForm').elements.equityNumber.value==='1100000'`));
 await evaluate(`window.__accountTest.fail=false;document.querySelector('#addAccountForm').requestSubmit();document.querySelector('#addAccountForm').requestSubmit()`);
 for(let i=0;i<50;i++){if(await evaluate(`document.querySelector('#accountSelect').value==='isolated-ui-account'`))break;await delay(100)}
 const saved=await evaluate(`({calls:window.__accountTest.calls,payload:window.__accountTest.payload,selected:document.querySelector('#accountSelect').value,label:document.querySelector('#accountSelect option:checked')?.textContent,persisted:localStorage.getItem('wj-account'),closed:!document.querySelector('#modal').open})`);
 assert.equal(saved.calls,2);assert.deepEqual(saved.payload,{alias:'隔离验收账户',equity:1100000,mode:'real'});assert.equal(saved.selected,'isolated-ui-account');assert.equal(saved.persisted,saved.selected);assert.equal(saved.label,'隔离验收账户');assert.ok(saved.closed);
 await evaluate(`const t=window.__accountTest;window.fetch=t.fetch;if(t.previous===null)localStorage.removeItem('wj-account');else localStorage.setItem('wj-account',t.previous);delete window.__accountTest`);
 await send('Page.reload');await delay(500);
 const after=await json('/api/workbench/backup'),{exportedAt:bt,...bd}=before,{exportedAt:at,...ad}=after;assert.deepEqual(ad,bd);
 await writeFile(resolve(out,'页面验收.json'),JSON.stringify({passed:true,checkedAt:new Date().toISOString(),widths,isolatedSave:saved,productionMutation:false},null,2));
 console.log(JSON.stringify({passed:true,widths:widths.map(r=>r.width),isolatedSavePassed:true,errorRetryPassed:true,duplicateSubmitPrevented:true,productionMutation:false,out}));
}finally{
 try{await evaluate(`if(window.__accountTest){const t=window.__accountTest;window.fetch=t.fetch;if(t.previous===null)localStorage.removeItem('wj-account');else localStorage.setItem('wj-account',t.previous);delete window.__accountTest;location.reload()}`);await send('Emulation.clearDeviceMetricsOverride')}catch{}
 socket.close();
}
