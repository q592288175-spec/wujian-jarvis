import {mountShell} from './shell.js';
import {mountTqLogin} from './tq-login-ui.js';
mountTqLogin();
import {createAccountUI,accountSummary} from './account-ui.js';
import {fireStructure,refreshMinute} from './fire-display.js';
import {POOL_MODES,RESONANCE_MODE,cycleTone,dominantTone,poolCandidates,sectorForKey,sectorSummaries,sideForRow,workflowSummary} from './cockpit-data.js';
import {displaySectorFor as sectorFor} from './display-sectors.js';
import {VoiceController} from './voice.js';
import {createRuleDetails} from './rule-details.js';
import {createMonitorUI,bellIcon} from './monitor-ui.js';
import {GLOBE_PALETTE,globePaletteKey} from './globe-palette.js';
import {maSignal,activitySignals} from './cockpit-signals.js';

const $=selector=>document.querySelector(selector);
const $$=selector=>[...document.querySelectorAll(selector)];
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const fmt=(value,digits=0)=>value===null||value===undefined||value===''?'未知':Number(value).toLocaleString('zh-CN',{maximumFractionDigits:digits});
const modeLabels={'month-week-day':'月周日','month-week':'月周','week-day':'周日','day-trend':'日K顺势'};
const activityCache=new Map();
const tierLabels={normal:'正常',conservative:'保守',aggressive:'积极',unknown:'未知'};
const state={summary:null,fire:null,accountId:localStorage.getItem('wj-account')||'',sector:'all',side:'all',poolMode:RESONANCE_MODE,selectedCode:''};
let assistantConfigured=false;
const accountUI=createAccountUI({api,getAccount:()=>state.summary?.account,onChange:async result=>{if(result.action==='add')state.accountId=result.account.id;if(['deleted','disabled'].includes(result.action))state.accountId='';await loadData(false);localStorage.setItem('wj-balance-revision',crypto.randomUUID());toast('账户资料已同步')}});
accountUI.bind(document,'全息版顶部');
window.addEventListener('storage',event=>{if(['wj-account','wj-balance-revision','wj-card-revision'].includes(event.key)){state.accountId=localStorage.getItem('wj-account')||'';loadData(false).catch(error=>toast(error.message,true))}});

const monitorUI=createMonitorUI({api,toast});

async function api(path,options={}){
 const headers=options.body?{'Content-Type':'application/json'}:{};
 const response=await fetch(path,{...options,headers:{...headers,...options.headers}});
 const data=await response.json().catch(()=>({error:'服务响应格式异常'}));
 if(!response.ok)throw Error(data.error||`请求失败 ${response.status}`);
 return data;
}

function toast(message,error=false){
 const node=$('#toast');
 node.textContent=message;
 node.className=error?'show error':'show';
 clearTimeout(toast.timer);
 toast.timer=setTimeout(()=>node.className='',2800);
}

function accountOptions(){
 return (state.summary?.accounts||[]).map(account=>`<option value="${esc(account.id)}" ${account.id===state.accountId?'selected':''}>${esc(account.alias)}${account.status==='disabled'?'（已停用）':''}</option>`).join('');
}

function cardForRow(row){
 return (state.summary?.cards||[]).find(card=>card.symbol===row.code);
}

function candidates(){
 return poolCandidates(state.fire?.rows||[],state.poolMode,state.sector,state.side);
}

function renderHeader(){
 const summary=state.summary,account=summary.account||{};
 $('#accountSelect').innerHTML=accountOptions();
 $('#marketDate').textContent=state.fire?.data_date||summary.marketDate||'数据待刷新';
 $('#ruleVersion').textContent=summary.ruleVersion||'规则未知';
 $('#healthDot').classList.add('ok');
 $('#healthText').textContent='盘后业务库已连接';
 $('#accountTier').textContent=tierLabels[account.tier]||'未知';
 $('#accountEquity').textContent=fmt(account.equity);
 $('#accountSummary').innerHTML=accountSummary(account);
 $('#plannedRisk').textContent=fmt(summary.plannedRisk,2);
 $('#stopState').textContent=account.stopped?'已停机':'未触发停机';
}

