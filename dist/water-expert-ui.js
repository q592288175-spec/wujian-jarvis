import {renderMarkdown} from './ui/markdown.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clean=text=>String(text||'').replace(/<!--WUJIAN_WATER_JSON_START-->[\s\S]*?<!--WUJIAN_WATER_JSON_END-->/g,'').replace(/\[E(\d+)[—–\-~至]E?(\d+)\]/g,(all,start,end)=>Number(end)>=Number(start)&&Number(end)-Number(start)<=20?Array.from({length:Number(end)-Number(start)+1},(_,i)=>`[E${Number(start)+i}]`).join(''):all).trim();
const names={supported:'正文与口径可回查',partial:'部分取得',missing:'未取得',conflicting:'存在分歧'};
function link(url,label){try{const u=new URL(url);if(!['http:','https:'].includes(u.protocol))return esc(label);return`<a href="${esc(u.href)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`}catch{return esc(label)}}
const date=value=>value?new Date(value).toLocaleString('zh-CN',{hour12:false}):'未标明';
export function expertHtml(job){
 const expert=job.expert||{},draft=job.waterDraft||{},quality=job.quality||{},items=job.evidence?.external?.items||[];
 const complete=quality.status==='complete',issues=quality.issues||[];
 const summary=[['当前主线',expert.mainDriver||draft.headline],['支持上涨',expert.bullCase],['支持下跌',expert.bearCase],['价格是否已反映',expert.pricedIn||draft.pricedIn],['专业建议',issues.length?'关键论断尚未通过核对，暂不提供可应用的方向建议。':expert.advice||draft.advice],['什么会推翻判断',expert.invalidation||draft.disproof],['相对上次的变化',expert.changes||draft.change]];
 return`<article class="water-expert">
 <header class="water-report-heading"><div><small>品种深度研究 · ${esc(job.contract)}</small><h3>${esc(draft.headline||expert.mainDriver||'研究证据与待核事项')}</h3><p>行情 ${esc(job.marketContext?.dataDate||job.dataAsOf||'未标明')} · 生成 ${esc(date(job.completed||job.created))}</p></div><span class="water-quality ${complete?'':'partial'}">${complete?'指标已覆盖':'部分研究'}</span></header>
 ${issues.length?`<p class="hint warning" role="status">还有 ${issues.length} 项论断核对问题，请先查看证据与缺口。</p>`:''}
 <div class="water-report-tools"><div role="tablist" aria-label="研究报告视图"><button type="button" role="tab" data-report-tab="brief" aria-selected="true">一屏速读</button><button type="button" role="tab" data-report-tab="full" aria-selected="false">完整报告</button><button type="button" role="tab" data-report-tab="evidence" aria-selected="false">证据与缺口</button></div><button type="button" class="quiet" data-report-download>下载报告</button></div>
 <section data-report-panel="brief" role="tabpanel">${summary.filter(([,v])=>v).map(([title,text])=>`<section class="water-brief-line"><h4>${title}</h4><p>${esc(text)}</p></section>`).join('')||'<p class="muted">综合研判未完成，已取得资料保存在证据页。</p>'}
 ${(expert.scenarios||[]).length?`<h4 class="water-section-title">未来情景</h4><div class="table-wrap"><table class="water-scenarios"><thead><tr><th>情景 / 时间</th><th>触发条件</th><th>含义</th><th>失效条件</th></tr></thead><tbody>${expert.scenarios.map(s=>`<tr><th>${esc(s.name)}<small>${esc(s.horizon)}</small></th><td>${esc(s.trigger)}</td><td>${esc(s.implication)}</td><td>${esc(s.invalidatedBy)}</td></tr>`).join('')}</tbody></table></div>`:''}</section>
 <section data-report-panel="full" role="tabpanel" hidden><nav class="water-report-toc" aria-label="报告章节"></nav><div class="water-report-markdown"></div></section>
 <section data-report-panel="evidence" role="tabpanel" hidden>
 <p class="water-evidence-caption">必查指标 ${quality.total??quality.coverage?.length??0} 项 · 正文与口径可回查 ${quality.supported??0} 项 · 资料 ${items.length} 条</p>
 <div class="table-wrap"><table class="water-coverage"><thead><tr><th>必查指标</th><th>状态</th><th>统计期 / 单位</th><th>依据与缺口</th></tr></thead><tbody>${(quality.coverage||[]).map(c=>`<tr><th>${esc(c.label)}</th><td>${esc(names[c.status]||'待核对')}</td><td>${esc(c.period||'未确认')}<small>${esc(c.unit||'未确认')}</small></td><td>${esc(c.summary||'')}<small>${esc(c.gap||'')}${c.evidenceIds?.length?` · ${esc(c.evidenceIds.join('、'))}`:''}</small></td></tr>`).join('')}</tbody></table></div>
 ${issues.length?`<details open class="water-evidence-detail"><summary>待核对的论断</summary><ul>${issues.map(i=>`<li>${esc(i)}</li>`).join('')}</ul></details>`:''}
 <p class="muted">${esc(quality.notice||'原文与观点分开列示；资料缺口不以猜测补齐。')}</p>
 ${items.map(item=>`<details class="water-evidence-detail" id="evidence-${esc(item.id)}"><summary><b>${esc(item.id)}</b> ${esc(item.title)} <span>${item.fullText?'已取正文 / 数据':'仅线索'}</span></summary><p>${esc(item.source)} · 发布 ${esc(item.published||'未标明')} · 统计期 ${esc(item.observedPeriod||'见原文')} · 采集 ${esc(date(item.fetchedAt||job.evidence.external.fetchedAt))}</p><p>${item.url?link(item.sourceUrl||item.url,'打开来源'):esc(item.source||'本地程序计算')}</p><pre>${esc(item.text||'无正文')}</pre>${item.truncated?'<small>此处为相关摘录，非完整原文。</small>':''}</details>`).join('')}
 </section></article>`;
}
export function mountExpertReport(node,job){
 if(!node)return;node.innerHTML=expertHtml(job);
 const markdown=node.querySelector('.water-report-markdown');renderMarkdown(markdown,clean(job.report));
 const toc=node.querySelector('.water-report-toc');
 for(const [index,heading]of [...markdown.querySelectorAll('h2')].entries()){heading.id=`water-section-${job.id}-${index}`;const a=document.createElement('a');a.href='#'+heading.id;a.textContent=heading.textContent;toc.append(a)}
 for(const button of node.querySelectorAll('[data-report-tab]')){
  button.onclick=()=>{for(const b of node.querySelectorAll('[data-report-tab]'))b.setAttribute('aria-selected',String(b===button));for(const p of node.querySelectorAll('[data-report-panel]'))p.hidden=p.dataset.reportPanel!==button.dataset.reportTab};
  button.onkeydown=event=>{if(!['ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();const list=[...node.querySelectorAll('[data-report-tab]')],next=list[(list.indexOf(button)+(event.key==='ArrowRight'?1:list.length-1))%list.length];next.click();next.focus()};
 }
 const known=new Set((job.evidence?.external?.items||[]).map(item=>item.id));
 const walker=document.createTreeWalker(markdown,4),texts=[];while(walker.nextNode())texts.push(walker.currentNode);
 for(const text of texts){
  if(text.parentElement.closest('a,code,pre')||!/\[E\d+\]/.test(text.nodeValue))continue;
  const fragment=document.createDocumentFragment();
  for(const part of text.nodeValue.split(/(\[E\d+\])/)){
   const id=part.slice(1,-1);
   if(!known.has(id)){fragment.append(document.createTextNode(part));continue}
   const a=document.createElement('a');a.href='#evidence-'+id;a.textContent=part;a.title='查看本条证据与来源';
   a.onclick=event=>{event.preventDefault();node.querySelector('[data-report-tab="evidence"]').click();const detail=node.querySelector('#evidence-'+id);detail.open=true;detail.scrollIntoView?.({block:'center'});};
   fragment.append(a);
  }
  text.replaceWith(fragment);
 }
 node.querySelector('[data-report-download]').onclick=()=>{const appendix=(job.evidence?.external?.items||[]).map(i=>`- [${i.id}] ${i.title} | ${i.source||'本地行情'} | 发布：${i.published||'未标明'} | 统计期：${i.observedPeriod||'见原文'}${i.url?` | ${i.sourceUrl||i.url}`:''}`).join('\n');const blob=new Blob([clean(job.report)+'\n\n## 来源索引\n\n'+appendix],{type:'text/markdown;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`${job.contract||job.productCode}-研究-${String(job.created).slice(0,10)}.md`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
}
