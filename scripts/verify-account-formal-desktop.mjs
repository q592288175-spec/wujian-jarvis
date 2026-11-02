import assert from 'node:assert/strict';
import {resolve,join} from 'node:path';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const project=resolve('.'),output=resolve('output/account-balances');
const {_electron}=await import(pathToFileURL('C:/Users/86199/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href);
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const app=await _electron.launch({executablePath:join(project,'.runtime/desktop-build/小木-win32-x64/小木.exe'),args:[],env,timeout:30000});
try{
 const page=await app.firstWindow();await page.waitForSelector('#accountSelect option',{state:'attached',timeout:45000});
 const before=await (await fetch('http://127.0.0.1:4318/api/workbench/accounts')).json();assert.equal(before.length,4);
 for(const a of before){await page.locator('#accountSelect').selectOption(a.id);await page.waitForFunction(id=>document.querySelector('#accountSelect').value===id,a.id);await page.locator('#mainNav [data-view=wood]').click();await page.waitForFunction(alias=>document.querySelector('.balance-panel')?.textContent.includes(alias),a.alias);}
 await page.locator('#accountSelect').selectOption(before.find(a=>a.mode==='real').id);
 await page.locator('#mainNav [data-view=wood]').click();await page.waitForSelector('.balance-panel');await page.screenshot({path:join(output,'formal-wood.png')});
 const after=await (await fetch('http://127.0.0.1:4318/api/workbench/accounts')).json();assert.deepEqual(after,before);
 const rules=await (await fetch('http://127.0.0.1:4318/api/workbench/rules')).json();
 await writeFile(join(output,'formal-desktop.json'),JSON.stringify({passed:true,at:new Date(Date.now()+8*3600000).toISOString().replace('Z','+08:00'),accountCount:after.length,accountBalancesUnchanged:true,activeRun:rules.runId,sourceChanged:rules.sourceChanged},null,2));
 console.log('正式Windows APP启动、四账户切换及木页面读取通过；没有提交业务变更。');
}finally{await app.close()}
