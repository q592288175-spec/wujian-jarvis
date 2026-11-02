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

const expected={home:'今日交易总览',fire:'火 · 识别机会',water:'水 · 分析机会',metal:'金 · 冻结计划',earth:'土 · 执行管理',wood:'木 · 检查迭代',rules:'账户与规则'};
const results=[];
for(const [view,title] of Object.entries(expected)){
 const result=await evaluate(`new Promise(resolve=>{document.querySelector('[data-view="${view}"]').click();setTimeout(()=>resolve({title:document.querySelector('#viewTitle').textContent,error:document.querySelector('#toast').classList.contains('error')}),500)})`);
 results.push({view,...result,ok:result.title===title&&!result.error});
}
await send('Emulation.setDeviceMetricsOverride',{width:1365,height:850,deviceScaleFactor:1,mobile:false});
const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
const output=resolve('output/playwright/electron-workbench.png');await mkdir(resolve('output/playwright'),{recursive:true});await writeFile(output,Buffer.from(shot.data,'base64'));
await evaluate(`new Promise(resolve=>{document.querySelector('[data-view="home"]').click();setTimeout(resolve,300)})`);
socket.close();
console.log(JSON.stringify({results,output},null,2));
if(results.some(item=>!item.ok))process.exitCode=1;
