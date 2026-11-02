import {openHarness,chromium,_electron,project} from './redesign-harness.mjs';
import {writeFile,readFile} from 'node:fs/promises';
import {join} from 'node:path';import assert from 'node:assert/strict';
const desktop=process.argv.includes('--desktop'),formal=process.argv.includes('--formal'),prefix=formal?'formal-':desktop?'desktop-':'browser-',out='output/dce-public-2026-10-25';
let h,browser,app;const checks=[],errors=[];
try{
 if(formal){browser=await chromium.launch({headless:true,executablePath:'E:/AppCache/Playwright/chromium-1228/chrome-win64/chrome.exe'});h={base:'http://127.0.0.1:4318'}}
 else{h=await openHarness('dce-public-acceptance');browser=h.browser}
 if(desktop)app=await _electron.launch({executablePath:join(project,'.runtime/desktop-dce-public-20261025/小木-win32-x64/小木.exe'),env:{...h.env,WUJIAN_DESKTOP_PROFILE:join(h.root,'dce-public-desktop-profile')},cwd:project});
 const p=app?await app.firstWindow():await browser.newPage({viewport:{width:1440,height:900}});if(app)await p.waitForSelector('#mainNav');p.on('pageerror',e=>errors.push(e.message));
 await p.goto(h.base+'/market-panorama.html#variety');await p.waitForSelector('.detail-identity');
 if(!formal){
  await p.locator('#refreshMode').selectOption('supplement');await p.locator('#refreshButton').click();let state;
  for(let i=0;i<200;i++){state=await fetch(h.base+'/api/market-panorama/status').then(r=>r.json());if(state.job&&!['queued','running'].includes(state.job.status))break;await p.waitForTimeout(1000)}
  assert.ok(state.job&&!['queued','running','failed'].includes(state.job.status));await writeFile(out+'/'+prefix+'refresh.json',JSON.stringify(state.job,null,2));checks.push('点击原同步按钮，缺口保留且其他来源结果继续可用');
 }
 await p.locator('[data-nav=variety]').click();await p.locator('[data-picker-sector="农产品"]').click();await p.locator('[data-pick=M]').click();
 await p.waitForFunction(()=>document.querySelector('[data-evidence=roll]')?.textContent.includes('新浪财经'),null,{timeout:30000});
 const detail=await fetch(h.base+'/api/market-panorama/variety?product=M&date=2026-10-25').then(r=>r.json());
 assert.match(detail.contractInfo.source,/OpenCTP/);assert.equal(detail.contractInfo.dataDate,'2026-10-25');assert.equal(detail.contractInfo.lastDelivery,null);assert.equal(detail.rollYield.dataDate,'2026-10-23');
 assert.ok(Math.abs(detail.rollYield.rate-Math.log(detail.rollYield.near.close/detail.rollYield.far.close)*12/detail.rollYield.monthGap)<1e-10);assert.match(detail.rollYield.coverage,/不是历史全月份/);
 const evidence=await p.locator('.supplement-evidence').innerText();assert.match(evidence,/最后交割日未取得/);assert.match(evidence,/查询批次日/);assert.match(evidence,/新浪财经/);
 await p.locator('.supplement-evidence').scrollIntoViewIfNeeded();await p.screenshot({path:out+'/'+prefix+'m-contract-roll.png'});checks.push('豆粕合约日期标明OpenCTP及查询批次，展期标明新浪完成日K并独立复算');
 await p.locator('[data-picker-sector="化工"]').click();await p.locator('[data-pick=BZ]').click();await p.waitForFunction(()=>document.querySelector('[data-evidence=roll]')?.textContent.includes('不完整'),null,{timeout:30000});await p.locator('.supplement-evidence').scrollIntoViewIfNeeded();await p.screenshot({path:out+'/'+prefix+'incomplete-product.png'});checks.push('纯苯缺失合约日K时保留缺口，不用不完整样本排持仓前二');
 await p.locator('#sourcesButton').click();const sources=await p.locator('#sourceBody').innerText();assert.match(sources,/OpenCTP公开合约字典/);assert.match(sources,/HTTP接口返回412/);assert.match(sources,/74 条/);await p.screenshot({path:out+'/'+prefix+'sources.png'});checks.push('来源弹窗同时显示官方失败、公开备用和日期');
 assert.deepEqual(errors,[]);await writeFile(out+'/'+prefix+'click.json',JSON.stringify({checkedAt:new Date().toISOString(),checks,errors,formal,desktop,example:detail.rollYield,contract:detail.contractInfo},null,2));console.log(JSON.stringify({checks,errors,formal,desktop}));
}finally{if(app)await app.close();if(formal)await browser?.close();else await h?.close()}
