import {readFile,writeFile} from 'node:fs/promises';
import {backupFiles} from './redesign-files.mjs';
const files=['dist/index.html','dist/market-panorama.html','dist/cockpit.html','dist/workbench.js','dist/market-panorama.js','dist/cockpit-workbench.js','docs/redesign-2026-10-25/page-snapshot.js'];await backupFiles('stage4',files);
for(const f of files.slice(0,3)){
 let s=await readFile(f,'utf8');if(!s.includes('/theme/tokens.css'))s=s.replace('</head>','<link rel="stylesheet" href="/theme/tokens.css"></head>');s=s.replace('</head>','<link rel="stylesheet" href="/shell.css"></head>');if(f.includes('cockpit.html'))s=s.replace('<html lang="zh-CN">','<html lang="zh-CN" data-theme="holo">');await writeFile(f,s);
}
for(const f of files.slice(3,6)){let s=await readFile(f,'utf8');s="import {mountShell} from './shell.js';\n"+s;if(f.includes('market-panorama.js'))s=s.replace("$('#navigation').innerHTML=pages.map", "$('#navigation').innerHTML=pages.map").replace("addEventListener('hashchange'", "addEventListener('hashchange'");s+='\nmountShell();\n';await writeFile(f,s)}
let snap=await readFile(files[6],'utf8');snap=snap.replace('#navigation a,#navigation button','#navigation [data-nav]');await writeFile(files[6],snap);
console.log('shared shell mounted on three entry points');
