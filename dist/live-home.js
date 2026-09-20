import {intradayChart} from './opportunity.js';
import {closingQuote,completedSeries} from './structure.js';
import {sectors,sectorFor,groupedQuotes} from './sectors.js';
import {contractName} from './contract-name.js';
// One authoritative real quote selection shared by every panel.
const $=s=>document.querySelector(s);
const displayName=contractName;
const number=v=>Number.isFinite(v)?v.toLocaleString('zh-CN',{maximumFractionDigits:3}):'未知';
let active=true,symbol='',snapshot=null,search='',sector='',period='D';
export function installLiveHome(){
 const control=document.createElement('span');control.className='tag';control.textContent='真实行情';$('.markets .panel-head')?.append(control);
 sessionStorage.removeItem('jarvis-demo');
 const update=async()=>{if(document.hidden&&snapshot)return;try{const r=await fetch('/api/live-market',{signal:AbortSignal.timeout(8000)});if(!r.ok)throw Error();snapshot=await r.json();render()}catch{snapshot={status:'unavailable',quotes:[]};render()}};
 document.addEventListener('jarvis:select',e=>{symbol=e.detail;render()});
 const input=document.createElement('input');input.className='market-search';input.placeholder='搜索品种或合约';input.setAttribute('aria-label','搜索真实行情');input.oninput=()=>{search=input.value.trim().toLowerCase();render()};const filters=document.createElement('div');filters.className='market-filters';const select=document.createElement('select');select.setAttribute('aria-label','按板块筛选');select.innerHTML='<option value="">全部板块</option>'+sectors.map(s=>`<option>${s}</option>`).join('');select.onchange=()=>{sector=select.value;render()};filters.append(select,input);$('.markets .table-head').before(filters);
 const intradayButton=document.createElement('button');intradayButton.dataset.period='I';intradayButton.textContent='分时';$('#periodTabs').append(intradayButton);$('#marketTabs').hidden=true;$('#periodTabs').hidden=false;$('#periodTabs').addEventListener('click',e=>{const b=e.target.closest('[data-period]');if(!b)return;period=b.dataset.period;for(const el of $('#periodTabs').querySelectorAll('button'))el.classList.toggle('active',el===b);render()});
 $('.markets .panel-foot').textContent='TqSdk · 只读快照';
 $('.chart-bottom > span').textContent='实际合约日K · 末根未完成';
 $('#candleChart').setAttribute('aria-label','真实行情日K，未连接时保持空白');
 $('.markets .table-head').innerHTML='<span>品种 / 合约</span><span>收盘价</span><span>涨跌幅</span>';
 $('.chart-panel .panel-head > span')?.replaceChildren(document.createTextNode('TqSdk 日K'));
 $('#marketRows').addEventListener('click',e=>{const b=e.target.closest('[data-live-symbol]');if(b){symbol=b.dataset.liveSymbol;render()}});
 update();setInterval(update,2000);
}
function render(){
 if(!active||!snapshot)return;const rows=$('#marketRows');const scroll=rows.scrollTop;rows.replaceChildren();
 const label={unconfigured:'天勤账号未配置',unavailable:'行情进程未启动',stale:'行情进程已失联，显示旧快照',connecting:'天勤连接中',disconnected:'天勤连接失败',waiting:'等待行情',observing:'TqSdk快照 · 请核对行情时间',stopped:'行情进程已停止'}[snapshot.status]||snapshot.status;
 const banner=$('.mode-strip .amber');if(banner)banner.textContent=label;
 const filtered=snapshot.quotes.filter(q=>(!sector||sectorFor(q)===sector)&&[displayName(q),q.symbol].join(' ').toLowerCase().includes(search));
 $('.markets .panel-foot').textContent=`保留 ${snapshot.quotes.length} 个 · 已过滤 ${snapshot.liquidity?.excluded??0} 个 · 量仓均＞1万手`;
 for(const group of groupedQuotes(filtered)){if(!group.quotes.length)continue;const heading=document.createElement('div');heading.className='market-sector-heading';heading.textContent=group.name+' · '+group.quotes.length;rows.append(heading);for(const q of group.quotes){const close=closingQuote(q);const b=document.createElement('button');b.className='market-row'+(q.symbol===symbol?' is-selected':'');b.dataset.liveSymbol=q.symbol;b.classList.add(close.changePct>0?'quote-up':close.changePct<0?'quote-down':'quote-flat');const label=document.createElement('span');label.className='contract-name';const name=document.createElement('b');name.textContent=displayName(q);label.append(name);b.title='合约月份 '+(displayName(q).match(/\d{4}$/)?.[0]||'')+' · '+close.basis+' '+close.asOf;b.append(label);for(const text of [number(close.value),close.changePct==null?'未知':close.changePct.toFixed(2)+'%']){const span=document.createElement('span');span.textContent=text;b.append(span)}rows.append(b)}}rows.scrollTop=scroll;
 if(!filtered.length&&snapshot.quotes.length)rows.textContent='没有匹配的品种';
 if(!snapshot.quotes.length){document.dispatchEvent(new CustomEvent('jarvis:quote',{detail:{quote:null,snapshot}}));rows.textContent=snapshot.liquidity?.total?'当前没有成交量和持仓量均超过1万手的品种。':label+'。请先配置并启动真实行情。';$('#chartName').textContent='真实行情待连接';$('#chartPrice').textContent='—';$('#chartChange').textContent='—';$('#candleChart').replaceChildren();return}
 const q=snapshot.quotes.find(q=>q.symbol===symbol)||snapshot.quotes[0];symbol=q.symbol;document.dispatchEvent(new CustomEvent('jarvis:quote',{detail:{quote:q,snapshot}}));
 const close=closingQuote(q);$('#chartName').textContent=displayName(q)+' · '+close.basis+' '+(close.asOf||'未知');$('#chartPrice').textContent=number(close.value);for(const n of [$('#chartPrice'),$('#chartChange')]){n.classList.remove('quote-up','quote-down','quote-flat');n.classList.add(close.changePct>0?'quote-up':close.changePct<0?'quote-down':'quote-flat');}$('#chartChange').textContent=close.changePct==null?'未知':close.changePct.toFixed(2)+'%';
 $('.chart-panel .panel-head > span')?.replaceChildren(document.createTextNode(period==='I'?'TqSdk 分时':'TqSdk K线'));
 if(period==='I'){$('#candleChart').innerHTML=intradayChart(q.intraday?.points);$('#candleChart').setAttribute('aria-label','已采集分时价格和当日均价');$('.chart-bottom > span').textContent='蓝：价格 · 金：当日均价 · 仅已采集时段';return;}
 const bars=(period==='D'?q.bars.filter(b=>[b.open,b.high,b.low,b.close].every(Number.isFinite)):completedSeries(q,period)).slice(-60);$('.chart-bottom > span').textContent=period==='D'?'实际合约日K · 末根未完成':'完成'+(period==='W'?'周':'月')+'K · 日K聚合';if(!bars.length){$('#candleChart').textContent='该周期历史不足';return}
 const low=Math.min(...bars.map(b=>b.low)),high=Math.max(...bars.map(b=>b.high)),y=v=>185-(v-low)/(high-low||1)*175;
 $('#candleChart').innerHTML='<svg viewBox="0 0 360 220" aria-label="真实合约日K，末根未完成">'+bars.map((b,i)=>{const x=8+i*344/bars.length,c=b.close>=b.open?'#fa737d':'#55dfd1';return `<path stroke="${c}" d="M${x} ${y(b.low)} V${y(b.high)}"/><path stroke="${c}" stroke-width="3" d="M${x} ${y(b.open)} V${y(b.close)+.1}"/>`}).join('')+`<polyline fill="none" stroke="#dcbd75" stroke-width="1" points="${bars.slice(9).map((_,i)=>`${8+(i+9)*344/bars.length},${y(bars.slice(i,i+10).reduce((sum,b)=>sum+b.close,0)/10)}`).join(' ')}"/>`+`<text x="8" y="212" fill="#8eb8d2" font-size="10">${period==='D'?'实际合约日K · 末根未完成':'完成'+(period==='W'?'周':'月')+'K · 日K聚合'}</text></svg>`;
}
