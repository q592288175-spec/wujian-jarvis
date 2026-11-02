import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {pathToFileURL} from 'node:url';

const base='http://127.0.0.1:4318',cardId='eb286b23-954d-4d8b-aac0-935ab019f907';
const existingReport=process.argv[2]||null;
const out=resolve('output/playwright/research-contract-2026-10-12');await mkdir(out,{recursive:true});
const get=async path=>{const r=await fetch(base+path);assert.equal(r.status,200,path);return r.json()};
const before=await get('/api/workbench/cards/'+cardId),rulesBefore=await get('/api/workbench/rules');
assert.equal(before.contract,'BR2612');const archived=!!before.archivedAt;
const db=new DatabaseSync(resolve('.runtime/five-workbench.sqlite'),{readOnly:true});
const preserved=['accounts','plan_versions','executions','reviews','account_entries','balance_baselines','balance_changes','balance_audit','round_budgets','system_runs','released_reservations'];
const read=table=>db.prepare('SELECT * FROM '+table+' ORDER BY rowid').all();
const beforeTables=Object.fromEntries(preserved.map(table=>[table,read(table)]));
const otherCards=read('cards').filter(card=>card.id!==cardId);
const {_electron}=await import(pathToFileURL('C:/Users/86199/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href);
const env={...process.env,WUJIAN_DESKTOP_PROFILE:resolve('.runtime/research-contract-qa-profile')};delete env.ELECTRON_RUN_AS_NODE;
const app=await _electron.launch({executablePath:resolve('.runtime/desktop-build/小木-win32-x64/小木.exe'),args:[],env,timeout:45000});
let page,job;const errors=[];
try{
 page=await app.firstWindow();page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(20000);
 await page.waitForSelector('#accountSelect option',{state:'attached',timeout:45000});
 await page.locator('#accountSelect').selectOption(before.accountId);
 await page.waitForFunction(id=>document.querySelector('#accountSelect')?.value===id&&!document.querySelector('#content')?.inert,before.accountId);
 await page.locator('[data-view="water"]').click();
 if(archived)await page.locator('[data-water-view="universe"]').click();else await page.locator('[data-card="'+cardId+'"]').click();
 const trigger=archived?'[data-universe-refresh="BR"]':'#runResearch';await page.waitForSelector(trigger);
 const started=Date.now();
 if(existingReport){job=await get('/api/research/reports/'+existingReport)}else{
  const responsePromise=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/api/research/run'));
  await page.locator(trigger).click();const response=await responsePromise;job=await response.json();
  assert.equal(response.status(),202,JSON.stringify(job));
 }
 assert.equal(job.marketContext.contract,'BR2612');
 await page.screenshot({path:join(out,'running.png')});console.log(JSON.stringify({jobId:job.id,status:job.status,contract:job.contract,framework:job.framework}));
 while(job.status==='running'&&Date.now()-started<360000){await new Promise(r=>setTimeout(r,5000));job=await get('/api/research/reports/'+job.id);console.log(JSON.stringify({status:job.status,stage:job.stage,elapsedSeconds:Math.round((Date.now()-started)/1000)}))}
 assert.equal(job.status,'completed',job.error||job.stage);assert.ok(job.waterDraft?.headline);assert.ok(job.report);
 assert.equal(job.symbol,'SHFE.BR2612');assert.equal(job.evidence.quote.close,16305);assert.equal(job.evidence.quote.preClose,16710);
 assert.equal(job.dataAsOf,'2026-10-12');assert.equal(job.framework.name,'丁二烯橡胶');
 for(const dim of ['fundamental','news','policy','capital'])assert.ok(job.waterDraft.dimensions?.[dim]?.summary);
 if(archived){
  await page.reload();await page.locator('[data-view="water"]').click();await page.locator('[data-water-view="universe"]').click();
  await page.locator('[data-universe-report="'+job.id+'"]').waitFor();await page.screenshot({path:join(out,'universe-completed.png')});
  await page.locator('[data-universe-report="'+job.id+'"]').click();await page.locator('#modal[open]').waitFor();
  assert.match(await page.locator('#modalBody').innerText(),/BR2612/);
  await page.locator('#modalBody .research-report summary').click();assert.ok((await page.locator('#modalBody .research-report-body').innerText()).length>500);
  await page.screenshot({path:join(out,'report-viewer.png')});await page.locator('#modal header button').click();
  // Only the summary response is substituted to inspect the shared card renderer; no restore or save request is sent.
  await page.route('**/api/workbench/summary*',async route=>{const r=await route.fetch(),s=await r.json();s.cards=[{...before,id:'display-only-br',archivedAt:null,water:{...job.waterDraft,researchJobId:job.id,researchStatus:'completed'}}];await route.fulfill({json:s})});
  await page.goto(base+'/?view=water&card=display-only-br');
 }
 await page.waitForFunction(()=>document.querySelector('#researchProgress')?.textContent.includes('研究已完成'),null,{timeout:15000});
 assert.match(await page.locator('#researchProgress').innerText(),/BR2612.*2026-10-12.*具体合约完成日K/);
 assert.match(await page.locator('#researchSnapshot').innerText(),/贝叶斯更新/);
 await page.locator('.research-report summary').click();assert.ok((await page.locator('.research-report-body').innerText()).length>500);
 await page.locator('.research-report summary').click();
 for(const width of [1500,1100]){
  await app.evaluate(({BrowserWindow},width)=>BrowserWindow.getAllWindows()[0].setSize(width,980),width);
  await page.waitForTimeout(350);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:join(out,'completed-'+width+'.png')});
 }
 const rulesAfter=await get('/api/workbench/rules');assert.equal(rulesAfter.currentSourceHash,rulesBefore.currentSourceHash);assert.equal(rulesAfter.sourceChanged,rulesBefore.sourceChanged);assert.equal(rulesAfter.runId,rulesBefore.runId);
 for(const table of preserved)assert.deepEqual(read(table),beforeTables[table],table+' must remain unchanged');
 assert.deepEqual(read('cards').filter(card=>card.id!==cardId),otherCards,'other cards unchanged');
 const after=await get('/api/workbench/cards/'+cardId);
 for(const field of ['id','accountId','roundId','contract','direction','status','plan','planHistory','fire','layers','executions','reviews'])assert.deepEqual(after[field],before[field],field+' unchanged');
 if(archived)assert.deepEqual(after,before,'archived card untouched');else assert.equal(after.water.researchReportId,job.id);assert.deepEqual(errors,[]);
 const result={passed:true,at:new Date(Date.now()+8*3600000).toISOString().replace('Z','+08:00'),jobId:job.id,elapsedSeconds:Math.round((Date.now()-started)/1000),launchPath:archived?'全品种研究真实点击；交易卡显示为只读响应夹具，未恢复归档':'交易卡真实点击',contract:job.contract,marketContext:job.marketContext,framework:job.framework,model:job.model,evidenceCount:job.evidence.external.items.length,providers:job.evidence.external.providers,headline:job.waterDraft.headline,stage:job.waterDraft.stage,errors,preservedTables:preserved,otherCardsUnchanged:true,tradeRulesUnchanged:true,reportPath:resolve('.runtime/research-reports',job.id+'.md')};
 await writeFile(join(out,existingReport?'viewer-acceptance.json':'acceptance.json'),JSON.stringify({...result,existingReport},null,2));console.log(JSON.stringify({...result,existingReport}));
}catch(error){await page?.screenshot({path:join(out,'failure.png')}).catch(()=>{});await writeFile(join(out,'failure.txt'),error.stack);throw error}
finally{await app.close();db.close()}
