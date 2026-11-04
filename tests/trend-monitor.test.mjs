import test from 'node:test';
import assert from 'node:assert/strict';
import {MonitorStore} from '../integrations/monitor-store.mjs';
import {defaultTrendTask,validateTrendTask,evaluateTrend,aggregateTrendDaily,intrabarMaSignal} from '../integrations/trend-monitor-engine.mjs';
import {createTrendMonitorService} from '../integrations/trend-monitor-service.mjs';

const START=Date.parse('2026-11-03T09:45:00+08:00');
function history(long=true){
 const days=[];let d=new Date('2026-11-03T00:00:00Z');
 while(days.length<390){if(![0,6].includes(d.getUTCDay()))days.push(d.toISOString().slice(0,10));d.setUTCDate(d.getUTCDate()-1);}
 return days.reverse().map((date,i)=>({stamp:date+'T09:00:00+08:00',date,close:long?40+i*.1:200-(40+i*.1),complete:i<389}));
}
function fixture(long=true,options={}){
 let now=START,sequence=0;const daily=history(long),small=[long?90:110,...Array(9).fill(long?110:90)].map((close,i)=>({stamp:new Date(START-(10-i)*30*60000).toISOString(),close,complete:true}));
 small.push({stamp:new Date(START-15*60000).toISOString(),close:100,complete:false});
 const task={...validateTrendTask({...defaultTrendTask(),...options}),id:'task-1',version:1};let state={};
 const frame=(price,delta=1000,extra={})=>{now+=delta;return{symbol:'SHFE.CU2701',code:'CU',name:'沪铜',source:'TqSdk',bars:{'1d':daily,'30m':small,'60m':small,'120m':small},quote:{last:price,quoteAt:new Date(now).toISOString(),receivedAt:new Date(now).toISOString(),sequence:++sequence,sessionActive:true,sessionKey:'2026-11-03:day:09:00',tradingDay:'2026-11-03'},...extra};};
 const ingest=(price,delta=1000,extra={})=>{const f=frame(price,delta,extra),result=evaluateTrend({task,frame:f,period:'30m',state,now,generation:'session'});state=result.state;return result};
 return{task,frame,ingest,clock:()=>now,getState:()=>state,setState:v=>{state=v}};
}

test('任务只接受明确的方向、小周期和通道，不附加流动性门槛',()=>{
 const task=validateTrendTask(defaultTrendTask());assert.deepEqual(task.bigPeriods,['1w','1d']);assert.deepEqual(task.smallPeriods,['30m']);assert.equal(task.mode,'intrabar');
 for(const input of [{bigPeriods:[]},{smallPeriods:['5m']},{direction:'auto'},{scope:'codes',codes:[]},{channels:['sms']},{codes:['CU2701']}])assert.throws(()=>validateTrendTask({...defaultTrendTask(),...input}));
 assert.deepEqual(validateTrendTask({...defaultTrendTask(),scope:'codes',codes:['cu','CU'],smallPeriods:['120m','60m','30m']}).codes,['CU']);
});

test('默认不关注；旧自动全选迁移为空并留底，原明确选择保留',async()=>{
 for(const previous of [null,{mode:'all',codes:[],version:7},{mode:'codes',codes:['CU'],version:4}]){
  const store=new MonitorStore(':memory:');if(previous)store.setMeta('trend-monitor:watchlist',previous);
  const service=createTrendMonitorService({store,getCatalog:async()=>[{code:'CU',symbol:'SHFE.CU2701',name:'沪铜'}]});
  try{await service.start();assert.equal(service.watchlist().mode,'codes');assert.deepEqual(service.watchlist().codes,previous?.mode==='codes'?['CU']:[]);assert.equal(service.subscriptions().enabled,previous?.mode==='codes');assert.deepEqual(store.meta('trend-monitor:watchlist-before-follow-only-v1'),previous);const version=service.watchlist().version;service.watchlist();assert.equal(service.watchlist().version,version)}finally{service.stop();store.close()}
 }
});

