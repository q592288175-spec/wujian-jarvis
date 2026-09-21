import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
export function assess(snapshot,now=Date.now()){
 if(!snapshot||snapshot.schemaVersion!==1||!Array.isArray(snapshot.quotes))return {schemaVersion:1,source:'TqSdk',status:'unavailable',quotes:[],error:'行情进程尚未产生有效快照'};
 const age=now-Date.parse(snapshot.receivedAt);
 return {...snapshot,status:['unconfigured','disconnected','stopped'].includes(snapshot.status)?snapshot.status:!Number.isFinite(age)||age>15000?'stale':snapshot.status,ageMs:Number.isFinite(age)?Math.max(0,age):null,permission:false};
}
export function quoteQuality(q,now=Date.now()){
 const raw=String(q.quoteTime||'');
 const parsed=/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(raw)?Date.parse(raw.replace(' ','T').replace(/(\.\d{3})\d+$/,'$1')+'+08:00'):NaN;
 const age=now-parsed;
 const validPrice=Number.isFinite(q.last)&&q.last>0;
 const validBase=Number.isFinite(q.preClose)&&q.preClose>0;
 return {quoteAgeMs:Number.isFinite(age)?Math.max(0,age):null,timeStatus:!Number.isFinite(age)?'unknown':age < -60000?'future':age>900000?'historical':'recent',priceBasis:'last_trade',changeBasis:'previous_close',validPrice,validPreviousClose:validBase,notice:'报价年龄只描述时间差；不据此推断休市或断线。最新成交价不等于已确认日收盘价。'};
}
export function normalizeQuotes(snapshot){
 const quotes=snapshot.quotes.map(q=>({...q,changePct:Number.isFinite(q.last)&&q.last>0&&Number.isFinite(q.preClose)&&q.preClose>0?(q.last/q.preClose-1)*100:null,quality:quoteQuality(q)}));
 const retained=quotes.filter(q=>Number.isFinite(q.volume)&&q.volume>10000&&Number.isFinite(q.openInterest)&&q.openInterest>10000).length;
 return {...snapshot,quotes,quality:{scope:'已订阅的国内期货主力合约；不包含每个品种的所有月份合约',historical:quotes.filter(q=>q.quality.timeStatus==='historical').length,unknownTime:quotes.filter(q=>q.quality.timeStatus==='unknown').length,invalidPrice:quotes.filter(q=>!q.quality.validPrice||!q.quality.validPreviousClose).length},liquidity:{minimumExclusive:10000,total:quotes.length,retained,excluded:quotes.length-retained,basis:'报价所属交易日累计成交量与当前持仓量均严格大于10000手；缺失值排除'}};
}
export function filterLiquidity(snapshot){
 const normalized=normalizeQuotes(snapshot);
 const quotes=normalized.quotes.filter(q=>Number.isFinite(q.volume)&&q.volume>10000&&Number.isFinite(q.openInterest)&&q.openInterest>10000);
 return {...normalized,quotes,quality:{...normalized.quality,scope:'当前已订阅主力合约研究池，非所有月份合约'}};
}
export async function marketSnapshot(scope='research'){
 try{
  const snapshot=assess(JSON.parse(await readFile(resolve('.runtime/market.json'),'utf8')));
  return scope==='all'?normalizeQuotes(snapshot):filterLiquidity(snapshot);
 }catch{return scope==='all'?normalizeQuotes(assess(null)):filterLiquidity(assess(null))}
}
export async function marketQuery(name,args={}){
 const s=await marketSnapshot(args.scope==='all'?'all':'research');
 if(name==='get_market_snapshot')return s;
 const q=s.quotes.filter(q=>q.symbol===args.symbol||q.requestedSymbol===args.symbol);
 if(name==='resolve_contract')return {source:s.source,status:s.status,matches:q.map(({symbol,requestedSymbol})=>({symbol,requestedSymbol})),error:q.length?undefined:'仅解析已订阅的完整合约代码，未匹配时请明确合约'};
 return {source:s.source,status:s.status,symbol:args.symbol,period:'1d',bars:q[0]?.bars||[],receivedAt:s.receivedAt,permission:false};
}
export const marketTools=['get_market_snapshot','resolve_contract','get_bars'].map(name=>({type:'function',name,description:name==='get_market_snapshot'?'读取TqSdk真实行情及状态。默认返回流动性研究池；scope=all 可读取全部已订阅主力合约。未连接或过期不能称为实时。':name==='resolve_contract'?'解析已订阅合约；默认研究池，scope=all 可检索全部已订阅主力合约。':'读取已订阅实际合约的日K；scope=all 可读取低流动性合约，末根可能未完成。',parameters:{type:'object',properties:{symbol:{type:'string'},scope:{type:'string',enum:['research','all'],description:'research 为量仓均大于1万手的默认研究池；all 为全部已订阅的国内期货主力合约'}},required:name==='get_market_snapshot'?[]:['symbol'],additionalProperties:false}}));
