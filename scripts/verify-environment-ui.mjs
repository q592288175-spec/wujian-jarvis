import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {latestFire} from '../integrations/five-workbench.mjs';
import {buildEnvironment} from '../integrations/environment.mjs';
const runtime='C:/Users/86199/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const {chromium}=await import(pathToFileURL(runtime+'/playwright/index.mjs').href);
const fire=await latestFire(),row=fire.rows.find(item=>item.code==='BU');
const card={id:'environment-ui-preview',symbol:'BU',name:'沥青',contract:row.main_contract,direction:'long',status:'观察',source:'界面验证临时数据',roundId:'界面验证',layers:{},activePlanVersion:0};
const environments={day:await buildEnvironment(card,fire,{cycle:'day'}),week:await buildEnvironment(card,fire,{cycle:'week'})};
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const page=await browser.newPage({viewport:{width:1500,height:980}}),errors=[];
page.on('pageerror',error=>errors.push(error.message));
await page.route('**/api/workbench/summary*',async route=>{const response=await route.fetch();const summary=await response.json();card.accountId=summary.account.id;summary.cards=[card];await route.fulfill({response,json:summary})});
await page.route('**/api/workbench/cards/environment-ui-preview/environment*',async route=>{const cycle=new URL(route.request().url()).searchParams.get('cycle');await route.fulfill({json:environments[cycle==='week'?'week':'day']})});
const output=resolve('output/playwright');await mkdir(output,{recursive:true});
try{
 await page.goto('http://127.0.0.1:4318/?view=metal&card='+card.id);
 await page.waitForFunction(()=>document.querySelector('#environmentStatus')?.textContent.includes('行情截止'));
 assert.equal(await page.locator('[name="mainCycle"]').inputValue(),'day');
 assert.equal(await page.locator('[name="monthDirection"]').inputValue(),'long');
 assert.equal(await page.locator('[name="weekDirection"]').inputValue(),'long');
 assert.equal(await page.locator('[name="dayDirection"]').inputValue(),'short');
 assert.equal(await page.locator('[name="marketDirection"]').inputValue(),environments.day.layers.market.direction);
 assert.equal(await page.locator('[name="sectorDirection"]').inputValue(),environments.day.layers.sector.direction);
 assert.equal(await page.locator('.layer-row select:disabled').count(),5);
 assert.equal(await page.locator('.layer-row textarea[readonly]').count(),5);
 assert.match(await page.locator('[name="marketSource"]').inputValue(),/文华替代/);
 assert.match(await page.locator('[name="sectorSource"]').inputValue(),/覆盖 \d+\/26/);
 await page.screenshot({path:resolve(output,'environment-day.png'),fullPage:true});
 await page.locator('[name="mainCycle"]').selectOption('week');
 await page.waitForFunction(()=>document.querySelector('#environmentStatus').textContent.includes('采用周MA10'));
 assert.equal(await page.locator('[name="marketDirection"]').inputValue(),environments.week.layers.market.direction);
 await page.screenshot({path:resolve(output,'environment-week.png'),fullPage:true});
 await page.locator('[name="mainCycle"]').selectOption('small');
 await page.waitForFunction(()=>document.querySelector('#environmentStatus').textContent.includes('采用日MA10'));
 for(const [width,height] of [[1100,760],[390,844]]){
  await page.setViewportSize({width,height});
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.equal(await page.evaluate(()=>[...document.querySelectorAll('.layer-row textarea')].every(field=>field.scrollHeight<=field.clientHeight+2)),true);
  await page.screenshot({path:resolve(output,`environment-${width}.png`),fullPage:true});
 }
 assert.deepEqual(errors,[]);
 await writeFile(resolve(output,'environment-ui.json'),JSON.stringify({previewOnly:true,productionCardCreated:false,day:environments.day,week:environments.week,errors},null,2));
 console.log('日线默认、周线切换、小周期日线映射、五层只读和窄窗口检查通过；未建立真实交易卡');
}finally{await browser.close()}
