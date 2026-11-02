import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeMethods,deriveMethod,goldPermission,validateGoldPlan,completedBars} from '../dist/gold-methods.js';
import {simpleSizing} from '../dist/position-sizing.js';
const bars=(rows)=>rows.map(([open,high,low,close],i)=>({date:`2026-10-${String(i+1).padStart(2,'0')}`,open,high,low,close}));
const a=rows=>({bars:bars(rows),dataDate:`2026-10-${String(rows.length).padStart(2,'0')}`,tickSize:1,ma10:103.1});
const choose=(analysis,method,extra={})=>deriveMethod(analysis,{method,direction:'long',start:analysis.bars[0].date,end:analysis.dataDate,...extra});
const same=()=>Object.fromEntries(['market','sector','month','week','day'].map(k=>[k,{direction:'long'}]));
test('同图反K突破和收线有不同触发与防守引用，不计中间阳K极值',()=>{
 const data=a([[112,114,106,108],[108,116,98,111],[111,113,107,109]]),b=choose(data,'anti-break'),c=choose(data,'anti-close');
 assert.equal(b.stop,106);assert.equal(b.boundary,114);assert.equal(b.entry,115);assert.equal(c.stop,106);assert.equal(c.entry,109);
 assert.notEqual(c.stopReference,b.stopReference);
});
test('收线法已破前低不能收回后继续使用原方案',()=>{
 assert.throws(()=>choose(a([[112,114,106,108],[111,113,105,109]]),'anti-close'),/曾破/);
});
test('清晰单边两分支：均价线不要求破高；静K止损不是组低',()=>{
 const data=a([[112,113,109,110],[110,113,110,112],[112,114,111,112]]);
 const s=choose(data,'trend',{branch:'static'}),m=choose(data,'trend',{branch:'average'});
 assert.equal(s.boundary,114);assert.equal(s.entry,115);assert.equal(s.stop,111);assert.equal(m.boundary,null);assert.equal(m.stop,111);assert.match(m.trigger,/当日均价线/);
});
test('穿日均线区间包括阳K影线，不强制横盘',()=>{
 const data=a(Array.from({length:11},(_,i)=>[110+i,115+i,100+i,111+i]));data.bars[9]={...data.bars[9],open:100,high:105,low:98,close:104};
 assert.equal(choose(data,'ma10',{start:data.bars[8].date}).stop,98);
});
test('空头反K仅取阳K，报价向下实际越界，静K守前高',()=>{
 const data=a([[118,124,116,122],[122,132,114,119],[119,123,117,121]]);
 const d=choose(data,'anti-break',{direction:'short'});assert.equal(d.stop,124);assert.equal(d.boundary,116);assert.equal(d.entry,115);
 assert.equal(choose(data,'trend',{branch:'static',direction:'short'}).stop,123);
});
test('未完成、临时日K和无效OHLC不参与；未知数据不能伪装触发',()=>{
 const data=a([[112,114,106,108],[110,113,109,112]]);data.bars[1].provisional=true;
 assert.equal(completedBars(data.bars).length,1);
 const r=analyzeMethods({bars:data.bars,direction:'long',cutoff:data.dataDate,tickSize:1,layers:same()});assert.ok(r.missing.length);assert.equal(r.dataDate,'2026-10-01');
});
test('月线反向和板块反向是瑕疵，品种周日相反仍不通过；指数周线不否决主线',()=>{
 let l=same();l.month.direction='short';l.sector.direction='short';assert.equal(goldPermission(l,'long').cap,.01);assert.equal(goldPermission(l,'long').primary,false);
 l.week.direction='short';assert.equal(goldPermission(l,'long').cap,0);
 l=same();l.market.weekDirection='short';assert.equal(goldPermission(l,'long').primary,true);
 l.sector.referenceOnly=true;assert.equal(goldPermission(l,'long').primary,false);
 l.sector.direction='unknown';assert.equal(goldPermission(l,'long').cap,0);
});
test('五个完整案例按允许范围最不利价格核算：10、25、14、11、20手',()=>{
 for(const [entry,stop,lots] of [[116,106,10],[110,106,25],[105,98,14],[113,104,11],[116,111,20]]){
  assert.equal(simpleSizing({equity:1e6},{entry,stop,multiplier:100,tickSize:1,riskPercent:1,direction:'long'}).lots,lots);
 }
});
test('触边不算突破、错误止损和未确认结构不能进入审定',()=>{
 const d=choose(a([[112,114,106,108]]),'anti-break');
 const p={entryMin:114,entryMax:115,stop:106,tradingDay:'2099-10-20',validUntil:'2099-10-20T15:00:00+08:00',exitRule:'已审定退出',structureConfirmed:true};
 assert.ok(validateGoldPlan(d,p,1).some(e=>e.includes('实际越过')));
 assert.ok(validateGoldPlan(d,{...p,entryMin:115,entryMax:116,stop:117,structureConfirmed:false},1).length>=3);
});
