import test from 'node:test';
import assert from 'node:assert/strict';
import {applyResonanceRule,resonanceLiquidity,RESONANCE_MODE} from '../integrations/resonance-rule.mjs';

const base={ok:true,data_date:'2026-10-01',volume_date:'2026-10-01',open_interest_date:'2026-10-01',volume:10001,open_interest:10001,modes:{'month-week':'多头观察'},technical_modes:{'month-week':'多头观察'}};
const weekDay={...base,volume:10001,open_interest:10001,week_direction:'上升',day_direction:'上升',week_ma10:15,latest_bar:{close:18},day_low:12,previous_day_low:11,prior_day_low:10,day_high:22,previous_day_high:21,prior_day_high:20,week_break_up:false,week_break_down:false};

test('周日新规则无需周突破且保留月周与共振原口径',()=>{
 const row={...weekDay,month_direction:'上升',modes:{'month-week':'流动性不合格','week-day':'未纳入'}};
 const result=applyResonanceRule({target_date:'2026-10-01',rows:[row]}).rows[0];
 assert.equal(result.modes['week-day'],'多头观察');assert.equal(result.modes['month-week'],'多头观察');assert.equal(result.modes['month-week-day'],'多头观察');
 assert.equal(result.liquidity_ok,true);assert.equal(result.week_break_up,false);
});

test('周日双1万手严格大于，任一不达标均剔除',()=>{
 for(const key of ['volume','open_interest'])for(const value of [9999,10000]){
  const row=applyResonanceRule({rows:[{...weekDay,[key]:value}]}).rows[0];
  assert.equal(row.modes['week-day'],'流动性不合格');assert.equal(row.week_day_liquidity_ok,false);
 }
 assert.equal(applyResonanceRule({rows:[weekDay]}).rows[0].week_day_liquidity_ok,true);
});

test('周日结构无论成立、破坏或缺失均只作辅助',()=>{
 const rows=[{...weekDay,day_low:11},{...weekDay,day_low:10},{...weekDay,previous_day_low:10},{...weekDay,day_low:null,day_high:null,week_high:null,week_low:null}];
 const results=applyResonanceRule({rows}).rows;
 assert.ok(results.every(r=>r.modes['week-day']==='多头观察'&&r.week_day_structure_auxiliary));
 assert.equal(results[1].day_low,10);
 const short={...weekDay,week_direction:'下降',day_direction:'下降',latest_bar:{close:12},day_high:30,previous_day_high:20,prior_day_high:10};
 assert.equal(applyResonanceRule({rows:[short]}).rows[0].modes['week-day'],'空头观察');
});

test('周日多空方向与周MA10价格位置严格镜像，相等不纳入',()=>{
 for(const side of ['上升','下降']){
  const rows=[14,15,16].map(close=>({...weekDay,week_direction:side,day_direction:side,latest_bar:{close}}));
  const result=applyResonanceRule({rows}).rows;
  assert.deepEqual(result.map(r=>r.modes['week-day']),side==='上升'?['未纳入','未纳入','多头观察']:['空头观察','未纳入','未纳入']);
  assert.deepEqual(result.map(r=>r.week_day_price_position),['周MA10下方','与周MA10相等','周MA10上方']);
 }
 for(const [week,day]of [['上升','下降'],['下降','上升'],['上升','走平'],['走平','上升'],['下降','走平']]){
  assert.equal(applyResonanceRule({rows:[{...weekDay,week_direction:week,day_direction:day}]}).rows[0].modes['week-day'],'未纳入');
 }
});

test('只使用当前具体合约最新收盘，不以周高低或其他价格补判',()=>{
 for(const value of [null,undefined,'',false,0,-1,NaN,Infinity]){
  for(const row of [{...weekDay,latest_bar:{close:value},close:99,week_close:99},{...weekDay,week_ma10:value}]){
   assert.equal(applyResonanceRule({rows:[row]}).rows[0].modes['week-day'],'数据不足');
  }
 }
 const result=applyResonanceRule({rows:[{...weekDay,latest_bar:{close:'18'},week_ma10:'15'}]});
 assert.equal(result.rows[0].modes['week-day'],'多头观察');
 assert.match(result.week_day_rule.price,/相等不纳入/);
 assert.match(result.week_day_rule.structure,/不参与筛选/);
});