test('不同任务、方向共享每品种周期的一小时间隔，不同周期各自提醒',async()=>{
 const store=new MonitorStore(':memory:'),x=fixture(),service=createTrendMonitorService({store,now:x.clock,getCatalog:async()=>[{code:'CU',symbol:'SHFE.CU2701',name:'沪铜'}]});
 try{await service.start();assert.equal(service.ingest(x.frame(89)).accepted,false);assert.equal(store.events().length,0);
  service.saveWatchlist({mode:'codes',codes:['CU'],version:service.watchlist().version});
  const first=service.tasks()[0];service.save({...first,smallPeriods:['30m','120m']},first.id);service.save({...first,title:'第二个重叠任务',smallPeriods:['30m','120m']});
  service.ingest(x.frame(89));assert.equal(service.ingest(x.frame(111)).events.length,2);assert.equal(store.events().length,2);
  service.ingest(x.frame(89));assert.equal(service.ingest(x.frame(111)).events.length,0);assert.equal(store.events().length,2);
  service.reset();service.ingest(x.frame(89));assert.equal(service.ingest(x.frame(111)).events.length,0);
  assert.equal(service.status().alertIntervalMs,3600000);
  service.saveWatchlist({mode:'codes',codes:[],version:service.watchlist().version});assert.equal(service.subscriptions().enabled,false);assert.equal(service.ingest(x.frame(111)).accepted,false);assert.equal(store.pending('desktop',x.clock()).length,0);assert.equal(store.pending('weixin',x.clock()).length,0);assert.equal(store.events().length,2,'取消关注保留事件历史');
 }finally{service.stop();store.close()}
});

test('一小时边界严格到毫秒；换合约、反向不重置，其他品种周期独立',()=>{
 const store=new MonitorStore(':memory:'),at=START;
 const emit=(id,time,{code='CU',period='30m',symbol='SHFE.CU2701',direction='up'}={})=>store.recordEvent({id,kind:'ma-turn',code,period,symbol,direction,triggeredAt:new Date(time).toISOString(),channels:[]},{cooldownKey:'trend-alert-hour:'+code+':'+period,cooldownMs:3600000});
 try{assert.equal(emit('one',at),true);assert.equal(emit('edge-before',at+3599999),false);assert.equal(emit('opposite-roll',at+3000,{symbol:'SHFE.CU2705',direction:'down'}),false);assert.equal(emit('other-period',at+3000,{period:'120m'}),true);assert.equal(emit('other-code',at+3000,{code:'AL',symbol:'SHFE.AL2701'}),true);assert.equal(emit('edge',at+3600000),true)}finally{store.close()}
});

test('小时锁与事件、通知同事务，写入失败不消耗提醒额度',()=>{
 const store=new MonitorStore(':memory:'),event={id:'broken',kind:'ma-turn',code:'CU',period:'30m',triggeredAt:new Date(START).toISOString(),channels:['desktop','desktop']},options={cooldownKey:'trend-alert-hour:CU:30m',cooldownMs:3600000};
 try{assert.throws(()=>store.recordEvent(event,options));assert.equal(store.meta(options.cooldownKey),null);assert.equal(store.events().length,0);event.channels=['desktop'];assert.equal(store.recordEvent(event,options),true);assert.equal(store.meta(options.cooldownKey),START)}finally{store.close()}
});

test('升级前已发信号也占用小时额度，不能靠新任务绕过',()=>{
 const store=new MonitorStore(':memory:');
 try{store.recordEvent({id:'old',kind:'ma-turn',code:'CU',period:'30m',triggeredAt:new Date(START).toISOString(),channels:[]});assert.equal(store.recordEvent({id:'new',kind:'ma-turn',code:'CU',period:'30m',triggeredAt:new Date(START+1000).toISOString(),channels:[]},{cooldownKey:'trend-alert-hour:CU:30m',cooldownMs:3600000}),false)}finally{store.close()}
});

test('月周日按交易日期聚合，当前周期未收线；月样本不足保持缺口',()=>{
 for(const period of ['1mo','1w','1d']){const result=aggregateTrendDaily(history(),period,'2026-11-03');assert.ok(result.rows?.length>=11);assert.equal(result.rows.at(-1).complete,false);assert.equal(result.rows.at(-1).date,'2026-11-03')}
 assert.match(aggregateTrendDaily(history().slice(-40),'1mo','2026-11-03').error,/不足/);
 assert.match(aggregateTrendDaily(history(),'1w','2026-11-02').error,/未来/);
});

