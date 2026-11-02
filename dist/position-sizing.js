import Decimal from './vendor/decimal/decimal.js';
const Money = Decimal.clone({precision:40});

export const ENTRY_PAIRS = ['穿10均线入场 / 平台止损','反K入场 / 前一根反K止损','反K突破入场 / 反K最低点止损','清晰单边入场 / 前一根最低点止损'];

export function simpleSizing(account = {}, plan = {}, environment = {}) {
 const valid = value => typeof value === 'number' && Number.isFinite(value);
 const missing = [];
 const equityValid = valid(account.equity) && account.equity > 0;
 const percentValid = valid(plan.riskPercent) && plan.riskPercent > 0 && plan.riskPercent <= 100;
 if (!equityValid) missing.push('实际账户金额');
 if (!percentValid) missing.push('有效亏损百分比');
 const pricesValid = valid(plan.entry) && valid(plan.stop) && plan.entry > 0 && plan.stop > 0 && plan.entry !== plan.stop;
 const directionValid = ['long','short'].includes(plan.direction) && pricesValid &&
   (plan.direction === 'long' ? plan.stop < plan.entry : plan.stop > plan.entry);
 if (!pricesValid) missing.push('有效入场价与止损保护价');
 else if (!directionValid) missing.push('多头止损须低于入场价，空头止损须高于入场价');
 const multiplierValid = valid(plan.multiplier) && plan.multiplier > 0;
 if (!multiplierValid) missing.push('该品种的每点金额暂不可用');
 const tickValid = plan.tickSize === undefined || (valid(plan.tickSize) && plan.tickSize > 0);
 let aligned = tickValid;
 if (pricesValid && tickValid && plan.tickSize !== undefined) {
  aligned = new Money(plan.entry).mod(plan.tickSize).isZero() && new Money(plan.stop).mod(plan.tickSize).isZero();
 }
 if (!aligned) missing.push('价格须符合该品种的最小变动价位');
 const budget = equityValid && percentValid ? new Money(account.equity).mul(plan.riskPercent).div(100) : null;
 const distance = pricesValid ? new Money(plan.entry).minus(plan.stop).abs() : null;
 const perLot = distance && multiplierValid ? distance.mul(plan.multiplier) : null;
 const quantity = budget && perLot?.gt(0) && aligned ? budget.div(perLot).floor().toNumber() : null;
 const riskCapLots = Number.isSafeInteger(quantity) ? quantity : null;
 const lots = missing.length ? null : riskCapLots;
 if (!missing.length && lots === null) missing.push('计算结果超出有效范围');
 return {sizingMode:'simple',baseEquity:account.equity ?? null,equityEstimated:false,
  finalPct:percentValid ? plan.riskPercent/100 : 0,frozenBudget:budget?.toNumber()??null,
  remainingBudget:budget?.toNumber()??null,stopDistance:distance?.toNumber()??null,
  riskPerLot:perLot?.toNumber()??null,lots,riskCapLots,
  plannedLoss:lots === null ? null : perLot.mul(lots).toNumber(),environment,missing,permission:false};
}
