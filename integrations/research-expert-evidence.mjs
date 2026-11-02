import {searchResearchQuestion,searchStatus} from './research-search.mjs';
import {readResearchDocument} from './research-document.mjs';
import {focusText} from './research-evidence.mjs';

export function researchChecklist(framework){
 const specific=(framework.metrics||[]).map(m=>{
  const words=['供给','供应','产量','进口','出口','开工','需求','消费','销量','库存','仓单','利润','成本','价差','基差','升水','贴水','利率','利差','估值','盈利','资金','运价','运力','检修','产能','养殖','种植','天气','政策','汇率'].filter(w=>`${m.question} ${m.definition}`.includes(w));
  return{id:m.id,label:m.question,definition:m.definition,unit:m.unit_and_measurement,frequency:m.frequency_hint,keywords:words.length?words:[m.question],queries:[`${framework.name} ${m.question}`,`${framework.name} ${words[0]||m.question}`]};
 });
 if(framework.symbol==='FU'){
  const searches=[
   ['燃料油 炼厂','燃料油 供应 进口',['炼厂','产量','开工','检修','供给','供应','进口']],
   ['燃料油 需求','燃料油 船燃 发电',['需求','船燃','船用','发电','销量','销售']],
   ['燃料油 新加坡 库存','新加坡 燃料油 库存',['库存','存量','去库','累库']],
   ['燃料油 裂解','高硫 裂解价差',['裂解','价差','利润']]
  ];
  specific.forEach((m,i)=>{if(searches[i]){m.queries=searches[i].slice(0,2);m.keywords=searches[i][2]}});
 }
 const financial=['CFFEX'].includes(framework.exchange);
 return [...specific,...(financial?[]:[{id:'spot_basis',label:'现货、基差与近远月价差',keywords:['基差','月差','现货','升水','贴水','远月','近月'],queries:[`${framework.name} 基差`,`${framework.name} 现货`]}]),
  {id:'events',label:'政策、供需事件与反向风险',keywords:['政策','风险','利空','利多','制裁','关税','供应','需求','战争'],queries:[`${framework.name} 政策`,`${framework.name} 风险`]},
  {id:'history',label:'历史变化与季节性',keywords:['同比','环比','季节','历史','同期','往年'],queries:[`${framework.name} 库存 同比`,`${framework.name} 季节性`]}].slice(0,10);
}
export function relevantEvidence(item,framework,metric){
 const text=`${item.title||''} ${item.text||item.snippet||''}`;
 const aliases=[framework.name,...String(framework.aliases||'').split(/[,，;；]/)].filter(t=>t.length>=2&&!/^[A-Z0-9]+$/.test(t));
 if(!aliases.some(term=>text.includes(term)))return false;
 const keywords=metric.keywords||metric.label.split(/[、与及/]/).filter(t=>t.length>=2);
 return keywords.some(word=>text.includes(word));
}
export function canonicalUrl(value){try{const u=new URL(value);u.hash='';for(const k of [...u.searchParams.keys()])if(/^utm_|spm|from$/.test(k))u.searchParams.delete(k);return u.href}catch{return''}}
export function mpaSeries(records,now=new Date()){
 const groups=new Map();
 for(const row of records){
  if(!/^\d{4}-\d{2}$/.test(row.month)||row.month>now.toISOString().slice(0,7)||!/^\d+(?:\.\d+)?$/.test(String(row.bunker_sales)))continue;
  const label=String(row.bunker_type||'船燃总销售');
  if(!groups.has(label))groups.set(label,[]);
  groups.get(label).push({period:row.month,value:Number(row.bunker_sales)});
 }
 return [...groups].filter(([label])=>/Fuel Oil|总销售/i.test(label)).map(([label,raw])=>{
  const series=[...new Map(raw.map(r=>[r.period,r])).values()].sort((a,b)=>a.period.localeCompare(b.period));
  const last=series.at(-1),month=new Date(last.period+'-01T00:00:00Z');month.setUTCMonth(month.getUTCMonth()-1);
  const previous=series.find(r=>r.period===month.toISOString().slice(0,7));
  const year=series.find(r=>r.period===`${Number(last.period.slice(0,4))-1}${last.period.slice(4)}`);
  const change=base=>base?.value>0?Number(((last.value/base.value-1)*100).toFixed(2)):null;
  return {label,period:last.period,rawValue:last.value,unit:'原表数值，吨/千吨标注待交叉复核',changeMoM:change(previous),changeYoY:change(year),sampleCount:series.length,series:series.slice(-36)};
 });
}
export async function collectMpa({signal,fetchImpl=fetch,now=new Date()}={}){
 const dataset='d_4f5abbf4486bf8e52bbed3be56dde562';
 const url=`https://data.gov.sg/api/action/datastore_search?resource_id=${dataset}&limit=10000`;
 const response=await fetchImpl(url,{signal:signal?AbortSignal.any([signal,AbortSignal.timeout(18000)]):AbortSignal.timeout(18000)});
 if(!response.ok)throw Error(`MPA 数据接口 ${response.status}`);
 const data=await response.json();
 if(!data.success||!Array.isArray(data.result?.records))throw Error('MPA 数据格式不符');
 if(data.result.records.length<data.result.total)throw Error('MPA 历史返回不完整，未据此生成比较');
 const series=mpaSeries(data.result.records,now);if(!series.length)throw Error('MPA 未取得可比较序列');
 return{type:'dataset',title:'MPA 新加坡船燃分类型月度销售',source:'新加坡海事及港务管理局 / data.gov.sg',url,sourceUrl:`https://data.gov.sg/datasets/${dataset}/view`,published:null,observedPeriod:series.map(s=>s.period).sort().at(-1),fetchedAt:now.toISOString(),fullText:true,series,metricIds:['FU.driver_2','LU.driver_2','history'],originGroup:'MPA:bunker-sales',text:'官方原始序列；最新月可能为初步数。原表数值单位尚未交叉核定，不引用绝对吨数、不合并品类。以下仅为同一原表序列的同比环比，不代表高硫合约全部终端需求：\n'+series.map(s=>`${s.label}：统计月 ${s.period}，环比 ${s.changeMoM??'不可比'}%，同比 ${s.changeYoY??'不可比'}%，历史样本 ${s.sampleCount} 月`).join('\n')};
}
async function pool(values,limit,fn){let next=0;await Promise.all(Array.from({length:Math.min(limit,values.length)},async()=>{while(next<values.length){const value=values[next++];await fn(value)}}))}
export async function collectExpertEvidence(framework,{signal,onProgress=()=>{},now=new Date(),base=[],search=searchResearchQuestion,read=readResearchDocument,mpa=collectMpa}={}){
 const checklist=researchChecklist(framework),items=[],attempts=[],budget={remaining:12},providers=[];
 const seen=new Map(base.filter(i=>i.url).map(i=>[canonicalUrl(i.url),i]));
 onProgress('正在回查重要消息与交易所公告原文');
 const primary=base.filter(i=>i.url&&!i.fullText&&['news','policy'].includes(i.type)).sort((a,b)=>(b.title?.includes(framework.name)?1:0)-(a.title?.includes(framework.name)?1:0)).slice(0,10);
 await pool(primary,3,async item=>{
  signal?.throwIfAborted();item.readAttempted=true;
  try{const article=await read({url:item.url,signal});if(article.text){item.text=focusText(article.text,[framework.name,...String(framework.aliases||'').split(',')],5000);item.fullText=true;item.published=article.published||item.published;item.contentHash=article.contentHash;item.truncated=article.truncated||article.text.length>item.text.length}}
  catch(error){signal?.throwIfAborted();item.readError=error.message}
 });
 if(['FU','LU'].includes(framework.symbol)){
  try{onProgress('正在核对船燃官方月度数据与历史');items.push(await mpa({signal,now}));providers.push({name:'MPA 官方船燃统计',status:'ok',count:1})}
  catch(error){if(signal?.aborted)throw error;providers.push({name:'MPA 官方船燃统计',status:'unavailable',count:0,reason:error.message})}
 }
 let finished=0;
 await pool(checklist,3,async metric=>{
  for(let round=0;round<metric.queries.length;round++){
   signal?.throwIfAborted();
   const query=metric.queries[round],accept=item=>relevantEvidence(item,framework,metric);
   const result=await search(query,{signal,budget,now,accept}).catch(error=>{signal?.throwIfAborted();return{items:[],errors:[error.message]}});
   attempts.push({metricId:metric.id,query,round:round+1,count:result.items.length,errors:result.errors||[]});
   for(const hit of result.items.filter(accept).slice(0,3)){
    const url=canonicalUrl(hit.url);if(!url)continue;
    if(seen.has(url)){const old=seen.get(url);old.metricIds=[...new Set([...(old.metricIds||[]),metric.id])];if(!old.fullText&&!old.readAttempted){old.readAttempted=true;const article=await read({url,signal}).catch(()=>null);if(article?.text){old.text=focusText(article.text,[framework.name,...(metric.keywords||[])],6000);old.fullText=true;old.contentHash=article.contentHash;old.truncated=article.truncated||article.text.length>old.text.length}}continue}
    const item={...hit,url,type:'research',metricIds:[metric.id],fetchedAt:now.toISOString(),fullText:false,originGroup:hit.source||new URL(url).hostname};
    seen.set(url,item);items.push(item);
    const article=await read({url,signal}).catch(error=>{item.readError=error.message;return null});signal?.throwIfAborted();
    if(article?.text){item.text=focusText(article.text,[framework.name,...metric.label.split(/[、与]/)],4200);item.fullText=true;item.published=article.published||hit.published;item.source=article.source||hit.source;item.truncated=!!article.truncated||article.text.length>item.text.length;item.url=article.url||url;item.contentHash=article.contentHash;item.pages=article.pages;item.format=article.format}
   }
   if([...items,...base].some(i=>i.fullText&&i.metricIds?.includes(metric.id)&&relevantEvidence(i,framework,metric)))break;
  }
  onProgress(`专属指标采证 ${++finished}/${checklist.length}：${metric.label}`);
 });
 providers.push({name:searchStatus().provider,status:items.length?'ok':'empty',count:items.filter(i=>i.type==='research').length,reason:searchStatus().configured?null:'元宝未配置，已使用公开搜索；结果不保证覆盖全部资料'});
 return{items,checklist,attempts,providers,searchCalls:12-budget.remaining};
}
