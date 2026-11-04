import {alarmVoices} from './alarm-voices.js';
import {panoramaSectors,panoramaSectorFor} from './market-panorama-display.js';
import {fireStrengthTones} from './fire-display.js';
const bigPeriods=[['1mo','月K'],['1w','周K'],['1d','日K']];
const smallPeriods=[['30m','30分钟'],['60m','1小时'],['120m','2小时']];
const labels=Object.fromEntries([...bigPeriods,...smallPeriods]);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=v=>typeof v==='number'&&Number.isFinite(v)?v.toLocaleString('zh-CN',{maximumFractionDigits:4}):'待数据';
const date=v=>{if(!v)return'未取得';const t=new Date(v);return Number.isFinite(+t)?t.toLocaleString('zh-CN',{hour12:false}):String(v)};
const tone=d=>d==='long'||d==='up'?'bull':d==='short'||d==='down'?'bear':'neutral';
const direction=d=>({long:'做多',short:'做空',up:'做多',down:'做空',both:'多空双向'}[d]||'待方向');
const taskState=s=>({active:'已启用',paused:'已暂停',archived:'已归档',draft:'待启用'}[s]||'待核验');
const observationState=s=>({'waiting-data':'待数据',baseline:'建立基线','waiting-direction':'等大周期同向','waiting-turn':'等EMA10拐头','waiting-cross':'等价格穿越',triggered:'本轮已提醒',paused:'已暂停',cooldown:'一小时内已提醒'}[s]||'待核验');
const deliveryState=s=>({pending:'待发送',sending:'发送中',accepted:'通道已接受',sent:'已发送',delivered:'已送达',failed:'发送失败',unknown:'结果待确认',skipped:'未发送'}[s]||'待核验');
const array=v=>Array.isArray(v)?v:[];
const finite=v=>typeof v==='number'&&Number.isFinite(v);
export const monitorFirePools=[['month-week-day','月周日共振'],['month-week','月周大周期'],['week-day','周日小周期'],['day-trend','日K顺势']];
export function firePoolCodes(scan,mode){return new Set(array(scan?.rows).filter(r=>['多头观察','空头观察'].includes(r.modes?.[mode])).map(r=>String(r.code||'').toUpperCase()).filter(Boolean));}
const sideLabels={long:'多头观察',short:'空头观察',neutral:'分歧 / 暂不优先'};
export function monitorDirectionGroups(rows,scan,mode='all'){
 const scanRows=new Map(array(scan?.rows).map(r=>[r.code,r])),tones=new Map(monitorFirePools.map(([id])=>[id,fireStrengthTones(array(scan?.rows),id)])),groups={long:[],short:[],neutral:[]};
 for(const row of rows){
  const source=scanRows.get(row.code),candidates=monitorFirePools.filter(([id])=>['多头观察','空头观察'].includes(source?.modes?.[id])),sides=new Set(candidates.map(([id])=>source.modes[id]));
  const label=mode==='all'?(sides.size===1?[...sides][0]:null):source?.modes?.[mode],side=label==='多头观察'?'long':label==='空头观察'?'short':'neutral';
  if(mode!=='all'&&side==='neutral')continue;
  const qualityMode=mode==='all'?candidates[0]?.[0]:mode,wanted=side==='long'?'上升':'下降',opposite=side==='long'?'下降':'上升';
  const weekDay=source?.week_direction&&source?.day_direction?source.week_direction===wanted&&source.day_direction===wanted:['week-day','month-week-day'].some(id=>source?.modes?.[id]===label);
  const flaw=side==='neutral'?(!source?'候选待核验':sides.size>1?'周期多空冲突':'未符合火候选'):source?.month_direction===opposite?'月线反向':!weekDay?'周日不一致 / 待核验':'';
  const structure=side==='neutral'?flaw:flaw||'周日同向 · 主线待核验';
  groups[side].push({...row,side,structure,flaw,strength:tones.get(qualityMode)?.get(source)||'unknown',sourceModes:candidates.map(([id,name])=>name+'：'+source.modes[id]).join('；')});
 }
 return groups;
}
export function renderMonitorDirectionPicker(rows,scan,mode,selectionCodes){
 const groups=monitorDirectionGroups(rows,scan,mode),toneLabels={strong:'较强',medium:'中等',weak:'较弱',unknown:'力度数据不足'};
 return '<p class="tm-direction-note">红绿深浅沿用火的技术力度。周日同向优先研究；月线反向、周日分歧标明瑕疵。大盘、板块未核验前，主线仍待确认。</p><div class="tm-watch-groups">'+['long','short',...(groups.neutral.length?['neutral']:[])].map(side=>'<section class="tm-watch-group tm-watch-'+side+'" data-tm-direction-group="'+side+'"><header><b>'+sideLabels[side]+'</b><small>'+groups[side].length+' 个品种</small></header><div class="tm-watch-grid">'+(groups[side].length?groups[side].map((r,i)=>'<div class="tm-watch-item"><span class="tm-watch-rank">'+(i+1)+'</span><div class="tm-product-chip tm-direction-chip tm-strength-'+r.strength+' '+(selectionCodes?.has(r.code)?'selected':'')+'" title="'+esc(r.sourceModes+'；'+r.structure+'；技术力度'+toneLabels[r.strength]+'。主线还须核验大盘、板块与品种同向，颜色不代表交易许可。')+'"><span><b>'+esc(r.code)+'</b><strong>'+esc(r.name)+'</strong></span><small class="'+(r.flaw?'tm-chip-flaw':'')+'">'+esc(r.flaw||'周日同向')+'</small><button type="button" class="tm-follow-button" data-tm-follow="'+esc(r.code)+'" aria-pressed="'+!!selectionCodes?.has(r.code)+'">'+(selectionCodes?.has(r.code)?'已关注':'关注')+'</button></div></div>').join(''):'<span class="tm-caption">当前范围暂无'+(side==='neutral'?'分歧或未入选品种':sideLabels[side])+'</span>')+'</div></section>').join('')+'</div>';
}


export function trendAlertText(e){const period=labels[e.period||e.evidence?.period]||'小周期',up=['long','up'].includes(e.direction),basis=e.evidence?.indicator?.type==='EMA'||/EMA10/.test(e.label||'')?'EMA10':'MA10';return (e.evidence?.test?'【测试】':'')+period+' '+basis+(up?'向上':'向下')+'拐头，价格'+(up?'上穿':'下穿')+basis}
function latestAlerts(events){const seen=new Set();return [...array(events)].sort((a,b)=>Date.parse(b.triggeredAt)-Date.parse(a.triggeredAt)).filter(e=>{const key=e.period||e.evidence?.period;if(seen.has(key))return false;seen.add(key);return true})}
function waitingText(row){
 if(row.monitored===false)return '<span class="tm-wait">'+(row.watched===false?'未关注，不提醒':'当前无启用任务')+'</span>';
 const seen=new Set();return array(row.observations).filter(o=>{if(seen.has(o.period))return false;seen.add(o.period);return true}).map(o=>'<span class="tm-wait" title="'+esc(o.reason)+'">'+esc(labels[o.period]||o.period)+' · '+esc(observationState(o.status))+'</span>').join('')||'<span class="tm-no-alert">—</span>';
}

