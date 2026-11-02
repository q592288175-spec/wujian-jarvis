import {readFile,writeFile,copyFile} from 'node:fs/promises';
const out='output/data-gaps-2026-10-25/';
for(const f of ['click-result.json','real-refresh-job.json','warehouse-history-click.png','roll-reference-click.png','source-gaps-click.png'])await copyFile(out+f,out+'desktop-'+f);
let s=await readFile('scripts/verify-data-gaps-20261025.mjs','utf8');s=s.replaceAll("join(out,'","join(out,prefix+'");s=s.replace("includes('ln(')),null","includes('ln('),null").replace("includes('412')),null","includes('412'),null");s=s.replace('errors,productionWritten:false','errors,desktop,productionWritten:false');await writeFile('scripts/verify-data-gaps-20261025.mjs',s);
