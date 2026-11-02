import {randomUUID} from 'node:crypto';
import Decimal from '../dist/vendor/decimal/decimal.js';
import {journal,invalidateAccountPlans} from './trade-ledger.mjs';

const D=Decimal.clone({precision:40});
export const beijingNow=()=>new Date(Date.now()+8*3600000).toISOString().replace('Z','+08:00');
export function money(value){if(typeof value!=='number'||!Number.isFinite(value)||Math.abs(value)>1e13)throw Error('金额无效');return new D(value).toDecimalPlaces(2).toNumber()}
const plus=(a,b)=>new D(a).plus(b).toDecimalPlaces(2).toNumber();
const direction=n=>n>0?'盈利':n<0?'亏损':'无变化';
const active="status IN ('有效','已修正')";
const ledgerPosition=(db,id)=>db.prepare('SELECT COALESCE(MAX(rowid),0) AS n FROM account_entries WHERE account_id=?').get(id).n;
const row=(db,id)=>db.prepare('SELECT rowid,* FROM balance_changes WHERE id=?').get(id);

export function balanceSchema(db){
 db.exec(`CREATE TABLE IF NOT EXISTS balance_changes(
 id TEXT PRIMARY KEY,account_id TEXT NOT NULL,before_balance REAL,after_balance REAL NOT NULL,amount REAL NOT NULL,
 direction TEXT NOT NULL,source_page TEXT NOT NULL,note TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT '有效',
 effective_at TEXT NOT NULL,correction_of TEXT,void_reason TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,
 FOREIGN KEY(account_id) REFERENCES accounts(id));
 CREATE TABLE IF NOT EXISTS balance_baselines(account_id TEXT PRIMARY KEY,balance REAL,trade_seq INTEGER NOT NULL,FOREIGN KEY(account_id) REFERENCES accounts(id));
 CREATE TABLE IF NOT EXISTS balance_audit(id TEXT PRIMARY KEY,account_id TEXT NOT NULL,change_id TEXT NOT NULL,action TEXT NOT NULL,before_json TEXT,after_json TEXT,created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS account_deletions(id TEXT PRIMARY KEY,account_id TEXT NOT NULL,snapshot_json TEXT NOT NULL,created_at TEXT NOT NULL);`);
 const columns=new Set(db.prepare('PRAGMA table_info(balance_changes)').all().map(c=>c.name));
 for(const [name,type] of [['trade_seq','INTEGER'],['position','INTEGER'],['request_id','TEXT']])if(!columns.has(name))db.exec(`ALTER TABLE balance_changes ADD COLUMN ${name} ${type}`);
 db.exec('CREATE UNIQUE INDEX IF NOT EXISTS balance_request ON balance_changes(account_id,request_id) WHERE request_id IS NOT NULL');
 for(const account of db.prepare('SELECT * FROM accounts').all()){
  if(db.prepare('SELECT account_id FROM balance_baselines WHERE account_id=?').get(account.id))continue;
  // One-time import. Original ledger and balance observations remain unchanged.
  for(const entry of db.prepare("SELECT rowid,* FROM account_entries WHERE account_id=? AND kind IN ('接入余额','账户对账','初始金额') ORDER BY rowid").all(account.id)){
   const id='legacy-'+entry.id;
   const duplicate=db.prepare('SELECT id FROM balance_changes WHERE account_id=? AND before_balance IS ? AND after_balance=? AND ABS(julianday(effective_at)-julianday(?))<0.000001').get(account.id,entry.balance_before,entry.balance_after,entry.effective_at);
   if(!row(db,id)&&!duplicate)db.prepare('INSERT INTO balance_changes(id,account_id,before_balance,after_balance,amount,direction,source_page,note,status,effective_at,created_at,updated_at,trade_seq) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,account.id,entry.balance_before,entry.balance_after,entry.amount,direction(entry.amount),'历史资金流水',JSON.parse(entry.payload_json||'{}').note||entry.kind,'有效',entry.effective_at,entry.created_at,entry.created_at,entry.rowid);
  }
  const history=db.prepare('SELECT rowid,* FROM balance_changes WHERE account_id=? ORDER BY julianday(effective_at),rowid').all(account.id);
  history.forEach((change,i)=>{const seq=change.trade_seq??db.prepare('SELECT COALESCE(MAX(rowid),0) AS n FROM account_entries WHERE account_id=? AND julianday(created_at)<=julianday(?)').get(account.id,change.created_at).n;db.prepare('UPDATE balance_changes SET trade_seq=?,position=? WHERE id=?').run(seq,i+1,change.id)});
  db.prepare('INSERT INTO balance_baselines VALUES(?,?,?)').run(account.id,history.length?history[0].before_balance:account.equity,history.length?row(db,history[0].id).trade_seq??0:ledgerPosition(db,account.id));
 }
}
function mapped(r){return{id:r.id,accountId:r.account_id,beforeBalance:r.before_balance,afterBalance:r.after_balance,amount:r.before_balance===null?null:r.amount,direction:r.before_balance===null?'初始登记':r.direction,sourcePage:r.source_page,note:r.note,status:r.status,effectiveAt:r.effective_at,correctionOf:r.correction_of,voidReason:r.void_reason,createdAt:r.created_at,updatedAt:r.updated_at,position:r.position}}
export function balanceChanges(db,id){return db.prepare('SELECT * FROM balance_changes WHERE account_id=? ORDER BY position DESC,rowid DESC').all(id).map(mapped)}
export function balanceInfo(db,account){
 const latest=db.prepare(`SELECT effective_at FROM balance_changes WHERE account_id=? AND ${active} ORDER BY position DESC,rowid DESC LIMIT 1`).get(account.id);
 const pnl=account.equity===null||account.initial_capital===null?null:plus(account.equity,-account.initial_capital);
 const month=beijingNow().slice(0,7),base=db.prepare('SELECT * FROM balance_baselines WHERE account_id=?').get(account.id);
 let monthly=0,previous=base?.balance??null,seq=base?.trade_seq??0;
 const trades=db.prepare("SELECT rowid,amount FROM account_entries WHERE account_id=? AND kind IN ('平仓盈亏','盈亏更正') ORDER BY rowid").all(account.id);
 // Recompute effective manual deltas after correction/void without rewriting historical observations.
 for(const c of db.prepare(`SELECT * FROM balance_changes WHERE account_id=? AND ${active} ORDER BY position,rowid`).all(account.id)){
  if(previous!==null)for(const trade of trades)if(trade.rowid>seq&&trade.rowid<=c.trade_seq)previous=plus(previous,trade.amount);
  if(previous!==null&&new Date(Date.parse(c.effective_at)+8*3600000).toISOString().startsWith(month))monthly=plus(monthly,plus(c.after_balance,-previous));
  previous=c.after_balance;seq=c.trade_seq;
 }
 return{initialCapital:account.initial_capital,currentBalance:account.equity,cumulativePnl:pnl,pnlPct:pnl===null||!account.initial_capital?null:pnl/account.initial_capital,lastSyncAt:latest?.effective_at||null,monthlyBalanceChange:monthly};
}
export function recordBalanceSync(db,id,value,{sourcePage='账户管理',note='',requestId}={}){
 const account=db.prepare('SELECT * FROM accounts WHERE id=?').get(id);if(!account)throw Error('账户不存在');
 const after=money(value);if(after<0)throw Error('实际余额不能小于0');
 if(requestId){const old=db.prepare('SELECT * FROM balance_changes WHERE account_id=? AND request_id=?').get(id,requestId);if(old){if(old.after_balance!==after||old.source_page!==sourcePage||old.note!==note)throw Error('同步标识已使用，请刷新后重试');return mapped(old)}}
 if(!db.prepare('SELECT account_id FROM balance_baselines WHERE account_id=?').get(id))db.prepare('INSERT INTO balance_baselines VALUES(?,?,?)').run(id,account.equity,ledgerPosition(db,id));
 const before=account.equity,delta=before===null?0:plus(after,-before),stamp=beijingNow(),key=randomUUID();
 const position=db.prepare('SELECT COALESCE(MAX(position),0)+1 AS n FROM balance_changes WHERE account_id=?').get(id).n;
 db.prepare('INSERT INTO balance_changes(id,account_id,before_balance,after_balance,amount,direction,source_page,note,status,effective_at,created_at,updated_at,trade_seq,position,request_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(key,id,before,after,delta,direction(delta),String(sourcePage),String(note),'有效',stamp,stamp,stamp,ledgerPosition(db,id),position,requestId||null);
 db.prepare('UPDATE accounts SET equity=?,updated_at=? WHERE id=?').run(after,stamp,id);
 if(before!==after)invalidateAccountPlans(db,id);
 const change=mapped(row(db,key));journal(db,'余额同步',{accountId:id,change});return change;
}
function projectedBalance(db,id){
 const anchor=db.prepare(`SELECT * FROM balance_changes WHERE account_id=? AND ${active} ORDER BY position DESC,rowid DESC LIMIT 1`).get(id);
 const base=db.prepare('SELECT * FROM balance_baselines WHERE account_id=?').get(id);
 let balance=anchor?anchor.after_balance:base?.balance??null;
 if(balance===null)return null;
 // Manual balances are absolute observations; only subsequently booked trade P&L is added.
 for(const e of db.prepare("SELECT amount FROM account_entries WHERE account_id=? AND rowid>? AND kind IN ('平仓盈亏','盈亏更正') ORDER BY rowid").all(id,anchor?.trade_seq??base.trade_seq))balance=plus(balance,e.amount);
 return balance;
}
export function editBalance(db,accountId,changeId,input){
 const before=row(db,changeId);if(!before||before.account_id!==accountId)throw Error('余额记录不属于当前账户');
 if(input.updatedAt&&input.updatedAt!==before.updated_at)throw Error('记录已更新，请刷新后再修改');
 const action=input.action||'correct';if(!['correct','note','void'].includes(action))throw Error('余额操作无效');
 if(before.status==='已作废'&&action!=='note')throw Error('记录已作废');
 const stamp=beijingNow();
 if(action==='void'){if(!input.confirmed||!String(input.reason||'').trim())throw Error('请确认作废并填写原因');db.prepare("UPDATE balance_changes SET status='已作废',void_reason=?,updated_at=? WHERE id=?").run(input.reason,stamp,changeId)}
 else if(action==='note')db.prepare('UPDATE balance_changes SET note=?,updated_at=? WHERE id=?').run(String(input.note||''),stamp,changeId);
 else{const after=money(input.balance);if(after<0)throw Error('实际余额不能小于0');const delta=before.before_balance===null?0:plus(after,-before.before_balance);db.prepare("UPDATE balance_changes SET after_balance=?,amount=?,direction=?,note=?,status='已修正',updated_at=? WHERE id=?").run(after,delta,direction(delta),String(input.note??before.note),stamp,changeId)}
 const after=row(db,changeId);
 db.prepare('INSERT INTO balance_audit VALUES(?,?,?,?,?,?,?)').run(randomUUID(),accountId,changeId,action,JSON.stringify(before),JSON.stringify(after),stamp);
 if(action!=='note'){
  const balance=projectedBalance(db,accountId),current=db.prepare('SELECT equity FROM accounts WHERE id=?').get(accountId).equity;
  db.prepare('UPDATE accounts SET equity=?,updated_at=? WHERE id=?').run(balance,stamp,accountId);
  if(current!==balance)invalidateAccountPlans(db,accountId);
 }
 journal(db,'余额记录'+({correct:'修正',note:'备注修改',void:'作废'})[action],{accountId,changeId,sourcePage:input.sourcePage||'账户管理',before:mapped(before),after:mapped(after)});
 return mapped(after);
}
