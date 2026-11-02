import {mountShell} from './shell.js';
import {CANDLE_STYLE as candlePalette} from './candle-style.js';
import {mountWorkbenchVoice} from './workbench-voice.js';
import {createCardLifecycle,confirmExecutionPlan,lockNotice} from './plan-workflow.js';
import {createAccountUI,accountPanel,accountSummary} from './account-ui.js';
import {fireColumns,fireStructure,refreshMinute,sortFireCandidates,renderFireGroups,renderFireOverview,sortFireUniverse,fireDecisions} from './fire-display.js';
import {displaySectorFor as sectorFor} from './display-sectors.js';
import {simpleSizing,ENTRY_PAIRS} from './position-sizing.js';
import {tradeResult,executionFields,executionRows,correctionFields,reviewFields,reviewHistory,archivePanel,bindTradeUI,bindReviewUI,flushTradeDrafts} from './trade-records.js';
import {governancePanel,supervisionPanel,bindGovernance,reconciliationFields} from './team-governance.js';
import {createPostmarketUI} from './postmarket-review.js';
import {createRuleDetails} from './rule-details.js';
import {createMonitorUI,bellIcon} from './monitor-ui.js';
import {bindConversationWindow} from './ui/conversation-window.js';
import {renderMarkdown} from './ui/markdown.js';
import {fireRefreshText,bindFireRefresh,updateFireRefresh,createFireRefreshPoller} from './fire-refresh.js';
import {publishFireSnapshot} from './fire-observation-sync.js';
import {mountStrength} from './relative-strength-ui.js';
import {updateFireView} from './fire-view.js';
import {mountGold} from './gold-ui.js';
import {mountExpertReport} from './water-expert-ui.js';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(v,d=0)=>v===null||v===undefined||v===''?'未知':Number(v).toLocaleString('zh-CN',{maximumFractionDigits:d});
const pct=v=>v===null||v===undefined?'未知':`${(v*100).toFixed(2)}%`;
const pairLabels={'穿10均线入场 / 平台止损':'穿10日均线入场 / 区间上下沿止损','反K入场 / 前一根反K止损':'反K收线入场 / 前一根反K止损'};
const labels={home:['TODAY','今日交易总览'],monitor:['MONITOR','盯盘提醒'],fire:['FIRE','火 · 识别机会'],water:['WATER','水 · 分析机会'],metal:['METAL','金 · 冻结计划'],earth:['EARTH','土 · 执行管理'],wood:['WOOD','木 · 检查迭代'],rules:['EVIDENCE','账户与规则']};
const modeOrder=['month-week-day','month-week','week-day','day-trend'];
const modes={'month-week-day':'月周日共振','month-week':'月周大周期','week-day':'周日小周期','day-trend':'日K顺势'};
const initialParams=new URLSearchParams(location.search),initialView=initialParams.get('view')||(location.hash.startsWith('#trade/')?location.hash.slice(7):null),initialCard=initialParams.get('card'),initialProduct=(initialParams.get('product')||'').toUpperCase().replace(/[^A-Z]/g,'');
const savedAssistantHistory=(()=>{try{const value=JSON.parse(localStorage.getItem('wj-assistant-history')||'[]');return Array.isArray(value)?value.slice(-12):[]}catch{return[]}})();
const state={view:labels[initialView]?initialView:'home',accountId:localStorage.getItem('wj-account')||'',accounts:[],summary:null,cards:[],fire:null,selectedCard:initialCard||'',fireMode:'month-week-day',fireFilter:'candidate',csvPreview:null,assistantHistory:savedAssistantHistory,researchPoll:null,waterView:'card',universeFilter:'all',batchPoll:null};
async function api(path,options={}){const headers=options.body?{'Content-Type':'application/json'}:{};const response=await fetch(path,{...options,headers:{...headers,...options.headers}});const data=await response.json().catch(()=>({error:'服务响应格式异常'}));if(!response.ok)throw Error(data.error||`请求失败 ${response.status}`);if(path==='/api/research/universe'&&Array.isArray(data.rows))data.rows=data.rows.map(row=>({...row,sector:sectorFor(row)}));return data}
function toast(message,error=false){const node=$('#toast');node.textContent=message;node.className=error?'show error':'show';clearTimeout(toast.timer);toast.timer=setTimeout(()=>node.className='',2800)}
function formData(form){const out={};for(const [key,value] of new FormData(form)){if(key.endsWith('Number'))out[key.slice(0,-6)]=value===''?null:Number(value);else out[key]=value}return out}
function option(value,label,current){return`<option value="${esc(value)}" ${value===current?'selected':''}>${esc(label)}</option>`}
function accountOptions(current=state.accountId){return state.accounts.map(a=>option(a.id,`${a.alias}${a.status==='disabled'?'（已停用）':''}`,current)).join('')}
function renderAccountSummary(){if($('#accountSummary'))$('#accountSummary').innerHTML=accountSummary(state.summary?.account);$('#removeAccount').disabled=Boolean(state.summary?.account?.isDefault)}
const accountUI=createAccountUI({api,getAccount:()=>state.summary?.account,getChanges:()=>state.summary?.balanceChanges||[],beforeOpen:flushTradeDrafts,onChange:async result=>{
 if(result.action==='add'){state.accountId=result.account.id;state.selectedCard=''}
 if(['deleted','disabled'].includes(result.action)){state.accountId='';state.selectedCard=''}
 await reloadAccountUI();localStorage.setItem('wj-balance-revision',crypto.randomUUID());toast('账户资料已同步');
}});
async function reloadAccountUI(){
 const form=$('#metalForm'),oldId=form?.elements.accountId.value;await loadCore();
 if(form&&state.view==='metal'&&oldId===state.accountId){form.elements.accountEquityNumber.value=state.summary.account.equity??'';form.dirty=true;$('#submitToEarth').textContent='下一步：交给土执行';updateSizingPreview(form);$('.balance-panel').outerHTML=accountPanel(state.summary.account,[],true);accountUI.bind($('#content'),'金·冻结计划')}
 else await render();
}
const openAddAccount=()=>accountUI.open('add');
const balancePanel=(a,c)=>accountPanel(a,c,'wood');
const bindBalancePanel=source=>accountUI.bind($('#content'),source);
function cardOptions(cards=state.cards,current=state.selectedCard){return cards.map(c=>option(c.id,`${c.name} ${c.contract||''} · ${c.status}`,current)).join('')}
function currentCard(){return state.cards.find(c=>c.id===state.selectedCard)||state.cards[0]}
async function loadCore(){const request=state.coreRequest=(state.coreRequest||0)+1;if(!localStorage.getItem('wj-real-default-v1')){state.accountId='';localStorage.setItem('wj-real-default-v1','1')}const summary=await api(`/api/workbench/summary${state.accountId?`?accountId=${encodeURIComponent(state.accountId)}`:''}`);if(request!==state.coreRequest)return false;if(state.summary&&state.summary.account?.id!==summary.account?.id){state.csvPreview=null;state.selectedCard=''}state.summary=summary;state.accounts=state.summary.accounts;state.accountId=state.summary.account?.id||'';localStorage.setItem('wj-account',state.accountId);state.cards=state.summary.cards;$('#accountSelect').innerHTML=accountOptions();$('#accountSelect').value=state.accountId;$('#marketDate').textContent=state.summary.marketDate||'数据待刷新';$('#ruleVersion').textContent=state.summary.ruleVersion;renderAccountSummary();$('#healthDot').classList.add('ok');$('#healthText').textContent='本机业务库已连接';return true}
async function refresh(){try{await flushTradeDrafts();if(await loadCore())await render()}catch(e){$('#content').innerHTML=`<div class="hint error-box">${esc(e.message)}</div>`;$('#healthText').textContent='本机服务异常'}}
async function setView(view,fromShell=false){if(window.xiaomuNavigate&&!fromShell)return window.xiaomuNavigate('trade/'+view);await flushTradeDrafts();state.suspended=false;state.view=view;const [eyebrow,title]=labels[view];$('#viewEyebrow').textContent=eyebrow;$('#viewTitle').textContent=title;$$('#mainNav button').forEach(b=>b.classList.toggle('active',b.dataset.view===view));return Promise.resolve(render()).then(()=>{if(state.view===view)window.scrollTo({top:0})}).catch(e=>toast(e.message,true))}
function section(title,subtitle,actions=''){return`<div class="section-head"><div><h2>${title}</h2>${subtitle?`<p>${subtitle}</p>`:''}</div><div class="actions">${actions}</div></div>`}
const postmarketUI=createPostmarketUI({api,modal:$('#modal'),title:$('#modalTitle'),body:$('#modalBody'),getMode:()=>state.fireMode,getFire:()=>state.fire,toast});
const ruleDetails=createRuleDetails({api,dialog:$('#modal'),title:$('#modalTitle'),body:$('#modalBody'),getMode:()=>state.fireMode});
const monitorUI=createMonitorUI({api,toast,onNavigate:()=>setView('monitor')});
const cardLifecycle=createCardLifecycle({api,toast,dialog:$('#modal'),title:$('#modalTitle'),body:$('#modalBody'),getAccountId:()=>state.accountId,getArchived:()=>state.summary.archivedCards||[],beforeOpen:flushTradeDrafts,reload:async()=>{state.selectedCard='';await loadCore();await render();localStorage.setItem('wj-card-revision',crypto.randomUUID())}});
async function renderMonitor(){await monitorUI.mountPage($('#content'));}
function statusBadge(status){const cls=status?.includes('批准')?'metal':status?.includes('证据')||status?.includes('未知')?'warn':'';return`<span class="badge ${cls}">${esc(status||'未知')}</span>`}
function cardList(cards,empty='当前没有交易卡',deletable=['water','metal','earth'].includes(state.view)){const history=`<button type="button" class="quiet" data-card-archive>已移除记录（${state.summary.archivedCards?.length||0}）</button>`;if(!cards.length)return history+`<div class="empty">${empty}</div>`;return history+`<div class="card-list">${cards.map(c=>`<div class="card-row ${c.id===state.selectedCard?'selected':''}"><button data-card="${c.id}"><b>${esc(c.name)} <span class="mono">${esc(c.contract||c.symbol)}</span></b><small>${esc(c.roundId)} · ${esc(c.source)}</small></button><div class="card-status">${statusBadge(c.status)}<small>${c.direction==='long'?'多头':c.direction==='short'?'空头':'方向未知'}</small></div>${deletable?`<button class="delete-card" data-delete-card="${c.id}" title="移除并归档" aria-label="移除${esc(c.name)}">×</button>`:''}</div>`).join('')}</div>`}
async function render(){const fn={home:renderHome,monitor:renderMonitor,fire:renderFire,water:renderWater,metal:renderMetal,earth:renderEarth,wood:renderWood,rules:renderRules}[state.view];await fn();const g=await api('/api/workbench/governance');let boundary=$('#teamBoundary');if(!boundary){$('#content').insertAdjacentHTML('beforebegin','<details id="teamBoundary" class="form-section" style="margin:12px 24px 0"></details>');boundary=$('#teamBoundary')}boundary.hidden=['wood','monitor'].includes(state.view);boundary.innerHTML=`<summary>五行共同框架 · ${g.active?'本轮锁定':'启动前'} · 职责内正常推进</summary>${Object.values(g.active?.snapshot?.responsibilities||g.responsibilities).map(s=>'<p>'+esc(s)+'</p>').join('')}<p>运行中不改规则；本轮结束后再修订。运行管理见木。</p>`}
function bindCards(){$$('[data-card]').forEach(b=>b.onclick=async()=>{await flushTradeDrafts();state.selectedCard=b.dataset.card;render()});$$('[data-delete-card]').forEach(b=>b.onclick=()=>cardLifecycle.remove(state.cards.find(c=>c.id===b.dataset.deleteCard)));$$('[data-card-archive]').forEach(b=>b.onclick=()=>cardLifecycle.history())}
function saveAssistantHistory(){state.assistantHistory=state.assistantHistory.slice(-12);localStorage.setItem('wj-assistant-history',JSON.stringify(state.assistantHistory))}
function assistantSources(sources={}){const local=(sources.local||[]).slice(0,4),web=(sources.web||[]).slice(0,6);if(!local.length&&!web.length)return'';return`<div class="assistant-sources">${local.length?`<b>本地检索命中</b>${local.map(item=>`<button class="assistant-source" data-knowledge-source="${Number(item.chunkId)}"><span>${esc(item.title)} · ${esc(item.heading)}</span><small>${esc(item.path)}</small></button>`).join('')}`:''}${web.length?`<b>联网来源</b>${web.map(item=>`<a class="assistant-source web" href="${esc(item.url)}" target="_blank" rel="noreferrer"><span>${esc(item.title||item.url)}</span><small>${esc(item.published||item.fetchedAt||'外部网页')}</small></a>`).join('')}`:''}</div>`}
function renderAssistantHistory(){const box=$('#assistantMessages');box.innerHTML='<p class="assistant-note">助手先查本地资料；涉及最新行情、新闻和政策时再查官方网页，并分别标注来源。</p>'+state.assistantHistory.map(item=>item.role==='user'?`<p class="user">${esc(item.content)}</p>`:`<p>${esc(item.content)}</p>${monitorUI.draftButtons(item.monitorDrafts)}${assistantSources(item.sources)}`).join('');bindKnowledgeSources();box.scrollTop=box.scrollHeight}
function bindKnowledgeSources(){$$('[data-knowledge-source]').forEach(button=>button.onclick=async()=>{try{const item=await api(`/api/knowledge/source/${button.dataset.knowledgeSource}`);$('#modalTitle').textContent=`${item.title} · ${item.heading}`;$('#modalBody').innerHTML=`<div class="hint"><b>${esc(item.lifecycle==='current'?'当前资料':'历史或运行资料')} · ${esc(item.authority)}</b><br><span class="mono">${esc(item.path)}</span></div><pre class="knowledge-excerpt">${esc(item.content)}</pre>`;$('#modal').showModal()}catch(error){toast(error.message,true)}})}
async function loadKnowledgeStatus(){const node=$('#knowledgeStatus');try{const status=await api('/api/knowledge/status');if(status.latestRun?.status==='running'){node.textContent=`知识库更新中 · 已有${status.chunks||0}片段`;node.className='knowledge-status warn';setTimeout(loadKnowledgeStatus,5000);return}if(status.policy?.changed?.length){node.textContent='规则来源已变更，待复核 · '+status.policy.changed.map(s=>s.name).join('、');node.className='knowledge-status warn';return}if(!status.ready){node.textContent='知识库尚未建立';node.className='knowledge-status warn';return}const mode=status.embeddingStatus==='ready'?'语义检索':'全文降级';node.textContent=`${status.documents.parsed}份资料 · ${status.chunks}片段 · ${mode}`;node.className=`knowledge-status ${status.embeddingStatus==='ready'?'ready':'warn'}`}catch{node.textContent='知识库状态读取失败';node.className='knowledge-status warn'}}

