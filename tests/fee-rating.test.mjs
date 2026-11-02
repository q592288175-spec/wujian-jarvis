import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {feeRating,undrawnSeatSeries} from '../dist/fee-rating.js';
const config=JSON.parse(readFileSync('data/fee-rating.json','utf8'));
const row=(open,previous,tick)=>({open,previous,tick,today:previous,volume:100,interest:100});
test('费用评价只使用平昨成本，边界30%与60%分别归适中与偏高',()=>{
 for(const [a,b,t,label,pct] of [[20.61,20.61,100,'适中','41.2'],[2.73,2.73,10,'适中','54.6'],[6.13,6.13,20,'偏高','61.3'],[.7,.7,10,'较低','14.0'],[1,2,10,'适中','30.0'],[3,3,10,'偏高','60.0']]){const r=feeRating(row(a,b,t),config);assert.equal(r.label,label);assert.equal((r.ratio*100).toFixed(1),pct)}
});
test('零成交、零持仓、缺字段或无每跳金额均未评级，不制造1500%指标',()=>{
 for(const extra of [{volume:0},{interest:0},{volume:null},{interest:undefined},{open:null},{tick:0},{tick:NaN}]){const r=feeRating({...row(75,75,10),...extra},config);assert.equal(r.label,'未评级');assert.equal(r.ratio,null)}assert.equal(feeRating(row(1,1,10),null).label,'未评级');
});
test('平今贵只在完整有效样本、平今成本达到两倍平昨成本时标注',()=>{
 assert.equal(feeRating({...row(1,1,10),today:3},config).todayExpensive,true);assert.equal(feeRating({...row(1,1,10),today:2.99},config).todayExpensive,false);assert.equal(feeRating({...row(0,0,10),today:0},config).todayExpensive,false);
});
test('未绘席位保留名称与原因，零值是有效数据',()=>{
 assert.deepEqual(undrawnSeatSeries([{name:'有效零值',data:[null,0]},{name:'缺失席位',data:[null,null]}]).map(r=>r.name),['缺失席位']);assert.match(undrawnSeatSeries([{name:'缺失',data:[]}])[0].reason,/无可比/);
});
