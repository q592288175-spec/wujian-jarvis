const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pct=v=>typeof v==='number'&&Number.isFinite(v)?`${v>0?'+':''}${(v*100).toFixed(2)}%`:'数据不足';
const relative=v=>typeof v==='number'&&Number.isFinite(v)?`${v>0?'+':''}${(v*100).toFixed(2)}个百分点`:'样本不足';
const directions={long:'多头',short:'空头'};
const time=value=>value&&Number.isFinite(Date.parse(value))?new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(value)):'未知';
function legacyReportHtml(report){
 const rows=report.rows||[],changes=report.changes||{},name=code=>rows.find(r=>r.code===code)?.name||code;
 const history=changes.available?`上一交易日 ${esc(changes.previousDate)}：新增 ${changes.new.map(name).map(esc).join('、')||'无'}；退出 ${changes.exit.map(esc).join('、')||'无'}；改善 ${changes.improved.map(name).map(esc).join('、')||'无'}；转弱 ${changes.weakened.map(name).map(esc).join('、')||'无'}`:changes.reason;
 const table=side=>{const items=rows.filter(r=>r.direction===side);return `<h3 class="review-side ${side}">${directions[side]}观察 <small>${items.length}个</small></h3>${items.length?`<div class="table-wrap postmarket-table"><table><thead><tr><th>品种 / 合约</th><th>趋势方向</th><th>当日 / 近5日</th><th>板块相对强弱</th><th>量价仓表现</th><th>复盘判断</th><th>下一日验证条件 / 依据</th></tr></thead><tbody>${items.map(r=>`<tr><td><b>${esc(r.name)}</b><br><small class="mono">${esc(r.contract)}</small></td><td>${directions[r.direction]}<br><small>月${esc(r.trend.month||'未知')} / 周${esc(r.trend.week||'未知')} / 日${esc(r.trend.day||'未知')}</small></td><td>${pct(r.dayReturn)}<br><small>5日 ${pct(r.fiveReturn)}</small></td><td>${relative(r.relativeReturn)}<br><small>${esc(r.sector)} ${r.sectorSample}/${r.sectorTotal}样本</small></td><td>${esc(r.quantity)}</td><td><span class="badge ${r.judgment==='出现转弱迹象'?'warn':''}">${esc(r.judgment)}</span>${r.gaps.length?'<br><small class="review-gap">有缺口</small>':''}</td><td>${esc(r.next)}<details data-review-evidence="${esc(r.code)}"><summary>依据与反证</summary><p>${esc(r.source)} / ${esc(r.barSource)} · ${esc(r.dataDate)} · ${r.provisional?'临时快照待复核':r.valid?'当日完整日K已核验':'日K待核验'}</p><p>反证：${esc(r.contrary.join('；'))}</p><p>缺口：${esc(r.gaps.join('；')||'上述指标未见缺口')}</p><p>${esc(r.cause)}</p><p>输入哈希：<code>${esc(report.inputHash)}</code></p><p>行情路径：<code>${esc(r.seriesSource)}</code></p></details></td></tr>`).join('')}</tbody></table></div>`:'<p class="muted">本周期没有该方向候选</p>'}`};
 return `<div class="postmarket-report" data-review-report="${esc(report.id)}"><p class="review-meta">${esc(report.date)} · ${esc(report.modeLabel)} · 扫描 ${esc(report.ruleVersion)} · ${esc(report.priceBasis)}</p><p class="review-meta">扫描刷新 ${esc(time(report.scanAt))}；输入固定 ${esc(time(report.capturedAt||report.createdAt))}（北京时间）。日K已收盘；${esc(report.calendar.weekState)}；${esc(report.calendar.monthState)}。下一交易日 ${esc(report.calendar.nextDate||'日历待补')}。</p><p class="review-overview">${esc(report.overview)}</p><section class="review-ai"><h3>AI解读</h3><p>${esc(report.ai.status==='completed'?report.ai.text:report.ai.status==='pending'?'AI解释进行中，以下是已完成的真实计算结果。':report.ai.status==='failed'?report.ai.error:'AI未配置或本次无候选，未执行AI分析；以下为真实计算结果。')}</p>${report.ai.model?`<small class="muted">${esc(report.ai.provider)} / ${esc(report.ai.model)}</small>`:''}</section><details class="review-context"><summary>市场与板块背景 · 样本和口径</summary><p>${esc(report.market.name)} ${report.market.sample}/${report.market.total}；${esc(report.market.method)}</p><div class="table-wrap"><table><thead><tr><th>板块</th><th>有效 / 配置样本</th><th>当日等权</th></tr></thead><tbody>${report.sectors.map(s=>`<tr><td>${esc(s.sector)}</td><td>${s.sample}/${s.total}</td><td>${pct(s.meanReturn)}</td></tr>`).join('')}</tbody></table></div><p>板块相对强弱＝该品种当日昨收涨跌幅－所属板块有效样本等权涨跌幅（含本品种，至少2个样本）；持仓不是资金净流入。</p></details><p class="hint ${changes.available?'':'warning'}">${esc(history)}</p>${rows.length?table('long')+table('short'):'<div class="empty">本周期没有候选，不生成虚构品种或策略。</div>'}<p class="review-meta">${esc(report.boundary)}。${report.saved?`保存位置：${esc(report.storagePath||'.runtime/postmarket-reviews/'+report.id)}。`:'本次未保存，关闭小木后不会保留。'}</p></div>`;
}
const sourceHref=value=>{try{const u=new URL(value);return u.protocol==='https:'?esc(u.href):'#'}catch{return '#'}};
function fundamentalHtml(evidence,table,cells){
 if(!evidence)return '<p class="muted">消息与产业数据正在核验。</p>';
 const records=(evidence.items||[]).filter(s=>s.type&&s.type!=='news'),news=(evidence.items||[]).filter(s=>s.type==='news');
 const amount=(v,unit)=>typeof v==='number'&&Number.isFinite(v)?`${v.toLocaleString('zh-CN')} ${esc(unit)}`:'数据未获取';
 const delta=(v,unit)=>typeof v==='number'&&Number.isFinite(v)?`${v>0?'+':''}${v.toLocaleString('zh-CN')} ${esc(unit)}`:'数据未获取';
 const data=table(['品种','指标 / 口径','观测日期','数值','可比变化','来源'],records.map(s=>cells([esc(s.name),esc(s.label),esc(s.observedDate),s.type==='holdings'?`多 ${amount(s.value,s.unit)}<br>空 ${amount(s.shortValue,s.unit)}`:amount(s.value,s.unit),s.type==='holdings'?`多 ${delta(s.change,s.unit)}<br>空 ${delta(s.shortChange,s.unit)}`:`${delta(s.change,s.unit)}<br><small>${esc(s.period)}</small>`,`<a href="${sourceHref(s.url)}" target="_blank" rel="noopener noreferrer">[${esc(s.id)}] ${esc(s.source)}</a>`])),'data-review-industrial');
 const providers=table(['来源','取数状态','范围 / 缺口'],(evidence.providers||[]).map(p=>cells([esc(p.name),esc(({ok:'已取得',sampled:'窗口取样',partial:'部分取得',unavailable:'未获取'})[p.status]||'未核验'),esc([p.coverage,p.reason].filter(Boolean).join('；'))])),'data-review-providers');
 const entry=s=>`<details class="review-news"><summary><span>[${esc(s.id)}] ${esc(s.title.slice(0,100))}</span></summary><p>${esc(s.source)} · ${esc(time(s.published))} · ${esc(s.classification)} · ${esc(s.notice||'')}</p><p>${esc(s.text||'正文未获取，仅作线索')}</p><a href="${sourceHref(s.url)}" target="_blank" rel="noopener noreferrer">查看来源原文</a></details>`;
 return `<section class="review-band" data-review-fundamentals><h3>消息与供需变化</h3><p class="review-meta">取数 ${esc(time(evidence.fetchedAt))}。当日消息 ${news.filter(s=>s.classification==='当日盘前 / 盘中消息').length} 条；盘后背景 ${news.filter(s=>s.classification.startsWith('盘后')).length} 条；历史背景 ${news.filter(s=>s.classification==='历史背景').length} 条。消息为候选相关取样，不是全量。</p>${news.slice(0,6).map(entry).join('')}${news.length>6?`<details><summary>其余相关消息 ${news.length-6} 条</summary>${news.slice(6).map(entry).join('')}</details>`:''}${!news.length?'<p class="review-gap">当日相关消息正文未取得，原因待核验。</p>':''}<details><summary>交易所指标 ${records.length} 条</summary>${records.length?data:'<p>仓单、库存和席位数据未获取。</p>'}<p class="review-meta">仓单不等于总库存；交割库库存不等于社会库存。席位增减不等于资金净流入。产量、开工、现货、基差和终端需求未取得完整可比数据。</p></details><details><summary>来源连接与数据缺口</summary>${providers}</details><p class="review-gap">${esc(evidence.index?.reason||'文华商品指数尚未取得；商品样本不是该指数。')}</p></section>`;
}
function compareReportHtml(r){
 const rows=r.rows||[],numeric=value=>typeof value==='number'&&Number.isFinite(value),label={long:'多头',short:'空头',conflict:'冲突'};
 const table=(headers,items,attr='')=>`<div class="table-wrap review-compact" ${attr}><table><thead><tr>${headers.map(v=>`<th>${v}</th>`).join('')}</tr></thead><tbody>${items.join('')}</tbody></table></div>`;
 const cells=items=>'<tr>'+items.map(v=>`<td>${v}</td>`).join('')+'</tr>';
 const counts=s=>`${s.up} / ${s.down} / ${s.flat}`;
 const markets=table(['范围','有效 / 总样本','缺失','涨 / 跌 / 平','等权涨跌','中位数'],r.markets.map(s=>cells([esc(s.name),`${s.sample}/${s.total}`,s.missing,counts(s),pct(s.meanReturn),pct(s.medianReturn)])));
 const sectors=table(['板块','有效样本','涨 / 跌 / 平','等权 / 中位数','表现'],r.sectors.map(s=>cells([esc(s.sector),`${s.sample}/${s.total}`,counts(s),`${pct(s.meanReturn)} / ${pct(s.medianReturn)}`,`${esc(s.breadth)}${s.extreme&&numeric(s.withoutExtreme)?`<details><summary>极值影响</summary><p>${esc(s.extreme.name)} ${pct(s.extreme.dayReturn)}；不含该品种等权 ${pct(s.withoutExtreme)}。原样本统计保留。</p></details>`:''}`])));
 const modes=table(['模式','候选 / 判定缺失','方向','有效 / 候选','涨 / 跌 / 平','等权 / 中位数'],r.modeStats.flatMap(s=>s.sides.map((side,i)=>cells([i===0?esc(s.label):'',i===0?`${s.total} / ${s.missingDecisions}`:'',`<span class="review-tone ${side.direction}">${label[side.direction]} ${side.total}</span>`,`${side.sample}/${side.total}`,counts(side),`${pct(side.meanReturn)} / ${pct(side.medianReturn)}`]))),'data-review-mode-stats');
 const keys=r.modeStats.map(s=>s.mode);
 const matrix=table(['品种 / 合约','板块',...r.modeStats.map(s=>esc(s.label)),'当日 / 近5日','对照 / 差异依据'],rows.map(row=>cells([`<b>${esc(row.name)}</b><br><small>${esc(row.contract)}</small>`,esc(row.sector),...keys.map(key=>{const m=row.membership[key],side=m.status==='多头观察'?'long':m.status==='空头观察'?'short':'';return `<span class="review-tone ${side}">${esc(m.status)}</span>`}),`${pct(row.dayReturn)}<br><small>${pct(row.fiveReturn)}</small>`,`${esc(row.agreement)}<details data-review-comparison="${esc(row.code)}"><summary>为什么有差异</summary>${r.modeStats.map(s=>`<p><b>${esc(s.label)}</b>：${esc(row.membership[s.mode].reason)}</p>`).join('')}</details>`])),'data-review-comparison-table');
 const detail=row=>`<details data-review-evidence="${esc(row.code)}"><summary><span class="review-tone ${row.direction}">${esc(row.name)} ${esc(row.contract)}</span> · ${esc(row.judgment)} · ${pct(row.dayReturn)}</summary><p>近5日 ${pct(row.fiveReturn)}；板块相对 ${relative(row.relativeReturn)}；${esc(row.quantity)}</p><p>${esc(row.next)}</p><p>反证：${esc(row.contrary.join('；'))}</p><p>来源：${esc(row.source)} / ${esc(row.barSource)} · ${esc(row.dataDate)}；缺口：${esc(row.gaps.join('；')||'当前量价仓指标完整')}</p></details>`;
 const focusCodes=[...(r.focus?.long||[]),...(r.focus?.short||[])],focus=rows.filter(row=>focusCodes.includes(row.code)||row.judgment==='出现转弱迹象'||row.direction==='conflict');
 const evidence=r.evidence,sourceList=(evidence?.items||[]).map(s=>`<p>[${esc(s.id)}] <a href="${sourceHref(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)}</a> · ${esc(s.source)} · ${esc(s.published||'日期未知')} · ${esc(s.classification)}</p>`).join('');
 const products=(evidence?.products||[]).map(p=>`<details><summary>${esc(p.name)} · ${esc(p.framework?.focus||'框架待补')}</summary><p>${esc(p.framework?.transmission||'')}；${esc(p.framework?.caveat||'')}</p><p>${esc(p.missing||'已取得数据库记录，仍需核对原日期与口径')}</p><pre>${esc(JSON.stringify(p.data,null,2))}</pre></details>`).join('');
 return `<div class="postmarket-report" data-review-report="${esc(r.id)}" data-review-all="true"><p class="review-meta">${esc(r.date)} · 三模式对比 · ${esc(r.ruleVersion)}；扫描 ${esc(time(r.scanAt))}；输入 ${esc(time(r.capturedAt))}。日K已收盘；${esc(r.calendar.weekState)}；${esc(r.calendar.monthState)}。</p><p class="review-overview">${esc(r.overview)}</p><section class="review-band"><h3>市场与板块</h3>${markets}<p class="review-meta">同合约收盘比上一交易日收盘，各品种等权；缺失不计为持平。商品统计为已取得样本，股指、国债单列。</p>${sectors}</section><section class="review-band"><h3>三模式统计</h3>${modes}<p>候选去重 ${r.overlap.union} 个：三模式同向 ${r.overlap.three}，两模式同向 ${r.overlap.two}，单模式 ${r.overlap.one}，冲突 ${r.overlap.conflict}。</p><details><summary>两两交集与统计口径</summary>${r.overlap.pairs.map(p=>`<p>${esc(r.modeStats.find(s=>s.mode===p.a).label)} ∩ ${esc(r.modeStats.find(s=>s.mode===p.b).label)}：${p.count} 个</p>`).join('')}<p>各模式独立统计，去重只用于整体候选；未入选不等于反向或转弱。</p></details></section><section class="review-band"><h3>候选对照</h3>${rows.length?matrix:'<p class="muted">三个模式均无候选；市场统计仍可查看。</p>'}</section><section class="review-band review-ai"><h3>主线与次日验证</h3><p>${esc(r.ai.status==='completed'?r.ai.text:r.ai.status==='pending'?'AI正在核对主线，统计与对照已可查看。':r.ai.status==='failed'?r.ai.error:'AI未配置，以下为程序计算的观察依据。')}</p>${focus.length?focus.map(detail).join(''):'<p class="muted">暂未发现证据充分的延续观察对象。</p>'}<details><summary>全部候选依据 ${rows.length} 个</summary>${rows.map(detail).join('')}</details><details><summary>判断口径与历史对照</summary><p>${esc(r.qualityMethod)}</p><p>${esc(r.changes.available?JSON.stringify(r.changes):r.changes.reason)}</p></details>${fundamentalHtml(evidence,table,cells)}<details class="review-sources"><summary>消息与供需来源 / 缺口</summary><p>${esc(evidence?.scope||'消息与供需核验进行中')}</p>${sourceList}<p>${esc((evidence?.missing||[]).join('；'))}</p>${products}</details></section><p class="review-meta">下一交易日 ${esc(r.calendar.nextDate||'未知')}。${esc(r.boundary)}。${r.saved?`保存位置：${esc(r.storagePath)}`:'本次未保存，关闭小木后不会保留。'}</p></div>`;
}
export function postmarketReportHtml(report){return report.mode==='all'?compareReportHtml(report):legacyReportHtml(report)}
export function createPostmarketUI({api,modal,title,body,getMode,getFire,toast}){
 let timer=null,selected='',busy=false,saving=false,generation=0,lastDraft='';
 const current=token=>token===generation&&modal.open;
 async function histories(id=''){
  const token=generation,list=await api('/api/workbench/postmarket-reviews');
  if(!current(token))return list;
  body.querySelector('#postmarketHistory').innerHTML='<option value="">已保存复盘 · 最新在前</option>'+list.map(j=>`<option value="${j.id}" ${j.id===id?'selected':''}>${esc(j.date)} · ${esc(j.modeLabel)} · ${esc(time(j.savedAt||j.createdAt))} · ${j.status==='partial'?'已保存（有缺口）':'已保存'}</option>`).join('');
  return list;
 }
 function refreshButton(){const b=document.querySelector('#postmarketReview');if(b){b.disabled=!!getFire()?.refreshing;b.textContent=busy?'查看复盘进度':'盘后数据复盘'}}
 async function show(id){
  const token=generation;selected=id;clearTimeout(timer);
  const saveButton=body.querySelector('#postmarketSave');saveButton.disabled=true;saveButton.textContent='保存复盘';
  body.querySelector('#postmarketResult').innerHTML='';
  try{
   const job=await api('/api/workbench/postmarket-reviews/'+id);if(!current(token)||selected!==id)return;
   busy=job.status==='running';refreshButton();
   const status=body.querySelector('#postmarketProgress'),retry=body.querySelector('#postmarketRetry');
   status.className='hint '+(['failed','interrupted'].includes(job.status)?'error-box':'');status.textContent=job.error||job.stage;retry.disabled=busy;
   saveButton.disabled=!!job.saved||!['completed','partial'].includes(job.status);saveButton.textContent=job.saved?'已保存':'保存复盘';
   try{
    const r=await api('/api/workbench/postmarket-reviews/'+id+'/result');if(!current(token)||selected!==id)return;
    body.querySelector('#postmarketResult').innerHTML=postmarketReportHtml(r);
   }catch{if(!current(token)||selected!==id)return;if(!busy)body.querySelector('#postmarketResult').innerHTML='<p class="muted">本次未生成报告，已保存的记录仍可查看。</p>'}
   if(busy)timer=setTimeout(()=>show(id),1500);else await histories(job.saved?id:'');
  }catch(e){if(!current(token)||selected!==id)return;busy=false;refreshButton();body.querySelector('#postmarketProgress').textContent=e.message;body.querySelector('#postmarketRetry').disabled=false}
 }
 async function start(){
  if(busy||saving||!modal.open)return;const token=generation;busy=true;refreshButton();clearTimeout(timer);
  body.querySelector('#postmarketRetry').disabled=true;body.querySelector('#postmarketSave').disabled=true;
  body.querySelector('#postmarketProgress').textContent='正在核验数据…';body.querySelector('#postmarketResult').innerHTML='';
  try{
   const job=await api('/api/workbench/postmarket-reviews',{method:'POST',body:JSON.stringify({mode:'all'})});lastDraft=job.id;
   if(!current(token))return;await histories();if(current(token))await show(job.id);
  }catch(e){if(!current(token))return;busy=false;refreshButton();body.querySelector('#postmarketProgress').textContent=e.message;body.querySelector('#postmarketRetry').disabled=false}
 }
 async function save(){
  if(saving||busy||!selected)return;const token=generation,id=selected;saving=true;
  const button=body.querySelector('#postmarketSave');button.disabled=true;button.textContent='保存中…';
  body.querySelector('#postmarketRetry').disabled=true;body.querySelector('#postmarketHistory').disabled=true;
  try{
   await api('/api/workbench/postmarket-reviews/'+id+'/save',{method:'POST',body:'{}'});
   if(!current(token))return;if(lastDraft===id)lastDraft='';await show(id);toast('复盘已保存');
  }catch(e){if(current(token)){button.disabled=false;button.textContent='重试保存';body.querySelector('#postmarketProgress').textContent='保存失败：'+e.message;toast('保存失败，请重试',true)}}
  finally{saving=false;if(current(token)){body.querySelector('#postmarketRetry').disabled=false;body.querySelector('#postmarketHistory').disabled=false}}
 }
 async function open(savedOnly=false){
  if(modal.open)return;const token=++generation;busy=false;saving=false;
  title.textContent=savedOnly?'已保存复盘':'盘后数据复盘';
  body.innerHTML='<div class="postmarket-toolbar"><select id="postmarketHistory" aria-label="已保存复盘"><option>已保存复盘</option></select><button id="postmarketSave" class="primary" disabled>保存复盘</button><button class="secondary" id="postmarketRetry">重新分析</button></div><p id="postmarketProgress" class="hint" role="status" aria-live="polite">正在读取…</p><div id="postmarketResult"></div>';
  modal.classList.add('postmarket-dialog');modal.showModal();
  const connection=document.createElement('details');connection.className='review-connection';
  connection.innerHTML='<summary>金十连接</summary><p id="jin10Status" class="muted">正在读取连接状态…</p><div class="review-connection-fields"><input id="jin10Token" type="password" autocomplete="off" aria-label="金十 MCP Token" placeholder="输入新的 MCP Token"><button id="jin10Save" class="secondary">保存连接</button><a href="https://mcp.jin10.com/app/doc.html" target="_blank" rel="noopener noreferrer">金十官方说明</a></div>';
  body.querySelector('.postmarket-toolbar').after(connection);
  const status=connection.querySelector('#jin10Status');
  api('/api/postmarket-sources').then(s=>{if(current(token))status.textContent=s.jin10Configured?'已配置本机 Token，实际取数状态见复盘来源。':'尚未配置 Token，金十数据不会补猜。'}).catch(()=>{if(current(token))status.textContent='连接状态未取得'});
  connection.querySelector('#jin10Save').onclick=async()=>{
   const input=connection.querySelector('#jin10Token'),button=connection.querySelector('#jin10Save');if(!input.value.trim())return;
   button.disabled=true;
   try{await api('/api/postmarket-sources',{method:'POST',body:JSON.stringify({jin10Token:input.value})});input.value='';lastDraft='';if(current(token)){status.textContent='本机配置已保存，下次分析时核验；不写入复盘或分享包。';toast('金十连接配置已保存')}}
   catch(e){if(current(token))status.textContent=e.message}finally{button.disabled=false}
  };
  body.querySelector('#postmarketRetry').onclick=start;body.querySelector('#postmarketSave').onclick=save;
  body.querySelector('#postmarketHistory').onchange=e=>{if(e.target.value)show(e.target.value)};
  modal.addEventListener('close',()=>{generation++;clearTimeout(timer);selected='';busy=false;refreshButton();modal.classList.remove('postmarket-dialog')},{once:true});
  try{
   const list=await histories();if(!current(token))return;
   if(savedOnly){
    if(list.length)await show(list[0].id);
    else body.querySelector('#postmarketProgress').textContent='还没有已保存的复盘';
    return;
   }
   const running=await api('/api/workbench/postmarket-reviews/current');if(!current(token))return;
   if(running){lastDraft=running.id;await show(running.id)}
   else await start();
  }catch(e){if(!current(token))return;busy=false;refreshButton();body.querySelector('#postmarketProgress').textContent=e.message;toast(e.message,true)}
 }
 return {bind(){
  const b=document.querySelector('#postmarketReview');if(b)b.onclick=()=>open(false);
  const saved=document.querySelector('#postmarketSaved');if(saved)saved.onclick=()=>open(true);
  refreshButton();
 }};
}
