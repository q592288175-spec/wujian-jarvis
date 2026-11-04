import {readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {chromium} from 'file:///C:/Users/86199/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const out=resolve('output/strength-live-2026-11-04'),preview=JSON.parse(await readFile(join(out,'preview.json'),'utf8')),browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});await page.goto(preview.base+'/market-panorama.html#market/strength');
 await page.waitForFunction(()=>{const e=document.querySelector('#strengthChart');return e&&echarts.getInstanceByDom(e)?.getOption()?.series.length===12},{},{timeout:60000});await page.waitForFunction(()=>document.querySelectorAll('.five-minute-side button').length===10,{},{timeout:60000});
 await page.locator('.strength-board').screenshot({path:join(out,'final-board.png'),animations:'disabled'});await page.screenshot({path:join(out,'opening-final-browser.png'),fullPage:true,animations:'disabled'});
 const evidence=await page.locator('#strengthChart').evaluate(e=>{const o=echarts.getInstanceByDom(e).getOption();return {series:o.series.length,allStartAtZero:o.series.every(s=>s.data.find(Number.isFinite)===0),from:o.xAxis[0].data[0],to:o.xAxis[0].data.at(-1)}});await writeFile(join(out,'visual-capture.json'),JSON.stringify({surface:'浏览器原页面，桌面实际点击另见desktop-verification.json',viewport:[1920,1080],density:1,evidence},null,2));console.log(JSON.stringify(evidence));
}finally{await browser.close()}
