export const RESONANCE_MODE='month-week-day';
export const RESONANCE_RULE_VERSION='v2.6.1-resonance-strict-liquidity';
export const RESONANCE_LIQUIDITY_MIN=10000;
export const WEEK_DAY_MODE='week-day';
export const WEEK_DAY_RULE_VERSION='v2-week-day-direction-week-price';

const LONG='多头观察';
const SHORT='空头观察';
const EXCLUDED='未纳入';
const ILLIQUID='流动性不合格';
const INSUFFICIENT='数据不足';

const finite=value=>{
 if(value===null||value===undefined||value===''||typeof value==='boolean')return null;
 const number=Number(value);
 return Number.isFinite(number)?number:null;
};

function datesMatch(row){
 const dates=[row?.data_date,row?.volume_date,row?.open_interest_date].filter(Boolean).map(String);
 return dates.length<2||new Set(dates).size===1;
}

export function resonanceLiquidity(row){
 if(!row?.ok)return{ok:false,reason:'行情数据不足'};
 const volume=finite(row.volume),openInterest=finite(row.open_interest);
 if(volume===null||openInterest===null)return{ok:false,reason:'成交量或持仓量缺失'};
 if(!datesMatch(row))return{ok:false,reason:'量仓日期不一致'};
 if(volume<=RESONANCE_LIQUIDITY_MIN||openInterest<=RESONANCE_LIQUIDITY_MIN){
  return{ok:false,reason:`成交量与持仓量均须严格大于${RESONANCE_LIQUIDITY_MIN.toLocaleString('zh-CN')}手`};
 }
 return{ok:true,reason:`成交量与持仓量均严格大于${RESONANCE_LIQUIDITY_MIN.toLocaleString('zh-CN')}手`};
}

function directionResult(row){
 const directions=['month','week','day'].map(period=>row?.[period+'_direction']);
 if(directions.every(value=>value==='上升'))return LONG;
 if(directions.every(value=>value==='下降'))return SHORT;
 return EXCLUDED;
}

function rowResult(row){
 if(!row?.ok)return INSUFFICIENT;
 if(!resonanceLiquidity(row).ok)return ILLIQUID;
 return directionResult(row);
}

function counts(rows){
 const technicalLong=rows.filter(row=>row.ok&&directionResult(row)===LONG).length;
 const technicalShort=rows.filter(row=>row.ok&&directionResult(row)===SHORT).length;
 const long=rows.filter(row=>row.modes?.[RESONANCE_MODE]===LONG).length;
 const short=rows.filter(row=>row.modes?.[RESONANCE_MODE]===SHORT).length;
 const illiquid=rows.filter(row=>row.modes?.[RESONANCE_MODE]===ILLIQUID).length;
 const excluded=rows.filter(row=>row.modes?.[RESONANCE_MODE]===EXCLUDED).length;
 return{long,short,technical_long:technicalLong,technical_short:technicalShort,illiquid,excluded};
}

function weekDayResult(row,targetDate){
 const volume=finite(row.volume),interest=finite(row.open_interest);
 const price=finite(row.latest_bar?.close),weekMa10=finite(row.week_ma10);
 const priceKnown=price!==null&&price>0&&weekMa10!==null&&weekMa10>0;
 const position=!priceKnown?'数据不足':price>weekMa10?'周MA10上方':price<weekMa10?'周MA10下方':'与周MA10相等';
 const context={price,position};
 const knownDirection=value=>['上升','下降','走平'].includes(value);
 if(!row.ok||row.market_current===false||targetDate&&row.data_date!==targetDate||!datesMatch(row)||volume===null||interest===null||!priceKnown||!knownDirection(row.week_direction)||!knownDirection(row.day_direction)){
  return{...context,result:INSUFFICIENT,technical:INSUFFICIENT,liquidity:false,reason:'合约行情、日期、量仓、收盘价或周日MA10数据不足',ruleReason:'关键数据不足，不能判定'};
 }
 const up=row.week_direction==='上升'&&row.day_direction==='上升';
 const down=row.week_direction==='下降'&&row.day_direction==='下降';
 const technical=up&&price>weekMa10?LONG:down&&price<weekMa10?SHORT:EXCLUDED;
 const ruleReason=technical===LONG?'周日MA10均上升，收盘价在周MA10上方':technical===SHORT?'周日MA10均下降，收盘价在周MA10下方':
  !up&&!down?'周日MA10未同向或存在走平':up?'收盘价未严格高于周MA10':'收盘价未严格低于周MA10';
 const liquidity=volume>10000&&interest>10000;
 return{...context,result:liquidity?technical:ILLIQUID,technical,liquidity,ruleReason,reason:liquidity?'成交量与持仓量均严格大于1万手':'成交量或持仓量未严格大于1万手'};
}

