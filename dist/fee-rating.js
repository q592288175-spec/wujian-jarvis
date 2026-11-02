// Display only. Missing activity or prices never produce a cost rating.
export function feeRating(row,config){
 const valid=v=>typeof v==='number'&&Number.isFinite(v);
 if(!config||![config.lower,config.upper,config.todayExpensiveMultiple].every(valid)||config.lower<0||config.upper<=config.lower||![row.open,row.previous,row.tick,row.volume,row.interest].every(valid)||row.tick<=0||row.volume<=0||row.interest<=0||row.open<0||row.previous<0)return{label:'未评级',tone:'unrated',ratio:null,todayExpensive:false,reason:'成交、持仓或费用数据不足'};
 const ratio=(row.open+row.previous)/row.tick;
 return{ratio,label:ratio<config.lower?'较低':ratio<config.upper?'适中':'偏高',tone:ratio<config.lower?'low':ratio<config.upper?'medium':'high',todayExpensive:valid(row.today)&&row.today>=0&&row.open+row.previous>0&&row.open+row.today>=config.todayExpensiveMultiple*(row.open+row.previous),reason:config.basis};
}
export function undrawnSeatSeries(series){return series.filter(s=>!s.data.some(v=>typeof v==='number'&&Number.isFinite(v))).map(s=>({name:s.name,reason:'当前区间无可比双侧持仓数据或缺估值参数'}))}
