import {readFile,writeFile} from 'node:fs/promises';
let p=await readFile('dist/market-panorama.js','utf8');
p=p.replaceAll("'—'","'未取得'").replace("esc(state.feeSector??strengthSectorFor(list().find(p=>p.code===state.product)||{}))","esc(state.feeSector==='all'?'全部板块':state.feeSector??strengthSectorFor(list().find(p=>p.code===state.product)||{}))");
await writeFile('dist/market-panorama.js',p);
let b=await readFile('integrations/market-panorama.mjs','utf8');b=b.replace("minutes:'同步分钟K线'","minutes:'同步分钟K线',supplement:'同步合约与现货资料'");await writeFile('integrations/market-panorama.mjs',b);
