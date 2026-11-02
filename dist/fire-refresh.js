import {refreshMinute} from './fire-display.js';

export function fireRefreshText(f){
 const refresh=f.refresh||{},time=refresh.finishedAt||refresh.startedAt||f.refreshedAt;
 const stages={starting:'正在启动',checking:'正在检查当前规则',market:'正在更新主力合约行情',scan:'正在扫描全部品种',index:'正在更新月周日结果',completed:'刷新完成',failed:'刷新失败',interrupted:'上次刷新被中断'};
 return {time:refreshMinute(time),message:stages[refresh.stage]||(f.refreshing?'正在刷新':'')};
}

export function bindFireRefresh({button,api,onStarted,onError}){
 button.onclick=async()=>{
  button.disabled=true;button.textContent='刷新中';
  try{await api('/api/workbench/fire/refresh',{method:'POST',body:'{}'});await onStarted()}
  catch(error){button.disabled=false;button.textContent='刷新盘后数据';onError(error)}
 };
}

export function updateFireRefresh(root,f){
 const refresh=fireRefreshText(f),button=root.querySelector('#refreshFire'),status=root.querySelector('#fireRefreshStatus'),time=root.querySelector('#fireRefreshTime');
 const text=(node,value)=>{if(node&&node.textContent!==value)node.textContent=value};
 if(button){button.disabled=Boolean(f.refreshing);text(button,f.refreshing?'刷新中':'刷新盘后数据')}
 const review=root.querySelector('#postmarketReview');if(review)review.disabled=Boolean(f.refreshing);
 text(time,refresh.time);
 if(status){
  status.hidden=!refresh.message&&!f.refreshError;
  status.classList.toggle('error-box',Boolean(f.refreshError));
  text(status,[refresh.message,f.refreshing?'上次结果保留，完成后自动更新':`行情日期 ${f.data_date||'未知'}`,f.refresh?.warning,f.refreshError].filter(Boolean).join(' · '));
 }
}

// Progress changes do not replace the candidate list or interrupt reading.
export function createFireRefreshPoller({load,isActive,onProgress,onResult,onError,delay=3000,setTimer=setTimeout,clearTimer=clearTimeout}){
 let timer=null,generation=0;
 const key=f=>JSON.stringify([f.status,f.sourcePath,f.refreshedAt,f.data_date]);
 function stop(){generation++;clearTimer(timer);timer=null}
 function start(snapshot){
  stop();
  if(!snapshot.refreshing||!isActive())return;
  const version=generation,snapshotKey=key(snapshot),current=()=>version===generation&&isActive();
  const schedule=()=>{if(current())timer=setTimer(tick,delay)};
  async function tick(){
   timer=null;
   if(!current())return;
   try{
    const next=await load();
    if(!current())return;
    onProgress(next);
    if(key(next)!==snapshotKey||!next.refreshing){await onResult(next);return}
   }catch(error){if(!current())return;onError(error)}
   schedule();
  }
  schedule();
 }
 return {start,stop};
}
