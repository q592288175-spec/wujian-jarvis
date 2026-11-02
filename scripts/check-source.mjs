import {readdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
const files=['server.mjs','finance.mjs'];
async function walk(dir){for(const e of await readdir(dir,{withFileTypes:true})){if(['vendor','node_modules','__pycache__'].includes(e.name))continue;const p=dir+'/'+e.name;if(e.isDirectory())await walk(p);else if(/\.(mjs|cjs|js)$/.test(e.name))files.push(p)}}
for(const dir of ['integrations','dist','desktop','scripts'])await walk(dir);
let failed=0;for(const path of files){const r=spawnSync(process.execPath,['--check',path],{encoding:'utf8',windowsHide:true});if(r.status!==0){failed++;console.error(path+'\n'+r.stderr)}}
console.log(JSON.stringify({checked:files.length,failed}));process.exitCode=failed?1:0;
