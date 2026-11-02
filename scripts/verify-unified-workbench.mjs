import {openHarness} from './redesign-harness.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const h=await openHarness('unified-workbench',{businessName:'unified-workbench.sqlite'}),out='output/unified-workbench-2026-10-25';await mkdir(out,{recursive:true});
const checks=[],errors=[],failedRequests=[];
try{
 const page=await h.browser.newPage({viewport:{width:1500,height:980}});
 page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400&&!r.url().includes('favicon'))failedRequests.push({url:r.url(),status:r.status()})});
 await page.goto(h.base+'/market-panorama.html#market/home');await page.locator('#mainNav [data-route]').first().waitFor();
 await page.waitForSelector('#marketContent table',{timeout:90000});
 checks.push({name:'统一主入口',nav:await page.locator('#mainNav [data-route]').count(),title:await page.title()});
 const token=await page.evaluate(()=>{window.__unifiedProof=crypto.randomUUID();return window.__unifiedProof});
 const routes=['market/overview','market/strength','market/rankings','market/funds','market/positions','market/fees','market/variety','market/seat-flow','trade/home','trade/fire','trade/water','trade/metal','trade/earth','trade/wood','trade/monitor','trade/rules'];
 for(const route of routes){
  await page.locator(`[data-route="${route}"]`).click();await page.waitForFunction(route=>document.querySelector(`[data-route="${route}"]`)?.getAttribute('aria-current')==='page',route,{timeout:45000});
  await page.waitForTimeout(350);assert.equal(await page.evaluate(()=>window.__unifiedProof),token,'切页发生整页重载');
  checks.push({name:route,heading:await page.locator('#viewTitle').textContent(),bodyLength:await page.locator(route.startsWith('market')?'#marketContent':'#content').innerText().then(s=>s.length)});
  if(['trade/home','trade/fire','trade/water','trade/metal','trade/earth','trade/wood','trade/monitor','trade/rules','market/overview','market/strength'].includes(route))await page.screenshot({path:out+'/after-'+route.replace('/','-')+'.png',fullPage:false});
 }
 assert.equal(await page.locator('#mainNav [data-route]').count(),17);assert.equal(await page.locator('.side-nav').count(),1);
 await page.locator('[data-route="trade/fire"]').click();await page.waitForURL('**#trade/fire');await page.waitForSelector('.fire-overview');
 const bell=await page.locator('#content .monitor-bell').first().evaluate(e=>({filter:getComputedStyle(e.querySelector('img')).filter,src:e.querySelector('img').getAttribute('src'),rect:e.getBoundingClientRect().toJSON()}));assert.equal(bell.filter,'none');checks.push({name:'浅色提醒铃铛',...bell});
 await page.locator('#assistantButton').click();await page.waitForSelector('#assistantDrawer:not([hidden])');assert.equal(await page.locator('#connectCall').isVisible(),true);
 await page.locator('#assistantInput').fill('尚未发送的核对内容');await page.locator('#minAssistant').click();await page.locator('[data-route="market/overview"]').click();await page.locator('#restoreAssistant').click();assert.equal(await page.locator('#assistantInput').inputValue(),'尚未发送的核对内容');checks.push({name:'跨市场/交易页面保留助手和输入'});
 await page.locator('#closeAssistant').click();
 await page.locator('[data-route="trade/fire"]').click();await page.waitForSelector('.fire-overview');
 await page.goBack();await page.waitForFunction(()=>document.body.dataset.area==='market');checks.push({name:'后退恢复市场页面'});await page.goForward();await page.waitForFunction(()=>document.body.dataset.area==='trade');
 await page.reload();await page.waitForSelector('.fire-overview');checks.push({name:'刷新恢复交易页面'});
 for(const viewport of [{width:1366,height:768},{width:1920,height:1080},{width:1100,height:720},{width:390,height:844}]){
  await page.setViewportSize(viewport);await page.waitForTimeout(150);const geometry=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,assistantVisible:document.querySelector('#assistantButton').getBoundingClientRect().width>0,contentFont:getComputedStyle(document.querySelector('#content')).fontFamily}));
  checks.push({name:'窗口适配',viewport,...geometry});await page.screenshot({path:out+`/viewport-${viewport.width}.png`});
 }
 await page.setViewportSize({width:1500,height:980});await page.goto(h.base+'/?view=water&product=FU');await page.waitForSelector('#mainNav [data-route="trade/water"][aria-current=page]',{timeout:45000});assert.match(page.url(),/market-panorama\.html/);checks.push({name:'旧地址兼容及品种参数'});
 const summary={checks,errors,failedRequests,isolated:true,base:h.base};await writeFile(out+'/ui-verification.json',JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));assert.deepEqual(errors,[]);
}catch(e){await writeFile(out+'/ui-failure.json',JSON.stringify({message:e.message,checks,errors,failedRequests},null,2));console.error(e);process.exitCode=1}finally{await h.close()}
