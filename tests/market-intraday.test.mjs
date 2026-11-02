import test from 'node:test';
import assert from 'node:assert/strict';
import {quoteLeaders,signalsForMarketService} from '../dist/market-intraday.js';
import {intradayComparison} from '../integrations/intraday-comparison.mjs';
const date='2026-10-27';
const p=(code,pct,extra={})=>({code,name:code,contract:code+'2701',priceType:'具体合约最新价',priceTime:date+' 15:00:00',quoteChangePct:pct,previousSettlement:100,...extra});
test('only same-day same-basis concrete quotes enter strongest and weakest without duplicates',()=>{
 const input=[p('A',5),p('B',2),p('C',-1),p('D',-4),p('E',99,{previousSettlement:null}),p('F',-99,{priceTime:'2026-10-26 15:00:00'}),p('G',10,{priceType:'完成日K主连'})];
 const r=quoteLeaders(input,date,2);assert.equal(r.total,4);assert.deepEqual(r.strong.map(x=>x.code),['A','B']);assert.deepEqual(r.weak.map(x=>x.code),['D','C']);assert.equal(new Set([...r.strong,...r.weak].map(x=>x.code)).size,4);
 const short=quoteLeaders(input.slice(0,3),date,2);assert.deepEqual(short.weak.map(x=>x.code),['C']);
});
test('night quotes do not rank alongside stale same-day daytime quotes',()=>{
 const rows=[p('FU',2),p('LC',3,{priceTime:date+' 21:05:00'}),p('SH',-2,{priceTime:date+' 21:04:00'})],r=quoteLeaders(rows,date,1);
 assert.equal(r.session,'night');assert.equal(r.total,2);assert.deepEqual([...r.strong,...r.weak].map(x=>x.code),['LC','SH']);
});
test('minute observations use previous settlement, correct date and avoid future points',async()=>{
 const product=p('FU',2),upstream=[{d:'2026-10-27 09:01:00',c:'101'},{d:'2026-10-27 15:00:00',c:'102'},{d:'2026-10-27 15:01:00',c:'103'},{d:'2026-10-26 15:00:00',c:'999'},{d:'invalid',c:'10'}];
 const fetcher=async()=>({ok:true,text:async()=>`/*prefix*/=(${JSON.stringify(upstream)});`});
 const result=await intradayComparison(product,date,{fetcher});assert.equal(result.contract,'FU2701');assert.equal(result.baseline,100);assert.deepEqual(result.points.map(x=>x.stamp),['2026-10-27 09:01:00','2026-10-27 15:00:00']);assert(Math.abs(result.points[1].value-2)<1e-9);
 await assert.rejects(()=>intradayComparison(p('ZZ',1,{previousSettlement:null}),date,{fetcher}));await assert.rejects(()=>intradayComparison(p('AA',1,{contract:'../bad'}),date,{fetcher}));
});
test('night chart excludes same-day daytime bars and keeps the previous evening after midnight',async()=>{
 const data=[{d:'2026-10-27 14:59:00',c:'101'},{d:'2026-10-27 21:01:00',c:'102'},{d:'2026-10-28 00:01:00',c:'103'}],fetcher=async()=>({ok:true,text:async()=>`=(${JSON.stringify(data)});`});
 const night=await intradayComparison(p('NI',1,{priceTime:date+' 21:02:00'}),date,{fetcher});assert.deepEqual(night.points.map(x=>x.stamp),['2026-10-27 21:01:00']);
 const afterMidnight=await intradayComparison(p('CU',1,{priceTime:'2026-10-28 00:05:00'}),'2026-10-28',{fetcher});assert.deepEqual(afterMidnight.points.map(x=>x.stamp),['2026-10-27 21:01:00','2026-10-28 00:01:00']);
});
test('old backend 1h data is never presented as 2h while restart is pending',()=>{
 const original={day:{side:'long'},hour:{side:'long',ma:123,stamp:'2026-10-27 15:00:00'}};
 const masked=signalsForMarketService(original,{hour:'1小时'});assert.equal(masked.hour.side,'missing');assert.equal(masked.hour.ma,null);assert.equal(masked.day.side,'long');assert.equal(original.hour.side,'long');
 assert.equal(signalsForMarketService(original,{hour:'2小时'}),original);
});
