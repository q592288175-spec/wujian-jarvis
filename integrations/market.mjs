import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
export function assess(snapshot,now=Date.now()){
 if(!snapshot||snapshot.schemaVersion!==1||!Array.isArray(snapshot.quotes))return {schemaVersion:1,source:'TqSdk',status:'unavailable',quotes:[],error:'行情进程尚未产生有效快照'};
 const age=now-Date.parse(snapshot.receivedAt);
 return {...snapshot,status:!Number.isFinite(age)||age>15000?'stale':snapshot.status,ageMs:Number.isFinite(age)?Math.max(0,age):null,permission:false};
}
export async function marketSnapshot(){try{return assess(JSON.parse(await readFile(resolve('.runtime/market.json'),'utf8')))}catch{return assess(null)}}
export async function marketQuery(name,args={}){
 const s=await marketSnapshot();
 if(name==='get_market_snapshot')return s;
 const q=s.quotes.filter(q=>q.symbol===args.symbol||q.requestedSymbol===args.symbol);
 if(name==='resolve_contract')return {source:s.source,status:s.status,matches:q.map(({symbol,requestedSymbol})=>({symbol,requestedSymbol})),error:q.length?undefined:'仅解析已订阅的完整合约代码，未匹配时请明确合约'};
 return {source:s.source,status:s.status,symbol:args.symbol,period:'1d',bars:q[0]?.bars||[],receivedAt:s.receivedAt,permission:false};
}
export const marketTools=['get_market_snapshot','resolve_contract','get_bars'].map(name=>({type:'function',name,description:name==='get_market_snapshot'?'读取TqSdk真实行情及状态，未连接或过期不能称为实时。':name==='resolve_contract'?'解析已订阅合约，只接受完整供应商代码。':'读取已订阅实际合约的日K，末根可能未完成。',parameters:{type:'object',properties:{symbol:{type:'string'}},required:name==='get_market_snapshot'?[]:['symbol'],additionalProperties:false}}));
