import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
const checkpoint=resolve(process.argv[2]||'.runtime/checkpoints/accounts-2026-10-11T23-08-34-762Z');
const before=JSON.parse(await readFile(resolve(checkpoint,'before.json'),'utf8'));
const w=await import('../integrations/five-workbench.mjs');const accounts=w.listAccounts();
const db=new DatabaseSync(resolve('.runtime/five-workbench.sqlite'),{readOnly:true}),result={passed:true,at:new Date().toISOString(),checkpoint,tables:{}};
for(const [table,rows] of Object.entries(before)){
 const current=JSON.parse(JSON.stringify(db.prepare('SELECT * FROM '+table+' ORDER BY rowid').all()));
 const changes=[];
 const primary=table==='operation_events'?'sequence':'id';
 for(const row of rows){const found=current.find(x=>x[primary]===row[primary]);assert.ok(found,table+' lost '+row[primary]);for(const key of Object.keys(row)){if(table==='accounts'&&['is_default','revision'].includes(key))continue;if(JSON.stringify(row[key])!==JSON.stringify(found[key]))changes.push({id:row[primary],key})}}
 assert.deepEqual(changes,[],table+' changed');assert.equal(current.length,rows.length,table+' unexpected rows');result.tables[table]={before:rows.length,after:current.length,originalValuesPreserved:true};
}
assert.equal(accounts.length,4);assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
result.integrity='ok';result.unboundCards=db.prepare('SELECT count(*) AS n FROM cards WHERE account_id IS NULL').get().n;
result.initialCapitalNeedsConfirmation=accounts.filter(a=>a.initialCapital===null).map(a=>({id:a.id,alias:a.alias}));
const rules=await w.ruleRegistry();result.activeRun=rules.runId||null;result.lockedSourceChanged=Boolean(rules.sourceChanged);
db.close();await mkdir(resolve('output/account-balances'),{recursive:true});await writeFile(resolve('output/account-balances/preservation.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
