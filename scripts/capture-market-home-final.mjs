import {_electron} from 'file:///C:/Users/86199/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import assert from 'node:assert/strict';
const out=resolve('output/market-overview-2026-10-30'),preview=JSON.parse(await readFile(join(out,'preview.json'),'utf8'));
const env={...process.env,WUJIAN_DESKTOP_PORT:String(preview.port),WUJIAN_DESKTOP_PROFILE:join(preview.root,'final-visual-profile')};delete env.ELECTRON_RUN_AS_NODE;
const app=await _electron.launch({executablePath:resolve('.runtime/desktop-market-overview-20261030/小木-win32-x64/小木.exe'),env});
try{const page=await app.firstWindow();await page.waitForSelector('#accountSelect option',{state:'attached'});await page.goto(preview.base+'/market-panorama.html#market/home');await page.waitForSelector('#homeHeatmap canvas');const checks=[];
 for(const width of [1100,1920]){await page.setViewportSize({width,height:1080});await page.waitForTimeout(250);const metrics=await page.locator('.home-overview').evaluate(e=>({columns:getComputedStyle(e).gridTemplateColumns,overflow:document.documentElement.scrollWidth>innerWidth}));assert.equal(metrics.overflow,false);assert.equal(metrics.columns.split(' ').length,width<1200?1:2);await page.locator('.home-overview').screenshot({path:join(out,'final-'+width+'.png')});checks.push({width,...metrics})}
 await writeFile(join(out,'final-visual-check.json'),JSON.stringify({passed:true,checks},null,2));console.log('最终两种窗口尺寸验收通过');
}finally{await app.close()}
