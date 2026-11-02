import {DatabaseSync,backup} from 'node:sqlite';
import {mkdir,writeFile,copyFile} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
const root=resolve('.'),folder=resolve('.runtime/checkpoints/accounts-'+new Date().toISOString().replace(/[:.]/g,'-'));
await mkdir(folder,{recursive:true});
const db=new DatabaseSync(resolve('.runtime/five-workbench.sqlite'),{readOnly:true});
await backup(db,join(folder,'business.sqlite'));
const tables=['accounts','cards','plan_versions','executions','reviews','account_entries','operation_events'];
const snapshot=Object.fromEntries(tables.map(table=>[table,db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()]));
await writeFile(join(folder,'before.json'),JSON.stringify(snapshot,null,2));
const manifest={at:new Date(Date.now()+8*3600000).toISOString().replace('Z','+08:00'),folder,tables:Object.fromEntries(tables.map(t=>[t,{count:snapshot[t].length,sha256:createHash('sha256').update(JSON.stringify(snapshot[t])).digest('hex')}]))};
await writeFile(join(folder,'manifest.json'),JSON.stringify(manifest,null,2));
for(const f of ['integrations/five-workbench.mjs','integrations/trade-ledger.mjs','server.mjs','dist/workbench.js','dist/workbench.css','dist/index.html','dist/cockpit-workbench.js','dist/cockpit.css','dist/cockpit.html','integrations/account-balances.mjs','integrations/operation-archive.mjs','dist/account-ui.js','dist/account-ui.css','desktop/main.cjs']){await mkdir(dirname(join(folder,f)),{recursive:true});await copyFile(join(root,f),join(folder,f))}
db.close();console.log(JSON.stringify({folder,counts:Object.fromEntries(tables.map(t=>[t,snapshot[t].length]))}));
