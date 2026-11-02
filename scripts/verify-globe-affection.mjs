import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL('C:/Users/86199/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href);
const output=resolve('output/playwright/globe-affection-2026-10-12');await mkdir(output,{recursive:true});
try{
 const browser=await chromium.connectOverCDP('http://127.0.0.1:9229');
 const page=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().startsWith('http://127.0.0.1:4318/'));assert.ok(page);
 const cdp=await page.context().newCDPSession(page),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:4318/cockpit.html');
 await page.waitForSelector('.globe-affection');
 await page.waitForFunction(()=>{const canvas=document.querySelector('#globeScene canvas');return canvas&&getComputedStyle(canvas).visibility==='visible'});
 await page.locator('[data-sector=new-energy]').click();
 const checks=[];
 for(const width of [1500,1100,390]){
  await cdp.send('Emulation.setDeviceMetricsOverride',{width,height:980,deviceScaleFactor:1,mobile:width<600});
  await page.waitForTimeout(180);
  const check=await page.evaluate(()=>{
   const node=document.querySelector('.globe-affection'),box=node.getBoundingClientRect(),stage=node.parentElement.getBoundingClientRect(),label=document.querySelector('.globe-center-label').getBoundingClientRect(),hint=document.querySelector('#sceneHint').getBoundingClientRect(),style=getComputedStyle(node);
   const overlaps=r=>box.left<r.right&&box.right>r.left&&box.top<r.bottom&&box.bottom>r.top;
   return{width:innerWidth,text:node.textContent,color:style.color,font:style.fontFamily,inside:box.left>=stage.left&&box.right<=stage.right&&box.top>=stage.top&&box.bottom<=stage.bottom,labelOverlap:overlaps(label),hintOverlap:overlaps(hint),pointerEvents:style.pointerEvents};
  });
  assert.equal(check.text,'爱你');assert.equal(check.inside,true);assert.equal(check.labelOverlap,false);assert.equal(check.hintOverlap,false);assert.equal(check.pointerEvents,'none');checks.push(check);
  await page.locator('.globe-stage').screenshot({path:join(output,'globe-'+width+'.png')});
 }
 await cdp.send('DOM.enable');await cdp.send('CSS.enable');
 const {root}=await cdp.send('DOM.getDocument');const {nodeId}=await cdp.send('DOM.querySelector',{nodeId:root.nodeId,selector:'.globe-affection'});
 const {fonts}=await cdp.send('CSS.getPlatformFontsForNode',{nodeId});assert.ok(fonts.some(f=>/Kai|楷/i.test(f.familyName)));assert.deepEqual(errors,[]);
 assert.deepEqual(await readFile('.runtime/desktop-affection-build/小木-win32-x64/resources/app.asar'),await readFile('.runtime/desktop-build/小木-win32-x64/resources/app.asar'));
 await cdp.send('Emulation.clearDeviceMetricsOverride');
 await writeFile(join(output,'verification.json'),JSON.stringify({passed:true,checks,fonts,errors,rebuiltDesktopMatchesRunningBuild:true},null,2));console.log(JSON.stringify({passed:true,fonts,checks}));process.exit(0);
}catch(error){console.error(error);process.exit(1)}
