import test from 'node:test';
import assert from 'node:assert/strict';
import {applyDayTrendRule, dayTrendResult, selectDayTrendCandidate} from '../integrations/day-trend.mjs';
import {fireColumns, fireStructure, fireDecisions, fireCandidateQuality} from '../dist/fire-display.js';

const row = (patch = {}) => ({code:'FU',name:'燃料油',main_contract:'FU2611',exchange:'SHFE',
 data_date:'2026-10-16',previous_day_date:'2026-10-15',day_period:'2026-10-16',market_current:true,
 volume:10001,open_interest:10001,day_ma10:101,previous_day_ma10:100,
 day_low:95,previous_day_low:94,day_high:110,previous_day_high:111,
 modes:{'month-week':'未纳入','week-day':'未纳入','month-week-day':'未纳入'},...patch});
const run = patch => dayTrendResult(row(patch), '2026-10-16');

test('日K顺势多空镜像，比较今日对昨日，持平和均线走平不纳入', () => {
 assert.equal(run({}).result, '多头观察');
 assert.equal(run({day_ma10:99}).result, '空头观察');
 assert.equal(run({day_low:94}).result, '未纳入');
 assert.equal(run({day_ma10:99,day_high:111}).result, '未纳入');
 assert.equal(run({day_ma10:100}).result, '未纳入');
 assert.equal(run({day_ma10:99,day_high:112}).result, '未纳入');
 assert.equal(run({day_low:93}).result, '未纳入');
});

test('保留双严格1万手门槛，不需要周月、前天结构或日收盘位置', () => {
 for(const key of ['volume','open_interest']) {
  assert.equal(run({[key]:10000}).result, '流动性不合格');
  assert.equal(run({[key]:9999}).result, '流动性不合格');
 }
 assert.equal(run({week_direction:'下降',month_direction:'下降',prior_day_low:200,latest_bar:{close:80}}).result,'多头观察');
 assert.equal(run({ok:false}).result,'多头观察');
 assert.equal(run({day_high:109}).result,'多头观察');
 assert.equal(run({day_ma10:99,day_low:96}).result,'空头观察');
});

test('缺数据、陈旧、非同一截止时间、量仓错日及日期倒置不能进入候选', () => {
 for(const key of ['day_ma10','previous_day_ma10','day_low','previous_day_low','day_high','previous_day_high','volume','open_interest']) {
  for(const value of [null,undefined,NaN,true,'100']) assert.equal(run({[key]:value}).result,'数据不足',key);
 }
 for(const patch of [{market_current:false},{data_date:'2026-10-15'},{previous_day_date:'2026-10-16'},
  {day_period:'2026-10-15'},{volume_date:'2026-10-15'},{open_interest_date:'2026-10-15'},
  {main_contract:null},{day_high:90},{previous_day_high:90}]) assert.equal(run(patch).result,'数据不足');
 // Monday compares the previous completed trading day (Friday), not Sunday.
 assert.equal(dayTrendResult(row({data_date:'2026-10-19',day_period:'2026-10-19',previous_day_date:'2026-10-16'}),'2026-10-19').result,'多头观察');
});

test('新增观察模式保持原三模式、数据、规则版本和计数不变，重复应用一致', () => {
 const original = {data_date:'2026-10-16',rule_version:'locked',rows:[row(),row({code:'AL',day_ma10:99})],counts:{'week-day':{long:7,short:9}}};
 const before = structuredClone(original), result = applyDayTrendRule(original);
 assert.deepEqual(original,before);
 assert.deepEqual(result.counts['week-day'],before.counts['week-day']);
 assert.equal(result.rule_version,'locked');
 for(let i=0;i<2;i++)for(const mode of ['month-week','week-day','month-week-day'])assert.equal(result.rows[i].modes[mode],before.rows[i].modes[mode]);
 assert.equal(result.counts['day-trend'].long,1);assert.equal(result.counts['day-trend'].short,1);
 assert.deepEqual(applyDayTrendRule(result),result);
});

test('日K结构只看今日昨日，显示数据、同向色及日均线列，不误用旧三日辅助规则', () => {
 const item=applyDayTrendRule({rows:[row({prior_day_low:200})]}).rows[0];
 assert.deepEqual(fireColumns('day-trend').keys,['day']);
 assert.deepEqual(fireStructure(item,'day-trend','day').map(x=>x.label),['低点抬高','高点未抬高']);
 assert.match(fireStructure(item,'day-trend','day')[0].values,/昨日 94 → 今日 95/);
 assert.equal(fireStructure(item,'day-trend','day')[0].tone,'long-partial');
 assert.equal(fireCandidateQuality(item,'day-trend'),fireCandidateQuality({...item,prior_day_low:1},'day-trend'));
 assert.equal(fireDecisions(item,'day-trend')[0].cycle,'日K顺势');
});

test('日K研究记录保留模式、规则及账户，复用和归档按现有行为处理', () => {
 const input={accountId:'a',code:'FU'},fire={data_date:'2026-10-16',rows:[row()]};
 let saves=0;const saveCard=value=>{saves++;return {...value,id:'new'}};
 const card=selectDayTrendCandidate(input,{fire,cards:[],saveCard});
 assert.equal(card.accountId,'a');assert.equal(card.scanMode,'day-trend');assert.equal(card.fire.modeLabel,'日K顺势');
 assert.ok(card.fire.rule.version);assert.equal(card.status,'观察');
 const reused=selectDayTrendCandidate(input,{fire,cards:[card],saveCard});
 assert.equal(reused.reused,true);assert.equal(saves,1);
 const archived=selectDayTrendCandidate(input,{fire,cards:[{...card,archivedAt:'2026-10-16'}],saveCard});
 assert.equal(archived.restoreRequired,true);assert.equal(saves,1);
 selectDayTrendCandidate({...input,accountId:'b'},{fire,cards:[card],saveCard});assert.equal(saves,2);
 assert.throws(()=>selectDayTrendCandidate({}, {fire,cards:[],saveCard}),/账户/);
 assert.throws(()=>selectDayTrendCandidate(input,{fire:{rows:[row({day_low:90})]},cards:[],saveCard}),/未通过/);
});