test('实时EMA10使用全部完成收盘递推，再代入当前报价一次，原序列不被改写',()=>{
 const x=fixture(),f=x.frame(95),before=JSON.stringify(f.bars['30m']);const signal=intrabarMaSignal(f.bars['30m'],95,f.quote.quoteAt);
 const previous=110-20*Math.pow(9/11,9);assert.ok(Math.abs(signal.previousMa-previous)<1e-10);assert.ok(Math.abs(signal.ma-(previous+2/11*(95-previous)))<1e-10);assert.equal(signal.direction,-1);assert.equal(signal.relation,-1);assert.equal(JSON.stringify(f.bars['30m']),before);
});

test('分钟K线显式区分开始与结束时间，形成K可用真实未来结束时间标记',()=>{
 const x=fixture(),f=x.frame(95),rows=f.bars['30m'];
 const ended=rows.map((bar,i)=>({...bar,stampKind:'end',...(i===10?{stamp:'2026-11-03T10:00:00+08:00',endStamp:'2026-11-03T10:00:00+08:00'}:{})}));
 assert.equal(intrabarMaSignal(ended,95,f.quote.quoteAt).status,'ok');
 assert.equal(intrabarMaSignal(ended,95,'2026-11-03T10:00:00+08:00').status,'missing');
 const started=rows.map((bar,i)=>({...bar,...(i===10?{endStamp:'2026-11-03T10:00:00+08:00'}:{})}));
 assert.equal(intrabarMaSignal(started,95,f.quote.quoteAt).status,'ok');
 assert.equal(intrabarMaSignal(started,95,'2026-11-03T10:00:00+08:00').status,'missing');
});

test('多空镜像：EMA拐头与穿越同笔成立，一轮信号只提醒一次，保留真实输入依据',()=>{
 for(const long of [true,false]){
  const x=fixture(long),prices=long?[89,95,111]:[111,105,89];
  assert.equal(x.ingest(prices[0]).observation.status,'baseline');
  const turn=x.ingest(prices[1]);assert.equal(turn.event,null);assert.equal(turn.observation.status,'waiting-turn');
  const result=x.ingest(prices[2]);assert.equal(result.event.kind,'ma-turn');assert.equal(result.event.direction,long?'up':'down');assert.equal(result.event.evidence.unclosed,true);assert.ok(result.event.evidence.smallSignal.closes.length===10);assert.match(result.event.label,/盘中未收线/);
  assert.equal(x.ingest(prices[2]).event,null);
  x.ingest(long?112:88);assert.equal(x.ingest(prices[2]).event,null,'同向走势中不重复提醒');
  x.ingest(prices[0]);const again=x.ingest(prices[2]);assert.ok(again.event);assert.notEqual(result.uniqueKey,again.uniqueKey);
 }
});

test('拐头与穿线同一笔可提醒，首次已满足不补报，反向后新拐头可提醒',()=>{
 const x=fixture();x.ingest(89);assert.ok(x.ingest(111).event);
 const y=fixture();assert.equal(y.ingest(111).event,null);assert.equal(y.ingest(112).event,null);y.ingest(95);assert.ok(y.ingest(111).event);
});

test('大周期不符、任意所选周期缺数、未来K、无当前K均暂停',()=>{
 const x=fixture(true,{direction:'short'});assert.equal(x.ingest(89).observation.status,'waiting-direction');assert.equal(x.ingest(111).event,null);
 const y=fixture();y.ingest(89);const good=y.frame(111);
 for(const bars of [{...good.bars,'30m':good.bars['30m'].slice(-5)},{...good.bars,'1d':good.bars['1d'].slice(-5)},{...good.bars,'30m':good.bars['30m'].map(b=>({...b,complete:true}))},{...good.bars,'30m':good.bars['30m'].map((b,i)=>i===10?{...b,stamp:'2026-11-03T12:00:00+08:00'}:b)}]){
  assert.equal(evaluateTrend({task:y.task,frame:{...good,bars},period:'30m',state:y.getState(),now:y.clock(),generation:'session'}).event,null);
  assert.equal(evaluateTrend({task:y.task,frame:{...good,bars},period:'30m',state:y.getState(),now:y.clock(),generation:'session'}).observation.status,'waiting-data');
 }
});

