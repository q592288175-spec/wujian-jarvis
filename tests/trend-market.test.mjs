import test from 'node:test';
import assert from 'node:assert/strict';
import {parseTrendKlines,publicTrendFrame,TrendMarketFeed} from '../integrations/trend-market.mjs';
import {intrabarMaSignal} from '../integrations/trend-monitor-engine.mjs';
import {MonitorStore} from '../integrations/monitor-store.mjs';
import {TrendMonitorService} from '../integrations/trend-monitor-service.mjs';

const jsonp=value=>'/*not executable*/ var _x=('+JSON.stringify(value)+');';
const raw=Array.from({length:13},(_,i)=>({d:'2026-11-02 '+String(9+Math.floor(i/2)).padStart(2,'0')+':'+(i%2?'30':'00')+':00',o:'100',h:'102',l:'98',c:String(100+i/10)}));
test('public K parser uses close, accepts real endpoint end stamps and rejects malformed data',()=>{
 const parsed=parseTrendKlines(jsonp(raw),'30m');assert.equal(parsed.length,13);assert.equal(parsed[0].close,100);assert.equal(parsed[0].stampKind,'end');
 assert.throws(()=>parseTrendKlines('alert(1)','30m'));
 assert.throws(()=>parseTrendKlines(jsonp([{...raw[0],c:'nan'}]),'30m'));
 assert.throws(()=>parseTrendKlines(jsonp([raw[0],raw[0]]),'30m'));
 assert.throws(()=>parseTrendKlines(jsonp(raw),'5m'));
});

test('public frame uses verified trading day and current end-stamped candle; never extrapolates old minute data',()=>{
 const daily=Array.from({length:12},(_,i)=>({stamp:`2026-10-${20+i}T00:00:00+08:00`,date:`2026-10-${20+i}`,close:100+i}));
 daily.at(-1).date='2026-11-02';daily.at(-1).stamp='2026-11-02T00:00:00+08:00';
 const quote={last:120,quoteAt:'2026-11-02T15:15:00+08:00',tradingDay:'2026-11-03',sessionKey:'2026-11-02:night',sessionActive:true};
 const member={symbol:'SHFE.AU2612',code:'AU',name:'黄金'};
 const frame=publicTrendFrame(member,quote,{'1d':daily,'30m':parseTrendKlines(jsonp(raw),'30m')},['2026-11-02','2026-11-03']);
 assert.equal(frame.bars['1d'].at(-1).date,'2026-11-03');
 // No artificial minute bar is created after the last provider candle ended.
 assert.equal(frame.bars['30m'],undefined);
 assert.match(publicTrendFrame(member,quote,{'1d':daily.slice(0,-1)},['2026-11-02','2026-11-03']).error,/前一个交易日/);
});

test('current provider end time can be in the future; only that forming close is overlaid with current quote',()=>{
 const quote={last:115,quoteAt:'2026-11-02T14:45:00+08:00',tradingDay:'2026-11-02',sessionKey:'2026-11-02:day:810',sessionActive:true};
 const daily=Array.from({length:12},(_,i)=>({stamp:`2026-10-${20+i}T00:00:00+08:00`,date:`2026-10-${20+i}`,close:100+i}));
 daily.at(-1).date='2026-10-30';daily.at(-1).stamp='2026-10-30T00:00:00+08:00';daily.splice(-2,1);
 const frame=publicTrendFrame({symbol:'SHFE.AU2612',code:'AU'},quote,{'1d':daily,'30m':parseTrendKlines(jsonp(raw),'30m')},['2026-10-30','2026-11-02']);
 assert.equal(frame.bars['30m'].at(-1).stamp,'2026-11-02T15:00:00+08:00');assert.equal(frame.bars['30m'].at(-1).close,115);assert.equal(frame.bars['30m'].at(-1).complete,false);
 const signal=intrabarMaSignal(frame.bars['30m'],quote.last,quote.quoteAt);assert.equal(signal.status,'ok');
 assert.ok(frame.bars['30m'].slice(0,-1).every(r=>r.complete&&Date.parse(r.stamp)<=Date.parse(quote.quoteAt)));
});

