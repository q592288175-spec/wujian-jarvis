import {mkdir,readFile,writeFile,copyFile,readdir,cp,stat} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {resolve,join,relative,basename,extname} from 'node:path';
import {execFileSync} from 'node:child_process';

const project=resolve('.'),home=resolve('..'),bundle=join(home,'资料包');
const output=resolve(process.env.WUJIAN_SHARE_STAGE||'.runtime/distribution/小木工作台_分享版_20261009');
if(!output.startsWith(project+'\\.runtime\\distribution\\'))throw Error('输出必须位于本项目独立分发目录');
if(existsSync(output)&&process.env.WUJIAN_SHARE_RESUME!=='1')throw Error('目标已存在，请使用新的分发目录，避免混入历史数据');
const target=join(output,'小木工作台/wujian-jarvis');
if(existsSync(join(target,'.runtime/five-workbench.sqlite')))throw Error('分发目录已经运行过，不能混入个人数据');
await mkdir(target,{recursive:true});
const excluded=new Set(['.git','.env','__pycache__','.pytest_cache','node_modules','.DS_Store','.cache','历史版本','output']);
async function copy(source,destination,{stdlib=false}={}){
 await cp(source,destination,{recursive:true,dereference:true,filter:path=>!excluded.has(basename(path))&&!path.endsWith('.pyc')&&!path.endsWith('direct_url.json')&&!(stdlib&&basename(path)==='site-packages')});
}
for(const dir of ['dist','desktop','integrations','futures_data','scripts','tests','knowledge','research-skills','vendor'])await copy(join(project,dir),join(target,dir));
for(const name of ['server.mjs','finance.mjs','package.json','package-lock.json','requirements.akshare.txt','.env.example','.gitignore','AGENTS.md','README.md','CHANGELOG.md','design-qa.md'])await copy(join(project,name),join(target,name));
for(const e of await readdir(project,{withFileTypes:true}))if(e.isFile()&&e.name.endsWith('.command'))await copy(join(project,e.name),join(target,e.name));
await mkdir(join(target,'data'),{recursive:true});await copy(join(project,'data/contract-specs.json'),join(target,'data/contract-specs.json'));
await mkdir(join(target,'docs'),{recursive:true});
for(const e of await readdir(join(project,'docs'),{withFileTypes:true}))if(e.isFile()&&extname(e.name)==='.md')await copy(join(project,'docs',e.name),join(target,'docs',e.name));
// Required rule files only: no historical personal research or account records.
const rules=['01_系统/2026-09-27_期货账户管理系统_当前_v1.0.md','02_日常/2026-09-27_交易全流程卡_当前_v1.0.md','02_日常/2026-09-28_账户计算基准_当前_v1.0.md','03_迭代/2026-09-27_验证与迭代协议_当前_v1.0.md','06_工具/金_决策复核'];
for(const name of rules)await copy(join(bundle,'资料实验基地',name),join(output,'小木工作台/资料包/资料实验基地',name));
await copy(join(bundle,'资料实验基地/06_工具/火_机会扫描/references/method.md'),join(output,'小木工作台/资料包/资料实验基地/06_工具/火_机会扫描/references/method.md'));
for(const skill of ['wujian-futures-multi-cycle-scan','wujian-commodity-research'])await copy(join(bundle,'技能包',skill),join(output,'小木工作台/资料包/技能包',skill));
const framework='1_交易/团队与私募/2026-10-04_五行交易团队职责框架_v1.0.md';await copy(resolve(home,'..',framework),join(output,framework));
// Copy production dependency closure from the lockfile, retaining licenses.
const lock=JSON.parse(await readFile(join(project,'package-lock.json'),'utf8'));let packages=0;
for(const [path,info] of Object.entries(lock.packages||{}))if(path.startsWith('node_modules/')&&!info.dev&&(!info.os||info.os.includes('win32'))&&(!info.cpu||info.cpu.includes('x64'))){
 if(!existsSync(join(project,path)))throw Error('缺少已锁定运行依赖：'+path);
 await copy(join(project,path),join(target,path));packages++;
}
// Unlike venv launchers, a private runtime with relative _pth paths is relocatable.
const python=join(project,'.venv-akshare/Scripts/python.exe');
const base=execFileSync(python,['-c','import sys; print(sys.base_prefix)'],{encoding:'utf8',windowsHide:true}).trim();
const runtime=join(target,'.venv-akshare/Scripts');await mkdir(runtime,{recursive:true});
for(const e of await readdir(base,{withFileTypes:true}))if(e.isFile()&&(/^(python.*\.(exe|dll)|vcruntime.*\.dll|LICENSE.*)$/i.test(e.name)))await copy(join(base,e.name),join(runtime,e.name));
await copy(join(base,'Lib'),join(runtime,'Lib'),{stdlib:true});await copy(join(base,'DLLs'),join(runtime,'DLLs'));
await copy(join(project,'.venv-akshare/Lib/site-packages'),join(target,'.venv-akshare/Lib/site-packages'));
await writeFile(join(runtime,'python313._pth'),'.\nLib\nDLLs\n../Lib/site-packages\n../../\n../../scripts\n../../integrations\n../../../资料包/技能包/wujian-futures-multi-cycle-scan/scripts\nimport site\n','utf8');
const pyCheck=JSON.parse(execFileSync(join(runtime,'python.exe'),['-c','import sys,json,akshare,pandas,numpy,sqlite3,ssl,yaml,futures_data; from zoneinfo import ZoneInfo; from fire_scan import load_scanner; load_scanner(); print(json.dumps({"isolated":sys.flags.isolated,"akshare":akshare.__version__,"paths":sys.path,"timezone":str(ZoneInfo("Asia/Shanghai"))}))'],{cwd:target,encoding:'utf8',windowsHide:true,maxBuffer:2e6}));
if(!pyCheck.isolated||pyCheck.paths.some(p=>!resolve(p).startsWith(output+'\\')))throw Error('Python仍依赖分发目录之外的模块');
// Public dated quotations only. Never copy the business DB or analysis archive.
const scanDir=join(project,'.runtime/fire-scan/.wujian-futures-multi-cycle-scan');
const scan=(await readdir(scanDir)).filter(n=>/^\d{4}-\d{2}-\d{2}\.json$/.test(n)).sort().at(-1);
if(!scan)throw Error('没有可核验的公开行情种子');
await copy(join(scanDir,scan),join(target,'.runtime/fire-scan/.wujian-futures-multi-cycle-scan',scan));
await copy(join(project,'.runtime/fire-scan/contract-bars'),join(target,'.runtime/fire-scan/contract-bars'));
await copy(join(project,'.runtime/market.json'),join(target,'.runtime/market.json'));
await copy(join(project,'.runtime/desktop-share-build/小木-win32-x64'),join(target,'.runtime/desktop-build/小木-win32-x64'));
await copy(join(project,'docs/小木使用说明.md'),join(output,'小木使用说明.md'));
await writeFile(join(output,'启动小木.cmd'),'@echo off\r\nchcp 65001 >nul\r\nstart "" "%~dp0小木工作台\\wujian-jarvis\\.runtime\\desktop-build\\小木-win32-x64\\小木.exe"\r\n','utf8');
const markdown=await readFile(join(output,'小木使用说明.md'),'utf8');
const {marked}=await import('marked');
await writeFile(join(output,'小木使用说明.html'),'<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>小木使用说明</title><style>body{font:16px/1.85 "Microsoft YaHei",sans-serif;max-width:960px;margin:36px auto;padding:0 20px;color:#202724}h1{font-size:28px}h2{font-size:21px;margin-top:30px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ddd;padding:8px;text-align:left}code{overflow-wrap:anywhere;background:#eef3f0;padding:2px 4px}li{margin:8px 0}</style><body>'+marked.parse(markdown)+'</body></html>','utf8');
await writeFile(join(output,'分发说明.json'),JSON.stringify({version:'2026-10-09-manual-review-save',platform:'win32-x64',createdAt:new Date().toISOString(),marketSeedDate:scan.slice(0,10),productionNodePackages:packages,python:{isolated:pyCheck.isolated,akshare:pyCheck.akshare},excluded:['私人API密钥与连接凭据','业务库和操作记录','用户研究和盘后复盘历史','Git历史与检查点','本地向量模型缓存'],pythonPathReference:'https://docs.python.org/3.13/library/sys_path_init.html#pth-files'},null,2));
console.log(JSON.stringify({output,target,packages,seed:scan,python:pyCheck},null,2));
