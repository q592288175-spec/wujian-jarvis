import {openHarness} from './redesign-harness.mjs';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
const h=await openHarness(process.argv[2]||'visual-review'),results=[];
try{
 const page=await h.browser.newPage({viewport:{width:1440,height:900}});
 const cases=process.argv.includes('--fire-only')?[['stable-fire','/?view=fire']]:[['stable-fire','/?view=fire'],['stable-metal','/?view=metal'],['stable-water','/?view=water'],['panorama-overview','/market-panorama.html#overview'],['panorama-funds','/market-panorama.html#funds'],['holo','/cockpit.html']];
 for(const [name,path] of cases){await page.goto(h.base+path);await page.waitForTimeout(2200);if(name.startsWith('panorama')&&['funds','positions'].some(x=>name.includes(x)))await page.waitForSelector('.detail-identity');await page.screenshot({path:join(h.out,name+'.png')});results.push({name,...await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,main:document.querySelector('main')?.getBoundingClientRect().toJSON(),background:getComputedStyle(document.body).backgroundColor,text:getComputedStyle(document.body).color,nav:getComputedStyle(document.querySelector('.sidebar,.side-nav')||document.body).backgroundColor,bodyText:document.body.innerText.slice(0,400)}))})}
 await writeFile(join(h.out,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results));
}finally{await h.close()}