test('陈旧、未来、休市、重复乱序及无序号报价不触发；断线恢复先建立基线',()=>{
 const x=fixture();x.ingest(89);const raw=x.frame(111);
 for(const quote of [{...raw.quote,quoteAt:new Date(x.clock()-31000).toISOString()},{...raw.quote,quoteAt:new Date(x.clock()+2000).toISOString()},{...raw.quote,sessionActive:false},{...raw.quote,sequence:null},{...raw.quote,last:Infinity},{...raw.quote,sequence:0,quoteAt:x.getState().quoteAt}])assert.equal(evaluateTrend({task:x.task,frame:{...raw,quote},period:'30m',state:x.getState(),now:x.clock(),generation:'session'}).event,null);
 assert.equal(x.ingest(111,31000).observation.status,'baseline');assert.equal(x.ingest(112).event,null);
 x.ingest(89);assert.ok(x.ingest(111).event);
});

test('会话变化、代际变化、换合约和版本变化均不继承旧穿越',()=>{
 const x=fixture();x.ingest(89);const raw=x.frame(111),state=x.getState();
 for(const [frame,task,generation]of [[{...raw,symbol:'SHFE.CU2705'},x.task,'session'],[{...raw,quote:{...raw.quote,sessionKey:'night'}},x.task,'session'],[raw,{...x.task,version:2},'session'],[raw,x.task,'restart']]){
  const result=evaluateTrend({task,frame,period:'30m',state,now:x.clock(),generation});assert.equal(result.event,null);assert.equal(result.observation.status,'baseline');
 }
});

test('三个小周期独立计算；已选择的大周期必须全部同向',()=>{
 const x=fixture(true,{bigPeriods:['1mo','1w','1d'],smallPeriods:['30m','60m','120m']});
 const first=x.frame(89),second=x.frame(111);
 for(const period of ['30m','60m','120m']){const result=evaluateTrend({task:x.task,frame:first,period,now:x.clock()-1000,generation:'one'});assert.ok(evaluateTrend({task:x.task,frame:second,period,state:result.state,now:x.clock(),generation:'one'}).event)}
});

test('服务首次默认任务只建一次，事件与桌面/微信投递原子保存，重启不补报',async()=>{
 const store=new MonitorStore(':memory:'),x=fixture(),catalog=[{symbol:'SHFE.CU2701',code:'CU',name:'沪铜'}];const events=[],subscriptions=[];
 const options={store,now:x.clock,getCatalog:async()=>catalog,onEvent:e=>events.push(e),onSubscriptions:s=>subscriptions.push(s)};
 const service=createTrendMonitorService(options);await service.start();service.saveWatchlist({mode:'codes',codes:service.catalogItems.map(p=>p.code),version:service.watchlist().version});assert.equal(service.tasks().length,1);assert.equal(service.subscriptions().symbols.length,1);
 service.ingest(x.frame(89));service.ingest(x.frame(95));assert.equal(service.ingest(x.frame(111)).events.length,1);assert.equal(events.length,1);
 assert.deepEqual(store.events()[0].deliveries.map(d=>d.channel).sort(),['desktop','weixin']);assert.equal(store.pending('weixin').length,1);
 service.stop();const restarted=createTrendMonitorService(options);await restarted.start();assert.equal(restarted.tasks().length,1);assert.equal(restarted.ingest(x.frame(112)).events.length,0);
 const task=restarted.tasks()[0];restarted.setStatus(task.id,'paused');assert.equal(restarted.subscriptions().symbols.length,0);assert.equal(restarted.ingest(x.frame(89)).events.length,0);
 restarted.setStatus(task.id,'active');assert.equal(restarted.ingest(x.frame(111)).events.length,0);
 restarted.setStatus(task.id,'archived');restarted.stop();const again=createTrendMonitorService(options);await again.start();assert.equal(again.tasks().length,1);assert.equal(again.tasks()[0].status,'archived');again.stop();store.close();
});

