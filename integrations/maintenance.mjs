import {spawn} from 'node:child_process';
import {readFile,readdir,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {atomicWrite} from './research-storage.mjs';
const root=resolve('.'),directory=resolve('.runtime/checkpoints'),jobPath=resolve('.runtime/maintenance-backup.json');
let running=null;
export const backupBusy=()=>!!running;
export async function maintenanceStatus(){
 let state;try{state=JSON.parse(await readFile(jobPath,'utf8'))}catch{state={status:'not-run'}}
 if(!running&&['running','verifying'].includes(state.status))state={...state,status:'interrupted',error:'上次备份中断，请重新备份；不完整恢复点不能用于恢复'};
 const folders=await readdir(directory,{withFileTypes:true}).catch(()=>[]),backups=[];
 for(const f of folders.filter(f=>f.isDirectory()&&f.name.startsWith('final-'))){try{const path=resolve(directory,f.name),m=JSON.parse(await readFile(resolve(path,'manifest.json'),'utf8'));let verified=null;try{verified=JSON.parse(await readFile(resolve(path,'verification.json'),'utf8')).verifiedAt}catch{try{verified=JSON.parse(await readFile(resolve(path,'restore-verification.json'),'utf8')).verifiedAt}catch{}}backups.push({path,status:m.status,createdAt:m.createdAt,bytes:m.totalBytes||0,files:m.files?.length||0,verifiedAt:verified})}catch{}}
 return{...state,backups:backups.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)),notice:'自用恢复点含私人资料和本机配置，请勿作为分享包发送。跨Windows用户的加密凭据需重新配置。'};
}
export async function startSystemBackup(){
 if(running)return maintenanceStatus();
 running=true;
 let state={status:'running',startedAt:new Date(Date.now()+28800000).toISOString().replace('Z','+08:00'),stage:'正在复制并生成SQLite一致性快照'};
 try{await mkdir(directory,{recursive:true});await atomicWrite(jobPath,JSON.stringify(state))}catch(error){running=null;throw error}
 const child=spawn(process.execPath,[resolve(root,'scripts/system-backup.mjs'),'backup'],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});
 let output='',error='',finished=false;child.stdout.on('data',b=>{output=(output+b).slice(-16000)});child.stderr.on('data',b=>{error=(error+b).slice(-2000)});
 const finish=async(code)=>{if(finished)return;finished=true;try{let result;try{result=JSON.parse(output.trim().split(/\r?\n/).at(-1))}catch{}if(code!==0||!result?.folder)throw Error(error||'备份未完成，请查看磁盘空间');
   state={...state,status:'verifying',stage:'正在逐文件校验',folder:result.folder};await atomicWrite(jobPath,JSON.stringify(state));running=true;
   const {verifySystemBackup}=await import('../scripts/system-backup.mjs');await verifySystemBackup(result.folder);state={...state,status:'completed',stage:'备份与哈希校验完成',finishedAt:new Date(Date.now()+28800000).toISOString().replace('Z','+08:00')};
  }catch(e){state={...state,status:'failed',error:e.message}}finally{await atomicWrite(jobPath,JSON.stringify(state)).catch(()=>{});running=null}};
 child.once('error',e=>{error=e.message;void finish(1)});child.once('exit',code=>void finish(code));return state;
}
