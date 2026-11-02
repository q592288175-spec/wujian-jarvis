export const exchangeNames={SHFE:'上期所',INE:'能源中心',DCE:'大商所',CZCE:'郑商所',GFEX:'广期所',CFFEX:'中金所'};
export function marketCoverage(scan={}){
 const cutoff=scan.target_date||scan.data_date;
 const rows=(scan.rows||[]).map(r=>{
  const current=!!r.main_contract&&r.data_date===cutoff&&r.market_current!==false;
  const state=!r.main_contract?'缺映射':r.no_trade&&current?'当日无成交':!current?'缺失或陈旧':!r.ok?'技术样本不足':r.provisional?'临时盘后快照':'已取得完成日线';
  return{code:r.code,name:r.name,exchange:r.exchange,contract:r.main_contract,date:r.data_date,source:r.data_source||'未取得',state,current,provisional:!!r.provisional,technical:current&&r.ok===true,reason:r.error||(!current?'未取得同一截止日的有效行情':'')};
 });
 const exchanges=Object.entries(exchangeNames).map(([id,name])=>{const members=rows.filter(r=>r.exchange===id);return{id,name,total:members.length,current:members.filter(r=>r.current&&r.state!=='当日无成交').length,technical:members.filter(r=>r.technical).length,provisional:members.filter(r=>r.provisional&&r.current).length,noTrade:members.filter(r=>r.state==='当日无成交').length,gaps:members.filter(r=>['缺映射','缺失或陈旧','技术样本不足'].includes(r.state)).length,sources:[...new Set(members.map(r=>r.source))]}});
 return{cutoff,rows,exchanges,total:rows.length,scope:'当前配置品种池；来源可含备用数据，非交易所全目录覆盖'};
}
export function coverageHtml(scan,esc){const c=marketCoverage(scan);return`<details class="data-coverage"><summary>六所数据覆盖 · ${esc(c.cutoff||'未知')} · ${c.total} 品种</summary><p class="muted">${esc(c.scope)}</p><div class="table-wrap"><table><thead><tr><th>交易所</th><th>配置</th><th>同日行情</th><th>技术可算</th><th>无成交</th><th>待正式复核</th><th>缺口</th></tr></thead><tbody>${c.exchanges.map(e=>`<tr><th>${e.name}</th><td>${e.total}</td><td>${e.current}</td><td>${e.technical}</td><td>${e.noTrade}</td><td>${e.provisional}</td><td>${e.gaps}</td></tr>`).join('')}</tbody></table></div><details><summary>逐品种日期与来源</summary><div class="table-wrap"><table><thead><tr><th>品种</th><th>具体合约</th><th>交易日</th><th>来源</th><th>状态 / 缺口</th></tr></thead><tbody>${c.rows.map(r=>`<tr><td>${esc(r.name)}</td><td>${esc(r.contract||'待核')}</td><td>${esc(r.date||'未知')}</td><td>${esc(r.source)}</td><td>${esc(r.state)}${r.reason?'<br><small>'+esc(r.reason)+'</small>':''}</td></tr>`).join('')}</tbody></table></div></details></details>`;}