export function applyResonanceRule(payload={}){
 const rows=(payload.rows||[]).map(row=>{
  const technicalResult=row.ok?directionResult(row):INSUFFICIENT;
  const liquidity=resonanceLiquidity(row);
  const result=rowResult(row);
  const weekDay=weekDayResult(row,payload.target_date||payload.data_date);
  const monthTechnical=row.technical_modes?.['month-week'];
  const monthResult=!row.ok?INSUFFICIENT:!liquidity.ok?ILLIQUID:
   [LONG,SHORT,EXCLUDED,INSUFFICIENT].includes(monthTechnical)?monthTechnical:
   row.month_direction==='上升'&&row.week_direction==='上升'&&row.week_higher_low&&row.month_break_up?LONG:
   row.month_direction==='下降'&&row.week_direction==='下降'&&row.week_lower_high&&row.month_break_down?SHORT:EXCLUDED;
  const modes={...(row.modes||{}),'month-week':monthResult,[RESONANCE_MODE]:result,[WEEK_DAY_MODE]:weekDay.result};
  const technicalModes={...(row.technical_modes||{}),[RESONANCE_MODE]:technicalResult,[WEEK_DAY_MODE]:weekDay.technical};
  const attention={...(row.attention||{})};
  delete attention[RESONANCE_MODE];
  delete attention[WEEK_DAY_MODE];
  return{
   ...row,
   ...(row.attention?{attention,baseline_resonance_attention:row.baseline_resonance_attention||row.attention[RESONANCE_MODE]||null,
    baseline_week_day_attention:row.baseline_week_day_attention||row.attention[WEEK_DAY_MODE]||null}:{}),
   modes,
   liquidity_ok:liquidity.ok,
   liquidity_reason:liquidity.reason,
   technical_modes:technicalModes,
   week_day_liquidity_ok:weekDay.liquidity,
   week_day_liquidity_reason:weekDay.reason,
   week_day_rule_version:WEEK_DAY_RULE_VERSION,
   week_day_price:weekDay.price,
   week_day_price_position:weekDay.position,
   week_day_rule_reason:weekDay.ruleReason,
   week_day_structure_auxiliary:true,
   resonance_mode_result:result,
   resonance_technical_result:technicalResult,
   resonance_liquidity_ok:liquidity.ok,
   resonance_liquidity_reason:liquidity.reason,
   resonance_rule_version:RESONANCE_RULE_VERSION,
   resonance_structure_auxiliary:true
  };
 });
 const existingCounts=payload.counts||{};
 return{
  ...payload,
  rows,
  counts:{...existingCounts,'month-week':{
   long:rows.filter(r=>r.modes['month-week']===LONG).length,
   short:rows.filter(r=>r.modes['month-week']===SHORT).length,
   technical_long:rows.filter(r=>r.technical_modes['month-week']===LONG).length,
   technical_short:rows.filter(r=>r.technical_modes['month-week']===SHORT).length,
   illiquid:rows.filter(r=>r.modes['month-week']===ILLIQUID).length,
   excluded:rows.filter(r=>r.modes['month-week']===EXCLUDED).length,
   missing:rows.filter(r=>r.modes['month-week']===INSUFFICIENT).length
  },[RESONANCE_MODE]:counts(rows),[WEEK_DAY_MODE]:{
   long:rows.filter(r=>r.modes[WEEK_DAY_MODE]===LONG).length,
   short:rows.filter(r=>r.modes[WEEK_DAY_MODE]===SHORT).length,
   technical_long:rows.filter(r=>r.technical_modes[WEEK_DAY_MODE]===LONG).length,
   technical_short:rows.filter(r=>r.technical_modes[WEEK_DAY_MODE]===SHORT).length,
   illiquid:rows.filter(r=>r.modes[WEEK_DAY_MODE]===ILLIQUID).length,
   excluded:rows.filter(r=>r.modes[WEEK_DAY_MODE]===EXCLUDED).length,
   missing:rows.filter(r=>r.modes[WEEK_DAY_MODE]===INSUFFICIENT).length
  }},
  week_day_rule:{version:WEEK_DAY_RULE_VERSION,direction:'动态周MA10与日MA10同向',liquidity:'具体主力成交量与持仓量均严格 > 10,000 手',
   price:'多头：最新完成日K收盘价 > 动态周MA10；空头：最新完成日K收盘价 < 动态周MA10。该收盘价也是动态本周K的最新收盘价，相等不纳入。',
   structure:'周K、日K高低点结构仅作辅助展示，不参与筛选',breakout:'不要求周线突破'},
  resonance_rule:{
   version:RESONANCE_RULE_VERSION,
   direction:'月、周、日 MA10 三周期同向',
   liquidity:`成交量与持仓量均严格 > ${RESONANCE_LIQUIDITY_MIN} 手`,
   structures:'周K、日K低点抬高/高点抬低仅作辅助展示，不参与筛选',
   breakout:'不作为月周日共振筛选条件'
  },
  baseline_rule_version:Object.hasOwn(payload,'baseline_rule_version')?payload.baseline_rule_version:payload.rule_version||null,
  rule_version:RESONANCE_RULE_VERSION
 };
}

