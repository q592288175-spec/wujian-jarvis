const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=v=>v===null||v===undefined?'未记录':Number(v).toLocaleString('zh-CN',{maximumFractionDigits:3});
const date=v=>v?new Date(v).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}):'未记录';
const nowLocal=()=>new Date(Date.now()+8*3600000).toISOString().slice(0,16);
export const pnlText=value=>value===null||value===undefined?'尚未结算':(value>0?'+':'')+num(value)+' 元';
export function tradeResult(card){
 const t=card.trade||{},pnl=t.realizedPnl;
 return `<div class="trade-result"><div><small>本笔实际净盈亏 · ${esc(t.outcome||'尚未结算')}</small><strong class="${pnl>0?'profit':pnl<0?'loss':''}">${pnlText(pnl)}</strong></div><div><small>剩余持仓</small><strong>${num(t.remainingLots)} 手</strong></div><div><small>本笔入账前 → 最后入账后</small><strong>${num(t.balanceBefore)} → ${num(t.balanceAfter)}</strong></div><div><small>账户当前账面金额</small><strong>${num(card.account?.equity)} 元</strong></div></div>`;
}
export function executionFields(card){
 const t=card.trade||{},remaining=t.remainingLots??0,kind=remaining?'close':'open';
 return `<form id="executionForm"><input type="hidden" name="requestId" value="${crypto.randomUUID()}"><fieldset class="execution-modes"><legend>记录实际执行</legend>${[['open','开仓'],['close','平仓'],['protection','调整保护']].map(([key,label])=>`<label><input type="radio" name="kind" value="${key}" ${key===kind?'checked':''} ${key!=='open'&&!remaining&&!t.requiresReconciliation?'disabled':''}>${label}</label>`).join('')}</fieldset><div class="form-grid three"><label class="field">日期与时间<input name="time" type="datetime-local" value="${nowLocal()}" required></label><label class="field">方向<input id="executionDirection" readonly></label><label class="field" data-trade-field="price">实际成交均价<input name="priceNumber" type="number" step="any" min="0" required></label><label class="field" data-trade-field="quantity">实际成交手数<input name="quantityNumber" type="number" step="1" min="1" value="${esc(remaining||card.plan?.risk?.lots||'')}" required></label><label class="field" data-trade-field="stop">止损保护价<input name="stopNumber" type="number" step="any" min="0" value="${esc(t.stop??card.plan?.payload?.stop)}"></label><label class="field" data-trade-field="reason">退出原因<select name="reason"><option>止损</option><option>止盈</option><option>主动退出</option></select></label><label class="field" data-trade-field="netPnl">本次平仓实际净盈亏（元，含成本）<input name="netPnlNumber" type="number" step="0.01" placeholder="盈利填正数，亏损填负数"></label><label class="field" data-trade-field="actualDirection">实际开仓方向（默认跟随计划）<select name="actualDirection"><option value="">跟随计划</option><option value="long">实际开多</option><option value="short">实际开空</option></select></label><label class="field wide">保护与异常说明<textarea name="notes" rows="2"></textarea></label></div><div class="actions form-section"><button class="primary" id="saveExecution">保存执行记录</button><span id="executionSaveState" role="status"></span></div></form>`;
}
export function executionRows(card){
 const xs=card.executions||[],ledger=card.trade?.ledger||[];
 return xs.length?`<div class="table-wrap"><table><thead><tr><th>时间</th><th>动作</th><th>均价／手数</th><th>保护价</th><th>退出原因</th><th>实际净盈亏</th><th>备注</th></tr></thead><tbody>${xs.map(x=>{const entries=ledger.filter(e=>e.executionId===x.id);const pnl=entries.length?entries.reduce((s,e)=>s+e.amount,0):null;return`<tr><td>${date(x.time)}</td><td>${esc(x.action)}</td><td>${num(x.price)}／${num(x.quantity)}</td><td>${num(x.payload.stop)}</td><td>${esc(x.payload.reason||'')}</td><td>${pnlText(pnl)}</td><td>${esc(x.stopStatus||'')}${(x.payload.anomalies||[]).map(a=>'<p class="hint error-box">'+esc(a)+'</p>').join('')}</td></tr>`}).join('')}</tbody></table></div>`:'<div class="empty">尚未记录实际成交</div>';
}
export function correctionFields(card){
 const xs=(card.executions||[]).filter(x=>x.payload.kind==='close');
 if(!xs.length)return'';
 return `<details class="form-section"><summary>更正已入账盈亏</summary><form id="correctionForm"><input name="requestId" type="hidden" value="${crypto.randomUUID()}"><div class="form-grid"><label class="field">平仓记录<select name="executionId">${xs.map(x=>`<option value="${x.id}">${date(x.time)} · ${x.quantity} 手</option>`).join('')}</select></label><label class="field">更正后本次实际净盈亏（元）<input type="number" step="0.01" name="netPnlNumber" required></label><label class="field wide">更正原因<input name="reason" required></label></div><button class="secondary">确认更正差额</button></form></details>`;
}
export function reviewFields(card){
 const p=card.reviews?.[0]?.payload||{};
 return `<form id="reviewForm"><input type="hidden" name="reviewMode" value="simple"><div class="form-grid"><label class="field wide">哪些做得好？<textarea name="good">${esc(p.good||p.executionConclusion||'')}</textarea></label><label class="field wide">哪些做得不好？<textarea name="bad">${esc(p.bad||p.resultConclusion||'')}</textarea></label><label class="field wide">下次要注意什么？<textarea name="next">${esc(p.next||p.lessons||'')}</textarea></label></div><div class="actions form-section"><button class="primary">保存复盘</button><span id="reviewSaveState" role="status"></span></div></form>`;
}
export function reviewHistory(card){
 return (card.reviews||[]).length?`<details class="form-section"><summary>历史复盘（${card.reviews.length}版）</summary>${card.reviews.map(r=>`<article class="review-version"><b>${date(r.createdAt)}</b><p>做得好：${esc(r.payload.good||r.payload.executionConclusion||'未填')}</p><p>做得不好：${esc(r.payload.bad||r.payload.resultConclusion||'未填')}</p><p>下次注意：${esc(r.payload.next||r.payload.lessons||'未填')}</p></article>`).join('')}</details>`:'';
}
export function archivePanel(){return '<div class="form-section"><h3>操作记录文件</h3><p id="archiveState" role="status">正在检查文件同步状态…</p><code id="archivePath" class="archive-path"></code><button type="button" class="secondary" id="copyArchivePath">复制记录目录</button></div>'}

