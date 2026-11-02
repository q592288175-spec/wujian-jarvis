import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {defaultTrendDraft,validateTrendDraft,renderTrendTasks,renderTrendEvents,renderTrendUniverse,createTrendMonitorPage} from '../dist/trend-monitor-ui.js';

const turn=()=>new Promise(resolve=>setImmediate(resolve));

test('默认周日同向与30分钟触发；空周期、空通知与空指定品种不能启用',()=>{
 const draft=defaultTrendDraft();assert.deepEqual(draft.bigPeriods,['1w','1d']);assert.deepEqual(draft.smallPeriods,['30m']);assert.equal(draft.direction,'both');assert.equal(draft.scope,'all');
 assert.throws(()=>validateTrendDraft({...draft,bigPeriods:[]}),/大周期/);
 assert.throws(()=>validateTrendDraft({...draft,smallPeriods:[]}),/触发周期/);
 assert.throws(()=>validateTrendDraft({...draft,channels:[]}),/提醒方式/);
 assert.throws(()=>validateTrendDraft({...draft,scope:'codes'}),/品种/);
 assert.throws(()=>validateTrendDraft({...draft,smallPeriods:['15m']}),/触发周期/);
});

test('任务与事件外部内容转义，测试消息不混为真实触发，通道接受不写本人收到',()=>{
 const task=renderTrendTasks([{...defaultTrendDraft(),id:'x',version:1,title:'<img src=x onerror=alert(1)>'}]);assert.ok(!task.includes('<img'));assert.match(task,/&lt;img/);
 assert.match(renderTrendEvents([{kind:'test',label:'模拟上涨'}]),/尚无新信号/);
 const event=renderTrendEvents([{kind:'ma-turn',name:'<script>bad</script>',direction:'long',period:'30m',price:123,evidence:{ma:120},deliveries:[{channel:'weixin',status:'accepted'}]}]);
 assert.match(event,/盘中未收线/);assert.match(event,/通道已接受/);assert.doesNotMatch(event,/<script>|本人已收到/);
});

test('全品种表只显示服务端MA10方向，休市保留方向，默认无1小时列，旧警报不闪烁',()=>{
 const row={code:'MA',name:'甲醇',symbol:'CZCE.MA701',sector:'化工',sessionActive:false,quoteAt:new Date().toISOString(),signals:{'1mo':{status:'closed',direction:1,ma:100,previousMa:99},'1w':{status:'ok',direction:-1,ma:98,previousMa:99},'1d':{status:'stale',direction:1},'120m':{status:'ok',direction:0}},alerts:[{id:'new',period:'30m',direction:'long',triggeredAt:new Date().toISOString()},{id:'old',period:'120m',direction:'short',triggeredAt:'2020-01-01T00:00:00Z'}]};
 const doc=new JSDOM(renderTrendUniverse([row])).window.document;
 assert.equal(doc.querySelectorAll('tbody tr').length,1);assert.match(doc.body.textContent,/休市/);assert.match(doc.body.textContent,/↑ 向上/);assert.match(doc.body.textContent,/↓ 向下/);assert.match(doc.body.textContent,/陈旧/);assert.match(doc.body.textContent,/走平/);
 assert.ok(![...doc.querySelectorAll('th')].some(t=>t.textContent.startsWith('1小时')));assert.equal(doc.querySelector('[data-tm-read="new"]').classList.contains('tm-alert-unread'),true);assert.equal(doc.querySelector('[data-tm-read="old"]').classList.contains('tm-alert-unread'),false);
 assert.match(renderTrendUniverse([row],{hour:true}),/1小时/);assert.match(renderTrendUniverse([row],{search:'不存在'}),/当前筛选没有品种/);
});

test('点击行警报标记已读，停止闪烁并保留事件',async()=>{
 const dom=new JSDOM('<div id="host"></div>',{url:'http://127.0.0.1',pretendToBeVisual:true});const original=globalThis.document;globalThis.document=dom.window.document;
 const host=document.querySelector('#host'),calls=[],event={id:'event-1',period:'30m',direction:'long',triggeredAt:new Date().toISOString()},rows=[{code:'MA',name:'甲醇',sector:'化工',signals:{},alerts:[event]}];
 const fetchImpl=async(url,options={})=>{calls.push(url);if(url.endsWith('/events/event-1/read'))event.readAt=new Date().toISOString();return{ok:true,json:async()=>url.endsWith('/catalog')?{items:[]}:url.endsWith('/events/event-1/read')?event:{rows,tasks:[],events:[],weixin:{state:'unconfigured'}}}};
 const page=createTrendMonitorPage({host,fetchImpl});
 try{page.start();await turn();await turn();assert.equal(host.querySelector('.tm-settings').open,false);assert.equal(host.querySelector('.tm-event-history').open,false);host.querySelector('[data-tm-read="event-1"]').click();await turn();await turn();assert.ok(calls.some(u=>u.endsWith('/events/event-1/read')));assert.equal(host.querySelectorAll('[data-tm-read="event-1"]').length,1);assert.equal(host.querySelector('[data-tm-read="event-1"]').classList.contains('tm-alert-unread'),false);assert.match(host.querySelector('[data-tm-read="event-1"]').textContent,/已读/)}finally{page.stop();globalThis.document=original;dom.window.close()}
});

