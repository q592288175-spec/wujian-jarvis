import {randomUUID,createHash} from 'node:crypto';
import Decimal from '../dist/vendor/decimal/decimal.js';
const D=Decimal.clone({precision:40});
const stamp=()=>new Date(Date.now()+8*3600000).toISOString().replace('Z','+08:00');
const parse=value=>JSON.parse(value||'{}');
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const money=value=>{if(!finite(value)||Math.abs(value)>1e13)throw Error('金额无效');return new D(value).toDecimalPlaces(2).toNumber()};
const plus=(a,b)=>new D(a).plus(b).toDecimalPlaces(2).toNumber();

export function ledgerSchema(db){
 db.exec(`CREATE TABLE IF NOT EXISTS account_entries(
 id TEXT PRIMARY KEY,account_id TEXT NOT NULL,card_id TEXT,execution_id TEXT,kind TEXT NOT NULL,
 amount REAL NOT NULL,balance_before REAL,balance_after REAL NOT NULL,effective_at TEXT NOT NULL,
 payload_json TEXT NOT NULL,created_at TEXT NOT NULL,FOREIGN KEY(account_id) REFERENCES accounts(id));
 CREATE TABLE IF NOT EXISTS operation_events(
 sequence INTEGER PRIMARY KEY AUTOINCREMENT,card_id TEXT,action TEXT NOT NULL,payload_json TEXT NOT NULL,created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS workbench_drafts(
 card_id TEXT NOT NULL,kind TEXT NOT NULL,payload_json TEXT NOT NULL,updated_at TEXT NOT NULL,
 PRIMARY KEY(card_id,kind),FOREIGN KEY(card_id) REFERENCES cards(id) ON DELETE CASCADE);`);
 for(const a of db.prepare('SELECT * FROM accounts WHERE equity IS NOT NULL').all()){
  if(!db.prepare('SELECT id FROM account_entries WHERE account_id=? LIMIT 1').get(a.id)&&!(db.prepare("SELECT name FROM sqlite_master WHERE name='balance_changes'").get()&&db.prepare('SELECT id FROM balance_changes WHERE account_id=? LIMIT 1').get(a.id)))
   db.prepare('INSERT INTO account_entries VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(randomUUID(),a.id,null,null,'接入余额',a.equity,null,a.equity,stamp(),JSON.stringify({note:'启用流水时的已有余额，不重建此前盈亏'}),stamp());
 }
}

export function journal(db,action,payload,cardId=null){
 db.prepare('INSERT INTO operation_events(card_id,action,payload_json,created_at) VALUES(?,?,?,?)').run(cardId,action,JSON.stringify(payload),stamp());
}
export function accountEntries(db,accountId){
 return db.prepare('SELECT * FROM account_entries WHERE account_id=? ORDER BY rowid').all(accountId).map(r=>({id:r.id,accountId:r.account_id,cardId:r.card_id,executionId:r.execution_id,kind:r.kind,amount:r.amount,balanceBefore:r.balance_before,balanceAfter:r.balance_after,effectiveAt:r.effective_at,payload:parse(r.payload_json),createdAt:r.created_at}));
}
export function noteAccountChange(db,previous,next){journal(db,'账户快照',{before:previous||null,after:next})}
export function invalidateAccountPlans(db,accountId){
 db.prepare("UPDATE plan_versions SET status='已失效' WHERE status='已批准' AND card_id IN (SELECT id FROM cards WHERE account_id=?)").run(accountId);
 db.prepare("UPDATE cards SET status='待触发' WHERE account_id=? AND status='已批准'").run(accountId);
}
export function executionRows(db,cardId){
 return db.prepare('SELECT * FROM executions WHERE card_id=? ORDER BY time,rowid').all(cardId).map(r=>({id:r.id,externalId:r.external_id,time:r.time,status:r.status,action:r.action,price:r.price,quantity:r.quantity,stopStatus:r.stop_status,payload:parse(r.payload_json),createdAt:r.created_at}));
}
export function tradeSummary(db,card){
 const executions=executionRows(db,card.id);
 let quantity=0,average=new D(0),opened=0,closed=0,stop=null,stopSince=null,lastTime=null,direction=card.plan?.payload?.direction||card.direction,unknown=false,openedAt=null;
 for(const x of executions){
  const p=x.payload;
  if(p.recordMode==='reconciliation-v1'){
   quantity=x.quantity;average=new D(x.price||0);direction=p.direction;stop=p.stop;stopSince=x.time;lastTime=x.time;unknown=false;
   continue;
  }
  if(p.recordMode!=='trade-v1'){lastTime=x.time;if(['部分成交','全部成交','已平仓'].includes(x.status))unknown=true;continue}
  lastTime=x.time;
  direction=p.direction;
  if(p.kind==='open'){
   average=average.mul(quantity).plus(new D(x.price).mul(x.quantity)).div(quantity+x.quantity);
   quantity+=x.quantity;opened+=x.quantity;openedAt=openedAt||x.time;
  }
  if(p.kind==='close'){quantity-=x.quantity;closed+=x.quantity;if(!quantity)average=new D(0)}
  if(p.kind==='open'||p.stop!==null&&p.stop!==undefined){stop=p.stop??null;stopSince=x.time}
 }
 const entries=card.accountId?accountEntries(db,card.accountId).filter(e=>e.cardId===card.id):[];
 const pnl=entries.filter(e=>['平仓盈亏','盈亏更正'].includes(e.kind));
 const realized=pnl.length?pnl.reduce((n,e)=>plus(n,e.amount),0):null;
 return {direction,openAction:direction==='long'?'开多':direction==='short'?'开空':'方向未知',
  openedLots:opened,closedLots:closed,remainingLots:unknown?null:quantity,averageEntry:quantity?average.toNumber():null,
  stop,stopSince,lastTime,openedAt,realizedPnl:realized,outcome:realized===null?'尚未结算':realized>0?'盈利':realized<0?'亏损':'保本',
  balanceBefore:pnl[0]?.balanceBefore??null,balanceAfter:pnl.at(-1)?.balanceAfter??null,
  ledger:entries,requiresReconciliation:unknown};
}
function normalizedTime(value){
 let time=String(value||'').trim();
 if(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(time))time+='+08:00';
 if(!/(Z|[+-]\d{2}:\d{2})$/.test(time)||!Number.isFinite(Date.parse(time)))throw Error('请填写实际成交日期和时间');
 return new Date(time).toISOString();
}
function canonical(input){
 if(!['open','close','protection'].includes(input.kind))throw Error('记录类型无效');
 const p={kind:input.kind,time:normalizedTime(input.time),notes:String(input.notes||'').trim(),reason:input.kind==='close'?String(input.reason||''):null,
  actualDirection:input.actualDirection||null,price:input.kind==='protection'?null:input.price,quantity:input.kind==='protection'?null:input.quantity,
  netPnl:input.kind==='close'?money(input.netPnl):null,stop:input.kind==='close'?null:input.stop};
 if(p.kind!=='protection'&&(!(finite(p.price)&&p.price>0)||!Number.isSafeInteger(p.quantity)||p.quantity<=0))throw Error('请填写实际成交均价和正整数手数');
 if(p.kind==='protection'&&!(finite(p.stop)&&p.stop>0))throw Error('请填写实际止损保护价');
 if(p.kind==='open'&&p.stop!=null&&!(finite(p.stop)&&p.stop>0))throw Error('止损保护价无效；尚未设置可留空');
 if(p.actualDirection&&!['long','short'].includes(p.actualDirection))throw Error('实际方向无效');
 if(p.kind==='close'&&!['止损','止盈','主动退出'].includes(p.reason))throw Error('请选择退出原因');
 return p;
}
export function postTrade(db,card,input){
 const p=canonical(input),requestId=String(input.requestId||'');
 if(!/^[\w-]{8,100}$/.test(requestId))throw Error('记录标识无效，请重新打开表单');
 const hash=createHash('sha256').update(JSON.stringify(p)).digest('hex');
 const prior=db.prepare('SELECT payload_json FROM executions WHERE card_id=? AND external_id=?').get(card.id,requestId);
 if(prior){if(parse(prior.payload_json).requestHash!==hash)throw Error('此记录已提交，请刷新后新增记录或更正盈亏');return{duplicate:true};}
 const summary=tradeSummary(db,card),account=db.prepare('SELECT * FROM accounts WHERE id=?').get(card.accountId||'');
 if(!account)throw Error('交易卡未绑定账户');
 const direction=p.kind==='open'?(p.actualDirection||summary.direction):summary.direction;
 if(!['long','short'].includes(direction))throw Error('冻结计划的方向未知，请先核对计划');
 const anomalies=[];
 if(summary.requiresReconciliation)anomalies.push('持仓尚未对账，本次实际记录已保存，剩余持仓仍待核对');
 if(p.kind==='open'){
  if(!card.plan?.approvedAt||card.plan.status!=='已批准')anomalies.push('实际开仓时未核实当前有效批准');
  if(card.plan?.approvedAt&&!card.plan.payload?.systemRunId)anomalies.push('历史批准未绑定本轮框架，当前新增风险权限待核验');
  if(account.stopped)anomalies.push('停机账户发生开仓');
  const expiry=card.plan?.payload?.validUntil;
  if(expiry&&Date.parse(p.time)>Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(expiry)?expiry+'T23:59:59+08:00':expiry))anomalies.push('成交时间超过计划有效期');
  if(direction!==(card.plan?.payload?.direction||card.direction))anomalies.push('实际方向与计划不一致');
  const openedForPlan=card.plan?.id?db.prepare("SELECT COALESCE(SUM(quantity),0) AS lots FROM executions WHERE card_id=? AND json_extract(payload_json,'$.planId')=? AND json_extract(payload_json,'$.kind')='open'").get(card.id,card.plan.id).lots:0;
  if(!(card.plan?.risk?.lots>=openedForPlan+p.quantity))anomalies.push('累计开仓超过已核定手数或手数未核定');
  if(card.plan?.payload?.systemRunId){
   const run=db.prepare('SELECT status FROM system_runs WHERE id=?').get(card.plan.payload.systemRunId);
   if(run?.status!=='运行中')anomalies.push('计划所属系统运行已结束');
  }
  if(card.plan?.approvedAt&&Date.parse(p.time)<Date.parse(card.plan.approvedAt))anomalies.push('实际成交早于计划批准时间，需核对原始批准依据');
  if(!p.stop)anomalies.push('实际止损保护未设置');
 }
 const directionConflict=p.kind==='open'&&summary.remainingLots>0&&direction!==summary.direction;
 if(directionConflict)anomalies.push('同卡反向持仓，需对账后拆分持仓，不自动合并均价');
 if(!summary.requiresReconciliation&&p.kind!=='open'&&!(summary.remainingLots>0))throw Error('没有已记录的持仓');
 if(!summary.requiresReconciliation&&p.kind==='close'&&p.quantity>summary.remainingLots)throw Error('平仓手数超过剩余持仓');
 if(summary.lastTime&&Date.parse(p.time)<Date.parse(summary.lastTime))throw Error('请按实际时间顺序记录成交');
 if(p.kind==='close'&&account.equity===null)throw Error('实际账户金额未知，请先填写账户金额');
 const id=randomUUID(),createdAt=stamp(),action=p.kind==='open'?(direction==='long'?'开多':'开空'):p.kind==='close'?(direction==='long'?'平多':'平空'):'调整保护';
 const remaining=summary.remainingLots+(p.kind==='open'?p.quantity:p.kind==='close'?-p.quantity:0);
 const status=p.kind==='close'&&remaining===0?'已平仓':p.kind==='protection'?'已接受':'全部成交';
 const payload={...p,recordMode:directionConflict||summary.requiresReconciliation?'trade-exception':'trade-v1',anomalies,requestHash:hash,direction,accountId:card.accountId,roundId:card.roundId,
  planId:card.plan?.id,planVersion:card.activePlanVersion,contract:card.contract};
 db.exec('SAVEPOINT trade_post');
 try{
  db.prepare('INSERT INTO executions VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(id,card.id,requestId,p.time,status,action,p.price,p.quantity,p.notes,JSON.stringify(payload),createdAt);
  if(p.kind==='close'){
   const before=money(account.equity),after=plus(before,p.netPnl);
   db.prepare('INSERT INTO account_entries VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(randomUUID(),card.accountId,card.id,id,'平仓盈亏',p.netPnl,before,after,p.time,JSON.stringify({netPnl:p.netPnl,reason:p.reason,costsIncluded:true}),createdAt);
   db.prepare('UPDATE accounts SET equity=?,realized_profit=?,updated_at=? WHERE id=?').run(after,plus(account.realized_profit,p.netPnl),createdAt,card.accountId);
   invalidateAccountPlans(db,card.accountId);
  }
  db.prepare('UPDATE cards SET status=?,updated_at=? WHERE id=?').run(directionConflict||summary.requiresReconciliation?'持仓中':remaining?'持仓中':'已结束',createdAt,card.id);
  db.prepare("DELETE FROM workbench_drafts WHERE card_id=? AND kind='execution'").run(card.id);
  journal(db,action,{id,externalId:requestId,...payload,price:p.price,quantity:p.quantity},card.id);
  db.exec('RELEASE trade_post');
 }catch(error){db.exec('ROLLBACK TO trade_post; RELEASE trade_post');throw error}
 return{duplicate:false,id,anomalies};
}
export function reconcilePosition(db,card,input){
 const time=normalizedTime(input.time),quantity=input.quantity,price=input.price,direction=input.direction,stop=input.stop??null,reason=String(input.reason||'').trim(),key=String(input.requestId||'');
 if(!/^[\w-]{8,100}$/.test(key)||!Number.isSafeInteger(quantity)||quantity<0||!['long','short'].includes(direction)||!reason)throw Error('请填写核对标识、当前持仓、方向和原始回报依据');
 if(quantity>0&&(!(finite(price)&&price>0)||stop!==null&&!(finite(stop)&&stop>0)))throw Error('持仓均价或保护价无效');
 const existing=db.prepare('SELECT id,payload_json FROM executions WHERE card_id=? AND external_id=?').get(card.id,key);
 if(existing){const old=parse(existing.payload_json);if(old.recordMode!=='reconciliation-v1'||old.time!==time||old.quantity!==quantity||old.price!==price||old.direction!==direction||old.stop!==stop||old.reason!==reason)throw Error('核对标识已经使用');return{duplicate:true}}
 const previous=tradeSummary(db,card);
 if(!previous.requiresReconciliation)throw Error('当前持仓可由流水计算，无需手工覆盖');
 if(previous.lastTime&&Date.parse(time)<Date.parse(previous.lastTime))throw Error('核对时间不能早于最后一条记录');
 const payload={recordMode:'reconciliation-v1',time,quantity,price,direction,stop,reason,previousSummary:previous,accountBalanceChanged:false};
 db.exec('SAVEPOINT reconcile_position');try{
  const id=randomUUID();db.prepare('INSERT INTO executions VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(id,card.id,key,time,'已接受','持仓对账',quantity?price:null,quantity,null,JSON.stringify(payload),stamp());
  db.prepare('UPDATE cards SET status=?,updated_at=? WHERE id=?').run(quantity?'持仓中':'已结束',stamp(),card.id);
  invalidateAccountPlans(db,card.accountId);
  journal(db,'持仓对账',{id,quantity,price,direction,stop,reason,accountBalanceChanged:false},card.id);
  db.exec('RELEASE reconcile_position');return{duplicate:false,id};
 }catch(e){db.exec('ROLLBACK TO reconcile_position; RELEASE reconcile_position');throw e}
}
export function correctPnl(db,card,input){
 const target=db.prepare('SELECT * FROM executions WHERE card_id=? AND id=?').get(card.id,String(input.executionId||''));
 if(!target||parse(target.payload_json).kind!=='close')throw Error('只能更正已记录平仓的实际净盈亏');
 const total=money(input.netPnl),reason=String(input.reason||'').trim(),key=String(input.requestId||'');
 if(!reason||!/^[\w-]{8,100}$/.test(key))throw Error('请填写更正原因');
 const old=db.prepare('SELECT * FROM account_entries WHERE id=?').get(key);
 if(old){if(old.execution_id!==target.id||parse(old.payload_json).correctedNetPnl!==total||parse(old.payload_json).reason!==reason)throw Error('更正请求已经使用');return{duplicate:true}}
 const account=db.prepare('SELECT * FROM accounts WHERE id=?').get(card.accountId);
 const existing=accountEntries(db,card.accountId).filter(e=>e.executionId===target.id).reduce((n,e)=>plus(n,e.amount),0);
 const delta=plus(total,-existing);
 if(account.equity===null)throw Error('账户金额未知');
 db.exec('SAVEPOINT pnl_correct');
 try{
  const after=plus(account.equity,delta),time=stamp();
  db.prepare('INSERT INTO account_entries VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(key,card.accountId,card.id,target.id,'盈亏更正',delta,account.equity,after,time,JSON.stringify({previousNetPnl:existing,correctedNetPnl:total,reason}),time);
  db.prepare('UPDATE accounts SET equity=?,realized_profit=?,updated_at=? WHERE id=?').run(after,plus(account.realized_profit,delta),time,card.accountId);
  invalidateAccountPlans(db,card.accountId);
  journal(db,'盈亏更正',{executionId:target.id,previousNetPnl:existing,correctedNetPnl:total,delta,reason},card.id);
  db.exec('RELEASE pnl_correct');
 }catch(error){db.exec('ROLLBACK TO pnl_correct; RELEASE pnl_correct');throw error}
 return{duplicate:false};
}
export function saveDraft(db,cardId,input){
 if(input.kind!=='execution')throw Error('草稿类型无效');
 const payload=input.payload&&typeof input.payload==='object'?input.payload:{};
 const done=db.prepare('SELECT id FROM executions WHERE card_id=? AND external_id=?').get(cardId,String(payload.requestId||''));
 if(done)return{saved:false,committed:true};
 db.prepare('INSERT INTO workbench_drafts VALUES(?,?,?,?) ON CONFLICT(card_id,kind) DO UPDATE SET payload_json=excluded.payload_json,updated_at=excluded.updated_at').run(cardId,'execution',JSON.stringify(payload),stamp());
 return{saved:true};
}
export function draftsFor(db,cardId){return Object.fromEntries(db.prepare('SELECT * FROM workbench_drafts WHERE card_id=?').all(cardId).map(r=>[r.kind,{payload:parse(r.payload_json),updatedAt:r.updated_at}]))}