test('服务按当前具体主力跟踪，换月不借用旧合约的EMA10状态',async()=>{
 const store=new MonitorStore(':memory:'),x=fixture();let contract='CU2701';
 const service=createTrendMonitorService({store,now:x.clock,getCatalog:async()=>[{symbol:'SHFE.'+contract,code:'CU',name:'沪铜'}]});await service.start();service.saveWatchlist({mode:'codes',codes:service.catalogItems.map(p=>p.code),version:service.watchlist().version});service.ingest(x.frame(89));
 contract='CU2705';await service.refreshCatalog();assert.equal(service.ingest(x.frame(111)).accepted,false);
 assert.equal(service.ingest({...x.frame(111),symbol:'SHFE.CU2705'}).events.length,0);service.stop();store.close();
});

test('编辑任务保留旧版本并重新建立基线，不产生交易规则或账户写入',async()=>{
 const store=new MonitorStore(':memory:'),x=fixture(),service=createTrendMonitorService({store,now:x.clock,getCatalog:async()=>[{symbol:'SHFE.CU2701',code:'CU',name:'沪铜'}]});await service.start();service.saveWatchlist({mode:'codes',codes:service.catalogItems.map(p=>p.code),version:service.watchlist().version});const first=service.tasks()[0];service.ingest(x.frame(89));
 const second=service.save({...first,title:'更新',smallPeriods:['60m']},first.id);assert.equal(second.version,2);assert.equal(store.meta('trend-monitor:versions:'+first.id).length,2);
 assert.equal(service.ingest(x.frame(111)).events.length,0);assert.equal(store.rules().length,0);service.stop();store.close();
});

test('事件写入失败时检测状态一并回滚，重试仍可生成本轮信号',async()=>{
 const store=new MonitorStore(':memory:'),x=fixture(),service=createTrendMonitorService({store,now:x.clock,getCatalog:async()=>[{symbol:'SHFE.CU2701',code:'CU',name:'沪铜'}]});await service.start();service.saveWatchlist({mode:'codes',codes:service.catalogItems.map(p=>p.code),version:service.watchlist().version});
 service.ingest(x.frame(89));service.ingest(x.frame(95));
 const task=service.tasks()[0],key='SHFE.CU2701:30m',before=store.ruleState('trend:'+task.id,key);
 const save=store.saveState;store.saveState=function(){throw Error('disk full')};
 assert.throws(()=>service.ingest(x.frame(111)),/disk full/);store.saveState=save;
 assert.deepEqual(store.ruleState('trend:'+task.id,key),before);assert.equal(store.events().length,0);assert.equal(store.pending('weixin').length,0);
 assert.equal(service.ingest(x.frame(112)).events.length,1);assert.equal(store.ruleState('trend:'+task.id,key).triggered,true);
 service.stop();store.close();
});


test('关注名单真正约束订阅与触发：全不选停止，重新选中先建基线，旧版本不得覆盖',async()=>{
 const store=new MonitorStore(':memory:'),x=fixture(),service=createTrendMonitorService({store,now:x.clock,getCatalog:async()=>[{symbol:'SHFE.CU2701',code:'CU',name:'沪铜'},{symbol:'SHFE.AL2701',code:'AL',name:'沪铝'}]});await service.start();
 assert.equal(service.subscriptions().symbols.length,0);
 service.saveWatchlist({mode:'codes',codes:['AL'],version:0});assert.deepEqual(service.subscriptions().symbols,['SHFE.AL2701']);assert.equal(service.ingest(x.frame(89)).accepted,false);assert.equal(service.ingest(x.frame(111)).events.length,0);
 assert.throws(()=>service.saveWatchlist({mode:'all',codes:[],version:0}),/已更新/);
 service.saveWatchlist({mode:'codes',codes:[],version:1});assert.deepEqual(service.subscriptions().symbols,[]);
 service.saveWatchlist({mode:'codes',codes:['CU'],version:2});assert.equal(service.ingest(x.frame(111)).events.length,0);service.ingest(x.frame(89));assert.equal(service.ingest(x.frame(111)).events.length,1);
 service.stop();const restarted=createTrendMonitorService({store,now:x.clock,getCatalog:async()=>[{symbol:'SHFE.CU2701',code:'CU',name:'沪铜'},{symbol:'SHFE.AL2701',code:'AL',name:'沪铝'}]});await restarted.start();assert.deepEqual(restarted.watchlist().codes,['CU']);assert.deepEqual(restarted.subscriptions().symbols,['SHFE.CU2701']);restarted.stop();store.close();
});

