import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {maSignal,calendarBars,needsDailySeed,seatPairs,feeAmount,feeType,memberGroups,createPanorama,commodityExposure} from '../integrations/market-panorama.mjs';
import {panoramaPeriods,cycleResonance,signalAppearance} from '../dist/market-panorama-periods.js';

test('MA10 needs ten completed bars; equal prices and zero point value stay explicit',()=>{
 const bars=Array.from({length:9},()=>({close:100,complete:true}));assert.equal(maSignal(bars).side,'missing');
 bars.push({close:100,complete:false});assert.equal(maSignal(bars).side,'missing');bars.at(-1).complete=true;
 assert.equal(maSignal(bars,10).side,'flat');bars.push({close:110,complete:true});assert.equal(maSignal(bars,10).side,'long');assert.equal(maSignal(bars,10).ma,101);assert.equal(maSignal(bars,10).distance,90);
 assert.equal(maSignal(bars).distance,null);assert.equal(maSignal([...bars,{close:0,complete:true}],10).close,110);
});
test('calendar periods reuse completed daily aggregation without future or partial endpoints',()=>{
 const rows=Array.from({length:650},(_,i)=>{const day=new Date(Date.UTC(2024,0,1+i)).toISOString().slice(0,10);return{stamp:day,day,open:100,high:105,low:98,close:101,volume:10,complete:1,source:'fixture'}});
 for(const period of ['1mo','1w']){const result=calendarBars(rows,period);assert.ok(result.length>10);assert.ok(result.every(b=>b.complete));assert.ok(result[0].day>rows[0].day);assert.ok(result.at(-1).day<rows.at(-1).day);assert.equal(result[0].open,100);assert.equal(result[0].close,101);assert.equal(result[0].high,105);assert.equal(result[0].low,98);assert.equal(maSignal(result).ma,101);assert.ok(result[0].volume>10)}
 const cut=rows.filter(b=>b.day<='2024-08-15');assert.ok(calendarBars(cut,'1mo').every(b=>b.day<'2024-08-01'));
 const monthly=calendarBars(rows,'1mo'),badDay=monthly.at(-1).day;assert.ok(calendarBars(rows.map(b=>b.day===badDay?{...b,complete:0}:b),'1mo').length<monthly.length);
});

