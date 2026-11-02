import {readFile,readdir,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),root=resolve('.'),out=resolve('output/final-release');await mkdir(out,{recursive:true});
const initial=JSON.parse(await readFile('.runtime/checkpoints/final-2026-10-16T03-52-28-316Z/manifest.json','utf8')),baseline=new Map(initial.files.map(f=>[f.path.replace(/^project\//,''),f.sha256]));
const files=[];
async function walk(dir){for(const e of await readdir(dir,{withFileTypes:true})){if(['vendor','assets','__pycache__','验收证据'].includes(e.name))continue;const path=dir+'/'+e.name;if(e.isDirectory())await walk(path);else if(/\.(mjs|js|cjs|css|html|py|md|json)$/.test(e.name))files.push(path)}}
for(const dir of ['integrations','dist','desktop','scripts','tests','docs','knowledge'])await walk(dir);files.push('server.mjs','finance.mjs','package.json');
const changes=[];for(const path of files){const checksum=sha(await readFile(path));if(baseline.get(path)!==checksum)changes.push({path,change:baseline.has(path)?'修改':'新增',sha256:checksum})}
const release={createdAt:new Date(Date.now()+28800000).toISOString().replace('Z','+08:00'),project:root,node:process.version,desktop:'.runtime/desktop-build/小木-win32-x64/小木.exe',desktopAsarHash:sha(await readFile('.runtime/desktop-build/小木-win32-x64/resources/app.asar')),packageLockHash:sha(await readFile('package-lock.json')),changes,ruleManifest:JSON.parse(await readFile('knowledge/source-manifest.json','utf8')),initialCheckpoint:initial.createdAt};
await writeFile(resolve(out,'release-manifest.json'),JSON.stringify(release,null,2));await writeFile(resolve(out,'修改文件清单.md'),'# 本轮修改文件清单\n\n以开工前完整恢复点为对照；不以Git未提交清单冒充本轮修改。\n\n'+changes.map(x=>'- '+x.change+' `'+x.path+'`').join('\n')+'\n');console.log(JSON.stringify({changed:changes.length,output:out}));
