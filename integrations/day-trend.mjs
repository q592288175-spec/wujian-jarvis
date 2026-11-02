export const DAY_TREND_MODE = 'day-trend';
export const DAY_TREND_VERSION = 'v1-day-ma10-strict-extremes';
export const DAY_TREND_RULE = {
 version: DAY_TREND_VERSION,
 direction: '多头：今日与昨日的日MA10相比严格上升；空头：严格下降。走平不纳入。',
 structure: '多头：今日最低价严格高于昨日最低价；空头：今日最高价严格低于昨日最高价。今日、昨日均指同一具体合约最近两个已完成交易日，相等不纳入。',
 liquidity: '具体主力成交量与持仓量均严格大于1万手',
 breakout: '不要求突破、周月方向或收盘价位于日MA10的某一侧',
 scope: '本人2026-10-18新增的独立观察模式；不替换原三个模式或锁定轮次的开仓与风险规则',
};
const finite = value => typeof value === 'number' && Number.isFinite(value);
const positive = value => finite(value) && value > 0;
const candidate = value => ['多头观察', '空头观察'].includes(value);

export function dayTrendResult(row, targetDate) {
 const ma = row.day_ma10, previousMa = row.previous_day_ma10;
 const low = row.day_low, previousLow = row.previous_day_low;
 const high = row.day_high, previousHigh = row.previous_day_high;
 const known = /^[A-Z]{1,3}\d{3,4}$/i.test(row.main_contract || '')
  && row.market_current !== false && row.data_date && row.previous_day_date
  && row.previous_day_date < row.data_date && (!targetDate || row.data_date === targetDate)
  && (!row.day_period || row.day_period === row.data_date)
  && (!row.volume_date || row.volume_date === row.data_date)
  && (!row.open_interest_date || row.open_interest_date === row.data_date)
  && [ma, previousMa, low, previousLow, high, previousHigh].every(positive)
  && high >= low && previousHigh >= previousLow
  && finite(row.volume) && finite(row.open_interest) && row.volume >= 0 && row.open_interest >= 0;
 if (!known) return {result:'数据不足', technical:'数据不足', liquidity:false, reason:'同一具体合约的最新完成日K、前一交易日、日MA10或量仓数据不足/日期不一致'};
 const technical = ma > previousMa && low > previousLow ? '多头观察'
  : ma < previousMa && high < previousHigh ? '空头观察' : '未纳入';
 const liquidity = row.volume > 10000 && row.open_interest > 10000;
 const reason = !liquidity ? '成交量与持仓量均须严格大于1万手'
  : candidate(technical) ? technical === '多头观察' ? '日MA10向上，今日低点严格高于昨日低点' : '日MA10向下，今日高点严格低于昨日高点'
  : ma === previousMa ? '日MA10走平'
  : ma > previousMa ? '日MA10向上，但今日低点未严格高于昨日低点' : '日MA10向下，但今日高点未严格低于昨日高点';
 return {result:liquidity ? technical : '流动性不合格', technical, liquidity, reason};
}

export function applyDayTrendRule(fire = {}) {
 const rows = (fire.rows || []).map(row => {
  const result = dayTrendResult(row, fire.target_date || fire.data_date);
  return {...row, modes:{...row.modes, [DAY_TREND_MODE]:result.result},
   technical_modes:{...row.technical_modes, [DAY_TREND_MODE]:result.technical},
   day_trend_liquidity_ok:result.liquidity, day_trend_rule_reason:result.reason,
   day_trend_rule_version:DAY_TREND_VERSION};
 });
 const count = status => rows.filter(row => row.modes[DAY_TREND_MODE] === status).length;
 return {...fire, rows, day_trend_rule:DAY_TREND_RULE, counts:{...fire.counts, [DAY_TREND_MODE]:{
  long:count('多头观察'), short:count('空头观察'), excluded:count('未纳入'), illiquid:count('流动性不合格'), missing:count('数据不足'),
  technical_long:rows.filter(row => row.technical_modes[DAY_TREND_MODE] === '多头观察').length,
  technical_short:rows.filter(row => row.technical_modes[DAY_TREND_MODE] === '空头观察').length,
 }}};
}

export function selectDayTrendCandidate(input, {fire, cards, saveCard}) {
 const accountId = String(input.accountId || '').trim();
 if (!accountId) throw Error('请先选择账户');
 const code = String(input.code || '').trim().toUpperCase();
 const row = applyDayTrendRule(fire).rows.find(item => item.code === code);
 const result = row?.modes[DAY_TREND_MODE];
 if (!candidate(result)) throw Error('该品种未通过日K顺势观察条件');
 const matching = cards.filter(card => card.accountId === accountId && card.symbol === code && card.contract === row.main_contract && card.scanMode === DAY_TREND_MODE);
 const existing = matching.find(card => !card.archivedAt && !['拒绝','已结束'].includes(card.status));
 if (existing) return {...existing, reused:true};
 const archived = matching.find(card => card.archivedAt);
 if (archived) return {...archived, restoreRequired:true};
 return saveCard({accountId, symbol:row.code, name:row.name, exchange:row.exchange, contract:row.main_contract,
  direction:result === '多头观察' ? 'long' : 'short', source:`火日K顺势 ${DAY_TREND_VERSION}`, scanMode:DAY_TREND_MODE, status:'观察',
  fire:{scanDate:fire.scan_date, dataDate:row.data_date, mode:DAY_TREND_MODE, modeLabel:'日K顺势', result, values:row,
   rule:DAY_TREND_RULE, sourcePath:fire.sourcePath, evidenceValidUntil:input.evidenceValidUntil || null}});
}