function renderSectorNav(){
 const summaries=sectorSummaries(state.fire?.rows||[],state.poolMode);
 const count=(label,total,long,short)=>`<span class="pool-count" title="${label}：多头 ${long} 个 / 空头 ${short} 个"><span>${label}</span> <b class="${dominantTone(long,short)}">${total}</b></span>`;
 $('#globeScene').dataset.selectedSector=state.sector;
 $('#sectorNav').innerHTML=summaries.map(item=>{const color=GLOBE_PALETTE.find(color=>color.key===globePaletteKey(item.key));return `<button class="sector-button ${item.key===state.sector?'active':''}" data-sector="${item.key}" aria-pressed="${item.key===state.sector}" title="${esc(item.label)} · ${color?'地球配色：'+color.name:item.key==='all'?'七彩环绕':'保持当前地球配色'}" ${color?`style="--sector-color:${color.hex}"`:''}><b><i class="sector-swatch" aria-hidden="true"></i>${esc(item.label)}</b><span class="sector-counts">${count('共振',item.resonanceTotal,item.resonanceLong,item.resonanceShort)}${count('日K',item.dayTotal,item.dayLong,item.dayShort)}</span></button>`}).join('');
 const current=summaries.find(item=>item.key===state.sector)||summaries[0];
 $('#selectedSectorName').textContent=current.label;
 $('#selectedSectorCount').innerHTML=`${POOL_MODES[state.poolMode].shortLabel} ${current.total} 个 · <span class="long">多 ${current.long}</span> / <span class="short">空 ${current.short}</span>`;
 $$('[data-sector]').forEach(button=>button.onclick=()=>{
  state.sector=button.dataset.sector;
  const rows=candidates();
  if(!rows.some(row=>row.code===state.selectedCode))state.selectedCode=rows[0]?.code||'';
  render();
 });
}

function cycleTags(row){
 return Object.entries(modeLabels).map(([mode,label])=>{
  const tone=cycleTone(row.modes?.[mode]);
  return tone==='neutral'?'':`<span class="${tone}">${label}${tone==='long'?'多':'空'}</span>`;
 }).join('');
}

function opportunityGroup(rows,side,label){
 const members=rows.filter(row=>sideForRow(row,state.poolMode)===side);
 if(!members.length)return'';
 return `<section class="opportunity-group" data-direction="${side}"><div class="group-title ${side}"><b>${label}</b><small>${members.length} 个</small></div><div class="opportunity-grid">${members.map((row,index)=>`<button class="opportunity-item ${side} ${row.code===state.selectedCode?'active':''}" data-code="${esc(row.code)}" aria-pressed="${row.code===state.selectedCode}"><span><b>${esc(row.name)}</b><small>${esc(row.main_contract||row.code)} · ${esc(sectorFor(row))}</small><span class="cycle-mini">${cycleTags(row)}</span></span><span class="rank">${index+1}</span></button>`).join('')}</div></section>`;
}

function renderOpportunityList(){
 const rows=candidates(),all=poolCandidates(state.fire?.rows||[],state.poolMode,state.sector);
 $('#opportunityTitle').textContent=`${POOL_MODES[state.poolMode].label}池`;
 const long=all.filter(row=>sideForRow(row,state.poolMode)==='long').length,short=all.filter(row=>sideForRow(row,state.poolMode)==='short').length;
 $('#opportunitySummary').innerHTML=`<div class="long"><small>多头观察</small><b>${long}</b></div><div class="short"><small>空头观察</small><b>${short}</b></div>`;
 $('#opportunityList').innerHTML=rows.length?opportunityGroup(rows,'long','多头观察 · 按板块排列')+opportunityGroup(rows,'short','空头观察 · 按板块排列'):`<div class="empty-state">${esc(sectorForKey(state.sector).label)}当前没有符合方向筛选的${esc(POOL_MODES[state.poolMode].label)}。</div>`;
 $$('[data-code]').forEach(button=>button.onclick=()=>{const scrollTop=$('#opportunityList').scrollTop;state.selectedCode=button.dataset.code;renderOpportunityList();renderDetail();$('#opportunityList').scrollTop=scrollTop});
}

function directionLabel(row){
 const side=sideForRow(row,state.poolMode);
 return {side,label:side==='long'?'多头观察':side==='short'?'空头观察':'未纳入'};
}

function structureBlocks(row){
 const periods=state.poolMode==='day-trend'?['day']:['week','day'];
 const titles={week:'周K结构（辅助）',day:state.poolMode==='day-trend'?'日K结构（今日对昨日）':'日K结构（辅助）'};
 return periods.map(period=>`<div class="structure-period"><h3>${titles[period]}</h3>${fireStructure(row,state.poolMode,period).map(item=>`<p class="fire-structure ${item.tone}"><span>${esc(item.label)}</span><b>${esc(item.values)}</b></p>`).join('')}</div>`).join('');
}

function cycleRows(row){
 return Object.entries(modeLabels).map(([mode,label])=>{
  const status=row.modes?.[mode]||'未纳入',tone=cycleTone(status);
  return `<div><span>${label}</span><b class="${tone}">${esc(status)}</b><small>${mode==='day-trend'?'日线顺势':mode==='month-week'?'方向入口':mode==='week-day'?'小周期验证':'三周期共振'}</small></div>`;
 }).join('');
}

