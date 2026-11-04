import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createPanorama,seatPairs} from '../integrations/market-panorama.mjs';

async function fixture(options={}){
 const parent=resolve('output/market-panorama-tests');await mkdir(parent,{recursive:true});const root=await mkdtemp(join(parent,'performance-'));
 await mkdir(join(root,'data'));await writeFile(join(root,'data/contract-specs.json'),JSON.stringify({products:{FU:{pointValue:10,tickSize:1}}}));
 const app=createPanorama({root,folder:join(root,'.runtime/panorama'),getTradingCalendar:async()=>({days:['2026-10-05','2026-10-21','2026-10-22','2026-10-23'],source:'测试日历'}),getFire:async()=>({rows:[{code:'FU',name:'燃料油',exchange:'SHFE',main_contract:'FU2701',data_date:'2026-10-22',modes:{}}]}),...options});
 await app.init();const db=new DatabaseSync(join(root,'.runtime/panorama/market.sqlite'));for(const day of ['2026-10-05','2026-10-22'])db.prepare('INSERT INTO bars VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run('FU','FU0','1d',day,day,100,101,99,100,20000,20000,'fixture',1);return{app,db};
}

test('parallel live requests calculate one snapshot; subsequent quotes and revisions stay fresh',async()=>{
 let quoteReads=0,price=100;
 const {app,db}=await fixture({getLiveStatus:()=>({selected:true}),getLiveQuote:()=>{quoteReads++;return{contract:'FU2701',quoteAt:'2026-10-22T15:00:00',last:price,volume:20000,interest:20000,changePct:1,source:'fixture'}}});
 try{
  const snapshots=await Promise.all(Array.from({length:8},()=>app.snapshot('2026-10-22')));
  assert.equal(quoteReads,1);for(const s of snapshots)assert.strictEqual(s,snapshots[0]);
  price=101;const next=await app.snapshot('2026-10-22');assert.equal(quoteReads,2);assert.equal(next.products[0].close,101);
  await app.watchlist(['FU']);const revised=await app.snapshot('2026-10-22');assert.ok(revised.revision>next.revision);assert.deepEqual(revised.watchlist,['FU']);
 }finally{db.close();app.stop()}
});

test('batch seat history equals daily queries including missing prices, one-sided ranks and future exclusion',async()=>{
 const {app,db}=await fixture();
 try{
  const insert=db.prepare('INSERT INTO seats VALUES(?,?,?,?,?,?,?,?)'),settle=db.prepare('INSERT INTO records VALUES(?,?,?,?,?,?)');
  for(let i=0;i<40;i++){
   const day=new Date(Date.UTC(2026,8,1+i)).toISOString().slice(0,10);
   for(const contract of ['FU2701','FU2705'])for(const side of ['long','short']){if(i===3&&side==='short')continue;insert.run('FU',contract,day,'中信期货',side,side==='long'?100+i:80,side==='long'?5:-2,'fixture')}
   if(i!==7)settle.run('settle','FU2701',day,JSON.stringify({price:4000+i}),'fixture',day);
   settle.run('settle','CU2701',day,JSON.stringify({price:80000}),'fixture',day);
  }
  const day='2026-10-05';await app.snapshot(day);
  const dates=db.prepare('SELECT DISTINCT day FROM seats WHERE product=? AND day<=? ORDER BY day').all('FU',day).map(r=>r.day);
  const expected=dates.map(d=>({day:d,pairs:seatPairs(db.prepare('SELECT * FROM seats WHERE product=? AND day=?').all('FU',d),new Map(db.prepare("SELECT key,body FROM records WHERE kind='settle' AND day=?").all(d).map(r=>[r.key,JSON.parse(r.body).price])),10)}));
  const original=DatabaseSync.prototype.prepare,queries=[];
  DatabaseSync.prototype.prepare=function(sql){queries.push(sql);return original.call(this,sql)};
  let actual;try{actual=await app.detail('FU',day)}finally{DatabaseSync.prototype.prepare=original}
  assert.deepEqual(actual.seatHistory,expected);
  assert.equal(queries.filter(sql=>sql.startsWith('SELECT * FROM seats')).length,1);
  assert.equal(queries.filter(sql=>sql.startsWith('SELECT key,day,body FROM records')).length,1);
  assert.ok(actual.seatHistory.every(row=>row.day<=day));
  assert.ok(actual.seatHistory.some(row=>row.pairs.some(p=>p.amount===null)));
 }finally{db.close();app.stop()}
});

test('minute curves share a 30-second verified universe; expiry and revisions force a fresh universe',async t=>{
 let reads=0,clock=Date.now();
 t.mock.method(Date,'now',()=>clock);
 t.mock.method(globalThis,'fetch',async()=>({ok:true,text:async()=>'=([{"d":"2026-10-21 21:01:00","o":"100","c":"100"},{"d":"2026-10-22 15:00:00","o":"100","c":"101"}]);'}));
 const {app,db}=await fixture({getLiveStatus:()=>({selected:true}),getLiveQuote:()=>{reads++;return {contract:'FU2701',quoteAt:'2026-10-22 15:00:00',last:101,previousSettlement:100,volume:20000,interest:20000,changePct:1,source:'fixture'}}});
 try{
  await app.snapshot('2026-10-22');assert.equal(reads,1);
  await Promise.all(Array.from({length:12},()=>app.intraday('FU','2026-10-22')));assert.equal(reads,1);
  clock+=31000;await app.intraday('FU','2026-10-22');assert.equal(reads,2);
  await app.watchlist(['FU']);await app.intraday('FU','2026-10-22');assert.equal(reads,3);
  await assert.rejects(()=>app.intraday('FU','2026-10-05'),/该日期缺少同合约报价或昨结/);assert.equal(reads,4);
 }finally{db.close();app.stop()}
});
