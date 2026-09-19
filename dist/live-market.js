import {sectorFor,groupedQuotes} from './sectors.js';
import {contractName} from './contract-name.js';
const esc=s=>String(s??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={unavailable:'未启动',unconfigured:'未配置',connecting:'连接中',waiting:'等待数据',observing:'已收到行情 · 时效请核对',stale:'进程心跳过期',disconnected:'连接失败',stopped:'已停止'};
let selected='';
export async function mountLiveMarket(){
 const host=document.createElement('section');host.className='data-hub';host.innerHTML='<h3>国内期货 · TqSdk 只读行情</h3><p>正在读取独立行情进程…</p>';
 document.querySelector('#workspaceBody').prepend(host);
 async function refresh(){try{const r=await fetch('/api/live-market');if(!r.ok)throw Error();const s=await r.json();if(!host.isConnected)return;
 host.innerHTML=`<h3>国内期货 · TqSdk 只读行情</h3><p>${esc(labels[s.status]||s.status)} · ${esc(s.source)} · 接收 ${esc(s.receivedAt)} </p><p>${esc(s.error||'涨跌幅口径：较昨收盘。行情时间为交易所当地时间；报价年龄不代表断线；最新成交价不等于正式收盘价。')}</p><button class="quiet" data-refresh>刷新快照</button><div style="overflow:auto"><table class="work-table"><thead><tr><th>板块</th><th>品种合约</th><th>收盘价 / 最新成交</th><th>收盘涨跌 / 最新涨跌</th><th>成交 / 持仓</th><th>行情时间 / 交易日</th></tr></thead><tbody>${groupedQuotes(s.quotes).flatMap(g=>g.quotes).map(q=>`<tr class="${q.changePct>0?'quote-up':q.changePct<0?'quote-down':'quote-flat'}"><td>${esc(sectorFor(q))}</td><td><button data-symbol="${esc(q.symbol)}">${esc(contractName(q))}</button></td><td>${esc(q.close)} / ${esc(q.last)}</td><td>${Number.isFinite(q.close)&&q.close>0&&Number.isFinite(q.preClose)&&q.preClose>0?esc(((q.close/q.preClose-1)*100).toFixed(2))+'%':'未知'} / ${q.changePct==null?'未知':esc(q.changePct.toFixed(2))+'%'}</td><td>${esc(q.volume)} / ${esc(q.openInterest)}</td><td>${esc(q.quoteTime)}<br>${esc(q.quality?.timeStatus==='historical'?'历史报价':q.quality?.timeStatus==='recent'?'近期报价':'时间待核验')} · 交易日：${esc(q.tradingDay||'未知')}</td></tr>`).join('')}</tbody></table></div><div data-bars></div>`;
 host.querySelector('[data-refresh]').onclick=refresh;
 function draw(symbol){selected=symbol;const q=s.quotes.find(q=>q.symbol===symbol);if(!q)return;const bars=q.bars.filter(b=>[b.open,b.high,b.low,b.close].every(Number.isFinite));const area=host.querySelector('[data-bars]');if(!bars.length){area.textContent='日K尚未取得';return}const min=Math.min(...bars.map(b=>b.low)),max=Math.max(...bars.map(b=>b.high)),y=v=>150-(v-min)/(max-min||1)*140;area.innerHTML=`<h4>${esc(contractName(q))} · 日K（末根未完成，不用于完成K线触发）</h4><svg viewBox="0 0 720 165" role="img" aria-label="天勤实际合约日K">${bars.map((b,i)=>{const x=5+i*710/bars.length,c=b.close>=b.open?'#fa737d':'#55dfd1';return `<path stroke="${c}" d="M${x},${y(b.low)} V${y(b.high)}"/><path stroke="${c}" stroke-width="3" d="M${x},${y(b.open)} V${y(b.close)+.1}"/>`}).join('')}</svg>`}
 host.querySelectorAll('[data-symbol]').forEach(b=>b.onclick=()=>draw(b.dataset.symbol));draw(selected||s.quotes[0]?.symbol);
 }catch{if(host.isConnected)host.innerHTML='<h3>国内期货行情不可用</h3><p>本地接口读取失败，没有使用模拟数据替代。重新进入数据来源页可重试。</p>'}}
 await refresh();
 const timer=setInterval(()=>{if(!host.isConnected){clearInterval(timer);return}if(!document.hidden)refresh()},3000);
}
