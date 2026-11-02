import {tradeSummary} from './trade-ledger.mjs';

const TIERS={conservative:{round:.005,pool:.025},normal:{round:.01,pool:.05},aggressive:{round:.02,pool:.06}};
export function reservationSchema(db){db.exec(`CREATE TABLE IF NOT EXISTS round_budgets(account_id TEXT NOT NULL,round_id TEXT NOT NULL,budget REAL NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(account_id,round_id));
 CREATE TABLE IF NOT EXISTS released_reservations(plan_id TEXT PRIMARY KEY,reason TEXT NOT NULL,created_at TEXT NOT NULL);`)}
export function reservationReleased(db,id){return !!id&&!!db.prepare('SELECT plan_id FROM released_reservations WHERE plan_id=?').get(id)}
export function planOpenedLots(db,planId){
 if(!planId)return 0;
 return db.prepare("SELECT COALESCE(SUM(quantity),0) AS lots FROM executions WHERE json_extract(payload_json,'$.planId')=? AND json_extract(payload_json,'$.kind')='open'").get(planId).lots;
}
// Known local exposure only. Missing broker positions and cross-product correlation remain explicit gaps.
export function constrainApproval(db,card,account,risk,cards){
 const errors=[],tier=TIERS[account?.tier],base=account?.equity;
 if(!tier||account?.stopped)errors.push('账户停机或档位未知');
 if(!(base>0))errors.push('真实账户金额待核对');
 if(card.plan.payload.validUntil){const date=String(card.plan.payload.validUntil),end=Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(date)?date+'T23:59:59+08:00':date);if(!Number.isFinite(end)||end<Date.now())errors.push('计划有效期已过或格式无效')}
 const cycles=card.plan.payload.goldRuleVersion?{week:.01,day:.01,small:.005}:{week:.02,day:.01,small:.005};
 const cap=Math.min(tier?.round||0,(cycles[card.plan.payload.mainCycle]||0),risk.environment?.cap||0);
 if(!(cap>0)||risk.finalPct>cap)errors.push('超过当前账户、周期或环境权限');
 const first=db.prepare('SELECT budget FROM round_budgets WHERE account_id=? AND round_id=?').get(card.accountId,card.roundId);
 const initial=first?.budget??Math.min(risk.frozenBudget||0,base*cap);
 if(!first&&risk.frozenBudget>base*cap+.00001)errors.push('冻结预算超过当前权限上限');
 const budget=Math.min(initial,base*cap);
 let poolUsed=0,correlationUsed=0,roundUsed=0;
 for(const c of cards.filter(c=>c.accountId===card.accountId)){
  const t=tradeSummary(db,c),p=c.plan;
  if(t.requiresReconciliation){errors.push(`${c.name} 历史成交待对账，风险占用未知`);continue}
  let used=0;
  if(t.remainingLots>0){
   const multiplier=p?.payload?.multiplier;
   if(!(multiplier>0)||!(t.stop>0)||!(t.averageEntry>0))errors.push(`${c.name} 持仓保护或点值未知`);
   else used=t.remainingLots*Math.max(0,t.direction==='long'?t.averageEntry-t.stop:t.stop-t.averageEntry)*multiplier;
  }
  if(c.id!==card.id&&p?.approvedAt&&c.status!=='已结束'&&!reservationReleased(db,p.id)){
   used+=Math.max(0,(p.risk.lots||0)-planOpenedLots(db,p.id))*(p.risk.riskPerLot||0);
  }
  poolUsed+=used;
  if(c.symbol===card.symbol)correlationUsed+=used;
  if(c.roundId===card.roundId)roundUsed+=used;
 }
 const losses=db.prepare("SELECT amount,execution_id FROM account_entries WHERE account_id=? AND card_id IN (SELECT id FROM cards WHERE account_id=? AND round_id=?) AND kind IN ('平仓盈亏','盈亏更正')").all(card.accountId,card.accountId,card.roundId);
 const byExecution=new Map();for(const x of losses)byExecution.set(x.execution_id,(byExecution.get(x.execution_id)||0)+x.amount);
 roundUsed+=[...byExecution.values()].reduce((n,x)=>n+Math.max(0,-x),0);
 const remaining=Math.max(0,budget-roundUsed),poolRemaining=Math.max(0,base*(tier?.pool||0)-poolUsed),correlationRemaining=Math.max(0,base*(tier?.round||0)-correlationUsed);
 const lots=risk.riskPerLot>0?Math.min(risk.lots??0,Math.floor(Math.min(remaining,poolRemaining,correlationRemaining)/risk.riskPerLot)):0;
 if(!(lots>0))errors.push('累计风险约束后不足一手');
 return{errors:[...new Set(errors)],initialBudget:initial,risk:{...risk,lots,plannedLoss:lots*risk.riskPerLot,frozenBudget:budget,roundUsed,remainingBudget:remaining,poolRemaining,correlationRemaining,
  reviewScope:'本机已登记数据复核，不等于券商账户完整风险核验',unverified:['未接入券商持仓与委托','跨品种相关风险单元待核验','保证金及流动性未自动核验'],permission:false}};
}
