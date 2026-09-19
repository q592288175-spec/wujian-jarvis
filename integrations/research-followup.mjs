import {readFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {atomicWrite} from './research-storage.mjs';
export function validateFollowup(input){
 const status=input?.status,note=typeof input?.note==='string'?input.note.trim():'';
 if(!['pending','supported','refuted','expired'].includes(status)||!note||note.length>3000)throw Error('请选择复核状态并填写1—3000字依据');
 return {status,note};
}
export function createFollowupStore(dir){
 const queues=new Map();
 const path=id=>{if(!/^[a-f0-9-]{36}$/.test(id))throw Error('报告编号无效');return resolve(dir,id+'.followups.json')};
 async function list(id){try{return JSON.parse(await readFile(path(id),'utf8'))}catch(e){if(e.code==='ENOENT')return [];throw e}}
 async function add(id,input){const value=validateFollowup(input);path(id);const previous=queues.get(id)||Promise.resolve();const task=previous.catch(()=>{}).then(async()=>{await mkdir(dir,{recursive:true});const entries=await list(id);const entry={id:randomUUID(),...value,created:new Date().toISOString(),author:'user',evidenceStatus:'用户复核记录，未经独立事实核验'};entries.push(entry);await atomicWrite(path(id),JSON.stringify(entries,null,2));return entry});queues.set(id,task);try{return await task}finally{if(queues.get(id)===task)queues.delete(id)}}
 return {list,add};
}
