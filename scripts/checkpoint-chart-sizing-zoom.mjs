import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {DatabaseSync,backup} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {databaseManifest} from './system-backup.mjs';
const root=resolve('.'),folder=resolve('.runtime/checkpoints/chart-sizing-zoom-'+new Date().toISOString().replace(/[:.]/g,'-')),out='output/chart-sizing-zoom-2026-10-25';
if(!folder.startsWith('D:\\五简个人资料\\'))throw Error('备份目录越界');await mkdir(folder,{recursive:true});await mkdir(out,{recursive:true});
const files=['dist/workbench.js','dist/gold-chart.js','dist/gold-ui.js','dist/gold-ui.css','dist/market-panorama.js','desktop/main.cjs','desktop/preload.cjs','scripts/build-desktop.mjs','tests/gold-chart.test.mjs'];
const manifest={root,folder,createdAt:new Date().toISOString(),files:[]};
for(const file of files){const data=await readFile(file),target=join(folder,file);await mkdir(dirname(target),{recursive:true});await copyFile(file,target);manifest.files.push({path:file,sha256:createHash('sha256').update(data).digest('hex')})}
const target=join(folder,'business.sqlite'),db=new DatabaseSync('.runtime/five-workbench.sqlite',{readOnly:true});try{await backup(db,target)}finally{db.close()}
manifest.business=databaseManifest(target);manifest.rules=await fetch('http://127.0.0.1:4318/api/workbench/rules').then(r=>r.json());await writeFile(join(folder,'manifest.json'),JSON.stringify(manifest,null,2));await writeFile(out+'/checkpoint.json',JSON.stringify({folder},null,2));console.log(JSON.stringify({folder,files:files.length,businessTables:Object.keys(manifest.business.tables).length,ruleHash:manifest.rules.combinedHash}));
