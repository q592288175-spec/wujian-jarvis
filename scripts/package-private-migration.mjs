// Owner-authorized private transfer. Output contains accounts and recoverable API credentials.
import {mkdir,readdir,stat,readFile,writeFile,copyFile,cp} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {resolve,join,relative,dirname,basename} from 'node:path';
import {execFileSync} from 'node:child_process';
import {DatabaseSync,backup} from 'node:sqlite';
import {homedir} from 'node:os';
import {protectLocalSecret} from '../integrations/local-secret.mjs';
import {databaseManifest} from './system-backup.mjs';

const root=resolve('.'),stage=resolve(process.env.WUJIAN_PRIVATE_PACKAGE_STAGE||'.runtime/private-distribution/小木完整迁移包_20261104'),project=join(stage,'小木工作台/wujian-jarvis');
if(!stage.startsWith(join(root,'.runtime/private-distribution')+'\\')||existsSync(stage))throw Error('请使用项目内全新的私密迁移目录');
await mkdir(project,{recursive:true});const databases={},counts={files:0,bytes:0},excluded=new Set(['.git','__pycache__','.pytest_cache','.DS_Store']);
async function copy(source,target){
 const info=await stat(source);if(info.isDirectory()){await mkdir(target,{recursive:true});for(const e of await readdir(source,{withFileTypes:true})){if(excluded.has(e.name)||/\.pyc$|-(?:wal|shm)$/.test(e.name)||/\.lock$|\.pid$|\.tmp$/.test(e.name))continue;await copy(join(source,e.name),join(target,e.name))}return}
 await mkdir(dirname(target),{recursive:true});
 if(/\.(sqlite|db)$/.test(source)){
  const db=new DatabaseSync(source,{readOnly:true});try{await backup(db,target)}finally{db.close()}databases[relative(stage,target).replaceAll('\\','/')]=databaseManifest(target);
 }else{let stable=false;for(let i=0;i<3;i++){const before=await stat(source);await copyFile(source,target);const after=await stat(source);if(before.size===after.size&&before.mtimeMs===after.mtimeMs){stable=true;break}}if(!stable)throw Error('文件持续变化，快照未完成：'+relative(root,source))}
 counts.files++;counts.bytes+=info.size;
}
for(const dir of ['dist','desktop','integrations','futures_data','scripts','tests','knowledge','research-skills','vendor','mcp','docs','data','contract-bars','.wujian-futures-multi-cycle-scan','操作记录'])if(existsSync(dir)){await copy(resolve(dir),join(project,dir));console.log(JSON.stringify({stage:dir,files:counts.files}))}
for(const e of await readdir(root,{withFileTypes:true}))if(e.isFile()&&(/\.(mjs|json|md|txt|command)$/.test(e.name)||['.env','.env.example','.gitignore'].includes(e.name)))await copy(join(root,e.name),join(project,e.name));
await copy(join(root,'node_modules'),join(project,'node_modules'));console.log(JSON.stringify({stage:'node_modules',files:counts.files}));
const live=['akshare','alert-speech','contract-specs','data','environment','feishu','fire-scan','im-chat','knowledge','market-panorama','monitor','monitor-deps','postmarket-reviews','private','python313','refresh-history','relative-strength','research-reports','rule-history','trend-monitor','ui-preferences','vendor'];
for(const name of live)if(existsSync(join(root,'.runtime',name))){await copy(join(root,'.runtime',name),join(project,'.runtime',name));console.log(JSON.stringify({stage:'.runtime/'+name,files:counts.files}))}
for(const e of await readdir(join(root,'.runtime'),{withFileTypes:true}))if(e.isFile()&&/\.(?:sqlite|json)$/.test(e.name)&&!/(?:test|playwright|verification|maintenance-backup)/.test(e.name))await copy(join(root,'.runtime',e.name),join(project,'.runtime',e.name));
await copy(resolve('../资料包'),join(stage,'小木工作台/资料包'));
for(const name of ['1_交易/团队与私募/2026-10-04_五行交易团队职责框架_v1.0.md','4_技能/交易/wujian-ekb-advisor/references/03_当前边界与工作接口.md','2_研究/五简知识库/主题/T07_团队协作与独立复核.md'])if(existsSync(resolve('../..',name)))await copy(resolve('../..',name),join(stage,name));

