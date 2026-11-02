import {accountSummary} from './account-ui.js';
const market=[['home','市场总览'],['overview','周期强弱'],['strength','品种强弱'],['monitor','全品种监控'],['rankings','资金排行'],['funds','资金动向'],['positions','持仓动向'],['fees','期货手续费'],['variety','品种跟踪'],['seat-flow','席位动向']];
const trade=[['home','今日总览'],['fire','火 · 识别机会'],['water','水 · 分析机会'],['metal','金 · 冻结计划'],['earth','土 · 执行管理'],['wood','木 · 检查迭代']];
const questions={home:['市场','今天国内期货整体涨跌与关注点在哪？'],overview:['板块','月、周、日、1小时、30分钟各周期，多空谁占优？'],strength:['品种','哪些品种月周日同向走强或走弱？'],monitor:['提醒','大周期MA10同向后，哪些小周期拐头与穿越已经发生？'],rankings:['资金','哪些品种的公开席位持仓规模变化较大？'],funds:['资金','同一品种的席位持仓名义规模近几个交易日怎样变化？'],positions:['资金','持仓增减与价格怎样配合？'],fees:['合约','选定品种后，各合约的交易成本与每跳盈亏怎样？'],variety:['品种','把一个品种的趋势、席位和火资格放在一页核对。'],'seat-flow':['资金','哪些观察组在增仓减仓，方向是否一致？']};
const stableQuestions={home:'账户、候选与五行流程，目前有哪些待我处理的事项？',monitor:'哪些已登记条件触发或失效，需要及时查看？',fire:'哪些品种符合既定周期规则，结构有哪些优势与瑕疵？',water:'最新供需、消息和证据发生了什么变化？',metal:'采用哪种入场手法，如何防守，各账户承担多少风险？',earth:'团队按已审定版本执行了什么，保护是否到位？',wood:'执行与判断哪里有效，哪里需要改进？',rules:'当前账户资料、完整资金记录与生效规则是什么？'};
const group=text=>Object.assign(document.createElement('h2'),{className:'nav-group-title',textContent:text});
const link=(href,label)=>{const a=document.createElement('a');a.href=href;a.className='shell-nav-link';a.textContent=label;return a};
export function mountShell(){
 if(document.body.dataset.unified)return;
 const kind=location.pathname.endsWith('cockpit.html')?'holo':location.pathname.endsWith('market-panorama.html')?'panorama':'stable';
 document.documentElement.dataset.theme=kind==='holo'?'holo':'light';document.body.dataset.shell=kind;
 const host=document.querySelector(kind==='holo'?'.cockpit-header':kind==='panorama'?'.toolbar':'.top-meta');
 if(host&&!document.querySelector('.shell-version-switch')){
  host.querySelectorAll('a[href="/cockpit.html"],a[href="/market-panorama.html?from=cockpit"],nav.version-switch').forEach(n=>n.remove());
  const nav=document.createElement('nav');nav.className='shell-version-switch';nav.ariaLabel='界面版本';
  for(const [id,href,label] of [['panorama','/market-panorama.html','市场全景'],['holo','/cockpit.html','全息版']]){const a=link(href,label);if(id===kind){a.classList.add('active');a.setAttribute('aria-current','page')}nav.append(a)}host.append(nav);
 }
 if(kind==='stable'){
  const nav=document.querySelector('#mainNav');if(nav&&!nav.dataset.grouped){
   const buttons=new Map([...nav.querySelectorAll('button[data-view]')].map(b=>[b.dataset.view,b]));nav.replaceChildren(group('看市场'),...market.map(([id,label])=>link('/market-panorama.html#'+id,label)),group('做交易'),...trade.map(([id])=>buttons.get(id)).filter(Boolean),group('系统'),...['monitor','rules'].map(id=>buttons.get(id)).filter(Boolean));nav.dataset.grouped='true';
  }
 }
 if(kind==='panorama'){
  const nav=document.querySelector('#navigation');const build=()=>{if(!nav.querySelector('[data-nav]')||nav.dataset.grouped)return;nav.prepend(group('看市场'));nav.append(group('做交易'),...trade.map(([id,label])=>link('/?view='+id,label)),group('系统'),link('/?view=monitor','盯盘提醒'),link('/?view=rules','账户与规则'));nav.dataset.grouped='true'};build();if(!nav.dataset.grouped){const o=new MutationObserver(()=>{build();if(nav.dataset.grouped)o.disconnect()});o.observe(nav,{childList:true})}
  const top=document.querySelector('.topbar'),bar=document.createElement('div');bar.className='shell-account-bar';bar.setAttribute('aria-label','当前账户只读摘要');top.after(bar);
  const refresh=async()=>{try{const id=localStorage.getItem('wj-account')||'';const r=await fetch('/api/workbench/summary'+(id?'?accountId='+encodeURIComponent(id):''));if(!r.ok)throw Error();const s=await r.json();bar.innerHTML=accountSummary(s.account)}catch{bar.textContent='账户摘要暂未取得 · 请在稳定版核对'}};void refresh();addEventListener('storage',e=>{if(['wj-account','wj-balance-revision'].includes(e.key))void refresh()});
 }
 const heading=document.querySelector(kind==='panorama'?'#heading':kind==='stable'?'#viewTitle':'#opportunityTitle');
 const update=()=>{
  document.title=(kind==='holo'?'全息版':heading?.textContent||'工作台')+' · 小木';if(kind==='holo')return;
  let context=document.querySelector('#pageContext');if(!context){context=document.createElement('p');context.id='pageContext';context.className='page-context';document.querySelector('#content').before(context)}
  const current=kind==='panorama'?document.body.dataset.page:document.querySelector('#mainNav button.active')?.dataset.view;
  const [step,question]=kind==='panorama'?(questions[current]||questions.home):['做交易',stableQuestions[current]||stableQuestions.home];
  context.replaceChildren(Object.assign(document.createElement('span'),{className:'page-step',textContent:step}),document.createTextNode(question));
 };
 update();if(heading)new MutationObserver(update).observe(heading,{subtree:true,characterData:true,childList:true});
}
