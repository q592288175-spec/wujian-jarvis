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
 const row={code:'MA',watched:true,name:'甲醇',symbol:'CZCE.MA701',sector:'化工',sessionActive:false,quoteAt:new Date().toISOString(),signals:{'1mo':{status:'closed',direction:1,ma:100,previousMa:99},'1w':{status:'ok',direction:-1,ma:98,previousMa:99},'1d':{status:'stale',direction:1},'120m':{status:'ok',direction:0}},alerts:[{id:'new',period:'30m',direction:'long',triggeredAt:new Date().toISOString()},{id:'old',period:'120m',direction:'short',triggeredAt:'2020-01-01T00:00:00Z'}]};
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
 const fetchImpl=async(url,options={})=>{calls.push({url,body:options.body&&JSON.parse(options.body)});return{ok:true,json:async()=>url.endsWith('/catalog')?{items:[{code:'MA',watched:true,name:'甲醇',symbol:'CZCE.MA701'}]}:url.endsWith('/tasks')&&options.method==='POST'?{title:'我的提醒'}:{...status(),revision:++revision}}};
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
  assert.equal(document.querySelector('[data-tm-qr] img').getAttribute('src'),'data:image/png;base64,AAAA');assert.equal(document.querySelector('[data-tm-verify]').hidden,false);
  const form=document.querySelector('[data-tm-verify]');form.elements.code.value='123456';form.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));await turn();await turn();
  const verify=calls.find(c=>c.url.endsWith('/weixin/verify'));assert.deepEqual(verify.body,{id:'local-login',code:'123456'});assert.equal(calls.some(c=>c.url.endsWith('/weixin/test')),false);
 }finally{page.stop();globalThis.document=original;dom.window.close()}
});

test('已绑定点击更换立即打开模态，新扫码不能被旧ready隐藏，取消保留原收件人',async()=>{
 const dom=new JSDOM('<div id="host"></div>',{url:'http://127.0.0.1',pretendToBeVisual:true});const original=globalThis.document;globalThis.document=dom.window.document;
 const host=document.querySelector('#host'),calls=[],old={connected:true,pushReady:true,state:'ready',note:'旧微信可推送',login:{id:'old-login',state:'bound'}};let wx=old,finishLogin;
 const response=value=>({ok:true,json:async()=>value});
 const fetchImpl=async(url,options={})=>{calls.push({url,body:options.body&&JSON.parse(options.body)});if(url.endsWith('/weixin/login'))return new Promise(resolve=>finishLogin=value=>resolve(response(value)));if(url.endsWith('/weixin/login/cancel')){wx=old;return response(wx)}return response(url.endsWith('/catalog')?{items:[]}:{rows:[{code:'MA',name:'甲醇',signals:{}}],weixin:wx,tasks:[],events:[]})};
 const page=createTrendMonitorPage({host,fetchImpl});
 try{
  page.start();await turn();await turn();assert.equal(host.querySelector('[data-tm-login]').textContent,'更换接收微信');host.querySelector('[data-tm-login]').click();
  const dialog=document.querySelector('#trendWeixinDialog');assert.equal(dialog.open,true);assert.match(dialog.textContent,/正在生成二维码/);assert.deepEqual(calls.find(c=>c.url.endsWith('/weixin/login')).body,{replace:true});
  wx={connected:true,pushReady:true,state:'ready',login:{id:'new-login',state:'waiting',qr:'data:image/png;base64,AAAA'}};finishLogin(wx);await turn();await turn();const qr=dialog.querySelector('[data-tm-qr] img');assert.ok(qr);assert.equal(dialog.querySelector('[data-tm-qr]').hidden,false);assert.doesNotMatch(dialog.querySelector('[data-tm-login-status]').textContent,/已确认|已建立|扫码确认成功/);
  await page.refresh();assert.strictEqual(dialog.querySelector('[data-tm-qr] img'),qr);assert.equal(dialog.open,true);assert.equal(host.querySelectorAll('[data-tm-row="MA"]').length,1);
  dialog.querySelector('[data-tm-login-cancel]').click();await turn();await turn();assert.equal(dialog.open,false);assert.deepEqual(calls.find(c=>c.url.endsWith('/weixin/login/cancel')).body,{id:'new-login'});assert.equal(host.querySelector('[data-tm-weixin-label]').textContent,'可推送');assert.equal(calls.some(c=>c.url.endsWith('/weixin/disconnect')),false);
 }finally{page.stop();globalThis.document=original;dom.window.close()}
});

