import test from 'node:test';
import assert from 'node:assert/strict';
import {observationPool,defaultPoolSelection,observationSeries} from '../dist/market-observation-pools.js';
const date='2026-10-27';
const product=(code,side,changePct)=>({code,name:code,fireDate:date,fireModes:{'week-day':side,'day-trend':side},priceType:'具体合约最新价',priceTime:date+' 15:00:00',contract:code+'2701',quoteChangePct:changePct,changePct,previousSettlement:100,signals:Object.fromEntries(['month','week','day'].map(key=>[key,{previousMa:100,ma:side==='多头观察'?101:99,close:side==='多头观察'?102:98,samples:20,side:side==='多头观察'?'long':'short'}]))});
test('Fire observation pools preserve eligibility despite opposite intraday returns',()=>{
 const rows=[product('FU','多头观察',-3),product('AL','空头观察',4),product('AU','流动性不合格',8)];
 const copy=structuredClone(rows),pool=observationPool(rows,'week-day',date);
 assert.deepEqual(pool.long.map(p=>p.code),['FU']);assert.deepEqual(pool.short.map(p=>p.code),['AL']);
 assert.equal(pool.long[0].observation.tag,'多');assert.equal(pool.short[0].observation.tag,'空');
 assert.equal(observationSeries(pool.long[0]).lineStyle.type,'solid');assert.equal(observationSeries(pool.short[0]).lineStyle.type,'dashed');
 assert.match(observationSeries(pool.short[0]).name,/【空】AL/);assert.deepEqual(rows,copy);
});
test('daily pool uses the latest available Fire date without mixing older or future memberships',()=>{
 const a=product('FU','多头观察',-1),b=product('AL','空头观察',1),old=product('CU','多头观察',2),undated=product('AU','空头观察',3);
 a.fireModes['day-trend']='空头观察';b.fireModes['day-trend']='多头观察';old.fireDate='2026-10-26';undated.fireDate=null;
 const pool=observationPool([a,b,old,undated],'day-trend',date);
 assert.deepEqual(pool.long.map(p=>p.code),['AL']);assert.deepEqual(pool.short.map(p=>p.code),['FU']);assert.equal(pool.stale,1);
 assert.equal(observationPool([a,b],'day-trend','2026-10-26').rows.length,0);
 const nextDay=observationPool([a,b,old,undated],'day-trend','2026-10-28');
 assert.equal(nextDay.asOf,date);assert.deepEqual(nextDay.rows.map(p=>p.code).sort(),['AL','FU']);
 assert.equal(observationPool([a,b,old],'day-trend','2026-10-28',{fireAsOf:'2026-10-28'}).rows.length,0);
});
test('combined monthly pool retains the existing trend rules and includes both sides',()=>{
 const a=product('FU','多头观察',-2),b=product('AL','空头观察',3),bad=product('AU','多头观察',5);bad.signals.day.side='missing';
 a.fireModes['week-day']='未纳入';const pool=observationPool([a,b,bad],'month-week-day',date);
 assert.deepEqual(pool.long.map(p=>p.code),['FU']);assert.deepEqual(pool.short.map(p=>p.code),['AL']);assert.deepEqual(defaultPoolSelection(pool),['FU','AL']);
});
test('latest relative strength does not turn relative weakness into a trading short signal',()=>{
 const pool=observationPool([product('FU','多头观察',5),product('AL','空头观察',2)],'quote',date);
 // With two valid quotes, both are in the leading six; no duplicate weak lines are invented.
 assert.equal(pool.short.length,0);assert(pool.long.every(p=>p.observation.tag==='强'));
 const broad=observationPool(Array.from({length:14},(_,i)=>product('Q'+i,'未纳入',i+1)),'quote',date);
 assert.equal(broad.short.length,6);assert(broad.short.every(p=>p.quoteChangePct>0&&p.observation.tag==='弱'));
 assert.match(observationSeries(broad.short[0]).name,/【弱】/);assert.equal(observationSeries(broad.short[0]).lineStyle.type,'dashed');
});
