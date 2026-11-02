import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile,cp,copyFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {PNG} from 'pngjs';
import {DatabaseSync,backup} from 'node:sqlite';
import {spawn} from 'node:child_process';
import net from 'node:net';
import {planFixture} from '../tests/helpers/plan-fixture.mjs';
const {_electron}=await import(pathToFileURL('C:/Users/86199/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href);
const out=resolve('output/cockpit-fit-20261021');
await mkdir(out,{recursive:true});
const project=resolve('.'),root=planFixture(project);
const source=new DatabaseSync('.runtime/five-workbench.sqlite',{readOnly:true});
await backup(source,join(root,'business.sqlite'));source.close();
const fire=await fetch('http://127.0.0.1:4318/api/workbench/fire').then(r=>r.json());
await writeFile(join(root,'.runtime/fire-scan/.wujian-futures-multi-cycle-scan/test.json'),JSON.stringify(fire));
await cp('.runtime/fire-scan/contract-bars',join(root,'.runtime/fire-scan/contract-bars'),{recursive:true});
await copyFile('.runtime/market.json',join(root,'.runtime/market.json'));
await copyFile('.runtime/environment/commodity-index.json',join(root,'.runtime/environment/commodity-index.json'));
const listener=net.createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));
const port=listener.address().port;await new Promise(r=>listener.close(r));
const base=`http://127.0.0.1:${port}`;
const env={...process.env,PORT:String(port),WUJIAN_DESKTOP_PORT:String(port),WUJIAN_WORKBENCH_DB:join(root,'business.sqlite'),WUJIAN_BUNDLE_ROOT:resolve('../资料包'),WUJIAN_OPERATION_DIR:join(root,'操作记录'),WUJIAN_MONITOR_DB:join(root,'monitor.sqlite'),WUJIAN_MONITOR_HOME:join(root,'monitor'),WUJIAN_DESKTOP_PROFILE:join(root,'profile'),WUJIAN_SKIP_EOD_SCHEDULE:'1'};
for(const key of Object.keys(env))if(/TQ_|FEISHU_|DEEPSEEK_|OPENAI_|VOLC_|ARK_|JIN10/.test(key)||key==='ELECTRON_RUN_AS_NODE')delete env[key];
let app,service;
try{
 service=spawn(process.execPath,[join(project,'server.mjs')],{cwd:root,env,windowsHide:true,stdio:'ignore'});
 for(let i=0;i<100;i++){
  try{const health=await fetch(base+'/api/health').then(r=>r.json());assert.equal(health.projectRoot,project);break}
  catch(error){if(i===99)throw error;await new Promise(r=>setTimeout(r,100))}
 }
 app=await _electron.launch({executablePath:resolve('.runtime/desktop-cockpit-fit-20261021/小木-win32-x64/小木.exe'),env,timeout:45000});
 const page=await app.firstWindow();
 await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.webContents.setBackgroundThrottling(false);w.show()});
 await page.waitForSelector('#accountSelect option',{state:'attached',timeout:45000});
 await page.goto(new URL('/cockpit.html',page.url()).href);
 await page.waitForSelector('.opportunity-item');
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 page.on('console',message=>{if(message.type()==='error')console.log('browser:',message.text())});
 const checks=[],scenes=[];
 const originalTheme=await readFile('.runtime/checkpoints/cockpit-fit-20261021/workbench-theme.css','utf8');
 const originalGrid=await readFile('.runtime/checkpoints/cockpit-fit-20261021/cockpit-grid.css','utf8');
 for(const [width,height] of [[1920,1080],[1480,850],[1366,768],[1280,720],[390,844]]){
  await page.setViewportSize({width,height});
  await page.route('**/workbench-theme.css*',route=>route.fulfill({body:originalTheme,contentType:'text/css'}));
  await page.route('**/cockpit-grid.css*',route=>route.fulfill({body:originalGrid,contentType:'text/css'}));
  await page.reload();
  await page.waitForSelector('.opportunity-item');
  const before=await page.evaluate(()=>({globeHeight:document.querySelector('.globe-stage').clientHeight,itemHeight:document.querySelector('.opportunity-item').getBoundingClientRect().height}));
  await page.unroute('**/workbench-theme.css*');
  await page.unroute('**/cockpit-grid.css*');
  await page.reload();
  await page.bringToFront();
  await page.waitForSelector('.opportunity-item');
  await page.waitForFunction(()=>document.querySelector('#globeScene').dataset.renderReady==='true',{},{timeout:20000});
  const viewport=await page.evaluate(()=>({
   pageHeight:document.documentElement.scrollHeight,height:innerHeight,
   footerBottom:document.querySelector('.control-strip').getBoundingClientRect().bottom,
   globeHeight:document.querySelector('.globe-stage').clientHeight,
   itemHeight:document.querySelector('.opportunity-item').getBoundingClientRect().height,
   sectorBottom:document.querySelector('#sectorNav').getBoundingClientRect().bottom,
   mapBottom:document.querySelector('.market-map').getBoundingClientRect().bottom
  }));
  if(width>1120){
   assert.ok(viewport.pageHeight<=height+1,'桌面整页不能纵向滚动');
   assert.ok(viewport.footerBottom<=height,'底栏必须完整可见');
   assert.ok(viewport.sectorBottom<viewport.mapBottom,'板块不可裁切');
   assert.ok(viewport.globeHeight>before.globeHeight,'地球可用区域应恢复放大');
  }
  assert.ok(viewport.itemHeight<before.itemHeight,'候选项应该更紧凑');
  scenes.push({width,height,before,after:viewport});
  const bounds=()=>page.evaluate(()=>['.cockpit-main','.market-map','.detail-panel','.opportunity-panel'].map(s=>{const r=document.querySelector(s).getBoundingClientRect();return [s,r.x,r.y,r.width,r.height]}));
  const current=await bounds();
  await page.evaluate(()=>document.querySelector('link[href*="cockpit-grid.css"]').disabled=true);
  const original=await bounds();
  await page.evaluate(()=>document.querySelector('link[href*="cockpit-grid.css"]').disabled=false);
  if(width>1120)assert.deepEqual(current,original,'原三栏位置和大小必须保持');
  for(const mode of ['month-week-day','day-trend']){
   await page.locator(`[data-pool="${mode}"]`).click();
   await page.locator('[data-side="all"]').click();
   const all=await page.locator('.opportunity-item').evaluateAll(nodes=>nodes.map(n=>({code:n.dataset.code,side:n.classList.contains('long')?'long':'short',text:n.innerText})));
   for(const side of ['long','short','all']){
    await page.locator(`[data-side="${side}"]`).click();
    const actual=await page.locator('.opportunity-item').evaluateAll(nodes=>nodes.map(n=>({code:n.dataset.code,side:n.classList.contains('long')?'long':'short',text:n.innerText})));
    assert.deepEqual(actual,all.filter(row=>side==='all'||row.side===side));
    const layout=await page.evaluate(()=>{
     const groups=[...document.querySelectorAll('.opportunity-group')];
     const first=document.querySelector('.opportunity-grid');
     return {overflow:document.documentElement.scrollWidth>innerWidth,columns:first?getComputedStyle(first).gridTemplateColumns.split(' ').length:0,
      ordered:groups.length<2||groups[0].getBoundingClientRect().bottom<=groups[1].getBoundingClientRect().top,
      clipped:[...document.querySelectorAll('.opportunity-item')].some(n=>n.scrollWidth>n.clientWidth)};
    });
    assert.equal(layout.overflow,false);assert.equal(layout.clipped,false);assert.ok(layout.ordered);
    if(actual.length>3)assert.ok(layout.columns>=2);
    checks.push({width,height,mode,side,count:actual.length,...layout});
   }
  }
  await page.locator('[data-pool="month-week-day"]').click();
  await page.evaluate(()=>document.querySelector('#opportunityList').scrollTop=0);
  await page.evaluate(()=>scrollTo(0,0));
  await page.waitForTimeout(150);
  await page.screenshot({path:resolve(out,`pool-${width}.png`),fullPage:width<=1120});
  const canvas=page.locator('#globeScene canvas');
  await canvas.scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);
  const first=PNG.sync.read(await canvas.screenshot());
  let colored=0;
  for(let i=0;i<first.data.length;i+=4){const rgb=[...first.data.subarray(i,i+3)];if(Math.max(...rgb)-Math.min(...rgb)>40&&Math.max(...rgb)>80)colored++}
  console.log(JSON.stringify({width,height,colored,scene:scenes.at(-1)}));
  await canvas.screenshot({path:resolve(out,`globe-${width}.png`)});
  assert.ok(colored>1000,'地球画布不能为空');
  const box=await canvas.boundingBox();
  await page.mouse.move(box.x+box.width*.45,box.y+box.height*.5);
  await page.mouse.down();await page.mouse.move(box.x+box.width*.6,box.y+box.height*.5,{steps:8});await page.mouse.up();
  await page.waitForTimeout(200);
  const second=PNG.sync.read(await canvas.screenshot());
  let changed=0;
  for(let i=0;i<first.data.length;i+=4)if(Math.abs(first.data[i]-second.data[i])+Math.abs(first.data[i+1]-second.data[i+1])+Math.abs(first.data[i+2]-second.data[i+2])>30)changed++;
  assert.ok(changed>1000,'地球应可拖动旋转');
  scenes.at(-1).pixels={colored,changed};
 }
 await page.setViewportSize({width:1920,height:1080});
 const name=await page.locator('.opportunity-item b').first().innerText();
 await page.locator('.opportunity-item').first().scrollIntoViewIfNeeded();
 const scrollBefore=await page.evaluate(()=>scrollY);
 await page.locator('.opportunity-item').first().click();
 assert.equal(await page.evaluate(()=>scrollY),scrollBefore,'点击品种不得跳转页面');
 assert.ok((await page.locator('#detailTitle').innerText()).includes(name));
 assert.deepEqual(errors,[]);
 await writeFile(resolve(out,'checks.json'),JSON.stringify({passed:true,checks,scenes,detailClick:name,errors},null,2));
 console.log(JSON.stringify({passed:true,checks:checks.length,detailClick:name}));
}finally{if(app)await app.close();if(service){service.kill();await new Promise(r=>service.exitCode!==null?r():service.once('exit',r))}}