test('模态内显示失败并可重试，过期可重取，新绑定须等待本人消息',async()=>{
 const dom=new JSDOM('<div id="host"></div>',{url:'http://127.0.0.1',pretendToBeVisual:true});const original=globalThis.document;globalThis.document=dom.window.document;
 const host=document.querySelector('#host');let attempts=0,wx={connected:false,pushReady:false,state:'unconfigured'};
 const fetchImpl=async(url,options={})=>{if(url.endsWith('/weixin/login')){if(++attempts===1)throw Error('测试网络故障');wx={connected:false,pushReady:false,state:'waiting',login:{id:'login-'+attempts,state:'waiting',qr:'data:image/png;base64,AAAA'}}}return{ok:true,json:async()=>url.endsWith('/catalog')?{items:[]}:url.endsWith('/weixin/login')||url.endsWith('/weixin/login/cancel')?wx:{weixin:wx,tasks:[],events:[]}}};
 const page=createTrendMonitorPage({host,fetchImpl});
 try{
  page.start();await turn();await turn();host.querySelector('[data-tm-login]').click();await turn();await turn();const dialog=document.querySelector('#trendWeixinDialog');assert.equal(dialog.open,true);assert.match(dialog.querySelector('[data-tm-login-status]').textContent,/二维码生成失败.*网络故障/);assert.equal(dialog.querySelector('[data-tm-login-retry]').hidden,false);
  dialog.querySelector('[data-tm-login-retry]').click();await turn();await turn();assert.equal(attempts,2);assert.equal(dialog.querySelector('[data-tm-qr]').hidden,false);
  wx={...wx,login:{...wx.login,state:'expired'}};await page.refresh();assert.match(dialog.querySelector('[data-tm-login-status]').textContent,/已过期/);assert.equal(dialog.querySelector('[data-tm-login-retry]').hidden,false);assert.equal(dialog.querySelector('[data-tm-qr]').hidden,true);
  dialog.querySelector('[data-tm-login-retry]').click();await turn();await turn();assert.equal(attempts,3);
  wx={connected:true,pushReady:false,state:'waiting-context',login:{...wx.login,state:'bound'}};await page.refresh();assert.match(dialog.querySelector('[data-tm-login-status]').textContent,/请向机器人发一条消息/);assert.equal(dialog.querySelector('[data-tm-qr]').hidden,true);assert.equal(host.querySelector('[data-tm-weixin-test]').disabled,true);
  wx={...wx,pushReady:true,state:'ready'};await page.refresh();assert.match(dialog.querySelector('[data-tm-login-status]').textContent,/推送会话已建立/);assert.equal(host.querySelector('[data-tm-weixin-test]').disabled,false);
 }finally{page.stop();globalThis.document=original;dom.window.close()}
});


test('品种关注按钮立即保存，默认不关注；刷新保留已生效关注，失败不伪称成功',async()=>{
 const dom=new JSDOM('<div id="host"></div>',{url:'http://127.0.0.1',pretendToBeVisual:true}),original=globalThis.document;globalThis.document=dom.window.document;
 const host=document.querySelector('#host'),calls=[],notices=[];let watch={mode:'codes',codes:[],version:0},fail=false;
 const rows=[{code:'CU',name:'沪铜',sector:'有色',watched:false,signals:{}},{code:'MA',name:'甲醇',sector:'化工',watched:false,signals:{}}];
 const fetchImpl=async(url,options={})=>{const body=options.body&&JSON.parse(options.body);calls.push({url,body});if(url.endsWith('/watchlist')){if(fail)throw Error('保存失败');watch={...body,version:watch.version+1};return{ok:true,json:async()=>watch}}return{ok:true,json:async()=>url.endsWith('/catalog')?{items:rows}:{rows,watchlist:watch,tasks:[],events:[],weixin:{}}}};
 const page=createTrendMonitorPage({host,fetchImpl,notify:m=>notices.push(m)});
 try{page.start();await turn();await turn();assert.equal(host.querySelectorAll('[data-tm-sector]').length,12);host.querySelector('[data-tm-sector="化工"]').click();
 assert.equal(host.querySelectorAll('[data-tm-watch-products] input').length,0);assert.equal(host.querySelector('[data-tm-selection-save]'),null);
 let button=host.querySelector('[data-tm-watch-products] [data-tm-follow="MA"]');assert.equal(button.textContent,'关注');button.click();await turn();await turn();
 assert.deepEqual(watch.codes,['MA']);assert.equal(watch.mode,'codes');assert.equal(host.querySelector('[data-tm-watch-products] [data-tm-follow="MA"]').textContent,'已关注');await page.refresh();assert.deepEqual(watch.codes,['MA']);
 fail=true;host.querySelector('[data-tm-watch-products] [data-tm-follow="MA"]').click();await turn();await turn();assert.deepEqual(watch.codes,['MA']);assert.equal(host.querySelector('[data-tm-watch-products] [data-tm-follow="MA"]').textContent,'已关注');assert.ok(notices.includes('保存失败'));
 fail=false;host.querySelector('[data-tm-watch-products] [data-tm-follow="MA"]').click();await turn();await turn();assert.deepEqual(watch.codes,[]);assert.equal(host.querySelector('[data-tm-watch-products] [data-tm-follow="MA"]').textContent,'关注');
 }finally{page.stop();globalThis.document=original;dom.window.close()}
});

