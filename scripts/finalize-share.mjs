import {readFile,writeFile,readdir,stat,copyFile,mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,join,relative,basename,dirname,extname} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const run=promisify(execFile),project=resolve('.'),stage=resolve(process.env.WUJIAN_SHARE_STAGE||'.runtime/distribution/小木工作台_分享版_20261009');
const destination=resolve(process.env.WUJIAN_SHARE_ZIP||'../小木工作台_完整源码与Windows版_20261009.zip');
if(!stage.startsWith(project+'\\.runtime\\distribution\\')||dirname(destination)!==resolve('..'))throw Error('分发目标不在指定目录');
if(existsSync(destination))throw Error('已有压缩包，请使用新的名称，不覆盖已交付包');
const target=join(stage,'小木工作台/wujian-jarvis');
if(existsSync(join(target,'.runtime/five-workbench.sqlite')))throw Error('禁止打包已使用的业务库');
// Synchronize only source/docs changed after the initial runtime staging.
async function walk(dir){const files=[];for(const e of await readdir(dir,{withFileTypes:true})){if(['.git','__pycache__','node_modules','.pytest_cache','output'].includes(e.name))continue;const p=join(dir,e.name);if(e.isDirectory())files.push(...await walk(p));else files.push(p)}return files}
for(const folder of ['dist','desktop','integrations','scripts','tests'])for(const source of await walk(join(project,folder))){const dest=join(target,relative(project,source));await mkdir(dirname(dest),{recursive:true});await copyFile(source,dest)}
await copyFile(join(project,'README.md'),join(target,'README.md'));
for(const e of await readdir('docs',{withFileTypes:true}))if(e.isFile()&&extname(e.name)==='.md')await copyFile(join(project,'docs',e.name),join(target,'docs',e.name));
const method='小木工作台/资料包/资料实验基地/06_工具/火_机会扫描/references/method.md';await mkdir(dirname(join(stage,method)),{recursive:true});await copyFile(resolve('..','资料包/资料实验基地/06_工具/火_机会扫描/references/method.md'),join(stage,method));
await copyFile(join(project,'docs/小木使用说明.md'),join(stage,'小木使用说明.md'));
const {marked}=await import('marked');const manual=await readFile(join(stage,'小木使用说明.md'),'utf8');
await writeFile(join(stage,'小木使用说明.html'),'<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>小木使用说明</title><style>body{font:16px/1.85 "Microsoft YaHei",sans-serif;max-width:960px;margin:36px auto;padding:0 20px;color:#202724}h1{font-size:28px}h2{font-size:21px;margin-top:30px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ddd;padding:8px;text-align:left}code{overflow-wrap:anywhere;background:#eef3f0;padding:2px 4px}li{margin:8px 0}</style><body>'+marked.parse(manual)+'</body></html>');
const {extractFile}=await import('@electron/asar');const config=JSON.parse(extractFile(join(target,'.runtime/desktop-build/小木-win32-x64/resources/app.asar'),'project.json').toString());
if(config.project||config.projectRelative!=='../../..')throw Error('桌面程序仍绑定开发机路径');
if(!extractFile(join(target,'.runtime/desktop-build/小木-win32-x64/resources/app.asar'),'main.cjs').equals(await readFile('desktop/main.cjs')))throw Error('桌面构建未使用最新启动代码');
const env=existsSync('.env')?await readFile('.env','utf8'):'';
const credentials=env.split(/\r?\n/).filter(l=>/^[A-Z_]*(?:API_KEY|SECRET|PASSWORD|TOKEN|APP_ID|OPEN_IDS|CHAT_IDS)\s*=/.test(l)).map(l=>l.slice(l.indexOf('=')+1).trim().replace(/^['"]|['"]$/g,'')).filter(v=>v.length>=8);
async function allFiles(dir){const out=[];for(const e of await readdir(dir,{withFileTypes:true})){const p=join(dir,e.name);if(e.isDirectory())out.push(...await allFiles(p));else out.push(p)}return out}
const files=(await allFiles(stage)).filter(f=>f!==join(stage,'文件校验清单.json')),manifest=[];let bytes=0;
for(const file of files){
 const path=relative(stage,file).replaceAll('\\','/');
 if(/(^|\/)(\.env|\.git|操作记录|postmarket-reviews|research-reports|desktop-profile)(\/|$)/.test(path)||/five-workbench\.sqlite|\.sqlite-(wal|shm)$|pyvenv\.cfg$/.test(path))throw Error('包内出现私有运行文件：'+path);
 const data=await readFile(file);bytes+=data.length;
 if(credentials.some(value=>data.includes(Buffer.from(value))))throw Error('凭据核验未通过，文件：'+path);
 if(!path.includes('/node_modules/')&&!path.includes('/.venv-akshare/')&&['.js','.mjs','.cjs','.md','.json','.yaml','.txt'].includes(extname(path))&&/\bsk-[a-zA-Z0-9_-]{24,}/.test(data.toString('utf8')))throw Error('发现疑似密钥，请核验文件：'+path);
 manifest.push({path,size:data.length,sha256:createHash('sha256').update(data).digest('hex')});
}
await writeFile(join(stage,'文件校验清单.json'),JSON.stringify({createdAt:new Date().toISOString(),files:manifest.length,bytes,credentialScanPassed:true,records:manifest},null,2));
const python=resolve('.venv-akshare/Scripts/python.exe');
await run(python,[resolve('scripts/create_share_zip.py'),stage,destination],{windowsHide:true,timeout:15*60*1000,maxBuffer:2e6});
const zip=await readFile(destination),checksum=createHash('sha256').update(zip).digest('hex');await writeFile(destination+'.sha256',checksum+'  '+basename(destination)+'\n');
await mkdir('output/share-acceptance',{recursive:true});
const result={zip:destination,size:zip.length,sha256:checksum,sourceFiles:manifest.length,uncompressedBytes:bytes,privateCredentialsIncluded:false,privateBusinessDataIncluded:false,portableDesktop:true};await writeFile('output/share-acceptance/打包校验.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