test('30分钟及2小时警报明确指出EMA10拐头方向和价格穿越，多空镜像且只存一次',()=>{
 for(const long of [true,false])for(const period of ['30m','120m']){const x=fixture(long);const a=x.frame(long?89:111),b=x.frame(long?111:89);const baseline=evaluateTrend({task:x.task,frame:a,period,now:x.clock()-1000,generation:'qa'});const result=evaluateTrend({task:x.task,frame:b,period,state:baseline.state,now:x.clock(),generation:'qa'});assert.match(result.event.condition,long?/EMA10向上拐头且价格上穿EMA10/:/EMA10向下拐头且价格下穿EMA10/);assert.ok(result.event.label.includes(period==='120m'?'2小时':'30分钟'));}
});


test('表头取消环境或触发周期只保存为暂停，不能绕过启用校验；过期版本拒绝覆盖',async()=>{
 const store=new MonitorStore(':memory:'),service=createTrendMonitorService({store,getCatalog:async()=>[{symbol:'SHFE.CU2701',code:'CU',name:'沪铜'}]});await service.start();service.saveWatchlist({mode:'codes',codes:service.catalogItems.map(p=>p.code),version:service.watchlist().version});const first=service.tasks()[0];
 let current=service.save({...first,bigPeriods:[],status:'paused',expectedVersion:first.version},first.id);
 assert.deepEqual(service.subscriptions().symbols,[]);assert.throws(()=>service.setStatus(first.id,'active'),/方向周期/);
 assert.throws(()=>service.save({...first,expectedVersion:first.version},first.id),/其他位置更新/);
 current=service.save({...current,bigPeriods:['1d'],smallPeriods:['120m'],status:'active',expectedVersion:current.version},first.id);assert.deepEqual(service.subscriptions().periods,['120m']);
 current=service.save({...current,smallPeriods:[],status:'paused',expectedVersion:current.version},first.id);assert.throws(()=>service.setStatus(first.id,'active'),/提醒周期/);assert.deepEqual(service.subscriptions().symbols,[]);
 service.setStatus(first.id,'archived');service.stop();store.close();
});


test('启用统一量仓硬门时任一项不达标不计算信号，再次达标先重建基线',async()=>{
 const {hasLiquidity}=await import('../dist/liquidity.js');const store=new MonitorStore(':memory:'),x=fixture(),service=createTrendMonitorService({store,now:x.clock,getCatalog:async()=>[{symbol:'SHFE.CU2701',code:'CU',name:'沪铜'}],eligible:f=>hasLiquidity(f.quote)});await service.start();service.saveWatchlist({mode:'codes',codes:service.catalogItems.map(p=>p.code),version:service.watchlist().version});const frame=(price,volume=20000,interest=20000)=>{const f=x.frame(price);f.quote={...f.quote,volume,interest};return f};
 assert.equal(service.ingest(frame(89)).events.length,0);assert.equal(service.ingest(frame(111,10000)).accepted,false);assert.equal(service.ingest(frame(111)).events.length,0,'恢复达标不能继承门槛外穿线');service.ingest(frame(89));assert.equal(service.ingest(frame(111)).events.length,1);assert.equal(service.ingest(frame(89,20000,10000)).accepted,false);assert.equal(service.ingest(frame(111)).events.length,0);service.stop();store.close();
});

test('小时提醒额度跨数据库重开持久保存，取消再关注不重置',async()=>{
 const {mkdir,mkdtemp}=await import('node:fs/promises'),{join,resolve}=await import('node:path');const parent=resolve('output/follow-hour-tests');await mkdir(parent,{recursive:true});const root=await mkdtemp(join(parent,'restart-')),file=join(root,'monitor.sqlite');
 let store=new MonitorStore(file);const event={id:'first',kind:'ma-turn',code:'CU',period:'30m',triggeredAt:new Date(START).toISOString(),channels:[]},options={cooldownKey:'trend-alert-hour:CU:30m',cooldownMs:3600000};
 assert.equal(store.recordEvent(event,options),true);store.close();store=new MonitorStore(file);
 try{assert.equal(store.recordEvent({...event,id:'after-restart',triggeredAt:new Date(START+5000).toISOString()},options),false);assert.equal(store.events().length,1)}finally{store.close()}
});