test('警报栏同周期只展示最新一次，完整历史仍独立保留',()=>{
 const events=[{id:'old',kind:'ma-turn',period:'30m',direction:'down',triggeredAt:'2026-11-02T10:00:00Z'},{id:'new',kind:'ma-turn',period:'30m',direction:'down',triggeredAt:'2026-11-03T10:00:00Z'},{id:'hour',kind:'ma-turn',period:'120m',direction:'up',triggeredAt:'2026-11-03T10:01:00Z'}];const html=renderTrendUniverse([{code:'SI',name:'工业硅',signals:{},alerts:events}]);assert.doesNotMatch(html,/data-tm-read="old"/);assert.match(html,/data-tm-read="new"/);assert.match(html,/2小时 MA10向上拐头，价格上穿MA10/);assert.equal(new JSDOM(renderTrendEvents(events)).window.document.querySelectorAll('tbody tr').length,3);
});


test('表头直接勾选自动保存；环境与触发分组独立，保存失败保留草稿和真实状态',async()=>{
 const dom=new JSDOM('<div id="host"></div>',{url:'http://127.0.0.1',pretendToBeVisual:true}),original=globalThis.document;globalThis.document=dom.window.document;
 const host=document.querySelector('#host'),calls=[];let task={...defaultTrendDraft(),id:'task1',version:1},fail=false;
 const fetchImpl=async(url,options={})=>{const body=options.body&&JSON.parse(options.body);if(url.endsWith('/tasks/task1')){calls.push(body);if(fail)throw Error('模拟断网');task={...body,id:'task1',version:task.version+1};return{ok:true,json:async()=>task}}return{ok:true,json:async()=>url.endsWith('/catalog')?{items:[]}:{tasks:[task],rows:[],weixin:{}}}};
 const page=createTrendMonitorPage({host,fetchImpl}),settle=()=>new Promise(r=>setTimeout(r,350));
 try{page.start();await turn();await turn();assert.equal(host.querySelectorAll('[data-tm-period]').length,5);
 host.querySelector('[data-tm-period="1w"]').click();await settle();assert.deepEqual(task.bigPeriods,['1d']);assert.equal(task.status,'active');
 host.querySelector('[data-tm-period="1d"]').click();await settle();assert.deepEqual(task.bigPeriods,[]);assert.equal(task.status,'paused');assert.match(host.querySelector('[data-tm-period-state]').textContent,/已暂停/);
 host.querySelector('[data-tm-period="1d"]').click();await settle();host.querySelector('[data-tm-period="120m"]').click();await settle();assert.deepEqual(task.smallPeriods,['30m','120m']);
 host.querySelector('[data-tm-period="30m"]').click();await settle();assert.deepEqual(task.smallPeriods,['120m']);
 fail=true;host.querySelector('[data-tm-period="1mo"]').click();await settle();assert.deepEqual(task.bigPeriods,['1d']);assert.match(host.querySelector('[data-tm-period-state]').textContent,/保存失败.*后台仍按原设置监控/);await page.refresh();assert.equal(host.querySelector('[data-tm-period="1mo"]').checked,true);
 fail=false;host.querySelector('[data-tm-period-retry]').click();await settle();assert.deepEqual(task.bigPeriods,['1d','1mo']);assert.ok(calls.every(c=>typeof c.expectedVersion==='number'));
 }finally{page.stop();globalThis.document=original;dom.window.close()}
});


test('两种语音单选即时显示、服务端确认后保留，失败恢复原音色',async()=>{
 const dom=new JSDOM('<div id="host"></div>',{url:'http://127.0.0.1',pretendToBeVisual:true}),oldDocument=globalThis.document,oldWindow=globalThis.window;globalThis.document=dom.window.document;globalThis.window=dom.window;let selected='taiwan-female',fail=false;const notices=[];
 window.xiaomuMonitor={alarmSettings:async id=>{if(id){if(fail)throw Error('存储失败');selected=id}return{voiceId:selected,mode:'speech'}},testAlarm:async()=>{}};
 const host=document.querySelector('#host'),page=createTrendMonitorPage({host,notify:m=>notices.push(m),fetchImpl:async url=>({ok:true,json:async()=>url.endsWith('/catalog')?{items:[]}:{tasks:[],rows:[],weixin:{}}})});
 try{page.start();await turn();await turn();assert.equal(host.querySelectorAll('[name=tmSound]').length,2);host.querySelector('[name=tmSound][value="clear-male"]').click();await turn();await turn();assert.equal(selected,'clear-male');assert.equal(host.querySelector('[name=tmSound]:checked').value,'clear-male');fail=true;host.querySelector('[name=tmSound][value="taiwan-female"]').click();await turn();await turn();assert.equal(host.querySelector('[name=tmSound]:checked').value,'clear-male');assert.ok(notices.some(n=>n.includes('未保存')));assert.doesNotMatch(host.querySelector('[data-tm-sound-bar]').textContent,/防空|电子|声呐/)}finally{page.stop();globalThis.document=oldDocument;globalThis.window=oldWindow;dom.window.close()}
});
