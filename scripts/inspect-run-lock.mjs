import {DatabaseSync} from 'node:sqlite';
import {mkdir,writeFile,readFile,copyFile} from 'node:fs/promises';
import {resolve,join,basename} from 'node:path';
import {createHash} from 'node:crypto';
const root=resolve('.'),out=resolve('output/plan-lifecycle/lock-diff');
await mkdir(out,{recursive:true});
const db=new DatabaseSync(resolve('.runtime/five-workbench.sqlite'),{readOnly:true});
const run=db.prepare("SELECT * FROM system_runs WHERE status='运行中'").get();
const snapshot=JSON.parse(run.snapshot_json),diffs=[];
for(const f of snapshot.files){
 const current=await readFile(f.path).catch(()=>null),sha256=current&&createHash('sha256').update(current).digest('hex');
 if(sha256===f.sha256)continue;
 const saved=snapshot.contents.find(x=>x.path===f.path);
 const original=join(out,'locked-'+basename(f.path)),latest=join(out,'current-'+basename(f.path));
 if(saved)await writeFile(original,saved.content);
 if(current)await copyFile(f.path,latest);
 diffs.push({name:f.name,path:f.path,oldHash:f.sha256,currentHash:sha256,original,latest});
}
const result={runId:run.id,startedAt:run.started_at,comparedAt:new Date().toISOString(),diffs};
await writeFile(join(out,'report.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));db.close();
