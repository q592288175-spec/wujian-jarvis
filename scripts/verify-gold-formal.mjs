import {DatabaseSync} from 'node:sqlite';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const root=resolve('.'),out=resolve('output/gold-desktop');await mkdir(out,{recursive:true});
const checkpoint=resolve('.runtime/checkpoints/accounts-2026-10-19T14-52-11-439Z'),before=JSON.parse(await readFile(join(checkpoint,'before.json')));
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function snapshot(){const d=new DatabaseSync('.runtime/five-workbench.sqlite',{readOnly:true});try{d.exec('BEGIN');const rows=Object.fromEntries(Object.keys(before).map(t=>[t,d.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all().map(row=>({...row}))]));const integrity=d.prepare('PRAGMA integrity_check').get().integrity_check;d.exec('COMMIT');return{rows,integrity,counts:Object.fromEntries(Object.entries(rows).map(([t,r])=>[t,r.length])),hashes:Object.fromEntries(Object.entries(rows).map(([t,r])=>[t,digest(r)]))}}finally{d.close()}}
// The user may keep editing between checkpoint creation and deployment. Verify against the latest data.
const pre=snapshot();assert.equal(pre.integrity,'ok');
const concurrentChanges=Object.keys(before).filter(t=>digest(before[t])!==pre.hashes[t]).map(table=>({table,checkpointCount:before[table].length,currentCount:pre.counts[table]}));
await writeFile(join(out,'formal-before.json'),JSON.stringify(pre.rows,null,2));
const {_electron}=await import(pathToFileURL('C:/Users/86199/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href);
const env={...process.env,WUJIAN_DESKTOP_PROFILE:resolve('.runtime/desktop-gold-formal-profile')};delete env.ELECTRON_RUN_AS_NODE;
let app;const errors=[];
try{
 app=await _electron.launch({executablePath:resolve('.runtime/desktop-gold-20261019/小木-win32-x64/小木.exe'),env,timeout:30000});
 const page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));await page.waitForSelector('#accountSelect option',{state:'attached',timeout:30000});
 const health=await page.evaluate(()=>fetch('/api/health').then(r=>r.json()));assert.equal(health.projectRoot,root);
 await page.locator('[data-view=metal]').click();await page.locator('#goldPanel').waitFor();
 const hasCards=await page.locator('#analyzeGold').count();assert.ok(hasCards);await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:join(out,'formal-gold.png'),fullPage:false});
 const status=await page.locator('#content').innerText();assert.match(status,/分析四种手法/);assert.deepEqual(errors,[]);
 const post=snapshot();for(const table of Object.keys(pre.rows))assert.equal(post.hashes[table],pre.hashes[table],`${table} 启动前后记录变化，请保留并核对并发修改`);assert.equal(post.integrity,'ok');
 const summary=s=>({counts:s.counts,hashes:s.hashes,integrity:s.integrity});await writeFile(join(out,'formal-preservation.json'),JSON.stringify({passed:true,pre:summary(pre),post:summary(post),concurrentChanges,root,health,errors,clicked:'金导航；未点击分析、确认手法、审定或拍板，未写测试交易',lockNotice:status.includes('旧轮次版本待核对')},null,2));
 console.log(JSON.stringify({passed:true,counts:post.counts,lockNotice:status.includes('旧轮次版本待核对')}));
}finally{if(app)await app.close()}