async function renderHome(){state.fire=await api('/api/workbench/fire');const s=state.summary,a=s.account,fireTotal=(state.fire?.rows||[]).filter(row=>Object.values(row.modes||{}).some(value=>value==='多头观察'||value==='空头观察')).length;$('#content').innerHTML=`
 <div class="kpi-grid"><div class="kpi"><small>当前计划风险</small><strong>${fmt(s.plannedRisk,2)}</strong><span>${a.equity?`占实际权益 ${pct(s.plannedRisk/a.equity)}`:'实际权益未知，按阶段本金测算'}</span></div><div class="kpi"><small>进行中交易卡</small><strong>${s.openCount}</strong><span>已批准 ${s.approvedCount} 张</span></div><div class="kpi"><small>执行流水</small><strong>${s.executionCount}</strong><span>按委托/成交标识去重</span></div><div class="kpi"><small>账户档位</small><strong>${esc(({normal:'正常',conservative:'保守',aggressive:'积极',unknown:'未知'})[a.tier]||'未知')}</strong><span>${a.stopped?'已停机':'未触发停机'}</span></div></div>
 <section class="panel">${section('今日五行路径','每一步都留下记录，再把结果交给下一步')}<div class="flow"><button class="fire" data-go="fire"><b>火 · 筛选</b><small>${fireTotal} 个去重候选品种</small><small>${modeOrder.map(mode=>`${modes[mode]} ${(s.fireCounts?.[mode]?.long||0)+(s.fireCounts?.[mode]?.short||0)}`).join(' · ')}</small></button><button class="water" data-go="water"><b>水 · 研究</b><small>回答变化、证据与反证</small></button><button class="metal" data-go="metal"><b>金 · 计划</b><small>${s.approvedCount} 张已批准</small></button><button class="earth" data-go="earth"><b>土 · 执行</b><small>${s.executionCount} 条流水</small></button><button class="wood" data-go="wood"><b>木 · 复盘</b><small>执行与盈亏分开评价</small></button></div></section>
 <div class="layout-two"><section class="panel">${section('今日待办','按交易卡状态排序')} ${s.pending.length?`<div class="table-wrap"><table><thead><tr><th>交易卡</th><th>状态</th><th>方向</th><th>下一步</th></tr></thead><tbody>${s.pending.map(c=>`<tr><td><b>${esc(c.name)}</b><br><small class="mono">${esc(c.contract||c.symbol)}</small></td><td>${statusBadge(c.status)}</td><td>${c.direction==='long'?'多头':'空头'}</td><td><button class="quiet" data-open-card="${c.id}">${c.status==='待证据'?'补研究':c.status==='待触发'?'核计划':'管执行'}</button></td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">当前没有待办，从火扫描选择品种开始。</div>'}</section>
 <aside><section class="panel">${section('账户快照','未填写的字段保持未知')}<div class="evidence"><div><small>账户</small><b>${esc(a.alias)}</b></div><div><small>阶段本金</small><b>${fmt(a.stageCapital)}</b></div><div><small>实际权益</small><b>${fmt(a.equity)}</b></div><div><small>高水位</small><b>${fmt(a.highWatermark)}</b></div><div><small>已实现盈亏</small><b>${fmt(a.realizedProfit)}</b></div><div><small>模式</small><b>${a.mode==='real'?'实盘':a.mode==='shadow'?'影子':'模拟'}</b></div></div><p class="hint warning">实盘金额以本人核对为准。初始资金缺失时累计盈亏保持未知；保证金、流动性和跨品种相关风险仍需人工核验。</p><button class="secondary" data-go="rules">更新账户快照</button></section></aside></div>`;
 $$('[data-go]').forEach(b=>b.onclick=()=>setView(b.dataset.go));$$('[data-open-card]').forEach(b=>b.onclick=()=>{state.selectedCard=b.dataset.openCard;setView(b.textContent==='管执行'?'earth':b.textContent==='核计划'?'metal':'water')})}

let fireRenderVersion=0;
const firePoll=createFireRefreshPoller({
 load:()=>api('/api/workbench/fire'),isActive:()=>state.view==='fire',
 onProgress:f=>{state.fire=f;updateFireRefresh($('#content'),f)},
 onResult:async f=>{state.fire=f;const top=window.scrollY;await renderFire();if(state.view==='fire')window.scrollTo({top,behavior:'instant'})},
 onError:error=>{const node=$('#fireRefreshStatus');if(node){node.hidden=false;node.textContent=`刷新状态暂不可用，正在重试；已有结果保留。${error.message}`}}
});
async function renderFire(){
 firePoll.stop();
 const version=++fireRenderVersion,snapshot=state.fire||await api('/api/workbench/fire');
 if(state.view!=='fire'||version!==fireRenderVersion)return;
 state.fire=snapshot;
 publishFireSnapshot(snapshot);
 const f=state.fire,refresh=fireRefreshText(f),rows=(f.rows||[]).map(row=>({...row,sector:sectorFor(row)})),mode=state.fireMode,columns=fireColumns(mode),dayTrend=mode==='day-trend',resonance=mode==='month-week-day',weekDay=mode==='week-day',displayRuleVersion=dayTrend?'日K顺势：日MA10方向＋今日高低点':weekDay?'周日新规则：方向＋周线价格位置':resonance?(f.rule_version||'v2.6-resonance-pure'):(f.baseline_rule_version||f.rule_version||'v2.5');
 const liquidityOk=row=>dayTrend?row.day_trend_liquidity_ok:weekDay?row.week_day_liquidity_ok:resonance?row.resonance_liquidity_ok:row.liquidity_ok;
 const liquidityReason=row=>dayTrend?row.day_trend_rule_reason:weekDay?row.week_day_liquidity_reason:resonance?row.resonance_liquidity_reason:row.liquidity_reason;
 const filtered=rows.filter(row=>state.fireFilter==='candidate'?['多头观察','空头观察'].includes(row.modes?.[mode]):state.fireFilter==='missing'?!row.ok:state.fireFilter==='illiquid'?row.ok&&!liquidityOk(row):true);
 const visible=state.fireFilter==='candidate'?sortFireCandidates(filtered,mode):state.fireFilter==='all'?sortFireUniverse(filtered):filtered;
  const renderRow=row=>`<tr><td><b>${esc(row.name)}</b> <small>${esc(row.code)}</small><br><small class="muted">${esc(row.sector||'未分组')}</small></td><td class="mono">${esc(row.main_contract||'缺失')}<br><small class="nowrap">刷新 ${esc(refreshMinute(f.refreshedAt))}</small><br><small class="muted">行情 ${esc(row.data_date||'日期未知')}</small><br><small class="muted">${esc(row.data_source||'来源待补')}${row.provisional?' · 待正式复核':''}</small></td><td>${fmt(row.volume)} / ${fmt(row.open_interest)}<br>${liquidityOk(row)?'<span class="badge">已通过</span>':`<span class="badge danger">${esc(row.error||liquidityReason(row)||'未通过')}</span>`}</td><td>${columns.keys.map(key=>`<span class="nowrap">${esc(row[key+'_direction']||'未知')}</span>`).join(' / ')}${weekDay?`<br><small class="muted">收盘 ${fmt(row.week_day_price,8)} / 周MA10 ${fmt(row.week_ma10,8)}</small><br><small title="${esc(row.week_day_rule_reason||'')}">${esc(row.week_day_price_position||'数据不足')}</small>`:''}</td>${columns.structures.map(column=>`<td>${fireStructure(row,mode,column.period).map(item=>`<div class="fire-structure ${item.tone}"><span>${esc(item.label)}</span><br><small class="muted">${esc(item.values)}</small></div>`).join('')}</td>`).join('')}<td class="fire-decisions">${fireDecisions(row,mode,state.fireFilter==='all').map(item=>`<div class="fire-decision ${item.tone}"><span class="fire-cycle">${esc(item.cycle)}</span><span class="badge">${esc(item.status)}</span></div>`).join('')}</td><td class="nowrap"><button class="quiet" data-fire-detail="${esc(row.code)}">详情</button> ${['多头观察','空头观察'].includes(row.modes?.[mode])?`<button class="primary" data-fire-select="${esc(row.code)}">进入水研究</button>`:''}</td></tr>`;
 $('#marketDate').textContent=f.current_count===f.universe_size?f.data_date:`${f.data_date||'未知'}（有缺口）`;
 const filterHint=state.fireFilter==='candidate'
  ?dayTrend?'日MA10向上且今日低点＞昨日低点为多头；日MA10向下且今日高点＜昨日高点为空头；量仓均严格＞1万手':weekDay?'周日 MA10 同向，收盘价须在周 MA10 同侧；量仓均严格＞1万手，周日结构仅作辅助':resonance?'月周日 MA10 三周期同向，量仓均严格＞1万手；周K、日K结构仅作辅助':'量仓均严格＞1万手；多头优先，各方向按均线、结构、突破强度由优到次'
  :'具体主力成交量与持仓量均须严格大于1万手，等于1万手也剔除';
 const fireHtml=`
<section id="fireScanPanel" class="panel">${section('盘后变化扫描',`规则 ${esc(displayRuleVersion)} · 数据 ${esc(f.data_date||'未知')} · 最后刷新 <span id="fireRefreshTime">${esc(refresh.time)}</span>`,`<button id="manualCandidate" class="secondary">添加手工候选</button><button id="refreshFire" class="primary" ${f.refreshing?'disabled':''}>${f.refreshing?'刷新中':'刷新盘后数据'}</button>`)}<p id="fireRefreshStatus" class="hint ${f.refreshError?'error-box':''}" role="status">${esc(refresh.message)}${f.refreshing?' · 上次结果保留，完成后自动更新':` · 行情日期 ${esc(f.data_date||'未知')}`}${f.refresh?.warning?' · '+esc(f.refresh.warning):''}</p><div class="fire-close-tools"><p class="hint ${(f.current_count||0)+(f.no_trade_count||0)===f.universe_size?'':'warning'}">收盘已同步 ${f.current_count??0} / ${f.universe_size||87} 个品种 · 当日无成交 ${f.no_trade_count??0} 个 · 盘后快照待正式复核 ${f.provisional_count??0} 个 · 数据缺口 ${Math.max(0,(f.universe_size||87)-(f.current_count??0)-(f.no_trade_count??0))} 个</p><button id="postmarketSaved" class="secondary">已保存复盘</button><button id="postmarketReview" class="secondary">盘后数据复盘</button></div>${coverageHtml(f,esc)}<div class="fire-modebar"><div class="tabs">${modeOrder.map(key=>`<button data-mode="${key}" class="${key===mode?'active':''}">${modes[key]} <span class="badge">${rows.filter(row=>['多头观察','空头观察'].includes(row.modes?.[key])).length}</span></button>`).join('')}</div><div id="strengthSummary" class="strength-summary"></div></div>${renderFireOverview(rows,mode,esc)}<div class="filters"><label>显示<select id="fireFilter">${option('candidate','观察候选',state.fireFilter)}${option('all','全部'+(f.universe_size||87)+'品种',state.fireFilter)}${option('illiquid','流动性未通过',state.fireFilter)}${option('missing','数据缺失 / 无成交',state.fireFilter)}</select></label><span class="status-line"><i></i>${filterHint}</span></div>
 <div class="table-wrap"><table class="${weekDay?'week-day-table':''}"><thead><tr><th>品种 / 板块</th><th>具体主力</th><th>成交量 / 持仓量</th><th>${columns.title}</th>${columns.structures.map(item=>`<th>${item.title}</th>`).join('')}<th>${state.fireFilter==='all'?'三周期判定':'周期 / 判定'}</th><th></th></tr></thead>${state.fireFilter==='candidate'?renderFireGroups(visible,mode,6+columns.structures.length,renderRow):'<tbody>'+visible.map(renderRow).join('')+'</tbody>'}</table></div>${visible.length?'':'<div class="empty">当前筛选项没有记录</div>'}</section>`;
 const restoreFirePosition=updateFireView($('#content'),fireHtml);
 $$('[data-mode]').forEach(button=>{button.setAttribute('aria-pressed',String(button.dataset.mode===mode));button.onclick=()=>{if(state.fireMode===button.dataset.mode)return;state.fireMode=button.dataset.mode;void renderFire()}});
 const strengthNode=$('#strengthSummary'),strengthKey=JSON.stringify([f.data_date,f.refreshedAt,Boolean(f.refreshing)]);
 if(strengthNode.dataset.snapshot!==strengthKey){strengthNode.dataset.snapshot=strengthKey;void mountStrength(strengthNode,{api,esc,dialog:$('#modal'),title:$('#modalTitle'),body:$('#modalBody')})}
 $('#fireFilter').onchange=event=>{state.fireFilter=event.target.value;renderFire()};
 $('#manualCandidate').onclick=showManualCandidate;
 postmarketUI.bind();
 bindFireRefresh({button:$('#refreshFire'),api,onStarted:async()=>{const f=await api('/api/workbench/fire');state.fire=f;toast('盘后刷新已启动');if(state.view==='fire'){updateFireRefresh($('#content'),f);firePoll.start(f)}},onError:error=>{toast(error.message,true);const notice=document.createElement('p');notice.className='hint error-box';notice.setAttribute('role','alert');notice.textContent=error.message;$('#refreshFire').closest('.section-head').after(notice)}});
 $$('[data-fire-detail]').forEach(button=>{
  const row=rows.find(row=>row.code===button.dataset.fireDetail),symbol=row?.main_contract&&row.exchange?row.exchange+'.'+row.main_contract:null;
  const reminder=document.createElement('button');reminder.type='button';reminder.className='monitor-bell';reminder.innerHTML=bellIcon;reminder.title='添加'+row.name+'盯盘提醒';reminder.setAttribute('aria-label',reminder.title);reminder.disabled=!symbol;reminder.onclick=()=>monitorUI.openEditor({symbol:symbol?.toUpperCase()});button.after(reminder);
  button.onclick=()=>showFireDetail(row);
 });
 $$('[data-fire-select]').forEach(button=>button.onclick=()=>selectFireForResearch(button.dataset.fireSelect,state.fireMode,button));
 updateFireRefresh($('#content'),f);
 firePoll.start(f);
 restoreFirePosition?.();
}
async function selectFireForResearch(code,mode,button){
 if(button.disabled)return;
 button.disabled=true;
 try{
  const card=await api('/api/workbench/fire/select',{method:'POST',body:JSON.stringify({code,mode,accountId:state.accountId})});
  if(card.restoreRequired){
   if(!confirm(`${card.name} 已有归档卡。恢复原卡继续观察？原轮次、历史与已用预算保留，旧批准不恢复。`))return;
   await api(`/api/workbench/cards/${card.id}/restore`,{method:'POST',body:'{}'});
  }
  state.selectedCard=card.id;state.waterView='card';
  await loadCore();
  if($('#modal').open)$('#modal').close();
  toast(card.reused?`${card.name} 已在研究队列中，直接打开原卡`:`${card.name} 已建立交易卡`);
  await setView('water');
 }catch(error){toast(error.message,true)}
 finally{button.disabled=false}
}
function showManualCandidate(){$('#modalTitle').textContent='添加手工候选';$('#modalBody').innerHTML=`<p class="hint warning">手工候选与火扫描结果分开标记，不自动获得五层权限。</p><form id="manualForm"><div class="form-grid"><label class="field">中文品种名<input name="name" required></label><label class="field">品种代码<input name="symbol" required placeholder="例如 CU"></label><label class="field">具体合约<input name="contract" placeholder="例如 CU2611"></label><label class="field">方向<select name="direction">${option('long','多头','')}${option('short','空头','')}</select></label><label class="field wide">来源说明<input name="manualSource" required placeholder="观察理由或来源"></label></div><div class="actions form-section"><button class="primary">建立研究卡</button></div></form>`;$('#modal').showModal();$('#manualForm').onsubmit=async e=>{e.preventDefault();const data=formData(e.currentTarget);try{const card=await api('/api/workbench/cards',{method:'POST',body:JSON.stringify({accountId:state.accountId,symbol:data.symbol,name:data.name,contract:data.contract,direction:data.direction,source:`手工候选：${data.manualSource}`,status:'观察',fire:{manual:true,reason:data.manualSource,createdAt:new Date().toISOString()}})});state.selectedCard=card.id;$('#modal').close();await loadCore();toast('手工候选已单独建卡');setView('water')}catch(err){toast(err.message,true)}}}
async function showFireDetail(row){
 const mode=state.fireMode,symbol=row.main_contract&&row.exchange?`${row.exchange}.${row.main_contract}`.toUpperCase():null;
 const candidate=['多头观察','空头观察'].includes(row.modes?.[mode]);
 $('#modalTitle').textContent=`${row.name} · ${row.main_contract||'具体合约缺失'}`;
 $('#modalBody').innerHTML=`<div class="actions fire-detail-actions"><button type="button" id="detailMonitor" class="secondary" ${symbol?'':'disabled'}>添加盯盘提醒</button><button type="button" id="detailResearch" class="primary" ${candidate?'':'disabled title="当前模式未纳入观察候选"'}>进入水研究</button></div><div class="evidence"><div><small>成交量</small><b>${fmt(row.volume)}</b></div><div><small>持仓量</small><b>${fmt(row.open_interest)}</b></div><div><small>数据日期</small><b>${esc(row.data_date||'未知')}</b></div><div><small>月 MA10</small><b>${fmt(row.month_ma10,3)}</b></div><div><small>周 MA10</small><b>${fmt(row.week_ma10,3)}</b></div><div><small>日 MA10</small><b>${fmt(row.day_ma10,3)}</b></div></div><div class="fire-detail-structures">${['week','day'].map(period=>`<section data-detail-structure="${period}"><h3>${period==='week'?'周K':'日K'}结构（辅助）</h3>${fireStructure(row,mode,period).map(item=>`<div class="fire-structure ${item.tone}"><span>${esc(item.label)}</span><small>${esc(item.values)}</small></div>`).join('')}</section>`).join('')}</div><div id="contractChart" class="chart"><div class="loading">${row.main_contract?'正在读取具体合约日线…':'具体合约缺失，无法读取日线'}</div></div><div class="chart-label"><span>具体合约日线，仅供盘后核验</span><span>连续行情不代替当前具体主力</span></div>`;
 $('#detailMonitor').onclick=()=>monitorUI.openEditor({symbol});
 const research=$('#detailResearch');research.onclick=()=>selectFireForResearch(row.code,mode,research);
 $('#modal').showModal();
 const chart=$('#contractChart');
 if(!row.main_contract)return;
 try{const data=await api(`/api/workbench/fire/bars?contract=${encodeURIComponent(row.main_contract)}`);if(chart.isConnected&&$('#modal').open)drawChart(chart,data.bars)}
 catch(e){if(chart.isConnected&&$('#modal').open)chart.innerHTML=`<div class="empty">${esc(e.message)}</div>`}
}
function drawChart(node,bars){
 if(!bars.length){node.innerHTML='<div class="empty">没有日线数据</div>';return}
 const w=900,h=290,p=24,values=bars.flatMap(b=>[b.high,b.low]),min=Math.min(...values),max=Math.max(...values),x=i=>p+i*(w-2*p)/Math.max(1,bars.length-1),y=v=>p+(max-v)*(h-2*p)/(max-min||1);
 const average=bars.map((bar,i)=>i<9?null:bars.slice(i-9,i+1).reduce((sum,b)=>sum+b.close,0)/10);
 const points=average.map((value,i)=>value===null?null:x(i)+','+y(value)).filter(Boolean).join(' ');
 node.innerHTML=`<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="日K图，红色空心上涨、绿色实心下跌、蓝色10日均线"><rect width="100%" height="100%" fill="${candlePalette.background}"/>${bars.map((b,i)=>{const up=b.close>=b.open,color=up?candlePalette.up:candlePalette.down,xx=x(i),yy=y(Math.max(b.open,b.close)),hh=Math.max(1,Math.abs(y(b.open)-y(b.close)));return `<g data-candle="${up?'up':'down'}"><line x1="${xx}" y1="${y(b.high)}" x2="${xx}" y2="${y(b.low)}" stroke="${color}"/><rect x="${xx-2}" y="${yy}" width="4" height="${hh}" fill="${up?candlePalette.background:color}" stroke="${color}"/></g>`}).join('')}${points?`<polyline data-ma="10" points="${points}" fill="none" stroke="${candlePalette.ma}" stroke-width="1.6" vector-effect="non-scaling-stroke"/>`:''}<text x="24" y="16" fill="${candlePalette.ma}" font-size="12">MA10（10日均线）</text></svg>`;
}

function renderWater(){
 clearTimeout(state.researchPoll);clearTimeout(state.batchPoll);if(state.waterView==='universe')return renderWaterUniverse();
 if(!state.cards.some(c=>c.id===state.selectedCard))state.selectedCard=state.cards[0]?.id||'';const card=currentCard();
 $('#content').innerHTML=`${waterTabs()}<div class="split-work"><aside><section class="panel">${section('研究队列','从火勾选后进入')}${cardList(state.cards,'先到火扫描勾选品种',true)}</section></aside><section class="panel">${card?waterForm(card):'<div class="empty">还没有研究对象</div>'}</section></div>`;
 bindWaterTabs();bindCards();if(!card)return;$('#waterForm').baseCard=card;
 $('#waterForm').onsubmit=async e=>{e.preventDefault();const values=formData(e.currentTarget),expected=Object.fromEntries(Object.keys(values).map(k=>[k,card.water?.[k]??null]));try{await api(`/api/workbench/cards/${card.id}/water-notes`,{method:'POST',body:JSON.stringify({values,expected})});await loadCore();toast('水研究记录已保存');renderWater()}catch(err){toast(err.message,true)}};
 $('#runResearch').onclick=async()=>{
  const button=$('#runResearch');button.disabled=true;button.textContent='正在启动…';
  const last=$('#researchProgress .water-expert');if(last){$('#previousResearchBody').replaceChildren(last);$('#previousResearch').hidden=false}
  $('#researchProgress').innerHTML=researchProgressHtml({status:'running',stage:'正在加载品种专属框架'});
  try{const job=await api('/api/research/run',{method:'POST',body:JSON.stringify({product:card.symbol,cardId:card.id})});toast(`已启动 ${job.framework?.name||card.name} 专属研究`);showResearchJob(job,card.id)}
  catch(e){button.disabled=false;button.textContent='启动 AI 深度研究';$('#researchProgress').innerHTML=researchProgressHtml({status:'failed',stage:'启动失败',error:e.message});toast(e.message,true)}
 };
 void loadWaterHistory(card);
}
async function loadWaterHistory(card,selected){
 if(!card)return;
 try{const jobs=await api(`/api/research/cards/${card.id}`);if(state.view!=='water'||state.selectedCard!==card.id)return;
  const node=$('#waterHistory');if(node&&jobs.length){node.innerHTML=`<label for="waterHistorySelect">报告历史</label><select id="waterHistorySelect">${jobs.map(j=>option(j.id,`${new Date(j.created).toLocaleString('zh-CN',{hour12:false})} · ${j.contract||''} · ${j.status==='running'?'研究中':j.quality?.status==='partial'?'部分研究':j.status==='completed'?'已保存':'未完成'}`,selected||jobs[0].id)).join('')}</select>`;
   $('#waterHistorySelect').onchange=e=>showResearchJob(null,card.id,e.target.value);
  }
  if(!selected&&!$('#runResearch')?.disabled){const id=jobs[0]?.id||card.water?.researchJobId;if(id)showResearchJob(null,card.id,id);else $('#researchProgress').innerHTML='<p class="muted">尚无该品种的研究报告。</p>'}
 }catch(error){toast(error.message,true)}
}
function waterTabs(){return`<div class="tabs water-tabs"><button data-water-view="card" class="${state.waterView==='card'?'active':''}">技术候选研究 <span class="badge">${state.cards.length}</span></button><button data-water-view="universe" class="${state.waterView==='universe'?'active':''}">全品种研究总表 <span class="badge">87</span></button></div>`}
function bindWaterTabs(){$$('[data-water-view]').forEach(button=>button.onclick=()=>{state.waterView=button.dataset.waterView;Promise.resolve(renderWater()).catch(error=>toast(error.message,true))})}
async function renderWaterUniverse(){const [universe,batch]=await Promise.all([api('/api/research/universe'),api('/api/research/batch')]);const visible=universe.rows.filter(row=>state.universeFilter==='all'||state.universeFilter==='completed'&&row.researchStatus==='completed'||state.universeFilter==='pending'&&row.researchStatus!=='completed'||state.universeFilter==='aligned'&&row.resonance==='共振'||state.universeFilter==='conflict'&&row.resonance==='冲突');$('#content').innerHTML=`${waterTabs()}<section class="panel">${section('全品种基本面研究总表',`行情 ${esc(universe.dataDate||'未知')} · 已研究 ${universe.completed}/${universe.researchable} 个可研究品种`,batch.status==='running'?`<button id="stopBatch" class="danger">停止批量研究</button>`:`<button id="startBatch" class="primary">刷新全部品种研究</button>`)}<p class="hint">每个品种使用专属产业框架。机构研报只作为观点证据；共振由基本面方向与火技术方向机械比较，不授予交易许可。</p>${batch.status==='running'||batch.status==='stopping'?batchProgress(batch):''}<div class="filters"><label>显示<select id="universeFilter">${option('all','全部品种',state.universeFilter)}${option('completed','已完成研究',state.universeFilter)}${option('aligned','技术基本面共振',state.universeFilter)}${option('conflict','技术基本面冲突',state.universeFilter)}${option('pending','待研究',state.universeFilter)}</select></label><span class="status-line"><i></i>共振优先关注；冲突仅作参考；证据不足不强行给方向</span></div>${universeTable(visible)}</section>`;bindWaterTabs();$('#universeFilter').onchange=event=>{state.universeFilter=event.target.value;renderWaterUniverse().catch(error=>toast(error.message,true))};if($('#startBatch'))$('#startBatch').onclick=async()=>{if(!confirm(`将依次刷新 ${universe.researchable} 个可研究品种，期间仍可查看已有报告。是否开始？`))return;try{await api('/api/research/batch',{method:'POST',body:JSON.stringify({force:false})});toast('全品种研究队列已启动');renderWaterUniverse()}catch(error){toast(error.message,true)}};if($('#stopBatch'))$('#stopBatch').onclick=async()=>{await api('/api/research/batch/stop',{method:'POST',body:'{}'});toast('将在当前品种完成后停止');renderWaterUniverse()};$$('[data-universe-report]').forEach(button=>button.onclick=()=>openResearchReport(button.dataset.universeReport).catch(error=>toast(error.message,true)));$$('[data-universe-refresh]').forEach(button=>button.onclick=async()=>{button.disabled=true;try{await api('/api/research/run',{method:'POST',body:JSON.stringify({product:button.dataset.universeRefresh})});toast(`${button.dataset.universeName} 深度研究已启动`);state.batchPoll=setTimeout(()=>renderWaterUniverse(),2500)}catch(error){button.disabled=false;toast(error.message,true)}});if(batch.status==='running'||batch.status==='stopping'||universe.rows.some(row=>row.researchStatus==='running'))state.batchPoll=setTimeout(()=>renderWaterUniverse().catch(error=>toast(error.message,true)),3000)}
function batchProgress(batch){const pctValue=batch.total?Math.round(batch.processed/batch.total*100):0;return`<div class="batch-progress"><div><b>${esc(batch.stage)}</b><span>${batch.processed}/${batch.total} · 成功 ${batch.completed} · 失败 ${batch.failed}</span></div><progress max="100" value="${pctValue}"></progress></div>`}
function universeTable(rows){if(!rows.length)return'<div class="empty">当前筛选条件没有品种</div>';const tech=row=>row.technicalDirection==='long'?'偏多':row.technicalDirection==='short'?'偏空':row.technicalDirection==='mixed'?'分歧':'未通过';return`<div class="table-wrap universe-table"><table><thead><tr><th>品种 / 板块</th><th>技术方向</th><th>基本面方向</th><th>共振状态</th><th>策略结论</th><th>证据 / 更新</th><th></th></tr></thead><tbody>${rows.map(row=>`<tr><td><b>${esc(row.name)}</b> <small>${esc(row.code)}</small><br><small class="muted">${esc(row.sector)} · ${esc(row.contract||'具体主力缺失')}</small></td><td>${esc(tech(row))}<br><small class="muted">${row.technicalSignals.map(item=>esc(modes[item.mode])).join(' / ')||'未进入火候选'}</small></td><td><b>${esc(row.researchStatus==='running'?'研究中':row.fundamentalDirection)}</b><br><small class="muted">机构：${esc(row.institutionView)}</small></td><td><span class="resonance ${row.resonance==='共振'?'aligned':row.resonance==='冲突'?'conflict':''}">${esc(row.resonance)}</span></td><td>${esc(row.researchStatus==='running'?'正在核对最新信息与核心数据…':row.strategyConclusion)}<br><small class="muted">${esc(row.strategyAction)}</small></td><td>${esc(row.evidenceGrade)}级<br><small class="muted">${esc(row.researchAsOf||'待研究')}</small></td><td class="nowrap">${row.reportId?`<button class="quiet" data-universe-report="${row.reportId}">报告</button>`:''}<button class="secondary" data-universe-refresh="${esc(row.code)}" data-universe-name="${esc(row.name)}" ${row.researchable&&row.researchStatus!=='running'?'':'disabled'}>刷新</button></td></tr>`).join('')}</tbody></table></div>`}
function strategySummary(card){const w=card.water||{},tech=card.direction==='long'?'技术偏多':card.direction==='short'?'技术偏空':'技术未知',fund=w.fundamentalDirection||'待研究',res=w.resonance||'待研究',conclusion=w.strategyConclusion||'启动AI深度研究后生成客观的条件式策略结论。';return`<section id="strategySummary" class="strategy-summary"><header><div><small>策略结论</small><h3>${esc(conclusion)}</h3></div><span class="resonance ${res==='共振'?'aligned':res==='冲突'?'conflict':''}">${esc(res)}</span></header><div class="strategy-facts"><span>${esc(tech)}</span><span>基本面 ${esc(fund)}</span><span>证据 ${esc(w.evidenceGrade||'D')} 级</span><span>${esc(w.strategyAction||'继续观察')}</span></div><p><b>机构观点：</b>${esc(w.institutionView||'尚未核验机构研报')}</p></section>`}
function researchProgressHtml(job){
 const running=job.status==='running',failed=['failed','cancelled'].includes(job.status),label=running?'研究进行中':failed?'研究未完成':job.quality?.status==='partial'?'报告已生成 · 存在证据缺口':'研究已完成';
 const framework=job.framework?`${job.framework.name} · ${job.framework.pricingModel||job.framework.model} · v${job.framework.version}`:'';
 if(job.status==='completed'&&job.researchVersion)return`<details class="water-completed-meta"><summary>${esc(label)} · 行情 ${esc(job.marketContext?.dataDate||job.dataAsOf||'未标明')} · 任务详情${job.marketContext?.warnings?.length?'（含数据范围提醒）':''}</summary><p>${esc(job.stage)}</p><p>框架：${esc(framework)}</p>${(job.marketContext?.warnings||[]).map(w=>`<p>${esc(w)}</p>`).join('')}</details><div class="expert-report-root"></div>`;
 return`<div class="research-state ${failed?'failed':running?'running':'completed'}"><div><b>${esc(label)}</b><small>${esc(job.stage||'等待状态')}</small>${framework?`<small>已加载：${esc(framework)}</small>`:''}${job.marketContext?`<small>行情：${esc(job.marketContext.contract||job.marketContext.series)} · ${esc(job.marketContext.dataDate)} · ${esc(job.marketContext.priceBasis)} · ${esc(job.marketContext.source)}</small>`:''}</div>${running?`<span class="research-spinner" aria-label="研究进行中"></span>${job.id?'<button type="button" class="quiet" data-cancel-research>取消</button>':''}`:statusBadge(failed?'需处理':'已保存')}</div>${job.error?`<p class="hint error-box">${esc(job.error)}</p>`:''}${(job.marketContext?.warnings||[]).map(w=>`<p class="hint warning">${esc(w)}</p>`).join('')}${job.report?(job.researchVersion?'<div class="expert-report-root"></div>':'<details class="research-report" open><summary>完整研究报告</summary><div class="research-report-body"></div></details>'):''}`;
}

async function renderMetal(){
 if(!state.cards.some(c=>c.id===state.selectedCard))state.selectedCard=state.cards[0]?.id||'';
 const card=currentCard(),accountId=state.accountId,rules=await api('/api/workbench/rules');
 if(state.view!=='metal'||accountId!==state.accountId)return;
 $('#content').innerHTML=`${accountPanel(state.summary.account,[],true)}${lockNotice(rules)}<div class="split-work"><aside><section class="panel">${section('条件计划','')}${cardList(state.cards)}</section></aside><section class="panel" id="goldPanel">${card?'':'<div class="empty">暂无交易卡</div>'}</section></div>`;
 bindCards();bindBalancePanel('金·冻结计划');if($('#openRunManagement'))$('#openRunManagement').onclick=()=>setView('wood');
 if(card)await mountGold($('#goldPanel'),{api,card,accounts:state.accounts,toast,onApproved:async()=>{await loadCore();await renderMetal()}});
}
async function renderLegacyMetal(){
 if(!state.cards.some(c=>c.id===state.selectedCard))state.selectedCard=state.cards[0]?.id||'';
 const card=currentCard(),accountId=state.accountId,rules=await api('/api/workbench/rules');
 if(state.view!=='metal'||accountId!==state.accountId)return;
 $('#content').innerHTML=`${accountPanel(state.summary.account,[],true)}${lockNotice(rules)}<div class="split-work"><aside><section class="panel">${section('条件计划','')}${cardList(state.cards)}</section></aside><section class="panel">${card?metalForm(card):'<div class="empty">暂无交易卡</div>'}</section></div>`;
 bindCards();bindBalancePanel('金·冻结计划');if($('#openRunManagement'))$('#openRunManagement').onclick=()=>setView('wood');
 if(!card)return;
 const form=$('#metalForm');
 $('#environmentRefresh').onclick=()=>refreshMetalEnvironment(true).catch(error=>toast(error.message,true));
 form.elements.mainCycle.onchange=()=>refreshMetalEnvironment().catch(error=>toast(error.message,true));
 form.onsubmit=saveMetal;
 form.oninput=()=>{form.dirty=true;form.pendingPlan=null;$('#submitToEarth').textContent='下一步：交给土执行';updateSizingPreview(form)};
 void refreshMetalEnvironment().catch(error=>toast(error.message,true));void loadMetalSpec(form,card);
}
async function refreshMetalEnvironment(force=false){
 const form=$('#metalForm');if(!form)return;
 const cycle=form.elements.mainCycle.value,cardId=form.elements.cardId.value;
 const request=(form.environmentRequest||0)+1;form.environmentRequest=request;
 const button=$('#environmentRefresh');button.disabled=true;
 $('#submitToEarth').disabled=true;
 $('#environmentStatus').textContent='正在获取MA10环境证据…';
 try{
  const result=await api(`/api/workbench/cards/${encodeURIComponent(cardId)}/environment?cycle=${encodeURIComponent(cycle)}${force?'&refresh=1':''}`);
  if(form!==$('#metalForm')||form.environmentRequest!==request)return;
  form.environment=result;
  form.querySelector('.layers').innerHTML=layerRows(result.layers);
  fitEnvironmentEvidence();
  const plan=currentCard()?.plan;
  $('#submitToEarth').disabled=Boolean(form.submitting);
  if(plan&&plan.payload.environmentHash!==result.hash)$('#riskResult').innerHTML='<p class="hint warning">环境证据与冻结计划不一致，请重新测算并冻结新版本。</p>';
  $('#environmentStatus').textContent=`行情截止 ${result.dataDate||'未知'} · 大盘/板块采用${result.cycle==='week'?'周':'日'}MA10 · ${Object.values(result.layers).some(layer=>layer.direction==='unknown')?'部分环境数据待补齐':'五层环境已自动更新'}`;
 }catch(error){if(form===$('#metalForm')&&form.environmentRequest===request){form.environment=null;form.querySelector('.layers').innerHTML=layerRows();$('#environmentStatus').textContent=error.message;throw error}}
 finally{if(form===$('#metalForm')&&form.environmentRequest===request){button.disabled=false;$('#submitToEarth').disabled=!form.environment||Boolean(form.submitting)}}
}
function fitEnvironmentEvidence(){for(const field of $$('.layer-row textarea')){field.style.height='auto';field.style.height=`${field.scrollHeight+2}px`}}
window.addEventListener('resize',fitEnvironmentEvidence);
function layerRows(layers={}){return[['market','大盘'],['sector','板块'],['month','月线'],['week','周线'],['day','日线']].map(([key,label])=>{const l=layers[key]||{};return`<div class="layer-row"><b>${label}${key==='sector'&&l.target?`<small class="muted">${esc(l.target)}</small>`:''}</b><select name="${key}Direction" disabled>${['unknown','neutral','long','short'].map(v=>option(v,{unknown:'未知',neutral:'中性',long:'多头',short:'空头'}[v],l.direction||'unknown')).join('')}</select><textarea name="${key}Source" readonly placeholder="正在获取MA10证据">${esc(l.source)}</textarea><input name="${key}AsOf" readonly value="${esc(l.asOf?refreshMinute(l.asOf):'')}" placeholder="实际刷新时间"></div>`}).join('')}
function metalForm(card){const p=card.plan?.payload||{},r=card.plan?.risk,a=state.accounts.find(x=>x.id===(card.accountId||state.accountId))||{};return`${section(`${esc(card.name)} · 冻结条件计划`,`${esc(card.roundId)} · 计划版本 ${card.activePlanVersion||'未建立'}`,card.plan?.status?statusBadge(card.plan.status):'')}<form id="metalForm"><input type="hidden" name="sizingMode" value="simple"><input type="hidden" name="cardId" value="${card.id}"><div class="form-section"><div class="section-head"><h3>五层环境权限</h3><button type="button" class="secondary" id="environmentRefresh">刷新环境</button></div><div id="environmentStatus" class="hint">正在自动核验环境…</div><div class="layers">${layerRows(card.layers)}</div></div><div class="form-section"><h3>入场与止损配对</h3><div class="form-grid three"><label class="field">账户<select name="accountId">${option(state.accountId,state.summary.account.alias,state.accountId)}</select></label><label class="field">主周期<select name="mainCycle">${option('day','日线',p.mainCycle||'day')}${option('week','周线',p.mainCycle)}${option('small','小周期',p.mainCycle)}</select></label><label class="field wide">入场与止损手法<select name="pairType">${ENTRY_PAIRS.map(v=>option(v,pairLabels[v]||v,p.pairType)).join('')}</select></label><label class="field">实际账户金额（元）<input name="accountEquityNumber" readonly type="number" min="0.01" step="any" value="${esc(a.equity)}" required></label><label class="field">亏损比例（%）<input name="riskPercentNumber" type="number" min="0.001" max="100" step="any" value="${esc(p.riskPercent??1)}" required></label><label class="field calculated">可承受亏损金额（元）<input id="lossBudget" readonly placeholder="自动计算"></label><label class="field">计划入场价<input name="entryNumber" type="number" min="0" step="any" value="${esc(p.entry)}" required></label><label class="field">止损保护价<input name="stopNumber" type="number" min="0" step="any" value="${esc(p.stop)}" required></label><label class="field calculated">止损测算手数（手）<input id="sizingLots" readonly placeholder="自动向下取整"></label><label class="field calculated">止损距离（点）<input id="stopDistance" readonly placeholder="自动计算"></label><label class="field calculated">每点金额（元／手）<input id="pointValue" readonly placeholder="正在读取"></label><label class="field calculated">每手止损金额（元）<input id="riskPerLot" readonly placeholder="自动计算"></label><div class="wide hint" id="contractSpecStatus">正在读取品种点值…</div><div class="wide" id="sizingFeedback" aria-live="polite"></div><label class="field wide">止盈与退出规则<textarea name="exitRule" required>${esc(p.exitRule)}</textarea></label></div></div><details class="form-section"><summary>触发、有效期与持有安排（可选）</summary><div class="form-grid"><label class="field">触发条件<input name="trigger" value="${esc(p.trigger)}"></label><label class="field">价格范围<input name="entryWindow" value="${esc(p.entryWindow)}"></label><label class="field">有效期<input name="validUntil" type="date" value="${esc(p.validUntil)}"></label><label class="field">复核人<input name="reviewer" value="${esc(p.reviewer||'五简')}" required></label><label class="field">持有规则<textarea name="holdRule">${esc(p.holdRule)}</textarea></label><label class="field wide">事件应对<textarea name="eventAction">${esc(p.eventAction)}</textarea></label></div></details><p class="hint">批准范围：本机已登记的预算与持仓自检。券商持仓、挂单、跨品种相关风险、保证金及流动性仍待核验。</p><div id="riskResult">${r?riskHtml(r):'<p class="hint warning">填写实际金额、入场价与止损价后测算手数。</p>'}</div><p id="planSubmitStatus" role="status"></p><div class="actions form-section"><button type="submit" id="submitToEarth" class="primary">${card.plan?.status==='已批准'?'前往土·执行管理':'下一步：交给土执行'}</button></div></form>`}
function metalPayload(form){const raw=formData(form),plan={...raw};for(const key of Object.keys(raw))if(/^(market|sector|month|week|day)(Direction|Source|AsOf)$/.test(key)||['cardId','accountId','accountEquity'].includes(key))delete plan[key];plan.symbol=currentCard()?.symbol;return{accountId:raw.accountId,layers:form.environment?.layers||{},plan}}
async function loadMetalSpec(form,card){
 try{
  const spec=await api('/api/workbench/contract-spec?symbol='+encodeURIComponent(card.symbol));
  if(form!==$('#metalForm'))return;
  form.contractSpec=spec;
  $('#pointValue').value=fmt(spec.pointValue,2);
  $('#contractSpecStatus').innerHTML=`${esc(spec.name)} · 每点每手 ${fmt(spec.pointValue,2)} 元 · 最小一跳 ${fmt(spec.tickSize,3)} 点＝${fmt(spec.tickValue,2)} 元／手 · <a href="${esc(spec.sourceUrl)}" target="_blank" rel="noreferrer">参数日期 ${esc(spec.sourceDate)}</a>`;
  for(const name of ['entryNumber','stopNumber'])form.elements[name].step=spec.tickSize;
  updateSizingPreview(form);
 }catch(error){if(form===$('#metalForm')){form.contractSpec=null;$('#contractSpecStatus').textContent=error.message;updateSizingPreview(form)}}
}
function updateSizingPreview(form){
 if(form!==$('#metalForm'))return;
 const values=formData(form),spec=form.contractSpec;
 const result=simpleSizing({equity:values.accountEquity},{...values,direction:currentCard()?.direction,multiplier:spec?.pointValue??null,tickSize:spec?.tickSize??null});
 const put=(id,value,digits)=>{form.querySelector('#'+id).value=value===null||value===undefined?'':fmt(value,digits)};
 put('lossBudget',result.frozenBudget,2);put('stopDistance',result.stopDistance,3);put('riskPerLot',result.riskPerLot,2);put('sizingLots',result.riskCapLots,0);
 const filled=values.entry!==null&&values.stop!==null;
 const notes=filled?result.missing:[];
 if(result.riskCapLots===0)notes.push('当前亏损额度不足一手');
 $('#sizingFeedback').innerHTML=notes.length?`<p class="hint warning">${notes.map(esc).join('；')}</p>`:'';
 $('#riskResult').innerHTML=result.riskCapLots!==null?`<p class="hint">${fmt(result.frozenBudget,2)} ÷ ${fmt(result.riskPerLot,2)}，向下取整为 <b>${fmt(result.riskCapLots)} 手</b>。仅按止损价差计算。</p>`:'';
}
async function saveMetalBalance(form){const current=await api('/api/workbench/accounts'),old=state.accounts.find(a=>a.id===form.elements.accountId.value),fresh=current.find(a=>a.id===old?.id);if(!fresh)throw Error('请选择账户');if(fresh.revision!==old.revision){await reloadAccountUI();throw Error('账户余额已更新，请按新金额重新测算')}if(fresh.equity===null)throw Error('请先修改实际余额，再测算')}

async function saveMetal(e){
 e.preventDefault();const form=e.currentTarget,card=currentCard(),accountId=state.accountId;
 if(form.submitting)return;
 if(!form.dirty&&card.plan?.status==='已批准')return setView('earth');
 form.submitting=true;$('#submitToEarth').disabled=true;$('#planSubmitStatus').textContent='正在核对账户、环境与计划…';
 try{
  await refreshMetalEnvironment();if(form!==$('#metalForm'))return;
  await saveMetalBalance(form);
  const data=metalPayload(form),fingerprint=JSON.stringify(data.plan);
  let saved=form.pendingPlan?.fingerprint===fingerprint?form.pendingPlan.card:null;
  if(!saved){
   saved=await api(`/api/workbench/cards/${card.id}/plan`,{method:'POST',body:JSON.stringify({...data.plan,expectedPlanVersion:card.activePlanVersion})});
   form.pendingPlan={fingerprint,card:saved};Object.assign(card,saved);
  }
  const preview=await api(`/api/workbench/cards/${card.id}/approve`,{method:'POST',body:JSON.stringify({preview:true,planId:saved.plan.id})});
  if(form!==$('#metalForm')||state.accountId!==accountId)return;
  $('#planSubmitStatus').textContent='计划已保存为待确认版本，尚未交给土执行。';
  const confirmed=await confirmExecutionPlan({dialog:$('#modal'),title:$('#modalTitle'),body:$('#modalBody'),preview,account:state.summary.account});
  if(!confirmed||form!==$('#metalForm')||state.accountId!==accountId)return;
  await api(`/api/workbench/cards/${card.id}/approve`,{method:'POST',body:JSON.stringify({planId:preview.planId,confirmationHash:preview.confirmationHash})});
  await loadCore();toast('计划已确认，已交给土执行；未发送交易指令');await setView('earth');
 }catch(error){if(form===$('#metalForm'))$('#planSubmitStatus').textContent=error.message;toast(error.message,true)}
 finally{form.submitting=false;if(form===$('#metalForm'))$('#submitToEarth').disabled=!form.environment}
}
function riskHtml(r){return`<div class="risk-result"><div><small>账户金额</small><strong>${fmt(r.baseEquity,2)} 元</strong></div><div><small>亏损额度 · ${pct(r.finalPct)}</small><strong>${fmt(r.frozenBudget,2)} 元</strong></div><div><small>每手止损金额</small><strong>${fmt(r.riskPerLot,2)} 元</strong></div><div><small>按止损测算手数</small><strong>${fmt(r.lots)} 手</strong></div>${r.missing?.length?`<div class="wide hint warning">待补：${r.missing.map(esc).join("、")}</div>`:""}</div>`}

async function renderEarth(){
 state.csvPreview=null;
 const cards=state.cards.filter(c=>c.accountId);
 const selected=cards.find(c=>c.id===state.selectedCard)||cards[0];state.selectedCard=selected?.id||'';
 const card=selected?await api(`/api/workbench/cards/${selected.id}`):null;
 if(state.view!=='earth'||selected&&state.selectedCard!==selected.id)return;
 $('#content').innerHTML=`<div class="split-work"><aside><section class="panel">${section('执行对象','已批计划与实际持仓')}${cardList(cards,'暂无已批准计划')}</section></aside><section class="panel">${card?earthForm(card):'<div class="empty">暂无已批准计划</div>'}</section></div>`;
 bindCards();if(!card)return;
 bindTradeUI(card,{api,formData,toast,onSaved:async()=>{await loadCore();if(state.view==='earth')await renderEarth()}});
 $('#previewCsv').onclick=async()=>{try{state.csvPreview=await api('/api/workbench/import/preview',{method:'POST',body:JSON.stringify({csv:$('#csvText').value})});$('#csvPreview').innerHTML=csvPreviewHtml(state.csvPreview)}catch(e){toast(e.message,true)}};
 $('#commitCsv').onclick=async()=>{if(!state.csvPreview?.canCommit)return toast('请先通过 CSV 预览校验',true);try{await api('/api/workbench/import/commit',{method:'POST',body:JSON.stringify({cardId:card.id,rows:state.csvPreview.rows})});state.csvPreview=null;await loadCore();toast('历史流水已导入，账户盈亏尚未入账');renderEarth()}catch(e){toast(e.message,true)}};
}
function earthForm(card){return `${section(`${esc(card.name)} · 执行与盈亏`,esc(card.roundId),statusBadge(card.status))}${tradeResult(card)}${executionFields(card)}<div class="form-section"><div class="section-head"><h3>盘后持仓核验</h3><button type="button" class="secondary" id="checkTradeMarket">核验最新行情</button></div><p id="tradeMarketState" role="status"></p><small>日线触及保护价不等于实际成交，实际平仓和净盈亏以本人记录为准。</small></div><div class="form-section"><h3>执行流水</h3>${executionRows(card)}</div>${correctionFields(card)}<details class="form-section"><summary>历史 CSV 导入</summary><p class="muted">历史回报存档，尚未核对的成交不自动记入资金。</p><textarea id="csvText" rows="4" placeholder="externalId,time,status,action,price,quantity"></textarea><div class="actions"><button id="previewCsv" class="secondary">预览校验</button><button id="commitCsv" class="secondary">确认导入</button></div><div id="csvPreview"></div></details>${archivePanel()}`}
function csvPreviewHtml(p){return`<p class="hint ${p.canCommit?'':'error-box'}">${p.canCommit?`校验通过，共 ${p.rows.length} 条。请确认后入账。`:`发现 ${p.errors.length} 个错误，不能入账。`}</p>`}

async function renderWood(){
 const governance=await api('/api/workbench/governance'),rules=await api('/api/workbench/rules');
 if(!state.cards.some(c=>c.id===state.selectedCard))state.selectedCard=state.cards[0]?.id||'';
 const selected=currentCard(),card=selected?await api(`/api/workbench/cards/${selected.id}`):null;
 if(state.view!=='wood'||selected&&state.selectedCard!==selected.id)return;
 $('#content').innerHTML=`${balancePanel(state.summary.account,state.summary.balanceChanges,'木·检查迭代')}<div class="split-work"><aside><section class="panel">${section('复盘对象','每笔成交与复盘均保留历史')}${cardList(state.cards)}</section></aside><section class="panel">${card?woodForm(card):'<div class="empty">暂无可复盘交易卡</div>'}</section></div>`;
 bindBalancePanel('木·检查迭代');
 $('.balance-panel').insertAdjacentHTML('afterend',governancePanel(governance,rules));
 bindGovernance({api,toast,card,reload:async()=>{await loadCore();await renderWood()}});
 bindCards();if(card)bindReviewUI(card,{api,formData,toast});
}
function woodForm(card){return`${section(`${esc(card.name)} · 本笔复盘`,esc(card.roundId))}${supervisionPanel(card)}${reconciliationFields(card)}${tradeResult(card)}${reviewFields(card)}${reviewHistory(card)}${archivePanel()}`}

async function renderRules(){const rules=await api('/api/workbench/rules'),a=state.accounts.find(x=>x.id===state.accountId)||state.accounts[0];$('#content').innerHTML=`${accountPanel(a,state.summary.balanceChanges)}<section id="maintenancePanel" class="form-section"></section><div class="layout-two"><section class="panel">${section('只读规则入口',`组合哈希 ${esc(rules.combinedHash.slice(0,16))}…`)}<p class="hint">规则原文保持在资料实验基地。任一文件变化都会改变组合哈希，旧批准必须重新复核。</p><div class="source-list">${rules.files.map(f=>`<div class="source-item"><b>${esc(f.name)}</b><code title="${esc(f.path)}">${esc(f.path)}</code>${f.available?'<span class="badge">可用</span>':'<span class="badge danger">缺失</span>'}</div>`).join('')}</div><div class="actions form-section"><a class="primary" href="/api/workbench/backup" download>导出业务备份</a></div></section><aside><section class="panel">${section('账户快照','多个账户分别记账')}<form id="accountForm"><input type="hidden" name="id" value="${esc(a.id)}"><input type="hidden" name="updatedAt" value="${esc(a.updatedAt)}"><div class="form-grid"><label class="field wide">账户别名<input name="alias" value="${esc(a.alias)}" required></label><label class="field">类型<select name="mode">${option('simulation','模拟',a.mode)}${option('real','实盘',a.mode)}${option('shadow','影子',a.mode)}</select></label><label class="field">档位<select name="tier">${option('unknown','未知',a.tier)}${option('conservative','保守',a.tier)}${option('normal','正常',a.tier)}${option('aggressive','积极',a.tier)}</select></label><label class="field">阶段本金<input name="stageCapitalNumber" type="number" value="${esc(a.stageCapital||'')}"></label><label class="field">初始资金<input name="initialCapitalNumber" type="number" min="0" step="0.01" value="${esc(a.initialCapital)}"></label><label class="field">实际余额<input readonly value="${esc(a.equity)}"></label><label class="field">高水位<input name="highWatermarkNumber" type="number" value="${esc(a.highWatermark)}"></label><label class="field">恢复线<input name="restoreLineNumber" type="number" value="${esc(a.restoreLine)}"></label><label class="field">已实现盈亏<input name="realizedProfitNumber" readonly type="number" value="${esc(a.realizedProfit)}"></label><label class="field">保证金上限<input name="marginLimitNumber" type="number" value="${esc(a.marginLimit)}"></label><label class="field">最低可用资金<input name="minAvailableNumber" type="number" value="${esc(a.minAvailable)}"></label><label class="field">单品种上限<input name="productLimitNumber" type="number" value="${esc(a.productLimit)}"></label><label class="field">停机<select name="stopped">${option('','否',a.stopped?'1':'')}${option('1','是',a.stopped?'1':'')}</select></label><label class="field wide">备注<textarea name="notes">${esc(a.notes)}</textarea></label></div><div class="actions form-section"><button class="primary">保存账户快照</button><button type="button" id="newAccount" class="secondary">新建账户</button></div></form></section></aside></div>`;$('#accountForm').onsubmit=saveAccount;$('#newAccount').onclick=()=>openAddAccount();bindBalancePanel('账户管理');void mountMaintenance($('#maintenancePanel'),{api,esc,toast})}
async function saveAccount(e){e.preventDefault();const data=formData(e.currentTarget);data.stopped=Boolean(data.stopped);data.sourcePage='账户管理';try{const saved=await api('/api/workbench/accounts',{method:'POST',body:JSON.stringify(data)});state.accountId=saved.id;await loadCore();localStorage.setItem('wj-balance-revision',crypto.randomUUID());toast('账户快照已保存');renderRules()}catch(err){toast(err.message,true)}}

$('#mainNav').onclick=e=>{const button=e.target.closest('[data-view]');if(button)setView(button.dataset.view)};
$('#accountSelect').onchange=async e=>{const id=e.target.value;e.target.disabled=true;$('#content').inert=true;try{await flushTradeDrafts();state.accountId=id;state.selectedCard='';state.csvPreview=null;await refresh()}catch(error){toast(error.message,true)}finally{$('#accountSelect').disabled=false;$('#content').inert=false}};
$('#addAccount').onclick=()=>openAddAccount().catch(error=>toast(error.message,true));
$('#removeAccount').onclick=()=>accountUI.open('remove').catch(error=>toast(error.message,true));
$('#syncAccount').onclick=()=>accountUI.open('sync','顶部账户管理').catch(error=>toast(error.message,true));
window.addEventListener('storage',async event=>{if(!['wj-account','wj-balance-revision','wj-card-revision'].includes(event.key))return;try{await flushTradeDrafts();if(event.key==='wj-account'&&event.newValue!==state.accountId){state.accountId=event.newValue||'';state.selectedCard=''}if(event.key==='wj-card-revision'){await loadCore();await render()}else await reloadAccountUI()}catch(error){toast(error.message,true)}});
$('#modalClose').onclick=()=>$('#modal').close();
$('#assistantButton').onclick=()=>{$('#assistantDrawer').hidden=false;$('#drawerShade').hidden=false;$('#restoreAssistant').hidden=true;$('#assistantButton').setAttribute('aria-expanded','true');renderAssistantHistory();loadKnowledgeStatus();$('#assistantInput').focus()};
$('#closeAssistant').onclick=$('#drawerShade').onclick=()=>{$('#assistantDrawer').hidden=true;$('#drawerShade').hidden=true;$('#restoreAssistant').hidden=true;$('#assistantButton').setAttribute('aria-expanded','false');$('#assistantButton').focus()};
if(!document.body.dataset.unified)bindConversationWindow({panel:$('#assistantDrawer'),minimize:$('#minAssistant'),maximize:$('#maxAssistant'),close:$('#closeAssistant'),onMinimize:()=>{$('#assistantDrawer').hidden=true;$('#drawerShade').hidden=true;$('#restoreAssistant').hidden=false;$('#assistantButton').setAttribute('aria-expanded','false')}});
$('#restoreAssistant').onclick=()=>$('#assistantButton').click();
$('#ruleVersion').onclick=()=>ruleDetails.open();
if(!document.body.dataset.unified)$('.version-link').onclick=async event=>{event.preventDefault();try{await flushTradeDrafts();location.assign('/cockpit.html')}catch(error){toast(error.message,true)}};
$('#assistantForm').onsubmit=async e=>{e.preventDefault();const input=$('#assistantInput'),message=input.value.trim();if(!message)return;state.assistantHistory.push({role:'user',content:message});saveAssistantHistory();renderAssistantHistory();input.value='';const submit=e.currentTarget.querySelector('button');submit.disabled=true;try{const messages=state.assistantHistory.map(({role,content})=>({role,content}));const result=await api('/api/chat',{method:'POST',body:JSON.stringify({messages,contextSymbol:document.body.dataset.unified?window.xiaomuContext?.()?.symbol:currentCard()?.symbol,cardId:document.body.dataset.unified?window.xiaomuContext?.()?.card:currentCard()?.id})});state.assistantHistory.push({role:'assistant',content:result.text||result.content||'助手没有返回文本',sources:result.sources||{},monitorDrafts:result.monitorDrafts||[]})}catch(err){state.assistantHistory.push({role:'assistant',content:`${err.message}。工作台的本地功能不受影响。`,sources:{}})}finally{submit.disabled=false;saveAssistantHistory();renderAssistantHistory()}};
$('#printButton').onclick=async()=>{await flushTradeDrafts();const card=currentCard();const type=state.view==='rules'?'account':state.view==='wood'?'review':'card';window.open(`/print.html?type=${type}${card?`&id=${encodeURIComponent(card.id)}`:''}&accountId=${encodeURIComponent(state.accountId)}`,'_blank')};
const initialLabel=labels[state.view];$('#viewEyebrow').textContent=initialLabel[0];$('#viewTitle').textContent=initialLabel[1];$$('#mainNav button').forEach(button=>button.classList.toggle('active',button.dataset.view===state.view));
renderAssistantHistory();loadKnowledgeStatus();
export const workbenchReady=refresh().then(async()=>{
 if(initialParams.get('accountAction')==='add')openAddAccount().catch(error=>toast(error.message,true));
 if(initialProduct&&initialView==='water'){state.waterView='universe';await renderWater();const row=$(`[data-universe-refresh="${initialProduct}"]`);row?.closest('tr')?.scrollIntoView({block:'center'});}
 if(initialProduct&&initialView==='fire'){const row=state.fire?.rows?.find(r=>r.code===initialProduct);if(row)await showFireDetail(row);}
 if(initialView==='monitor'&&initialParams.get('symbol'))monitorUI.openEditor({symbol:initialParams.get('symbol')});
}).catch(error=>toast(error.message,true));

const DIRECTION_TONE={偏多:'long',偏空:'short'};
const stripWaterJson=text=>String(text||'').replace(/<!--WUJIAN_WATER_JSON_START-->[\s\S]*?<!--WUJIAN_WATER_JSON_END-->/,'').trim();
function mountResearchReport(node,job){const root=node?.querySelector('.expert-report-root');if(root&&job.report){mountExpertReport(root,job);return}const body=node?.querySelector('.research-report-body');if(body&&job.report)renderMarkdown(body,stripWaterJson(job.report))}
async function openResearchReport(id){const job=await api(`/api/research/reports/${id}`);$('#modalTitle').textContent=`${job.framework?.name||job.name} · 研究报告`;$('#modalBody').innerHTML=researchProgressHtml(job)+(job.researchVersion?'':researchSnapshot(job.waterDraft||{}));mountResearchReport($('#modalBody'),job);$('#modal').showModal()}
function researchEvidenceList(snapshot){const items=snapshot.items||[];if(!items.length)return'';return`<details class="research-sources"><summary>证据来源（${items.length}条，点击展开）</summary><ol>${items.map(item=>`<li><b>${esc(item.id)}</b> <span class="muted">${esc(String(item.published||'').slice(0,16))} · ${esc(item.source||'')}${item.fullText===false?' · 仅摘要':''}</span> ${item.url?`<a href="${esc(item.url)}" target="_blank" rel="noreferrer">${esc(item.title||item.url)}</a>`:esc(item.title||'')}</li>`).join('')}</ol></details>`}
function researchSnapshot(w={}){
 const snapshot=w.sourceSnapshot||{},legacy=w.quickBrief||{},headline=w.headline||legacy.headline;
 const stage=w.stage?`<div class="research-stage"><small>当前阶段</small><b>${esc(w.stage)}</b><span>${esc(w.stageConfidence||'')}</span></div>`:'';
 const dimensions=w.dimensions?[['fundamental','基本面'],['news','消息面'],['policy','政策面'],['capital','资金面']].map(([key,label])=>{const d=w.dimensions[key]||{};return`<section class="research-snapshot-section research-dimension ${DIRECTION_TONE[d.direction]||''}"><h4>${label}<span>${esc(d.direction||'未取得')} · 权重${esc(d.weight||'弱')}</span></h4><p>${esc(d.summary||'本次未取得')}</p></section>`}).join(''):[['market','市场与盘面'],['supplyDemand','供需与库存'],['reports','权威报告与新闻'],['positionsBasis','持仓、仓差与基差'],['institutionActions','机构与席位动作'],['riskAndNext','反证与下一核验']].filter(([key])=>legacy[key]).map(([key,label])=>`<section class="research-snapshot-section"><h4>${label}</h4><p>${esc(legacy[key])}</p></section>`).join('');
 const shift=w.priorStage?`<p class="research-shift"><b>贝叶斯更新</b>先验 ${esc(w.priorStage)}${w.priorConfidence?`（${esc(w.priorConfidence)}）`:''} → 后验 ${esc(w.stage||'')}${w.stageConfidence?`（${esc(w.stageConfidence)}）`:''}${w.posteriorShift?`：${esc(w.posteriorShift)}`:''}</p>`:'';
 const advice=w.advice||w.reversal?`<div class="research-advice">${w.advice?`<p><b>建议</b>${esc(w.advice)}</p>`:''}${w.reversal?`<p><b>反转信号</b>${esc(w.reversal)}</p>`:''}</div>`:'';
 const providers=(snapshot.providers||[]).map(item=>`${esc(item.name||'来源')} ${['ok','sampled'].includes(item.status)?`${esc(item.count??'')}条`:'未取得'}`).join(' · ');
 const warnings=(snapshot.warnings||[]).map(text=>`<p class="hint warning">合约核对：${esc(text)}</p>`).join('');
 return`<section id="researchSnapshot" class="research-snapshot"><header><div><small>品种研判速读</small><h3>${esc(headline||'尚无已保存的个人研判。')}</h3></div>${stage}</header>${warnings}${shift}${dimensions?`<div class="research-snapshot-grid">${dimensions}</div>`:''}${advice}${providers?`<p class="source-status">${snapshot.fetchedAt?`采证 ${esc(new Date(snapshot.fetchedAt).toLocaleString('zh-CN',{hour12:false}))} · `:''}${providers}</p>`:''}${researchEvidenceList(snapshot)}${snapshot.missing?.length?`<p class="hint">未取得：${esc(snapshot.missing.join('；'))}</p>`:''}</section>`;
}
function waterForm(card){const w=card.water||{};return`${section(`${esc(card.name)} · 水研究`,`${esc(card.contract||card.symbol)} · ${esc(card.fire?.modeLabel||'手工候选')}`,`<button id="runResearch" class="secondary">启动 AI 深度研究</button>`)}
 <p class="muted">品种专属框架 · 供需库存 · 期现结构 · 历史与情景。研究供本人判断，不构成交易许可。</p>
 <div id="waterHistory" class="water-history"></div>
 <div id="researchProgress" class="research-progress"><p class="muted">正在读取研究记录…</p></div>
 <details id="previousResearch" hidden><summary>上一次研究</summary><div id="previousResearchBody"></div></details>
 <details class="water-questions"><summary>本人四问与已保存的判断</summary>${researchSnapshot(w)}${strategySummary(card)}<form id="waterForm"><div class="form-grid"><label class="field wide">什么改变<textarea name="change" required>${esc(w.change)}</textarea></label><label class="field">证据在哪里<textarea name="evidence" required>${esc(w.evidence)}</textarea></label><label class="field">价格是否已经反映<textarea name="pricedIn" required>${esc(w.pricedIn)}</textarea></label><label class="field">最强反证 / 什么会推翻<textarea name="disproof" required>${esc(w.disproof)}</textarea></label><label class="field">竞争解释<textarea name="competingExplanation">${esc(w.competingExplanation)}</textarea></label><label class="field wide">来源与链接<textarea name="sources">${esc(w.sources)}</textarea></label><label class="field wide">证据缺口<textarea name="missing">${esc(w.missing)}</textarea></label><label class="field">研究结论<select name="conclusion">${['保留观察','等待补证据','撤回假说'].map(v=>option(v,v,w.conclusion||'等待补证据')).join('')}</select></label><label class="field">框架版本<input name="frameworkVersion" value="${esc(w.frameworkVersion||'待研究')}" readonly></label></div><div class="actions form-section"><button class="primary">保存本人记录</button></div></form></details>`}
async function showResearchJob(initial,cardId,jobId=initial?.id){
 clearTimeout(state.researchPoll);if(!jobId)return;
 try{
  const job=initial||await api(`/api/research/reports/${jobId}`);if(state.suspended||state.view!=='water'||state.selectedCard!==cardId)return;
  const node=$('#researchProgress');if(node){node.innerHTML=researchProgressHtml(job);mountResearchReport(node,job);const cancel=node.querySelector('[data-cancel-research]');if(cancel)cancel.onclick=async()=>{cancel.disabled=true;try{await api('/api/research/cancel',{method:'POST',body:JSON.stringify({id:job.id})});toast('正在取消研究')}catch(error){toast(error.message,true);cancel.disabled=false}}}
  const button=$('#runResearch');if(button){button.disabled=job.status==='running';button.textContent=job.status==='running'?'AI 研究进行中…':'重新启动 AI 深度研究'}
  if(job.status==='running'){state.researchPoll=setTimeout(()=>showResearchJob(null,cardId,jobId),2000);return}
  if(job.status==='completed'&&job.waterDraft&&node){
   node.insertAdjacentHTML('beforeend',`<div class="water-draft-action"><button id="compareResearchDraft" class="secondary">核对并应用到本人记录</button></div>`);
   $('#compareResearchDraft').onclick=()=>openDraftComparison({job,card:$('#waterForm').baseCard||currentCard(),form:$('#waterForm'),api,dialog:$('#modal'),title:$('#modalTitle'),body:$('#modalBody'),esc,onSaved:async()=>{await loadCore();renderWater();toast('所选研究字段已保存，原值已留痕')}});
  }
  if(job.status!=='running')void loadWaterHistory(currentCard(),job.id);
 }catch(error){const node=$('#researchProgress');if(node)node.innerHTML=researchProgressHtml({status:'failed',stage:'无法读取研究状态',error:error.message})}
}
import {openDraftComparison} from './research-draft-ui.js';
import {coverageHtml} from './data-coverage.js';
import {mountMaintenance} from './maintenance-ui.js';

mountShell();
export async function openTradePage(view,options={}){await workbenchReady;if(options.card)state.selectedCard=options.card;await setView(view,true);if(options.product&&view==='water'){state.waterView='universe';await renderWater();const row=$(`[data-universe-refresh="${CSS.escape(options.product)}"]`);row?.closest('tr')?.scrollIntoView({block:'center'})}if(options.product&&view==='fire'){const row=state.fire?.rows?.find(r=>r.code===options.product);if(row)await showFireDetail(row)}if(view==='monitor'&&options.symbol)monitorUI.openEditor({symbol:options.symbol});}
export async function leaveTradePage(){await flushTradeDrafts();state.suspended=true;firePoll.stop();clearTimeout(state.researchPoll);clearInterval(state.batchPoll);}
export function getTradeContext(){const card=['water','metal','earth','wood'].includes(state.view)?currentCard():null;return{account:state.accountId,card:card?.id,symbol:card?.symbol,product:card?.code,name:card?.name,view:state.view};}
mountWorkbenchVoice({api,toast,getContext:()=>window.xiaomuContext?.()||getTradeContext(),onMessage:(role,content)=>{state.assistantHistory.push({role,content});saveAssistantHistory()},onOpen:()=>{renderAssistantHistory();loadKnowledgeStatus()},onTool:()=>state.suspended?loadCore():refresh()});
