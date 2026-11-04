// Shared by the browser and Node. Seed with the first available close (adjust=false).
// Never feed successive ticks as additional candles: replace the forming candle once.
export const INDICATOR = Object.freeze({type:'EMA',length:10,version:'ema10-v1',alpha:2/11,seed:'first-close',minPeriods:10});
export function emaSeries(values,length=10){
 if(!Number.isInteger(length)||length<1)throw Error('EMA周期必须为正整数');
 const alpha=2/(length+1);let value=null,count=0;
 return values.map(close=>{
  if(typeof close!=='number'||!Number.isFinite(close)||close<=0)throw Error('EMA收盘序列含无效值');
  value=value===null?close:value+alpha*(close-value);count++;
  return count<length?null:value;
 });
}
export function emaPair(values,length=10){
 const series=emaSeries(values,length);
 return {ma:series.at(-1)??null,previousMa:series.at(-2)??null,indicator:INDICATOR};
}