function signalCell(label,value,signal,evidence,key=''){
 return `<div class="signal-cell signal-${signal.tone}" ${key?`data-activity="${key}"`:''}><small>${label}</small><b>${esc(value)}</b><em>${esc(evidence)}</em></div>`;
}

function activityCell(row,key,signal,message){
 const delta=signal.delta;
 const detail=message||(delta===null?'缺少可比的前一交易日数据':delta===0?'较前一交易日持平':`较前一交易日${signal.label} ${delta>0?'+':''}${fmt(delta)} 手${signal.percent===null?'':`（${delta>0?'+':''}${fmt(signal.percent,2)}%）`}`);
 return signalCell(key==='volume'?'成交量（手）':'持仓量（手）',fmt(row[key]),signal,detail,key);
}

async function loadActivity(row){
 const key=[row.main_contract,row.data_date,row.previous_day_date,state.fire?.refreshedAt].join('|');
 if(!activityCache.has(key))activityCache.set(key,api(`/api/workbench/fire/bars?contract=${encodeURIComponent(row.main_contract)}`));
 try{
  const data=await activityCache.get(key);
  if(row!==(state.fire?.rows||[]).find(item=>item.code===state.selectedCode))return;
  const signals=activitySignals(row,data);
  for(const field of ['volume','open_interest'])$(`[data-activity="${field}"]`).outerHTML=activityCell(row,field,signals[field]);
 }catch{
  activityCache.delete(key);
  if(row!==(state.fire?.rows||[]).find(item=>item.code===state.selectedCode))return;
  for(const field of ['volume','open_interest'])$(`[data-activity="${field}"]`).outerHTML=activityCell(row,field,{tone:'neutral',delta:null},'量仓对比暂不可用');
 }
}

function renderDetail(){
 const row=(state.fire?.rows||[]).find(item=>item.code===state.selectedCode);
 if(!row){
  $('#detailTitle').textContent='当前板块无机会';
  $('#detailDirection').className='direction-badge neutral';
  $('#detailDirection').textContent='未选择';
   $('#detailBody').innerHTML='<div class="empty-state">从左侧观察池选择一个品种，查看三周期信号、结构辅助和交易卡进度。</div>';
  $('#detailActions').innerHTML='<a class="secondary" href="/?view=fire">查看全部87品种</a>';
  return;
 }
 const direction=directionLabel(row),card=cardForRow(row),resonance=state.poolMode===RESONANCE_MODE;
 $('#detailTitle').textContent=row.name;
 $('#detailDirection').className=`direction-badge ${direction.side}`;
 $('#detailDirection').textContent=direction.label;
 $('#detailBody').innerHTML=`
  <div class="focus-contract"><div><b>${esc(row.main_contract||row.code)}</b><small>${esc(row.exchange||'交易所未知')} · ${esc(sectorFor(row))}</small></div><time>刷新 ${esc(refreshMinute(state.fire?.refreshedAt))}</time></div>
  <div class="signal-grid">
   ${['month','week','day'].map((period,i)=>{const signal=maSignal(row,period);return signalCell(['月 MA10','周 MA10','日 MA10'][i],signal.label,signal,`${fmt(row['previous_'+period+'_ma10'],3)} → ${fmt(row[period+'_ma10'],3)}`)}).join('')}
   ${['volume','open_interest'].map(key=>activityCell(row,key,{tone:'neutral',delta:null},'正在核对前一交易日…')).join('')}
  </div>
  <p class="signal-basis">量仓对比：${esc(row.previous_day_date||'未知')} → ${esc(row.data_date||'未知')} · 同一合约</p>
  <p class="signal-basis">${(resonance?row.resonance_liquidity_ok:row.day_trend_liquidity_ok)?'量仓门槛通过':'量仓门槛未通过'} · ${esc(row.data_source||'来源待核验')}${row.provisional?' · 待正式复核':''}</p>
  <div class="cycle-status">${cycleRows(row)}</div>
  <div class="structure-block"><h2>${resonance?'周期结构辅助（不参与共振筛选）':'日K顺势结构条件'}</h2>${structureBlocks(row)}</div>
  <div class="card-state"><small>交易卡状态</small><b>${card?`${esc(card.status)} · ${card.water?.researchStatus==='completed'?'水研究已完成':'水研究待补'}`:'尚未建立，点击后进入水研究'}</b></div>`;
 const stableLink=card?`/?view=water&card=${encodeURIComponent(card.id)}`:'/?view=fire';
 $('#detailActions').innerHTML=`<button id="cardAction" class="primary">${card?'打开交易卡':'建立交易卡'}</button><button id="focusMonitor" class="monitor-bell" title="添加当前合约盯盘提醒" aria-label="添加当前合约盯盘提醒">${bellIcon}</button><a class="secondary" href="${stableLink}">进入交易流程</a>`;
 $('#focusMonitor').onclick=()=>monitorUI.openEditor({symbol:(row.exchange+'.'+row.main_contract).toUpperCase()});
 $('#cardAction').onclick=()=>card?location.assign(stableLink):createCard(row);
 void loadActivity(row);
}