const queues=new Map(),pending=new Set();
export function bindAutoSave(form,{key,status,restore,read,send}){
 let timer,dirty=false,last=JSON.stringify(read());
 const node=form.querySelector('#'+status);
 try{const saved=JSON.parse(localStorage.getItem(key)||'null');if(saved){restore(saved);dirty=true}}catch{}
 const show=text=>{if(node)node.textContent=text};
 function flush(){
  clearTimeout(timer);if(!dirty)return queues.get(key)||Promise.resolve();
  const snapshot=read(),encoded=JSON.stringify(snapshot);dirty=false;
  show('正在保存…');
  const task=(queues.get(key)||Promise.resolve()).catch(()=>{}).then(()=>send(snapshot)).then(()=>{
   last=encoded;show(key.includes('execution')?'草稿已保存 · 未入账':'已自动保存');
   if(localStorage.getItem(key)===encoded)localStorage.removeItem(key);
  }).catch(error=>{dirty=true;show('未同步：'+error.message+'；本机草稿已保留');throw error});
  queues.set(key,task);return task;
 }
 function changed(){
  const value=JSON.stringify(read());if(value===last&&!dirty)return;
  dirty=true;try{localStorage.setItem(key,value)}catch{}
  show('待保存…');clearTimeout(timer);timer=setTimeout(()=>void flush().catch(()=>{}),700);
 }
 form.addEventListener('input',changed);
 const controller={flush,changed,cancel(){dirty=false;clearTimeout(timer);localStorage.removeItem(key);pending.delete(controller)},onLeave(){pending.delete(controller);return flush().catch(()=>{})}};
 pending.add(controller);
 if(dirty){changed()}
 form.autoSave=controller;return controller;
}
export function flushTradeDrafts(){return Promise.all([...pending].map(c=>c.onLeave()))}
window.addEventListener('pagehide',flushTradeDrafts);