export function renderTrendUniverse(rows,{hour=false,search='',sector='all',selectedOnly=false,selectionCodes=null,periodTask=null,periodBusy=false,poolCodes=null,directionGroups=null}={}){
 const periods=[['1mo','月K'],['1w','周K'],['1d','日K'],['120m','2小时'],...(hour?[['60m','1小时']]:[]),['30m','30分钟']];
 let visible=array(rows).filter(r=>(!poolCodes||poolCodes.has(r.code))&&(!selectedOnly||r.watched!==false)&&(sector==='all'||r.sector===sector)&&(!search||[r.code,r.name,r.symbol,r.sector].some(v=>String(v||'').toLowerCase().includes(search.toLowerCase()))));
 const sideByCode=new Map();if(directionGroups){for(const side of ['long','short','neutral'])for(const row of directionGroups[side])sideByCode.set(row.code,side);visible=visible.map((r,i)=>({r,i,side:sideByCode.get(r.code)||'neutral'})).sort((a,b)=>['long','short','neutral'].indexOf(a.side)-['long','short','neutral'].indexOf(b.side)||a.i-b.i).map(x=>x.r)}let lastSide=null;
 const groupHeading=r=>{if(!directionGroups)return '';const side=sideByCode.get(r.code)||'neutral';if(side===lastSide)return '';lastSide=side;return '<tr class="tm-table-group tm-table-'+side+'"><th scope="rowgroup" colspan="'+(periods.length+2)+'">'+sideLabels[side]+' · '+visible.filter(r=>(sideByCode.get(r.code)||'neutral')===side).length+' 个</th></tr>'};
 const cell=s=>{const valid=s?.status==='ok'||s?.status==='closed',value=valid?s.direction:null,kind=value===1?'bull':value===-1?'bear':'neutral',text=value===1?'↑ 向上':value===-1?'↓ 向下':valid&&value===0?'— 走平':s?.status==='stale'?'陈旧':'不足';return `<td><span class="tm-slope tm-${kind}" title="${esc(`EMA10 ${num(s?.ma)}；前值 ${num(s?.previousMa)}；${date(s?.stamp)}；${s?.reason||''}`)}">${text}</span></td>`};
 return `<div class="tm-universe-count">${visible.length} / ${array(rows).length} 个品种 <span>只看EMA10斜率 · 盘中未收线</span></div><div class="tm-universe-scroll"><table class="tm-universe-table"><thead><tr><th>品种</th>${periods.map(([id,label])=>`<th>${periodTask?`<label class="tm-period-check"><input type="checkbox" data-tm-period="${id}" aria-label="监控${label}" ${[...array(periodTask.bigPeriods),...array(periodTask.smallPeriods)].includes(id)?'checked':''} ${periodBusy?'disabled':''}>${label}</label>`:label}<small>EMA10</small></th>`).join('')}<th>警报</th></tr></thead><tbody>${visible.length?visible.map(r=>`${groupHeading(r)}<tr data-tm-row="${esc(r.code)}"><td><div class="tm-row-identity"><button type="button" class="tm-follow-button" data-tm-follow="${esc(r.code)}" aria-label="${(selectionCodes?selectionCodes.has(r.code):r.watched===true)?'取消关注':'关注'} ${esc(r.name)}" aria-pressed="${selectionCodes?selectionCodes.has(r.code):r.watched===true}">${(selectionCodes?selectionCodes.has(r.code):r.watched===true)?'已关注':'关注'}</button><b>${esc(r.code)}</b><strong>${esc(r.name)}</strong><span class="tm-sector-tag">${esc(r.sector||'其他')}</span></div><small class="tm-row-meta" title="${esc(r.source||'来源待核验')}">${esc(r.symbol||'合约待核验')} · ${esc((r.quoteAt?date(r.quoteAt):'行情待更新')+(r.sessionActive===false?' · 休市':''))}</small></td>${periods.map(([p])=>cell(r.signals?.[p])).join('')}<td class="tm-alert-cell">${latestAlerts(r.alerts).map(e=>{const recent=r.watched===true&&!e.readAt&&Number.isFinite(Date.parse(e.triggeredAt))&&Date.now()-Date.parse(e.triggeredAt)>=0&&Date.now()-Date.parse(e.triggeredAt)<=300000,period=e.period||e.evidence?.period||e.evidence?.smallPeriod,side=e.direction==='long'||e.direction==='up'?'多头':e.direction==='short'||e.direction==='down'?'空头':'方向待核验';return `<button type="button" data-tm-read="${esc(e.id)}" class="tm-alert tm-${tone(e.direction)} ${e.readAt?'tm-alert-read':recent?'tm-alert-unread':'tm-alert-history'}" title="${esc(`${date(e.triggeredAt)}；${e.condition||e.label||''}；${e.readAt?'已读，历史保留':'点击标记已读并停止闪烁'}`)}">${esc(trendAlertText(e))}<small>${esc(date(e.triggeredAt))} · 盘中未收线</small><small>${esc(array(e.deliveries).map(d=>(d.channel==='weixin'?'微信':'桌面')+'：'+deliveryState(d.status)).join(' / '))}</small>${e.readAt?'<small>已读</small>':recent?'':'<small>历史提醒</small>'}</button>`}).join('')||waitingText(r)}</td></tr>`).join(''):`<tr><td colspan="${periods.length+2}"><div class="tm-empty">当前筛选没有品种；行情不足时会明确标注，不推算方向。</div></td></tr>`}</tbody></table></div>`;
}

