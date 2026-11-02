import assert from 'node:assert/strict';
import {mkdir,copyFile,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {openHarness,_electron,project} from './redesign-harness.mjs';

const h=await openHarness(process.env.WUJIAN_TQ_VERIFY_STAGE||'tq-login-20261028',{businessName:'tq-login-business.sqlite',envOverrides:{TQ_PYTHON:resolve('.runtime/python313/python.exe')}});
await mkdir(join(h.root,'integrations'),{recursive:true});await copyFile('integrations/monitor_market.py',join(h.root,'integrations/monitor_market.py'));
await mkdir(join(h.root,'.runtime/monitor-deps/tqsdk'),{recursive:true});await copyFile('tests/helpers/tq-sdk-fixture.py',join(h.root,'.runtime/monitor-deps/tqsdk/__init__.py'));
const errors=[],steps=[],timings=[],api=path=>fetch(h.base+path).then(r=>r.json());let native;
try{
 const context=await h.browser.newContext(),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('requestfinished',request=>{if(request.url().includes('/api/tq/'))timings.push({url:new URL(request.url()).pathname,method:request.method(),ms:request.timing().responseEnd})});await page.setViewportSize({width:1500,height:980});
 await page.goto(h.base+'/market-panorama.html#market/strength');await page.locator('#tqLoginButton').waitFor();
 await page.locator('#tqLoginButton').click();await page.locator('#tqLoginDialog[open]').waitFor();
 await page.locator('#tqLoginForm [name=user]').fill('fixture-account');await page.locator('#tqLoginForm [name=password]').fill('fixture-password');
 await page.locator('#tqLoginForm [name=remember]').check();await page.locator('#tqLoginForm button[type=submit]').click();
 await page.waitForFunction(()=>document.querySelector('#tqStateCounts').textContent.match(/收到 [1-9]/),null,{timeout:30000});
 assert.equal(await page.locator('#tqLoginForm [name=password]').inputValue(),'');assert.match(await page.locator('#tqStateLabel').innerText(),/已连接/);
 const status=await api('/api/tq/status');assert.equal(status.saved,true);assert.equal(status.heartbeatFresh,true);assert.ok(status.quoteCount>0);assert.ok(!JSON.stringify(status).includes('fixture-password'));
 const ciphertext=await readFile(join(h.root,'monitor/tq-login.enc'),'utf8');assert.ok(!ciphertext.includes('fixture-password'));assert.ok(!ciphertext.includes('fixture-account'));
 const quotes=await api('/api/tq/quotes');assert.equal(quotes.items.find(q=>q.symbol==='SHFE.FU2701').last,3000);
 assert.ok(status.unavailable.some(q=>q.symbol==='SHFE.AU2701'&&q.reason==='行情权限不足'));assert.match(await page.locator('#tqCoverageGaps').innerText(),/其他合约继续接收/);steps.push('休市首笔报价显示；单个合约权限不足单列，不中断其他订阅');
 await page.waitForFunction(()=>document.querySelector('#tqActionResult').textContent.includes('登录请求已提交'));const colors=await page.evaluate(()=>({background:getComputedStyle(document.querySelector('#tqLoginDialog')).backgroundColor,title:getComputedStyle(document.querySelector('#tqLoginTitle')).color,cell:getComputedStyle(document.querySelector('#tqQuoteSamples td')).color}));assert.equal(colors.background,'rgb(17, 26, 36)');assert.equal(colors.title,'rgb(242, 246, 250)');assert.equal(colors.cell,'rgb(234, 240, 245)');await page.screenshot({path:join(h.out,'login-connected.png')});steps.push('浏览器填写账号、加密保存、真实采集进程协议、收到报价与清空密码；深色弹窗文字对比度核验');
 // Same-contract Tq data, not a quote from the public backend, reaches the panorama.
 const today=new Date(Date.now()+28800000).toISOString().slice(0,10),snap=await api('/api/market-panorama/snapshot?date='+today),fuel=snap.products.find(p=>p.code==='FU');
 assert.ok(snap.tqConnection.selected);assert.equal(fuel.priceSource,'TqSdk');assert.equal(fuel.close,3000);assert.equal(fuel.volume,12345);assert.equal(fuel.interest,67890);steps.push('市场全景最新量价仓确实使用同合约天勤数据');
 await page.locator('#tqLoginForm [name=user]').fill('invalid');await page.locator('#tqLoginForm [name=password]').fill('fixture-password');await page.locator('#tqLoginForm button[type=submit]').click();
 await page.waitForFunction(()=>document.querySelector('#tqStateLabel').textContent.includes('未通过'),null,{timeout:30000});assert.equal((await api('/api/tq/status')).quoteCount,0);await page.screenshot({path:join(h.out,'login-denied.png')});steps.push('密码或权限错误明确显示，旧报价清空且不泄露密码');
 const cross=await fetch(h.base+'/api/tq/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://untrusted.invalid'},body:JSON.stringify({user:'fixture-account',password:'fixture-password'})});assert.equal(cross.status,403);steps.push('拒绝跨站提交凭据');
 await page.locator('[data-tq-logout]').click();await page.waitForFunction(()=>document.querySelector('#tqStateLabel').textContent==='未启用');assert.equal((await api('/api/tq/status')).configured,false);
 await page.locator('[data-tq-close]').click();await page.goto(h.base+'/cockpit.html');await page.locator('#tqLoginButton').click();await page.locator('#tqLoginDialog[open]').waitFor();steps.push('全息版使用同一登录状态与入口');
 // Launch rebuilt native app against isolated DBs. No real credentials or notifications.
 native=await _electron.launch({executablePath:resolve(process.env.WUJIAN_TQ_DESKTOP||'.runtime/desktop-tq-verified-20261028/小木-win32-x64/小木.exe'),env:h.env,timeout:60000});
 const window=await native.firstWindow();window.on('pageerror',e=>errors.push(e.message));await window.locator('#tqLoginButton').waitFor({timeout:60000});await window.locator('#tqLoginButton').click();await window.locator('#tqLoginDialog[open]').waitFor();
 assert.equal(await window.evaluate(()=>typeof window.xiaomuMonitor.configure),'function');await window.screenshot({path:join(h.out,'native-login.png')});steps.push('重新构建的 Windows APP 实际启动，登录入口与现有 IPC 可用');
 await window.locator('#tqLoginForm [name=user]').fill('fixture-account');await window.locator('#tqLoginForm [name=password]').fill('fixture-password');await window.locator('#tqLoginForm button[type=submit]').click();
 await window.waitForFunction(()=>document.querySelector('#tqStateCounts').textContent.match(/收到 [1-9]/),null,{timeout:30000});
 assert.equal(await window.locator('#tqLoginForm [name=password]').inputValue(),'');await window.screenshot({path:join(h.out,'native-connected.png')});steps.push('Windows APP 实际提交登录并显示隔离采集器返回的合约报价');
 assert.deepEqual(errors,[]);
 await writeFile(join(h.out,'result.json'),JSON.stringify({passed:true,steps,liveAccountVerified:false,fixture:'本机隔离SDK，无真实外网认证',timings,errors},null,2));console.log(JSON.stringify({passed:true,steps,liveAccountVerified:false,timings:timings.filter(t=>t.method==='POST')},null,2));
}finally{await native?.close();await h.close();}