test('four shades use actual MA10 slope; missing and stale samples are never painted strong',()=>{
 const make=values=>values.map((close,i)=>({close,complete:true,stamp:String(i),source:'fixture',contract:'TEST'}));
 const rising=maSignal(make(Array.from({length:11},(_,i)=>100+i)));
 assert.equal(rising.previousMa,104.5);assert.equal(rising.ma,105.5);assert.equal(rising.maChange,1);
 assert.deepEqual(signalAppearance(rising),{label:'强',tone:'strong-long'});
 assert.deepEqual(signalAppearance(maSignal(make(Array.from({length:11},(_,i)=>110-i)))),{label:'弱',tone:'strong-short'});
 assert.equal(signalAppearance(maSignal(make([200,...Array(9).fill(100),110]))).label,'偏强');
 assert.equal(signalAppearance(maSignal(make([1,...Array(9).fill(100),90]))).label,'偏弱');
 assert.equal(signalAppearance(maSignal(make(Array(11).fill(100)))).label,'平衡');
 assert.equal(signalAppearance(maSignal(make(Array(9).fill(100)))).label,'不足');
 assert.equal(signalAppearance(maSignal(make([...Array(9).fill(100),110]))).label,'待核');
 assert.equal(signalAppearance({...rising,side:'missing',reason:'序列陈旧'}).label,'不足');
 assert.equal(maSignal([...make(Array(11).fill(100)),{close:200,complete:false}]).ma,100);
 const reverse=Object.fromEntries(panoramaPeriods.map((p,i)=>[p.key,{side:i<2?'short':'long'}]));
 assert.equal(cycleResonance(reverse),'逆市诱多');reverse.hour.side='flat';assert.equal(cycleResonance(reverse),'混沌分歧');
});
test('all five periods participate in resonance; daily is no longer the longest period',()=>{
 assert.deepEqual(panoramaPeriods.map(p=>p.period),['1mo','1w','1d','120m','30m']);
 const signals=Object.fromEntries(panoramaPeriods.map(p=>[p.key,{side:'long'}]));assert.equal(cycleResonance(signals),'全红共振');
 signals.halfHour.side='missing';assert.equal(cycleResonance(signals),'数据不足');signals.halfHour.side='short';assert.equal(cycleResonance(signals),'混沌分歧');
 for(const key of ['day','hour'])signals[key].side='short';assert.equal(cycleResonance(signals),'逆市诱空');
 signals.month.side='short';signals.week.side='short';assert.equal(cycleResonance(signals),'全绿共振');
});
test('same-day late daily arrivals are imported even when another product already has that date',()=>{
 const bars=day=>[{timeNs:String(BigInt(Date.parse(day+'T00:00:00+08:00'))*1000000n),complete:true}];
 const quotes=[{symbol:'FU0',bars:bars('2026-10-23')},{symbol:'LC0',bars:bars('2026-10-23')}];
 assert.equal(needsDailySeed(quotes,new Map([['FU','2026-10-22'],['LC','2026-10-23']])),true);
 assert.equal(needsDailySeed(quotes,new Map([['FU','2026-10-23'],['LC','2026-10-23']])),false);
 quotes[0].bars[0].complete=false;assert.equal(needsDailySeed(quotes,new Map([['FU','2026-10-22'],['LC','2026-10-23']])),false);
});
test('single-sided public ranks are unknown, not zero; amount requires same-contract price',()=>{
 const base={product:'FU',contract:'FU2701',member:'中信期货',day:'2026-10-22',source:'fixture'};
 const long={...base,side:'long',value:100,change:10};let p=seatPairs([long],new Map([['FU2701',4000]]),10)[0];assert.equal(p.net,null);assert.equal(p.amount,null);
 p=seatPairs([long,{...base,side:'short',value:80,change:20}],new Map([['FU2701',4000]]),10)[0];assert.equal(p.net,20);assert.equal(p.delta,-10);assert.equal(p.amount,800000);assert.equal(p.amountChange,-400000);assert.equal(p.action,'增多 / 增空');
 assert.equal(seatPairs([long,{...base,side:'short',value:80,change:null}],new Map(),10)[0].delta,null);
 assert.equal(seatPairs([long,{...base,side:'short',value:80}],new Map([['FU2702',4000]]),10)[0].amount,null);
});
test('observation groups use exact aliases and do not guess similar member names',()=>{
 assert.ok(memberGroups('中信期货').includes('机构'));assert.deepEqual(memberGroups('中信建投期货'),[]);assert.ok(memberGroups('东方财富期货').includes('散户观察组'));
});
test('commodity scale compares same contract on adjacent observed days, never a main roll',()=>{
 const rows=[{contract:'A2701',day:'2026-10-21',interest:100,price:5000},{contract:'A2701',day:'2026-10-22',interest:110,price:5100},{contract:'A2705',day:'2026-10-22',interest:1000,price:5200}];
 assert.deepEqual(commodityExposure(rows,10),{marketInterestChange:10,marketNominalChange:510000,marketSamples:1});
 assert.equal(commodityExposure(rows.filter(r=>r.contract==='A2705'),10).marketNominalChange,null);
});
test('fees keep zero, basis and broker reference amounts distinct',()=>{
 assert.equal(feeAmount({'手续费标准-平今-元':0},'平今',100,10),0);
 assert.equal(feeAmount({'手续费标准-开仓-万分之':2},'开仓',1000,10),2);
 assert.equal(feeAmount({'手续费标准-开仓-万分之':2},'开仓',null,10),null);
 assert.equal(feeAmount({'费用来源类型':'OpenCTP账户参考','1手开仓费用':5.06,'开仓费率':.000001},'开仓',1000,10),5.06);
 assert.equal(feeType({'费用来源类型':'OpenCTP账户参考','开仓费率':.000001,'开仓费用/手':2.01}),'mixed');
 assert.equal(feeType({'手续费标准-开仓-万分之':2,'手续费标准-开仓-元':0}),'ratio');
 assert.equal(feeType({'手续费标准-开仓-元':0}),'fixed');assert.equal(feeType({}),'unknown');
});
test('historical observations exclude future data, invalid preferences fail, exports stay in project',async()=>{
 const parent=resolve('output/market-panorama-tests');await mkdir(parent,{recursive:true});const root=await mkdtemp(join(parent,'case-'));
 await mkdir(join(root,'data'));await writeFile(join(root,'data/contract-specs.json'),JSON.stringify({products:{FU:{pointValue:10,tickSize:1}}}));
 const p=createPanorama({root,folder:join(root,'.runtime/panorama'),getFire:async()=>({rows:[{code:'FU',name:'燃油',exchange:'SHFE',main_contract:'FU2701',data_date:'2026-10-22',modes:{'day-trend':'多头观察'}}]})});
 try{await p.init();const db=new DatabaseSync(join(root,'.runtime/panorama/market.sqlite'));const insert=db.prepare('INSERT INTO bars VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)');
  for(let i=0;i<61;i++){const day=new Date(Date.UTC(2026,7,20+i)).toISOString().slice(0,10);insert.run('FU','FU0','1d',day,day,100,101,99,100,10000,20000,'fixture',1)}
  insert.run('FU','FU0','1d','2026-10-22','2026-10-22',200,201,199,200,20000,30000,'fixture',1);
  const historical=await p.snapshot('2026-10-20');assert.equal(historical.products[0].signals.day.side,'flat');assert.equal(historical.products[0].close,100);assert.deepEqual(historical.products[0].fireModes,{});
  const current=await p.snapshot('2026-10-22');assert.equal(current.products[0].close,200);assert.equal(current.products[0].signals.day.side,'long');
  assert.equal(current.maLength,10);assert.deepEqual(Object.keys(current.periods),panoramaPeriods.map(p=>p.key));assert.deepEqual(Object.keys(current.products[0].signals),panoramaPeriods.map(p=>p.key));
  const detail=await p.detail('FU','2026-10-22');assert.deepEqual(Object.keys(detail.bars),panoramaPeriods.map(p=>p.period));assert.ok(detail.bars['1w'].length);assert.equal(detail.signals.month.side,'missing');
  assert.equal(current.products[0].amount,null);assert.equal(current.products[0].fireModes['day-trend'],'多头观察');
  await assert.rejects(()=>p.watchlist(['EVIL']));assert.deepEqual(await p.watchlist(['FU','FU']),['FU']);
  await assert.rejects(()=>p.snapshot('9999-01-01'));await assert.rejects(()=>p.snapshot('2026-02-31'));
  const out=await p.exportTable({title:'测试',date:'2026-10-22',metadata:{unit:'手',source:'公开排名',basis:'净持仓变化'},rows:[['品种','数值'],['燃油',100]]});assert.ok(out.path.startsWith(join(root,'output')));const csv=await readFile(out.path,'utf8');assert.ok(csv.includes('"单位","手"'));assert.ok(csv.includes('"来源","公开排名"'));await assert.rejects(()=>p.exportTable({rows:[],metadata:{source:42}}));db.close();
 }finally{p.stop()}
});

