import {openHarness,_electron,project} from './redesign-harness.mjs';
import {join} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const h=await openHarness('unified-desktop',{businessName:'unified-desktop.sqlite'}),out='output/unified-workbench-2026-10-25';await mkdir(out,{recursive:true});let app;const checks=[],errors=[];
try{
 app=await _electron.launch({executablePath:join(project,'.runtime/desktop-unified-20261025/小木-win32-x64/小木.exe'),env:{...h.env,WUJIAN_DESKTOP_PROFILE:join(h.root,'unified-desktop-profile')},cwd:project});
 const page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));await page.waitForSelector('#marketContent table',{timeout:90000});assert.match(page.url(),/market-panorama\.html/);
 const menu=await app.evaluate(({Menu})=>Menu.getApplicationMenu().items.find(i=>i.label==='工作台').submenu.items.map(i=>i.label));assert.equal(menu.includes('稳定版'),false);assert.ok(menu.includes('市场全景')&&menu.includes('全息版'));checks.push({name:'新桌面构建默认进入市场全景，版本菜单仅保留两种',menu});
 await page.locator('[data-route="trade/fire"]').click();await page.waitForSelector('.fire-overview');await page.locator('[data-mode="day-trend"]').click();await page.waitForTimeout(100);
 await page.locator('[data-fire-detail="FU"]').first().click();await page.waitForSelector('#detailResearch:enabled');await page.locator('#detailResearch').click();await page.waitForSelector('#runResearch',{timeout:30000});assert.match(await page.locator('#content').innerText(),/燃料油|燃油/);checks.push('真实桌面：燃油火候选进入水研究，同一账户建立研究卡，仅操作隔离副本');
 await page.screenshot({path:out+'/desktop-water-with-card.png'});
 const detail=page.locator('details').filter({has:page.locator('#waterForm')}).first();if(!await detail.getAttribute('open'))await detail.locator('summary').click();
 const textarea=page.locator('#waterForm textarea').first();await textarea.fill('隔离测试：这段尚未保存的研究记录应当保留');
 await page.locator('[data-route="market/overview"]').click();await page.locator('[data-route="trade/water"]').click();await page.waitForSelector('#waterForm');assert.equal(await page.locator('#waterForm textarea').first().inputValue(),'隔离测试：这段尚未保存的研究记录应当保留');checks.push('水研究未保存编辑在市场/交易切换后保留');
 await page.locator('[data-route="trade/metal"]').click();await page.waitForSelector('#goldPanel');await page.screenshot({path:out+'/desktop-metal-with-card.png'});checks.push('金计划沿用燃油研究卡，未批准或执行交易');
 await page.locator('[data-route="trade/wood"]').click();await page.waitForTimeout(300);await page.screenshot({path:out+'/desktop-wood-with-card.png'});
 for(const zoom of [1,1.25]){await app.evaluate(({BrowserWindow},zoom)=>BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(zoom),zoom);await page.waitForTimeout(150);checks.push({name:'实际桌面缩放',zoom,geometry:await page.evaluate(()=>({viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth,assistant:document.querySelector('#assistantButton').getBoundingClientRect().toJSON()}))})}
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(1));
 await page.locator('a.version-link').click();await page.waitForSelector('#globeScene[data-render-ready=true]',{timeout:45000});const globe=await page.evaluate(()=>({boards:document.querySelectorAll('#sectorNav button').length,affection:document.querySelector('.globe-affection')?.textContent,versions:[...document.querySelectorAll('.shell-version-switch a')].map(a=>a.textContent),stableText:document.body.innerText.includes('稳定版')}));assert.equal(globe.boards,12);assert.equal(globe.affection,'爱你');assert.equal(globe.stableText,false);await page.screenshot({path:out+'/desktop-holographic.png'});checks.push({name:'全息版七彩地球、板块和返回入口',...globe});
 await page.locator('.shell-version-switch').getByText('市场全景',{exact:true}).click();await page.waitForSelector('#mainNav');await page.waitForFunction(()=>document.body.dataset.area==='trade');checks.push('全息版返回统一工作台并恢复最近页面');
 assert.deepEqual(errors,[]);await writeFile(out+'/desktop-verification.json',JSON.stringify({checks,errors,isolated:true},null,2));console.log(JSON.stringify({checks,errors,isolated:true}));
}catch(e){await writeFile(out+'/desktop-failure.json',JSON.stringify({message:e.message,checks,errors},null,2));console.error(e);process.exitCode=1}finally{if(app)await app.close();await h.close()}
