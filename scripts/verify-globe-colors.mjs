import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {GLOBE_PALETTE} from '../dist/globe-palette.js';

const runtime='C:/Users/86199/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const {chromium}=await import(pathToFileURL(runtime+'/playwright/index.mjs').href);
const {PNG}=(await import(pathToFileURL(runtime+'/pngjs/lib/png.js').href)).default;
const base='http://127.0.0.1:4318',out=resolve('output/playwright/globe-colors-2026-10-10');
const browser=await chromium.connectOverCDP('http://127.0.0.1:9229');
const context=browser.contexts()[0],page=context.pages().find(page=>page.url().startsWith(base));
assert.ok(page,'需要正式小木APP的验收窗口');
const json=async path=>(await fetch(base+path)).json();
const business=({exportedAt,...rest})=>createHash('sha256').update(JSON.stringify(rest)).digest('hex');
const before=business(await json('/api/workbench/backup'));
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('console',message=>{if(message.type()==='error')errors.push(message.text())});
const report={at:new Date().toISOString(),interaction:'正式Windows APP / Playwright / CDP',palette:GLOBE_PALETTE,sectors:[],viewports:[]};

function hue(r,g,b){
 const max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;
 if(max<75||d/max<.32)return null;
 return ((max===r?(g-b)/d:max===g?(b-r)/d+2:(r-g)/d+4)*60+360)%360;
}
const hexHue=hex=>hue(...[1,3,5].map(index=>parseInt(hex.slice(index,index+2),16)));
const targets=GLOBE_PALETTE.map(item=>hexHue(item.hex));
function pixels(buffer){
 const png=PNG.sync.read(buffer),bins=targets.map(()=>0);
 for(let i=0;i<png.data.length;i+=4){
  const h=hue(png.data[i],png.data[i+1],png.data[i+2]);if(h===null)continue;
  const distances=targets.map(target=>Math.min(Math.abs(target-h),360-Math.abs(target-h)));
  bins[distances.indexOf(Math.min(...distances))]++;
 }
 return {width:png.width,height:png.height,chromatic:bins.reduce((a,b)=>a+b,0),bins};
}
function difference(a,b){
 const x=PNG.sync.read(a),y=PNG.sync.read(b);assert.equal(x.width,y.width);assert.equal(x.height,y.height);let changed=0;
 for(let i=0;i<x.data.length;i+=4)if(Math.abs(x.data[i]-y.data[i])+Math.abs(x.data[i+1]-y.data[i+1])+Math.abs(x.data[i+2]-y.data[i+2])>15)changed++;
 return changed;
}
async function shot(name,canvasOnly=false){
 const buffer=canvasOnly?await page.locator('#globeScene canvas').screenshot():await page.screenshot();
 await writeFile(resolve(out,name+'.png'),buffer);return buffer;
}
async function selection(){return page.locator('#globeScene').evaluate(host=>({selected:host.dataset.selectedSector,paletteSector:host.dataset.paletteSector,mode:host.dataset.paletteMode,ready:host.dataset.renderReady}))}
async function clickSector(key){
 await page.locator(`[data-sector="${key}"]`).click();
 await page.waitForFunction(key=>document.querySelector('#globeScene').dataset.selectedSector===key,key);
 await page.waitForTimeout(1300);
}

