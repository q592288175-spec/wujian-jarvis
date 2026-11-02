import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {canonical,productCode} from './monitor-engine.mjs';
import {sinaSymbol} from './monitor-sina.mjs';

const finite=v=>typeof v==='number'&&Number.isFinite(v);
const numeric=v=>v===null||v===''||typeof v==='boolean'?null:Number.isFinite(Number(v))?Number(v):null;
export const TREND_PUBLIC_SOURCE='新浪公开具体合约报价与K线（约10秒检查，可能延迟）';
const periods=new Set(['1d','30m','60m','120m']);
export function parseTrendKlines(raw,period){
 if(!periods.has(period)||typeof raw!=='string'||raw.length>2*1024*1024)throw Error('K线周期或响应大小无效');
 const begin=raw.indexOf('=('),end=raw.lastIndexOf(');');
 if(begin<0||end<begin)throw Error('公开K线返回格式无效');
 const rows=JSON.parse(raw.slice(begin+2,end));if(!Array.isArray(rows))throw Error('未取得K线数组');
 const seen=new Set(),result=[];
 for(const row of rows){
  const day=String(row.d||''),stamp=period==='1d'?day+'T00:00:00+08:00':day.replace(' ','T')+'+08:00';
  if(!/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}:\d{2})?$/.test(day)||!Number.isFinite(Date.parse(stamp)))throw Error('K线日期无效');
  const open=numeric(row.o),high=numeric(row.h),low=numeric(row.l),close=numeric(row.c);
  if(![open,high,low,close].every(v=>finite(v)&&v>0)||high<Math.max(open,close)||low>Math.min(open,close)||low>high)throw Error('K线价格字段不完整');
  if(seen.has(stamp))throw Error('K线时间重复');seen.add(stamp);
  result.push({stamp,date:period==='1d'?day:undefined,open,high,low,close,...(period==='1d'?{}:{stampKind:'end',endStamp:stamp,durationSeconds:Number(period.slice(0,-1))*60})});
 }
 result.sort((a,b)=>Date.parse(a.stamp)-Date.parse(b.stamp));return result.slice(period==='1d'?-500:-32);
}

export function publicTrendFrame(member,quote,series,calendar){
 const symbol=canonical(member.symbol),at=Date.parse(quote?.quoteAt),day=quote?.tradingDay;
 if(!Number.isFinite(at)||!day||!finite(quote.last)||!Array.isArray(calendar))return {error:'报价、交易日或日历未核验'};
 const previous=calendar.filter(d=>d<day).at(-1);let daily=(series['1d']||[]).filter(r=>r.date<day).map(r=>({...r,complete:true}));
 if(!previous||daily.at(-1)?.date!==previous)return{error:'日K未覆盖前一个交易日，等待补齐；不跨缺失日期计算'};
 const days=new Set(daily.map(r=>r.date)),lastGap=calendar.filter(d=>d>=daily[0].date&&d<day&&!days.has(d)).at(-1);
 // Use only the verified contiguous tail; a gap years ago must not invalidate
 // recent weeks, and must never be silently bridged for monthly calculations.
 if(lastGap)daily=daily.filter(r=>r.date>lastGap);
 if(daily.length<10)return{error:'最近缺口后的连续日K不足10根，暂停MA10判断'};
 // Trading-day dates and natural night-session dates differ. Preserve the former
 // explicitly; the forming daily bar starts at the actual observed session.
 const start=quote.sessionKey?.includes(':night')?quote.sessionKey.slice(0,10)+'T21:00:00+08:00':day+'T00:00:00+08:00';
 daily.push({stamp:start,date:day,open:quote.last,high:quote.last,low:quote.last,close:quote.last,complete:false,dynamicQuote:true});
 const bars={'1d':daily};
 for(const period of Object.keys(series).filter(p=>p!=='1d')){
  const values=series[period]||[],current=values.find(r=>Date.parse(r.endStamp)>at);
  if(!current)continue;
  const completed=values.filter(r=>Date.parse(r.endStamp)<=at);
  if(completed.length<10)continue;
  // Do not extrapolate a missing current candle from an old snapshot.
  // Provider bars may span the night/day recess (e.g. AU 01:00 -> 09:30).
  // Validate the trading day, not an invented uninterrupted wall-clock duration.
  const endDay=new Date(Date.parse(current.endStamp)+28800000).toISOString().slice(0,10);
  if(endDay>day||current!==values.at(-1))continue;
  bars[period]=[...completed.map(r=>({...r,complete:true})),{...current,close:quote.last,complete:false}];
 }
 return{symbol,code:member.code||productCode(symbol),name:member.name,exchange:member.exchange,source:TREND_PUBLIC_SOURCE,quote:{...quote,symbol,source:TREND_PUBLIC_SOURCE},bars};
}

