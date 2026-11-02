import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fireColumns,fireStructure} from '../dist/fire-display.js';
import {chromium} from 'file:///C:/Users/86199/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const base='http://127.0.0.1:4318',out=resolve('output/playwright/structure-condition-colors-2026-10-10');
const json=path=>fetch(base+path).then(response=>{if(!response.ok)throw Error(path);return response.json()});
const normalize=({exportedAt,...data})=>data;
const before=normalize(await json('/api/workbench/backup')),fire=await json('/api/workbench/fire');
const colors={'long-strong':'rgb(255, 101, 107)','long-partial':'rgb(237, 160, 90)','short-strong':'rgb(53, 201, 121)','short-partial':'rgb(138, 203, 255)','long-none':'rgb(237, 243, 239)','short-none':'rgb(237, 243, 239)',neutral:'rgb(237, 243, 239)'};
const results=[],errors=[];
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'msedge'});
try{
 const page=await browser.newPage({viewport:{width:1440,height:960}});
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/api/**',route=>{
  if(route.request().method()==='GET')return route.continue();
  throw Error('配色验收禁止正式业务写入：'+route.request().url());
 });
 async function check(locator,expected,context){
  const actual=await locator.evaluateAll(nodes=>nodes.map(node=>({tone:[...node.classList].find(name=>name!=='fire-structure'),label:node.querySelector('span').textContent,color:getComputedStyle(node.querySelector('span')).color,valueColor:getComputedStyle(node.querySelector('small,b')).color,background:getComputedStyle(node).backgroundColor})));
  assert.equal(actual.length,expected.length,JSON.stringify(context));
  actual.forEach((item,i)=>{
   assert.equal(item.tone,expected[i].tone);
   assert.equal(item.label,expected[i].label);
   assert.equal(item.color,colors[item.tone]);
   assert.equal(item.valueColor,colors[item.tone]);
   if(item.tone.endsWith('none')||item.tone==='neutral')assert.equal(item.background,'rgba(0, 0, 0, 0)');
  });
  results.push({...context,items:actual});
 }
 await page.goto(base+'/?view=fire');
 await page.locator('[data-fire-detail="Y"]').first().waitFor();
 for(const mode of ['month-week-day','month-week','week-day']){
  await page.locator(`[data-mode="${mode}"]`).click();
  const periods=fireColumns(mode).structures.map(item=>item.period);
  for(const row of fire.rows.filter(row=>['多头观察','空头观察'].includes(row.modes?.[mode]))){
   const tr=page.locator('tr').filter({has:page.locator(`[data-fire-detail="${row.code}"]`)});
   await check(tr.locator('.fire-structure'),periods.flatMap(period=>fireStructure(row,mode,period)),{view:'稳定版列表',mode,code:row.code});
  }
 }
 await page.locator('[data-mode="month-week-day"]').click();
 for(const code of ['Y','NR','NI','LC','CU','MA','SH']){
  const row=fire.rows.find(row=>row.code===code);
  await page.locator(`[data-fire-detail="${code}"]`).first().click();
  await check(page.locator('#modal .fire-structure'),['week','day'].flatMap(period=>fireStructure(row,'month-week-day',period)),{view:'稳定版详情',mode:'month-week-day',code});
  if(['Y','LC'].includes(code)){
   await page.locator('#contractChart svg, #contractChart .empty').waitFor({timeout:20000});
   for(const width of [1440,390]){
    await page.setViewportSize({width,height:960});
    assert.ok(await page.locator('#modal').evaluate(node=>node.scrollWidth-node.clientWidth<=1));
    await page.screenshot({path:resolve(out,`${code}-详情-${width}.png`)});
   }
  }
  await page.locator('#modalClose').click();await page.setViewportSize({width:1440,height:960});
 }
 await page.goto(base+'/cockpit.html');await page.locator('[data-code="Y"]').waitFor();
 for(const mode of ['month-week-day','month-week']){
  await page.locator(`[data-pool="${mode}"]`).click();
  const codes=await page.locator('#opportunityList [data-code]').evaluateAll(nodes=>nodes.map(node=>node.dataset.code));
  for(const code of codes){
   await page.locator(`#opportunityList [data-code="${code}"]`).click();
   const row=fire.rows.find(row=>row.code===code),periods=mode==='month-week-day'?['week','day']:['week'];
   await check(page.locator('#detailBody .fire-structure'),periods.flatMap(period=>fireStructure(row,mode,period)),{view:'全息版详情',mode,code});
   if(mode==='month-week-day'&&['Y','LC'].includes(code))await page.locator('.structure-block').screenshot({path:resolve(out,`${code}-全息结构.png`)});
  }
 }
 assert.deepEqual(errors,[]);
 assert.deepEqual(normalize(await json('/api/workbench/backup')),before);
 await writeFile(resolve(out,'浏览器验收.json'),JSON.stringify({dataDate:fire.data_date,results,pageErrors:errors,productionUnchanged:true},null,2));
 console.log(JSON.stringify({cases:results.length,structureItems:results.reduce((sum,item)=>sum+item.items.length,0),productionUnchanged:true,pageErrors:errors}));
}finally{await browser.close()}
