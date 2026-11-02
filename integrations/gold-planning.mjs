import {createHash,randomUUID} from 'node:crypto';
import {GOLD_RULE,analyzeMethods,deriveMethod,validateGoldPlan,goldPermission} from '../dist/gold-methods.js';
import {simpleSizing} from './simple-sizing.mjs';
import {constrainApproval,reservationReleased,planOpenedLots} from './approval-boundary.mjs';
import {journal,tradeSummary} from './trade-ledger.mjs';
import {activeRun,startRun,bindRunCard} from './team-governance.mjs';

const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const now=()=>new Date().toISOString();
export function createGoldPlanning({database,getCard,listCards,listAccounts,saveCard,environment,bars,spec,registry,runSnapshot}) {
 const db=()=>{const d=database();d.exec(`CREATE TABLE IF NOT EXISTS gold_steps(id TEXT PRIMARY KEY,card_id TEXT NOT NULL,parent_id TEXT,stage TEXT NOT NULL,payload_json TEXT NOT NULL,created_at TEXT NOT NULL);
 CREATE UNIQUE INDEX IF NOT EXISTS gold_once_approval ON gold_steps(parent_id) WHERE stage='approved';`);return d};
 const append=(cardId,stage,payload,parentId=null)=>{const id=randomUUID(),createdAt=now();db().prepare('INSERT INTO gold_steps VALUES(?,?,?,?,?,?)').run(id,cardId,parentId,stage,JSON.stringify(payload),createdAt);journal(db(),'金·'+({analysis:'分析手法',method:'本人确认手法',review:'审定草案',approved:'本人最终拍板'}[stage]),{id,parentId,...payload},cardId);return{id,cardId,stage,createdAt,...payload}};
 const read=(id,cardId,stage)=>{const r=db().prepare('SELECT * FROM gold_steps WHERE id=? AND card_id=? AND stage=?').get(id,cardId,stage);if(!r)throw Error('步骤不存在或不属于当前交易卡');return{id:r.id,...JSON.parse(r.payload_json)}};
 const latest=(cardId,stages)=>db().prepare(`SELECT id FROM gold_steps WHERE card_id=? AND stage IN (${stages.map(()=>'?').join(',')}) ORDER BY rowid DESC LIMIT 1`).get(cardId,...stages)?.id;
 async function context(cardId){
  const card=getCard(cardId);if(!card||card.archivedAt)throw Error('交易卡不存在或已归档');
  const env=await environment(cardId,{cycle:'day',gold:true}),series=await bars(card.contract).catch(error=>({bars:[],source:error.message})),s=spec(card.symbol);
  const analysis=analyzeMethods({bars:series.bars,direction:card.direction,contract:card.contract,cutoff:env.dataDate,tickSize:s?.tickSize,source:series.source,layers:env.layers,water:card.water});
  return {card,env,s,analysis,evidenceHash:hash({contract:card.contract,direction:card.direction,bars:analysis.bars,water:card.water,env:env.hash,spec:s?.hash,rule:GOLD_RULE})};
 }
 const fresh=(saved,current)=>{if(saved.evidenceHash!==current.evidenceHash)throw Error('行情、研究或环境已更新，请重新分析并确认手法')};
 function accountRows(c,method,input){
  const errors=validateGoldPlan(method.derived,input,c.s?.tickSize),permission=goldPermission(c.env.layers,c.card.direction),all=listCards();
  if(c.analysis.missing.length)errors.push(...c.analysis.missing);
  if(!permission.cap)errors.push(...permission.missing);
  if(!Array.isArray(input.accounts)||!input.accounts.length)errors.push('至少选择一个账户');
  const ids=(input.accounts||[]).map(x=>x.id);if(new Set(ids).size!==ids.length)errors.push('账户重复');
  const accounts=listAccounts(),rows=[];
  for(const selection of input.accounts||[]){
   const account=accounts.find(a=>a.id===selection.id);if(!account||account.status!=='active'){errors.push('账户已停用或不存在');continue}
   const matching=all.filter(x=>x.accountId===account.id&&x.symbol===c.card.symbol&&x.contract===c.card.contract&&x.direction===c.card.direction);
   let target=account.id===c.card.accountId?c.card:matching.find(x=>!x.archivedAt);
   if(matching.filter(x=>!x.archivedAt).length>1){errors.push(`${account.alias} 有重复机会卡，请先核对`);continue}
   if(!target&&matching.length){errors.push(`${account.alias} 原机会已归档，请先恢复，不能重置轮次`);continue}
   target=target||{...c.card,id:null,accountId:account.id,roundId:c.card.roundId,plan:null,activePlanVersion:0};
   if(target.plan?.approvedAt&&!reservationReleased(db(),target.plan.id)&&(target.plan.risk.lots||0)>planOpenedLots(db(),target.plan.id))errors.push(`${account.alias} 上一计划仍有未成交预留，须核对释放`);
   if(target.id&&tradeSummary(db(),target).remainingLots>0)errors.push(`${account.alias} 已有持仓，本次入场流程不能改写存量保护`);
   const cap=method.derived.method==='intraday'||input.mainCycle==='small'?.5:1;
   if(selection.profileConfirmed!==true)errors.push(`${account.alias} 请确认本次账户风险口径`);
   if(!(selection.riskPercent>0&&selection.riskPercent<=cap))errors.push(`${account.alias} 本次风险比例超过${cap}%`);
   const payload={...input,accounts:undefined,accountEquity:account.equity,sizingMode:'simple',goldRuleVersion:GOLD_RULE,
    pairType:method.derived.pairType,direction:c.card.direction,entry:c.card.direction==='long'?input.entryMax:input.entryMin,
    riskPercent:selection.riskPercent,multiplier:c.s?.pointValue,tickSize:c.s?.tickSize,contractSpec:c.s,
    methodChoice:method.derived,methodConfirmationId:method.id,trigger:method.derived.trigger,
    entryWindow:`${input.entryMin} 至 ${input.entryMax}`,reviewer:'五简',environmentHash:c.env.hash,environmentLayers:c.env.layers};
   if(!['day','week','small'].includes(payload.mainCycle))errors.push('主周期无效');
   const risk=simpleSizing(account,payload,permission),checked=constrainApproval(db(),{...target,plan:{payload}},account,risk,all);
   const rowErrors=[...risk.missing,...checked.errors];
   const requested=selection.lots===null||selection.lots===undefined?checked.risk.lots:selection.lots;
   if(!Number.isSafeInteger(requested)||requested<1||requested>checked.risk.lots)rowErrors.push('审定手数须为不超过核算上限的正整数');
   const finalRisk={...checked.risk,lots:requested,plannedLoss:requested*checked.risk.riskPerLot};
   errors.push(...rowErrors.map(e=>`${account.alias}：${e}`));
   rows.push({accountId:account.id,alias:account.alias,revision:account.revision,equity:account.equity,cardId:target.id,roundId:target.roundId,
    previousPlanId:target.plan?.id||null,previousVersion:target.activePlanVersion,payload,risk:finalRisk,maximumLots:checked.risk.lots,initialBudget:checked.initialBudget,errors:rowErrors});
  }
  if(Date.parse(input.validUntil)<=Date.now())errors.push('首次适用交易日的有效窗口已过');
  if(input.tradingDay<=c.analysis.dataDate)errors.push('本次使用完成日K，首次适用交易日须晚于数据日；不得回填过去的成交');
  return {rows,errors:[...new Set(errors)],permission};
 }
 async function analyze(cardId){const c=await context(cardId);return append(cardId,'analysis',{analysis:c.analysis,evidenceHash:c.evidenceHash})}
 async function choose(cardId,input){
  if(input.confirmed!==true)throw Error('须由本人确认采用手法');
  const previous=read(input.analysisId,cardId,'analysis'),c=await context(cardId);fresh(previous,c);
  if(latest(cardId,['analysis'])!==previous.id)throw Error('已有新版分析，请使用最新版本');
  const choice={...input.choice,direction:c.card.direction},derived=deriveMethod(c.analysis,choice);
  return append(cardId,'method',{analysisId:previous.id,evidenceHash:c.evidenceHash,derived,reason:String(input.reason||''),accounts:listAccounts().filter(a=>a.status==='active').map(a=>({id:a.id,alias:a.alias,equity:a.equity,revision:a.revision,tier:a.tier,mode:a.mode}))},previous.id);
 }
 async function review(cardId,input){
  const method=read(input.methodId,cardId,'method'),c=await context(cardId);fresh(method,c);
  if(latest(cardId,['analysis','method'])!==method.id)throw Error('手法或分析已有新版，请重新确认');
  const checked=accountRows(c,method,input.plan),rules=await registry();
  const errors=[...checked.errors];if(rules.sourceChanged)errors.push('旧轮次框架已锁定；完成旧轮次后才能启用本次新规则');
  if(rules.files.some(f=>!f.available))errors.push('本轮规则来源不完整');
  const payload={methodId:method.id,evidenceHash:c.evidenceHash,ruleHash:rules.combinedHash,input:input.plan,...checked,errors};
  payload.confirmationHash=hash(payload);
  return append(cardId,'review',payload,method.id);
 }
 async function approve(cardId,input){
  if(input.confirmed!==true)throw Error('须由本人最终拍板');
  const previous=read(input.reviewId,cardId,'review');
  if(input.confirmationHash!==previous.confirmationHash)throw Error('审定摘要不一致，请重新核对');
  const already=db().prepare("SELECT payload_json FROM gold_steps WHERE parent_id=? AND stage='approved'").get(previous.id);
  if(already)return JSON.parse(already.payload_json);
  if(latest(cardId,['analysis','method','review'])!==previous.id)throw Error('已有新版手法或审定，旧摘要不能拍板');
  const method=read(previous.methodId,cardId,'method'),c=await context(cardId);fresh(previous,c);
  const rules=await registry(),snapshot=await runSnapshot();
  if(rules.sourceChanged||rules.combinedHash!==previous.ruleHash||snapshot.combinedHash!==previous.ruleHash)throw Error('锁定规则已变，请重新核对，不能沿用旧批准');
  if(previous.errors.length)throw Error('审定缺口未解决：'+previous.errors.join('；'));
  db().exec('BEGIN IMMEDIATE');
  try{
   // Recompute every balance, reservation and target version inside one write transaction.
   const checked=accountRows(c,method,previous.input);
   if(latest(cardId,['analysis','method','review'])!==previous.id)throw Error('审定已被新版本替代');
   if(hash(getCard(cardId))!==hash(c.card))throw Error('交易卡已变化，请重新审定');
   if(checked.errors.length||hash(checked.rows)!==hash(previous.rows))throw Error('账户余额、风险占用、手数或计划版本已变化，请重新审定');
   const run=activeRun(db())||startRun(db(),snapshot),planIds=[];
   for(const row of checked.rows){
    const target=row.cardId?getCard(row.cardId):saveCard({...c.card,id:undefined,accountId:row.accountId,roundId:row.roundId,status:'观察',layers:c.env.layers});
    const version=(db().prepare('SELECT max(version) AS v FROM plan_versions WHERE card_id=?').get(target.id).v||0)+1,id=randomUUID(),stamp=now();
    const payload={...row.payload,systemRunId:run.id,goldReviewId:previous.id};
    db().prepare("UPDATE plan_versions SET status='已失效' WHERE card_id=? AND status='已批准'").run(target.id);
    db().prepare('INSERT INTO plan_versions VALUES(?,?,?,?,?,?,?,?,?)').run(id,target.id,version,JSON.stringify(payload),JSON.stringify(row.risk),'已批准',rules.combinedHash,stamp,stamp);
    db().prepare("UPDATE cards SET active_plan_version=?,status='已批准',layers_json=?,updated_at=? WHERE id=?").run(version,JSON.stringify(c.env.layers),stamp,target.id);
    db().prepare('INSERT OR IGNORE INTO round_budgets VALUES(?,?,?,?)').run(row.accountId,target.roundId,row.initialBudget,stamp);bindRunCard(db(),target.id);
    journal(db(),method.derived.method==='intraday'?'独立分时人工批准':'四法人工批准',{planId:id,version,goldReviewId:previous.id,payload,risk:row.risk,permission:false},target.id);planIds.push({cardId:target.id,planId:id,version,accountId:row.accountId});
   }
   const result=append(cardId,'approved',{reviewId:previous.id,planIds,notice:'已记录本人拍板，未发送交易指令'},previous.id);
   db().exec('COMMIT');return result;
  }catch(error){db().exec('ROLLBACK');throw error}
 }
 function history(cardId){return db().prepare('SELECT * FROM gold_steps WHERE card_id=? ORDER BY rowid DESC LIMIT 40').all(cardId).map(r=>({id:r.id,stage:r.stage,createdAt:r.created_at,...JSON.parse(r.payload_json)}))}
 return {analyze,choose,review,approve,history};
}
