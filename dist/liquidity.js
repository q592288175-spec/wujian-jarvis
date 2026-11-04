export const LIQUIDITY_MIN=10000;
export function hasLiquidity(row){if(!row)return false;const v=row.volume,o=row.openInterest??row.open_interest??row.interest;if(typeof v!=='number'||!Number.isFinite(v)||v<=LIQUIDITY_MIN||typeof o!=='number'||!Number.isFinite(o)||o<=LIQUIDITY_MIN)return false;const dates=[row.data_date,row.volume_date,row.open_interest_date].filter(Boolean).map(String);return new Set(dates).size<2;}
export const liquidityRule={minimumExclusive:LIQUIDITY_MIN,label:'成交量、持仓量均严格＞1万手；缺失值隐藏'};
