const compact=value=>String(value??'').replace(/\s+/g,' ').trim();
const rows=value=>Array.isArray(value)?value.filter(row=>row&&typeof row==='object'&&!Array.isArray(row)):[];
export function numericTokens(value){
 const text=String(value??'').replace(/(\d),(\d{3})/g,'$1$2').replace(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g,'$1 $2 $3').replace(/\b(\d{1,2})-(\d{1,2})\b/g,'$1 $2');
 return (text.match(/-?\d+(?:\.\d+)?/g)||[]).map(Number);
}
export function reportObject(text){
 const raw=String(text||'').match(/<!--WUJIAN_WATER_JSON_START-->\s*([\s\S]*?)\s*<!--WUJIAN_WATER_JSON_END-->/)?.[1];
 try{const value=JSON.parse(raw?.replace(/^```(?:json)?\s*|\s*```$/g,''));
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  if(value.expert&&typeof value.expert==='object'&&!Array.isArray(value.expert))value.expert={...value.expert,coverage:rows(value.expert.coverage||value.coverage),claims:rows(value.expert.claims||value.claims),scenarios:rows(value.expert.scenarios)};
  return value;
 }catch{return null}
}
export function expertReportSpec(name,checklist){
 return `生成 ${name} 的专家式深度研究，全部简体中文，先讲清楚再讲深入。全文约2500至4500字，证据不足不凑字数。
标题后先给约400字速读：主矛盾、支持与反对、价格是否已反映、当前建议、最大风险。正文用以下七个二级标题：
## 一、定价主线与价格先验
## 二、供需、库存与基本面
## 三、现货、基差、期限结构与历史
## 四、消息面、政策面与资金面
## 五、竞争解释与贝叶斯后验
## 六、未来情景与专业建议
## 七、反证与下一步验证
必须：按必查清单逐项回应，列数据统计期、发布/采集期差别、来源和缺口；历史范围与季节性只能引用实际序列。短期几个交易日与中期几周分开。基准/偏强/偏弱三情景都写触发、反证、观察窗口。价格与基本面可相反，不能迎合交易卡方向。允许技术趋势明确而基本面证据不足。不给虚构概率或开仓授权。正文只用中文指标名和“部分取得/未取得”等中文状态，不输出driver编号、partial等内部字段；仅在JSON保留英文键和值。直接从报告标题开始，不讲修订过程或程序校验过程。
每个关键事实后用[E编号]。只能用提供的证据，不引用并未读到的页面；摘要只能作线索，行业媒体转述要标为转述，不自称已查原表。原始统计被转载多次只算一次。给用户大白话解释，不堆术语，不重复堆砌新闻。
在正文后附完整JSON，包在 <!--WUJIAN_WATER_JSON_START--> 和 <!--WUJIAN_WATER_JSON_END--> 之间，不加围栏：
headline, stage, stageConfidence(用“证据支持有限/中等/较强/分歧”，不是胜率), priorStage, priorConfidence, posteriorShift,
dimensions:{fundamental/news/policy/capital:{direction:"偏多/偏空/中性/分歧/未取得",weight:"强/中/弱",summary}},
advice,reversal,change,evidence,pricedIn,disproof,competingExplanation,sources,missing,
conclusion:"保留观察/等待补证据/撤回假说",fundamentalDirection:"偏多/偏空/中性/分歧/证据不足",
strategyConclusion,strategyAction:"重点关注/继续观察/仅作参考/撤回",institutionView,evidenceGrade:"A/B/C/D",asOf,sourceRefs,
expert:{mainDriver,bullCase,bearCase,pricedIn,advice,invalidation,changes,
scenarios:[{name:"基准/偏强/偏弱",horizon,trigger,implication,invalidatedBy}],
coverage:[{metricId,status:"supported/partial/missing/conflicting",summary,evidenceIds,quote,period,unit,gap}],
claims:[{claim,evidenceId,quote,kind:"fact/interpretation/clue"}]}。
coverage必须含这些编号且不遗漏：${checklist.map(m=>`${m.id}(${m.label})`).join('、')}。
supported只用于本指标真正有正文支持、统计期与单位可辨的情况。仅检索命中、有宏观背景、单位不清、一部分子项缺失均为partial。quote逐字引用输入证据的一小段（20至100字），不要改写；无证据填空。claims列最重要的6至10个事实或推断，每条准确引用证据中的原句，供程序核对；推断标interpretation并在正文说明推理。未取得正文的摘要和标题只能标clue，claim必须明确写“仅标题线索”或“仅摘要线索”，不能写为事实。不得把未来情景当成已发生事实。coverage和claims放在expert对象内部。`;
}
export function auditExpertReport(text,evidence,checklist,now=new Date()){
 const value=reportObject(text),expert=value?.expert,byId=new Map(evidence.items.map(i=>[i.id,i])),issues=[];
 const contextContracts=new Set(evidence.items.filter(i=>i.type==='price').flatMap(i=>String(i.text).match(/\b[A-Z]{1,3}\d{3,4}\b/g)||[]));
 const references=[...new Set([...String(text).matchAll(/\[(E\d+)\]/g)].map(m=>m[1]))];
 for(const id of references)if(!byId.has(id))issues.push(`引用 ${id} 不存在`);
 const body=String(text).split('<!--WUJIAN_WATER_JSON_START-->')[0];
 for(const paragraph of body.split(/\n\s*\n/)){
  const comparisons=[...paragraph.matchAll(/(\d+(?:\.\d+)?)(?:元\/吨)?\s*(?:低于|高于)(?:日|周|月)?(?:MA10|均线)/g)];
  const ids=[...paragraph.matchAll(/\[(E\d+)\]/g)].map(m=>m[1]);
  if(comparisons.some(m=>ids.some(id=>{const item=byId.get(id);return item&&item.type!=='price'&&String(item.text).includes(m[1])&&![...contextContracts].some(c=>`${item.text} ${item.title}`.includes(c))}))){
   issues.push('存在将未标具体合约的外部报价与研究合约均线比较的表述；删除该比较，仅保留市场情绪线索');
  }
 }
 const claims=(expert?.claims||[]).slice(0,16).map(claim=>{
  const item=byId.get(claim.evidenceId),quote=compact(claim.quote);
  const structured=['price','dataset','warehouse','positions'].includes(item?.type);
  const clue=claim.kind==='clue'&&/仅.*(标题|摘要|线索)/.test(claim.claim||'');
  const quoteMatched=!!(item?.fullText||structured||clue)&&quote.length>=16&&compact(clue?`${item?.title||''} ${item?.text||''}`:item?.text).includes(quote);
  const future=item?.published&&Date.parse(item.published)>now.getTime()+86400000;
  const contracts=String(claim.claim||'').match(/\b[A-Z]{1,3}\d{3,4}\b/g)||[];
  const identifiersSupported=contracts.every(code=>contextContracts.has(code)||`${item?.title} ${item?.text}`.includes(code));
  const numbers=numericTokens(String(claim.claim||'').replace(/\b[A-Z]{1,3}\d{3,4}\b/g,'')),originalNumbers=new Set(numericTokens(JSON.stringify({text:item?.text,title:item?.title,published:item?.published,period:item?.observedPeriod})));
  const numbersSupported=identifiersSupported&&(claim.kind==='interpretation'||numbers.every(n=>originalNumbers.has(n)));
  const ok=quoteMatched&&!future&&numbersSupported;
  if(!ok)issues.push(`关键论断未通过引文核对：${String(claim.claim||'').slice(0,90)}；${claim.evidenceId}：${!item?'证据编号不存在':!item.fullText&&!structured&&!clue?'只有标题或摘要，不可写为fact；改为明确的“仅摘要线索”或删除该断言':future?'发布时间在未来':!numbersSupported?'数字未在证据中找到':'quote并非原文逐字摘录'}`);
  return{...claim,quoteMatched,numbersSupported,status:ok?(clue?'clue-matched':'quote-matched'):'needs-review'};
 });
 if(!claims.length)issues.push('缺少可逐条回查的关键论断');
 const coverage=checklist.map(metric=>{
  const row=expert?.coverage?.find(c=>c.metricId===metric.id)||{};
  const ids=(Array.isArray(row.evidenceIds)?row.evidenceIds:[]).filter(id=>byId.has(id));
  const quote=compact(row.quote);
  const matched=quote.length>=16&&ids.some(id=>(byId.get(id).fullText||['price','dataset','warehouse','positions'].includes(byId.get(id).type))&&compact(byId.get(id).text).includes(quote));
  let status=['supported','partial','missing','conflicting'].includes(row.status)?row.status:'missing';
  const unclear=value=>!compact(value)||/未|待|不明|不详|未知/.test(compact(value));
  if(status==='supported'&&(!matched||unclear(row.period)||unclear(row.unit)))status='partial';
  if(!ids.length&&status!=='conflicting')status='missing';
  return{id:metric.id,label:metric.label,status,summary:compact(row.summary)||'未取得足以回答该指标的证据',evidenceIds:ids,quote:matched?row.quote:'',period:compact(row.period),unit:compact(row.unit),gap:compact(row.gap)||(status==='supported'?'':matched?'指标仍有未覆盖部分':'原文或统计口径尚待核对')};
 });
 const supported=coverage.filter(c=>c.status==='supported').length;
 return{version:3,status:issues.length||supported<coverage.length?'partial':'complete',issues,coverage,claims,supported,total:coverage.length,checkedAt:now.toISOString(),notice:'引文匹配只核对报告与所取资料是否一致，不保证原始发布真实，也不代表预测有效。缺口及转述保留。'};
}
export function evidenceFallback(name,evidence,reason){
 const lines=[`# ${name}｜已采集证据，综合研判未完成`,'',`本次分析未完成：${reason}。以下仅为取得的资料，不提供方向建议。`,'','## 原始证据'];
 for(const item of evidence.items)lines.push(`### ${item.id} ${item.title}`,`来源：${item.source||'程序行情'}；统计期：${item.observedPeriod||'需核对'}；发布：${item.published||'未标明'}`,item.url?`[查看来源](${item.url})`:'',item.text||'','');
 lines.push('## 证据缺口',...(evidence.missing||[]).map(x=>'- '+x));
 return lines.join('\n');
}
