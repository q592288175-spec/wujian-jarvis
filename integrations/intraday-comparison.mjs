import {publicSession} from './monitor-sina.mjs';
const cache=new Map(),pending=new Map();
export function comparisonSession(product,day,calendar){
 const days=calendar?.days||calendar,clock=product.priceTime?.slice(11,19),quoteDay=product.priceTime?.slice(0,10);
 if(!Array.isArray(days)||!days.length||!days.includes(day)&&clock>='06:00:00'&&clock<'18:00:00')throw Error('交易日历未覆盖所选日期，不能认定开盘基准');
 const tradingDay=clock>='18:00:00'?days.find(d=>d>quoteDay):clock<'06:00:00'?days.find(d=>d>=quoteDay):quoteDay;
 const previousDay=days.filter(d=>d<tradingDay).at(-1);if(!tradingDay||!previousDay)throw Error('交易日历缺少相邻交易日，无法核对夜盘起点');
 const opening=publicSession(product.exchange+'.'+product.contract,Date.parse(previousDay+'T21:00:00+08:00'),days),hasNight=opening.sessionActive&&opening.tradingDay===tradingDay;
 const start=hasNight?previousDay+' 21:00:00':tradingDay+(product.exchange==='CFFEX'?' 09:30:00':' 09:00:00');
 return {tradingDay,previousDay,hasNight,start,expectedFirst:new Date(Date.parse(start.replace(' ','T')+'+08:00')+60000+28800000).toISOString().slice(0,19).replace('T',' '),calendarSource:calendar?.source||'已核验交易日历'};
}
export async function intradayComparison(product,day,{fetcher=fetch,now=Date.now,basis='previous-settlement',calendar}={}){
 if(!product?.contract||!/^[A-Z]+\d{3,4}$/.test(product.contract))throw Error('缺少已核验的具体合约');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||product.priceType!=='具体合约最新价'||product.priceTime?.slice(0,10)!==day||basis!=='session-open'&&!(product.previousSettlement>0))throw Error('该日期缺少同合约报价或昨结');
 const session=basis==='session-open'?comparisonSession(product,day,calendar):null;
 const key=[basis,session?.start,product.contract,day,product.previousSettlement,product.priceTime].join('|'),found=cache.get(key);if(found&&now()-found.at<25000)return found.data;if(pending.has(key))return pending.get(key);
 const request=(async()=>{
  const url=new URL('https://stock2.finance.sina.com.cn/futures/api/jsonp.php/=/InnerFuturesNewService.getFewMinLine');url.searchParams.set('symbol',product.contract);url.searchParams.set('type','1');
  const response=await fetcher(url,{signal:AbortSignal.timeout(10000),headers:{Referer:'https://finance.sina.com.cn/'}});if(!response.ok)throw Error('分钟行情暂不可用');
  const raw=await response.text();if(raw.length>3000000)throw Error('分钟行情响应过大');const start=raw.indexOf('=('),end=raw.lastIndexOf(');');if(start<0||end<=start)throw Error('分钟行情格式异常');
  const rows=JSON.parse(raw.slice(start+2,end));if(!Array.isArray(rows))throw Error('分钟行情格式异常');
  const normalized=rows.map(r=>({stamp:Array.isArray(r)?r[0]:r?.d,open:Number(Array.isArray(r)?r[1]:r?.o),close:Number(Array.isArray(r)?r[4]:r?.c)})),clock=product.priceTime.slice(11,19);
  if(!/^\d{2}:\d{2}:\d{2}$/.test(clock))throw Error('报价时间格式异常');
  const isNight=clock>='18:00:00'||clock<'06:00:00',previousDay=new Date(Date.parse(day+'T00:00:00Z')-86400000).toISOString().slice(0,10);
  const sessionStart=session?.start||(isNight?(clock<'06:00:00'?previousDay:day)+' 18:00:00':day+' 06:00:00');
  const usable=normalized.filter(r=>typeof r.stamp==='string'&&/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(r.stamp)&&r.stamp>=sessionStart&&r.stamp<=product.priceTime&&Number.isFinite(r.close)&&r.close>0).sort((a,b)=>a.stamp.localeCompare(b.stamp));
  const baseline=session?usable[0]?.open:product.previousSettlement;
  if(session&&(!(baseline>0)||usable[0]?.stamp!==session.expectedFirst))throw Error('缺少本交易日开盘首分钟或开盘价，无法归零；不以日盘或首个残缺样本替代');
  const points=usable.map(r=>({stamp:r.stamp,price:r.close,value:(r.close/baseline-1)*100}));
  if(session)points.unshift({stamp:session.start,price:baseline,value:0,kind:'open-baseline'});
  const data={code:product.code,contract:product.contract,baseline,baselineAt:session?.start||null,tradingDay:session?.tradingDay||null,requestedDate:day,session:session?{hasNight:session.hasNight,calendarSource:session.calendarSource}:null,quoteTime:product.priceTime,asOf:points.at(-1)?.stamp||null,source:'新浪公开具体合约1分钟行情',basis:session?'同一交易日开盘归零（夜盘＋日盘）':'相对同合约前结算价',basisKey:basis,points};cache.set(key,{at:now(),data});if(cache.size>200)cache.delete(cache.keys().next().value);return data;
 })().finally(()=>pending.delete(key));pending.set(key,request);return request;
}
