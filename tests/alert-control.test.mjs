import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,mkdtempSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createRequire} from 'node:module';
import {EventEmitter} from 'node:events';
import vm from 'node:vm';
const require=createRequire(import.meta.url),turn=()=>new Promise(r=>setImmediate(r));
function harness({deferredLoad=false,deferredSpeech=false,saved={voiceId:'taiwan-female',active:true}}={}){
 const parent=resolve('output/alert-control-2026-11-04/unit');mkdirSync(parent,{recursive:true});const directory=mkdtempSync(join(parent,'case-'));writeFileSync(join(directory,'alarm-settings.json'),JSON.stringify(saved));
 const handlers=new Map(),windows=[],messages=[],flashes=[];let clock=Date.parse('2026-11-04T10:00:00+08:00'),resolveLoad,resolveSpeech;
 class FakeWindow extends EventEmitter{constructor(){super();this.visible=false;this.dead=false;this.webContents={mainFrame:{},send:(...a)=>messages.push(a),setWindowOpenHandler(){},on(){}};windows.push(this)}isDestroyed(){return this.dead}loadFile(){return deferredLoad?new Promise(r=>resolveLoad=r):Promise.resolve()}showInactive(){this.visible=true}hide(){this.visible=false}destroy(){this.dead=true}}
 const module={exports:{}},context={module,__dirname:resolve('desktop'),require:p=>p==='electron'?{BrowserWindow:FakeWindow,ipcMain:{handle:(k,f)=>handlers.set(k,f),removeHandler:k=>handlers.delete(k)}}:require(p),AbortSignal,Date:class extends Date{static now(){return clock}},fetch:async()=>{if(deferredSpeech)await new Promise(r=>resolveSpeech=r);return{ok:true,json:async()=>({audio:'fixture',voiceId:'taiwan-female'})}}};
 vm.runInNewContext(readFileSync('desktop/trend-alarm.cjs','utf8'),context);
 const alarm=module.exports.installTrendAlarm({api:async()=>({}),getWindow:()=>({flashFrame:v=>flashes.push(v)}),base:'http://127.0.0.1:4376',directory});
 return {alarm,handlers,windows,messages,flashes,clock:()=>clock,advance:ms=>clock+=ms,event:(id,offset=1)=>({id,kind:'ma-turn',name:'【测试】螺纹钢',symbol:'SHFE.RB2701',period:'30m',direction:'down',triggeredAt:new Date(clock+offset).toISOString(),isTest:true}),resolveLoad:()=>resolveLoad?.(),resolveSpeech:()=>resolveSpeech?.(),trusted:()=>({sender:windows[0].webContents,senderFrame:windows[0].webContents.mainFrame})};
}
test('每次启动默认轻提示，即使旧配置有active=true也不弹窗、不合成；试听须先启动',async()=>{
 const h=harness();try{assert.equal(h.alarm.settings().active,false);assert.equal(h.alarm.settings().playbackRate,1.5);assert.equal(await h.alarm.push(h.event('off')),false);assert.equal(h.windows.length,0);assert.throws(()=>h.alarm.test(),/先启动/)}finally{h.alarm.stop()}
});
test('启动后只接收新信号，不补播旧信号；重复启动幂等',async()=>{
 const h=harness();try{await h.alarm.push(h.event('quiet'));h.alarm.setActive(true);assert.equal(await h.alarm.push(h.event('before',-1)),false);h.advance(100);h.alarm.setActive(true);assert.equal(await h.alarm.push({...h.event('since-first'),triggeredAt:new Date(h.clock()-50).toISOString()}),true);assert.equal(h.windows[0].visible,true);assert.equal(await h.alarm.push(h.event('quiet')),false);assert.throws(()=>h.alarm.setActive('false'),/必须/)}finally{h.alarm.stop()}
});
test('弹窗加载尚未完成时关闭，不会迟到弹出或播报',async()=>{
 const h=harness({deferredLoad:true});try{h.alarm.setActive(true);const pending=h.alarm.push(h.event('opening'));h.alarm.setActive(false);h.resolveLoad();assert.equal(await pending,false);assert.equal(h.windows[0].visible,false);assert.ok(h.messages.some(([k,a])=>k==='xiaomu:alarm-items'&&a.length===0));assert.equal(h.flashes.at(-1),false)}finally{h.alarm.stop()}
});
test('语音合成过程中关闭，迟到音频被拒绝；弹窗隐藏，队列清空',async()=>{
 const h=harness({deferredSpeech:true});try{h.alarm.setActive(true);await h.alarm.push(h.event('speaking'));const speech=h.handlers.get('xiaomu:alarm-speech')(h.trusted(),'speaking');await turn();h.alarm.setActive(false);h.resolveSpeech();await assert.rejects(speech,/已停止/);assert.equal(h.windows[0].visible,false);assert.ok(h.messages.some(([k])=>k==='xiaomu:alarm-silence'));h.alarm.setActive(true);assert.equal(await h.alarm.push(h.event('speaking')),false);assert.equal(await h.alarm.push(h.event('fresh')),true)}finally{h.alarm.stop()}
});
test('轻提示模式不生成Windows均线通知，普通到价提醒维持原功能',async()=>{
 const directory=mkdtempSync(resolve('output/alert-control-2026-11-04/unit/monitor-')),notices=[],acks=[],handlers=new Map();let active=false;
 class Notice extends EventEmitter{constructor(o){super();this.o=o;notices.push(this)}static isSupported(){return true}show(){this.emit('show')}close(){this.emit('close')}}
 const mainFrame={url:'http://127.0.0.1:4376/market-panorama.html'},webContents={mainFrame},window={webContents,isDestroyed:()=>false,on(){},flashFrame(){}},module={exports:{}},pending=[{id:'turn',kind:'ma-turn',name:'测试',condition:'测试',triggeredAt:new Date().toISOString()},{id:'price',kind:'price',name:'测试',condition:'测试',triggeredAt:new Date().toISOString()}];
 const electron={app:{setAppUserModelId(){}},ipcMain:{handle:(k,v)=>handlers.set(k,v),removeHandler(){}},Notification:Notice,powerMonitor:new EventEmitter(),safeStorage:{isEncryptionAvailable:()=>false},dialog:{},Tray:class{},Menu:{},nativeImage:{}};
 const context={module,require:p=>p==='electron'?electron:p==='./trend-alarm.cjs'?{installTrendAlarm:()=>({isActive:()=>active,setActive:v=>{active=!!v;return{active}},push:async()=>true,sync:async()=>{},stop(){},settings:()=>({active})})}:p==='node:child_process'?{spawn:()=>new EventEmitter()}:require(p),process:{...process,env:{...process.env,WUJIAN_MONITOR_HOME:directory}},URL,AbortSignal,setInterval:()=>({unref(){}}),clearInterval(){},setTimeout,clearTimeout,fetch:async(url,options)=>({ok:true,json:async()=>{if(url.endsWith('/desktop/ack'))acks.push(JSON.parse(options.body));return url.endsWith('/tq/status')?{managed:true}:url.endsWith('/desktop/pending')?{items:pending}:url.endsWith('/status')?{market:{provider:'sina'}}:{ok:true}}})};
 vm.runInNewContext(readFileSync('desktop/monitor.cjs','utf8'),context);const monitor=module.exports.installMonitor({base:'http://127.0.0.1:4376',project:resolve('.'),getWindow:()=>window,isQuitting:()=>false,requestQuit(){}});
 try{await monitor.ready;assert.equal(notices.length,1);assert.ok(acks.some(a=>a.id==='turn'&&a.status==='accepted'&&a.note.includes('轻提示')));await assert.rejects(()=>handlers.get('xiaomu:trend-alarm-active')({sender:{},senderFrame:mainFrame},true),/来源无效/)}finally{await monitor.stop()}
});
