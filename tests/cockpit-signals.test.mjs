import test from 'node:test';
import assert from 'node:assert/strict';
import {metricChange,maSignal,activitySignals} from '../dist/cockpit-signals.js';
import {poolCandidates,sectorSummaries,POOL_MODES} from '../dist/cockpit-data.js';
test('均线上升红下降绿，走平及缺失保持中性',()=>{
 assert.equal(maSignal({day_ma10:2,previous_day_ma10:1},'day').tone,'long');
 assert.equal(maSignal({day_ma10:1,previous_day_ma10:2},'day').tone,'short');
 assert.equal(maSignal({day_ma10:1,previous_day_ma10:1},'day').label,'走平');
 assert.equal(maSignal({day_ma10:1,previous_day_ma10:null},'day').label,'数据不足');
 assert.equal(metricChange(1,0).percent,null);
});
const row={main_contract:'T2612',data_date:'2026-10-19',previous_day_date:'2026-10-16',volume:111953,open_interest:417554};
const data={contract:'T2612',bars:[{date:'2026-10-16',volume:108399,openInterest:430871},{date:'2026-10-19',volume:111953,openInterest:417554}]};
test('同合约跨周末量增红仓减绿，变化量真实计算',()=>{
 const result=activitySignals(row,data);
 assert.equal(result.volume.delta,3554);assert.equal(result.volume.tone,'long');
 assert.equal(result.open_interest.delta,-13317);assert.equal(result.open_interest.tone,'short');
});
test('换月、缺前日、临时数据、快照不一致和重复日期不着色',()=>{
 for(const d of [{...data,contract:'T2703'},{...data,bars:data.bars.slice(1)},{...data,bars:data.bars.map(b=>({...b,provisional:true}))},{...data,bars:[...data.bars,data.bars[0]]}])assert.equal(activitySignals(row,d).volume.delta,null);
 assert.equal(activitySignals({...row,volume:100},data).volume.delta,null);
 assert.equal(activitySignals({...row,market_current:false},data).volume.delta,null);
});
test('日K池和板块计数使用日K实际结果，不借用月周池',()=>{
 const rows=[{code:'CU',modes:{'day-trend':'多头观察','month-week':'未纳入'}},{code:'AL',modes:{'day-trend':'空头观察','month-week':'多头观察'}},{code:'SN',modes:{'day-trend':'未纳入','month-week':'多头观察'}}];
 assert.equal(POOL_MODES['day-trend'].label,'日K顺势');
 assert.deepEqual(poolCandidates(rows,'day-trend').map(r=>r.code),['CU','AL']);
 const s=sectorSummaries(rows,'day-trend')[0];assert.equal(s.dayTotal,2);assert.equal(s.dayLong,1);assert.equal(s.dayShort,1);
});
