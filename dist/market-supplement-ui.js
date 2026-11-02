const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=v=>typeof v==='number'&&Number.isFinite(v)?v.toLocaleString('zh-CN',{maximumFractionDigits:2}):'未取得';
function sourceLink(value){try{const u=new URL(value);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password?` · <a href="${esc(u.href)}" target="_blank" rel="noopener noreferrer">公开来源</a>`:''}catch{return ''}}
function contractEvidence(c){
 const delivery=c.lastDelivery?`最后交割日 ${esc(c.lastDelivery)}`:c.delivery?`交割日 ${esc(c.delivery)}（源DeliveryDate；最后交割日未取得）`:'最后交割日未取得';
 return `<p>上市 ${esc(c.listed||'未取得')} · 最后交易日 ${esc(c.lastTrade)} · ${delivery}</p><small>${esc(c.source)} · ${esc(c.dataDate)}（${esc(c.dateBasis||'查询批次')}） · 核验 ${esc(c.checkedAt||c.updated)}${sourceLink(c.sourceUrl)}</small>`;
}
export function warehousePanel(p){
 const completedDay=p.signals?.day?.stamp?.slice(0,10)||p.closeDate||'';
 const w=p.warrantHistory,last=w?.history?.at(-1),reason=p.exchange==='CFFEX'?'金融期货不适用实物注册仓单':p.warrantStatus?.reason||'尚未取得该品种的仓单历史';
 const currentGap=p.warrantStatus&&p.warrantStatus.status!=='ok'?`<p class="caption">本次刷新缺口：${esc(p.warrantStatus.reason)}；以下保留已取得历史。</p>`:'';
 return `<article data-evidence="warehouse"><h3>注册仓单历史</h3>${last?`${currentGap}<p><b>${num(last.receipts)}</b> · ${esc(last.date)} · 较前公布记录 ${num(last.change)}</p><small>${esc(w.source)} · ${esc(w.unit)}；${esc(w.definition)}</small><details class="evidence-history"><summary>查看 ${w.samples} 条历史 · ${esc(w.firstDate)} 至 ${esc(w.dataDate)}</summary><div class="table-wrap"><table><thead><tr><th>日期</th><th>注册仓单（源单位未标注）</th><th>较前公布记录变化</th></tr></thead><tbody>${[...w.history].reverse().map(r=>`<tr><td>${esc(r.date)}</td><td>${num(r.receipts)}</td><td>${num(r.change)}</td></tr>`).join('')}</tbody></table></div></details><small>实际资料截至 ${esc(w.dataDate)}；核验 ${esc(w.checkedAt)}${w.dataDate<completedDay?' · 仓单日期早于完成日K，按旧数据查看':''}</small>`:`<p>未取得：${esc(reason)}</p>`}</article>`;
}
export function rollPanel(p){
 const r=p.rollYield;
 return `<article data-evidence="roll"><h3>展期参考 · 年化对数价差率</h3>${r?`${p.rollStatus&&p.rollStatus.status!=='ok'?`<p class="caption">本次刷新缺口：${esc(p.rollStatus.reason)}；以下为已取得资料。</p>`:''}<p><b>${num(r.rate*100)}%</b> · ${esc(r.dataDate)} · 相隔 ${r.monthGap} 个月</p><table><thead><tr><th>合约</th><th>同日收盘价</th><th>持仓量（手）</th></tr></thead><tbody>${[['近月',r.near],['远月',r.far]].map(([label,v])=>`<tr><td>${label} ${esc(v.contract)}</td><td>${num(v.close)}</td><td>${num(v.interest)}</td></tr>`).join('')}</tbody></table><small>${esc(r.source)}。${esc(r.selection)}。${esc(r.formula)}。${esc(r.definition)}${r.coverage?'；'+esc(r.coverage):''}；核验 ${esc(r.checkedAt)}${sourceLink(r.sourceUrl)}</small>`:`<p>未取得：${esc(p.rollStatus?.reason||'该品种尚无可比的同日合约资料')}</p>`}</article>`;
}
export function contractField(info,field){return info?.[field]?`${esc(info[field])}<small>${esc(info.exchange)} · ${info.dateBasis==='接口交易日'?'交易日':'查询批次'} ${esc(info.dataDate)}</small>`:'<span class="unavailable">未取得</span>'}
export function marginField(row){
 const rate=typeof row['做多保证金率']==='number'?row['做多保证金率']*100:row['保证金-买开'];
 const money=row['做多1手保证金'];
 return `${num(rate)}${typeof rate==='number'?'%':''}<small>买开每手 ${num(money)}${typeof money==='number'?' 元':''}</small>`;
}
export function supplementPanel(p){
 const c=p.contractInfo,b=p.basis;
 return `<section class="section supplement-evidence"><header class="section-head"><div><h2>合约与产业证据</h2><small>仅作资料参考，账户交割限制和交易权限不变</small></div></header><div class="supplement-grid"><article><h3>当前具体合约 ${esc(p.contract||'待核验')}</h3>${c?contractEvidence(c):'<p>合约日期未取得；请核对交易所与券商公告。</p>'}</article><article><h3>现货与基差</h3>${b?`<p>现货 ${num(b.spot)} · 供应商期货 ${num(b.future)} · 基差（现货−期货）${num(b.basis)} ${esc(b.unit)}</p><p>对应 ${esc(b.contract)}${p.contract!==b.contract?' · 与小木当前具体合约不同，不能套用此基差':''}</p><small>${esc(b.source)} · ${esc(b.dataDate)}；源dom_basis ${num(b.sourceBasis)}（期货−现货）。${esc(b.basisDefinition)}</small>`:'<p>当日现货与基差未取得，不填估值。</p>'}</article>${warehousePanel(p)}${rollPanel(p)}</div></section>`;
}
export function supplementSources(rows=[]){return `<section class="section"><h3>合约、现货与补位来源</h3><p>交易所合约日期不改变主力认定。现货基差对应供应商指明的具体合约；注册仓单与社会库存分开。不可用接口保留缺口，不绕过验证。</p>${rows.map(r=>`<p><b>${esc(r.source)}</b> · ${r.enabled?({ok:'已取得',partial:'部分取得',stale:'旧数据',empty:'无有效记录'}[r.status]||'未取得'):(r.status==='ok'?'已取样，未启用':'未接入')} · ${esc(r.recordDay||r.targetDay||'未提供资料日期')} · ${r.rows??'未统计'} 条<small>${esc(r.reason||'')} · 核验 ${esc(r.checkedAt||r.updated||'未取得')}</small></p>`).join('')}</section>`}
