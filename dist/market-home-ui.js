import {closeRows,usableClose,sectorHeat,hotProducts,homeExchanges,heatColor,heatInk} from './market-home.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=(v,d=0)=>Number.isFinite(v)?v.toLocaleString('zh-CN',{maximumFractionDigits:d}):'—';
const pct=v=>Number.isFinite(v)?`${v>0?'+':''}${v.toFixed(2)}%`:'待核验';
const sign=v=>v>0?'up':v<0?'down':'flat';
const lots=v=>!Number.isFinite(v)?'—':Math.abs(v)>=10000?`${(v/10000).toFixed(2)}万`:num(v);
const names=new Map(homeExchanges);
export function renderCloseHome({products,overview,sector='all',exchange='all',order='volume',busy=false}){
 const rows=closeRows(products,overview),valid=rows.filter(usableClose),up=valid.filter(p=>p.eod.changePct>0).length,down=valid.filter(p=>p.eod.changePct<0).length,
  groups=sectorHeat(rows),hot=hotProducts(rows,{sector,exchange,order}),missing=rows.filter(p=>!usableClose(p));
 const choices=[['volume','热门成交'],['gainers','涨幅排行'],['losers','跌幅排行']];
 return `<section class="home-close-summary" aria-label="收盘统计"><div><small>完成收盘</small><b>${esc(overview?.day||'待同步')}</b><span>对比 ${esc(overview?.previousDay||'待同步')} 昨收</span></div><div><small>有效样本</small><b>${valid.length}<em> / ${rows.length}</em></b><span>同合约 · 同来源</span></div><div><small>上涨 / 下跌 / 持平</small><b><i class="up">${up}</i><em> / </em><i class="down">${down}</i><em> / ${valid.length-up-down}</em></b><span>收盘涨跌，与实时涨跌分开</span></div><div><small>最近核验</small><b class="home-checked">${overview?.updatedAt?esc(overview.updatedAt.slice(5,19).replace('T',' ')):'尚未同步'}</b><button data-home-refresh ${busy?'disabled':''}>${busy?'正在同步…':'同步收盘数据'}</button></div></section>
 <section class="home-overview" aria-label="板块热力图与国内热门品种">
 <div class="home-heat-panel"><header><div><small>收盘看全局</small><h2>板块涨跌热力图</h2></div><button data-home-sector="all" class="home-clear" ${sector==='all'?'disabled':''}>${sector==='all'?'全部板块':'返回全部板块'}</button></header>
 <div class="home-heat-legend" aria-label="绿色下跌，红色上涨，颜色越深幅度越大">${[-3,-2,-1,-.25,0,.25,1,2,3].map(v=>`<span style="background:${heatColor(v)};color:${heatInk(v)}">${v===0?'持平':v>0?'+'+v+'%':v+'%'}</span>`).join('')}</div>
 <div id="homeHeatmap" class="home-heatmap" data-chart role="img" aria-label="11板块收盘涨跌热力图，点击色块查看品种"></div>
 <div class="home-sector-shortcuts" aria-label="板块筛选">${groups.map(g=>`<button data-home-sector="${esc(g.name)}" aria-pressed="${sector===g.name}" title="有效${g.count}/${g.total}，涨${g.up}跌${g.down}平${g.flat}"><span>${esc(g.name)}</span><b class="${sign(g.mean)}">${pct(g.mean)}</b></button>`).join('')}</div>
 <p class="home-method">颜色＝有效品种等权收盘涨跌，非官方板块指数；面积按品种数，小板块保留可读面积。灰色表示持平或数据待核验。</p></div>
 <div class="home-hot-panel"><header><div><small>六大交易所 · 一品种一合约</small><h2>${sector==='all'?'国内热门品种':esc(sector)+' · 热门品种'}</h2></div><span class="home-result-count">${hot.length} 个</span></header>
 <div class="home-exchanges" aria-label="交易所筛选"><button data-home-exchange="all" aria-pressed="${exchange==='all'}">全部六所</button>${homeExchanges.map(([key,label])=>`<button data-home-exchange="${key}" aria-pressed="${exchange===key}" title="有效 ${valid.filter(p=>p.exchange===key).length} / ${rows.filter(p=>p.exchange===key).length} 品种">${label}<small>${valid.filter(p=>p.exchange===key).length}</small></button>`).join('')}</div>
 <div class="home-hot-order" aria-label="热门排序">${choices.map(([key,label])=>`<button data-home-order="${key}" aria-pressed="${order===key}">${label}</button>`).join('')}<span>收盘对昨收</span></div>
 <div class="home-hot-scroll"><table id="homeHotTable"><thead><tr><th>品种 / 合约</th><th>收盘价</th><th>涨跌幅</th><th>成交量<span>（手）</span></th><th>日增仓<span>（手）</span></th></tr></thead><tbody>${hot.map((p,i)=>`<tr data-product-code="${esc(p.code)}"><td><button data-home-evidence="${esc(p.code)}" title="${esc(p.name)} · 查看收盘依据"><span class="home-rank">${i+1}</span><span><b>${esc(p.code)} ${esc(p.name)}</b><small>${esc(p.eod.contract)} · ${esc(names.get(p.exchange)||p.exchange)}</small></span></button></td><td class="${sign(p.eod.changePct)}">${num(p.eod.close,3)}</td><td class="${sign(p.eod.changePct)}">${pct(p.eod.changePct)}</td><td class="home-volume">${lots(p.eod.volume)}</td><td class="${sign(p.eod.interestChange)}">${p.eod.interestChange>0?'+':''}${lots(p.eod.interestChange)}</td></tr>`).join('')||'<tr><td colspan="5"><div class="home-empty">当前范围没有可比收盘数据<br>可切换筛选或同步收盘数据</div></td></tr>'}</tbody></table></div>
 <p class="home-method">${order==='volume'?'按当日成交量选取；全六所时各所优先保留2个，再补足18个。':'按当前范围收盘涨跌幅排序，最多18个。'}热度不等于资金流入或入场信号。</p></div></section>
 <details class="home-data-gaps"><summary>收盘依据与数据缺口 · ${missing.length} 个未纳入</summary><p>涨跌幅＝（同一合约收盘价 ÷ 该合约上一交易日收盘价 − 1）×100%。仅使用完成日K，不混入最新价、结算价或跨合约主连。来源：新浪财经具体合约日K / AKShare。</p>${missing.length?missing.map(p=>`<p><b>${esc(p.code)} ${esc(p.name)}</b> · ${esc(p.eod.reason||'待核验')}</p>`).join(''):'<p>当前范围的收盘样本均已对齐。</p>'}</details>`;
}
export function closeDetail(p){
 const e=p.eod;
 return `<div class="home-evidence"><p><b>${esc(e.contract||'合约待核验')}</b> · ${esc(p.displaySector)} · ${esc(names.get(p.exchange)||p.exchange)}</p><table><tbody><tr><th>${esc(e.day)} 收盘</th><td>${num(e.close,3)}</td></tr><tr><th>${esc(e.previousDay)} 昨收</th><td>${num(e.previousClose,3)}</td></tr><tr><th>收盘涨跌幅</th><td>${pct(e.changePct)}</td></tr><tr><th>当日成交量</th><td>${num(e.volume)} 手</td></tr><tr><th>持仓增减</th><td>${e.interestChange>0?'+':''}${num(e.interestChange)} 手</td></tr><tr><th>来源</th><td>${esc(e.source||'未取得')}</td></tr></tbody></table><p>${esc(e.basis||'同合约收盘对昨收')}</p><p>核验时间：${esc(e.checkedAt||'未取得')}</p><button data-product="${esc(p.code)}" data-signal-detail>查看品种跟踪</button></div>`;
}
