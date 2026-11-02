import {DatabaseSync,backup} from 'node:sqlite';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import assert from 'node:assert/strict';
const base='http://127.0.0.1:4318',out=resolve('output/gold-chart-demo');await mkdir(out,{recursive:true});
const api=async(path,input)=>{const r=await fetch(base+path,input?{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify(input)}:{});const v=await r.json();if(!r.ok)throw Error(v.error);return v};
const ids=['e35d67e5-1042-46c0-8afb-6725df7c4025','5077357a-43e4-47af-85a4-f68c4023eb15'];
assert.ok(process.argv.includes('--apply-confirmed'),'Only run with current user authorization');
assert.equal((await api('/api/workbench/governance')).active,null,'运行中不调整档位');
const verifyFrom=process.argv.find(x=>x.startsWith('--verify-from='))?.slice(14);
const before=verifyFrom?JSON.parse(await readFile(join(verifyFrom,'accounts-before.json'),'utf8')):await api('/api/workbench/accounts'),targets=ids.map(id=>before.find(a=>a.id===id));
assert.ok(targets.every(a=>a?.mode==='real'&&['unknown','normal'].includes(a.tier)&&!a.stopped));
const stamp=new Date().toISOString().replace(/[:.]/g,'-'),checkpoint=verifyFrom||resolve('.runtime/checkpoints','gold-accounts-'+stamp);
if(!verifyFrom){await mkdir(checkpoint,{recursive:true});const d=new DatabaseSync('.runtime/five-workbench.sqlite',{readOnly:true});await backup(d,join(checkpoint,'business.sqlite'));d.close();
 await writeFile(join(checkpoint,'accounts-before.json'),JSON.stringify(before,null,2));
 for(const a of targets)if(a.tier==='unknown')await api('/api/workbench/accounts',{id:a.id,revision:a.revision,updatedAt:a.updatedAt,tier:'normal'});
}
const after=await api('/api/workbench/accounts'),ignore=new Set(['tier','updatedAt','revision']);
for(const a of before){const b=after.find(x=>x.id===a.id);for(const k of Object.keys(a))if(!ids.includes(a.id)||!ignore.has(k))assert.deepEqual(b[k],a[k],`${a.alias}: ${k} 不应改变`)}
for(const a of targets){const b=after.find(x=>x.id===a.id);assert.equal(b.tier,'normal');assert.equal(b.revision,a.revision+(a.tier==='unknown'?1:0))}
const rows=ids.map(id=>{const a=after.find(x=>x.id===id);return{id,alias:a.alias,tier:a.tier,equity:a.equity,lastSyncAt:a.lastSyncAt,smallBudget:a.equity*.005,dayBudget:a.equity*.01}});
const original=new DatabaseSync(join(checkpoint,'business.sqlite'),{readOnly:true}),current=new DatabaseSync('.runtime/five-workbench.sqlite',{readOnly:true});
try{for(const table of ['plan_versions','executions','account_entries','round_budgets'])assert.deepEqual(current.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all(),original.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all(),`${table} 应保持不变`)}finally{original.close();current.close()}
await writeFile(join(out,'account-check.json'),JSON.stringify({verifiedAt:new Date().toISOString(),checkpoint,rows,before,after,unchanged:'余额、初始/阶段本金、高点、恢复线、停机、保证金/可用资金/品种限制、其他账户；本次只设现有正常档，不改风控规则',accountEquityVerifiedAgainstBroker:false},null,2));
console.log(JSON.stringify({checkpoint,rows}));
