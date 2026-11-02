import {execFile} from 'node:child_process';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';
import {writeFile,mkdir} from 'node:fs/promises';
import {knowledgePolicy,knowledgeIndexManifest,currentKnowledgeRules} from './knowledge-policy.mjs';

const execFileAsync=promisify(execFile);
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const PYTHON=resolve(ROOT,'.venv-akshare','Scripts','python.exe');
const SCRIPT=resolve(ROOT,'integrations','knowledge_rag.py');
const DB=resolve(ROOT,'.runtime','knowledge','knowledge.sqlite');
const CACHE=resolve(ROOT,'.runtime','knowledge','models');
const CORPUS=process.env.WUJIAN_KNOWLEDGE_ROOT||resolve(ROOT,'..','资料包','资料实验基地');
const MODEL=process.env.WUJIAN_EMBEDDING_MODEL||'BAAI/bge-small-zh-v1.5';
const MANIFEST=resolve(ROOT,'.runtime/knowledge/index-manifest.json');

async function run(args,{timeout=300000}={}){
 const {stdout}=await execFileAsync(PYTHON,['-X','utf8',SCRIPT,'--db',DB,'--cache',CACHE,'--root',CORPUS,'--model',MODEL,...args],{cwd:ROOT,timeout,maxBuffer:16*1024*1024,windowsHide:true});
 let result;try{result=JSON.parse(stdout.trim())}catch{throw Error('知识库工具没有返回有效结果')}
 if(result?.error)throw Error(result.error);
 return result;
}

let indexing=null,lastIndexError=null;
export const knowledgeStatus=async()=>({...await run(['status']),policy:await knowledgePolicy().then(p=>({version:p.version,changed:p.changed}))});
export function reindexKnowledge({full=false,noEmbeddings=false}={}){
 if(indexing)return {started:false,status:'running'};
 lastIndexError=null;
 indexing=(async()=>{await mkdir(dirname(MANIFEST),{recursive:true});await writeFile(MANIFEST,JSON.stringify(await knowledgeIndexManifest()));return run(['--manifest',MANIFEST,'reindex',...(full?['--full']:[]),...(noEmbeddings?['--no-embeddings']:[])],{timeout:60*60*1000})})().catch(error=>{lastIndexError=error.message;return {error:error.message}}).finally(()=>{indexing=null});
 return {started:true,status:'running'};
}
export const waitForKnowledgeIndex=()=>indexing;
export const knowledgeIndexError=()=>lastIndexError;
export async function searchKnowledge({query,limit=6}={}){
 if(typeof query!=='string'||!query.trim()||query.length>500)throw Error('知识库检索问题为空或过长');
 const result=await run(['search',query.trim(),'--limit',String(Math.max(1,Math.min(Number(limit)||6,12)))],{timeout:120000});
 const p=await knowledgePolicy();const approved=new Map(p.sources.filter(s=>s.verified).map(s=>[s.path.toLowerCase(),s]));
 result.hits=(result.hits||[]).map(hit=>({...hit,lifecycle:approved.has(hit.path.toLowerCase())?approved.get(hit.path.toLowerCase()).lifecycle:hit.lifecycle==='current'?'historical':hit.lifecycle}));
 result.currentRules=/共振|突破|下单|交土|规则|筛选|门槛|均线|MA10|结构|量仓|成交量|持仓量|余额|归档|删除|计划|批准|以损|风险|主力|回填/.test(query)?await currentKnowledgeRules():null;
 result.policyConflicts=p.changed;return result;
}
export async function knowledgeSource(chunkId){
 if(!Number.isInteger(Number(chunkId))||Number(chunkId)<=0)throw Error('知识片段编号无效');
 const item=await run(['source',String(Number(chunkId))]),policy=await knowledgePolicy();
 const source=policy.sources.find(s=>s.path.toLowerCase()===item.path.toLowerCase());
 return {...item,lifecycle:source?(source.verified?source.lifecycle:'pending-review'):item.lifecycle==='current'?'historical':item.lifecycle,policyConflicts:policy.changed};
}

export const knowledgeTools=[
 {name:'search_local_knowledge',description:'检索五简本地资料实验基地。系统已经按用户当前问题自动检索一次；仅当自动结果不足、需要换检索词或追问指代不清时再调用。结果包含权威等级、当前/历史状态和本地文件来源；聊天讨论不能覆盖当前正式规则。',parameters:{type:'object',properties:{query:{type:'string'},limit:{type:'integer',minimum:1,maximum:8}},required:['query'],additionalProperties:false}},
 {name:'get_knowledge_source',description:'按知识片段编号读取完整命中文段和来源元数据；仅在需要核对上下文时调用。',parameters:{type:'object',properties:{chunkId:{type:'integer'}},required:['chunkId'],additionalProperties:false}},
];

export async function knowledgeQuery(name,args){
 if(name==='search_local_knowledge')return searchKnowledge(args);
 if(name==='get_knowledge_source')return knowledgeSource(args.chunkId);
 throw Error('知识库工具未授权');
}