test('周日日期与关键数据缺口不冒充技术不符合',()=>{
 const rows=[{...weekDay,volume:null},{...weekDay,week_ma10:null},{...weekDay,latest_bar:null},{...weekDay,market_current:false},{...weekDay,open_interest_date:'2026-09-30'},{...weekDay,data_date:'2026-09-30'},{...weekDay,ok:false}];
 assert.ok(applyResonanceRule({target_date:'2026-10-01',rows}).rows.every(r=>r.modes['week-day']==='数据不足'));
});

test('周日复算幂等，技术及实际数量从新规则重新统计',()=>{
 const source={rows:[weekDay,{...weekDay,volume:10000}],counts:{'week-day':{long:0},'month-week':{long:5}}};
 const original=JSON.stringify(source),result=applyResonanceRule(source);
 assert.equal(JSON.stringify(source),original);assert.deepEqual(applyResonanceRule(result),result);
 assert.equal(result.counts['week-day'].long,1);assert.equal(result.counts['week-day'].technical_long,2);assert.equal(result.counts['month-week'].long,1);
});

test('三周期同向且量仓严格超过一万手才进入共振',()=>{
 const payload=applyResonanceRule({rule_version:'v2.5',rows:[{...base,month_direction:'上升',week_direction:'上升',day_direction:'上升'}],counts:{}});
 const row=payload.rows[0];
 assert.equal(row.modes[RESONANCE_MODE],'多头观察');
 assert.equal(row.resonance_liquidity_ok,true);
 assert.equal(payload.counts[RESONANCE_MODE].long,1);
 assert.equal(payload.rule_version,'v2.6.1-resonance-strict-liquidity');
});

test('三个模式统一严格双1万手，等于或不足一万全部剔除',()=>{
 for(const key of ['volume','open_interest'])for(const value of [9999,10000,10001]){
  const row=applyResonanceRule({rows:[{...weekDay,month_direction:'上升',[key]:value}]}).rows[0];
  for(const mode of ['month-week','week-day','month-week-day'])assert.equal(row.modes[mode],value>10000?'多头观察':'流动性不合格');
 }
 const row=applyResonanceRule({rows:[{...weekDay,technical_modes:{'month-week':'未纳入'},month_direction:'上升'}]}).rows[0];
 assert.equal(row.modes['month-week'],'未纳入');
});

test('三周期全下降进入空头，混合方向不进入共振',()=>{
 const payload=applyResonanceRule({rows:[
  {...base,month_direction:'下降',week_direction:'下降',day_direction:'下降'},
  {...base,month_direction:'上升',week_direction:'上升',day_direction:'下降'}
 ]});
 assert.equal(payload.rows[0].modes[RESONANCE_MODE],'空头观察');
 assert.equal(payload.rows[1].modes[RESONANCE_MODE],'未纳入');
});

test('任一量仓低于一万或日期不一致直接标记流动性不合格',()=>{
 const low={...base,month_direction:'上升',week_direction:'上升',day_direction:'上升',volume:9999};
 const stale={...base,month_direction:'下降',week_direction:'下降',day_direction:'下降',open_interest_date:'2026-09-30'};
 const payload=applyResonanceRule({rows:[low,stale]});
 assert.equal(payload.rows[0].modes[RESONANCE_MODE],'流动性不合格');
 assert.equal(payload.rows[1].modes[RESONANCE_MODE],'流动性不合格');
 assert.equal(resonanceLiquidity(low).ok,false);
});

test('结构字段只保留原始辅助数据，不改变共振结果',()=>{
 const row={...base,month_direction:'上升',week_direction:'上升',day_direction:'上升',week_higher_low:false,day_lower_high:true};
 const result=applyResonanceRule({rows:[row]}).rows[0];
 assert.equal(result.modes[RESONANCE_MODE],'多头观察');
 assert.equal(result.resonance_structure_auxiliary,true);
 assert.equal(result.week_higher_low,false);
});

