import {readFile,writeFile,readdir,stat,copyFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {databaseManifest} from './system-backup.mjs';
const stage=resolve('.runtime/private-distribution/小木完整迁移包_20261104'),project=join(stage,'小木工作台/wujian-jarvis');
const payload=JSON.parse(await readFile(join(project,'.runtime/migration/credentials.json'),'utf8'));
const python={};for(const name of ['.venv-akshare','.venv-data']){
 const imports=name==='.venv-akshare'?'akshare,pandas,sqlite3,bs4':'yfinance,pandas_datareader';
 const result=JSON.parse(execFileSync(join(project,name,'Scripts/python.exe'),['-c',`import sys,json,${imports};print(json.dumps({"isolated":sys.flags.isolated,"version":sys.version.split()[0],"paths":sys.path}))`],{cwd:project,encoding:'utf8',windowsHide:true}));
 if(!result.isolated||result.paths.some(p=>resolve(p)!==stage&&!resolve(p).startsWith(stage+'\\')))throw Error('Python仍依赖包外路径');python[name]=result;
}
const databases={},counts={files:0,bytes:0};
async function walk(dir){for(const e of await readdir(dir,{withFileTypes:true})){const p=join(dir,e.name);if(e.isDirectory())await walk(p);else{counts.files++;counts.bytes+=(await stat(p)).size;if(/\.(sqlite|db)$/.test(p))databases[p.slice(stage.length+1).replaceAll('\\','/')]=databaseManifest(p)}}}
await walk(stage);
const result={private:true,createdAt:new Date().toISOString(),stage,project,counts,databases,credentialPaths:payload.entries.map(e=>e.path),imaClientIncluded:payload.imaClientIncluded,python,exclusions:['Git内部目录','旧桌面构建、旧备份和测试输出','数据库WAL/SHM（已进行SQLite一致性备份）']};
await writeFile(join(stage,'私密迁移清单.json'),JSON.stringify(result,null,2));await writeFile('output/deployment-2026-11-04/package-stage.json',JSON.stringify({stage,project,counts,credentials:result.credentialPaths},null,2));console.log(JSON.stringify({files:counts.files,GiB:(counts.bytes/1024**3).toFixed(2),databases:Object.keys(databases).length,credentials:result.credentialPaths.length,isolatedPython:true}));
