import {readFile,writeFile} from 'node:fs/promises';import {backupFiles} from './redesign-files.mjs';
await backupFiles('stage9-detail',['dist/account-ui.js','dist/workbench.js','dist/gold-ui.js']);
let a=await readFile('dist/account-ui.js','utf8');a=a.replace("${compact?'':`<p>本月手动余额变化", "${compact?(compact==='wood'?`<p>本月手动余额变化 <b class=\"${tone(a.monthlyBalanceChange)}\">${fmt(a.monthlyBalanceChange)} 元</b></p>`:''):`<p>本月手动余额变化");await writeFile('dist/account-ui.js',a);
let w=await readFile('dist/workbench.js','utf8');w=w.replace('const balancePanel=(a,c)=>accountPanel(a,c,true);',"const balancePanel=(a,c)=>accountPanel(a,c,'wood');");await writeFile('dist/workbench.js',w);