// Venv launchers contain machine-specific paths. Replace them with an isolated local interpreter.
const base=resolve('.runtime/python313');
for(const name of ['.venv-akshare','.venv-data']){
 const scripts=join(project,name,'Scripts');await mkdir(scripts,{recursive:true});
 for(const e of await readdir(base,{withFileTypes:true}))if(e.isFile()&&/^(?:python.*\.(?:exe|dll|zip)|vcruntime.*\.dll|LICENSE.*)$/i.test(e.name))await copy(join(base,e.name),join(scripts,e.name));
 for(const folder of ['Lib','DLLs'])await cp(join(base,folder),join(scripts,folder),{recursive:true,filter:p=>!['site-packages','__pycache__'].includes(basename(p))&&!p.endsWith('.pyc')});
 await copy(resolve(name,'Lib/site-packages'),join(project,name,'Lib/site-packages'));
 await writeFile(join(scripts,'python313._pth'),'.\nLib\nDLLs\n../Lib/site-packages\n../../\n../../scripts\n../../integrations\n../../../资料包/技能包/wujian-futures-multi-cycle-scan/scripts\nimport site\n');
 console.log(JSON.stringify({stage:name,files:counts.files}));
}
const standalone=join(project,'.runtime/python313');await writeFile(join(standalone,'python313._pth'),'.\nLib\nDLLs\n../monitor-deps\n../../\n../../integrations\nimport site\n');
await mkdir(join(project,'.runtime/node'),{recursive:true});await copyFile(process.execPath,join(project,'.runtime/node/node.exe'));
await copy(resolve('.runtime/desktop-portable-20261104/小木-win32-x64'),join(project,'.runtime/desktop-build/小木-win32-x64'));

const paths=['.runtime/private/voice.enc','.runtime/private/weixin-connection.enc','.runtime/feishu/connection.enc','.runtime/monitor/tq-login.enc'],entries=[];
for(const path of paths)if(existsSync(resolve(path))){const envelope=JSON.parse(await readFile(path,'utf8'));if(envelope.format!=='windows-dpapi-v1')throw Error('无法识别的凭据格式：'+path);entries.push({path,value:await protectLocalSecret(envelope,'decrypt')})}
const extraEnv={};for(const [key,name]of [['IMA_CLIENT_ID','client_id'],['IMA_API_KEY','api_key']]){try{const value=(await readFile(join(homedir(),'.config/ima',name),'utf8')).trim();if(value)extraEnv[key]=value}catch{}}
const client=join(homedir(),'.codex/skills/ima-skill/ima_api.cjs'),imaClientIncluded=existsSync(client);
if(imaClientIncluded){await mkdir(join(project,'vendor/ima-client'),{recursive:true});await copyFile(client,join(project,'vendor/ima-client/ima_api.cjs'))}
await mkdir(join(project,'.runtime/migration'),{recursive:true});await writeFile(join(project,'.runtime/migration/credentials.json'),JSON.stringify({private:true,format:'xiaomu-owner-migration-v1',entries,extraEnv,imaClientIncluded}));
const py=join(project,'.venv-akshare/Scripts/python.exe');const pyCheck=JSON.parse(execFileSync(py,['-c','import sys,json,akshare,pandas,sqlite3,bs4; print(json.dumps({"isolated":sys.flags.isolated,"version":sys.version.split()[0],"akshare":akshare.__version__,"paths":sys.path}))'],{cwd:project,encoding:'utf8',windowsHide:true}));
if(!pyCheck.isolated||pyCheck.paths.some(p=>resolve(p)!==project&&!resolve(p).startsWith(stage+'\\')))throw Error('Python依赖了包外路径');
const dataPython=join(project,'.venv-data/Scripts/python.exe');
try{execFileSync(dataPython,['-c','import yfinance,pandas_datareader'],{cwd:project,stdio:'pipe',windowsHide:true})}catch{
 execFileSync(resolve('.venv-akshare/Scripts/python.exe'),['-m','pip','install','--target',join(project,'.venv-data/Lib/site-packages'),'-r',resolve('requirements.external.txt'),'--disable-pip-version-check'],{cwd:root,stdio:'pipe',windowsHide:true});
}
const dataCheck=JSON.parse(execFileSync(dataPython,['-c','import sys,json,yfinance,pandas_datareader; print(json.dumps({"isolated":sys.flags.isolated,"version":sys.version.split()[0]}))'],{cwd:project,encoding:'utf8',windowsHide:true}));
const ready={private:true,createdAt:new Date().toISOString(),stage,project,sourceRoot:root,counts,databases,credentialPaths:entries.map(e=>e.path),imaClientIncluded,python:pyCheck,externalPython:dataCheck,exclusions:['Git内部目录','旧桌面构建','旧备份与测试输出','临时锁与WAL/SHM（数据库已一致性备份）'],requiresHandover:'替换主机时先退出原电脑小木，防止两机共用微信会话和重复推送'};
await writeFile(join(stage,'私密迁移清单.json'),JSON.stringify(ready,null,2));await writeFile(resolve('output/deployment-2026-11-04/package-stage.json'),JSON.stringify({stage,project,counts,credentials:entries.map(e=>e.path)},null,2));console.log(JSON.stringify({stage,project,files:counts.files,GiB:(counts.bytes/1024**3).toFixed(2),credentialCount:entries.length,python:pyCheck.akshare}));
