import {DatabaseSync} from 'node:sqlite';
import {createHash,randomUUID} from 'node:crypto';
import {readFile,readdir,stat,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {applyResonanceRule,RESONANCE_RULE_VERSION} from './resonance-rule.mjs';
import {sectorFor} from '../dist/sectors.js';
import {buildEnvironment,refreshEnvironmentIndex} from './environment.mjs';
import {simpleSizing,ENTRY_PAIRS} from './simple-sizing.mjs';
import {contractSpec,refreshContractSpecs} from './contract-specs.mjs';
import {ledgerSchema,journal,noteAccountChange,accountEntries,invalidateAccountPlans,postTrade,correctPnl,tradeSummary,draftsFor,saveDraft,reconcilePosition} from './trade-ledger.mjs';
import {balanceSchema,balanceInfo,balanceChanges,recordBalanceSync,editBalance,money,beijingNow} from './account-balances.mjs';
import {governanceSchema,activeRun,startRun,bindRunCard,finishRun,governanceData,saveIssue,issues} from './team-governance.mjs';
import {reservationSchema,constrainApproval,reservationReleased,planOpenedLots} from './approval-boundary.mjs';
import {refreshEod} from './eod-refresh.mjs';
import {createFireRefresh} from './fire-refresh.mjs';
import {createGoldPlanning} from './gold-planning.mjs';
import {goldPermission} from '../dist/gold-methods.js';

const run=promisify(execFile);
const ROOT=resolve('.');
const BUNDLE_ROOT=resolve(process.env.WUJIAN_BUNDLE_ROOT||resolve(ROOT,'../资料包'));
const LAB=resolve(process.env.WUJIAN_KNOWLEDGE_ROOT||resolve(BUNDLE_ROOT,'资料实验基地'));
const DB_PATH=resolve(process.env.WUJIAN_WORKBENCH_DB||'.runtime/five-workbench.sqlite');
const FIRE_RUNTIME=resolve('.runtime/fire-scan');
const FIRE_SKILL=resolve(process.env.WUJIAN_FIRE_SKILL_ROOT||resolve(BUNDLE_ROOT,'技能包/wujian-futures-multi-cycle-scan'));
const FIRE_SOURCE=resolve(FIRE_SKILL,'scripts/scan.py');
const FIRE_RUNNER=resolve(ROOT,'scripts/fire_scan.py');
const PYTHON=process.platform==='win32'?resolve('.venv-akshare/Scripts/python.exe'):resolve('.venv-akshare/bin/python');
const INITIAL_FIRE=resolve(LAB,'04_运行记录/2026-09-27_火机会全品种筛选/2026-09-27_火机会数据_当前_v1.0.json');
const RULE_FILES=[
 ['金四法已确认规则',resolve(ROOT,'docs/gold-methods-2026-10-19.md')],
 ['金独立分时增量规则',resolve(ROOT,'docs/gold-intraday-2026-10-26.md')],
 ['金四法计算',resolve(ROOT,'dist/gold-methods.js')],
 ['金分步审定',resolve(ROOT,'integrations/gold-planning.mjs')],
 ['五行团队职责框架',resolve(BUNDLE_ROOT,'../../1_交易/团队与私募/2026-10-04_五行交易团队职责框架_v1.0.md')],
 ['本轮协作约定',resolve(ROOT,'docs/system-run.md')],
 ['火计算程序',FIRE_SOURCE],
 ['动态月行情适配',FIRE_RUNNER],
 ['工作台业务计算',resolve(ROOT,'integrations/five-workbench.mjs')],
 ['运行边界程序',resolve(ROOT,'integrations/team-governance.mjs')],
 ['累计风险复核程序',resolve(ROOT,'integrations/approval-boundary.mjs')],
 ['实际成交与资金记录程序',resolve(ROOT,'integrations/trade-ledger.mjs')],
 ['环境计算程序',resolve(ROOT,'integrations/environment.mjs')],
 ['共振计算程序',resolve(ROOT,'integrations/resonance-rule.mjs')],
 ['以损定量程序',resolve(ROOT,'integrations/simple-sizing.mjs')],
 ['以损定量算法',resolve(ROOT,'dist/position-sizing.js')],
 ['系统手册',resolve(LAB,'01_系统/2026-09-27_期货账户管理系统_当前_v1.0.md')],
 ['火扫描技能包方法',resolve(FIRE_SKILL,'references/method.md')],
 ['火扫描技能包说明',resolve(FIRE_SKILL,'SKILL.md')],
 ['月周日共振业务规则',resolve(ROOT,'docs/fire-resonance-rule-v2.6.md')],
 ['五层自动环境计算',resolve(ROOT,'docs/automatic-environment.md')],
 ['金决策口径',resolve(LAB,'06_工具/金_决策复核/references/规则与计算口径.md')],
 ['交易全流程卡',resolve(LAB,'02_日常/2026-09-27_交易全流程卡_当前_v1.0.md')],
 ['账户计算基准',resolve(LAB,'02_日常/2026-09-28_账户计算基准_当前_v1.0.md')],
 ['验证与迭代协议',resolve(LAB,'03_迭代/2026-09-27_验证与迭代协议_当前_v1.0.md')],
];
const MODE_LABELS={'month-week':'月周大周期','week-day':'周日小周期','month-week-day':'月周日共振'};
const CARD_STATUSES=new Set(['观察','待证据','待触发','已批准','拒绝','持仓中','已结束']);
const EXECUTION_STATUSES=new Set(['待提交','已接受','部分成交','全部成交','撤单待确认','已撤','拒绝','止损触发未成交','已平仓']);
const TIERS={conservative:{label:'保守',round:.005,pool:.025},normal:{label:'正常',round:.01,pool:.05},aggressive:{label:'积极',round:.02,pool:.06},unknown:{label:'未知',round:0,pool:0}};
const CYCLES={week:.02,day:.01,small:.005};

let database;
const now=beijingNow;
const parse=value=>{try{return JSON.parse(value||'{}')}catch{return{}}};
const text=value=>String(value??'').trim();
const number=value=>typeof value==='number'&&Number.isFinite(value)?value:null;
const json=value=>JSON.stringify(value??{});

function db(){
 if(database)return database;
 database=new DatabaseSync(DB_PATH);
 database.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
 CREATE TABLE IF NOT EXISTS accounts(id TEXT PRIMARY KEY,alias TEXT NOT NULL,mode TEXT NOT NULL,stage_capital REAL NOT NULL,equity REAL,high_watermark REAL,restore_line REAL,realized_profit REAL NOT NULL DEFAULT 0,tier TEXT NOT NULL,stopped INTEGER NOT NULL DEFAULT 0,margin_limit REAL,min_available REAL,product_limit REAL,notes TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS cards(id TEXT PRIMARY KEY,round_id TEXT NOT NULL,account_id TEXT,symbol TEXT NOT NULL,name TEXT NOT NULL,exchange TEXT,contract TEXT,direction TEXT,source TEXT NOT NULL,scan_mode TEXT,status TEXT NOT NULL,fire_json TEXT NOT NULL,water_json TEXT NOT NULL,layers_json TEXT NOT NULL,active_plan_version INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,FOREIGN KEY(account_id) REFERENCES accounts(id));
 CREATE TABLE IF NOT EXISTS plan_versions(id TEXT PRIMARY KEY,card_id TEXT NOT NULL,version INTEGER NOT NULL,payload_json TEXT NOT NULL,risk_json TEXT NOT NULL,status TEXT NOT NULL,evidence_hash TEXT NOT NULL,approved_at TEXT,created_at TEXT NOT NULL,UNIQUE(card_id,version),FOREIGN KEY(card_id) REFERENCES cards(id));
 CREATE TABLE IF NOT EXISTS executions(id TEXT PRIMARY KEY,card_id TEXT NOT NULL,external_id TEXT NOT NULL,time TEXT NOT NULL,status TEXT NOT NULL,action TEXT NOT NULL,price REAL,quantity INTEGER,stop_status TEXT,payload_json TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(card_id,external_id),FOREIGN KEY(card_id) REFERENCES cards(id));
 CREATE TABLE IF NOT EXISTS reviews(id TEXT PRIMARY KEY,card_id TEXT NOT NULL,review_type TEXT NOT NULL,payload_json TEXT NOT NULL,created_at TEXT NOT NULL,FOREIGN KEY(card_id) REFERENCES cards(id));
 CREATE TABLE IF NOT EXISTS changes(id TEXT PRIMARY KEY,card_id TEXT,change_type TEXT NOT NULL,payload_json TEXT NOT NULL,status TEXT NOT NULL,created_at TEXT NOT NULL,FOREIGN KEY(card_id) REFERENCES cards(id));
 CREATE TABLE IF NOT EXISTS scan_runs(id TEXT PRIMARY KEY,scan_date TEXT,data_date TEXT,status TEXT NOT NULL,source_path TEXT NOT NULL,payload_json TEXT NOT NULL,created_at TEXT NOT NULL);`);
 const accountColumns=new Set(database.prepare('PRAGMA table_info(accounts)').all().map(column=>column.name));
 if(!accountColumns.has('status'))database.exec("ALTER TABLE accounts ADD COLUMN status TEXT NOT NULL DEFAULT 'active'");
 database.exec(`CREATE TRIGGER IF NOT EXISTS account_unique_insert BEFORE INSERT ON accounts WHEN EXISTS(SELECT 1 FROM accounts WHERE lower(trim(alias))=lower(trim(NEW.alias))) BEGIN SELECT RAISE(ABORT,'账户名称已经存在'); END;
 CREATE TRIGGER IF NOT EXISTS account_unique_update BEFORE UPDATE OF alias ON accounts WHEN NEW.alias<>OLD.alias AND EXISTS(SELECT 1 FROM accounts WHERE id<>NEW.id AND lower(trim(alias))=lower(trim(NEW.alias))) BEGIN SELECT RAISE(ABORT,'账户名称已经存在'); END;`);
 if(!accountColumns.has('is_default'))database.exec('ALTER TABLE accounts ADD COLUMN is_default INTEGER NOT NULL DEFAULT 0');
 if(!accountColumns.has('initial_capital')){database.exec('ALTER TABLE accounts ADD COLUMN initial_capital REAL');database.exec('UPDATE accounts SET initial_capital=stage_capital WHERE stage_capital>0')}
 if(!accountColumns.has('revision'))database.exec('ALTER TABLE accounts ADD COLUMN revision INTEGER NOT NULL DEFAULT 0');
 database.exec('CREATE TRIGGER IF NOT EXISTS account_revision AFTER UPDATE ON accounts WHEN NEW.revision=OLD.revision BEGIN UPDATE accounts SET revision=OLD.revision+1 WHERE id=NEW.id; END;');
 const count=database.prepare('SELECT count(*) AS count FROM accounts').get().count;
 if(!count || !database.prepare("SELECT id FROM accounts WHERE mode='real'").get()){const stamp=now();database.prepare('INSERT INTO accounts(alias,mode,stage_capital,equity,high_watermark,restore_line,realized_profit,tier,stopped,margin_limit,min_available,product_limit,notes,created_at,updated_at,status,is_default,id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run('默认实盘账户','real',0,null,null,null,0,'normal',0,null,null,null,'实际金额待本人填写',stamp,stamp,'active',1,randomUUID())}
 if(!database.prepare('SELECT id FROM accounts WHERE is_default=1').get())database.prepare("UPDATE accounts SET is_default=1 WHERE id=(SELECT id FROM accounts ORDER BY created_at LIMIT 1)").run();
 database.prepare("UPDATE accounts SET is_default=1 WHERE alias IN ('默认实盘账户','默认模拟账户') AND is_default=0").run();
 ledgerSchema(database);balanceSchema(database);
 governanceSchema(database);reservationSchema(database);
 const cardColumns=new Set(database.prepare('PRAGMA table_info(cards)').all().map(column=>column.name));
 if(!cardColumns.has('archived_at'))database.exec('ALTER TABLE cards ADD COLUMN archived_at TEXT');
 if(!cardColumns.has('archive_reason'))database.exec("ALTER TABLE cards ADD COLUMN archive_reason TEXT NOT NULL DEFAULT ''");
 for(const p of database.prepare('SELECT p.*,c.account_id,c.round_id FROM plan_versions p JOIN cards c ON c.id=p.card_id WHERE p.approved_at IS NOT NULL AND c.account_id IS NOT NULL ORDER BY p.created_at,p.rowid').all()){
  const budget=parse(p.risk_json).frozenBudget;
  if(number(budget)>0)database.prepare('INSERT OR IGNORE INTO round_budgets VALUES(?,?,?,?)').run(p.account_id,p.round_id,budget,p.approved_at);
 }
 return database;
}

async function sourceRegistry(){
 const files=[];
 for(const [name,path] of RULE_FILES){try{const content=await readFile(path);files.push({name,path,sha256:createHash('sha256').update(content).digest('hex'),available:true})}catch{files.push({name,path,sha256:null,available:false})}}
 const combined=createHash('sha256').update(files.map(item=>item.sha256||'missing').join('|')).digest('hex');
 return {version:'三模式量仓严格＞1万 · 共振 v2.6.1 · 周日方向＋周线价格位置',combinedHash:combined,files,readOnly:true,boundary:'整轮运行锁定框架；职责内正常推进不增加木审批。'};
}

export async function ruleRegistry(){
 const current=await sourceRegistry(),locked=activeRun(db());
 const differences=locked?current.files.filter(f=>locked.snapshot.files.find(old=>old.path===f.path)?.sha256!==f.sha256).map(f=>({name:f.name,path:f.path,lockedHash:locked.snapshot.files.find(old=>old.path===f.path)?.sha256,currentHash:f.sha256,available:f.available})):[];
 return locked?{...locked.snapshot,runId:locked.id,sourceChanged:locked.snapshot.combinedHash!==current.combinedHash,currentSourceHash:current.combinedHash,differences}:current;
}
export async function beginSystemRun(){
 const current=activeRun(db());if(current)return current;
 const registry=await sourceRegistry(),contents=[];
 for(const f of registry.files)if(f.available)contents.push({...f,content:await readFile(f.path,'utf8')});
 return startRun(db(),{...registry,contents});
}
export function endSystemRun(result){return finishRun(db(),listCards(),result)}
export function reconcileTradePosition(cardId,input){const card=getCard(cardId);if(!card)throw Error('交易卡不存在');const result=reconcilePosition(db(),card,input);if(card.archivedAt&&input.quantity>0){db().prepare("UPDATE cards SET archived_at=NULL,archive_reason='' WHERE id=?").run(cardId);journal(db(),'实际持仓恢复交易卡',{reason:'归档后对账发现实际持仓'},cardId)}return{...result,card:fullCard(cardId)}}
export function systemGovernance(){return governanceData(db())}
export function recordIssue(input){if(input.cardId&&!getCard(input.cardId))throw Error('交易卡不存在');saveIssue(db(),input);return governanceData(db())}
export function releasePlan(cardId,reason){
 const card=getCard(cardId);if(!card?.plan||!text(reason))throw Error('请填写撤销未成交预留的核对依据');
 const pending=listExecutions(cardId).some(x=>['待提交','已接受','部分成交','撤单待确认','止损触发未成交'].includes(x.status)&&!['trade-v1','trade-exception','reconciliation-v1'].includes(x.payload.recordMode));
 if(pending)throw Error('委托状态尚未确认，不能释放预留');
 db().exec('SAVEPOINT release_plan');try{
 db().prepare('INSERT OR IGNORE INTO released_reservations VALUES(?,?,?)').run(card.plan.id,text(reason),now());
 db().prepare("UPDATE plan_versions SET status='已失效' WHERE id=?").run(card.plan.id);
 db().prepare("UPDATE cards SET status=CASE WHEN status='已批准' THEN '待触发' ELSE status END WHERE id=?").run(cardId);
 journal(db(),'释放未成交预留',{planId:card.plan.id,reason:text(reason)},cardId);db().exec('RELEASE release_plan');
 }catch(e){db().exec('ROLLBACK TO release_plan; RELEASE release_plan');throw e}return getCard(cardId);
}

function accountRow(row){return row&&{id:row.id,alias:row.alias,mode:row.mode,stageCapital:row.stage_capital,equity:row.equity,...balanceInfo(database,row),highWatermark:row.high_watermark,restoreLine:row.restore_line,realizedProfit:row.realized_profit,tier:row.tier,stopped:!!row.stopped,status:row.status||'active',isDefault:!!row.is_default,revision:row.revision,marginLimit:row.margin_limit,minAvailable:row.min_available,productLimit:row.product_limit,notes:row.notes,createdAt:row.created_at,updatedAt:row.updated_at}}
function cardRow(row){if(!row)return null;const plan=row.active_plan_version?db().prepare('SELECT * FROM plan_versions WHERE card_id=? AND version=?').get(row.id,row.active_plan_version):null;return{archivedAt:row.archived_at||null,archiveReason:row.archive_reason||'',id:row.id,roundId:row.round_id,accountId:row.account_id,symbol:row.symbol,name:row.name,exchange:row.exchange,contract:row.contract,direction:row.direction,source:row.source,scanMode:row.scan_mode,status:row.status,fire:parse(row.fire_json),water:parse(row.water_json),layers:parse(row.layers_json),activePlanVersion:row.active_plan_version,plan:plan?{id:plan.id,version:plan.version,payload:parse(plan.payload_json),risk:parse(plan.risk_json),status:plan.status,evidenceHash:plan.evidence_hash,approvedAt:plan.approved_at,createdAt:plan.created_at}:null,createdAt:row.created_at,updatedAt:row.updated_at}}
export function listAccounts(){return db().prepare("SELECT * FROM accounts ORDER BY CASE WHEN status='active' THEN 0 ELSE 1 END,CASE WHEN mode='real' THEN 0 ELSE 1 END,created_at").all().map(accountRow)}
export function saveAccount(input={}){
 const stamp=now(),id=text(input.id)||randomUUID(),existing=db().prepare('SELECT * FROM accounts WHERE id=?').get(id);
 if(input.id&&!existing)throw Error('账户不存在');
 const previous=accountRow(existing);input={...(previous||{}),...input};
 if(existing&&(input.updatedAt&&input.updatedAt!==existing.updated_at||input.revision!==undefined&&input.revision!==existing.revision))throw Error('账户金额已更新，请刷新后重新核对');
 const alias=text(input.alias);if(!alias)throw Error('账户别名不能为空');
 const duplicate=db().prepare('SELECT id FROM accounts WHERE lower(trim(alias))=lower(?) AND id<>?').get(alias,id);if(duplicate)throw Error('账户名称已经存在，请使用唯一名称');
 const mode=['simulation','real','shadow'].includes(input.mode)?input.mode:'real';
 if(existing&&mode!==existing.mode&&db().prepare('SELECT id FROM cards WHERE account_id=? LIMIT 1').get(id))throw Error('已有交易卡，不能更改账户类型');
 const stageCapital=number(input.stageCapital)??(mode==='real'?0:1000000);if(stageCapital<0)throw Error('阶段本金不能小于0');
 const initialCapital=Object.hasOwn(input,'initialCapital')?(input.initialCapital===null?null:money(input.initialCapital)):(existing?.initial_capital??(stageCapital>0?money(stageCapital):null));
 if(initialCapital!==null&&initialCapital<0)throw Error('初始资金不能小于0');
 const equity=input.equity===null||input.equity===undefined?null:money(input.equity);if(equity!==null&&equity<0)throw Error('实际账户金额不能小于0');
 if(existing&&equity===null&&existing.equity!==null)throw Error('请通过余额记录修正金额，不能清空已有余额');
 const tier=Object.hasOwn(TIERS,input.tier)?input.tier:'unknown';
 if(existing&&activeRun(db())&&((TIERS[tier]?.round||0)>(TIERS[existing.tier]?.round||0)||existing.stopped&&!input.stopped||stageCapital!==existing.stage_capital))throw Error('运行中不能升档、解除停机或重置阶段本金；账户对账与降档仍可进行');
 const values=[alias,mode,stageCapital,number(input.highWatermark),number(input.restoreLine),existing?.realized_profit??0,tier,input.stopped?1:0,number(input.marginLimit),number(input.minAvailable),number(input.productLimit),text(input.notes),initialCapital,stamp,id];
 db().exec('SAVEPOINT account_save');try{
  if(existing)db().prepare('UPDATE accounts SET alias=?,mode=?,stage_capital=?,high_watermark=?,restore_line=?,realized_profit=?,tier=?,stopped=?,margin_limit=?,min_available=?,product_limit=?,notes=?,initial_capital=?,updated_at=? WHERE id=?').run(...values);
  else db().prepare('INSERT INTO accounts(alias,mode,stage_capital,high_watermark,restore_line,realized_profit,tier,stopped,margin_limit,min_available,product_limit,notes,initial_capital,updated_at,id,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(...values,stamp);
  if(equity!==null&&existing?.equity!==equity)recordBalanceSync(db(),id,equity,{sourcePage:input.sourcePage||'账户管理',note:input.balanceNote||input.notes||''});
  if(existing&&(existing.tier!==tier||!!existing.stopped!==!!input.stopped))invalidateAccountPlans(db(),id);
  const saved=accountRow(db().prepare('SELECT * FROM accounts WHERE id=?').get(id));noteAccountChange(db(),previous,saved);db().exec('RELEASE account_save');return saved;
 }catch(error){db().exec('ROLLBACK TO account_save; RELEASE account_save');throw error}
}
function checkAccountRevision(account,input){
 if(!account)throw Error('账户不存在');
 if(input.expectedRevision!==undefined&&input.expectedRevision!==account.revision||input.updatedAt&&input.updatedAt!==account.updated_at)throw Error('账户金额已更新，请刷新后重新核对');
}
export function syncAccountBalance(accountId,input={}){
 const id=text(accountId);db().exec('SAVEPOINT balance_sync');try{
  const account=db().prepare('SELECT * FROM accounts WHERE id=?').get(id);
  const duplicate=input.requestId&&db().prepare('SELECT id FROM balance_changes WHERE account_id=? AND request_id=?').get(id,input.requestId);
  if(!duplicate)checkAccountRevision(account,input);
  const change=recordBalanceSync(db(),id,input.balance??input.equity,{sourcePage:input.sourcePage||'账户管理',note:input.note||'',requestId:input.requestId});
  const result={change,account:accountRow(db().prepare('SELECT * FROM accounts WHERE id=?').get(id))};db().exec('RELEASE balance_sync');return result;
 }catch(error){db().exec('ROLLBACK TO balance_sync; RELEASE balance_sync');throw error}
}
export function listBalanceChanges(accountId){if(!db().prepare('SELECT id FROM accounts WHERE id=?').get(text(accountId)))throw Error('账户不存在');return balanceChanges(db(),text(accountId))}
export function editBalanceChange(accountId,changeId,input={}){
 db().exec('SAVEPOINT balance_edit');try{
  checkAccountRevision(db().prepare('SELECT * FROM accounts WHERE id=?').get(text(accountId)),{expectedRevision:input.expectedRevision});
  const change=editBalance(db(),text(accountId),text(changeId),input),account=accountRow(db().prepare('SELECT * FROM accounts WHERE id=?').get(text(accountId)));
  db().exec('RELEASE balance_edit');return{change,account};
 }catch(error){db().exec('ROLLBACK TO balance_edit; RELEASE balance_edit');throw error}
}
export function voidBalance(accountId,changeId,input={}){return editBalanceChange(accountId,changeId,{...input,action:'void'})}
export function deleteOrDisableAccount(accountId,input={}){
 const id=text(accountId),account=db().prepare('SELECT * FROM accounts WHERE id=?').get(id);if(!account)throw Error('账户不存在');
 if(account.is_default)throw Error('默认账户不能删除或停用');
 if(!input.confirmed)throw Error('请确认删除或停用账户');
 const related={cards:db().prepare('SELECT count(*) AS count FROM cards WHERE account_id=?').get(id).count,plans:db().prepare('SELECT count(*) AS count FROM plan_versions WHERE card_id IN (SELECT id FROM cards WHERE account_id=?)').get(id).count,executions:db().prepare('SELECT count(*) AS count FROM executions WHERE card_id IN (SELECT id FROM cards WHERE account_id=?)').get(id).count};
 db().exec('SAVEPOINT account_remove');try{
  let result;
  if(related.cards||related.plans||related.executions){
   db().prepare("UPDATE accounts SET status='disabled',updated_at=? WHERE id=?").run(now(),id);invalidateAccountPlans(db(),id);
   journal(db(),'账户停用',{accountId:id,related});result={action:'disabled',account:accountRow(db().prepare('SELECT * FROM accounts WHERE id=?').get(id)),related};
  }else{
   const snapshot={account,balances:balanceChanges(db(),id),entries:accountEntries(db(),id),audits:db().prepare('SELECT * FROM balance_audit WHERE account_id=?').all(id)};
   db().prepare('INSERT INTO account_deletions VALUES(?,?,?,?)').run(randomUUID(),id,json(snapshot),now());
   for(const table of ['balance_changes','balance_baselines','account_entries'])db().prepare('DELETE FROM '+table+' WHERE account_id=?').run(id);
   db().prepare('DELETE FROM accounts WHERE id=?').run(id);journal(db(),'账户删除归档',{accountId:id,snapshot});result={action:'deleted',id,related};
  }
  db().exec('RELEASE account_remove');return result;
 }catch(error){db().exec('ROLLBACK TO account_remove; RELEASE account_remove');throw error}
}

export function listCards(filters={}){let sql='SELECT * FROM cards',args=[];const where=[];if(filters.accountId){where.push('account_id=?');args.push(filters.accountId)}if(filters.status){where.push('status=?');args.push(filters.status)}if(where.length)sql+=' WHERE '+where.join(' AND ');sql+=' ORDER BY updated_at DESC';return db().prepare(sql).all(...args).map(cardRow)}
export function getCard(id){return cardRow(db().prepare('SELECT * FROM cards WHERE id=?').get(id))}
export function saveWaterNotes(id,{values={},expected={},reportId=null}={}){
 const card=getCard(id);if(!card||card.archivedAt)throw Error('交易卡不存在或已归档');
 const allowed=new Set(['change','evidence','pricedIn','disproof','competingExplanation','sources','missing','conclusion','frameworkVersion','headline','stage','stageConfidence','priorStage','priorConfidence','posteriorShift','dimensions','advice','reversal','fundamentalDirection','strategyConclusion','strategyAction','institutionView','evidenceGrade','asOf','quickBrief','sourceRefs','sourceSnapshot','resonance','technicalDirection']);
 const keys=Object.keys(values);if(!keys.length||keys.some(key=>!allowed.has(key)))throw Error('研究记录字段无效');
 for(const key of keys)if(!Object.hasOwn(expected,key)||json(card.water?.[key]??null)!==json(expected[key]??null))throw Error('研究记录已被其他窗口修改，请刷新并核对后再保存');
 const database=db();database.exec('BEGIN IMMEDIATE');try{
  journal(database,reportId?'应用AI研究前值':'人工研究保存前值',{water:card.water,reportId},id);
  const water={...card.water,...values,...(reportId?{appliedResearchReportId:reportId}: {})};
  const result=saveCard({...card,water,status:values.conclusion==='撤回假说'?'拒绝':values.conclusion==='等待补证据'?'待证据':card.status});
  database.exec('COMMIT');return result;
 }catch(error){database.exec('ROLLBACK');throw error}
}
export function saveCard(input={}){
 const stamp=now(),id=text(input.id)||randomUUID(),existing=db().prepare('SELECT * FROM cards WHERE id=?').get(id);const symbol=text(input.symbol).toUpperCase(),name=text(input.name);
 if(existing?.archived_at)throw Error('交易卡已归档，请先恢复到观察；原轮次和预算不重置');
 if(!symbol||!name)throw Error('交易卡必须包含品种代码和中文名');
 input.accountId=text(input.accountId)||existing?.account_id||listAccounts().find(a=>a.status==='active'&&a.mode==='real')?.id;
 const account=db().prepare('SELECT * FROM accounts WHERE id=?').get(input.accountId||'');if(!account)throw Error('交易卡必须绑定有效账户');
 if(existing?.account_id&&existing.account_id!==input.accountId)throw Error('交易卡已绑定账户，不能跨账户迁移');
 if(!existing&&account.status!=='active')throw Error('账户已停用，不能新增交易卡');
 if(existing&&db().prepare('SELECT id FROM executions WHERE card_id=? LIMIT 1').get(id)&&((text(input.accountId)||null)!==existing.account_id||symbol!==existing.symbol||(text(input.contract)||null)!==existing.contract||input.direction!==existing.direction))throw Error('已有执行记录，不能更换账户、品种、合约或方向');
 if(existing&&db().prepare('SELECT id FROM plan_versions WHERE card_id=? AND approved_at IS NOT NULL').get(id)&&((text(input.accountId)||null)!==existing.account_id||input.roundId&&input.roundId!==existing.round_id))throw Error('已有批准历史，不能更换账户或重置交易轮次');
 let status=CARD_STATUSES.has(input.status)?input.status:(existing?.status||'观察');
 if(['已批准','持仓中','已结束'].includes(status)&&status!==existing?.status)status=existing?.status||'观察';
 if(existing){
  const changed=symbol!==existing.symbol||(text(input.contract)||null)!==existing.contract||input.direction!==existing.direction||json(input.water)!==existing.water_json||json(input.layers)!==existing.layers_json;
  if(changed){db().prepare("UPDATE plan_versions SET status='已失效' WHERE card_id=? AND status='已批准'").run(id);if(status==='已批准')status='待触发';}
 }
 const roundId=text(input.roundId)||existing?.round_id||`${new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'})}-${symbol}-${randomUUID().slice(0,6)}`;
 const values=[roundId,text(input.accountId)||null,symbol,name,text(input.exchange)||null,text(input.contract)||null,['long','short'].includes(input.direction)?input.direction:null,text(input.source)||'手工候选',text(input.scanMode)||null,status,json(input.fire),json(input.water),json(input.layers),stamp,id];
 if(existing){db().prepare('UPDATE cards SET round_id=?,account_id=?,symbol=?,name=?,exchange=?,contract=?,direction=?,source=?,scan_mode=?,status=?,fire_json=?,water_json=?,layers_json=?,updated_at=? WHERE id=?').run(...values)}
 else{db().prepare('INSERT INTO cards(id,round_id,account_id,symbol,name,exchange,contract,direction,source,scan_mode,status,fire_json,water_json,layers_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,...values.slice(0,-1),stamp)}
 const saved=getCard(id);journal(db(),'交易卡保存',saved,id);return saved;
}

export function cardRemovalPreview(id){
 const card=fullCard(id);if(!card)throw Error('交易卡不存在');
 const reasons=[];
 if(card.trade.requiresReconciliation)reasons.push('历史成交或持仓待对账');
 if(card.trade.remainingLots>0)reasons.push('仍有实际持仓，请先处理退出并记录');
 if(card.executions.some(x=>['待提交','已接受','部分成交','撤单待确认','止损触发未成交'].includes(x.status)&&!['trade-v1','trade-exception','reconciliation-v1'].includes(x.payload.recordMode)))reasons.push('委托尚未确认撤销或完成');
 if(card.supervision.some(x=>x.status==='待处理'))reasons.push('仍有待处理异常，请先核对');
 const token=createHash('sha256').update(json(card)).digest('hex');
 return{id,token,canRemove:!reasons.length,reasons,name:card.name,contract:card.contract,archivedAt:card.archivedAt,plans:card.planHistory.length,executions:card.executions.length,reviews:card.reviews.length};
}
export function deleteCard(id,input={}){
 if(input.confirmed!==true||input.noOpenOrdersConfirmed!==true||!text(input.reason))throw Error('请确认取消计划、无实际持仓和未撤委托，并填写原因');
 db().exec('BEGIN IMMEDIATE');try{
  const preview=cardRemovalPreview(id),card=getCard(id);
  if(preview.archivedAt){db().exec('COMMIT');return{archived:true,id,archivedAt:preview.archivedAt}}
  if(!preview.canRemove)throw Error('不能移除：'+preview.reasons.join('；'));
  if(input.token!==preview.token)throw Error('交易卡已变化，请重新核对移除内容');
  const stamp=now(),reason=text(input.reason);
  for(const p of db().prepare('SELECT id FROM plan_versions WHERE card_id=? AND approved_at IS NOT NULL').all(id))db().prepare('INSERT OR IGNORE INTO released_reservations VALUES(?,?,?)').run(p.id,reason,stamp);
  db().prepare("UPDATE plan_versions SET status='已取消' WHERE card_id=? AND status IN ('待复核','已批准','已失效')").run(id);
  db().prepare('UPDATE cards SET archived_at=?,archive_reason=?,updated_at=? WHERE id=?').run(stamp,reason,stamp,id);
  journal(db(),'取消计划并归档交易卡',{before:card,reason,confirmedNoOpenOrders:true,scope:['水','金','土'],related:preview},id);
  db().exec('COMMIT');return{archived:true,id,archivedAt:stamp};
 }catch(error){db().exec('ROLLBACK');throw error}
}
export function restoreCard(id){
 const card=getCard(id);if(!card)throw Error('交易卡不存在');
 if(!card.archivedAt)return card;
 if(!listAccounts().some(a=>a.id===card.accountId&&a.status==='active'))throw Error('账户已停用，不能恢复交易卡');
 db().exec('SAVEPOINT restore_card');try{
  db().prepare("UPDATE cards SET archived_at=NULL,archive_reason='',status='观察',updated_at=? WHERE id=?").run(now(),id);
  journal(db(),'恢复观察交易卡',{previousArchivedAt:card.archivedAt,reason:card.archiveReason,roundId:card.roundId,approvalRestored:false},id);
  db().exec('RELEASE restore_card');return getCard(id);
 }catch(error){db().exec('ROLLBACK TO restore_card; RELEASE restore_card');throw error}
}

function layerPermission(layers={},direction){const values=['market','sector','month','week','day'].map(key=>layers[key]?.direction||'unknown');const wanted=direction==='long'?'long':'short';const same=values.filter(v=>v===wanted).length,neutral=values.filter(v=>v==='neutral').length,unknown=values.includes('unknown'),against=values.some(v=>!['neutral','unknown',wanted].includes(v));if(unknown)return{cap:0,state:'待证据',reason:'五层存在未知'};if(against)return{cap:0,state:'观察',reason:'五层存在反向'};if(same===5)return{cap:.02,state:'核心环境',reason:'五层同向'};if(same===4&&neutral===1)return{cap:.005,state:'保守测试',reason:'四层同向且第五层中性'};return{cap:0,state:'观察',reason:'少于四层同向'}}
function automaticSizingPlan(card,plan){
 const spec=contractSpec(card?.symbol||plan.symbol);
 return {...plan,symbol:card?.symbol||plan.symbol,direction:card?.direction||plan.direction,
  multiplier:spec?.pointValue??null,tickSize:spec?.tickSize??null,contractSpec:spec};
}
export function calculateRisk(input={}){
 if(input.plan?.sizingMode==='simple'){const card=input.cardId?getCard(input.cardId):null;const accountId=input.accountId||card?.accountId;const account=accountId?accountRow(db().prepare('SELECT * FROM accounts WHERE id=?').get(text(accountId))):input.account;const plan=card||input.plan.symbol?automaticSizingPlan(card,input.plan):input.plan;return simpleSizing(account,plan,layerPermission(input.layers,plan.direction||input.direction))}
 const account=input.account||accountRow(db().prepare('SELECT * FROM accounts WHERE id=?').get(text(input.accountId)))||{};const plan=input.plan||{};const direction=plan.direction||input.direction;const permission=layerPermission(input.layers||{},direction);const tier=TIERS[account.stopped?'unknown':account.tier]||TIERS.unknown;const cycleCap=CYCLES[plan.mainCycle]??0;const finalPct=Math.min(tier.round,permission.cap,cycleCap);const base=number(account.equity)??number(account.stageCapital);const estimated=number(account.equity)===null;const frozenBudget=number(plan.frozenBudget)??(base!==null?base*finalPct:null);const cost=number(plan.costPerLot);const entry=number(plan.entry),stop=number(plan.stop),multiplier=number(plan.multiplier);const validDirection=['long','short'].includes(direction)&&entry!==null&&stop!==null&&(direction==='long'?stop<entry:stop>entry);const perLot=validDirection&&multiplier>0&&cost!==null?Math.abs(entry-stop)*multiplier+cost:null;const used=Math.max(0,number(plan.roundLossAndFees)??0)+Math.max(0,number(plan.existingPlannedRisk)??0)+Math.max(0,number(plan.pendingReservedRisk)??0);const remaining=frozenBudget===null?null:Math.max(0,frozenBudget-used);const riskLots=perLot&&remaining!==null?Math.floor(remaining/perLot):null;const poolLimit=base!==null?base*tier.pool:null;const poolRemaining=poolLimit===null?null:Math.max(0,poolLimit-Math.max(0,number(plan.portfolioUsedRisk)??0));const correlationRemaining=base!==null?Math.max(0,base*tier.round-Math.max(0,number(plan.correlationUsedRisk)??0)):null;const capLots=[riskLots,poolRemaining!==null&&perLot?Math.floor(poolRemaining/perLot):null,correlationRemaining!==null&&perLot?Math.floor(correlationRemaining/perLot):null,Number.isSafeInteger(plan.marginCapLots)?plan.marginCapLots:null,Number.isSafeInteger(plan.liquidityCapLots)?plan.liquidityCapLots:null];const missing=[];if(!base)missing.push('账户权益或阶段本金');if(estimated&&account.mode==='real')missing.push('真实净权益');if(permission.cap===0)missing.push(permission.reason);if(!cycleCap)missing.push('主周期');if(!validDirection)missing.push('有效入场止损配对');if(!(multiplier>0))missing.push('合约乘数');if(cost===null)missing.push('费用滑点');if(!Number.isSafeInteger(plan.marginCapLots))missing.push('保证金允许手数');if(!Number.isSafeInteger(plan.liquidityCapLots))missing.push('流动性允许手数');const finiteCaps=capLots.filter(Number.isSafeInteger);const lots=missing.length?null:Math.min(...finiteCaps);return{accountTier:tier.label,environment:permission,cycleCap,finalPct,baseEquity:base,equityEstimated:estimated,frozenBudget,roundUsed:used,remainingBudget:remaining,riskPerLot:perLot,riskCapLots:riskLots,poolLimit,poolRemaining,correlationRemaining,lots,plannedLoss:lots!==null&&perLot!==null?lots*perLot:null,missing,permission:false}}

export async function savePlan(cardId,input={}){
 if(input.goldRuleVersion)throw Error('四法新方案须先确认手法，再通过统一审定流程');
 const original=getCard(cardId);if(!original)throw Error('交易卡不存在');
 if(original.archivedAt)throw Error('交易卡已归档，请先恢复观察');
 if(input.expectedPlanVersion!==undefined&&input.expectedPlanVersion!==original.activePlanVersion)throw Error('计划已更新，请刷新后再提交');
 if(!listAccounts().some(a=>a.id===original.accountId&&a.status==='active'))throw Error('账户已停用，不能冻结新计划');
 const run=await beginSystemRun();
 if((await ruleRegistry()).sourceChanged)throw Error('运行中框架发生变化，请恢复锁定版本；只能在整轮结束后启用修订');
 const environment=await cardEnvironment(cardId,{cycle:input.mainCycle||'day'});
 input={...input,systemRunId:run.id,environmentHash:environment.hash,environmentLayers:environment.layers};
 input=automaticSizingPlan(original,input);
 input.accountEquity=listAccounts().find(a=>a.id===original.accountId)?.equity??null;
 const rules=await ruleRegistry(),stamp=now(),id=randomUUID();
 db().exec('BEGIN IMMEDIATE');
 try{
  const card=getCard(cardId);
  if(card.archivedAt)throw Error('交易卡已归档，请先恢复观察');
  if(card.activePlanVersion!==original.activePlanVersion)throw Error('计划已更新，请刷新后再冻结');
  if(card.plan?.approvedAt&&!reservationReleased(db(),card.plan.id)&&(card.plan.risk.lots||0)>planOpenedLots(db(),card.plan.id))throw Error('请先核对并释放上一计划的未成交预留，再冻结新计划');
  const risk=calculateRisk({cardId,accountId:card.accountId,layers:environment.layers,plan:{...input,direction:card.direction}});
  const version=(db().prepare('SELECT max(version) AS version FROM plan_versions WHERE card_id=?').get(cardId).version||0)+1;
  bindRunCard(db(),cardId);saveCard({...card,layers:environment.layers});
  db().prepare("UPDATE plan_versions SET status='已失效' WHERE card_id=? AND status='已批准'").run(cardId);
  db().prepare('INSERT INTO plan_versions VALUES(?,?,?,?,?,?,?,?,?)').run(id,cardId,version,json({...input,direction:card.direction}),json(risk),'待复核',rules.combinedHash,null,stamp);
  db().prepare("UPDATE cards SET active_plan_version=?,status=CASE WHEN status='持仓中' THEN status ELSE '待触发' END,updated_at=? WHERE id=?").run(version,stamp,cardId);
  journal(db(),'冻结计划',{cardId,version,payload:{...input,direction:card.direction},risk,evidenceHash:rules.combinedHash},cardId);
  db().exec('COMMIT');return getCard(cardId);
 }catch(e){db().exec('ROLLBACK');throw e}
}
export async function approvePlan(cardId,confirmation={}){
 const initial=getCard(cardId);if(!initial?.plan)throw Error('请先冻结计划');
 if(initial.plan.payload.goldRuleVersion)throw Error('四法方案须在金的统一摘要中重新审定，不沿用单账户旧批准入口');
 if(initial.archivedAt)throw Error('交易卡已归档，不能批准');
 if(initial.plan.status==='已取消')throw Error('计划已取消，请重新填写并提交');
 if(confirmation.planId&&confirmation.planId!==initial.plan.id)throw Error('计划已更新，请重新核对');
 if(!listAccounts().some(a=>a.id===initial.accountId&&a.status==='active'))throw Error('账户已停用，不能批准新计划');
 const environment=await cardEnvironment(cardId,{cycle:initial.plan.payload.mainCycle||'day'});
 const rules=await ruleRegistry();
 db().exec('BEGIN IMMEDIATE');
 try{
  const card=getCard(cardId),payload=card.plan.payload,account=listAccounts().find(a=>a.id===card.accountId);
  if(card.archivedAt||card.plan.status==='已取消')throw Error('计划已取消归档，不能批准');
  if(card.plan.id!==initial.plan.id)throw Error('计划已更新，请重新核对');
  if(!activeRun(db())||payload.systemRunId!==activeRun(db()).id)throw Error('计划未绑定本轮锁定框架，请重新冻结');
  if(rules.sourceChanged)throw Error('锁定框架的源文件已变化；恢复本轮版本后才能新增风险，不影响实际记账和退出');
  if(payload.environmentHash!==environment.hash)throw Error('环境证据已变化，请重新测算并冻结计划');
  const risk=calculateRisk({cardId:card.id,accountId:card.accountId,layers:environment.layers,plan:{...payload,direction:card.direction}});
  const required=payload.sizingMode==='simple'?['pairType','exitRule','reviewer']:['trigger','entryWindow','validUntil','holdRule','exitRule','eventAction','reviewer'];
  const missing=required.filter(key=>!text(payload[key]));
  if(rules.files.some(f=>!f.available))missing.push('本轮规则来源不完整');
  if(payload.accountEquity!==account?.equity)missing.push('账户金额已变化，请重新冻结');
  if(payload.sizingMode==='simple'){
   if(payload.contractSpec?.hash!==contractSpec(card.symbol)?.hash||!payload.contractSpec)missing.push('合约点值已变化，请重新冻结');
   if(!ENTRY_PAIRS.includes(payload.pairType))missing.push('入场手法');
  }
  if(rules.combinedHash!==card.plan.evidenceHash)missing.push('规则版本不一致');
  missing.push(...risk.missing);
  const checked=constrainApproval(db(),card,account,risk,listCards());missing.push(...checked.errors);
  if(missing.length)throw Error('不能批准：'+[...new Set(missing)].join('、'));
  const confirmationHash=createHash('sha256').update(json({planId:card.plan.id,accountRevision:account.revision,environmentHash:environment.hash,rules:rules.combinedHash,risk:checked.risk})).digest('hex');
  if(confirmation.preview){db().exec('COMMIT');return{planId:card.plan.id,confirmationHash,risk:checked.risk,card}}
  if(confirmation.confirmationHash&&confirmation.confirmationHash!==confirmationHash)throw Error('金额、环境或风险占用已变化，请重新核对计划');
  if(card.plan.status==='已批准'){db().exec('COMMIT');return card}
  const stamp=now();
  db().prepare('INSERT OR IGNORE INTO round_budgets VALUES(?,?,?,?)').run(card.accountId,card.roundId,checked.initialBudget,stamp);
  db().prepare('DELETE FROM released_reservations WHERE plan_id=?').run(card.plan.id);
  db().prepare("UPDATE plan_versions SET status='已批准',approved_at=?,risk_json=? WHERE id=?").run(stamp,json(checked.risk),card.plan.id);
  db().prepare("UPDATE cards SET status='已批准',updated_at=? WHERE id=?").run(stamp,cardId);
  journal(db(),'人工批准',{planId:card.plan.id,version:card.plan.version,risk:checked.risk,approvedAt:stamp,reviewMode:'本人自检',runId:payload.systemRunId},cardId);
  db().exec('COMMIT');return getCard(cardId);
 }catch(e){db().exec('ROLLBACK');journal(db(),'批准未通过',{reason:e.message,planId:initial.plan.id},cardId);throw e}
}

export function listExecutions(cardId){return db().prepare('SELECT * FROM executions WHERE card_id=? ORDER BY time,created_at').all(cardId).map(row=>({id:row.id,cardId:row.card_id,externalId:row.external_id,time:row.time,status:row.status,action:row.action,price:row.price,quantity:row.quantity,stopStatus:row.stop_status,payload:parse(row.payload_json),createdAt:row.created_at}))}
export function addExecution(cardId,input={}){const card=getCard(cardId);if(!card)throw Error('交易卡不存在');const status=EXECUTION_STATUSES.has(input.status)?input.status:null,externalId=text(input.externalId),time=text(input.time),action=text(input.action);if(!status||!externalId||!time||!action)throw Error('执行记录缺少标识、时间、动作或有效状态');input={...input,anomalies:['历史导入回报：批准、持仓及资金待核验']};const stamp=now(),id=randomUUID();try{db().prepare('INSERT INTO executions VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(id,cardId,externalId,time,status,action,number(input.price),Number.isSafeInteger(input.quantity)?input.quantity:null,text(input.stopStatus)||null,json(input),stamp)}catch(e){if(String(e.message).includes('UNIQUE'))throw Error('该委托或成交标识已经导入');throw e}if(['部分成交','全部成交'].includes(status))db().prepare("UPDATE cards SET status='持仓中',updated_at=? WHERE id=?").run(stamp,cardId);if(status==='已平仓')db().prepare("UPDATE cards SET status='已结束',updated_at=? WHERE id=?").run(stamp,cardId);if(card.archivedAt){db().prepare("UPDATE cards SET archived_at=NULL,archive_reason='' WHERE id=?").run(cardId);journal(db(),'实际回报恢复交易卡',{reason:'新导入的实际回报需要核对'},cardId)}journal(db(),'导入执行记录',{id,...input},cardId);saveIssue(db(),{cardId,owner:'earth',description:input.anomalies.join('；'),nextAction:'核对原始回报及当时批准，保留事实'});return listExecutions(cardId)}

export function saveReview(cardId,input={}){
 if(!getCard(cardId))throw Error('交易卡不存在');
 const simple=input.reviewMode==='simple';
 const payload=simple?{reviewMode:'simple',good:text(input.good),bad:text(input.bad),next:text(input.next)}:input;
 const previous=reviewForCard(cardId)[0];
 if(simple&&previous?.payload?.reviewMode==='simple'&&json(previous.payload)===json(payload))return reviewForCard(cardId);
 const reviewType=simple?'final':['daily','weekly','final'].includes(input.reviewType)?input.reviewType:'final',stamp=now(),id=randomUUID();
 db().exec('SAVEPOINT review_save');try{
  db().prepare('INSERT INTO reviews VALUES(?,?,?,?,?)').run(id,cardId,reviewType,json(payload),stamp);
  if(!simple&&input.changeProposal)db().prepare('INSERT INTO changes VALUES(?,?,?,?,?,?)').run(randomUUID(),cardId,'规则变更提案',json(input.changeProposal),'待审',stamp);
  journal(db(),'保存复盘',{id,reviewType,payload},cardId);db().exec('RELEASE review_save');
 }catch(error){db().exec('ROLLBACK TO review_save; RELEASE review_save');throw error}
 return reviewForCard(cardId);
}
export function reviewForCard(cardId){return db().prepare('SELECT * FROM reviews WHERE card_id=? ORDER BY created_at DESC,rowid DESC').all(cardId).map(row=>({id:row.id,reviewType:row.review_type,payload:parse(row.payload_json),createdAt:row.created_at}))}
export function listChanges(){return db().prepare('SELECT * FROM changes ORDER BY created_at DESC').all().map(row=>({id:row.id,cardId:row.card_id,type:row.change_type,payload:parse(row.payload_json),status:row.status,createdAt:row.created_at}))}

function parseCsvLine(line){const values=[];let value='',quoted=false;for(let i=0;i<line.length;i++){const char=line[i];if(char==='"'&&quoted&&line[i+1]==='"'){value+='"';i++}else if(char==='"')quoted=!quoted;else if(char===','&&!quoted){values.push(value.trim());value=''}else value+=char}values.push(value.trim());return values}
export function previewCsv(csv=''){const lines=String(csv).replace(/^\uFEFF/,'').split(/\r?\n/).filter(Boolean);if(lines.length<2)throw Error('CSV至少需要表头和一行记录');const headers=parseCsvLine(lines[0]);const required=['externalId','time','status','action','price','quantity'];const missing=required.filter(key=>!headers.includes(key));if(missing.length)throw Error('CSV缺少列：'+missing.join('、'));const rows=lines.slice(1).map((line,index)=>Object.fromEntries(headers.map((key,i)=>[key,parseCsvLine(line)[i]??'']))).map((row,index)=>({...row,price:row.price===''?null:Number(row.price),quantity:row.quantity===''?null:Number(row.quantity),line:index+2}));const errors=[];for(const row of rows){if(!row.externalId||!row.time||!row.action||!EXECUTION_STATUSES.has(row.status)||row.price!==null&&!Number.isFinite(row.price)||row.quantity!==null&&!Number.isSafeInteger(row.quantity))errors.push({line:row.line,error:'字段或状态无效'})}return{headers,rows,errors,canCommit:rows.length>0&&!errors.length}}
export function commitCsv(cardId,rows=[]){const results=[];db().exec('BEGIN');try{for(const row of rows)results.push(addExecution(cardId,row));db().exec('COMMIT')}catch(e){db().exec('ROLLBACK');throw e}return{inserted:rows.length,executions:listExecutions(cardId)}}

async function jsonFiles(path){try{return(await readdir(path,{withFileTypes:true})).filter(entry=>entry.isFile()&&entry.name.endsWith('.json')).map(entry=>join(path,entry.name))}catch{return[]}}
async function newest(paths){const candidates=[];for(const path of paths)try{candidates.push({path,time:(await stat(path)).mtimeMs})}catch{}return candidates.sort((a,b)=>b.time-a.time)[0]?.path||null}
export async function latestFire(){const refresh=await fireRefresh.status(),meta={refresh,refreshing:refresh.status==='running',refreshError:refresh.error||null};const runtime=await jsonFiles(resolve(FIRE_RUNTIME,'.wujian-futures-multi-cycle-scan'));const path=await newest([...runtime,INITIAL_FIRE]);if(!path)return{status:'missing',rows:[],...meta,error:'尚无火扫描结果'};try{const payload=applyResonanceRule(JSON.parse(await readFile(path,'utf8')));const rows=payload.rows.map(row=>({...row,source_sector:row.sector,sector:sectorFor(row)}));return{...payload,rows,status:'ready',sourcePath:path,...meta,refreshedAt:(await stat(path)).mtime.toISOString(),configured_scan_source:FIRE_SOURCE}}catch{return{status:'failed',rows:[],...meta,error:'火扫描结果无法读取'}}}
export async function cardEnvironment(cardId,options={}){const card=getCard(cardId);if(!card)throw Error('交易卡不存在');return buildEnvironment(card,await latestFire(),{cycle:card.plan?.payload?.mainCycle||'day',...options})}
export const goldPlanning=createGoldPlanning({database:db,getCard,listCards,listAccounts,saveCard,environment:cardEnvironment,bars:specificBars,spec:contractSpec,registry:ruleRegistry,
 runSnapshot:async()=>{const registry=await sourceRegistry(),contents=[];for(const f of registry.files)if(f.available)contents.push({...f,content:await readFile(f.path,'utf8')});return{...registry,contents}}});
export async function specificBars(contract){
 const symbol=text(contract).toUpperCase();if(!/^[A-Z]{1,3}\d{3,4}$/.test(symbol))throw Error('具体合约代码无效');
 try{
  const saved=JSON.parse(await readFile(resolve(FIRE_RUNTIME,'contract-bars',symbol+'.json'),'utf8'));
  const fire=await latestFire(),cutoff=fire.target_date||fire.scan_date;
  const bars=saved.filter(row=>String(row.date).slice(0,10)<=cutoff).slice(-180).map(row=>({date:String(row.date).slice(0,10),open:row.open,high:row.high,low:row.low,close:row.close,volume:row.volume,openInterest:row.open_interest,source:row.source,provisional:row.provisional}));
  if(bars.length)return{contract:symbol,source:'扫描使用的具体合约日线',bars};
 }catch(error){if(error.code!=='ENOENT')throw Error('已保存的具体合约日线无法读取')}
 const endpoint=`https://stock2.finance.sina.com.cn/futures/api/jsonp.php/var%20_${symbol}=/InnerFuturesNewService.getDailyKline?symbol=${symbol}`;
 const response=await fetch(endpoint,{signal:AbortSignal.timeout(12000),headers:{Referer:'https://finance.sina.com.cn/'}});if(!response.ok)throw Error('具体合约日线读取失败');
 const source=await response.text(),start=source.indexOf('(['),end=source.lastIndexOf('])');if(start<0||end<start)throw Error('具体合约日线格式异常');
 const rows=JSON.parse(source.slice(start+1,end+1));return{contract:symbol,source:'新浪财经期货日线',bars:rows.slice(-180).map(row=>({date:row.d,open:Number(row.o),high:Number(row.h),low:Number(row.l),close:Number(row.c),volume:Number(row.v),openInterest:Number(row.p)})).filter(row=>row.date&&[row.open,row.high,row.low,row.close].every(Number.isFinite))};
}
const fireRefresh=createFireRefresh({
 path:resolve('.runtime/fire-refresh.json'),
 checkRules:async()=>{if((await ruleRegistry()).sourceChanged)throw Error('运行中框架源已变化，恢复锁定版本后再扫描；不能临时替换选图规则')},
 refreshMarket:refreshEod,
 scan:async()=>{
  const before=await latestFire();await mkdir(FIRE_RUNTIME,{recursive:true});
  try{await run(PYTHON,[FIRE_RUNNER,'--mode','all'],{cwd:FIRE_RUNTIME,timeout:12*60*1000,maxBuffer:20*1024*1024,env:{...process.env,PYTHONUNBUFFERED:'1'}})}
  catch(error){const reason=String(error.stderr||error.message).trim().split(/\r?\n/).at(-1)?.slice(0,300);throw Error('全品种扫描失败，已保留上次结果'+(reason?'：'+reason:''))}
  const result=await latestFire();if(result.refreshedAt===before.refreshedAt)throw Error('本次未生成新扫描结果，已保留上次结果');return result;
 },
afterScan:async result=>{await refreshEnvironmentIndex();await refreshContractSpecs(result.data_date);const saved={...result,refreshing:false,refreshError:null};delete saved.refresh;db().prepare('INSERT INTO scan_runs VALUES(?,?,?,?,?,?,?)').run(randomUUID(),result.scan_date||null,result.data_date||null,result.status,result.sourcePath||'',json(saved),now());try{await latestStrength(saved)}catch(error){console.warn('多强空弱快照未完成：'+error.message)}}
});
export async function startFireRefresh(){return fireRefresh.start()}
export async function selectFireCandidate(input={}){const fire=await latestFire(),row=(fire.rows||[]).find(item=>item.code===text(input.code).toUpperCase());if(!row)throw Error('火扫描中没有该品种');const mode=text(input.mode),result=row.modes?.[mode];if(!['多头观察','空头观察'].includes(result))throw Error('该品种未通过所选扫描模式');const accountId=text(input.accountId)||null,existing=db().prepare("SELECT id FROM cards WHERE account_id IS ? AND symbol=? AND contract IS ? AND scan_mode=? AND archived_at IS NULL AND status NOT IN ('拒绝','已结束') ORDER BY updated_at DESC LIMIT 1").get(accountId,row.code,row.main_contract||null,mode);if(existing)return{...getCard(existing.id),reused:true};const archived=db().prepare('SELECT id FROM cards WHERE account_id IS ? AND symbol=? AND contract IS ? AND scan_mode=? AND archived_at IS NOT NULL ORDER BY updated_at DESC LIMIT 1').get(accountId,row.code,row.main_contract||null,mode);if(archived)return{...getCard(archived.id),restoreRequired:true};return saveCard({accountId,symbol:row.code,name:row.name,exchange:row.exchange,contract:row.main_contract,direction:result==='多头观察'?'long':'short',source:`火机会扫描 ${fire.rule_version||RESONANCE_RULE_VERSION}`,scanMode:mode,status:'观察',fire:{scanDate:fire.scan_date,dataDate:row.data_date,mode,modeLabel:MODE_LABELS[mode],result,values:row,sourcePath:fire.sourcePath,evidenceValidUntil:input.evidenceValidUntil||null}})}

export async function summary(accountId){const accounts=listAccounts(),account=accounts.find(item=>item.id===accountId)||accounts.find(item=>item.status==='active')||accounts[0],allCards=listCards(account?{accountId:account.id}:{}),cards=allCards.filter(c=>!c.archivedAt),archivedCards=allCards.filter(c=>c.archivedAt),fire=await latestFire(),rules=await ruleRegistry();const open=cards.filter(card=>!['拒绝','已结束'].includes(card.status));const executions=open.flatMap(card=>listExecutions(card.id));const risk=open.reduce((sum,card)=>sum+(card.plan?.risk?.plannedLoss||0),0);return{account,accounts,balanceChanges:account?balanceChanges(db(),account.id):[],ruleVersion:rules.version,ruleHash:rules.combinedHash,marketDate:fire.data_date||null,scanDate:fire.scan_date||null,fireCounts:fire.counts||{},cards,archivedCards,openCount:open.length,approvedCount:open.filter(card=>card.status==='已批准').length,executionCount:executions.length,plannedRisk:risk,pending:open.filter(card=>['待证据','待触发','已批准'].includes(card.status)).slice(0,8)}}
export function fullCard(id){const card=getCard(id);return card?{...card,planHistory:db().prepare('SELECT * FROM plan_versions WHERE card_id=? ORDER BY version').all(id),executions:listExecutions(id),reviews:reviewForCard(id),trade:tradeSummary(db(),card),supervision:issues(db(),id),timeline:db().prepare('SELECT * FROM operation_events WHERE card_id=? ORDER BY sequence').all(id).map(e=>({action:e.action,createdAt:e.created_at,payload:parse(e.payload_json)})),drafts:draftsFor(db(),id),account:listAccounts().find(a=>a.id===card.accountId)||null}:null}
export function recordTrade(cardId,input){const card=getCard(cardId);if(!card)throw Error('交易卡不存在');db().exec('SAVEPOINT record_trade');try{bindRunCard(db(),cardId);const result=postTrade(db(),card,input);if(card.archivedAt&&!result.duplicate){db().prepare("UPDATE cards SET archived_at=NULL,archive_reason='' WHERE id=?").run(cardId);journal(db(),'实际回报恢复交易卡',{reason:'归档后补录实际成交，重新显示待核对'},cardId)}if(result.anomalies?.length)saveIssue(db(),{cardId,owner:'earth',description:result.anomalies.join('；'),nextAction:'核对成交回报与原计划，记录原因，不改写实际事实'});db().exec('RELEASE record_trade');return{...result,card:fullCard(cardId)}}catch(e){db().exec('ROLLBACK TO record_trade; RELEASE record_trade');throw e}}
export function correctTradePnl(cardId,input){const card=getCard(cardId);if(!card)throw Error('交易卡不存在');const result=correctPnl(db(),card,input);return{...result,card:fullCard(cardId)}}
export function saveExecutionDraft(cardId,input){if(!getCard(cardId))throw Error('交易卡不存在');return saveDraft(db(),cardId,input)}
export function operationArchiveData(){
 const accounts=listAccounts(),cards=listCards().map(c=>({...fullCard(c.id),planHistory:db().prepare('SELECT * FROM plan_versions WHERE card_id=? ORDER BY version').all(c.id).map(p=>({id:p.id,version:p.version,payload:parse(p.payload_json),risk:parse(p.risk_json),status:p.status,evidenceHash:p.evidence_hash,approvedAt:p.approved_at,createdAt:p.created_at}))}));
 return{schemaVersion:4,governance:systemGovernance(),exportedAt:now(),accounts,cards,accountEntries:accounts.flatMap(a=>accountEntries(db(),a.id)),balanceChanges:accounts.flatMap(a=>balanceChanges(db(),a.id)),balanceAudit:db().prepare('SELECT * FROM balance_audit ORDER BY rowid').all(),deletedAccounts:db().prepare('SELECT * FROM account_deletions ORDER BY rowid').all(),
 events:db().prepare('SELECT * FROM operation_events ORDER BY sequence').all().map(e=>({sequence:e.sequence,cardId:e.card_id,action:e.action,payload:parse(e.payload_json),createdAt:e.created_at})),changes:listChanges()};
}
export async function backup(){return{...operationArchiveData(),rules:await ruleRegistry()}}
import {latestStrength} from './relative-strength.mjs';
