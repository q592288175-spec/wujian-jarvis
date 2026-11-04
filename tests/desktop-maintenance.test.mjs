import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mkdtemp} from 'node:fs/promises';
import {resolve} from 'node:path';
import {EventEmitter} from 'node:events';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import {JSDOM} from 'jsdom';
const turn=()=>new Promise(r=>setImmediate(r));
const speech=id=>({audio:Buffer.alloc(48).toString('base64'),voiceId:'taiwan-female',text:id});
const event=id=>({id,name:'螺纹钢',symbol:'RB',period:'30m',direction:'down'});
function renderer({deferredPlay=false}={}){
 const dom=new JSDOM('<body><div id="items"></div><div id="sound"></div><div id="error"></div><div id="spoken"></div><button id="mute"></button><button id="replay"></button><button id="open"></button><button id="ack"></button></body>',{runScripts:'outside-only'}),w=dom.window,requests=[],players=[];let items;
 w.URL.createObjectURL=()=> 'blob:test';w.URL.revokeObjectURL=()=>{};
 w.Audio=class{constructor(){this.paused=false;players.push(this)}play(){return deferredPlay?new Promise(r=>this.finishPlay=r):Promise.resolve()}pause(){this.paused=true}};
 w.xiaomuAlarm={onItems:f=>items=f,onSilence:()=>{},speech:id=>new Promise((resolve,reject)=>requests.push({id,resolve,reject})),open:async()=>{},ack:async()=>{}};
 w.eval(readFileSync('desktop/trend-alarm.js','utf8'));
 return{dom,w,requests,players,items:v=>items(v)};
}
test('警报正在合成时被取消，不播报迟到音频，接着播报队列中的下一条',async()=>{
 const h=renderer();try{h.items([event('a'),event('b')]);assert.equal(h.requests[0].id,'a');h.items([event('b')]);assert.equal(h.requests[1].id,'b');h.requests[0].resolve(speech('a'));await turn();assert.equal(h.players.length,0);h.requests[1].resolve(speech('b'));await turn();assert.equal(h.players.length,1);assert.equal(h.w.document.getElementById('spoken').textContent,'b');}finally{h.dom.window.close()}
});
test('警报正在播放时被标为已读，立即停止它，保留的下一条照常播报',async()=>{
 const h=renderer();try{h.items([event('a'),event('b')]);h.requests[0].resolve(speech('a'));await turn();h.items([event('b')]);assert.equal(h.players[0].paused,true);assert.equal(h.requests[1].id,'b');h.requests[1].resolve(speech('b'));await turn();assert.equal(h.players[1].paused,false);assert.equal(h.w.document.getElementById('spoken').textContent,'b');}finally{h.dom.window.close()}
});
test('旧播放承诺迟到时，不会关闭刚刚启动的新语音',async()=>{
 const h=renderer({deferredPlay:true});try{h.items([event('a')]);h.requests[0].resolve(speech('a'));await turn();h.items([event('b')]);h.requests[1].resolve(speech('b'));await turn();h.players[1].finishPlay();await turn();h.players[0].finishPlay();await turn();assert.equal(h.players[1].paused,false);assert.equal(h.w.document.getElementById('spoken').textContent,'b');}finally{h.dom.window.close()}
});
test('停止播报后迟到合成不会响；已经清空的警报不能重播',async()=>{
 const h=renderer();try{h.items([event('a')]);h.w.document.getElementById('mute').click();h.requests[0].resolve(speech('a'));await turn();assert.equal(h.players.length,0);h.items([]);h.w.document.getElementById('replay').click();await turn();assert.equal(h.requests.length,1);}finally{h.dom.window.close()}
});
test('语音按事件顺序各播报一次，重复刷新队列不会重复播报',async()=>{
 const h=renderer();try{h.items([event('a'),event('b')]);h.requests[0].resolve(speech('a'));await turn();h.items([event('a'),event('b')]);assert.equal(h.requests.length,1);h.players[0].onended();assert.equal(h.requests[1].id,'b');h.requests[1].resolve(speech('b'));await turn();h.players[1].onended();h.items([event('a'),event('b')]);assert.equal(h.requests.length,2);}finally{h.dom.window.close()}
});
test('试听、自动逐条播报与重播均为1.5倍速，保持音高',async()=>{
 const h=renderer();try{
  h.items([event('preview'),event('signal')]);h.requests[0].resolve(speech('试听'));await turn();assert.equal(h.players[0].playbackRate,1.5);assert.equal(h.players[0].preservesPitch,true);h.players[0].onended();h.requests[1].resolve({...speech('自动提醒'),voiceId:'clear-male'});await turn();assert.equal(h.players[1].playbackRate,1.5);assert.equal(h.players[1].preservesPitch,true);h.w.document.getElementById('replay').click();h.requests[2].resolve(speech('重播'));await turn();assert.equal(h.players[2].playbackRate,1.5);assert.equal(h.players[2].preservesPitch,true);assert.match(h.w.document.getElementById('sound').textContent,/1.5倍速/);
 }finally{h.dom.window.close()}
});
test('Windows均线通知点击进入全品种监控，普通到价通知仍进入原盯盘提醒',async()=>{
 const require=createRequire(import.meta.url),directory=await mkdtemp(resolve('output/maintenance-2026-11-03/native-test-')),notifications=[],urls=[];
 class Notice extends EventEmitter{constructor(value){super();this.value=value;notifications.push(this)}static isSupported(){return true}show(){this.emit('show')}}
 const window={isDestroyed:()=>false,isMinimized:()=>false,show(){},focus(){},on(){},loadURL:async u=>urls.push(u)};
 const electron={app:{setAppUserModelId(){}},ipcMain:{handle(){},removeHandler(){}},Notification:Notice,powerMonitor:new EventEmitter(),safeStorage:{isEncryptionAvailable:()=>false},dialog:{},Tray:class{},Menu:{},nativeImage:{}};
 const pending=[{...event('turn'),kind:'ma-turn',triggeredAt:new Date().toISOString()},{...event('price'),kind:'price',triggeredAt:new Date().toISOString()}],module={exports:{}};
 const context={module,require:p=>p==='electron'?electron:p==='./trend-alarm.cjs'?{installTrendAlarm:()=>({isActive:()=>true,push:async()=>true,sync:async()=>{},stop(){}})}:p==='node:child_process'?{spawn:()=>new EventEmitter()}:require(p),process:{...process,env:{...process.env,WUJIAN_MONITOR_HOME:directory}},URL,AbortSignal,setInterval:()=>({unref(){}}),clearInterval(){},setTimeout,clearTimeout,fetch:async url=>({ok:true,json:async()=>url.endsWith('/tq/status')?{managed:true}:url.endsWith('/desktop/pending')?{items:pending}:url.endsWith('/status')?{market:{provider:'sina'}}:{ok:true}})};
 vm.runInNewContext(readFileSync('desktop/monitor.cjs','utf8'),context);
 const monitor=module.exports.installMonitor({base:'http://127.0.0.1:4376',project:resolve('.'),getWindow:()=>window,isQuitting:()=>false,requestQuit(){}});
 try{await monitor.ready;assert.equal(notifications.length,2);notifications[0].emit('click');notifications[1].emit('click');assert.deepEqual(urls,['http://127.0.0.1:4376/market-panorama.html#market/monitor','http://127.0.0.1:4376/?view=monitor&monitorEvent=price']);}finally{await monitor.stop()}
});
