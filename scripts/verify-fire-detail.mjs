import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/86199/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const base='http://127.0.0.1:4318',out=resolve('output/playwright/fire-detail-2026-10-10');
const json=path=>fetch(base+path).then(response=>{if(!response.ok)throw Error(path);return response.json()});
const digest=data=>createHash('sha256').update(JSON.stringify(data)).digest('hex');
const normalize=({exportedAt,...data})=>data;
const before=normalize(await json('/api/workbench/backup')),fire=await json('/api/workbench/fire');
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'msedge'}),results=[],errors=[];
try{
 const page=await browser.newPage();page.on('pageerror',error=>errors.push(error.message));
 // All writes are blocked except an in-memory research-card navigation fixture.
 let selection=null;
 await page.route('**/api/**',async route=>{
  const request=route.request(),path=new URL(request.url()).pathname;
  if(request.method()==='GET'){
   if(path==='/api/workbench/summary'&&selection){
    const response=await route.fetch(),summary=await response.json();summary.cards=[selection.card,...summary.cards];
    return route.fulfill({json:summary});
   }
   return route.continue();
  }
  if(path==='/api/workbench/fire/select'&&request.method()==='POST'){
   const input=request.postDataJSON(),row=fire.rows.find(row=>row.code===input.code);
   selection={input,card:{id:'isolated-detail-card',accountId:input.accountId,symbol:row.code,name:row.name,
    contract:row.main_contract,scanMode:input.mode,direction:row.modes[input.mode]==='多头观察'?'long':'short',status:'观察',water:{},fire:{}}};
   return route.fulfill({json:selection.card});
  }
  throw Error('验收禁止正式业务写入：'+path);
 });
 await page.goto(base+'/?view=fire');await page.locator('[data-fire-detail="MA"]').first().waitFor();
 for(const mode of ['month-week-day','month-week','week-day']){
  await page.locator(`[data-mode="${mode}"]`).click();
  const row=fire.rows.find(row=>row.code==='MA'&&['多头观察','空头观察'].includes(row.modes?.[mode]))||fire.rows.find(row=>['多头观察','空头观察'].includes(row.modes?.[mode]));
  await page.locator(`[data-fire-detail="${row.code}"]`).first().click();
  await page.locator('#contractChart svg, #contractChart .empty').waitFor({timeout:20000});
  assert.deepEqual(await page.locator('[data-detail-structure] h3').allTextContents(),['周K结构（辅助）','日K结构（辅助）']);
  for(const width of [1440,1024,390]){
   await page.setViewportSize({width,height:960});
   const layout=await page.locator('#modal').evaluate(dialog=>({
    overflow:dialog.scrollWidth-dialog.clientWidth,bodyOverflow:document.documentElement.scrollWidth-innerWidth,
    blocks:[...dialog.querySelectorAll('[data-detail-structure]')].map(node=>({period:node.dataset.detailStructure,left:node.getBoundingClientRect().left,top:node.getBoundingClientRect().top})),
    values:[...dialog.querySelectorAll('.fire-structure')].map(node=>node.textContent),
    candles:dialog.querySelectorAll('[data-candle]').length
   }));
   assert.ok(layout.overflow<=1&&layout.bodyOverflow<=1,'详情不应水平溢出');
   if(width===390)assert.ok(layout.blocks[1].top>layout.blocks[0].top,'窄屏结构上下排列');
   else assert.equal(layout.blocks[0].top,layout.blocks[1].top,'桌面结构左右排列');
   await page.screenshot({path:resolve(out,`${mode}-${width}.png`)});results.push({mode,code:row.code,contract:row.main_contract,width,...layout});
  }
  await page.locator('#modalClose').click();await page.setViewportSize({width:1440,height:960});
 }
 await page.locator('[data-mode="month-week-day"]').click();await page.locator('[data-fire-detail="MA"]').first().click();
 await page.locator('#detailResearch').click();await page.locator('#waterForm').waitFor();
 assert.equal(selection.input.code,'MA');assert.equal(selection.input.mode,'month-week-day');
 assert.match(await page.locator('#waterForm').textContent(),/MA2701|变化|反证/);
 assert.equal(await page.locator('#modal').evaluate(node=>node.open),false);
 await page.screenshot({path:resolve(out,'进入水研究-隔离卡.png')});
 assert.deepEqual(errors,[]);
 const after=normalize(await json('/api/workbench/backup'));assert.deepEqual(after,before,'正式账户和交易记录必须保持不变');
 const proof={results,navigation:{code:selection.input.code,mode:selection.input.mode,isolated:true,aiStarted:false},pageErrors:errors,productionUnchanged:true,backupHash:digest(after)};
 await writeFile(resolve(out,'浏览器验收.json'),JSON.stringify(proof,null,2));console.log(JSON.stringify({cases:results.length,navigation:proof.navigation,productionUnchanged:true}));
}finally{await browser.close()}