export function defaultTrendDraft(){return {title:'周日同向 · 30分钟拐点',bigPeriods:['1w','1d'],smallPeriods:['30m'],direction:'both',scope:'all',codes:[],channels:['desktop','weixin'],status:'active'}};
export function validateTrendDraft(draft){
 if(!array(draft.bigPeriods).length)throw Error('至少勾选一个大周期');
 if(draft.bigPeriods.some(p=>!bigPeriods.some(([id])=>id===p)))throw Error('大周期只支持月K、周K、日K');
 if(!array(draft.smallPeriods).length)throw Error('至少勾选一个触发周期');
 if(draft.smallPeriods.some(p=>!smallPeriods.some(([id])=>id===p)))throw Error('触发周期只支持30分钟、1小时、2小时');
 if(!array(draft.channels).length)throw Error('至少选择一种提醒方式');
 if(draft.scope==='codes'&&!array(draft.codes).length)throw Error('请至少选择一个品种');
 if(!String(draft.title||'').trim())throw Error('请填写任务名称');
 return {...draft,title:String(draft.title).trim(),bigPeriods:[...new Set(draft.bigPeriods)],smallPeriods:[...new Set(draft.smallPeriods)],channels:[...new Set(draft.channels)],codes:[...new Set(draft.codes)]};
}
export function renderTrendTasks(tasks){
 const visible=array(tasks).filter(t=>t.status!=='archived');
 return visible.length?visible.map(t=>`<article class="tm-task ${tone(t.direction)}" data-trend-task="${esc(t.id)}"><div class="tm-task-head"><h3>${esc(t.title||t.name||'监控任务')}</h3><span class="tm-pill ${t.status==='active'?'on':''}">${taskState(t.status)}</span></div><p><b>${array(t.bigPeriods).map(p=>labels[p]||p).map(esc).join('＋')}</b> 同向 <span aria-hidden="true">→</span> <b>${array(t.smallPeriods).map(p=>labels[p]||p).map(esc).join(' / ')}</b> 拐头＋穿越</p><div class="tm-caption">${direction(t.direction)} · ${t.scope==='codes'?array(t.codes).length+'个品种':'全部品种当前主力'} · ${array(t.channels).map(c=>c==='weixin'?'微信':'桌面').join('＋')} · 第${num(t.version||1)}版</div><div class="tm-task-actions"><button type="button" data-tm-edit="${esc(t.id)}">修改条件</button><button type="button" data-tm-action="${t.status==='active'?'pause':'activate'}" data-tm-id="${esc(t.id)}">${t.status==='active'?'暂停':'启用'}</button><button type="button" data-tm-action="archive" data-tm-id="${esc(t.id)}">归档</button></div></article>`).join(''):'<div class="tm-empty">尚无监控任务。勾选周期后点“保存并启用”，小木会持续跟踪。</div>';
}
export function renderTrendEvents(events){
 const rows=array(events).filter(e=>e.kind==='ma-turn'||e.kind==='trend'||e.kind==='trend-turn'||e.ruleId?.startsWith('trend:'));
 return rows.length?`<div class="tm-table-wrap"><table><thead><tr><th>触发时间</th><th>品种 / 合约</th><th>方向与周期</th><th>价格 / EMA10</th><th>触发依据</th><th>推送状态</th></tr></thead><tbody>${rows.map(e=>{const ev=e.evidence||{},period=e.period||ev.period||ev.smallPeriod,ma=e.ma??ev.ma??ev.ma10??ev.smallSignal?.ma;return `<tr><td>${esc(date(e.triggeredAt))}<small>行情 ${esc(date(e.quoteAt||ev.providerTime))}</small></td><td><b>${esc(e.code||'')} ${esc(e.name||'')}</b><small>${esc(e.symbol||ev.symbol||'具体合约待核验')}</small></td><td><b class="tm-${tone(e.direction)}">${direction(e.direction)} · ${esc(labels[period]||period||'周期待核验')}</b><small class="tm-live-tag">盘中未收线</small></td><td><b>${num(e.price)}</b><small>EMA10 ${num(ma)}</small></td><td>${esc(e.condition||e.label||'EMA10拐头且价格穿越')}<small>${esc(e.source||ev.source||'来源待核验')}</small><details><summary>查看证据</summary><pre>${esc(JSON.stringify(ev,null,2))}</pre></details></td><td>${array(e.deliveries).map(d=>`<span class="tm-receipt ${d.status==='failed'?'failed':''}">${d.channel==='weixin'?'微信':'桌面'}：${deliveryState(d.status)}${d.note?`<small>${esc(d.note)}</small>`:''}</span>`).join('')||'未取得发送回执'}</td></tr>`}).join('')}</tbody></table></div>`:'<div class="tm-empty">尚无新信号。启动时已在均线同一侧的历史状态不会补报为新穿越。</div>';
}
export function renderTrendObservations(observations){
 const rows=array(observations);
 return rows.length?`<div class="tm-table-wrap"><table><thead><tr><th>品种 / 具体合约</th><th>任务与小周期</th><th>当前进度</th><th>最新价格</th><th>数据时间</th></tr></thead><tbody>${rows.map(o=>`<tr><td><b>${esc(o.code||'')} ${esc(o.name||'')}</b><small>${esc(o.symbol||'合约待核验')}</small></td><td>${esc(o.taskTitle||'监控任务')}<small>${esc(labels[o.period]||o.period||'')}</small></td><td><b class="tm-${tone(o.direction)}">${observationState(o.status)}</b><small>${esc(o.reason||'')}</small></td><td>${num(o.price)}<small>${finite(o.smallSignal?.ma)?'EMA10 '+num(o.smallSignal.ma):''}</small></td><td>${esc(date(o.lastObserved||o.quoteAt))}</td></tr>`).join('')}</tbody></table></div>`:'<div class="tm-empty">等待当前主力合约及实时K线。行情缺失时不会推算信号。</div>';
}

