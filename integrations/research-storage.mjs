import {writeFile,rename,rm} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
export async function atomicWrite(path,text){const temp=path+'.'+randomUUID()+'.tmp';try{await writeFile(temp,text,{mode:0o600});await rename(temp,path)}finally{await rm(temp,{force:true}).catch(()=>{})}}
export function createStartGate(){let busy=false;return async function guard(start){if(busy)throw Error('研究任务正在初始化，请稍后重试');busy=true;try{return await start()}finally{busy=false}}}
