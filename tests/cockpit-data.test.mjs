import test from 'node:test';
import assert from 'node:assert/strict';
import {COCKPIT_SECTORS,dominantTone,monthWeekCandidates,poolCandidates,rowInSector,sectorSummaries,sideForRow,workflowSummary} from '../dist/cockpit-data.js';
import {displaySectors} from '../dist/display-sectors.js';

const row=(name,sector,status,quality=1)=>({
 name,code:({'铜':'CU','铝':'AL','螺纹钢':'RB','铁矿石':'I','豆粕':'M'}[name]||'RB'),sector,modes:{'month-week':status},month_ma10:100+quality,previous_month_ma10:100,
 week_ma10:100+quality,previous_week_ma10:100,week_low:100+quality,previous_week_low:100,
 week_high:100-quality,previous_week_high:100,month_break_recent_high:100+quality,
 month_break_previous_high:100,month_break_recent_low:100-quality,month_break_previous_low:100
});

test('全息版使用十一类显示板块，规则分类保持独立',()=>{
 assert.deepEqual(COCKPIT_SECTORS.slice(1),displaySectors);
 assert.deepEqual(COCKPIT_SECTORS.map(item=>item.label),['全部板块','股指','国债','贵金属','有色','新能源','黑色系','能源','化工','农产品','农副产品','其他']);
});

test('新分类单列新能源并按代码纠正历史不锈钢和纯碱分组',()=>{
 const rows=[
  {...row('不锈钢','黑色','多头观察'),code:'SS'},
  {...row('纯碱','建材','空头观察'),code:'SA'},
  {...row('碳酸锂','新能源','多头观察'),code:'LC'},
  {...row('玻璃','建材','空头观察'),code:'FG'}
 ];
 assert.deepEqual(monthWeekCandidates(rows,'nonferrous').map(item=>item.code),['SS']);
 assert.deepEqual(monthWeekCandidates(rows,'new-energy').map(item=>item.code),['LC']);
 assert.deepEqual(monthWeekCandidates(rows,'chemical').map(item=>item.code),[]);
 assert.deepEqual(monthWeekCandidates(rows,'black').map(item=>item.code),['SA','FG']);
 assert.equal(sectorSummaries(rows).slice(1).reduce((sum,item)=>sum+item.total,0),rows.length);
});

test('每个观察池以多空数量决定红绿，持平和空板块为中性',()=>{
 assert.equal(dominantTone(5,2),'long');
 assert.equal(dominantTone(2,5),'short');
 assert.equal(dominantTone(3,3),'neutral');
 assert.equal(dominantTone(0,0),'neutral');
});

test('月周候选保持多头在前且板块筛选不混入其他分组',()=>{
 const rows=[row('铁矿石','黑色','空头观察',2),row('铜','有色金属','多头观察',1),row('螺纹钢','黑色','多头观察',3),row('豆粕','农产品','未纳入')];
 assert.deepEqual(monthWeekCandidates(rows).map(item=>sideForRow(item)),['long','long','short']);
 assert.deepEqual(monthWeekCandidates(rows,'black').map(item=>item.name),['螺纹钢','铁矿石']);
 assert.equal(rowInSector(rows[1],'nonferrous'),true);
 assert.equal(rowInSector(rows[1],'black'),false);
});

test('板块统计与五行进度只使用现有业务数据',()=>{
 const rows=[row('铜','有色金属','多头观察'),row('铝','有色金属','空头观察')];
 const nonferrous=sectorSummaries(rows).find(item=>item.key==='nonferrous');
 assert.deepEqual({long:nonferrous.long,short:nonferrous.short,total:nonferrous.total},{long:1,short:1,total:2});
 const flow=workflowSummary({fireCounts:{'day-trend':{long:1,short:1},'month-week-day':{long:2,short:1}},cards:[{water:{researchStatus:'completed'},reviews:[{}]}],approvedCount:1,executionCount:2});
 assert.deepEqual(flow.map(item=>item.detail),['日K 2 个 · 共振 3 个','1 份已完成','1 张已批准','2 条流水','1 条复盘']);
});

test('全息版两个观察池使用相同候选排序但彼此独立',()=>{
 const rows=[
  {...row('月周品种','黑色','多头观察',1),modes:{'month-week':'多头观察','month-week-day':'未纳入'}},
  {...row('共振品种','黑色','多头观察',3),modes:{'month-week':'多头观察','month-week-day':'多头观察'}},
  {...row('共振空头','黑色','空头观察',2),modes:{'month-week':'未纳入','month-week-day':'空头观察'}}
 ];
 assert.deepEqual(poolCandidates(rows,'month-week-day').map(item=>item.name),['共振品种','共振空头']);
 assert.deepEqual(poolCandidates(rows,'month-week').map(item=>item.name),['月周品种','共振品种']);
 assert.equal(sideForRow(rows[1],'month-week-day'),'long');
 assert.equal(sectorSummaries(rows)[0].resonanceTotal,2);
 assert.equal(sectorSummaries(rows).find(item=>item.key==='black').resonanceTotal,2);
});