async function createCard(row){
 const button=$('#cardAction');
 button.disabled=true;
 try{
  const card=await api('/api/workbench/fire/select',{method:'POST',body:JSON.stringify({code:row.code,mode:state.poolMode,accountId:state.accountId})});
  if(card.restoreRequired){
   if(!confirm(`${card.name} 已有归档卡。恢复原卡继续观察？原轮次和预算保留，旧批准不恢复。`))return;
   await api(`/api/workbench/cards/${card.id}/restore`,{method:'POST',body:'{}'});
  }
  await loadData(false);
  toast(card.reused?`${card.name} 已有交易卡，已打开原卡`:`${card.name} 已建立交易卡`);
  location.assign(`/?view=water&card=${encodeURIComponent(card.id)}`);
 }catch(error){toast(error.message,true);button.disabled=false}
}

function renderWorkflow(){
 $('#workflowNav').innerHTML=workflowSummary({...state.summary,fireCounts:state.fire?.counts||state.summary.fireCounts}).map(item=>`<a class="workflow-step" href="/?view=${item.key}"><b>${item.label}</b><small>${esc(item.detail)}</small></a>`).join('');
}

function render(){
 const rows=candidates();
 if(!rows.some(row=>row.code===state.selectedCode))state.selectedCode=rows[0]?.code||'';
 renderHeader();
 renderSectorNav();
 renderOpportunityList();
 renderDetail();
 renderWorkflow();
 $$('.pool-switch button').forEach(button=>{const active=button.dataset.pool===state.poolMode;button.classList.toggle('active',active);button.setAttribute('aria-selected',String(active))});
 $$('.direction-switch button').forEach(button=>button.classList.toggle('active',button.dataset.side===state.side));
}

async function loadData(first=true){
 const request=state.dataRequest=(state.dataRequest||0)+1;
 const suffix=state.accountId?`?accountId=${encodeURIComponent(state.accountId)}`:'';
 const [summary,fire,status]=await Promise.all([api(`/api/workbench/summary${suffix}`),api('/api/workbench/fire'),api('/api/status')]);
 if(request!==state.dataRequest)return;
 state.summary=summary;
 state.fire=fire;
 assistantConfigured=Boolean(status.chatConfigured??status.llm?.configured);
 state.accountId=summary.account?.id||'';
 localStorage.setItem('wj-account',state.accountId);
  if(first&&!state.selectedCode)state.selectedCode=poolCandidates(fire.rows||[],state.poolMode)[0]?.code||'';
 render();
}

$('#accountSelect').onchange=event=>{state.accountId=event.target.value;loadData(false).catch(error=>toast(error.message,true))};
$$('.pool-switch button').forEach(button=>button.onclick=()=>{state.poolMode=button.dataset.pool;const rows=candidates();if(!rows.some(row=>row.code===state.selectedCode))state.selectedCode=rows[0]?.code||'';render()});
$$('.direction-switch button').forEach(button=>button.onclick=()=>{state.side=button.dataset.side;const rows=candidates();if(!rows.some(row=>row.code===state.selectedCode))state.selectedCode=rows[0]?.code||'';render()});

const voice=new VoiceController({
 api:(path,body)=>api(path,body===undefined?{}:{method:'POST',body:JSON.stringify(body)}),
 isConfigured:()=>assistantConfigured,
 onMonitorDrafts:ids=>{if(ids?.length)void monitorUI.openEditor({id:ids[0]});},
 onTool:()=>loadData(false),
 toast
});
$('#assistantButton').onclick=()=>voice.open();
const ruleDetails=createRuleDetails({api,dialog:$('#ruleDialog'),title:$('#ruleDialogTitle'),body:$('#ruleDialogBody'),getMode:()=>state.poolMode});
$('#ruleVersion').onclick=()=>ruleDetails.open();
$('#ruleDialogClose').onclick=()=>$('#ruleDialog').close();

loadData().catch(error=>{
 $('#healthText').textContent='本机服务异常';
 $('#opportunityList').innerHTML=`<div class="empty-state">${esc(error.message)}<br>请从小木 Windows APP 重新打开工作台。</div>`;
 toast(error.message,true);
});

mountShell();
