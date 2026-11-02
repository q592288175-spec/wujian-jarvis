import {readFile,readdir,writeFile,stat} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {resolve,join,basename} from 'node:path';
const root=resolve('.'),out=resolve('output/redesign-2026-10-25');
const audit=JSON.parse(await readFile(join(out,'baseline/dist-audit.json'),'utf8')),running=JSON.parse((await readFile(join(out,'baseline/running-and-shortcut.json'),'utf8')).replace(/^\uFEFF/,''));
const sources=[];
async function add(path){if(existsSync(path))sources.push({path,text:await readFile(path,'utf8')})}
for(const f of ['../../01_10月决定记录.md','../README.md','README.md','package.json'])await add(f);
for(const d of ['docs','desktop'])for(const f of await readdir(d)){if(/\.md$|\.(cjs|mjs|js|html)$/.test(f)&&!f.includes('整改方案'))await add(join(d,f))}
for(const f of await readdir(root))if(/\.(command|ps1|bat)$/.test(f))await add(f);
const refs=name=>sources.filter(s=>s.text.includes(name)).map(s=>s.path);
const items=[];
for(const row of audit.rows.filter(r=>/^[AB] /.test(r.class)||r.file==='fire-preview-dark.html')){
 const references=refs(row.file).concat(refs(basename(row.file))).filter((v,i,a)=>a.indexOf(v)===i);
 items.push({kind:'frontend',path:'dist/'+row.file,decision:references.length?'keep':'archive',references});
}
const scriptNames=(await readdir('scripts')).filter(n=>n.startsWith('verify-'));
for(const name of scriptNames){const references=refs(name);items.push({kind:'script',path:'scripts/'+name,decision:references.length?'keep':'archive',references})}
const keepBuilds=new Set(['desktop-acceptance-20261011','desktop-build-theme-20261019','desktop-cockpit-local-20261021','desktop-gold-20261019','desktop-gold-chart-20261019','desktop-strength-20261019','desktop-panorama-clarity-20261024','desktop-panorama-rankings-20261024']);
for(const name of await readdir('.runtime')){
 if(!/^desktop-/.test(name)||!existsSync(join('.runtime',name,'小木-win32-x64')))continue;
 const path=resolve('.runtime',name),active=running.target.startsWith(path+'\\')||running.processes.some(p=>p.Path?.startsWith(path+'\\'));
 const references=refs(name);if(active)references.push('当前快捷方式或运行进程');if(keepBuilds.has(name))references.push('明确保留构建或上一验收版本');
 // Runtime builds referenced by an operational script remain in place as well.
 for(const script of await readdir('scripts'))if(/\.(mjs|ps1|py|js)$/.test(script)&&!items.some(i=>i.path==='scripts/'+script&&i.decision==='archive')){const text=await readFile(join('scripts',script),'utf8');if(text.includes(name))references.push('scripts/'+script)}
 items.push({kind:'runtime',path:'.runtime/'+name,decision:references.length?'keep':'archive',references});
}
for(const name of ['codex-live.mjs','intraday.py','start-akshare.mjs','start-market.mjs','tq_market.py']){
 const references=refs(name);items.push({kind:'integration',path:'integrations/'+name,decision:references.length?'keep':'archive',references});
}
// Never archive a dependency of a retained executable or test.
const executable=[];for(const d of ['tests','integrations','scripts'])for(const f of await readdir(d))if(/\.(mjs|js|cjs|py|ps1)$/.test(f)&&!items.some(i=>i.path===d+'/'+f&&i.decision==='archive'))executable.push({path:d+'/'+f,text:await readFile(join(d,f),'utf8')});
for(const item of items.filter(i=>i.decision==='archive')){const reference=executable.filter(s=>s.path!==item.path&&s.text.includes(basename(item.path)));if(reference.length){item.decision='keep';item.references.push(...reference.map(s=>s.path))}}
await writeFile(join(out,'archive-plan.json'),JSON.stringify({created:new Date().toISOString(),inventoryDocumentsExcluded:'整改方案自身对清理候选的列举不是运行或历史链接依赖；其他文档、启动器和测试引用均保护',items},null,2));
console.log(JSON.stringify({archive:items.filter(i=>i.decision==='archive').map(i=>i.path),keep:items.filter(i=>i.decision==='keep').length}));