try{
 await mkdir(out,{recursive:true});
 assert.equal(resolve((await json('/api/health')).projectRoot),process.cwd());
 await page.setViewportSize({width:1500,height:980});
 await page.goto(base+'/cockpit.html');
 await page.locator('[data-sector="all"]').waitFor();
 await page.waitForFunction(()=>document.querySelector('#globeScene').dataset.renderReady==='true');
 await page.locator('#globeScene').scrollIntoViewIfNeeded();
 const first=await shot('01-全部板块七彩',true);
 const all=pixels(first);assert.ok(all.chromatic>800,'地球必须有非空彩色像素');
 assert.ok(all.bins.every(n=>n>10),'七种色相应在球面或环上可见：'+JSON.stringify(all.bins));
 await page.waitForTimeout(1500);
 const second=await page.locator('#globeScene canvas').screenshot();
 report.all={...all,selection:await selection(),movingPixels:difference(first,second)};
 assert.ok(report.all.movingPixels>100,'正常模式应持续旋转并渐变');
 await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(100);
 for(const [index,item] of GLOBE_PALETTE.entries()){
  await clickSector(item.key);const state=await selection();assert.equal(state.paletteSector,item.key);assert.equal(state.mode,'sector');
  const buffer=await shot('板块-'+item.key,true),actual=pixels(buffer);
  assert.ok(actual.chromatic>800);assert.ok(actual.bins[index]/actual.chromatic>.65,'板块主体色未同步：'+JSON.stringify({key:item.key,...actual}));
  const swatch=await page.locator(`[data-sector="${item.key}"] .sector-swatch`).evaluate(node=>getComputedStyle(node).backgroundColor);
  report.sectors.push({key:item.key,swatch,...state,...actual});
 }
 await page.evaluate(()=>document.body.dataset.voiceState='speaking');
 await page.waitForTimeout(150);assert.equal((await selection()).paletteSector,'agriculture');
 const voiceColors=pixels(await page.locator('#globeScene canvas').screenshot());
 assert.ok(voiceColors.bins[6]/voiceColors.chromatic>.65,'语音不能覆盖板块配色');
 await page.evaluate(()=>delete document.body.dataset.voiceState);
 await clickSector('shipping');report.shipping=await selection();assert.equal(report.shipping.paletteSector,'agriculture');
 await clickSector('all');assert.equal((await selection()).mode,'rainbow');
 await clickSector('shipping');assert.equal((await selection()).mode,'rainbow');
 await clickSector('all');
 const frozen=await page.locator('#globeScene canvas').screenshot();await page.waitForTimeout(500);
 report.reducedMotion={changedPixels:difference(frozen,await page.locator('#globeScene canvas').screenshot())};
 assert.equal(report.reducedMotion.changedPixels,0,'减少动画模式不应自动转动或流动');
 const canvas=page.locator('#globeScene canvas'),box=await canvas.boundingBox();
 await page.mouse.move(box.x+box.width*.45,box.y+box.height*.42);await page.mouse.down();
 await page.mouse.move(box.x+box.width*.64,box.y+box.height*.42,{steps:8});await page.mouse.up();
 report.drag={changedPixels:difference(frozen,await canvas.screenshot())};assert.ok(report.drag.changedPixels>100,'减少动画模式仍允许人工拖动');
 for(const width of [1500,1100,390,320]){
  await page.setViewportSize({width,height:980});await page.waitForTimeout(250);
  await page.locator('#globeScene').scrollIntoViewIfNeeded();
  const layout=await page.evaluate(()=>{
   const canvas=document.querySelector('#globeScene canvas').getBoundingClientRect(),label=document.querySelector('.globe-center-label').getBoundingClientRect(),nav=document.querySelector('#sectorNav').getBoundingClientRect();
   const fits=[...document.querySelectorAll('.sector-button>b')].every(node=>node.scrollWidth<=node.clientWidth);
   return {width:innerWidth,canvas:{width:canvas.width,height:canvas.height},overflow:document.documentElement.scrollWidth>innerWidth,labelsFit:fits,labelOverlapsNavigation:label.bottom>nav.top,buttons:document.querySelectorAll('[data-sector]').length};
  });
  const stats=pixels(await shot('全部板块-'+width,true));
  assert.ok(layout.canvas.width>=250&&layout.canvas.height>=250&&!layout.overflow&&layout.labelsFit&&!layout.labelOverlapsNavigation);
  assert.equal(layout.buttons,9);assert.ok(stats.chromatic>800&&stats.bins.every(n=>n>10));
  await shot('全息页面-'+width);report.viewports.push({...layout,...stats});
 }
 report.businessUnchanged=business(await json('/api/workbench/backup'))===before;
 assert.ok(report.businessUnchanged,'验收不应改变账户、交易卡或流水');
 report.errors=errors;assert.deepEqual(errors,[]);
 report.passed=true;
 await writeFile(resolve(out,'验收.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify({passed:true,sectors:report.sectors.length,viewports:report.viewports.length,movingPixels:report.all.movingPixels,dragPixels:report.drag.changedPixels,businessUnchanged:report.businessUnchanged,out}));
}finally{
 await page.emulateMedia({reducedMotion:'no-preference'}).catch(()=>{});
 await page.setViewportSize({width:1500,height:980}).catch(()=>{});
 await page.evaluate(()=>window.scrollTo(0,0)).catch(()=>{});
 await browser.close();
}
