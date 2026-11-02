import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL('C:/Users/86199/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href);
const output=resolve('output/playwright/fire-refresh-2026-10-12');await mkdir(output,{recursive:true});
try{
 const browser=await chromium.connectOverCDP('http://127.0.0.1:9229');
 const page=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().startsWith('http://127.0.0.1:4318/'));assert.ok(page);
 await page.waitForSelector('#accountSelect option',{state:'attached',timeout:45000});
 await page.locator('#mainNav [data-view=fire]').click();await page.waitForSelector('#refreshFire');
 assert.equal(await page.locator('#refreshFire').isDisabled(),false);
 assert.ok((await page.locator('#content .section-head').first().innerText()).includes('最后刷新 2026-10-12 08:21'));
 assert.ok((await page.locator('#fireRefreshStatus').innerText()).includes('刷新完成'));
 const scan=await (await fetch('http://127.0.0.1:4318/api/workbench/fire')).json();assert.equal(scan.refresh.status,'completed');assert.equal(scan.rows.length,87);
 const old=JSON.parse(await readFile('.runtime/checkpoints/accounts-2026-10-12T00-18-52-659Z/before.json','utf8'));
 const db=new DatabaseSync(resolve('.runtime/five-workbench.sqlite'),{readOnly:true});
 for(const [table,rows] of Object.entries(old))assert.deepEqual(JSON.parse(JSON.stringify(db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all())),rows,table+' was changed');db.close();
 const tabs=await page.locator('#content .tabs button').allTextContents();
 await page.screenshot({path:join(output,'formal-restarted.png')});
 await writeFile(join(output,'restart.json'),JSON.stringify({passed:true,canonicalApp:true,refresh:scan.refresh,tabs,businessTablesUnchanged:Object.keys(old)},null,2));
 console.log('正式APP重建启动通过；刷新时间重启后保留；账户、交易、计划和操作记录逐字段不变。');
 process.exit(0);
}catch(error){console.error(error);process.exit(1)}
