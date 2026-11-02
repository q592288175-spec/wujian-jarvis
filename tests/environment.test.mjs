import {test} from 'node:test';
import assert from 'node:assert/strict';
import {maDirection,periodCloses,movingAverageEvidence,equalWeightIndex,buildEnvironment,environmentCycle} from '../integrations/environment.mjs';
const bars=Array.from({length:15},(_,i)=>({date:`2026-09-${String(i+1).padStart(2,'0')}`,close:100+i}));
test('MA10严格比较相邻十根，缺值不冒充中性',()=>{
 assert.equal(maDirection(11,10),'long');assert.equal(maDirection(9,10),'short');assert.equal(maDirection(10,10),'neutral');assert.equal(maDirection(null,10),'unknown');
 const actual=movingAverageEvidence(bars,'day','2026-09-15');assert.equal(actual.ma10,109.5);assert.equal(actual.previousMa10,108.5);
 assert.equal(movingAverageEvidence(bars.slice(0,10),'day','2026-09-10').direction,'unknown');
});
test('动态周月纳入最新收盘，未来K不进入当前证据',()=>{
 const result=periodCloses(bars,'week','2026-09-10');assert.equal(result.at(-1).date,'2026-09-10');assert.equal(result.at(-1).close,109);
 assert.equal(periodCloses(bars,'month','2026-09-10').at(-1).close,109);
 assert.equal(environmentCycle('small'),'day');assert.equal(environmentCycle('week'),'week');
});
test('板块归一化等权，不按名义价格加权，陈旧成分明确缺失',()=>{
 const index=equalWeightIndex([{code:'A',bars},{code:'B',bars:bars.map(row=>({...row,close:row.close*1000}))},{code:'C',bars:bars.slice(0,-1)}],'2026-09-15');
 assert.deepEqual(index.included,['A','B']);assert.deepEqual(index.missing,['C']);assert.equal(index.bars.at(-1).close,1140);
 assert.equal(movingAverageEvidence(index.bars,'day','2026-09-15').direction,'long');
});
test('具体合约与截止日期校验，读取不伪造刷新时间',async()=>{
 const row={code:'XX',main_contract:'XX2609',data_date:'2026-09-15',month_ma10:10,previous_month_ma10:9,week_ma10:10,previous_week_ma10:11,day_ma10:10,previous_day_ma10:10};
 const fire={target_date:'2026-09-15',refreshedAt:'2026-09-15T08:00:00Z',rows:[row]};
 const options={indexData:{name:'测试指数',source:'测试来源',fetchedAt:'2026-09-15T15:31:00+08:00',bars}};
 const card={symbol:'XX',contract:'XX2609'};
 const result=await buildEnvironment(card,fire,options);
 assert.equal(result.layers.month.direction,'long');assert.equal(result.layers.week.direction,'short');assert.equal(result.layers.day.direction,'neutral');
 assert.equal(result.layers.market.asOf,options.indexData.fetchedAt);
 assert.equal((await buildEnvironment({...card,contract:'XX2610'},fire,options)).layers.month.direction,'unknown');
 assert.equal((await buildEnvironment(card,{...fire,target_date:'2026-09-16'},options)).layers.day.direction,'unknown');
 const readAgain=await buildEnvironment(card,fire,options);assert.equal(result.hash,readAgain.hash);
 const changed=await buildEnvironment(card,{...fire,rows:[{...row,day_ma10:11}]},options);assert.notEqual(result.hash,changed.hash);
});
