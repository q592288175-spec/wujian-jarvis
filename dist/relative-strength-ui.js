const pct=value=>Number.isFinite(value)?`${value>0?'+':''}${(value*100).toFixed(2)}%`:'数据不足';
const number=value=>Number.isFinite(Number(value))?Number(value).toLocaleString('zh-CN',{maximumFractionDigits:2}):'未知';
const corr=value=>Number.isFinite(value)?value.toFixed(2):'数据不足';
const sideName=side=>side==='long'?'多':'空';
const requests=new WeakMap();
function riskTable(data,esc){
 const label=item=>`<span class="strength-${item.side}">${sideName(item.side)} ${esc(item.name)}</span>`;
 return `<details class="strength-evidence"><summary>相关性核验 · 全部${data.relationships.length}对关系</summary><p>价格收益相关为正：同方向持仓可能重复风险，多空反向持仓可能部分抵消。相关为负时，一多一空反而可能同时亏损。缺数据不当作低相关；这里只看历史日收盘，未计算实际手数及组合风险。</p><div class="table-wrap"><table><thead><tr><th>品种关系</th><th>近20日 / 样本</th><th>近60日 / 样本</th><th>方向调整后相关</th></tr></thead><tbody>${data.relationships.map(r=>`<tr><td>${label(r.a)} / ${label(r.b)}</td><td>${corr(r.value)} / ${r.samples}</td><td>${corr(r.longWindow.value)} / ${r.longWindow.samples}</td><td>${corr(r.directionalValue)}</td></tr>`).join('')}</tbody></table></div><p>方向调整后相关 = 价格收益相关 × 两边持仓方向（多为+1，空为-1）；正值表示收益可能同向波动，不是已实现盈亏相关。</p></details>`;
}
export async function mountStrength(node,{api,esc,dialog,title,body}){
 if(!node)return;
 const request={};requests.set(node,request);
 if(!node.querySelector('.strength-pair'))node.innerHTML='<span class="strength-loading" role="status">多强空弱 · 正在计算三组</span>';
 try{
  const data=await api('/api/workbench/relative-strength');if(!node.isConnected||requests.get(node)!==request)return;
  if(!data.slots||data.selectionPolicy?.sourceMode!=='day-trend')throw Error('候选服务仍为旧版，请重新启动小木');
  const leg=(item,side)=>item?`<span class="strength-${side}">${sideName(side)} ${esc(item.name)}<small>${esc(item.riskFamily||item.sector)} · 方向内第${item.rank}</small></span>`:`<span class="strength-vacant">${sideName(side)} 暂缺合格候选</span>`;
  node.innerHTML=`<div class="strength-heading"><strong>多强空弱</strong><small>日K顺势 · ${esc(data.cutoff||'数据不足')}${data.refreshing?' · 刷新中':''}</small><small>多 ${data.pool.selectedLong}/3 · 空 ${data.pool.selectedShort}/3</small></div><div class="strength-pairs">${data.slots.map((slot,i)=>`<button type="button" class="strength-pair" data-strength-pair="${i}" title="查看持续性、相关性和候选替换原因"><small>第${i+1}组 · 观察候选</small>${leg(slot.long,'long')}${leg(slot.short,'short')}</button>`).join('')}</div>`;
  function show(index){
   title.textContent='多强空弱 · 日K龙头与风险去重';
   const itemRow=(item,group)=>item?`<tr><td>${group}</td><td class="strength-${item.side}"><b>${sideName(item.side)} ${esc(item.name)}</b><br><small>${esc(item.contract)} · ${esc(item.sector)}</small></td><td>${pct(item.return5)}</td><td>${pct(item.return20)}</td><td>${pct(item.efficiency20)}</td><td>${pct(item.adverse20)}<br><small>${item.side==='long'?'收盘回撤':'收盘反弹'}</small></td><td>${item.rank}</td><td>${esc(item.evidence)}${item.provisional?'<br>待正式复核':''}</td></tr>`:'';
   const detail=slot=>{
    const pair=data.pairs.find(p=>p.number===slot.number);
    return `<details class="strength-evidence" ${slot.number===index+1?'open':''}><summary>第${slot.number}组 · ${esc(slot.long?.name||'多头空缺')} / ${esc(slot.short?.name||'空头空缺')}</summary>${[slot.long,slot.short].filter(Boolean).map(item=>`<div><b class="strength-${item.side}">${sideName(item.side)} ${esc(item.name)} · ${esc(item.evidence)}</b><p>入池依据：${esc(item.prior)}；同向近5日与20日延续。</p><p>持续性：20个交易日中 ${item.favorableDays} 日沿本方向收盘；顺向效率 ${pct(item.efficiency20)}；最大收盘${item.side==='long'?'回撤':'反弹'} ${pct(item.adverse20)}。</p><p>近3日 ${pct(item.return3)} · 近5日 ${pct(item.return5)} · 近20日 ${pct(item.return20)}；收盘 ${number(item.close)}；来源 ${esc(item.source||'待核')}。</p><p>反证与缺口：${esc(item.counterevidence.join('；')||'尚需核对供需变化')}。</p><p>更新条件：${esc(item.reviseWhen)}。</p></div>`).join('')}${pair?`<p>近${pair.correlation.samples}个共同日收益相关：${corr(pair.correlation.value)}。${pair.correlation.value===null?'样本不足，对冲关系未知。':pair.correlation.value<=0?'价格非正相关，一多一空仍可能同时亏损，不能认定为有效对冲。':'价格曾同向波动，多空反向可能部分抵消；对冲比例尚未核验。'}</p>`:'<p>本组不完整，不视为对冲组合。</p>'}</details>`;
   };
   body.innerHTML=`<p class="hint">行情截止 ${esc(data.cutoff)} · 日K顺势多头 ${data.pool.long} / 空头 ${data.pool.short} · 持续性与去重后 ${data.pool.selectedLong}多 / ${data.pool.selectedShort}空${data.refreshing?' · 刷新中，当前为上一批结果':''}</p>
   <div class="table-wrap"><table class="strength-table"><thead><tr><th>组</th><th>方向 / 具体合约</th><th>近5日</th><th>近20日</th><th>顺向效率</th><th>最大逆向</th><th>排名</th><th>证据状态</th></tr></thead><tbody>${data.slots.map(p=>itemRow(p.long,p.number)+itemRow(p.short,p.number)).join('')}</tbody></table></div>
   ${data.missing.long||data.missing.short?`<p class="hint warning">多头缺 ${data.missing.long} 个，空头缺 ${data.missing.short} 个；不重复风险、不降低条件凑数。</p>`:''}
   ${data.slots.map(detail).join('')}${riskTable(data,esc)}
   <details class="strength-evidence"><summary>为什么没选其他品种（${data.selectionSkipped.length}）</summary>${data.selectionSkipped.map(item=>`<p><span class="strength-${item.side}">${sideName(item.side)} ${esc(item.name)}</span> · 方向内第${item.rank}：${esc(item.reason)}${item.correlations?`；20日相关 ${corr(item.correlations.short.value)}（${item.correlations.short.samples}样本），60日相关 ${corr(item.correlations.long.value)}（${item.correlations.long.samples}样本）`:''}。</p>`).join('')||'<p>无其他可比较候选。</p>'}</details>
   <details class="strength-evidence"><summary>比较口径与行情缺口（${data.excluded.length}）</summary><p>${esc(data.method)}</p><p>顺向效率 = 沿观察方向的累计对数收益 / 每日对数收益绝对值之和；越高越少来回反复。最大逆向只统计收盘路径，非盘中最大风险。</p><p>共同交易日：${data.windowDates.map(esc).join('、')}。5日/20日以倒数第6/21根收盘为基准；收益先按20日波动缩放，避免直接把国债和商品的涨幅相比。</p>${data.excluded.map(r=>`<p>${esc(r.name)} ${esc(r.contract||'')}：${esc(r.reason)}</p>`).join('')}<small>版本 ${esc(data.version)} · 快照 ${esc(data.inputHash.slice(0,12))}</small></details><p class="hint warning">${esc(data.boundary)}</p>`;
   if(!dialog.open)dialog.showModal();
  }
  node.querySelectorAll('[data-strength-pair]').forEach(button=>button.onclick=()=>show(Number(button.dataset.strengthPair)));
 }catch(error){if(node.isConnected&&requests.get(node)===request)node.innerHTML=`<span class="strength-loading warning" role="alert">多强空弱暂不可用：${esc(error.message)}</span>`}
}
