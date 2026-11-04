import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {_electron} from 'file:///C:/Users/86199/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const out=resolve('output/strength-rest-2026-11-04'),preview=JSON.parse(await readFile(join(out,'preview.json'),'utf8')),checks=[],errors=[];
const env={...process.env,WUJIAN_DESKTOP_PORT:String(preview.port),WUJIAN_DESKTOP_PROFILE:join(preview.root,'rest-qa-profile'),WUJIAN_MONITOR_HOME:join(preview.root,'monitor')};delete env.ELECTRON_RUN_AS_NODE;
let app,page;
const option=()=>page.locator('#strengthChart').evaluate(e=>{const o=echarts.getInstanceByDom(e).getOption();return{x:o.xAxis[0].data,series:o.series.map(s=>({id:s.id,label:s.endLabel.formatter,data:s.data,color:s.lineStyle.color}))}});
try{
 app=await _electron.launch({executablePath:resolve('.runtime/desktop-strength-rest-20261104/小木-win32-x64/小木.exe'),env,timeout:45000});page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));await page.waitForSelector('#accountSelect option',{state:'attached',timeout:45000});await page.setViewportSize({width:1920,height:1080});await page.goto(preview.base+'/market-panorama.html#market/strength');
 await page.waitForSelector('[data-strength-auto]',{timeout:45000});if(await page.locator('[data-strength-auto]').getAttribute('aria-pressed')==='true')await page.locator('[data-strength-auto]').click();
 await page.locator('.observation-pool-row [data-strength-pool="all"]').click();await page.locator('[data-compare-clear]').click();
 await page.evaluate(()=>{for(const code of ['MA','SC','LU','FU'])document.querySelector('.strength-product-tabs [data-compare="'+code+'"]')?.click()});
 await page.waitForFunction(()=>{const e=document.querySelector('#strengthChart'),o=e&&echarts.getInstanceByDom(e)?.getOption();return o?.series.length===4&&o.series.find(s=>s.id==='MA')?.data.some(v=>v?.displayOnly==='休市延续')},null,{timeout:90000});
 const data=await option(),index=data.x.indexOf('2026-11-04 00:30:00'),ma=data.series.find(s=>s.id==='MA'),sc=data.series.find(s=>s.id==='SC');assert.ok(index>=0);assert.equal(ma.data[index].displayOnly,'休市延续');assert.equal(ma.data[index].sourceStamp,'2026-11-03 23:00:00');assert.equal(typeof sc.data[index],'number');
 assert.ok(data.series.every(s=>s.data.find(Number.isFinite)===0));assert.equal(new Set(data.series.map(s=>s.color)).size,4);assert.ok(data.series.every(s=>/^\d\d /.test(s.label)));checks.push({realContracts:true,nightRestHorizontal:true,oilStillTradesAfterMidnight:true,openingZeroPreserved:true,labelsAndColorsPreserved:true,heldCounts:Object.fromEntries(data.series.map(s=>[s.id,s.data.filter(v=>v?.displayOnly).length]))});
 await page.locator('#strengthChart').scrollIntoViewIfNeeded();await page.locator('#strengthChart').evaluate(e=>echarts.getInstanceByDom(e).resize());
 const uri=await page.locator('#strengthChart').evaluate(e=>echarts.getInstanceByDom(e).getDataURL({type:'png',pixelRatio:1,backgroundColor:'#ffffff'}));await writeFile(join(out,'desktop-chart.png'),Buffer.from(uri.split(',')[1],'base64'));
 await page.locator('#strengthChart').evaluate((e,index)=>{const chart=echarts.getInstanceByDom(e);chart.dispatchAction({type:'showTip',seriesIndex:0,dataIndex:index})},index);await page.waitForTimeout(500);assert.match(await page.locator('#strengthChart').innerText(),/休市延续/);assert.match(await page.locator('#comparisonStatus').innerText(),/缺数保留断点/);checks.push({tooltipExplainsLastActualTime:true});
 await page.locator('[data-replay]').click();await page.waitForTimeout(1800);await page.locator('[data-replay]').click();const replay=await option(),cutoff=replay.x.at(-1);assert.ok(replay.x.length<data.x.length);assert.ok(replay.series.every(s=>s.data.every(v=>!v?.displayOnly||v.sourceStamp<=cutoff)));checks.push({actualReplayClick:true,noFutureHoldPrices:true,cutoff});
 await page.locator('[data-live]').click();await page.waitForFunction(()=>document.querySelector('[data-strength-auto]')?.getAttribute('aria-pressed')==='true');checks.push({returnLiveClick:true});
 assert.deepEqual(errors,[]);await writeFile(join(out,'desktop-verification.json'),JSON.stringify({passed:true,at:new Date().toISOString(),checks,errors,scope:'独立桌面与业务/监控副本；真实当日具体主力分钟数据；图像为桌面图表原生导出；未发送微信或建立交易方案'},null,2));console.log(JSON.stringify({passed:true,checks},null,2));
}catch(e){await writeFile(join(out,'failure.json'),JSON.stringify({error:e.message,checks,errors},null,2));throw e}
finally{await app?.evaluate(({app})=>app.exit(0)).catch(()=>{});await app?.close().catch(()=>{})}
