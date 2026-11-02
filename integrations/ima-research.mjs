import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {homedir} from 'node:os';
import {resolve} from 'node:path';
import {existsSync} from 'node:fs';

const run=promisify(execFile);
const node=process.execPath;
const client=process.env.WUJIAN_IMA_CLIENT||resolve(homedir(),'.codex/skills/ima-skill/ima_api.cjs');
let knowledgeBaseId=null;

async function call(path,body){
 if(!existsSync(client))throw Error('IMA未配置：请使用自己的IMA连接；当前研报来源不可用');
 const {stdout}=await run(node,[client,path,JSON.stringify(body)],{timeout:30000,maxBuffer:4*1024*1024,windowsHide:true});
 const response=JSON.parse(stdout);if(response.code!==0)throw Error(response.msg||'IMA知识库请求失败');return response.data||{};
}
async function resolveResearchBase(){
 if(knowledgeBaseId)return knowledgeBaseId;
 const data=await call('openapi/wiki/v1/search_knowledge_base',{query:'期货投研',cursor:'',limit:20});
 const item=(data.info_list||[]).find(entry=>entry.kb_name==='期货投研');if(!item)throw Error('IMA中没有找到“期货投研”知识库');knowledgeBaseId=item.kb_id;return knowledgeBaseId;
}
function reportDate(title=''){const match=String(title).match(/(20\d{2})[-年]?([01]\d)[-月]?([0-3]\d)/);return match?`${match[1]}-${match[2]}-${match[3]}`:null}

export async function searchImaResearch({product,date}){
 const name=String(product||'').trim();if(!name)throw Error('IMA研报检索缺少品种名称');
 const knowledge_base_id=await resolveResearchBase();const compact=String(date||'').replaceAll('-','');
 let data=compact?await call('openapi/wiki/v1/search_knowledge',{query:`${compact} ${name}`,knowledge_base_id,cursor:''}):{info_list:[]};
 if(!(data.info_list||[]).length)data=await call('openapi/wiki/v1/search_knowledge',{query:name,knowledge_base_id,cursor:''});
 const found=(data.info_list||[]).filter(item=>item.media_type!==99).map(item=>({title:item.title,excerpt:item.highlight_content||'',reportDate:reportDate(item.title),currentDate:reportDate(item.title)===date,type:item.media_type===1?'PDF':item.media_type===6?'文章':'资料'}));
 const items=found.filter(item=>(item.title+item.excerpt).includes(name)).sort((a,b)=>Number(b.currentDate)-Number(a.currentDate)||String(b.reportDate||'').localeCompare(String(a.reportDate||''))).slice(0,12);
 return{source:'IMA知识库「期货投研」',query:name,requestedDate:date||null,items,currentDateCount:items.filter(item=>item.currentDate).length,discardedBroadMatches:found.length-items.length,scope:'只返回标题或摘要直接出现该品种的条目；未取得原文的条目仅作机构观点线索，不能作为已核验事实。'};
}

export const imaResearchTools=[{type:'function',name:'search_ima_research_reports',description:'在用户已订阅的IMA“期货投研”知识库中检索指定品种的机构研报标题和摘要。结果可能早于研究日；未取得正文时只能作为观点线索。',parameters:{type:'object',properties:{product:{type:'string',description:'中文品种名称'},date:{type:'string',description:'研究日期 YYYY-MM-DD'}},required:['product','date'],additionalProperties:false}}];
