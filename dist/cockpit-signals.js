const finite=value=>typeof value==='number'&&Number.isFinite(value);
export function metricChange(current,previous){
 if(!finite(current)||!finite(previous))return {tone:'neutral',label:'数据不足',delta:null,percent:null};
 const delta=current-previous;
 return {tone:delta>0?'long':delta<0?'short':'neutral',label:delta>0?'增长':delta<0?'减少':'持平',delta,percent:previous>0?delta/previous*100:null};
}
export function maSignal(row,period){
 const result=metricChange(row[period+'_ma10'],row['previous_'+period+'_ma10']);
 return {...result,label:result.delta===null?'数据不足':result.delta>0?'上升':result.delta<0?'下降':'走平'};
}
export function activitySignals(row,data){
 const unknown={volume:metricChange(null,null),open_interest:metricChange(null,null)};
 if(!data||String(data.contract).toUpperCase()!==String(row.main_contract).toUpperCase()||row.market_current===false)return unknown;
 const bars=(data.bars||[]).filter(b=>b.provisional!==true&&b.complete!==false);
 const current=bars.filter(b=>b.date===row.data_date),previous=bars.filter(b=>b.date===row.previous_day_date);
 if(current.length!==1||previous.length!==1||!(row.previous_day_date<row.data_date))return unknown;
 return Object.fromEntries([['volume','volume'],['open_interest','openInterest']].map(([key,barKey])=>{
  const value=current[0][barKey],prior=previous[0][barKey];
  return [key,finite(value)&&finite(prior)&&value>=0&&prior>=0&&value===row[key]?metricChange(value,prior):unknown[key]];
 }));
}
