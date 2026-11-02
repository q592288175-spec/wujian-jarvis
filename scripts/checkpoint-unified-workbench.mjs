import {cp,mkdir,readFile,readdir,writeFile,stat} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {resolve,join,relative} from 'node:path';
import {createHash} from 'node:crypto';
import {DatabaseSync,backup} from 'node:sqlite';
import {databaseManifest} from './system-backup.mjs';
const root=resolve('.'),resume=process.argv[2],destination=resolve(resume||'.runtime/checkpoints/unified-workbench-'+new Date().toISOString().replace(/[:.]/g,'-'));
if(!root.startsWith('D:\\五简个人资料\\')||!destination.startsWith(root+'\\'))throw Error('备份路径越界');
await mkdir(destination,{recursive:true});
const manifest={createdAt:new Date().toISOString(),root,destination,files:[],databases:{},rules:null};
for(const name of ['dist','desktop','integrations','scripts','tests','package.json','package-lock.json','server.mjs','AGENTS.md','.env','.env.example']){
 if(!resume&&existsSync(name))await cp(name,join(destination,name),{recursive:true,dereference:false});
}
async function walk(folder){for(const e of await readdir(folder,{withFileTypes:true})){const path=join(folder,e.name);if(e.isDirectory())await walk(path);else if(e.isFile())manifest.files.push({path:relative(destination,path),bytes:(await stat(path)).size,sha256:createHash('sha256').update(await readFile(path)).digest('hex')})}}
await walk(destination);
for(const name of ['.runtime/five-workbench.sqlite','.runtime/market-panorama/market.sqlite','.runtime/knowledge/knowledge.sqlite','.runtime/monitor/monitor.sqlite']){
 if(!existsSync(name))continue;const target=join(destination,name);if(!resume){await mkdir(resolve(target,'..'),{recursive:true});const db=new DatabaseSync(name,{readOnly:true});try{await backup(db,target)}finally{db.close()}}
 manifest.databases[name]=databaseManifest(target);if(manifest.databases[name].integrity!=='ok')throw Error('数据库备份校验失败：'+name);
}
manifest.rules=await fetch('http://127.0.0.1:4318/api/workbench/rules').then(r=>{if(!r.ok)throw Error('规则状态读取失败');return r.json()});
await writeFile(join(destination,'manifest.json'),JSON.stringify(manifest,null,2));
await mkdir('output/unified-workbench-2026-10-25',{recursive:true});await writeFile('output/unified-workbench-2026-10-25/checkpoint.json',JSON.stringify({destination},null,2));
console.log(JSON.stringify({destination,files:manifest.files.length,bytes:manifest.files.reduce((s,f)=>s+f.bytes,0),databases:Object.keys(manifest.databases),ruleHash:manifest.rules.combinedHash}));