export function createTrendMonitorPage({host,notify=()=>{},fetchImpl=(...args)=>fetch(...args)}){
 let rowPool='all',fireScan=null,fireError='',fireUpdatedAt=0,fireBusy=false,fireRequest=0;
 let running=false,timer=null,pollTimer=null,busy=false,mounted=false,editId=null,payload={},catalog=[],login=null,actionBusy=false,requestVersion=0,draftMemory=defaultTrendDraft(),rowSearch='',rowSector='all',weixinDialog=null,loginRequest=0,selectionCodes=null,selectionDirty=false,selectionVersion=0,selectedOnly=false,headerTaskId=null,headerDraft=null,headerDirty=false,headerBusy=false,headerTimer=null,headerError='',soundId='taiwan-female',soundBusy=false,localActive=false,localKnown=false,localBusy=false;
 const loginView={active:false,replace:false,phase:'idle',id:null,wx:null,error:null,previousWx:null};
 const q=s=>host.querySelector(s)||weixinDialog?.querySelector(s);
 const api=async(path,body)=>{const r=await fetchImpl('/api/trend-monitor/'+path,{cache:'no-store',...(body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),signal:AbortSignal.timeout(15000)});const data=await r.json();if(!r.ok)throw Error(data.error||'监控接口读取失败');return data};
 function mount(){
  if(host.querySelector('.trend-monitor-page'))return;
  const style=document.getElementById('trendMonitorStyle');if(!style){const link=document.createElement('link');link.id='trendMonitorStyle';link.rel='stylesheet';link.href='/trend-monitor-ui.css';document.head.append(link)}
  host.innerHTML=`<section class="trend-monitor-page"><header class="tm-intro"><div><h2>大周期定方向，小周期等拐点</h2><p>EMA10拐头与价格穿越同时核对 · 多空镜像 · <span class="tm-live-tag">盘中即时，当前K线未收线</span></p></div><button type="button" data-tm-refresh>刷新状态</button></header><div class="tm-service-status" role="status" data-tm-runtime>正在读取监控状态…</div><div class="tm-layout"><section class="tm-panel tm-editor"><header><h2 data-tm-editor-title>设置监控任务</h2><span>勾选的大周期须全部同向</span></header><form id="trendTaskForm"><label class="tm-title-field">任务名称<input name="title" maxlength="100" required></label><fieldset><legend>方向周期 · EMA10</legend><div class="tm-options">${bigPeriods.map(([id,label])=>`<label><input type="checkbox" name="bigPeriods" value="${id}"><span>${label}</span></label>`).join('')}</div><div class="tm-presets"><span>快捷选择</span>${[['1d','日'],['1w,1d','周日'],['1mo,1w','月周'],['1mo,1w,1d','月周日']].map(([v,l])=>`<button type="button" data-tm-preset="${v}">${l}</button>`).join('')}</div></fieldset><fieldset><legend>触发周期 · 拐头＋穿越</legend><div class="tm-options">${smallPeriods.map(([id,label])=>`<label><input type="checkbox" name="smallPeriods" value="${id}"><span>${label}</span></label>`).join('')}</div></fieldset><div class="tm-form-row"><label>观察方向<select name="direction"><option value="both">多空双向</option><option value="long">只看多头</option><option value="short">只看空头</option></select></label><label>品种范围<select name="scope"><option value="all">全部已关注品种当前主力</option><option value="codes">指定品种</option></select></label></div><div data-tm-products hidden><label>选择品种</label><div class="tm-product-options" data-tm-catalog>正在读取品种…</div></div><fieldset><legend>提醒方式</legend><div class="tm-options"><label><input type="checkbox" name="channels" value="desktop"><span>桌面事件提醒</span></label><label><input type="checkbox" name="channels" value="weixin"><span>微信推送</span></label></div></fieldset><div class="tm-form-actions"><button class="primary" type="submit" data-tm-save>保存并启用</button><button type="button" data-tm-new>新建任务</button></div><p class="tm-caption" data-tm-form-note>只监控已关注品种；同一品种、同一周期一小时最多提醒一次。修改任务或重启不重置间隔。</p></form><details class="tm-method"><summary>提醒如何判定？</summary><p>勾选的大周期EMA10全部向上，才观察小周期向上拐头与价格上穿；全部向下时镜像观察做空。EMA10走平、反向或数据不足时等待。</p><p>先用连续行情建立基线；小周期EMA10从反向或走平拐向目标方向后，等待价格跨过EMA10。首次启动、断线重连、换合约时均重新建立基线，不把原有状态当成新穿越。</p><p>本页采用盘中即时判断，K线未收完，方向随后可能变化。退出页面仍会监控；小木服务停止、电脑休眠或网络中断时无法继续观察。</p></details></section><div class="tm-right"><section class="tm-panel"><header><h2>已设置的任务</h2><span data-tm-task-count></span></header><div data-tm-tasks class="tm-task-list"></div></section><section class="tm-panel tm-weixin"><header><h2>微信事件推送</h2><span data-tm-weixin-label>待核验</span></header><p data-tm-weixin-state>正在读取连接状态…</p><div data-tm-qr hidden></div><form data-tm-verify hidden><label>手机显示的验证数字<input name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="12"></label><button type="submit">确认数字</button></form><div class="tm-form-actions"><button type="button" data-tm-login>连接微信</button><button type="button" data-tm-weixin-test>发送测试提醒</button><button type="button" data-tm-weixin-disconnect>断开</button></div><p class="tm-caption">扫码绑定后，先向机器人发一条消息，建立本人推送会话。测试提醒单独标明，不计入真实信号。</p></section></div></div><section class="tm-panel"><header><h2>最新触发事件</h2><span>事件保留触发依据和推送回执</span></header><div data-tm-events></div></section><details class="tm-panel tm-observations"><summary>全品种跟踪进度 <span data-tm-coverage></span></summary><div data-tm-observations></div></details><details class="tm-panel tm-gaps"><summary>数据缺口与运行说明 <span data-tm-gap-count></span></summary><div data-tm-gaps></div></details></section>`;
  const page=q('.trend-monitor-page'),layout=q('.tm-layout'),editor=q('.tm-editor'),taskPanel=q('[data-tm-tasks]').closest('section'),wx=q('.tm-weixin');
  const settings=document.createElement('details');settings.className='tm-settings tm-panel';settings.innerHTML='<summary>监控设置与任务管理 <span data-tm-task-summary></span></summary><div class="tm-settings-grid"></div>';settings.querySelector('div').append(editor,taskPanel);
  const filters=document.createElement('div');filters.className='tm-universe-filters';filters.innerHTML='<section class="tm-watch-picker"><header><b>监控品种</b><span data-tm-selection-state role="status"></span></header><div class="tm-picker-line"><b>板块</b><div data-tm-sector-buttons></div><div class="tm-fire-pools" data-tm-fire-pools role="group" aria-label="火机会候选池"></div></div><p class="tm-fire-pool-state" data-tm-fire-pool-state role="status"></p><div class="tm-picker-tools"><label class="tm-row-search">搜索<input type="search" data-tm-row-search placeholder="品种、代码或合约"></label><button type="button" data-tm-select-visible>关注当前范围</button><button type="button" data-tm-clear-visible>取消当前范围关注</button><label><input type="checkbox" data-tm-selected-only>只看已关注</label><button type="button" data-tm-alarm-test>试听语音</button></div><div class="tm-picker-line"><b>品种</b><div data-tm-watch-products></div></div><p class="tm-caption">点击“关注”立即监控，点击“已关注”立即取消。未关注不监控、不提醒；同一品种同一周期一小时最多提醒一次。</p></section>';
  const universe=document.createElement('section');universe.className='tm-universe';universe.setAttribute('aria-label','全品种EMA10方向与警报');universe.dataset.tmUniverse='';
  const periodBar=document.createElement('div');periodBar.className='tm-period-bar';periodBar.dataset.tmPeriodBar='';
  const soundBar=document.createElement('div');soundBar.className='tm-sound-bar';soundBar.dataset.tmSoundBar='';
  layout.replaceWith(wx,settings,filters,soundBar,periodBar,universe);wx.classList.remove('tm-panel');
  const eventPanel=q('[data-tm-events]').closest('section'),eventHistory=document.createElement('details');eventHistory.className='tm-panel tm-event-history';eventHistory.innerHTML='<summary>触发事件与证据历史</summary>';eventHistory.append(q('[data-tm-events]'));eventPanel.replaceWith(eventHistory);
  q('.tm-intro h2').textContent='全品种周期方向与警报';q('.tm-intro p').innerHTML='方向只按EMA10斜率 · <span class="tm-bull">↑ 向上</span> / <span class="tm-bear">↓ 向下</span> · 灰色为走平或数据不足';
  mountWeixinDialog();renderSounds();
  if(globalThis.window?.xiaomuMonitor?.alarmSettings)void window.xiaomuMonitor.alarmSettings().then(v=>{soundId=v.voiceId||'taiwan-female';localActive=v.active===true;localKnown=typeof v.active==='boolean';renderSounds()}).catch(e=>notify('警报偏好读取失败：'+e.message));
  host.addEventListener('click',click);host.addEventListener('change',change);host.addEventListener('input',input);host.addEventListener('submit',submit);mounted=true;fill(draftMemory);
 }
 function formDraft(){const form=q('#trendTaskForm'),checked=name=>[...form.querySelectorAll(`input[name="${name}"]:checked`)].map(e=>e.value);return {title:form.elements.title.value,bigPeriods:checked('bigPeriods'),smallPeriods:checked('smallPeriods'),direction:form.elements.direction.value,scope:form.elements.scope.value,codes:checked('codes'),channels:checked('channels'),status:'active'}}
 function fill(draft){const form=q('#trendTaskForm');if(!form)return;form.elements.title.value=draft.title||draft.name||'';form.elements.direction.value=draft.direction||'both';form.elements.scope.value=draft.scope==='codes'?'codes':'all';for(const field of form.querySelectorAll('input[type="checkbox"]'))field.checked=array(draft[field.name]).includes(field.value);q('[data-tm-products]').hidden=form.elements.scope.value!=='codes';q('[data-tm-editor-title]').textContent=editId?'修改任务条件':'设置监控任务';q('[data-tm-save]').textContent=editId?'保存新版并启用':'保存并启用'}
 function renderCatalog(){const selected=new Set(formDraft().codes);q('[data-tm-catalog]').innerHTML=catalog.length?catalog.map(p=>`<label><input type="checkbox" name="codes" value="${esc(p.code)}" ${selected.has(p.code)?'checked':''}><span><b>${esc(p.code)}</b> ${esc(p.name)}</span></label>`).join(''):'暂未取得具体主力合约列表'}
 function refreshParts(){
  const market=payload.market||{},coverage=payload.coverage||{},tasks=array(payload.tasks),observations=array(payload.observations),events=array(payload.events),latest=market.lastQuoteAt||market.quoteAt||market.heartbeatAt;
  const connected=market.status==='connected'&&market.heartbeatFresh!==false;
  q('[data-tm-runtime]').classList.toggle('tm-connected',connected);q('[data-tm-runtime]').innerHTML=`<b>${esc(market.message||({connected:'行情连接已建立',unconfigured:'行情待配置',disconnected:'行情已断开',stopped:'监控已停止',failed:'行情连接失败'}[market.status]||'监控行情待核验'))}</b><span>来源：${esc(market.source||market.provider||'待核验')} · 行情时间：${esc(date(latest))} · 监听 ${num(coverage.observed??market.subscribed??0)} / ${num(coverage.catalog??catalog.length)} 个品种</span>`;
  q('[data-tm-tasks]').innerHTML=renderTrendTasks(tasks);q('[data-tm-task-count]').textContent=`${tasks.filter(t=>t.status==='active').length} 个启用`;q('[data-tm-task-summary]').textContent=`${tasks.filter(t=>t.status==='active').length} 个启用 · 点开修改周期、方向与提醒方式`;
  renderUniverse();
  q('[data-tm-events]').innerHTML=renderTrendEvents(events);q('[data-tm-observations]').innerHTML=renderTrendObservations(observations);q('[data-tm-coverage]').textContent=`${observations.length} 条周期状态`;
  const gaps=observations.filter(o=>o.status==='waiting-data');q('[data-tm-gap-count]').textContent=gaps.length?`${gaps.length} 条待数据`:'';
  q('[data-tm-gaps]').innerHTML=`<p>${esc(payload.notice||'电脑保持运行、行情持续连接时，任务在后台跟踪。')}</p>`+(gaps.length?`<ul>${gaps.map(g=>`<li>${esc(g.code||g.symbol)} ${esc(labels[g.period]||g.period||'')}：${esc(g.reason||'行情不足，暂停判断')}</li>`).join('')}</ul>`:'<p>当前未报告额外缺口；以逐品种跟踪状态为准。</p>');renderWeixin(payload.weixin||login||{});
 }

 function allRows(){return (Array.isArray(payload.rows)?payload.rows:catalog.map(c=>({...c,signals:{},alerts:[]}))).map(r=>({...r,sector:r.sector||panoramaSectorFor(r)}))}
 function matchingRows(){const codes=rowPool==='all'?null:firePoolCodes(fireScan,rowPool);return allRows().filter(r=>(!codes||codes.has(r.code))&&(rowSector==='all'||r.sector===rowSector)&&(!rowSearch||[r.code,r.name,r.symbol].some(v=>String(v||'').toLowerCase().includes(rowSearch.toLowerCase()))))}
 async function loadFire(force=false){
  if(fireBusy||!force&&Date.now()-fireUpdatedAt<60000)return;fireBusy=true;const request=++fireRequest;
  try{const response=await fetchImpl('/api/workbench/fire',{cache:'no-store',signal:AbortSignal.timeout(15000)}),data=await response.json();if(!response.ok||!Array.isArray(data.rows))throw Error(data.error||'未取得有效候选名单');if(!running||request!==fireRequest)return;fireScan=data;fireError='';fireUpdatedAt=Date.now();}
  catch(e){if(running&&request===fireRequest){fireError='火候选读取失败：'+e.message;fireUpdatedAt=Date.now();}}
  finally{if(request===fireRequest){fireBusy=false;if(running)renderUniverse()}}
 }
 function renderFirePools(rows){
  q('[data-tm-fire-pools]').innerHTML=[['all','全部品种'],...monitorFirePools].map(([id,label])=>'<button type="button" data-tm-fire-pool="'+id+'" aria-pressed="'+(rowPool===id)+'" class="'+(rowPool===id?'selected':'')+'" '+(id!=='all'&&!fireScan?'disabled':'')+'>'+label+' <span>'+(id==='all'?rows.length:fireScan?firePoolCodes(fireScan,id).size:'—')+'</span></button>').join('');
  const current=monitorFirePools.find(([id])=>id===rowPool),total=current?firePoolCodes(fireScan,rowPool):null,available=total?rows.filter(r=>total.has(r.code)).length:rows.length;
  q('[data-tm-fire-pool-state]').innerHTML=(fireError?'<span class="tm-fire-pool-error">'+esc(fireError)+(fireScan?'；保留上次名单，暂不能应用本池':'；请刷新重试')+'</span>':fireScan?'火扫描 · 行情 '+esc(fireScan.dataDate||fireScan.data_date||'待核验')+' · '+(current?current[1]+' '+total.size+' 个，当前可监控 '+available+' 个':'候选名单与“火·识别机会”一致'):'正在读取“火·识别机会”的候选名单…')+(current?'<button type="button" data-tm-pool-only '+(!fireScan||fireError||!available||actionBusy?'disabled':'')+'>仅监控本池 '+available+' 个</button>':'')+'<small>周期筛选只聚焦显示；点“仅监控本池”收紧后台范围，或逐个点击“关注”。名单随火扫描更新，已应用的监控选择保留。</small>';
 }
 function renderUniverse(){
  const rows=allRows(),w=payload.watchlist||{mode:'codes',codes:[],version:0};
  if(!selectionDirty){selectionCodes=new Set(rows.filter(r=>w.mode==='codes'&&array(w.codes).includes(r.code)).map(r=>r.code));selectionVersion=w.version||0;}
  q('[data-tm-sector-buttons]').innerHTML=[['all','全部'],...panoramaSectors.map(s=>[s,s])].map(([id,label])=>'<button type="button" data-tm-sector="'+esc(id)+'" aria-pressed="'+(rowSector===id)+'" class="'+(rowSector===id?'selected':'')+'">'+esc(label)+'</button>').join('');
  renderFirePools(rows);
  q('[data-tm-watch-products]').innerHTML=renderMonitorDirectionPicker(matchingRows(),fireScan,rowPool,selectionCodes);
  q('[data-tm-selection-state]').textContent='已关注 '+(selectionCodes?.size||0)+' / '+rows.length+' 个 · '+(actionBusy?'正在保存…':'已生效 · 同品种同周期一小时最多一次');
  for(const b of host.querySelectorAll('[data-tm-follow],[data-tm-select-visible],[data-tm-clear-visible]'))b.disabled=actionBusy;
  renderPeriodBar();
  const hour=array(payload.tasks).some(t=>t.status!=='archived'&&array(t.smallPeriods).includes('60m'))||array(headerDraft?.smallPeriods).includes('60m'),scroll=q('.tm-universe-scroll'),top=scroll?.scrollTop||0;
  q('[data-tm-universe]').innerHTML=renderTrendUniverse(rows,{hour,search:rowSearch,sector:rowSector,selectedOnly,selectionCodes,periodTask:headerDraft,periodBusy:headerBusy,poolCodes:rowPool==='all'?null:firePoolCodes(fireScan,rowPool),directionGroups:monitorDirectionGroups(rows,fireScan,rowPool)});q('.tm-universe-scroll').scrollTop=top;
 }


 function renderSounds(){
  const native=!!globalThis.window?.xiaomuMonitor?.alarmSettings,capable=!!globalThis.window?.xiaomuMonitor?.alarmActivity;
  q('.trend-monitor-page')?.classList.toggle('tm-quiet-local',!localActive);
  q('[data-tm-sound-bar]').innerHTML='<div class="tm-local-alert-control"><b>语音弹窗提醒</b><button type="button" data-tm-local-toggle class="'+(!localActive?'primary':'')+'" aria-pressed="'+localActive+'" '+(!capable||!localKnown||localBusy?'disabled':'')+'>'+(localBusy?'正在切换…':localActive?'停止语音与弹窗':'启动语音与弹窗')+'</button><span role="status" data-tm-local-state>'+(!capable?(native?'请重新打开小木启用提醒开关':'网页保留页面轻提示'):!localKnown?'正在核对本机提醒状态…':localActive?'已启动 · 仅提醒启动后的新信号':'轻提示 · 不播报，不弹窗')+'</span></div><b>音色</b>'+alarmVoices.map(s=>'<div class="tm-sound-choice"><label><input type="radio" name="tmSound" value="'+s.id+'" '+(s.id===soundId?'checked':'')+' '+(!native||soundBusy?'disabled':'')+'>'+s.name+'</label><button type="button" data-tm-sound-preview="'+s.id+'" '+(!capable||!localActive||localBusy?'disabled':'')+'>试听</button></div>').join('')+'<small>'+(capable?'1.5倍速 · 重新打开默认轻提示 · 监控任务和微信推送沿用原设置':'在新版小木桌面端启动语音弹窗提醒后可试听')+'</small>';
  const preview=q('[data-tm-alarm-test]');if(preview)preview.disabled=!capable||!localActive||localBusy;
 }
 function renderPeriodBar(){
  const tasks=array(payload.tasks).filter(t=>t.status!=='archived');
  if(!headerDirty&&!headerBusy){const task=tasks.find(t=>t.id===headerTaskId)||tasks.find(t=>t.status==='active')||tasks[0];headerTaskId=task?.id||null;headerDraft=task?{...task,bigPeriods:[...task.bigPeriods],smallPeriods:[...task.smallPeriods]}:defaultTrendDraft();}
  const draft=headerDraft||defaultTrendDraft(),big=array(draft.bigPeriods).map(p=>labels[p]).join('＋'),small=array(draft.smallPeriods).map(p=>labels[p]).join(' / '),paused=!big||!small||draft.status==='paused';
  q('[data-tm-period-bar]').innerHTML=(tasks.length>1?'<label>当前任务 <select data-tm-header-task '+(headerBusy||headerDirty?'disabled':'')+'>'+tasks.map(t=>'<option value="'+esc(t.id)+'" '+(t.id===headerTaskId?'selected':'')+'>'+esc(t.title)+'</option>').join('')+'</select></label>':'')+'<b>表头勾选即保存</b><span role="status" data-tm-period-state>'+esc(headerBusy?'正在保存…':headerError?'保存失败：'+headerError+'；后台仍按原设置监控':headerDirty?'正在应用新周期…':paused?'已暂停 · 请勾选环境周期和触发周期':big+' 同向 → '+small+' 分别拐头＋穿线')+'</span>'+(headerError?'<button type="button" data-tm-period-retry>重试保存</button>':'')+'<small>月 / 周 / 日判断环境；小周期分别触发，不必同时出现信号。</small>';
 }
 async function saveHeaderPeriods(){
  if(headerBusy||!headerDirty)return;headerBusy=true;headerError='';renderUniverse();
  try{
   const draft={...headerDraft,expectedVersion:headerDraft.version};
   draft.status=draft.bigPeriods.length&&draft.smallPeriods.length?'active':'paused';
   draft.title=draft.bigPeriods.map(p=>labels[p]).join('＋')+'同向 · '+draft.smallPeriods.map(p=>labels[p]).join('/')+'拐点';
   const result=await api('tasks'+(headerTaskId?'/'+encodeURIComponent(headerTaskId):''),draft);
   headerTaskId=result.id;headerDraft=result;payload.tasks=[result,...array(payload.tasks).filter(t=>t.id!==result.id)];headerDirty=false;
   await refresh();
  }catch(e){headerError=e.message;notify('周期未保存：'+e.message)}finally{headerBusy=false;if(running)renderUniverse()}
 }
 const wxBound=wx=>wx?.connected===true||wx?.bound===true||wx?.pushReady===true||wx?.ready===true||['connected','ready','waiting-context','bound'].includes(wx?.state||wx?.status);
 function mountWeixinDialog(){
  closeWeixinDialog();weixinDialog?.remove();weixinDialog=document.createElement('dialog');weixinDialog.className='tm-weixin-dialog';weixinDialog.id='trendWeixinDialog';weixinDialog.setAttribute('aria-labelledby','trendWeixinDialogTitle');
  weixinDialog.innerHTML='<header><h2 id="trendWeixinDialogTitle">连接微信</h2><button type="button" data-tm-login-cancel aria-label="关闭微信扫码弹窗">×</button></header><div class="tm-weixin-dialog-body"><p class="tm-weixin-login-notice" data-tm-login-notice></p><div class="tm-weixin-login-status" role="status" aria-live="polite" data-tm-login-status>正在生成二维码…</div><div class="tm-weixin-login-content"></div><p class="tm-weixin-login-expiry" data-tm-login-expiry></p><p class="tm-weixin-login-hint">扫码确认后改发到新微信；请用新微信向机器人发一条消息，建立推送会话。</p></div><footer><button type="button" data-tm-login-retry hidden>重新获取二维码</button><button type="button" data-tm-login-cancel>取消扫码并关闭</button></footer>';
  const content=weixinDialog.querySelector('.tm-weixin-login-content');content.append(host.querySelector('[data-tm-qr]'),host.querySelector('[data-tm-verify]'));weixinDialog.addEventListener('click',click);weixinDialog.addEventListener('submit',submit);weixinDialog.addEventListener('cancel',event=>{event.preventDefault();void cancelWeixinLogin()});document.body.append(weixinDialog);
 }
 function closeWeixinDialog(){if(!weixinDialog)return;if(typeof weixinDialog.close==='function'&&weixinDialog.open)weixinDialog.close();else weixinDialog.removeAttribute('open')}
 function openWeixinDialog(){if(weixinDialog.open)return;if(typeof weixinDialog.showModal==='function')weixinDialog.showModal();else weixinDialog.setAttribute('open','')}
 function renderWeixinDialog(wx=loginView.wx){
  if(!loginView.active||!weixinDialog)return;
  if(loginView.id&&wx?.login?.id===loginView.id&&loginView.phase!=='loading'){loginView.id=wx.login.id;loginView.wx=wx}
  const current=loginView.wx||{},entry=current.login||{},state=entry.state||'waiting',confirmed=state==='bound',ready=confirmed&&(current.pushReady===true||current.ready===true),expired=state==='expired',failed=state==='failed'||!!entry.error;
  q('#trendWeixinDialogTitle').textContent=loginView.replace?'更换接收微信':'连接微信';
  q('[data-tm-login-notice]').textContent=loginView.replace?'旧微信在新微信扫码确认前继续可用。取消扫码会保留原收件人。':'请用需要接收提醒的微信扫描下方二维码。';
  const message=loginView.phase==='loading'?'正在生成二维码…':loginView.error||entry.error||(confirmed?(ready?'新微信已确认，推送会话已建立。':'新微信已扫码确认。请向机器人发一条消息，建立新的推送会话。'):expired?'二维码已过期，请重新获取。':entry.needsCode||state==='need_verifycode'?'已扫码，请填写手机上显示的验证数字。':['scanned','scaned','scaned_wait_confirm','scanned_wait_confirm'].includes(state)?'已扫码，请在手机微信中确认。':'请用另一部手机的微信扫码，并在手机中确认。');
  q('[data-tm-login-status]').textContent=message;q('[data-tm-login-status]').classList.toggle('tm-login-error',!!loginView.error||failed||expired);q('[data-tm-login-status]').classList.toggle('tm-login-success',confirmed&&!loginView.error);
  const image=entry.qr||current.qrCodeImageUrl||current.qrImage,qr=q('[data-tm-qr]'),safe=typeof image==='string'&&/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(image);
  qr.hidden=loginView.phase==='loading'||!safe||confirmed||expired;if(safe&&qr.dataset.image!==image){qr.innerHTML=`<img alt="请使用接收提醒的微信扫描此二维码" src="${esc(image)}">`;qr.dataset.image=image}
  q('[data-tm-verify]').hidden=loginView.phase==='loading'||confirmed||!(entry.needsCode===true||['need_verifycode','need-verifycode','verify-required'].includes(state));
  q('[data-tm-login-expiry]').textContent=entry.expiresAt&&!confirmed&&!expired?'二维码有效至 '+date(entry.expiresAt):'';
  q('[data-tm-login-retry]').hidden=loginView.phase==='loading'||!(loginView.error||failed||expired);q('[data-tm-login-retry]').textContent=expired?'重新获取二维码':'重试生成二维码';
  for(const button of weixinDialog.querySelectorAll('[data-tm-login-cancel]'))if(!button.hasAttribute('aria-label'))button.textContent=confirmed?'完成并关闭':'取消扫码并关闭';
 }
 function renderWeixin(wx){
  if(!q('[data-tm-weixin-state]'))return;const status=wx.state||wx.status||'unconfigured',ready=wx.pushReady===true||wx.ready===true,bound=wxBound(wx),pendingReplace=loginView.active&&loginView.replace&&loginView.wx?.login?.state!=='bound';
  q('[data-tm-weixin-label]').textContent=pendingReplace?'旧微信保留 · 换绑中':ready?'可推送':bound?'已绑定，待会话':status==='waiting'||status==='pending'?'等待扫码':'待连接';q('[data-tm-login]').textContent=bound?'更换接收微信':'连接微信';
  q('[data-tm-weixin-state]').textContent=wx.note||wx.message||wx.error||({unconfigured:'微信尚未绑定',waiting:'请扫码连接微信',pending:'请扫码连接微信',expired:'二维码已过期，请重新连接',failed:'连接失败，请重试',ready:'已建立推送会话'}[status]||'微信连接状态待核验');
  q('[data-tm-weixin-test]').disabled=!ready||actionBusy;q('[data-tm-weixin-disconnect]').disabled=!bound||actionBusy;renderWeixinDialog(wx);
 }
 async function beginWeixinLogin(){
  if(loginView.active&&loginView.phase==='loading')return;const previous=payload.weixin||login||{},replace=loginView.active?loginView.replace:wxBound(previous),request=++loginRequest;
  Object.assign(loginView,{active:true,replace,phase:'loading',id:null,wx:null,error:null,previousWx:previous});openWeixinDialog();renderWeixinDialog();
  try{const result=await api('weixin/login',{replace});if(request!==loginRequest||!loginView.active){if(result.login?.id)void api('weixin/login/cancel',{id:result.login.id}).catch(()=>{});return}login=result;payload.weixin=result;loginView.phase='waiting';loginView.id=result.login?.id||null;loginView.wx=result;if(!result.login?.id)loginView.error='未取得新的微信二维码，请重试。';else if(replace&&previous.login?.state==='bound'&&result.login.id===previous.login.id)loginView.error='尚未生成新的扫码会话，请重新获取二维码。';else if(!result.login.needsCode&&!['bound','expired','failed'].includes(result.login.state)&&!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(result.login.qr||''))loginView.error='未取得可显示的二维码，请重新获取。';renderWeixin(result)}catch(error){if(request!==loginRequest||!loginView.active)return;loginView.phase='failed';loginView.error='二维码生成失败：'+error.message;renderWeixinDialog()}
 }
 async function cancelWeixinLogin(){
  const id=loginView.id||loginView.wx?.login?.id||null,previous=loginView.previousWx,request=++loginRequest;loginView.active=false;loginView.phase='idle';closeWeixinDialog();
  try{const result=await api('weixin/login/cancel',{id});if(request!==loginRequest)return;if(result&&('connected'in result||'state'in result)){payload.weixin=result;login=result}else if(previous){payload.weixin=previous;login=previous}renderWeixin(payload.weixin||{})}catch(error){notify('扫码取消未确认：'+error.message+'；原收件人不会因关闭窗口而解绑。')}
 }
 async function refresh(forceFire=false){if(!running||busy)return;const fire=loadFire(forceFire);busy=true;const version=++requestVersion;try{const data=await api('status');if(!running||version!==requestVersion)return;payload=data;refreshParts();}catch(error){if(running&&version===requestVersion){q('[data-tm-runtime]').textContent='监控状态读取失败：'+error.message;q('[data-tm-runtime]').classList.remove('tm-connected')}}finally{if(version===requestVersion)busy=false}await fire;}
 async function action(work,success){if(actionBusy)return;actionBusy=true;for(const button of host.querySelectorAll('button[data-tm-save],button[data-tm-login]'))button.disabled=true;try{renderUniverse();await work();if(success)notify(success);await refresh()}catch(error){notify(error.message)}finally{actionBusy=false;for(const button of host.querySelectorAll('button[data-tm-save],button[data-tm-login]'))button.disabled=false;renderWeixin(payload.weixin||login||{});renderUniverse()}}
 async function click(event){const b=event.target.closest('button');if(!b||!host.contains(b)&&!weixinDialog?.contains(b))return;
  if(b.hasAttribute('data-tm-login-cancel'))return void cancelWeixinLogin();
  if(b.hasAttribute('data-tm-login-retry'))return void beginWeixinLogin();
  if(b.hasAttribute('data-tm-period-retry'))return void saveHeaderPeriods();
  if(b.hasAttribute('data-tm-refresh')){if(headerError){headerDirty=false;headerError=''}return void refresh(true);}
  if(b.hasAttribute('data-tm-fire-pool')){rowPool=b.dataset.tmFirePool;rowSearch='';const search=q('[data-tm-row-search]');if(search)search.value='';renderUniverse();return}
  if(b.hasAttribute('data-tm-pool-only')){if(!fireScan||fireError||rowPool==='all')return;const pool=firePoolCodes(fireScan,rowPool),codes=allRows().filter(r=>pool.has(r.code)).map(r=>r.code);if(!codes.length)return;return void action(async()=>{const value=await api('watchlist',{mode:'codes',codes,version:selectionVersion});payload.watchlist=value;selectionDirty=false;selectionCodes=null},'已仅监控本池品种；周期、方向和提醒方式保持原设置');}
  if(b.hasAttribute('data-tm-sector')){rowSector=b.dataset.tmSector;renderUniverse();return}
  if(b.hasAttribute('data-tm-follow')||b.hasAttribute('data-tm-select-visible')||b.hasAttribute('data-tm-clear-visible')){if(actionBusy)return;const codes=new Set(selectionCodes||[]),code=b.dataset.tmFollow;if(code){if(codes.has(code))codes.delete(code);else codes.add(code)}else for(const row of matchingRows())if(b.hasAttribute('data-tm-select-visible'))codes.add(row.code);else codes.delete(row.code);return void action(async()=>{const value=await api('watchlist',{mode:'codes',codes:[...codes],version:selectionVersion});payload.watchlist=value;selectionDirty=false;selectionCodes=null},'关注已保存；只监控已关注品种，同品种同周期一小时最多提醒一次');}
  if(b.hasAttribute('data-tm-local-toggle')){if(localBusy||!globalThis.window?.xiaomuMonitor?.alarmActivity)return;localBusy=true;renderSounds();void window.xiaomuMonitor.alarmActivity(!localActive).then(v=>{localActive=v.active===true;localKnown=true;notify(localActive?'已启动语音与弹窗提醒':'已切回页面轻提示')}).catch(e=>notify('提醒开关未生效：'+e.message)).finally(()=>{localBusy=false;renderSounds()});return}
  if(b.dataset.tmSoundPreview){void window.xiaomuMonitor.testAlarm(b.dataset.tmSoundPreview).catch(e=>notify(e.message));return}
  if(b.hasAttribute('data-tm-alarm-test')){if(globalThis.window?.xiaomuMonitor?.testAlarm)void window.xiaomuMonitor.testAlarm().catch(e=>notify(e.message));else notify('独立声音弹窗需使用新版小木桌面端；微信与页面警报仍按任务运行。');return}

  if(b.dataset.tmRead)return void action(async()=>{await api('events/'+encodeURIComponent(b.dataset.tmRead)+'/read',{});for(const row of array(payload.rows))for(const alert of array(row.alerts))if(alert.id===b.dataset.tmRead)alert.readAt=new Date().toISOString();renderUniverse()},'警报已读，记录保留');
  if(b.dataset.tmPreset!==undefined){const selected=b.dataset.tmPreset.split(',');for(const field of q('#trendTaskForm').querySelectorAll('input[name="bigPeriods"]'))field.checked=selected.includes(field.value);return}
  if(b.hasAttribute('data-tm-new')){editId=null;fill(defaultTrendDraft());return}
  if(b.dataset.tmEdit){const task=array(payload.tasks).find(t=>t.id===b.dataset.tmEdit);if(task){editId=task.id;fill(task);q('#trendTaskForm').scrollIntoView?.({block:'nearest',behavior:'smooth'})}return}
  if(b.dataset.tmAction)return void action(()=>api('tasks/'+encodeURIComponent(b.dataset.tmId)+'/'+b.dataset.tmAction,{}),'任务状态已更新');
  if(b.hasAttribute('data-tm-login'))return void beginWeixinLogin();
  if(b.hasAttribute('data-tm-weixin-test'))return void action(async()=>{const result=await api('weixin/test',{});notify(result.message||'测试请求已提交，请以发送回执和手机实际接收为准')});
  if(b.hasAttribute('data-tm-weixin-disconnect'))return void action(async()=>{await api('weixin/disconnect',{});login=null},'微信已断开');
 }
 function change(event){
  if(event.target.name==='tmSound'){const id=event.target.value,previous=soundId;soundId=id;soundBusy=true;renderSounds();void window.xiaomuMonitor.alarmSettings(id).then(v=>{soundId=v.voiceId;notify('已选择'+alarmVoices.find(s=>s.id===soundId).name)}).catch(e=>{soundId=previous;notify('未保存声音选择：'+e.message)}).finally(()=>{soundBusy=false;renderSounds()});return}

  if(event.target.hasAttribute('data-tm-header-task')){headerTaskId=event.target.value;headerDirty=false;headerError='';renderUniverse();return}
  if(event.target.hasAttribute('data-tm-period')){const id=event.target.dataset.tmPeriod,key=bigPeriods.some(([p])=>p===id)?'bigPeriods':'smallPeriods',selected=new Set(headerDraft[key]);if(event.target.checked)selected.add(id);else selected.delete(id);headerDraft={...headerDraft,[key]:[...selected]};headerDirty=true;headerError='';clearTimeout(headerTimer);headerTimer=setTimeout(()=>void saveHeaderPeriods(),250);renderUniverse();return}
if(event.target.hasAttribute('data-tm-selected-only')){selectedOnly=event.target.checked;renderUniverse();return}if(event.target.name==='scope')q('[data-tm-products]').hidden=event.target.value!=='codes';if(event.target.hasAttribute('data-tm-row-sector')){rowSector=event.target.value;renderUniverse()}}
 function input(event){if(event.target.hasAttribute('data-tm-row-search')){rowSearch=event.target.value;renderUniverse()}}
 function submit(event){
  if(event.target.id==='trendTaskForm'){event.preventDefault();let draft;try{draft=validateTrendDraft(formDraft())}catch(e){notify(e.message);return}void action(async()=>{const result=await api('tasks'+(editId?'/'+encodeURIComponent(editId):''),draft);editId=null;fill(defaultTrendDraft());notify((result.title||draft.title)+' 已保存并启用')});}
  else if(event.target.hasAttribute('data-tm-verify')){event.preventDefault();const code=event.target.elements.code.value.trim();if(!/^\d{1,12}$/.test(code)){loginView.error='请输入手机显示的验证数字';renderWeixinDialog();return}const request=loginRequest,id=loginView.id;if(!loginView.active||!id)return;void(async()=>{try{const result=await api('weixin/verify',{id,code});if(request!==loginRequest||!loginView.active)return;login=result;payload.weixin=result;loginView.wx=result;loginView.error=null;renderWeixin(result)}catch(error){if(request===loginRequest&&loginView.active){loginView.error='验证未通过：'+error.message;renderWeixinDialog()}}})()}
 }
 function start(){if(running&&host.querySelector('.trend-monitor-page'))return;if(!host.querySelector('.trend-monitor-page')){if(mounted){host.removeEventListener('click',click);host.removeEventListener('change',change);host.removeEventListener('input',input);host.removeEventListener('submit',submit)}mount()}running=true;void refresh();timer=setInterval(()=>{if(document.visibilityState!=='hidden')void refresh()},4000);void api('catalog').then(data=>{if(!running)return;catalog=array(data.items);renderCatalog();renderUniverse()}).catch(()=>{})}
 function stop(){clearTimeout(headerTimer);if(headerDirty&&!headerBusy)void saveHeaderPeriods();if(q('#trendTaskForm'))draftMemory=formDraft();if(loginView.active)void cancelWeixinLogin();else closeWeixinDialog();running=false;requestVersion++;fireRequest++;fireBusy=false;clearInterval(timer);clearInterval(pollTimer);timer=null;busy=false;}
 return {start,stop,refresh};
}
