import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {DatabaseSync} from 'node:sqlite';

const base='http://127.0.0.1:4318',out=resolve('output/week-day-2026-10-13');
const checkpoint=resolve('.runtime/checkpoints/accounts-2026-10-13T12-47-33-434Z');
const runId='021d4ee3-ffd8-4d97-9ac4-01f4090ccef6';
const api=async path=>{const response=await fetch(base+path);assert.ok(response.ok,path);return response.json()};
const before=JSON.parse((await readFile(join(checkpoint,'fire-api-before.json'),'utf8')).replace(/^\uFEFF/,''));
const fire=await api('/api/workbench/fire'),rules=await api('/api/workbench/rules');
assert.equal(fire.week_day_rule.version,'v2-week-day-direction-week-price');
assert.ok(!rules.runId&&!rules.sourceChanged);
for(const mode of ['month-week','month-week-day'])assert.deepEqual(fire.rows.map(r=>r.modes[mode]),before.rows.map(r=>r.modes[mode]));
const candidates=fire.rows.filter(r=>['多头观察','空头观察'].includes(r.modes['week-day']));
assert.equal(candidates.length,60);
for(const r of candidates){
 assert.ok(r.volume>10000&&r.open_interest>10000);assert.equal(r.data_date,fire.target_date);
 assert.equal(r.week_direction,r.day_direction);
 assert.ok(r.modes['week-day']==='多头观察'?r.week_day_price>r.week_ma10:r.week_day_price<r.week_ma10);
}
assert.equal(await readFile(fire.sourcePath,'utf8'),await readFile(join(checkpoint,'scan-before.json'),'utf8'));

const {_electron}=await import(pathToFileURL('C:/Users/86199/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href);
const env={...process.env,WUJIAN_DESKTOP_PROFILE:'.runtime/week-day-price-qa-profile'};delete env.ELECTRON_RUN_AS_NODE;
const app=await _electron.launch({executablePath:resolve('.runtime/desktop-build/小木-win32-x64/小木.exe'),env,timeout:45000});
const errors=[];let page;
await mkdir(out,{recursive:true});
try{
 page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(20000);
 await page.waitForSelector('#accountSelect option',{state:'attached',timeout:45000});
 await page.locator('[data-view="fire"]').click();await page.locator('[data-mode="week-day"]').click();
 assert.match(await page.locator('[data-mode="week-day"]').innerText(),/60/);
 const headers=await page.locator('#content table thead th').allTextContents();
 assert.ok(headers.includes('周K结构（辅助）')&&headers.includes('日K结构（辅助）'));
 const shown=await page.locator('#content table [data-fire-detail]').evaluateAll(nodes=>nodes.map(n=>n.dataset.fireDetail));
 assert.deepEqual(shown.toSorted(),candidates.map(r=>r.code).toSorted());
 const br=page.locator('tr').filter({has:page.locator('[data-fire-detail="BR"]')});
 assert.match(await br.innerText(),/周MA10上方/);assert.match(await br.innerText(),/16,045/);
 for(const width of [1500,1100]){
  await app.evaluate(({BrowserWindow},w)=>BrowserWindow.getAllWindows()[0].setSize(w,980),width);
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:join(out,'stable-'+width+'.png')});
  await page.locator('#content table thead').scrollIntoViewIfNeeded();
  await page.screenshot({path:join(out,'table-'+width+'.png')});
  await page.evaluate(()=>window.scrollTo(0,0));
 }
 await page.locator('#fireFilter').selectOption('all');
 const coke=page.locator('tr').filter({has:page.locator('[data-fire-detail="J"]')});
 assert.match(await coke.innerText(),/周MA10下方/);
 await page.locator('#ruleVersion').click();
 await page.locator('#rule-panel-week-day:not([hidden])').waitFor();
 assert.match(await page.locator('#rule-panel-week-day').innerText(),/最新完成日K收盘价 > 动态周MA10/);
 assert.match(await page.locator('#rule-panel-week-day').innerText(),/结构仅作辅助展示，不参与筛选/);
 await page.screenshot({path:join(out,'rules.png')});
 await page.goto(base+'/cockpit.html');await page.locator('#ruleVersion').click();
 await page.locator('[data-rule-mode="week-day"]').click();
 assert.match(await page.locator('#rule-panel-week-day').innerText(),/最新完成日K收盘价 < 动态周MA10/);
 await page.screenshot({path:join(out,'cockpit-rules.png')});
 assert.deepEqual(errors,[]);
}catch(error){await page?.screenshot({path:join(out,'failure.png')}).catch(()=>{});throw error}
finally{await app.close()}

const old=new DatabaseSync(join(checkpoint,'business.sqlite'),{readOnly:true});
const db=new DatabaseSync(resolve('.runtime/five-workbench.sqlite'),{readOnly:true});
const rows=(conn,table)=>conn.prepare('SELECT * FROM '+table+' ORDER BY rowid').all();
let tableCount;
try{
 const tables=db.prepare('SELECT name,type FROM sqlite_master').all().filter(r=>r.type==='table'&&!r.name.startsWith('sqlite_')).map(r=>r.name);tableCount=tables.length;
 for(const table of tables.filter(t=>!['system_runs','operation_events'].includes(t)))assert.deepEqual(rows(db,table),rows(old,table),table+' unchanged');
 const runsBefore=rows(old,'system_runs'),runsAfter=rows(db,'system_runs');assert.equal(runsBefore.length,runsAfter.length);
 for(let i=0;i<runsBefore.length;i++){
  const a={...runsBefore[i]},b={...runsAfter[i]};
  if(a.id===runId){assert.equal(b.status,'已结束');assert.ok(b.ended_at&&b.result);for(const k of ['status','ended_at','result']){delete a[k];delete b[k]}}
  assert.deepEqual(b,a,'run snapshot and other fields retained');
 }
 const eventsBefore=rows(old,'operation_events'),eventsAfter=rows(db,'operation_events');
 assert.deepEqual(eventsAfter.slice(0,eventsBefore.length),eventsBefore);
 assert.deepEqual(eventsAfter.slice(eventsBefore.length).map(e=>e.action),['结束系统运行']);
 assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
}finally{old.close();db.close()}
const result={passed:true,at:new Date(Date.now()+8*3600000).toISOString().replace('Z','+08:00'),dataDate:fire.data_date,rule:fire.week_day_rule,counts:fire.counts['week-day'],otherModesUnchanged:true,rawScanUnchanged:true,checkedBusinessTables:tableCount,onlyAuthorizedBusinessChanges:['结束指定系统轮次','追加一条结束审计'],accountsCardsPlansBudgetsUnchanged:true,oldRunSnapshotPreserved:true,noNewRunStarted:true,errors};
await writeFile(join(out,'acceptance.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
