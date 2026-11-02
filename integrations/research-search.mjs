import {readFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {atomicWrite} from './research-storage.mjs';
import {searchLatestNews,searchSources,allowedNewsSource} from './research-sources.mjs';

let reservation=Promise.resolve();
const usageFile=resolve(process.env.WUJIAN_RESEARCH_SEARCH_USAGE||'.runtime/private/research-search-usage.json');
const key=()=>process.env.TENCENTCLOUD_WSA_APIKEY||process.env.YUANBAO_API_KEY||'';
export function searchStatus(){const raw=Number(process.env.WUJIAN_SEARCH_DAILY_LIMIT??60);return {configured:!!key(),provider:key()?'元宝搜索 + 公开来源':'公开来源',dailyLimit:Number.isFinite(raw)?Math.min(500,Math.max(0,Math.floor(raw))):0}}
export function parseYuanbao(data){
 if(data.Response?.Error)throw Error('元宝搜索暂不可用，请核对授权、余额或额度');
 return (Array.isArray(data.Response?.Pages)?data.Response.Pages:[]).flatMap(page=>{
  try{const p=typeof page==='string'?JSON.parse(page):page;if(!allowedNewsSource(p.url))return[];
   return[{title:String(p.title||''),url:p.url,published:p.date||null,text:String(p.passage||'').slice(0,2000),source:p.site||'元宝搜索结果',fullText:false}];
  }catch{return[]}
 });
}
async function reserveCall(){
 const task=reservation.then(async()=>{
  const day=new Date(Date.now()+28800000).toISOString().slice(0,10);
  let value;try{value=JSON.parse(await readFile(usageFile,'utf8'))}catch(error){if(error.code!=='ENOENT')throw Error('搜索用量记录不可读，为避免超额已停止请求')}
  if(value?.date!==day)value={date:day,calls:0};
  if(!Number.isInteger(value.calls)||value.calls<0)throw Error('搜索用量记录异常');
  if(value.calls>=searchStatus().dailyLimit)throw Error('已达到本机每日搜索调用上限');
  await mkdir(resolve(usageFile,'..'),{recursive:true});value.calls++;
  await atomicWrite(usageFile,JSON.stringify(value));return value;
 });reservation=task.catch(()=>{});return task;
}
export async function yuanbaoSearch(query,{signal,fetchImpl=fetch,reserve=reserveCall,apiKey=key()}={}){
 if(!apiKey)throw Error('元宝搜索未配置');
 await reserve();
 const response=await fetchImpl('https://api.wsa.cloud.tencent.com/SearchPro',{method:'POST',redirect:'error',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({Query:query}),signal:signal?AbortSignal.any([signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000)});
 if(!response.ok)throw Error(`元宝搜索请求失败（${response.status}）`);
 return parseYuanbao(await response.json());
}
export async function searchResearchQuestion(query,{signal,budget,now=new Date(),accept=()=>true}={}){
 signal?.throwIfAborted();const errors=[],items=[];
 if(key()&&budget&&budget.remaining>0){
  budget.remaining--;
  try{items.push(...(await yuanbaoSearch(query,{signal})).filter(accept))}catch(error){errors.push(error.message)}
 }
 if(!items.length){
  const news=await searchLatestNews({query:query.slice(0,60),days:60,limit:30,now}).catch(error=>{errors.push(error.message);return{items:[]}});
  items.push(...news.items.filter(accept));
 }
 if(!items.length){
  const official=await searchSources({query}).catch(()=>({items:[]}));
  items.push(...official.items.map(item=>({...item,text:item.snippet,fullText:false})));
 }
 signal?.throwIfAborted();
 return{items:items.filter(accept).slice(0,6),errors};
}
