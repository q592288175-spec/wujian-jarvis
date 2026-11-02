import {chromium} from './redesign-harness.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
const out='output/unified-workbench-2026-10-25';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'E:/AppCache/Playwright/chromium-1228/chrome-win64/chrome.exe'});
const findings=[];
try{const page=await browser.newPage({viewport:{width:1500,height:980}});
 for(const [name,path]of [['before-market','/market-panorama.html#home'],['before-fire','/?view=fire']]){
  await page.goto('http://127.0.0.1:4318'+path);await page.waitForTimeout(2500);await page.screenshot({path:out+'/'+name+'.png'});
  findings.push(await page.evaluate(name=>({name,title:document.title,font:getComputedStyle(document.body).fontFamily,fontVariable:getComputedStyle(document.documentElement).getPropertyValue('--font'),bells:[...document.querySelectorAll('.monitor-icon')].slice(0,3).map(x=>({filter:getComputedStyle(x).filter,background:getComputedStyle(x.parentElement).backgroundColor})),nav:document.querySelector('#mainNav,#navigation')?.innerText}),name));
 }
 await writeFile(out+'/baseline-ui.json',JSON.stringify(findings,null,2));console.log(JSON.stringify(findings));
}finally{await browser.close()}
