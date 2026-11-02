const labels={change:'什么改变',evidence:'证据在哪里',pricedIn:'价格是否已反映',disproof:'最强反证',competingExplanation:'竞争解释',sources:'来源与链接',missing:'证据缺口',conclusion:'研究结论',frameworkVersion:'框架版本',headline:'一句话结论',stage:'价格阶段',stageConfidence:'主观把握',priorStage:'先验阶段',priorConfidence:'先验把握',posteriorShift:'证据更新',dimensions:'四维证据',advice:'条件应对',reversal:'改判条件',fundamentalDirection:'基本面方向',strategyConclusion:'策略结论',strategyAction:'观察建议',institutionView:'机构观点',evidenceGrade:'证据等级',asOf:'价格截止',quickBrief:'速读摘要',sourceRefs:'证据编号',sourceSnapshot:'来源快照'};
const readable=value=>value==null?'未填写':typeof value==='object'?JSON.stringify(value,null,2):String(value);
export function openDraftComparison({job,card,form,api,dialog,title,body,esc,onSaved,onError}){
 const local=Object.fromEntries(new FormData(form)),keys=Object.keys(job.waterDraft||{}).filter(k=>labels[k]);
 title.textContent='核对AI草稿与本人记录';
 body.innerHTML=`<p>报告 ${esc(job.created)} · ${esc(job.contract)}。替换前的记录保留在操作审计中。</p><div class="actions"><button type="button" id="selectResearchFields" class="secondary">选择全部差异</button></div><div class="table-wrap"><table class="research-diff"><thead><tr><th>应用</th><th>字段</th><th>当前记录</th><th>AI草稿</th></tr></thead><tbody>${keys.map(k=>`<tr><td><input type="checkbox" data-research-field="${k}" aria-label="应用${esc(labels[k])}" ${JSON.stringify(local[k]??card.water?.[k]??null)===JSON.stringify(job.waterDraft[k]??null)?'disabled':''}></td><th>${esc(labels[k])}</th><td><pre>${esc(readable(local[k]??card.water?.[k]))}</pre></td><td><pre>${esc(readable(job.waterDraft[k]))}</pre></td></tr>`).join('')}</tbody></table></div><p id="applyResearchError" role="alert"></p><div class="actions"><button type="button" id="applyResearchFields" class="primary">应用所选字段</button></div>`;
 body.querySelector('#selectResearchFields').onclick=()=>body.querySelectorAll('[data-research-field]:not(:disabled)').forEach(n=>n.checked=true);
 body.querySelector('#applyResearchFields').onclick=async e=>{
  const fields=[...body.querySelectorAll('[data-research-field]:checked')].map(n=>n.dataset.researchField);if(!fields.length){body.querySelector('#applyResearchError').textContent='请先选择要应用的字段';return}e.target.disabled=true;
  try{
   const edits=Object.fromEntries(Object.entries(local).filter(([key,v])=>String(card.water?.[key]??'')!==v));
   if(Object.keys(edits).length)await api(`/api/workbench/cards/${card.id}/water-notes`,{method:'POST',body:JSON.stringify({values:edits,expected:Object.fromEntries(Object.keys(edits).map(k=>[k,card.water?.[k]??null]))})});
   const displayed={...card.water,...edits};
   await api(`/api/workbench/cards/${card.id}/apply-research`,{method:'POST',body:JSON.stringify({reportId:job.id,fields,expected:Object.fromEntries(fields.map(k=>[k,displayed[k]??null]))})});
   dialog.close();await onSaved();
  }catch(error){body.querySelector('#applyResearchError').textContent=error.message;onError?.(error)}finally{e.target.disabled=false}
 };
 dialog.showModal();
}
