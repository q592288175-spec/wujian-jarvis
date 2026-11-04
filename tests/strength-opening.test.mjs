import test from 'node:test';
import assert from 'node:assert/strict';
import {intradayComparison,comparisonSession} from '../integrations/intraday-comparison.mjs';
import {openQuoteLeaders,openComparisonRows} from '../dist/strength-live.js';
const calendar={days:['2026-10-30','2026-11-02','2026-11-03','2026-11-04','2026-11-05','2026-11-06'],source:'测试交易日历'};
const product={code:'MA',exchange:'CZCE',contract:'MA2701',priceType:'具体合约最新价',priceTime:'2026-11-04 11:00:00',previousSettlement:80};
const fetcher=rows=>async()=>({ok:true,text:async()=>`=(${JSON.stringify(rows)});`});
test('前晚夜盘开盘归零，跨零点及日盘接续，不在早上重置',async()=>{
 const rows=[{d:'2026-11-03 21:01:00',o:'100',c:'101'},{d:'2026-11-03 23:00:00',o:'101',c:'102'},{d:'2026-11-04 09:01:00',o:'98',c:'99'},{d:'2026-11-04 11:00:00',o:'99',c:'98'}];
 const d=await intradayComparison(product,'2026-11-04',{basis:'session-open',calendar,fetcher:fetcher(rows)});assert.equal(d.baseline,100);assert.equal(d.baselineAt,'2026-11-03 21:00:00');assert.equal(d.points[0].value,0);assert.equal(d.points[0].kind,'open-baseline');assert.equal(d.tradingDay,'2026-11-04');assert.ok(Math.abs(d.points.at(-1).value+2)<1e-10);assert.ok(d.points.some(p=>p.stamp==='2026-11-03 23:00:00'));assert.notEqual(d.baseline,product.previousSettlement);
});
test('无夜盘从实际日盘开盘归零，不伪造夜间价格',async()=>{
 const p={...product,code:'IF',exchange:'CFFEX',contract:'IF2612',previousSettlement:null},rows=[{d:'2026-11-04 09:31:00',o:'10000',c:'10020'},{d:'2026-11-04 10:59:00',o:'10020',c:'10050'}];
 const d=await intradayComparison(p,'2026-11-04',{basis:'session-open',calendar,fetcher:fetcher(rows)});assert.equal(d.baselineAt,'2026-11-04 09:30:00');assert.equal(d.points[0].value,0);assert.equal(d.points.length,3);assert.ok(d.points.every(p=>p.stamp>='2026-11-04 09:30:00'));
});
test('周一使用周五夜盘；长假前无夜盘则从节后日盘开始',()=>{
 assert.equal(comparisonSession({...product,priceTime:'2026-11-02 10:00:00'},'2026-11-02',calendar).start,'2026-10-30 21:00:00');
 const holiday={days:['2026-09-30','2026-10-09','2026-10-12']};assert.equal(comparisonSession({...product,priceTime:'2026-10-09 10:00:00'},'2026-10-09',holiday).start,'2026-10-09 09:00:00');
});
test('夜盘开市后属于下一交易日，午夜仍沿用同一夜盘起点',()=>{
 assert.equal(comparisonSession({...product,priceTime:'2026-11-04 21:10:00'},'2026-11-04',calendar).tradingDay,'2026-11-05');
 const s=comparisonSession({...product,code:'AU',contract:'AU2612',exchange:'SHFE',priceTime:'2026-11-05 00:20:00'},'2026-11-05',calendar);assert.equal(s.start,'2026-11-04 21:00:00');
});
test('缺少夜盘首分钟或真实开盘价明确拒绝，不以日盘和残缺样本归零',async()=>{
 const p={...product,code:'SH',contract:'SH2701'};
 await assert.rejects(()=>intradayComparison(p,'2026-11-04',{basis:'session-open',calendar,fetcher:fetcher([{d:'2026-11-04 09:01:00',o:'100',c:'101'}])}),/缺少本交易日开盘/);
 await assert.rejects(()=>intradayComparison(p,'2026-11-04',{basis:'session-open',calendar,fetcher:fetcher([{d:'2026-11-03 21:01:00',c:'101'}])}),/缺少本交易日开盘/);
});
test('开盘强弱榜按开盘之后表现排名，昨结涨跌不能决定名次；回放不偷看后续',()=>{
 const products=[{...product,code:'A',contract:'A2701',quoteChangePct:10},{...product,code:'B',contract:'B2701',quoteChangePct:-10}],series=new Map(products.map((p,i)=>[['2026-11-04',p.code,p.contract].join('|'),{basisKey:'session-open',contract:p.contract,baseline:100,baselineAt:'2026-11-03 21:00:00',points:[{stamp:'2026-11-03 21:00:00',price:100,value:0},{stamp:'2026-11-04 10:59:00',price:i?105:98,value:i?5:-2}]}]));
 const q=openQuoteLeaders(products,series,{date:'2026-11-04',limit:1});assert.equal(q.strong[0].code,'B');assert.equal(q.weak[0].code,'A');assert.equal(q.strong[0].openChangeAmount,5);
 const early=openComparisonRows(products,series,{date:'2026-11-04',cutoff:'2026-11-03 21:00:00'});assert.ok(early.every(p=>p.openChangePct===0));
 series.get('2026-11-04|A|A2701').contract='A2705';assert.equal(openComparisonRows(products,series,{date:'2026-11-04'})[0].openChangePct,null);
});
