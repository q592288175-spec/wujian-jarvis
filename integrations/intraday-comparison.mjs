const cache=new Map(),pending=new Map();
export async function intradayComparison(product,day,{fetcher=fetch,now=Date.now}={}){
 if(!product?.contract||!/^[A-Z]+\d{3,4}$/.test(product.contract))throw Error('缺少已核验的具体合约');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||product.priceType!=='具体合约最新价'||product.priceTime?.slice(0,10)!==day||!(product.previousSettlement>0))throw Error('该日期缺少同合约报价或昨结');
 const key=product.contract+'|'+day+'|'+product.previousSettlement+'|'+product.priceTime,found=cache.get(key);if(found&&now()-found.at<25000)return found.data;if(pending.has(key))return pending.get(key);
 const request=(async()=>{
  const url=new URL('https://stock2.finance.sina.com.cn/futures/api/jsonp.php/=/InnerFuturesNewService.getFewMinLine');url.searchParams.set('symbol',product.contract);url.searchParams.set('type','1');
  const response=await fetcher(url,{signal:AbortSignal.timeout(10000),headers:{Referer:'https://finance.sina.com.cn/'}});if(!response.ok)throw Error('分钟行情暂不可用');
  const raw=await response.text();if(raw.length>3000000)throw Error('分钟行情响应过大');const start=raw.indexOf('=('),end=raw.lastIndexOf(');');if(start<0||end<=start)throw Error('分钟行情格式异常');
  const rows=JSON.parse(raw.slice(start+2,end));if(!Array.isArray(rows))throw Error('分钟行情格式异常');
  const normalized=rows.map(r=>({stamp:Array.isArray(r)?r[0]:r?.d,close:Number(Array.isArray(r)?r[4]:r?.c)})),clock=product.priceTime.slice(11,19);
  if(!/^\d{2}:\d{2}:\d{2}$/.test(clock))throw Error('报价时间格式异常');
  const isNight=clock>='18:00:00'||clock<'06:00:00',previousDay=new Date(Date.parse(day+'T00:00:00Z')-86400000).toISOString().slice(0,10);
  const sessionStart=isNight?(clock<'06:00:00'?previousDay:day)+' 18:00:00':day+' 06:00:00';
  const points=normalized.filter(r=>typeof r.stamp==='string'&&/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(r.stamp)&&r.stamp>=sessionStart&&r.stamp<=product.priceTime&&Number.isFinite(r.close)&&r.close>0).map(r=>({stamp:r.stamp,value:(r.close/product.previousSettlement-1)*100})).sort((a,b)=>a.stamp.localeCompare(b.stamp));
  const data={code:product.code,contract:product.contract,baseline:product.previousSettlement,quoteTime:product.priceTime,asOf:points.at(-1)?.stamp||null,source:'新浪公开具体合约1分钟行情',basis:'相对同合约前结算价',points};cache.set(key,{at:now(),data});if(cache.size>200)cache.delete(cache.keys().next().value);return data;
 })().finally(()=>pending.delete(key));pending.set(key,request);return request;
}
