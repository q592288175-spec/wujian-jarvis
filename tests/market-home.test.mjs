import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {closeContract,closeEvidence,readCloseOverview} from '../integrations/market-overview.mjs';
import {closeRows,sectorHeat,hotProducts,homeExchanges,heatColor,treemapOption} from '../dist/market-home.js';
import {renderCloseHome,closeDetail} from '../dist/market-home-ui.js';
const row=(day,close,extra={})=>({contract:'MA2701',day,close,volume:100,interest:100,source:'同一公开源',complete:true,...extra});
const input=()=>({contract:'MA2701',day:'2026-10-29',previousDay:'2026-10-28',current:row('2026-10-29',110,{settle:999,interest:95}),previous:row('2026-10-28',100,{settle:50})});
test('收盘涨跌仅取同一合约相邻完成日收盘，结算价不参与',()=>{
 const e=closeEvidence(input());assert.equal(e.status,'ok');assert.ok(Math.abs(e.changePct-10)<1e-10);assert.equal(e.interestChange,-5);
 assert.equal(closeEvidence({...input(),current:row('2026-10-29',100)}).changePct,0);
 assert.ok(closeEvidence({...input(),current:row('2026-10-29',90)}).changePct<0);
});
test('缺失、跨合约、跨日期、来源不一致、未完成K线不得进入统计',()=>{
 for(const changed of [null,row('2026-10-28',110),row('2026-10-29',110,{contract:'MA2705'}),row('2026-10-29',null,{settle:120}),row('2026-10-29',0),row('2026-10-29',NaN),row('2026-10-29',110,{complete:false}),row('2026-10-29',110,{source:'另一来源'})]){
  const e=closeEvidence({...input(),current:changed});assert.equal(e.status,'missing');assert.equal(e.changePct,null);
 }
 assert.equal(closeEvidence({...input(),current:row('2026-10-29',110,{volume:0})}).status,'inactive');
 assert.equal(closeEvidence({...input(),current:row('2026-10-29',110,{interest:null})}).interestChange,null);
});
test('回放使用当日已核验主力，换月对比新合约自身昨收，不借用当前主力',()=>{
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE records(kind TEXT,key TEXT,day TEXT,body TEXT,source TEXT)');
 const put=(kind,key,day,v)=>db.prepare('INSERT INTO records VALUES(?,?,?,?,?)').run(kind,key,day,JSON.stringify(v),'同一公开源');
 put('eod','MA','2026-10-29',{actualContract:'MA701',actualContractDate:'2026-10-29'});
 put('close-daily','MA2701','2026-10-29',row('2026-10-29',110));put('close-daily','MA2701','2026-10-28',row('2026-10-28',100));
 const p=[{code:'MA',exchange:'CZCE',contract:'MA2705',contractDate:'2026-11-01'}];
 assert.equal(readCloseOverview(db,p,['2026-10-29','2026-10-28']).products[0].contract,'MA2701');
 assert.equal(readCloseOverview(db,p,['2026-10-28','2026-10-27']).products[0].status,'missing');db.close();
});
test('郑商所同一合约三位四位代码按数据日期对齐，不能把换月当作相同合约',()=>{
 assert.equal(closeContract('CZCE.MA701','CZCE','2026-10-29'),'MA2701');
 assert.equal(closeContract('MA2701','CZCE','2026-10-29'),'MA2701');
 assert.equal(closeContract('TA001','CZCE','2029-12-30'),'TA3001');
 assert.notEqual(closeContract('MA705','CZCE','2026-10-29'),'MA2701');
});
const sample=(code,exchange,value,volume=100)=>({code,name:code,exchange,sector:'化工',displaySector:'化工',eod:{status:'ok',changePct:value,volume,close:100,contract:code+'2701'}});
test('板块平均排除缺口，不补零；热力图红涨绿跌并保留缺口数量',()=>{
 const list=[sample('MA','CZCE',4),sample('TA','CZCE',-2),{...sample('PX','CZCE',null),eod:{status:'missing',changePct:null}}];
 const g=sectorHeat(list)[0];assert.deepEqual([g.mean,g.count,g.total,g.up,g.down],[1,2,3,1,1]);
 assert.notEqual(heatColor(1),heatColor(-1));assert.notEqual(heatColor(null),heatColor(0));assert.equal(sectorHeat([{...list[0],eod:{status:'missing'}}])[0].mean,null);
 assert.equal(treemapOption([g]).series[0].data[0].mean,1);
});
test('热门默认覆盖六所，成交量排序；板块、交易所、涨跌排序独立生效',()=>{
 const list=homeExchanges.flatMap(([ex],i)=>Array.from({length:5},(_,n)=>sample(ex+n,ex,i-n,10000-i*1000-n)));
 let hot=hotProducts(list);assert.equal(hot.length,18);assert.equal(new Set(hot.map(p=>p.exchange)).size,6);assert.ok(hot.every((p,i)=>i===0||p.eod.volume<=hot[i-1].eod.volume));
 hot=hotProducts(list,{exchange:'DCE'});assert.ok(hot.every(p=>p.exchange==='DCE'));
 for(const order of ['gainers','losers']){hot=hotProducts(list,{order});assert.ok(hot.every((p,i)=>i===0||(order==='gainers'?p.eod.changePct<=hot[i-1].eod.changePct:p.eod.changePct>=hot[i-1].eod.changePct)))}
 assert.deepEqual(hotProducts(list,{sector:'贵金属'}),[]);
});
test('无候选、旧服务、缺失行情与文本转义均明确展示',()=>{
 const p={code:'MA',name:'<script>坏文本</script>',exchange:'CZCE',sector:'化工'};
 const html=renderCloseHome({products:[p],overview:null});assert.match(html,/尚未同步/);assert.match(html,/没有可比收盘数据/);assert.match(html,/1 个未纳入/);assert.ok(!html.includes('<script>'));
 const rows=closeRows([p],{products:[{code:'MA',...closeEvidence(input())}]});assert.match(closeDetail(rows[0]),/2026-10-28/);assert.match(closeDetail(rows[0]),/10.00%/);
});