test('2小时 MA10 reads actual 120-minute bars rather than old 60-minute bars',async()=>{
 const parent=resolve('output/market-panorama-tests');await mkdir(parent,{recursive:true});const root=await mkdtemp(join(parent,'two-hour-'));
 const p=createPanorama({root,folder:join(root,'.runtime/panorama'),getFire:async()=>({rows:[{code:'FU',name:'燃油',exchange:'SHFE',main_contract:'FU2701',data_date:'2026-10-22'}]})});
 try{await p.init();const db=new DatabaseSync(join(root,'.runtime/panorama/market.sqlite'));const insert=db.prepare('INSERT INTO bars VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)');
  insert.run('FU','FU0','1d','2026-10-22','2026-10-22',100,101,99,100,100,100,'fixture',1);
  for(let i=0;i<11;i++){const stamp='2026-10-22 '+String(i).padStart(2,'0')+':00:00';for(const [period,close] of [['120m',100+i],['60m',120-i]])insert.run('FU','FU2701',period,stamp,'2026-10-22',close,close,close,close,100,100,'fixture',1)}
  insert.run('FU','FU2705','120m','2026-10-22 23:00:00','2026-10-22',50,50,50,50,100,100,'other contract',1);
  const snap=await p.snapshot('2026-10-22'),row=snap.products[0];assert.equal(snap.periods.hour,'2小时');assert.equal(row.signals.hour.side,'long');assert.equal(row.signals.hour.close,110);
  const details=await p.detail('FU','2026-10-22');assert.equal(details.bars['120m'].length,11);assert.equal(details.bars['60m'],undefined);db.close();
 }finally{p.stop()}
});

test('stale daily returns and zero fee quotes cannot become current observations',async()=>{
 const parent=resolve('output/market-panorama-tests');await mkdir(parent,{recursive:true});const root=await mkdtemp(join(parent,'stale-'));
 const p=createPanorama({root,folder:join(root,'.runtime/panorama'),getFire:async()=>({rows:['FU','WH'].map(code=>({code,name:code,exchange:'SHFE'}))})});
 try{await p.init();const db=new DatabaseSync(join(root,'.runtime/panorama/market.sqlite'));const insert=db.prepare('INSERT INTO bars VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)');
  for(const [code,day]of [['FU','2026-10-22'],...['01','02','03','06','07','08'].map(d=>['WH','2023-03-'+d])])insert.run(code,code+'0','1d',day,day,100,101,99,100,10000,20000,'fixture',1);
  const row={'合约代码':'FU2701','现价':0,'费用来源类型':'OpenCTP账户参考','1手开仓费用':2.05,'开仓费率':.000001,'开仓费用/手':2.01};
  db.prepare('INSERT INTO records VALUES(?,?,?,?,?,?)').run('fee','FU2701','2026-10-22',JSON.stringify(row),'fixture','2026-10-22');
  const s=await p.snapshot('2026-10-22'),stale=s.products.find(p=>p.code==='WH'),f=s.products.find(p=>p.code==='FU').fees[0];
  assert.equal(stale.close,null);assert.equal(stale.volume,null);assert.equal(stale.return3,null);assert.equal(stale.return5,null);
  assert.equal(f.price,null);assert.equal(f.open,2.05);assert.equal(f.feeType,'mixed');db.close();
 }finally{p.stop()}
});
