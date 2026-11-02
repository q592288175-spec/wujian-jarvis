import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
import net from 'node:net';
import {planFixture} from '../tests/helpers/plan-fixture.mjs';
const project=resolve('.'),root=planFixture(project),output=resolve('output/playwright/plan-lifecycle');await mkdir(output,{recursive:true});
const listener=net.createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));const port=listener.address().port;await new Promise(r=>listener.close(r));
const base='http://127.0.0.1:'+port,errors=[],steps=[];let service,desktop,page,logs='';
const env={...process.env,PORT:String(port),WUJIAN_WORKBENCH_DB:join(root,'business.sqlite'),WUJIAN_BUNDLE_ROOT:resolve('../资料包'),WUJIAN_OPERATION_DIR:join(root,'操作记录'),WUJIAN_MONITOR_DB:join(root,'monitor.sqlite'),WUJIAN_MONITOR_HOME:join(root,'monitor'),WUJIAN_DESKTOP_PORT:String(port),WUJIAN_DESKTOP_PROFILE:join(root,'profile')};
for(const key of Object.keys(env))if(/TQ_|FEISHU_|DEEPSEEK_|OPENAI_|VOLC_|ARK_/.test(key)||key==='ELECTRON_RUN_AS_NODE')delete env[key];
const {_electron}=await import(pathToFileURL('C:/Users/86199/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href);
const api=async(path,method='GET',input)=>{const r=await fetch(base+path,{method,headers:{Origin:base,'Content-Type':'application/json'},...(input===undefined?{}:{body:JSON.stringify(input)})});const value=await r.json();if(!r.ok)throw Error(JSON.stringify(value));return value};
async function start(){
 service=spawn(process.execPath,[join(project,'server.mjs')],{cwd:root,env,windowsHide:true,stdio:['ignore','pipe','pipe']});service.stdout.on('data',x=>logs+=x);service.stderr.on('data',x=>logs+=x);
 for(let i=0;i<100;i++){try{await api('/api/health');break}catch{await new Promise(r=>setTimeout(r,200));if(i===99)throw Error('启动超时 '+logs)}}
 desktop=await _electron.launch({executablePath:resolve('.runtime/desktop-lifecycle-build/小木-win32-x64/小木.exe'),args:[],env,timeout:30000});
 page=await desktop.firstWindow();page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);await page.waitForSelector('#accountSelect option',{state:'attached'});
}
async function stop(){if(desktop){await desktop.close();desktop=null}if(service){const p=service;service=null;p.kill();if(p.exitCode===null)await new Promise(r=>p.once('exit',r));}}
async function view(name){await page.locator('#mainNav [data-view="'+name+'"]').click();await page.waitForFunction(title=>document.querySelector('#viewEyebrow')?.textContent===title,name.toUpperCase())}
async function remove(id){await page.locator('[data-delete-card="'+id+'"]').click();await page.locator('#removeCardForm [type=checkbox]').check();await page.locator('#removeCardForm button').click();await page.locator('#modal').waitFor({state:'hidden'});await page.locator('[data-card="'+id+'"]').waitFor({state:'detached'})}
async function restore(id){await page.locator('[data-card-archive]').click();page.once('dialog',d=>d.accept());await page.locator('[data-restore="'+id+'"]').click();await page.locator('#modal').waitFor({state:'hidden'});await page.locator('[data-card="'+id+'"]').waitFor()}
try{
 await start();const account=await api('/api/workbench/accounts','POST',{alias:'隔离计划账户',mode:'simulation',stageCapital:1000000,equity:1000000,tier:'normal'});
 const card=await api('/api/workbench/cards','POST',{accountId:account.id,name:'烧碱',symbol:'SH',contract:'SH2611',direction:'long'});
 await page.reload();await page.waitForSelector('#accountSelect option',{state:'attached'});await page.locator('#accountSelect').selectOption(account.id);await view('water');await page.locator('[data-delete-card]').waitFor();await remove(card.id);
 assert.equal((await api('/api/workbench/cards/'+card.id)).archivedAt!==null,true);await restore(card.id);steps.push('水移除确认及恢复可用，研究卡未物理删除');
 await view('metal');await page.waitForSelector('#metalForm');await page.waitForFunction(()=>!document.querySelector('#submitToEarth').disabled);
 assert.equal(await page.locator('#riskCalc,#approvePlan').count(),0);
 await page.locator('[name=entryNumber]').fill('2000');await page.locator('[name=stopNumber]').fill('1900');await page.locator('[name=exitRule]').fill('按原计划退出，合成测试');
 await page.locator('#submitToEarth').click();await page.waitForSelector('#confirmPlanToEarth');assert.ok((await page.locator('#modalBody').innerText()).includes('3 手'));
 await page.screenshot({path:join(output,'confirm-plan.png')});await page.locator('#cancelPlanConfirm').click();assert.equal((await api('/api/workbench/cards/'+card.id)).plan.approvedAt,null);
 await page.locator('#submitToEarth').click();await page.locator('#confirmPlanToEarth').click();await page.waitForSelector('#executionForm');
 assert.equal((await api('/api/workbench/cards/'+card.id)).plan.status,'已批准');assert.equal((await api('/api/workbench/cards/'+card.id)).plan.version,1);steps.push('金单一按钮、确认摘要、返回修改不批准、再次确认到土；未重复生成版本');
 await remove(card.id);let saved=await api('/api/workbench/cards/'+card.id);assert.equal(saved.plan.status,'已取消');assert.equal(saved.executions.length,0);
 await view('metal');await page.waitForSelector('[data-card-archive]');assert.equal(await page.locator('[data-card]').count(),0);await restore(card.id);await page.waitForSelector('#metalForm');assert.equal((await api('/api/workbench/cards/'+card.id)).status,'观察');
 await remove(card.id);steps.push('土取消未成交计划，金同步消失；金恢复及移除同一入口，旧批准不恢复');
 const before=await api('/api/workbench/cards/'+card.id);await stop();await start();const after=await api('/api/workbench/cards/'+card.id);assert.deepEqual(after,before);steps.push('Windows APP与Node服务关闭重启后，归档和计划、轮次、审计全部保留');
 await view('metal');await page.waitForSelector('[data-card-archive]');await restore(card.id);await page.waitForSelector('#metalForm');
 const code=join(root,'scripts/fire_scan.py');await writeFile(code,(await readFile(code,'utf8'))+'\n# isolated mismatch\n');await view('water');await view('metal');await page.waitForSelector('#planLockNotice');assert.ok((await page.locator('#planLockNotice').innerText()).includes('旧轮次版本待核对'));
 await page.locator('#planLockNotice summary').click();assert.ok((await page.locator('#planLockNotice').innerText()).includes('动态月行情适配'));await page.locator('#openRunManagement').click();await page.waitForSelector('#finishSystemRun');steps.push('真实旧轮次差异列表可见，金直达木处理；未自动解锁');
 for(const width of [1500,1100]){await desktop.evaluate(({BrowserWindow},width)=>BrowserWindow.getAllWindows()[0].setSize(width,980),width);await view('metal');await page.waitForSelector('#metalForm');await page.waitForTimeout(350);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:join(output,'metal-'+width+'.png'),fullPage:true});}
 assert.deepEqual(errors,[]);await writeFile(join(output,'acceptance.json'),JSON.stringify({passed:true,at:new Date().toISOString(),database:env.WUJIAN_WORKBENCH_DB,steps,errors},null,2));console.log(JSON.stringify({passed:true,steps,output}));
}catch(error){await page?.screenshot({path:join(output,'failure.png')}).catch(()=>{});await writeFile(join(output,'failure.txt'),error.stack);throw error}
finally{await stop();await writeFile(join(output,'server.log'),logs)}
