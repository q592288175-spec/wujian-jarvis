import {createRequire} from 'node:module';
import {resolve,join,relative,dirname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {DatabaseSync,backup} from 'node:sqlite';

// A backup must copy the ASAR bytes, not Electron's virtual archive directory.
const fs=createRequire(import.meta.url)(process.versions.electron?'original-fs':'node:fs');
const {createReadStream}=fs;
const {mkdir,readdir,stat,copyFile,writeFile,readFile}=fs.promises;
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const bj=()=>new Date(Date.now()+28800000).toISOString().replace('Z','+08:00');
const hash=async path=>{const h=createHash('sha256');for await(const part of createReadStream(path))h.update(part);return h.digest('hex')};
const json=value=>JSON.stringify(value,(_,v)=>typeof v==='bigint'?v.toString():v);
const sqlName=s=>'"'+s.replaceAll('"','""')+'"';
export function databaseManifest(path){
 const db=new DatabaseSync(path,{readOnly:true});
 try{const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
 return{integrity:db.prepare('PRAGMA integrity_check').get().integrity_check,tables:Object.fromEntries(tables.map(({name})=>{const q=db.prepare(`SELECT * FROM ${sqlName(name)}`);q.setReadBigInts(true);let count=0;const h=createHash('sha256');for(const row of q.iterate()){count++;h.update(json(row)+'\n')}return[name,{count,sha256:h.digest('hex')}] }))};
 }finally{db.close()}
}
function inside(base,path){const rel=relative(base,path);return rel&&!rel.startsWith('..')&&!resolve(path).includes('\0')&&!rel.includes(':')}
async function walk(base,onFile,skip=()=>false,parts=[]){
 for(const e of await readdir(join(base,...parts),{withFileTypes:true})){const next=[...parts,e.name],rel=next.join('/');if(skip(rel,e))continue;if(e.isSymbolicLink())throw Error('备份范围含联接，需明确处理：'+rel);if(e.isDirectory())await walk(base,onFile,skip,next);else if(e.isFile())await onFile(join(base,...next),rel)}
}
const runtimeRoots=new Set(['knowledge','monitor','private','feishu','research-reports','postmarket-reviews','rule-history','environment','fire-scan','relative-strength','contract-specs','refresh-history','python313','monitor-deps','desktop-build','desktop-stage']);
function excluded(rel,e){
 const p=rel.split('/');
 if(['.git','output','.playwright-cli','.pytest_cache'].includes(p[0]))return true;
 if(p.includes('__pycache__')||p.includes('.pytest_cache'))return true;
 if(p[0]==='.runtime'&&p.length>1&&e.isDirectory()&&p.length===2&&!runtimeRoots.has(p[1]))return true;
 if(p[0]==='.runtime'&&p.length===2&&!e.isDirectory()&&(/\.log$|\.pid$|\.lock$|playwright|\.png$/.test(p[1])))return true;
 return /-(?:wal|shm)$/.test(rel);
}
export async function createSystemBackup({root=ROOT,destination,includeDependencies=true}={}){
 const folder=resolve(destination||join(ROOT,'.runtime/checkpoints','final-'+new Date().toISOString().replace(/[:.]/g,'-')));
 if(!inside(ROOT,folder))throw Error('恢复点必须保存在当前项目内');
 await mkdir(dirname(folder),{recursive:true});await mkdir(folder,{recursive:false});
 const manifest={version:1,status:'copying',createdAt:bj(),project:root,private:true,includeDependencies,exclusions:['旧检查点','旧构建变体','测试输出','Git内部目录','缓存日志','SQLite WAL/SHM（已合并快照）'],files:[],databases:{}};
 await writeFile(join(folder,'manifest.json'),JSON.stringify(manifest,null,2));
 const collect=async(source,rel)=>{const target=join(folder,rel);await mkdir(dirname(target),{recursive:true});
  if(/\.(?:sqlite|db)$/.test(source)){let db;try{db=new DatabaseSync(source,{readOnly:true});await backup(db,target);manifest.databases[rel]=databaseManifest(target)}finally{db?.close()}}
  else{let stable=false;for(let attempt=0;attempt<3;attempt++){const before=await stat(source);await copyFile(source,target);const after=await stat(source);if(before.size===after.size&&before.mtimeMs===after.mtimeMs){stable=true;break}}if(!stable)throw Error('文件持续变化，请稍后备份：'+rel)}
  manifest.files.push({path:rel,bytes:(await stat(target)).size,sha256:await hash(target)});
  if(manifest.files.length%500===0)console.log(JSON.stringify({phase:'copying',files:manifest.files.length}));
 };
 await walk(root,(src,rel)=>collect(src,'project/'+rel),(rel,e)=>excluded(rel,e)||(!includeDependencies&&['node_modules','.venv-akshare','.venv-data'].includes(rel.split('/')[0])));
 const materials=resolve(root,'../资料包');
 await walk(materials,(src,rel)=>collect(src,'materials/'+rel),(rel)=>rel.split('/').some(p=>['.git','__pycache__','.runtime','.pytest_cache'].includes(p)));
 manifest.status='complete';manifest.completedAt=bj();manifest.totalBytes=manifest.files.reduce((n,f)=>n+f.bytes,0);
 await writeFile(join(folder,'manifest.json'),JSON.stringify(manifest,null,2));
 return{folder,files:manifest.files.length,bytes:manifest.totalBytes,databases:Object.keys(manifest.databases)};
}
export async function verifySystemBackup(folder,{restoreTo}={}){
 folder=resolve(folder);if(!inside(ROOT,folder))throw Error('仅校验本项目恢复点');
 const manifest=JSON.parse(await readFile(join(folder,'manifest.json'),'utf8'));if(manifest.status!=='complete')throw Error('备份未完成');
 if(restoreTo){restoreTo=resolve(restoreTo);if(!inside(resolve(ROOT,'output'),restoreTo))throw Error('演练只能恢复到项目output下的新目录');await mkdir(dirname(restoreTo),{recursive:true});await mkdir(restoreTo,{recursive:false})}
 for(const item of manifest.files){const path=resolve(folder,item.path);if(!inside(folder,path))throw Error('备份路径越界');if(await hash(path)!==item.sha256)throw Error('哈希不符：'+item.path);if(restoreTo){const dst=resolve(restoreTo,item.path);if(!inside(restoreTo,dst))throw Error('恢复路径越界');await mkdir(dirname(dst),{recursive:true});await copyFile(path,dst);if(await hash(dst)!==item.sha256)throw Error('恢复校验失败：'+item.path)}}
 for(const [path,expected]of Object.entries(manifest.databases)){const actual=databaseManifest(join(restoreTo||folder,path));if(json(actual)!==json(expected)||actual.integrity!=='ok')throw Error('数据库恢复校验失败：'+path)}
 const result={verifiedAt:bj(),folder,restoredTo:restoreTo||null,files:manifest.files.length,databases:Object.keys(manifest.databases),ok:true};
 await writeFile(join(folder,restoreTo?'restore-verification.json':'verification.json'),JSON.stringify(result,null,2));return result;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [command,arg,dest]=process.argv.slice(2);
 try{console.log(JSON.stringify(command==='verify'?await verifySystemBackup(arg,{restoreTo:dest}):await createSystemBackup({destination:arg,includeDependencies:!process.argv.includes('--no-dependencies')})))}catch(e){console.error(e.message);process.exitCode=1}
}
