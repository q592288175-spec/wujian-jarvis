import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
import net from 'node:net';
import {planFixture} from '../tests/helpers/plan-fixture.mjs';
const project=resolve('.'),root=planFixture(project),out=resolve('output/gold-desktop');await mkdir(out,{recursive:true});
const barFile=join(root,'.runtime/fire-scan/contract-bars/SH2611.json'),bars=JSON.parse(await readFile(barFile));
Object.assign(bars.at(-2),{open:2200,high:2240,low:2100,close:2120});Object.assign(bars.at(-1),{open:2140,high:2210,low:2110,close:2130});await writeFile(barFile,JSON.stringify(bars));
const listener=net.createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));const port=listener.address().port;await new Promise(r=>listener.close(r));
const base='http://127.0.0.1:'+port,errors=[],steps=[];let service,desktop,page,logs='';
const env={...process.env,PORT:String(port),WUJIAN_WORKBENCH_DB:join(root,'business.sqlite'),WUJIAN_BUNDLE_ROOT:resolve('../资料包'),WUJIAN_OPERATION_DIR:join(root,'操作记录'),WUJIAN_MONITOR_DB:join(root,'monitor.sqlite'),WUJIAN_MONITOR_HOME:join(root,'monitor'),WUJIAN_DESKTOP_PORT:String(port),WUJIAN_DESKTOP_PROFILE:join(root,'profile')};
for(const key of Object.keys(env))if(/TQ_|FEISHU_|DEEPSEEK_|OPENAI_|VOLC_|ARK_/.test(key)||key==='ELECTRON_RUN_AS_NODE')delete env[key];
const {_electron}=await import(pathToFileURL('C:/Users/86199/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href);
const api=async(path,method='GET',input)=>{const r=await fetch(base+path,{method,headers:{Origin:base,'Content-Type':'application/json'},...(input===undefined?{}:{body:JSON.stringify(input)})});const value=await r.json();if(!r.ok)throw Error(JSON.stringify(value));return value};
async function start(){
 service=spawn(process.execPath,[join(project,'server.mjs')],{cwd:root,env,windowsHide:true,stdio:['ignore','pipe','pipe']});service.stdout.on('data',x=>logs+=x);service.stderr.on('data',x=>logs+=x);
 for(let i=0;i<100;i++){try{await api('/api/health');break}catch{await new Promise(r=>setTimeout(r,200));if(i===99)throw Error('服务未启动 '+logs)}}
 desktop=await _electron.launch({executablePath:resolve('.runtime/desktop-gold-20261019/小木-win32-x64/小木.exe'),env,timeout:30000});
 page=await desktop.firstWindow();page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);await page.waitForSelector('#accountSelect option',{state:'attached'});
}
async function stop(){if(desktop){await desktop.close();desktop=null}if(service){const p=service;service=null;p.kill();if(p.exitCode===null)await new Promise(r=>p.once('exit',r))}}
try{
 await start();const a=await api('/api/workbench/accounts','POST',{alias:'四法桌面账户甲',mode:'simulation',stageCapital:1e6,equity:1e6,tier:'normal'}),b=await api('/api/workbench/accounts','POST',{alias:'四法桌面账户乙',mode:'simulation',stageCapital:2e6,equity:2e6,tier:'normal'});
 const card=await api('/api/workbench/cards','POST',{accountId:a.id,name:'烧碱（隔离合成）',symbol:'SH',contract:'SH2611',direction:'long'});
 await page.reload();await page.locator('#accountSelect').selectOption(a.id);await page.locator('[data-view=metal]').click();await page.locator('#analyzeGold').click();await page.locator('#goldChoiceForm').waitFor();
 assert.equal(await page.locator('.gold-method').count(),4);assert.equal((await api('/api/workbench/cards/'+card.id)).plan,null);
 await page.locator('[name=method][value="anti-break"]').check();await page.locator('#goldChoiceForm [name=start]').selectOption(bars.at(-2).date);await page.locator('#goldChoiceForm [name=confirmed]').check();
 await page.screenshot({path:join(out,'01-method-analysis.png'),fullPage:true});
 const pixels=await page.locator('#goldChart').evaluate(c=>{const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;return d.filter((v,i)=>i%4===3&&v>0).length});assert.ok(pixels>1000);
 await page.locator('#goldChoiceForm button').click();await page.locator('#goldTermsForm').waitFor();
 const form=page.locator('#goldTermsForm');await form.locator('[name=entryMin]').fill('2241');await form.locator('[name=entryMax]').fill('2242');await form.locator('[name=tradingDay]').fill('2099-10-20');await form.locator('[name=validUntil]').fill('2099-10-20T15:00');await form.locator('[name=exitRule]').fill('隔离案例：止损到价保护，按已审定结构退出');
 await form.locator(`[data-account="${b.id}"] [name=selected]`).check();for(const id of [a.id,b.id])await form.locator(`[data-account="${id}"] [name=profileConfirmed]`).check();await form.locator('[name=structureConfirmed]').check();
 await form.locator('button').click();await page.locator('#goldApprove:not([disabled])').waitFor();assert.equal((await api('/api/workbench/cards/'+card.id)).plan,null);steps.push('分析、手法确认、摘要均未批准或下单；两账户摘要2手/4手');
 await page.screenshot({path:join(out,'02-multi-account-review.png'),fullPage:true});
 // Closing/reopening must retain a review, but must never auto-confirm it.
 await stop();await start();await page.locator('[data-view=metal]').click();await page.locator('#goldApprove:not([disabled])').waitFor();assert.equal(await page.locator('#goldFinalCheck').isChecked(),false);assert.equal((await api('/api/workbench/cards/'+card.id)).plan,null);steps.push('桌面关闭重启恢复待审定；最终拍板未勾选');
 await page.locator('#goldFinalCheck').check();await page.locator('#goldApprove').click();await page.waitForFunction(()=>document.querySelector('#goldStatus')?.textContent.includes('上一版已拍板'));
 let saved=await api('/api/workbench/cards/'+card.id);assert.equal(saved.plan.status,'已批准');assert.equal(saved.plan.risk.lots,2);
 const other=await api('/api/workbench/cards?accountId='+b.id);assert.equal(other.find(c=>c.symbol==='SH').plan.risk.lots,4);steps.push('自动化点击最终拍板，一份方案生成两个独立账户版本');
 await page.locator('#analyzeGold').click();await page.locator('#goldChoiceForm').waitFor();
 for(const width of [1600,1100]){await desktop.evaluate(({BrowserWindow},w)=>BrowserWindow.getAllWindows()[0].setSize(w,960),width);await page.waitForTimeout(250);const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2);assert.equal(overflow,false);await page.screenshot({path:join(out,`03-width-${width}.png`),fullPage:true})}
 assert.deepEqual(errors,[]);steps.push('1600/1100宽度无整页横向溢出，图表非空，无页面脚本异常');
 await writeFile(join(out,'acceptance.json'),JSON.stringify({passed:true,root,steps,errors,scope:'隔离数据与桌面实际点击；未连接券商、未写正式账户'},null,2));console.log(JSON.stringify({passed:true,steps}));
}catch(error){await writeFile(join(out,'failure.json'),JSON.stringify({message:error.message,stack:error.stack,logs,errors,steps},null,2));if(page)await page.screenshot({path:join(out,'failure.png'),fullPage:true}).catch(()=>{});throw error}
finally{await stop();await writeFile(join(out,'server.log'),logs)}
