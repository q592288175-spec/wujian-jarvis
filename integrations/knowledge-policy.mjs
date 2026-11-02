import {readFile,readdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export const policyPath=resolve(root,'knowledge/source-manifest.json');
export async function knowledgePolicy(){
 const manifest=JSON.parse(await readFile(policyPath,'utf8'));
 const implementationChanges=[];
 for(const entry of manifest.implementations||[]){const path=resolve(root,entry.path);let actual=null;try{actual=createHash('sha256').update(await readFile(path)).digest('hex')}catch{}if(actual!==entry.sha256)implementationChanges.push({name:entry.path,path,reason:'已核验实现发生变化，当前说明待复核'})}
 const sources=[];
 for(const entry of manifest.files){const path=resolve(root,entry.path);let text='',sha256=null;try{text=await readFile(path,'utf8');sha256=createHash('sha256').update(text).digest('hex')}catch{}
  sources.push({...entry,path,text,actualHash:sha256,verified:!implementationChanges.length&&!!sha256&&sha256===entry.sha256});
 }
 return{version:manifest.version,manifest:policyPath,sources,references:manifest.references||[],changed:[...implementationChanges,...sources.filter(s=>!s.verified).map(s=>({name:s.name,path:s.path,reason:'来源与已核验版本不同，待复核'}))]};
}
export async function currentKnowledgeRules(){const p=await knowledgePolicy();return{version:p.version,source:p.manifest,documents:p.sources.map(s=>({name:s.name,path:s.path,lifecycle:s.verified?s.lifecycle:'pending-review',scope:s.scope,sha256:s.actualHash,text:s.verified?s.text:'来源已变更，当前未启用；请核对原文。'})),conflicts:p.changed,boundary:'当前清单按适用范围覆盖历史条款；不改变正式规则、锁定轮次或交易权限。'};}
export async function knowledgeIndexManifest(){
 const policy=await knowledgePolicy(),files=policy.sources.map(s=>({path:s.path,lifecycle:s.verified?s.lifecycle:'pending-review',authority:s.verified?'system':'reference',weight:s.verified?100:10}));
 for(const entry of policy.references)files.push({...entry,path:resolve(root,entry.path)});
 const skill=resolve(root,'../资料包/技能包/wujian-commodity-research');
 async function visit(dir){for(const e of await readdir(dir,{withFileTypes:true})){if(/历史|归档|__pycache__|^\./.test(e.name))continue;const path=resolve(dir,e.name);if(e.isDirectory())await visit(path);else if(/\.(md|json)$/.test(e.name))files.push({path,lifecycle:'reference',authority:'research',weight:65})}}
 await visit(skill);
 return{version:policy.version,legacyLifecycle:'historical',files};
}