test('a real two-hour candle may cross a night/day recess without a fabricated wall-clock cutoff',()=>{
 const quote={last:115,quoteAt:'2026-11-03T01:30:00+08:00',tradingDay:'2026-11-03',sessionKey:'2026-11-02:night',sessionActive:true};
 const daily=Array.from({length:12},(_,i)=>({stamp:`2026-10-${20+i}T00:00:00+08:00`,date:`2026-10-${20+i}`,close:100+i}));daily.at(-1).date='2026-11-02';daily.at(-1).stamp='2026-11-02T00:00:00+08:00';
 const ends=Array.from({length:11},(_,i)=>new Date(Date.parse('2026-11-03T01:00:00+08:00')-(10-i)*7200000).toISOString());ends.push('2026-11-03T09:30:00+08:00');
 const bars=ends.map(stamp=>({stamp,endStamp:stamp,stampKind:'end',close:110,open:110,high:115,low:100,durationSeconds:7200}));
 const f=publicTrendFrame({symbol:'SHFE.AU2612',code:'AU'},quote,{'1d':daily,'120m':bars},['2026-11-02','2026-11-03']);assert.ok(f.bars['120m']);assert.equal(intrabarMaSignal(f.bars['120m'],quote.last,quote.quoteAt).status,'ok');
});

test('trend feed disabled does not fetch or subscribe; non-members cannot inject frames',async()=>{
 let fetches=0,frames=0;const calls=[];
 const monitor={provider:'sina',catalog:async()=>[],setTrendSubscriptions:(...a)=>calls.push(a),quotes:new Map()};
 const feed=new TrendMarketFeed({monitor,onFrame:()=>frames++,fetchImpl:()=>{fetches++;throw Error('unexpected')}});
 await feed.configure({enabled:false});feed.ingestQuote({symbol:'SHFE.AU2612',last:100});assert.equal(frames,0);assert.equal(fetches,0);assert.deepEqual(calls,[[[],[]]]);feed.stop();
});

test('pause cancels queued keys and every contract can resume after in-flight requests drain',async()=>{
 const members=['MA','AU','SC','M'].map(code=>({code,symbol:'SHFE.'+code+'2701'})),started=[],gates=[];
 const monitor={provider:'sina',catalog:async()=>members,setTrendSubscriptions:()=>{},quotes:new Map()};
 const feed=new TrendMarketFeed({monitor,onFrame:()=>{}});
 feed.fetchBars=async item=>{started.push(item.key);await new Promise(r=>gates.push(r))};
 await feed.configure({symbols:members.map(m=>m.symbol),periods:['30m'],enabled:true});assert.equal(feed.inflight,3);assert.equal(feed.queue.length,9);
 const cancelled=feed.queue.map(i=>i.key);await feed.configure({enabled:false});assert.equal(feed.pending.size,3);assert.equal(feed.queue.length,0);
 await feed.configure({symbols:members.map(m=>m.symbol),periods:['30m'],enabled:true});
 for(let i=0;i<8;i++){gates.splice(0).forEach(r=>r());await new Promise(r=>setImmediate(r))}
 assert.ok(cancelled.every(key=>started.includes(key)));assert.equal(feed.pending.size,0);feed.stop();
});

test('late catalog response cannot re-enable a task that has since been paused',async()=>{
 let first;let calls=0;const subscribed=[];
 const monitor={provider:'tqsdk',catalog:()=>++calls===1?new Promise(r=>first=r):Promise.resolve([]),setTrendSubscriptions:s=>subscribed.push(s),quotes:new Map()};
 const feed=new TrendMarketFeed({monitor,onFrame:()=>{}}),old=feed.configure({symbols:['SHFE.AU2701'],periods:['30m'],enabled:true});
 await feed.configure({enabled:false});first([{symbol:'SHFE.AU2701'}]);await old;assert.equal(feed.active,false);assert.deepEqual(subscribed,[[]]);feed.stop();
});

test('one fresh product never keeps other stale observations current',()=>{
 const now=Date.parse('2026-11-03T01:00:00+08:00'),store=new MonitorStore(':memory:'),service=new TrendMonitorService({store,now:()=>now});
 service.lastFrameAt=new Date(now).toISOString();service.observations.set('a',{code:'AU',status:'waiting-cross',lastObserved:new Date(now).toISOString()});service.observations.set('b',{code:'MA',status:'waiting-cross',lastObserved:new Date(now-31000).toISOString()});
 const rows=service.status().observations;assert.equal(rows[0].status,'waiting-cross');assert.equal(rows[1].status,'waiting-data');store.close();
});
