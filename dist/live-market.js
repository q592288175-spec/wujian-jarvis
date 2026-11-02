import {sectorFor,groupedQuotes} from './sectors.js';
import {contractName} from './contract-name.js';
const esc=s=>String(s??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={unavailable:'尚未取得',connecting:'刷新中',waiting:'等待数据',observing:'兼容行情','eod-ready':'盘后完成K线已就绪',stale:'显示最近缓存',disconnected:'刷新失败',stopped:'已停止'};
let selected='';
export async function mountLiveMarket(){
 const host=document.createElement('section');host.className='data-hub';host.innerHTML='<h3>国内期货 · 免费盘后行情</h3><p>正在读取本地盘后缓存…</p>';
 document.querySelector('#workspaceBody').prepend(host);
 async function refresh(){try{const r=await fetch('/api/live-market');if(!r.ok)throw Error();const s=await r.json();if(!host.isConnected)return;
 host.innerHTML=`<h3>国内期货 · 免费盘后行情</h3><p>${esc(labels[s.status]||s.status)} · ${esc(s.source)} · 本机更新 ${esc(s.receivedAt)} </p><p>${esc(s.error||'涨跌幅按相邻完成日K收盘计算；长期结构使用主力连续，当前具体主力单独核验。')}</p><button class="quiet" data-refresh>从公开源刷新</button><div style="overflow:auto"><table class="work-table"><thead><tr><th>板块</th><th>品种序列</th><th>完成收盘</th><th>收盘涨跌</th><th>成交 / 持仓</th><th>数据日期 / 具体主力</th></tr></thead><tbody>${groupedQuotes(s.quotes).flatMap(g=>g.quotes).map(q=>`<tr class="${q.changePct>0?'quote-up':q.changePct<0?'quote-down':'quote-flat'}"><td>${esc(sectorFor(q))}</td><td><button data-symbol="${esc(q.symbol)}">${esc(contractName(q))}</button></td><td>${esc(q.close)}</td><td>${q.changePct==null?'未知':esc(q.changePct.toFixed(2))+'%'}</td><td>${esc(q.volume)} / ${esc(q.openInterest)}</td><td>${esc(q.tradingDay||'未知')}<br>具体主力：${esc(q.actualContract||'待核验')}</td></tr>`).join('')}</tbody></table></div><div data-bars></div>`;
 host.querySelector('[data-refresh]').onclick=async e=>{e.currentTarget.disabled=true;e.currentTarget.textContent='后台刷新中';try{await fetch('/api/eod-market/refresh',{method:'POST'})}finally{setTimeout(refresh,3000)}};
 function draw(symbol){selected=symbol;const q=s.quotes.find(q=>q.symbol===symbol);if(!q)return;const bars=q.bars.filter(b=>[b.open,b.high,b.low,b.close].every(Number.isFinite)).slice(-120);const area=host.querySelector('[data-bars]');if(!bars.length){area.textContent='日K尚未取得';return}const min=Math.min(...bars.map(b=>b.low)),max=Math.max(...bars.map(b=>b.high)),y=v=>150-(v-min)/(max-min||1)*140;area.innerHTML=`<h4>${esc(contractName(q))} · 完成日K</h4><svg viewBox="0 0 720 165" role="img" aria-label="免费主力连续完成日K">${bars.map((b,i)=>{const x=5+i*710/bars.length,c=b.close>=b.open?'#fa737d':'#55dfd1';return `<path stroke="${c}" d="M${x},${y(b.low)} V${y(b.high)}"/><path stroke="${c}" stroke-width="3" d="M${x},${y(b.open)} V${y(b.close)+.1}"/>`}).join('')}</svg>`}
 host.querySelectorAll('[data-symbol]').forEach(b=>b.onclick=()=>draw(b.dataset.symbol));draw(selected||s.quotes[0]?.symbol);
 }catch{if(host.isConnected)host.innerHTML='<h3>国内期货行情不可用</h3><p>本地接口读取失败，没有使用模拟数据替代。重新进入数据来源页可重试。</p>'}}
 await refresh();
 const timer=setInterval(()=>{if(!host.isConnected){clearInterval(timer);return}if(!document.hidden)refresh()},30000);
}
