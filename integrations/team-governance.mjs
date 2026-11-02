import {randomUUID} from 'node:crypto';
import {journal,tradeSummary} from './trade-ledger.mjs';

const parse=s=>JSON.parse(s||'{}');
const now=()=>new Date().toISOString();
export const RESPONSIBILITIES={fire:'火：按锁定规则识别机会，不授予交易许可',water:'水：研究证据和反证，不改变观察池与交易规则',metal:'金：在授权内冻结、复核计划，不临时放宽边界',earth:'土：执行并如实记录成交、保护和盈亏',wood:'木：全程知情、协调、跟踪异常；职责内正常推进不额外审批'};
export function governanceSchema(db){
 db.exec(`CREATE TABLE IF NOT EXISTS system_runs(id TEXT PRIMARY KEY,status TEXT NOT NULL,snapshot_json TEXT NOT NULL,started_at TEXT NOT NULL,ended_at TEXT,result TEXT);
 CREATE UNIQUE INDEX IF NOT EXISTS one_active_system_run ON system_runs(status) WHERE status='运行中';
 CREATE TABLE IF NOT EXISTS run_cards(run_id TEXT NOT NULL,card_id TEXT NOT NULL,PRIMARY KEY(run_id,card_id));
 CREATE TABLE IF NOT EXISTS supervision_issues(id TEXT PRIMARY KEY,card_id TEXT,run_id TEXT,owner TEXT NOT NULL,description TEXT NOT NULL,next_action TEXT NOT NULL,status TEXT NOT NULL,resolution TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);`);
}
const runRow=r=>r?{id:r.id,status:r.status,snapshot:parse(r.snapshot_json),startedAt:r.started_at,endedAt:r.ended_at,result:r.result}:null;
export function activeRun(db){return runRow(db.prepare("SELECT * FROM system_runs WHERE status='运行中'").get())}
export function startRun(db,snapshot){
 const current=activeRun(db);if(current)return current;
 const id=randomUUID(),time=now();
 db.prepare('INSERT INTO system_runs VALUES(?,?,?,?,?,?)').run(id,'运行中',JSON.stringify({...snapshot,responsibilities:RESPONSIBILITIES}),time,null,null);
 journal(db,'启动系统运行',{runId:id,ruleHash:snapshot.combinedHash,responsibilities:RESPONSIBILITIES});
 return activeRun(db);
}
export function bindRunCard(db,cardId){const run=activeRun(db);if(run)db.prepare('INSERT OR IGNORE INTO run_cards VALUES(?,?)').run(run.id,cardId);return run}
export function finishRun(db,cards,result){
 const run=activeRun(db);if(!run)throw Error('当前没有运行中的系统轮次');
 if(!String(result||'').trim())throw Error('请填写本轮结果与结束说明');
 for(const card of cards){
  const t=tradeSummary(db,card);
  if(t.requiresReconciliation||t.remainingLots>0)throw Error(`${card.name} 仍有持仓或待核对成交，不能结束运行`);
  const pending=db.prepare("SELECT id FROM executions WHERE card_id=? AND status IN ('待提交','已接受','部分成交','撤单待确认','止损触发未成交') AND COALESCE(json_extract(payload_json,'$.recordMode'),'') NOT IN ('trade-v1','trade-exception','reconciliation-v1')").get(card.id);
  if(pending)throw Error(`${card.name} 仍有待确认委托，不能结束运行`);
  if(card.plan?.approvedAt&&!db.prepare('SELECT plan_id FROM released_reservations WHERE plan_id=?').get(card.plan.id)){
   const opened=db.prepare("SELECT COALESCE(SUM(quantity),0) AS lots FROM executions WHERE card_id=? AND json_extract(payload_json,'$.planId')=? AND json_extract(payload_json,'$.kind')='open'").get(card.id,card.plan.id).lots;
   if((card.plan.risk.lots||0)>opened)throw Error(`${card.name} 有未成交预留，请先核对撤单并释放预留`);
  }
  if(t.openedLots&&!db.prepare('SELECT id FROM reviews WHERE card_id=?').get(card.id))throw Error(`${card.name} 尚未留下交易复盘结果`);
 }
 if(db.prepare("SELECT id FROM supervision_issues WHERE status='待处理' AND (run_id=? OR run_id IS NULL)").get(run.id))throw Error('仍有待处理监督事项，请先核对处理结果');
 db.exec('SAVEPOINT finish_run');
 try{
  db.prepare("UPDATE system_runs SET status='已结束',ended_at=?,result=? WHERE id=?").run(now(),String(result).trim(),run.id);
  db.prepare("UPDATE plan_versions SET status='已失效' WHERE status='已批准'").run();
  db.prepare("UPDATE cards SET status='待触发' WHERE status='已批准'").run();
  journal(db,'结束系统运行',{runId:run.id,result:String(result).trim()});
  db.exec('RELEASE finish_run');
 }catch(e){db.exec('ROLLBACK TO finish_run; RELEASE finish_run');throw e}
 return runRow(db.prepare('SELECT * FROM system_runs WHERE id=?').get(run.id));
}
export function issues(db,cardId){return db.prepare('SELECT * FROM supervision_issues'+(cardId?' WHERE card_id=?':'')+' ORDER BY created_at DESC').all(...(cardId?[cardId]:[]))}
export function saveIssue(db,input){
 if(input.id){
  const old=db.prepare('SELECT * FROM supervision_issues WHERE id=?').get(input.id);if(!old)throw Error('监督事项不存在');
  if(!String(input.resolution||'').trim())throw Error('请填写实际处理结果');
  db.prepare("UPDATE supervision_issues SET status='已处理',resolution=?,updated_at=? WHERE id=?").run(input.resolution,now(),input.id);
  journal(db,'监督事项处理',{...old,resolution:input.resolution},old.card_id);return;
 }
 if(!Object.hasOwn(RESPONSIBILITIES,input.owner)||!String(input.description||'').trim()||!String(input.nextAction||'').trim())throw Error('请填写责任环节、问题和下一步');
 const run=activeRun(db),id=randomUUID(),time=now();
 db.prepare('INSERT INTO supervision_issues VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,input.cardId||null,run?.id||null,input.owner,input.description,input.nextAction,'待处理',null,time,time);
 journal(db,'登记监督事项',{id,...input,runId:run?.id||null},input.cardId||null);
}
export function governanceData(db){return{active:activeRun(db),history:db.prepare('SELECT * FROM system_runs ORDER BY started_at DESC').all().map(runRow),issues:issues(db),responsibilities:RESPONSIBILITIES,reviewMode:'本人自检，不等于独立复核'}}