function restoreFields(form,values){
 for(const [key,value] of Object.entries(values)){
  const field=form.elements.namedItem(key)||form.elements.namedItem(key+'Number');
  if(field)field.value=value??'';
 }
}
export async function showArchive(api){
 const node=document.querySelector('#archiveState'),path=document.querySelector('#archivePath'),copy=document.querySelector('#copyArchivePath');
 if(!node)return;
 try{const state=await api('/api/workbench/operation-files');
  if(!node.isConnected)return;
  node.textContent=state.status==='error'?'文件同步失败，数据库已保存；正在重试：'+state.error:state.syncing?'文件同步中…':state.lastExportAt?'已同步 · '+date(state.lastExportAt):'等待首次同步';
  path.textContent=state.directory;
  copy.onclick=async()=>{try{await navigator.clipboard.writeText(state.directory);copy.textContent='已复制'}catch{copy.textContent='复制失败'}};
 }catch(error){node.textContent='同步状态暂不可用：'+error.message}
}
export function bindTradeUI(card,{api,formData,onSaved,toast}){
 const form=document.querySelector('#executionForm');if(!form)return;
 const endpoint='/api/workbench/cards/'+encodeURIComponent(card.id),t=card.trade||{};
 const restore=values=>{if(!(card.executions||[]).some(x=>x.externalId===values.requestId))restoreFields(form,values);setMode()};
 function setMode(){
  const kind=form.elements.kind.value;
  form.querySelector('#executionDirection').value=kind==='protection'?'调整保护':(kind==='open'?'开':'平')+(t.direction==='long'?'多':t.direction==='short'?'空':'（方向未知）');
  for(const wrapper of form.querySelectorAll('[data-trade-field]')){
   const key=wrapper.dataset.tradeField,visible=kind==='protection'?key==='stop':kind==='open'?['price','quantity','stop','actualDirection'].includes(key):!['stop','actualDirection'].includes(key);
   wrapper.hidden=!visible;
   for(const field of wrapper.querySelectorAll('input,select')){field.disabled=!visible;field.required=visible&&key!=='actualDirection'&&!(kind==='open'&&key==='stop')}
  }
 }
 restore(card.drafts?.execution?.payload||{});
 const save=bindAutoSave(form,{key:'wj-execution-'+card.id,status:'executionSaveState',restore,read:()=>formData(form),send:async payload=>{
  await api(endpoint+'/draft',{method:'POST',body:JSON.stringify({kind:'execution',payload}),keepalive:true});void showArchive(api);
 }});
 form.querySelectorAll('[name=kind]').forEach(radio=>radio.addEventListener('change',()=>{setMode();form.elements.quantityNumber.value=(form.elements.kind.value==='close'?t.remainingLots:card.plan?.risk?.lots)??'';save.changed()}));
 if(t.requiresReconciliation){form.querySelector('#saveExecution').disabled=true;form.querySelector('#executionSaveState').textContent='旧成交记录需先对账，尚不能自动入账'}
 form.onsubmit=async event=>{
  event.preventDefault();const button=form.querySelector('#saveExecution');button.disabled=true;
  try{await save.flush();const result=await api(endpoint+'/trade',{method:'POST',body:JSON.stringify(formData(form))});save.cancel();
   toast(result.archive?.status==='error'?'成交已入账，记录文件待重试同步':'实际执行已保存'+(form.elements.kind.value==='close'?'，账户金额已更新':''),result.archive?.status==='error');await onSaved();
  }catch(error){toast(error.message,true)}finally{button.disabled=false}
 };
 const correction=document.querySelector('#correctionForm');
 if(correction)correction.onsubmit=async event=>{event.preventDefault();const button=correction.querySelector('button');button.disabled=true;try{await api(endpoint+'/pnl-correction',{method:'POST',body:JSON.stringify(formData(correction))});toast('盈亏差额已更正，原记录保留');await onSaved()}catch(error){toast(error.message,true)}finally{button.disabled=false}};
 const market=document.querySelector('#tradeMarketState');
 const check=async()=>{if(!market)return;market.textContent='正在核验盘后行情…';try{const result=await api(endpoint+'/market-check');if(!market.isConnected)return;market.textContent=(result.dataDate?result.dataDate+' · ':'')+result.message+(result.referencePnl!==undefined?'；盘后参考浮盈亏 '+pnlText(result.referencePnl)+'（未入账）':'')}catch(error){market.textContent=error.message}};
 document.querySelector('#checkTradeMarket').onclick=check;void check();void showArchive(api);
}
export function bindReviewUI(card,{api,formData,toast}){
 const form=document.querySelector('#reviewForm');
 const save=bindAutoSave(form,{key:'wj-review-'+card.id,status:'reviewSaveState',restore:values=>restoreFields(form,values),read:()=>formData(form),send:async payload=>{
  await api('/api/workbench/cards/'+encodeURIComponent(card.id)+'/reviews',{method:'POST',body:JSON.stringify(payload),keepalive:true});void showArchive(api);
 }});
 form.onsubmit=async event=>{event.preventDefault();try{save.changed();await save.flush();toast('复盘已保存')}catch(error){toast(error.message,true)}};
 void showArchive(api);
}
