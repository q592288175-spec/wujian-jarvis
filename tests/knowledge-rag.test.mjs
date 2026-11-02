import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {rules} from '../finance.mjs';

const project=resolve(import.meta.dirname,'..');
const python=resolve(project,'.venv-akshare','Scripts','python.exe');
const script=resolve(project,'integrations','knowledge_rag.py');

function run(base,...args){
 const result=spawnSync(python,['-X','utf8',script,'--db',join(base,'knowledge.sqlite'),'--cache',join(base,'models'),'--root',join(base,'corpus'),...args],{encoding:'utf8',windowsHide:true});
 assert.equal(result.status,0,result.stderr||result.stdout);
 return JSON.parse(result.stdout.trim());
}

test('local knowledge indexes incrementally, deduplicates and degrades without vectors',async()=>{
 await mkdir(resolve('output/final-release/tests'),{recursive:true});
 const base=await mkdtemp(resolve('output/final-release/tests/rag-'));
 try{
  const corpus=join(base,'corpus'),current=join(corpus,'01_系统'),history=join(corpus,'98_历史');
  await mkdir(current,{recursive:true});await mkdir(history,{recursive:true});
  const active=join(current,'当前规则.md');
  await writeFile(active,'# 当前风险规则\n\n组合风险池上限5%，以当前系统手册为准。','utf8');
  await writeFile(join(current,'当前规则副本.md'),'# 当前风险规则\n\n组合风险池上限5%，以当前系统手册为准。','utf8');
  await writeFile(join(history,'旧规则.md'),'# 历史风险规则\n\n组合风险池上限9%，本文件已经退出。','utf8');
  const built=run(base,'reindex','--full','--no-embeddings');
  assert.equal(built.failed,0);assert.equal(built.duplicates,1);assert.equal(built.embeddingStatus,'degraded');
  const found=run(base,'search','组合风险池上限5%','--limit','4');
  assert.equal(found.degraded,true);assert.match(found.hits[0].path,/当前规则/);assert.equal(found.hits[0].lifecycle,'current');
  const source=run(base,'source',String(found.hits[0].chunkId));
  assert.match(source.content,/5%/);
  await writeFile(active,'# 当前风险规则\n\n组合风险池上限6%，以当前系统手册为准。','utf8');
  const changed=run(base,'reindex','--no-embeddings');
  assert.ok(changed.parsed>=1);assert.ok(changed.skipped>=1);
  const updated=run(base,'search','组合风险池上限6%','--limit','2');
  assert.match(updated.hits[0].excerpt,/6%/);
 }finally{await rm(base,{recursive:true,force:true})}
});

test('现行规则工具只读取已核验清单，历史2万手不得冒充现行',async()=>{
 const result=await rules();
 assert.equal(result.error,undefined);
 assert.equal(result.documents.length,6);
 assert.ok(result.documents.some(d=>d.name==='金四法与本人审定'&&d.text.includes('gold-2026-10-19-v1')));
 assert.ok(result.documents.some(d=>d.name==='金独立分时第五法'&&d.text.includes('gold-2026-10-26-v2')&&d.text.includes('最新余额×0.5%')));
 assert.ok(result.documents.every(item=>item.lifecycle==='current'&&item.sha256&&item.text.length>100));
 assert.match(result.documents[0].text,/严格大于10,000/);
 assert.match(result.documents[0].text,/周K与日K高低点结构仅辅助显示/);
 assert.deepEqual(result.conflicts,[]);
});
