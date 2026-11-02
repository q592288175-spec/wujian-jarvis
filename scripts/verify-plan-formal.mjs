import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {resolve,join} from 'node:path';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const project=resolve('.'),output=resolve('output/playwright/plan-lifecycle');await mkdir(output,{recursive:true});
const checkpoint=resolve('.runtime/checkpoints/accounts-2026-10-11T23-49-28-022Z');
const before=JSON.parse(await readFile(join(checkpoint,'before.json'),'utf8'));
const env={...process.env,WUJIAN_DESKTOP_PROFILE:resolve('.runtime/test-plan-formal-profile')};delete env.ELECTRON_RUN_AS_NODE;
const {_electron}=await import(pathToFileURL('C:/Users/86199/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href);
const app=await _electron.launch({executablePath:resolve('.runtime/desktop-build/小木-win32-x64/小木.exe'),args:[],env,timeout:30000});
const errors=[];
try{
 const page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));await page.waitForSelector('#accountSelect option',{state:'attached',timeout:45000});
 for(const view of ['water','metal','earth']){
  await page.locator('#mainNav [data-view='+view+']').click();await page.locator('[data-delete-card]').first().waitFor();
  await page.locator('[data-delete-card]').first().click();await page.locator('#removeCardForm').waitFor();await page.locator('#modal header button').click();
  if(view==='metal'){assert.equal(await page.locator('#riskCalc,#approvePlan').count(),0);await page.locator('#planLockNotice summary').click();assert.ok((await page.locator('#planLockNotice').innerText()).includes('动态月行情适配'));await page.screenshot({path:join(output,'formal-metal.png'),fullPage:true})}
 }
 const db=new DatabaseSync(resolve('.runtime/five-workbench.sqlite'),{readOnly:true}),counts={};
 for(const [table,rows] of Object.entries(before)){
  const current=JSON.parse(JSON.stringify(db.prepare('SELECT * FROM '+table+' ORDER BY rowid').all())),key=table==='operation_events'?'sequence':'id';
  assert.equal(current.length,rows.length,table+' count changed');
  for(const row of rows){const found=current.find(x=>x[key]===row[key]);assert.ok(found,table+' record lost');for(const field of Object.keys(row))assert.deepEqual(found[field],row[field],table+'.'+field)}
  counts[table]=current.length;
 }
 const old=new DatabaseSync(join(checkpoint,'business.sqlite'),{readOnly:true});
 for(const table of ['system_runs','run_cards','round_budgets','released_reservations'])assert.deepEqual(db.prepare('SELECT * FROM '+table+' ORDER BY rowid').all(),old.prepare('SELECT * FROM '+table+' ORDER BY rowid').all(),table+' changed');
 assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');assert.deepEqual(errors,[]);old.close();db.close();
 const result={passed:true,at:new Date(Date.now()+8*3600000).toISOString().replace('Z','+08:00'),counts,oldValuesUnchanged:true,runSnapshotsUnchanged:true,errors};
 await writeFile(join(output,'formal-preservation.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await app.close()}
