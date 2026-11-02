import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {MonitorService,monitorMessage} from '../integrations/monitor-service.mjs';
import {MonitorStore} from '../integrations/monitor-store.mjs';
import {validateRule} from '../integrations/monitor-engine.mjs';
import {SinaMonitorFeed} from '../integrations/monitor-sina.mjs';
const at=Date.parse('2026-11-03T09:00:00+08:00'),catalog=[{symbol:'SHFE.FU2701',name:'燃料油',code:'FU',exchange:'SHFE',tickSize:1}];
function service(options={}){const s=new MonitorService({path:':memory:',getCatalog:async()=>catalog,now:()=>at,...options});s.credentials=null;return s}
function child(){const c=new EventEmitter();c.stdin=new PassThrough();c.stdout=new PassThrough();c.stderr=new PassThrough();c.kill=()=>{c.stdin.destroy();c.stdout.destroy();c.stderr.destroy()};return c}

test('趋势订阅与旧规则合并，周期变化也发命令且保留原逗号订阅标识',()=>{
 const s=service(),writes=[];s.provider='tqsdk';const c=child();c.stdin.on('data',v=>writes.push(JSON.parse(String(v))));s.child=c;s.subscription='';
 const old=s.store.saveRule(validateRule({kind:'price',symbols:['SHFE.FU2701'],direction:'up',threshold:100,channels:[]},catalog,at));s.store.setStatus(old.id,'active');
 try{s.setTrendSubscriptions(['CZCE.MA2701'],['30m']);assert.deepEqual(writes.at(-1).symbols,['CZCE.MA701','SHFE.FU2701']);assert.deepEqual(writes.at(-1).trendSymbols,['CZCE.MA701']);assert.deepEqual(writes.at(-1).trendPeriods,['30m']);assert.equal(s.subscription,'CZCE.MA701,SHFE.FU2701');const n=writes.length;s.setTrendSubscriptions(['CZCE.MA2701'],['30m']);assert.equal(writes.length,n);s.setTrendSubscriptions(['CZCE.MA2701'],['60m']);assert.equal(writes.length,n+1);assert.deepEqual(writes.at(-1).trendPeriods,['60m']);assert.equal(s.store.getRule(old.id).status,'active')}finally{s.stop();s.store.close()}
});

test('趋势独立连接保留旧runtime=false，初始配置包含周期且不会spawn真实进程',async()=>{
 const parent=resolve('output/monitor-trend-service-tests');await mkdir(parent,{recursive:true});const root=await mkdtemp(join(parent,'init-'));await mkdir(join(root,'.runtime/python313'),{recursive:true});await writeFile(join(root,'.runtime/python313/python.exe'),'fixture');let calls=0,c;const sent=[];
 const s=service({root,spawnProcess:()=>{calls++;c=child();c.stdin.on('data',v=>sent.push(JSON.parse(String(v))));return c}});s.provider='tqsdk';s.runtime=false;s.credentials={user:'fixture-user',password:'fixture-password'};
 // PassThrough keeps the initial JSON until this consumer is attached.
 try{s.setTrendSubscriptions(['SHFE.FU2701'],['30m','120m']);assert.equal(calls,1);assert.equal(s.runtime,false);assert.deepEqual(sent[0].trendSymbols,['SHFE.FU2701']);assert.deepEqual(sent[0].trendPeriods,['120m','30m']);assert.equal(s.subscription,'SHFE.FU2701');s.setTrendSubscriptions([],[]);assert.equal(s.child,null);assert.equal(s.runtime,false)}finally{s.stop();s.store.close()}
});

test('公开行情趋势连接不启用旧监控规则，仍转发完整只读报价',()=>{
 const s=service(),original=SinaMonitorFeed.prototype.start;SinaMonitorFeed.prototype.start=async function(symbols){this.subscribe(symbols)};s.provider='sina';s.runtime=false;let ingested=0;const received=[];s.engine.ingest=()=>ingested++;s.listeners.add((type,value)=>received.push({type,value}));
 const old=s.store.saveRule(validateRule({kind:'price',symbols:['SHFE.FU2701'],direction:'up',threshold:100,channels:[]},catalog,at));s.store.setStatus(old.id,'active');
 try{s.setTrendSubscriptions(['SHFE.FU2701'],['30m']);assert.ok(s.publicFeed);assert.equal(s.runtime,false);const quote={type:'quote',symbol:'SHFE.FU2701',last:110,quoteAt:new Date(at).toISOString(),sequence:1,sessionActive:true,sessionKey:'day',tradingDay:'2026-11-03',source:'fixture'};s.accept(quote);assert.equal(ingested,0);assert.equal(s.store.events().length,0);assert.equal(s.store.getRule(old.id).status,'active');assert.equal(received.find(x=>x.type==='quote').value.sessionKey,'day');s.accept({type:'trend-bars',symbol:'SHFE.FU2701',bars:{}});s.accept({type:'trend-status',symbol:'SHFE.FU2701',period:'30m',status:'unavailable'});assert.ok(received.some(x=>x.type==='trend-bars'));assert.ok(received.some(x=>x.type==='trend-status'));s.accept({type:'status',status:'connected'});s.disconnect();assert.ok(received.filter(x=>x.type==='reset').length>=2)}finally{s.stop();s.store.close();SinaMonitorFeed.prototype.start=original}
});

test('MA转向通知包含周期、MA与未收线，微信本人收取确认保留',()=>{
 const message=monitorMessage({kind:'ma-turn',name:'燃料油',symbol:'SHFE.FU2701',period:'60m',direction:'up',condition:'周日同向',ma:100.25,price:101,source:'fixture',quoteAt:new Date(at).toISOString(),triggeredAt:new Date(at).toISOString(),label:'新拐头上穿'});assert.match(message,/1小时/);assert.match(message,/MA10：100.25/);assert.match(message,/盘中未收线/);
 const store=new MonitorStore(':memory:');try{store.recordEvent({id:'wx',kind:'ma-turn',channels:['weixin'],triggeredAt:new Date(at).toISOString()});const result=store.confirmDelivery('wx',{channel:'weixin',received:true});assert.equal(result.deliveries[0].receipt.received,true)}finally{store.close()}
});

test('信号状态与事件同事务；写入失败不会消耗信号或留下半条通知',()=>{
 const store=new MonitorStore(':memory:'),event={id:'atomic',ruleId:'trend:t',kind:'ma-turn',channels:['desktop','desktop'],quoteAt:new Date(at).toISOString(),triggeredAt:new Date(at).toISOString()};
 try{store.saveState('trend:t','SHFE.FU2701:30m',{turnId:'old'});assert.throws(()=>store.recordEvent(event,{symbol:'SHFE.FU2701:30m',uniqueKey:'one',state:{turnId:'new',consumed:true}}));assert.equal(store.events().length,0);assert.equal(store.ruleState('trend:t','SHFE.FU2701:30m').turnId,'old');event.channels=['desktop'];assert.equal(store.recordEvent(event,{symbol:'SHFE.FU2701:30m',uniqueKey:'one',state:{turnId:'new',consumed:true}}),true);assert.equal(store.ruleState('trend:t','SHFE.FU2701:30m').turnId,'new');assert.equal(store.ruleState('trend:t','SHFE.FU2701:30m').consumed,true)}finally{store.close()}
});