test('轮询只更新状态区，保留未保存条件；保存才调用启用接口并明确缺口',async()=>{
 const dom=new JSDOM('<div id="host"></div>',{url:'http://127.0.0.1',pretendToBeVisual:true});
 const original=globalThis.document;globalThis.document=dom.window.document;
 const calls=[],notices=[],host=document.querySelector('#host');let revision=0;
 const status=()=>({tasks:[],observations:[{code:'MA',name:'甲醇',period:'30m',status:'waiting-data',reason:'分钟K线未取得'}],market:{status:'disconnected',message:'公开行情暂不可用',source:'新浪公开行情'},coverage:{catalog:87,observed:0},weixin:{state:'unconfigured',note:'请扫码绑定'},events:[]});
 const fetchImpl=async(url,options={})=>{calls.push({url,body:options.body&&JSON.parse(options.body)});return{ok:true,json:async()=>url.endsWith('/catalog')?{items:[{code:'MA',name:'甲醇',symbol:'CZCE.MA701'}]}:url.endsWith('/tasks')&&options.method==='POST'?{title:'我的提醒'}:{...status(),revision:++revision}}};
 const page=createTrendMonitorPage({host,notify:text=>notices.push(text),fetchImpl});
 try{
  page.start();await turn();await turn();
  const form=host.querySelector('#trendTaskForm');form.elements.title.value='尚未保存的条件';form.querySelector('[name="smallPeriods"][value="60m"]').checked=true;
  await page.refresh();assert.equal(form.elements.title.value,'尚未保存的条件');assert.equal(form.querySelector('[name="smallPeriods"][value="60m"]').checked,true);
  assert.match(host.querySelector('[data-tm-runtime]').textContent,/公开行情暂不可用/);assert.equal(host.querySelector('.tm-connected'),null);
  assert.match(host.querySelector('[data-tm-gaps]').textContent,/分钟K线未取得/);assert.equal(calls.filter(c=>c.body).length,0);
  form.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));await turn();await turn();
  const saved=calls.find(c=>c.url.endsWith('/tasks')&&c.body);assert.equal(saved.body.status,'active');assert.equal(saved.body.title,'尚未保存的条件');assert.deepEqual(saved.body.smallPeriods,['30m','60m']);assert.ok(notices.some(s=>s.includes('已保存并启用')));
 }finally{page.stop();globalThis.document=original;dom.window.close()}
});

test('微信扫码只用本机返回二维码，验证码带绑定id，未建推送会话不能测试发送',async()=>{
 const dom=new JSDOM('<div id="host"></div>',{url:'http://127.0.0.1',pretendToBeVisual:true});const original=globalThis.document;globalThis.document=dom.window.document;
 const host=document.querySelector('#host'),calls=[];let wx={connected:false,pushReady:false,state:'unconfigured',note:'未绑定'};
 const fetchImpl=async(url,options={})=>{calls.push({url,body:options.body&&JSON.parse(options.body)});if(url.endsWith('/weixin/login'))wx={connected:false,pushReady:false,state:'waiting',note:'等待扫码',login:{id:'local-login',state:'need_verifycode',needsCode:true,qr:'data:image/png;base64,AAAA'}};return{ok:true,json:async()=>url.endsWith('/catalog')?{items:[]}:url.endsWith('/weixin/login')?wx:{weixin:wx,tasks:[],events:[]}}};
 const page=createTrendMonitorPage({host,fetchImpl});
 try{
  page.start();await turn();await turn();assert.equal(host.querySelector('[data-tm-weixin-test]').disabled,true);
  host.querySelector('[data-tm-login]').click();await turn();await turn();
  assert.equal(host.querySelector('[data-tm-qr] img').getAttribute('src'),'data:image/png;base64,AAAA');assert.equal(host.querySelector('[data-tm-verify]').hidden,false);
  const form=host.querySelector('[data-tm-verify]');form.elements.code.value='123456';form.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));await turn();await turn();
  const verify=calls.find(c=>c.url.endsWith('/weixin/verify'));assert.deepEqual(verify.body,{id:'local-login',code:'123456'});assert.equal(calls.some(c=>c.url.endsWith('/weixin/test')),false);
 }finally{page.stop();globalThis.document=original;dom.window.close()}
});
