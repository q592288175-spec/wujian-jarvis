import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import assert from 'node:assert/strict';
import {databaseManifest} from './system-backup.mjs';
const out='output/unified-workbench-2026-10-25',checkpoint=JSON.parse(await readFile(out+'/checkpoint.json')).destination,baseline=JSON.parse(await readFile(checkpoint+'/manifest.json'));
const actual=databaseManifest('.runtime/five-workbench.sqlite');assert.deepEqual(actual,baseline.databases['.runtime/five-workbench.sqlite']);
const rules=await fetch('http://127.0.0.1:4318/api/workbench/rules').then(r=>r.json());assert.equal(rules.combinedHash,baseline.rules.combinedHash);assert.equal(rules.currentSourceHash,baseline.rules.currentSourceHash);
const ruleFiles=[];for(const item of baseline.rules.files){if(!item.available)continue;const hash=createHash('sha256').update(await readFile(item.path)).digest('hex');assert.equal(hash,item.sha256,item.name);ruleFiles.push({name:item.name,unchanged:true})}
const knowledge=new DatabaseSync('.runtime/knowledge/knowledge.sqlite',{readOnly:true}),knowledgeTables=[];
try{for(const [name,table]of Object.entries(baseline.databases['.runtime/knowledge/knowledge.sqlite'].tables)){const count=knowledge.prepare('SELECT COUNT(*) AS n FROM "'+name.replaceAll('"','""')+'"').get().n;assert.equal(count,table.count,'知识库表记录数：'+name);knowledgeTables.push({name,count})}}finally{knowledge.close()}
const result={at:new Date().toISOString(),checkpoint,businessIntegrity:actual.integrity,businessTables:Object.entries(actual.tables).map(([name,t])=>({name,count:t.count,sha256:t.sha256})),allBusinessRowsUnchanged:true,ruleHash:rules.combinedHash,ruleFiles,knowledgeTables,voiceCredentialsPrinted:false};await writeFile(out+'/preservation-verification.json',JSON.stringify(result,null,2));console.log(JSON.stringify({businessTables:result.businessTables.length,businessRows:result.businessTables.reduce((s,t)=>s+t.count,0),businessUnchanged:true,ruleFiles:ruleFiles.length,ruleHash:rules.combinedHash,knowledgeTables:knowledgeTables.length}));
