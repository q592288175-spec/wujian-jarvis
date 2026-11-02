const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const time=v=>v?new Date(v).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}):'未记录';
const money=v=>Number(v).toLocaleString('zh-CN',{maximumFractionDigits:2});
export function lockNotice(rules,showAction=true){
 if(!rules.sourceChanged)return '';
 return `<section class="hint warning" id="planLockNotice"><b>旧轮次版本待核对，暂不能提交新计划</b><p>锁定的是当轮使用的规则与程序快照，当前文件与快照不同。实际成交、保护、退出仍可记录。</p><details><summary>查看具体差异（${rules.differences?.length||0} 项）</summary>${(rules.differences||[]).map(f=>`<p><b>${esc(f.name)}</b><br><small>旧 ${esc(f.lockedHash?.slice(0,12)||'缺失')} → 当前 ${esc(f.currentHash?.slice(0,12)||'缺失')}</small></p>`).join('')}</details>${showAction?'<button type="button" class="secondary" id="openRunManagement">核对旧轮次</button>':'<p>先取消不执行的计划并核对全账户风险，确认后使用下方“结束本轮并记录结果”。</p>'}</section>`;
}
export function createCardLifecycle({api,dialog,title,body,getAccountId,getArchived,reload,toast,beforeOpen}){
 async function remove(card){
  try{
   await beforeOpen();const accountId=getAccountId(),p=await api(`/api/workbench/cards/${card.id}/removal`);
   if(accountId!==getAccountId())return;
   title.textContent=`移除 ${card.name} ${card.contract||''}`;
   body.innerHTML=`<p>从水、金、土的当前待办中一起移除。研究、${p.plans} 个计划版本、${p.executions} 条执行记录及 ${p.reviews} 条复盘全部归档保留。</p>${p.canRemove?`<form id="removeCardForm"><label class="field">原因<select name="reason"><option>测试记录，不执行</option><option>本次机会放弃，不执行</option><option>已结束，移入历史</option></select></label><label class="lifecycle-confirm"><input type="checkbox" name="confirmed" required>已核对交易软件：无该卡实际持仓，委托从未提交或已确认全部撤销。</label><p class="muted">取消本卡未执行计划并释放未成交预留，不向交易软件发撤单指令。再次关注可恢复原卡，不重置轮次预算。</p><button class="primary">确认移除并归档</button></form>`:`<p class="hint error-box">暂不能移除：${p.reasons.map(esc).join('；')}</p>`}`;
   dialog.showModal();
   const form=body.querySelector('form');if(form)form.onsubmit=async e=>{
    e.preventDefault();if(accountId!==getAccountId())return toast('账户已切换，请重新核对',true);
    const button=form.querySelector('button');button.disabled=true;
    try{await api(`/api/workbench/cards/${card.id}`,{method:'DELETE',body:JSON.stringify({confirmed:true,noOpenOrdersConfirmed:true,reason:form.elements.reason.value,token:p.token})});dialog.close();await reload();toast('已从水、金、土待办移除，历史完整保留')}
    catch(error){toast(error.message,true);button.disabled=false}
   };
  }catch(error){toast(error.message,true)}
 }
 async function history(){
  await beforeOpen();const accountId=getAccountId(),cards=getArchived();title.textContent='当前账户 · 已移除记录';
  body.innerHTML=cards.length?`<div class="card-list">${cards.map(c=>`<article class="review-version"><b>${esc(c.name)} ${esc(c.contract)}</b><p>${esc(time(c.archivedAt))} · ${esc(c.archiveReason)}</p><div class="actions"><button class="secondary" data-history="${c.id}">查看历史</button><button class="secondary" data-restore="${c.id}">恢复观察</button></div></article>`).join('')}</div>`:'<p class="empty">没有已移除记录</p>';
  dialog.showModal();
  body.querySelectorAll('[data-history]').forEach(b=>b.onclick=async()=>{try{
   const c=await api('/api/workbench/cards/'+b.dataset.history);if(accountId!==getAccountId())return;
   title.textContent=`${c.name} · 归档历史`;
   body.innerHTML=`<p>${esc(c.roundId)} · ${esc(c.archiveReason)}</p><p>计划 ${c.planHistory.length} 个版本 · 执行 ${c.executions.length} 条 · 复盘 ${c.reviews.length} 条</p><details open><summary>计划版本</summary>${c.planHistory.map(p=>`<p>版本 ${p.version} · ${esc(p.status)} · ${esc(time(p.created_at))}</p>`).join('')||'<p>未建立计划</p>'}</details><details><summary>研究、执行、复盘与审计原始记录</summary><pre class="knowledge-excerpt">${esc(JSON.stringify(c,null,2))}</pre></details>`;
  }catch(error){toast(error.message,true)}});
  body.querySelectorAll('[data-restore]').forEach(b=>b.onclick=async()=>{
   if(accountId!==getAccountId())return toast('账户已切换，请重新打开历史',true);
   if(!confirm('恢复到观察队列，保留原账户、原轮次和已使用预算。旧批准不会恢复，执行前需要重新提交计划。'))return;
   b.disabled=true;try{await api('/api/workbench/cards/'+b.dataset.restore+'/restore',{method:'POST',body:'{}'});dialog.close();await reload();toast('已恢复观察，执行前请重新提交计划')}catch(error){toast(error.message,true);b.disabled=false}
  });
 }
 return{remove,history};
}
export function confirmExecutionPlan({dialog,title,body,preview,account}){
 const {card,risk}=preview,p=card.plan.payload;
 title.textContent='确认计划 · 交给土执行';
 body.innerHTML=`<div class="evidence"><div><small>账户</small><b>${esc(account.alias)}</b></div><div><small>具体合约与方向</small><b>${esc(card.contract)} · ${card.direction==='long'?'做多':'做空'}</b></div><div><small>计划入场价 / 止损</small><b>${money(p.entry)} / ${money(p.stop)}</b></div><div><small>风险复核后手数</small><b>${risk.lots} 手</b></div><div><small>${p.sizingMode==='simple'?'止损价差风险（未含费用滑点）':'计划风险'}</small><b>${money(risk.plannedLoss)} 元</b></div><div><small>本轮剩余额度</small><b>${money(risk.remainingBudget)} 元</b></div></div><p><b>退出：</b>${esc(p.exitRule)}</p><p class="hint warning">仅核对本机已登记记录。券商持仓、委托、跨品种相关风险、保证金与流动性仍需本人核验。确认仅交接计划，不下单。</p><div class="actions"><button type="button" class="secondary" id="cancelPlanConfirm">返回修改</button><button type="button" class="primary" id="confirmPlanToEarth">确认，交给土执行</button></div>`;
 dialog.showModal();
 return new Promise(resolve=>{
  let result=false;
  const done=()=>{dialog.removeEventListener('close',done);resolve(result)};
  dialog.addEventListener('close',done,{once:true});
  body.querySelector('#cancelPlanConfirm').onclick=()=>dialog.close();
  body.querySelector('#confirmPlanToEarth').onclick=()=>{result=true;dialog.close()};
 });
}
