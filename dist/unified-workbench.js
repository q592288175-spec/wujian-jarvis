const marketPages=[['home','市场总览','layout-dashboard'],['overview','周期强弱','grid-2x2'],['strength','品种强弱','chart-no-axes-combined'],['monitor','全品种监控','radar'],['rankings','资金排行','list-ordered'],['funds','资金动向','chart-spline'],['positions','持仓动向','chart-column-increasing'],['fees','期货手续费','calculator'],['variety','品种跟踪','crosshair'],['seat-flow','席位动向','users']];
import {mountTqLogin} from './tq-login-ui.js';
mountTqLogin();
const tradePages=[['home','今日总览','总'],['fire','火 · 识别机会','火'],['water','水 · 分析机会','水'],['metal','金 · 冻结计划','金'],['earth','土 · 执行管理','土'],['wood','木 · 检查迭代','木']];
const systemPages=[['monitor','盯盘提醒','bell'],['rules','账户与规则','settings-2']];
const $=s=>document.querySelector(s),nav=$('#mainNav'),drafts=new Map(),detailsState=new Map(),scrolls=new Map();
let trade,market,marketPromise,current=null,requested=0,lastApplied=null,navigationQueue=Promise.resolve();
const label=route=>{const[group,page]=route.split('/');return(group==='market'?marketPages:[...tradePages,...systemPages]).find(p=>p[0]===page)?.[1]||'市场总览'};
const valid=route=>/^(market|trade)\/[a-z-]+$/.test(route)&&!!(route.startsWith('market/')?marketPages:[...tradePages,...systemPages]).find(p=>p[0]===route.split('/')[1]);
export function normalizeRoute(value){const route=String(value||'').replace(/^#/,'');if(valid(route))return route;const params=new URLSearchParams(location.search);if(params.has('view')&&valid('trade/'+params.get('view')))return'trade/'+params.get('view');if(marketPages.some(p=>p[0]===route))return'market/'+route;const saved=localStorage.getItem('wj-unified-page');return valid(saved)?saved:'market/home'}
const item=(group,[page,title,icon])=>`<a href="#${group}/${page}" data-route="${group}/${page}" ${group==='market'?`data-nav="${page}"`:`data-view="${page}"`}><span class="nav-icon">${group==='trade'&&tradePages.some(p=>p[0]===page)?`<span class="element-mark" data-element="${page}">${icon}</span>`:`<i data-lucide="${icon}"></i>`}</span><span>${title}</span></a>`;
nav.innerHTML=`<h2 class="nav-group-title">看市场</h2>${marketPages.map(p=>item('market',p)).join('')}<h2 class="nav-group-title">做交易</h2>${tradePages.map(p=>item('trade',p)).join('')}<h2 class="nav-group-title">系统</h2>${systemPages.map(p=>item('trade',p)).join('')}`;
window.lucide?.createIcons();
const message=error=>{$('#toast').textContent=error.message||String(error);$('#toast').className='show error';setTimeout(()=>$('#toast').className='',5000)};
function notify(text,error=false){const node=$('#toast');if(!node)return;node.textContent=text;node.className=error?'show error':'show';clearTimeout(notify.timer);notify.timer=setTimeout(()=>node.className='',4500)}
async function copyPlainText(text){
 try{if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(text);return true}}catch{}
 const area=document.createElement('textarea');area.value=text;area.setAttribute('readonly','');area.style.position='fixed';area.style.left='-9999px';document.body.append(area);area.select();area.setSelectionRange(0,text.length);let ok=false;try{ok=document.execCommand('copy')}finally{area.remove()}if(!ok)throw Error('浏览器未允许写入剪贴板');return true;
}
function showAgentPrompt(text){
 $('#modalTitle').textContent='AI 接入提示词';
 $('#modalBody').replaceChildren();
 const tip=document.createElement('p');tip.className='hint';tip.textContent='复制下面的完整提示词，直接粘贴给 Claude、Cursor、Codex、DSH 或其他 AI。它包含路径、配置、自检和权限边界。';
 const area=document.createElement('textarea');area.value=text;area.readOnly=true;area.style.width='100%';area.style.minHeight='320px';area.style.fontFamily='ui-monospace,Consolas,monospace';area.style.fontSize='12px';
 const actions=document.createElement('div');actions.className='actions';
 const copy=document.createElement('button');copy.className='primary';copy.type='button';copy.textContent='再次复制';copy.onclick=()=>copyPlainText(text).then(()=>notify('已复制 AI 接入提示词')).catch(error=>notify(error.message,true));
 const close=document.createElement('button');close.className='quiet';close.type='button';close.textContent='关闭';close.onclick=()=>$('#modal').close();
 actions.append(copy,close);$('#modalBody').append(tip,area,actions);if(!$('#modal').open)$('#modal').showModal();area.focus();area.select();
}
async function copyAgentOnboarding(){
 const button=$('#agentSetupButton');if(!button)return;const old=button.textContent;button.disabled=true;button.textContent='正在读取…';
 try{
  const response=await fetch('/agent-onboarding.txt',{cache:'no-store'});if(!response.ok)throw Error('提示词文件读取失败（HTTP '+response.status+'）');
  const text=await response.text();if(!text.trim())throw Error('提示词为空');
  try{await copyPlainText(text);notify('已复制 AI 接入提示词，直接粘贴给任意 AI 即可')}
  catch{copyAgentOnboarding.text=text;showAgentPrompt(text);notify('自动复制被浏览器拦截，已打开提示词，请手动复制',true)}
 }catch(error){notify('读取接入提示词失败：'+error.message,true)}
 finally{button.disabled=false;button.textContent=old}
}
document.querySelector('#agentSetupButton')?.addEventListener('click',copyAgentOnboarding);
function draftKey(route){return route+'|'+(localStorage.getItem('wj-account')||'')+'|'+(trade?.getTradeContext().card||'')}
function rememberDraft(){if(!current?.startsWith('trade/'))return;const key=draftKey(current),values=[...$('#content').querySelectorAll('form')].map(form=>({id:form.id,values:[...form.elements].map((e,index)=>({e,index})).filter(({e})=>e.name&&!e.disabled&&!['password','file','submit','button','hidden'].includes(e.type)).map(({e,index})=>({name:e.name,index,value:e.value,checked:e.checked,type:e.type}))}));drafts.set(key,values);detailsState.set(key,[...$('#content').querySelectorAll('details')].map(e=>({summary:e.querySelector('summary')?.textContent,open:e.open})));}
function restoreDraft(route){const key=draftKey(route),saved=drafts.get(key);if(!saved)return;for(const record of saved){let changed=false;const form=record.id?document.getElementById(record.id):null;if(!form||!$('#content').contains(form))continue;for(const value of record.values){const field=form.elements[value.index];if(!field||field.name!==value.name||field.type!==value.type)continue;if(['checkbox','radio'].includes(value.type)){if(field.checked!==value.checked){field.checked=value.checked;changed=true}}else if(field.value!==value.value){field.value=value.value;changed=true;field.dispatchEvent(new Event('input',{bubbles:true}))}}if(changed)form.dirty=true}const entries=detailsState.get(key)||[];for(const e of $('#content').querySelectorAll('details')){const saved=entries.find(x=>x.summary===e.querySelector('summary')?.textContent);if(saved)e.open=saved.open}}
function updateChrome(route){const [group,page]=route.split('/'),title=label(route);document.body.dataset.area=group;document.body.dataset.tradeView=group==='trade'?page:'';$('#tradeSurface').hidden=group!=='trade';$('#marketSurface').hidden=group!=='market';$('#viewTitle').textContent=title;$('#viewEyebrow').textContent=group==='market'?'看市场':systemPages.some(p=>p[0]===page)?'系统':'做交易';document.title=title+' · 小木市场全景';for(const a of nav.querySelectorAll('[data-route]')){const selected=a.dataset.route===route;a.classList.toggle('active',selected);selected?a.setAttribute('aria-current','page'):a.removeAttribute('aria-current')};$('#printButton').hidden=group!=='trade'}
function navigate(route,options={}){const revision=++requested;const next=navigationQueue.catch(()=>{}).then(()=>applyNavigation(route,options,revision));navigationQueue=next;return next}
async function applyNavigation(route,options={},revision){
 route=normalizeRoute(route);
 await ready;if(revision!==requested)return;
 const changed=route!==current;if(current){scrolls.set(current,scrollY);rememberDraft();if(current.startsWith('trade/'))await trade.leaveTradePage();else market?.pauseMarketSurface()}
 if(revision!==requested)return;
 try{
  const url=new URL(location.href);url.hash=route;url.searchParams.delete('view');for(const key of ['card','product','symbol','accountAction'])url.searchParams.delete(key);for(const key of ['card','product','symbol'])if(options[key])url.searchParams.set(key,options[key]);
  if(options.history==='replace')history.replaceState(null,'',url);else if(options.history!=='none'&&location.hash!=='#'+route)history.pushState(null,'',url);
  if(route.startsWith('market/')&&!market){$('#viewTitle').textContent=label(route);marketPromise??=import('./market-panorama.js');market=await marketPromise;}
  if(revision!==requested)return;
  updateChrome(route);current=route;
  if(route.startsWith('market/'))await market.openMarketPage(route.slice(7),options);else{await trade.openTradePage(route.slice(6),options);if(revision!==requested)return;restoreDraft(route)}
  if(revision!==requested)return;updateChrome(route);
  localStorage.setItem('wj-unified-page',route);lastApplied=route;requestAnimationFrame(()=>window.scrollTo({top:scrolls.get(route)||0}));
  window.dispatchEvent(new CustomEvent('xiaomu:context',{detail:window.xiaomuContext()}));
 }catch(error){if(lastApplied)updateChrome(lastApplied);message(error);throw error}
}
window.xiaomuNavigate=navigate;
window.xiaomuContext=()=>current?.startsWith('market/')?{...market?.getMarketContext(),account:localStorage.getItem('wj-account')}:trade?.getTradeContext()||{};
document.addEventListener('click',event=>{
 const target=event.target.closest('a');if(!target||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||target.target==='_blank'||target.hasAttribute('download'))return;
 const url=new URL(target.href,location.href);if(url.origin!==location.origin)return;
 if(url.pathname==='/cockpit.html'){
  event.preventDefault();event.stopImmediatePropagation();void(async()=>{if(window.xiaomuCallActive?.()&&!confirm('切换到全息版会结束当前通话，是否继续？'))return;await trade?.leaveTradePage();window.dispatchEvent(new Event('xiaomu:hangup'));location.assign(url)})().catch(message);return;
 }
 let route=target.dataset.route;
 if(!route&&['/','/index.html','/market-panorama.html'].includes(url.pathname)){const p=url.searchParams;route=p.has('view')?'trade/'+p.get('view'):url.hash?normalizeRoute(url.hash):'market/home'}
 if(!route)return;event.preventDefault();event.stopImmediatePropagation();void navigate(route,Object.fromEntries(url.searchParams)).catch(()=>{});
},true);
addEventListener('popstate',()=>void navigate(normalizeRoute(location.hash),{history:'none',...Object.fromEntries(new URLSearchParams(location.search))}).catch(()=>{}));
addEventListener('hashchange',()=>{const route=normalizeRoute(location.hash);if(route!==current)void navigate(route,{history:'none'}).catch(()=>{})});
const ready=(async()=>{trade=await import('./workbench.js');await trade.workbenchReady;})();
const initial=normalizeRoute(location.hash),initialOptions=Object.fromEntries(new URLSearchParams(location.search));
void navigate(initial,{...initialOptions,history:'replace'}).catch(message);
