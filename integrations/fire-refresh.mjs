import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {dirname} from 'node:path';

export function createFireRefresh({path,checkRules,refreshMarket,scan,afterScan,now=()=>new Date().toISOString()}){
 let job=null,state=null;
 async function status(){
  if(!state){
   let saved;try{saved=JSON.parse(await readFile(path,'utf8'))}catch{saved={status:'not-run'}}
   if(!state)state=saved;
   if(state.status==='running')state={...state,status:'interrupted',stage:'interrupted',error:'上次刷新被中断，请重新刷新；已保留最近扫描结果'};
  }
  return {...state};
 }
 async function update(patch){
  state={...state,...patch};
  await mkdir(dirname(path),{recursive:true});
  await writeFile(path+'.tmp',JSON.stringify(state,null,2));
  await rename(path+'.tmp',path);
 }
 async function execute(){
  try{
   await update({status:'running',stage:'checking',startedAt:now(),finishedAt:null,error:null,warning:null});
   await checkRules();
   await update({stage:'market'});
   const market=await refreshMarket();
   if(!['eod-ready','ready'].includes(market?.status))await update({warning:'主力行情更新未完成，继续逐品种取数；缺失数据会明确列出'});
   await checkRules();
   await update({stage:'scan'});
   const result=await scan();
   if(result.status!=='ready'||!result.rows?.length)throw Error('没有生成有效扫描结果，已保留上次结果');
   await update({stage:'index',dataDate:result.data_date,targetDate:result.target_date,currentCount:result.current_count,noTradeCount:result.no_trade_count,universeSize:result.universe_size});
   await afterScan(result);
   await update({status:'completed',stage:'completed',finishedAt:now()});
  }catch(error){await update({status:'failed',stage:'failed',finishedAt:now(),error:error.message||'本次盘后刷新失败，请重试'})}
 }
 return {
  status,
  async start(){
   if(job)return{...await status(),status:'running'};
   state={status:'running',stage:'starting',startedAt:now(),finishedAt:null,error:null,warning:null};
   job=execute().catch(error=>{state={...state,status:'failed',stage:'failed',finishedAt:now(),error:'刷新状态保存失败：'+error.message}}).finally(()=>{job=null});
   return {...state};
  },
  async wait(){await job;return status();}
 };
}
