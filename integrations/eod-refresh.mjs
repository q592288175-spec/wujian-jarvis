import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {atomicWrite} from './research-storage.mjs';
const run=promisify(execFile),root=resolve('.');
const python=process.platform==='win32'?resolve('.venv-akshare/Scripts/python.exe'):resolve('.venv-akshare/bin/python');
const statusPath=resolve('.runtime/eod-refresh.json');
let lastAutoDate='';
const shanghai=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).reduce((o,p)=>(o[p.type]=p.value,o),{});
export function createEodRefresher({execute=()=>run(python,[resolve('integrations/eod_market.py')],{cwd:root,timeout:10*60*1000,maxBuffer:1024*1024,env:{...process.env,PYTHONUNBUFFERED:'1'}}),readStatus=async()=>JSON.parse(await readFile(statusPath,'utf8')),writeStatus=async value=>{await mkdir(resolve('.runtime'),{recursive:true});await atomicWrite(statusPath,JSON.stringify(value));},now=()=>new Date().toISOString()}={}){
 let pending=null,startedAt=null,lastFailure=null;
 function refresh(){
  if(pending)return pending;
  startedAt=now();lastFailure=null;
  pending=Promise.resolve().then(execute).then(({stdout})=>JSON.parse(stdout.trim().split(/\r?\n/).at(-1))).catch(async error=>{
   lastFailure={status:'failed',startedAt,finishedAt:now(),error:error?.killed?'盘后刷新超时，现有缓存未被本次失败覆盖':'盘后刷新失败，现有缓存未被本次失败覆盖'};
   try{await writeStatus(lastFailure)}catch{lastFailure.statusWriteFailed=true;}
   return lastFailure;
  }).finally(()=>{pending=null});
  return pending;
 }
 async function status(){
  if(pending)return{status:'refreshing',startedAt};
  if(lastFailure)return{...lastFailure};
  try{return await readStatus()}catch{return{status:'not-run'}}
 }
 return{refresh,status};
}
const refresher=createEodRefresher();
export const refreshEod=()=>refresher.refresh();
export const eodRefreshStatus=()=>refresher.status();
export function startEodSchedule(){
 void refreshEod();
 const timer=setInterval(()=>{const now=shanghai(),today=`${now.year}-${now.month}-${now.day}`,minutes=Number(now.hour)*60+Number(now.minute);if(minutes>=15*60+20&&lastAutoDate!==today){lastAutoDate=today;void refreshEod()}},30*60*1000);
 timer.unref();return()=>clearInterval(timer);
}
