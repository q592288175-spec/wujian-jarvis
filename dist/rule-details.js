const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

export function ruleDetailsHtml(details,selected='month-week-day'){
 const modes=details.modes||[],current=modes.some(mode=>mode.id===selected)?selected:modes[0]?.id;
 const field=(label,value)=>`<div class="rule-field"><b>${label==='三模式量仓门槛'?'量仓门槛':label}</b><p>${esc(value||'规则信息未取得')}</p></div>`;
 return`<div class="rule-details"><div class="rule-detail-meta"><b>${esc(details.version||'规则版本未知')}</b><span>行情截止：${esc(details.dataDate||'未取得')}</span></div>${details.sourceChanged?'<p class="rule-alert" role="alert">本轮规则已锁定，但当前源文件发生变化。以下保留锁定来源；当前程序输出需与锁定版本复核，不视为新规则已获准启用。</p>':''}<section class="rule-common">${field('三模式量仓门槛',details.common?.liquidity)}${field('MA10方向口径',[details.common?.direction,details.common?.directionBoundary].filter(Boolean).join('\n'))}</section><div class="rule-mode-tabs" role="tablist" aria-label="筛选模式">${modes.map(mode=>`<button type="button" role="tab" id="rule-tab-${esc(mode.id)}" data-rule-mode="${esc(mode.id)}" aria-controls="rule-panel-${esc(mode.id)}" aria-selected="${mode.id===current}" tabindex="${mode.id===current?'0':'-1'}">${esc(mode.label)}</button>`).join('')}</div>${modes.map(mode=>`<section class="rule-mode-panel" id="rule-panel-${esc(mode.id)}" role="tabpanel" aria-labelledby="rule-tab-${esc(mode.id)}" ${mode.id===current?'':'hidden'}><p class="rule-mode-version">${esc(mode.label)} · ${esc(mode.version||'版本未取得')}</p>${field('方向与入选条件',mode.direction)}${field('周K / 日K结构',mode.structure)}${field('突破条件',mode.breakout)}</section>`).join('')}<details class="rule-evidence"><summary>数据要求与规则来源</summary>${field('底层扫描样本要求',details.sampleRequirements)}<p>底层行情与样本校验通过后，再按以上工作台模式判定。量仓取当前具体主力最新有效交易日，不以连续合约量仓代替；缺失与陈旧数据不补判。</p><ul>${(details.sources||[]).map(source=>`<li><b>${esc(source.name)}</b><span>${source.available?'来源可用':'来源缺失'}</span><code>${esc(source.sha256||'哈希未取得')}</code></li>`).join('')}</ul><p>${details.runId?'本轮锁定':'当前来源'}组合哈希：<code>${esc(details.combinedHash||'未取得')}</code></p></details><p class="rule-boundary">${esc(details.boundary)}</p></div>`;
}

export function createRuleDetails({api,dialog,title,body,getMode=()=>'month-week-day'}){
 let ticket=0;
 dialog.addEventListener('close',()=>{ticket++;dialog.classList.remove('scan-rule-dialog')});
 async function open(){
  const request=++ticket;
  title.textContent='当前筛选规则';
  dialog.classList.add('scan-rule-dialog');
  body.innerHTML='<p class="rule-loading" role="status">正在读取当前规则…</p>';
  if(!dialog.open)dialog.showModal();
  try{
   const details=await api('/api/workbench/rules/detail');
   if(ticket!==request||!dialog.open)return;
   body.innerHTML=ruleDetailsHtml(details,getMode());
   const tabs=[...body.querySelectorAll('[data-rule-mode]')];
   function select(button){
    for(const tab of tabs){const active=tab===button;tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1}
    for(const panel of body.querySelectorAll('[role="tabpanel"]'))panel.hidden=panel.id!==button.getAttribute('aria-controls');
   }
   for(const [index,button] of tabs.entries()){
    button.onclick=()=>select(button);
    button.onkeydown=event=>{
     const next=event.key==='ArrowRight'?(index+1)%tabs.length:event.key==='ArrowLeft'?(index+tabs.length-1)%tabs.length:event.key==='Home'?0:event.key==='End'?tabs.length-1:null;
     if(next!==null){event.preventDefault();select(tabs[next]);tabs[next].focus()}
    };
   }
  }catch(error){
   if(ticket!==request||!dialog.open)return;
   body.innerHTML=`<p class="rule-alert" role="alert">规则读取失败：${esc(error.message)}</p><button class="rule-retry" type="button">重新读取</button>`;
   body.querySelector('.rule-retry').onclick=open;
  }
 }
 return{open};
}
