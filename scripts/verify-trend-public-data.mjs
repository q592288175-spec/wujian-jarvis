import {resolve} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import {MonitorService} from '../integrations/monitor-service.mjs';
import {TrendMarketFeed} from '../integrations/trend-market.mjs';
import {trendEnvironment,intrabarMaSignal} from '../integrations/trend-monitor-engine.mjs';
const out=resolve('output/trend-monitor-2026-11-03');await mkdir(out,{recursive:true});
const all=await fetch('http://127.0.0.1:4318/api/monitor/contracts').then(r=>r.json());
const wanted=['MA','AU','SC','M','IF','LC'],items=all.items.filter(p=>wanted.includes(p.code));
const frames=new Map();const monitor=new MonitorService({root:resolve('.'),path:resolve('.runtime/trend-public-data-verification.sqlite'),getCatalog:async()=>items});monitor.selectProvider('sina');
const feed=new TrendMarketFeed({root:resolve('.runtime/trend-public-data-verification'),monitor,onFrame:frame=>frames.set(frame.code,frame)});
const listener=(type,value)=>{if(type==='quote'){const q=monitor.quotes.get(value.symbol);if(q)feed.ingestQuote(q)}};monitor.listeners.add(listener);
try{
 await feed.configure({symbols:items.map(p=>p.symbol),periods:['30m','60m','120m'],enabled:true});
 for(let i=0;i<25;i++){await new Promise(r=>setTimeout(r,1000));if(feed.inflight===0&&!feed.queue.length&&monitor.quotes.size>=items.length)break;}
 const result={at:new Date().toISOString(),source:feed.status().source,requested:items.map(p=>({code:p.code,symbol:p.symbol})),coverage:feed.status(),marketStatus:monitor.market.status,samples:items.map(p=>{const q=monitor.quotes.get(p.symbol),frame=frames.get(p.code);return {code:p.code,symbol:p.symbol,quote:q?{last:q.last,quoteAt:q.quoteAt,sessionActive:q.sessionActive,tradingDay:q.tradingDay,source:q.source}:null,klineCounts:Object.fromEntries(['1d','30m','60m','120m'].map(period=>[period,feed.cache.get(feed.key(p.symbol,period))?.rows.length||0])),environment:frame?trendEnvironment({bigPeriods:['1w','1d'],direction:'both'},frame):null,small:frame?Object.fromEntries(['30m','60m','120m'].map(period=>[period,intrabarMaSignal(frame.bars?.[period],q?.last,q?.quoteAt)])):null}}),notice:'真实公开行情与具体合约K线接口验证；没有模拟市场触发、没有发送通知。休市或陈旧数据不表示实时信号成立。'};
 await writeFile(resolve(out,'real-public-data.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({requested:result.requested,marketStatus:result.marketStatus,samples:result.samples.map(s=>({code:s.code,quoteAt:s.quote?.quoteAt,session:s.quote?.sessionActive,counts:s.klineCounts,environment:s.environment?.status})),errors:result.coverage.errors}));
}finally{feed.stop();monitor.stop();monitor.store.close()}
