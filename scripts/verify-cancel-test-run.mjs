import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';

const checkpoint=resolve(process.argv[2]||'.runtime/checkpoints/accounts-2026-10-12T00-11-59-395Z');
const cardId='edc595b9-233e-43cd-a2ce-3553aec333b4';
const planId='361e5844-3047-4a5a-9906-d95bca014a93';
const runId='90276353-b76c-47be-b875-de115c545e36';
const old=new DatabaseSync(join(checkpoint,'business.sqlite'),{readOnly:true});
const db=new DatabaseSync(resolve('.runtime/five-workbench.sqlite'),{readOnly:true});
const rows=(conn,table)=>conn.prepare(`SELECT * FROM "${table}" ORDER BY rowid`).all();
const unchangedExcept=(table,id,fields)=>{
 const before=rows(old,table),after=rows(db,table);
 assert.equal(after.length,before.length,table+' count');
 for(let i=0;i<before.length;i++){
  const expected={...before[i]},actual={...after[i]};
  if(expected.id===id)for(const field of fields){delete expected[field];delete actual[field]}
  assert.deepEqual(actual,expected,table+' original fields');
 }
};
try{
 const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(row=>row.name);
 const changed=['cards','plan_versions','system_runs','released_reservations','operation_events'];
 for(const table of tables.filter(name=>!changed.includes(name)))assert.deepEqual(rows(db,table),rows(old,table),table+' changed');
 unchangedExcept('cards',cardId,['archived_at','archive_reason','updated_at']);
 unchangedExcept('plan_versions',planId,['status']);
 unchangedExcept('system_runs',runId,['status','ended_at','result']);
 const card=db.prepare('SELECT * FROM cards WHERE id=?').get(cardId);
 const plan=db.prepare('SELECT * FROM plan_versions WHERE id=?').get(planId);
 const run=db.prepare('SELECT * FROM system_runs WHERE id=?').get(runId);
 assert.ok(card.archived_at&&card.archive_reason);
 assert.equal(plan.status,'已取消');
 assert.equal(run.status,'已结束');
 assert.ok(run.ended_at&&run.result);
 assert.equal(db.prepare("SELECT COUNT(*) AS n FROM system_runs WHERE status='运行中'").get().n,0);
 const reservationsBefore=rows(old,'released_reservations'),reservationsAfter=rows(db,'released_reservations');
 assert.deepEqual(reservationsAfter.filter(row=>row.plan_id!==planId),reservationsBefore.filter(row=>row.plan_id!==planId));
 assert.equal(reservationsAfter.filter(row=>row.plan_id===planId).length,1);
 const eventsBefore=rows(old,'operation_events'),eventsAfter=rows(db,'operation_events');
 assert.deepEqual(eventsAfter.slice(0,eventsBefore.length),eventsBefore);
 assert.deepEqual(eventsAfter.slice(eventsBefore.length).map(row=>row.action),['取消计划并归档交易卡','结束系统运行']);
 assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 const get=async path=>{const response=await fetch('http://127.0.0.1:4318'+path);assert.equal(response.status,200,path);return response.json()};
 const summary=await get('/api/workbench/summary?accountId='+card.account_id);
 assert.ok(!summary.cards.some(row=>row.id===cardId));
 assert.ok(summary.archivedCards.some(row=>row.id===cardId));
 const rules=await get('/api/workbench/rules');
 assert.ok(!rules.sourceChanged&&!rules.runId);
 const governance=await get('/api/workbench/governance');
 assert.equal(governance.active,null);
 assert.equal(governance.history.find(row=>row.id===runId).status,'已结束');
 const result={passed:true,at:new Date(Date.now()+8*3600000).toISOString().replace('Z','+08:00'),checkpoint,cardId,planId,runId,
  archivedAt:card.archived_at,planStatus:plan.status,runStatus:run.status,
  counts:Object.fromEntries(tables.map(table=>[table,rows(db,table).length])),
  assertions:{accountsAndBalancesUnchanged:true,researchAndApprovalHistoryPreserved:true,otherCardsAndPlansUnchanged:true,roundBudgetsUnchanged:true,lockedSnapshotUnchanged:true,oldAuditPreserved:true,newAuditEvents:2,removedFromActiveQueue:true,availableInArchive:true,noActiveOldRun:true,noSourceChangeBlock:true,integrityCheck:'ok'}};
 const output=resolve('output/plan-lifecycle');await mkdir(output,{recursive:true});
 await writeFile(join(output,'cancel-test-run-verification.json'),JSON.stringify(result,null,2));
 console.log(JSON.stringify(result));
}finally{old.close();db.close()}