export class TrendMarketFeed{
 constructor({root=resolve('.'),monitor,onFrame,fetchImpl=fetch,now=Date.now}={}){
  Object.assign(this,{root,monitor,onFrame,fetchImpl,now});this.members=new Map();this.cache=new Map();this.errors=new Map();this.pending=new Set();this.queue=[];this.inflight=0;this.smallPeriods=[];this.active=false;this.generation=0;this.configVersion=0;this.controllers=new Set();
 }
 async configure({symbols=[],periods:chosen=[],enabled=false}={}){
  const configVersion=++this.configVersion,catalog=await this.monitor.catalog();if(configVersion!==this.configVersion)return;
  this.active=enabled;this.smallPeriods=[...new Set(enabled?['30m','120m',...chosen]:[])].filter(p=>periods.has(p)&&p!=='1d');
  this.members=new Map(catalog.filter(c=>symbols.includes(canonical(c.symbol))).map(c=>[canonical(c.symbol),c]));
  this.monitor.setTrendSubscriptions?.(enabled?[...this.members.keys()]:[],this.smallPeriods);
  if(!enabled){this.generation++;for(const c of this.controllers)c.abort();this.clearQueued();return;}
  if(this.monitor.provider==='sina')for(const member of this.members.values()){const q=this.monitor.quotes.get(member.symbol);if(q)this.ingestQuote(q);else for(const period of ['1d',...this.smallPeriods])this.ensure(member,period);}
 }
 key(symbol,period){return symbol+'|'+period;}
 ensure(member,period,force=false){
  const key=this.key(member.symbol,period),value=this.cache.get(key),gap=period==='1d'?1800000:15000;
  if(this.pending.has(key)||value&&this.now()-value.at<(force?10000:gap)||this.errors.get(key)?.retryAt>this.now())return;
  this.pending.add(key);this.queue.push({member,period,key,generation:this.generation});this.pump();
 }
 clearQueued(){for(const item of this.queue)this.pending.delete(item.key);this.queue=[];}
 pump(){while(this.active&&this.inflight<3&&this.queue.length){const item=this.queue.shift();this.inflight++;this.fetchBars(item).finally(()=>{this.pending.delete(item.key);this.inflight--;if(item.generation!==this.generation&&this.active&&this.members.has(item.member.symbol))this.ensure(this.members.get(item.member.symbol),item.period);this.pump()})}}
 async fetchBars({member,period,key,generation}){
  const controller=new AbortController();this.controllers.add(controller);const timer=setTimeout(()=>controller.abort(),10000);timer.unref?.();
  try{
   const contract=sinaSymbol(member.symbol,this.now()).slice(3),method=period==='1d'?'getDailyKLine':'getFewMinLine';
   const url='https://stock2.finance.sina.com.cn/futures/api/jsonp.php/var%20_x=/InnerFuturesNewService.'+method+'?symbol='+encodeURIComponent(contract)+(period==='1d'?'':'&type='+Number(period.slice(0,-1)));
   const response=await this.fetchImpl(url,{headers:{Referer:'https://finance.sina.com.cn/futures/','User-Agent':'Mozilla/5.0'},signal:controller.signal});if(!response.ok)throw Error('公开K线 HTTP '+response.status);
   const rows=parseTrendKlines(await response.text(),period);if(rows.length<11)throw Error('不足11根具体合约K线');
   if(generation!==this.generation||!this.active)return;
   const value={rows,at:this.now(),sourceUrl:url};this.cache.set(key,value);this.errors.delete(key);
   const folder=resolve(this.root,'.runtime/trend-monitor/bars');await mkdir(folder,{recursive:true});await writeFile(resolve(folder,member.symbol.replace('.','-')+'-'+period+'.json'),JSON.stringify(value));
   const quote=this.monitor.quotes.get(member.symbol);if(quote)this.ingestQuote(quote);
  }catch(e){if(generation===this.generation)this.errors.set(key,{symbol:member.symbol,period,reason:controller.signal.aborted?'公开K线请求超时，等待重试':String(e.message).slice(0,160),at:new Date(this.now()).toISOString(),retryAt:this.now()+60000});}
  finally{clearTimeout(timer);this.controllers.delete(controller)}
 }
 ingestQuote(quote){
  if(!this.active||!this.members.has(canonical(quote.symbol)))return;
  const symbol=canonical(quote.symbol),member=this.members.get(symbol);
  if(this.monitor.provider==='tqsdk'){
   const value=this.cache.get(this.key(symbol,'tq'));
   if(value)this.onFrame({...member,symbol,source:'TqSdk',quote,bars:value.bars});return;
  }
  const series={};for(const p of ['1d',...this.smallPeriods]){const v=this.cache.get(this.key(symbol,p));if(v)series[p]=v.rows;const current=p!=='1d'&&v?.rows.some(r=>Date.parse(r.endStamp)>Date.parse(quote.quoteAt));if(!current)this.ensure(member,p,p!=='1d');}
  const frame=publicTrendFrame(member,quote,series,this.monitor.publicFeed?.calendar);
  if(frame.error){this.errors.set(this.key(symbol,'frame'),{symbol,reason:frame.error});this.onFrame({...member,symbol,source:TREND_PUBLIC_SOURCE,quote,bars:{}});return;}
  this.errors.delete(this.key(symbol,'frame'));this.onFrame(frame);
 }
 acceptTqBars(value){if(!this.active||!this.members.has(canonical(value.symbol)))return;this.cache.set(this.key(canonical(value.symbol),'tq'),{bars:value.bars,at:this.now()});const q=this.monitor.quotes.get(canonical(value.symbol));if(q)this.ingestQuote(q)}
 displayFrame(symbol){
  const member=this.members.get(canonical(symbol)),quote=this.monitor.quotes.get(canonical(symbol));if(!member||!quote)return null;
  if(this.monitor.provider==='tqsdk'){const data=this.cache.get(this.key(canonical(symbol),'tq'));return data?{...member,source:'TqSdk',quote,bars:data.bars}:null;}
  const calendar=this.monitor.publicFeed?.calendar;if(!calendar)return null;
  const local=new Date(Date.parse(quote.quoteAt)+28800000),day=local.toISOString().slice(0,10),hour=local.getUTCHours();
  const tradingDay=quote.tradingDay||(hour>=18?calendar.find(d=>d>day):calendar.find(d=>d>=day));if(!tradingDay)return null;
  const sessionKey=quote.sessionKey||(hour>=18?day+':night':hour<6?new Date(local.getTime()-86400000).toISOString().slice(0,10)+':night':day+':day');
  const series=Object.fromEntries(['1d',...this.smallPeriods].map(p=>[p,this.cache.get(this.key(canonical(symbol),p))?.rows||[]]));
  const frame=publicTrendFrame(member,{...quote,tradingDay,sessionKey},series,calendar);
  if(frame.error)return null;
  return{...frame,displayOnly:true,observedBars:series};
 }
 status(){const provider=this.monitor.provider;return{provider,source:provider==='tqsdk'?'TqSdk实时订阅':TREND_PUBLIC_SOURCE,pollIntervalMs:provider==='sina'?10000:null,loaded:this.cache.size,loading:this.inflight+this.queue.length,enabled:this.active,errors:[...this.errors.values()].map(({retryAt,...e})=>e)};}
 stop(){this.active=false;this.generation++;this.configVersion++;for(const c of this.controllers)c.abort();this.clearQueued();this.monitor.setTrendSubscriptions?.([],[]);}
}
