import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile,copyFile,readdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {DatabaseSync,backup} from 'node:sqlite';
import {spawn} from 'node:child_process';
import net from 'node:net';
import {planFixture} from '../tests/helpers/plan-fixture.mjs';
import {databaseManifest} from './system-backup.mjs';
import {orderedRows} from '../dist/market-panorama-clarity.js';
import {strengthSectors,strengthSectorFor,rankTrendStrength} from '../dist/market-panorama-strength.js';
import {groups} from '../integrations/market-panorama.mjs';
import {chromium,_electron} from 'file:///C:/Users/86199/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const project=resolve('.'),out=resolve('output/panorama-nine-page-clarity-20261024');await mkdir(out,{recursive:true});
const before=databaseManifest('.runtime/five-workbench.sqlite'),root=planFixture(project);
for(const [source,target] of [['.runtime/five-workbench.sqlite','business.sqlite'],['.runtime/market-panorama/market.sqlite','panorama/market.sqlite']]){await mkdir(join(root,target,'..'),{recursive:true});const db=new DatabaseSync(source,{readOnly:true});await backup(db,join(root,target));db.close()}
const scanFolder='.runtime/fire-scan/.wujian-futures-multi-cycle-scan',scanFile=(await readdir(scanFolder)).filter(s=>/^\d{4}-\d{2}-\d{2}\.json$/.test(s)).sort().at(-1);
await copyFile(join(scanFolder,scanFile),join(root,'.runtime/fire-scan/.wujian-futures-multi-cycle-scan/test.json'));await copyFile('.runtime/market.json',join(root,'.runtime/market.json'));
const listener=net.createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));const port=listener.address().port;await new Promise(r=>listener.close(r));const base='http://127.0.0.1:'+port;
const env={...process.env,PORT:String(port),WUJIAN_WORKBENCH_DB:join(root,'business.sqlite'),WUJIAN_BUNDLE_ROOT:resolve('../资料包'),WUJIAN_OPERATION_DIR:join(root,'操作记录'),WUJIAN_MONITOR_DB:join(root,'monitor.sqlite'),WUJIAN_MONITOR_HOME:join(root,'monitor'),WUJIAN_PANORAMA_DIR:join(root,'panorama'),WUJIAN_SKIP_EOD_SCHEDULE:'1',WUJIAN_PANORAMA_AUTOSYNC:'0',WUJIAN_DESKTOP_PORT:String(port),WUJIAN_DESKTOP_PROFILE:join(root,'profile')};
for(const k of Object.keys(env))if(/TQ_|FEISHU_|DEEPSEEK_|OPENAI_|VOLC_|ARK_|JIN10/.test(k)||k==='ELECTRON_RUN_AS_NODE')delete env[k];
const service=spawn(process.execPath,[join(project,'server.mjs')],{cwd:root,env,windowsHide:true,stdio:['ignore','pipe','pipe']});let log='';service.stdout.on('data',s=>log+=s);service.stderr.on('data',s=>log+=s);
let browser,app;const errors=[],checks=[],screens=[];
const colorRatio=(a,b)=>{const lum=c=>{const v=c.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return v[0]*.2126+v[1]*.7152+v[2]*.0722};const x=lum(a),y=lum(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
const chart=async(page,id)=>page.locator('#'+id).evaluate(e=>{const o=echarts.getInstanceByDom(e).getOption();return {series:o.series.map(s=>({name:s.name,data:s.data,color:s.itemStyle?.color,line:s.lineStyle})),dates:o.xAxis[0].data,unit:o.yAxis[0].name}});
const codes=async(page,id)=>page.locator('#'+id+' tbody tr[data-product-code]').evaluateAll(es=>es.map(e=>e.dataset.productCode));
const click=async(page,selector)=>{await page.locator(selector).waitFor({state:'visible'});await page.locator(selector).click()};
const nav=async(page,id)=>{await click(page,`[data-nav="${id}"]`);await page.waitForFunction(id=>document.body.dataset.page===id,id);if(['funds','positions','variety'].includes(id))await page.waitForSelector('.detail-identity');};
const capture=async(page,name)=>{await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:join(out,name+'.png')});screens.push(name+'.png')};
try{
 for(let i=0;i<150;i++){try{const h=await fetch(base+'/api/health').then(r=>r.json());if(h.projectRoot===project)break}catch{}if(i===149)throw Error(log);await new Promise(r=>setTimeout(r,100))}
 const snap=await fetch(base+'/api/market-panorama/snapshot').then(r=>r.json()),detail=await fetch(base+'/api/market-panorama/variety?product=MA').then(r=>r.json());assert.equal(snap.products.length,87);
 browser=await chromium.launch({headless:true,executablePath:'E:/AppCache/Playwright/chromium-1228/chrome-win64/chrome.exe'});const page=await browser.newPage({viewport:{width:1920,height:1080}});page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/market-panorama.html?product=MA#funds');await page.waitForSelector('#fundChart canvas');await click(page,'#autoToggle');
 for(const view of ['funds','positions','fees','variety']){
  await nav(page,view);assert.equal(await page.locator('#scope option[value="all"]').count(),1);assert.equal(await page.locator('#sectorFilter').isVisible(),false);assert.equal(await page.locator('.product-selector .picker-row').count(),2);
  const boards=await page.locator('[data-picker-sector]').evaluateAll(es=>es.map(e=>e.dataset.pickerSector));assert.deepEqual(boards,['all',...strengthSectors]);
  await click(page,'[data-picker-sector="贵金属"]');await click(page,view==='fees'?'[data-fee-product="AU"]':'[data-pick="AU"]');
  if(view==='fees'){const feeCodes=await codes(page,'feeTable');assert.ok(feeCodes.length&&feeCodes.every(c=>c==='AU'))}else{await page.waitForFunction(()=>document.querySelector('.detail-identity')?.textContent.includes('AU 黄金'))}
  const visible=await page.locator('.picker-products [data-pick],.picker-products [data-fee-product]').evaluateAll(es=>es.map(e=>e.dataset.pick||e.dataset.feeProduct));assert.ok(visible.every(c=>['all','AU','AG','PT','PD'].includes(c)));
  await click(page,'[data-picker-sector="化工"]');await click(page,view==='fees'?'[data-fee-product="MA"]':'[data-pick="MA"]');if(view!=='fees')await page.waitForFunction(()=>document.querySelector('.detail-identity')?.textContent.includes('MA 甲醇'));
  await capture(page,view+'-1920');await page.locator('.product-selector').screenshot({path:join(out,view+'-selector.png')});
  checks.push({page:view,twoRowSelector:true,scopeAllFuturesRetained:true,sectorAndProductSelection:true});
 }
 await page.locator('#scope').selectOption('financial');await page.waitForTimeout(200);assert.ok((await page.locator('[data-pick]').evaluateAll(es=>es.map(e=>e.dataset.pick))).every(c=>['IF','IH','IC','IM','T','TF','TS','TL'].includes(c)));await page.locator('#scope').selectOption('all');await page.waitForTimeout(200);await click(page,'[data-picker-sector="化工"]');await click(page,'[data-pick="MA"]');await page.waitForFunction(()=>document.querySelector('.detail-identity')?.textContent.includes('MA 甲醇'));checks.push({scopeFinancialAndAllActuallyClicked:true});
 await nav(page,'funds');await page.waitForSelector('[data-member]');
 const members=await page.locator('[data-member]').evaluateAll(es=>es.map(e=>e.dataset.member));assert.ok(members.length>13);
 assert.equal((await chart(page,'fundChart')).series.length,12);assert.match(await page.locator('#seatChartStatus').innerText(),/默认展示 12/);
 const selected=members.slice(0,13);for(const m of selected)await page.getByRole('button',{name:m,exact:true}).click();
 let c=await chart(page,'fundChart');assert.equal(c.series.length,13);assert.deepEqual(new Set(c.series.map(s=>s.name)),new Set(selected));assert.match(await page.locator('#seatChartStatus').innerText(),/已选 13/);
 assert.equal(new Set(c.series.map(s=>JSON.stringify([s.color,s.line.type]))).size,13);
 await capture(page,'funds-13-members');
 await click(page,'[data-fund-view="commodity"]');c=await chart(page,'fundChart');assert.equal(c.series.length,1);
 const expected=detail.seatHistory.map(h=>{const vals=h.pairs.filter(p=>selected.includes(p.member)&&p.amount!==null).map(p=>p.amount);return vals.length?vals.reduce((a,b)=>a+b,0)/1e8:null});assert.deepEqual(c.series[0].data,expected);
 await click(page,'[data-rank-group="机构"]');assert.ok(await page.locator('[data-member]').count()>0);checks.push({fundsDefault12Labeled:true,explicit13Complete:true,commodityTotalsFollowSelected:true,institutionAliasesLoaded:true});
 await nav(page,'positions');await click(page,'[data-rank-group="all"]');for(const m of selected)await page.getByRole('button',{name:m,exact:true}).click();
 for(const tab of ['net','delta','cumulative','ranking']){await click(page,`[data-position-tab="${tab}"]`);if(tab==='ranking')assert.ok(await page.locator('tbody tr').count()>0);else assert.equal((await chart(page,'positionChart')).series.length,13)}
 await capture(page,'positions-ranking');await click(page,'[data-position-tab="delta"]');await page.locator('#positionChart').screenshot({path:join(out,'positions-change-chart.png')});checks.push({positionFourTabs:true,explicit13Complete:true});
 await nav(page,'home');const expectedGainers=orderedRows(snap.products.filter(p=>p.changePct!==null),'changePct').slice(0,8).map(p=>p.code);assert.deepEqual(await codes(page,'homeGainers'),expectedGainers);
 const changesBefore=await codes(page,'homeChanges');await click(page,'#homeGainers [data-sort="changePct"]');await click(page,'#homeGainers [data-sort="changePct"]');assert.deepEqual(await codes(page,'homeChanges'),changesBefore);
 const ids=await page.locator('table').evaluateAll(es=>es.map(e=>e.id));assert.equal(new Set(ids).size,ids.length);checks.push({homeMetricOrder:true,tableSortIndependent:true,tableIdsUnique:true});
 for(const view of ['home','overview','strength','rankings','seat-flow']){await nav(page,view);if(view==='strength')await page.waitForFunction(()=>!document.querySelector('#comparisonStatus')?.textContent.includes('正在读取'));await capture(page,view+'-1920')}
 await nav(page,'overview');assert.equal(await page.locator('.cycle-stat').count(),5);assert.equal(await page.locator('[data-cycle-sector-row]').count(),11);await click(page,'[data-overview-sector="能源"]');assert.match(await page.locator('.cycle-panel h3').last().innerText(),/能源/);await click(page,'[data-cycle-info]');assert.ok(await page.locator('#detailDialog[open]').count());await click(page,'#detailDialog [data-close]');await click(page,'[data-signal="MA"][data-period-key="day"]');await page.waitForSelector('#detailDialog[open]');assert.match(await page.locator('#detailBody').innerText(),/MA10/);await click(page,'#detailDialog [data-close]');checks.push({cycleFivePeriodsAndElevenSectors:true,sectorLinkAndSignalEvidence:true});
 await nav(page,'strength');const beforeSelection=await page.locator('[data-compare].active').count();await click(page,'[data-compare-all]');assert.equal(await page.locator('[data-compare].active').count(),await page.locator('[data-compare]').count());await click(page,'[data-compare-all]');assert.equal(await page.locator('[data-compare].active').count(),0);await page.locator('[data-compare]').first().click();await click(page,'[data-compare-clear]');assert.equal(await page.locator('[data-compare].active').count(),0);assert.ok(beforeSelection>=0);checks.push({strengthSelectAllAndCancel:true});
 await nav(page,'rankings');for(const mode of ['delta','amountChange','amount','commodity']){await click(page,`[data-rank="${mode}"]`);assert.ok(await page.locator('#rankingTable tbody [data-product-code]').count()>0)}await click(page,'[data-rank="delta"]');await click(page,'#rankingTable [data-seats="MA"]');await page.waitForSelector('#detailDialog[open]');await click(page,'#detailDialog [data-close]');checks.push({rankingFourModesAndDetails:true});
 await nav(page,'fees');await click(page,'[data-picker-sector="all"]');await click(page,'[data-fee-product="all"]');let feeText=await page.locator('#feeTable').innerText();assert.match(feeText,/未取得/);await page.locator('#closeType').selectOption('previous');await page.locator('#mainOnly').uncheck();assert.ok((await codes(page,'feeTable')).length>61);await click(page,'[data-fee-type="high"]');assert.ok((await codes(page,'feeTable')).length>0);await page.locator('.fee-source summary').first().click();assert.match(await page.locator('.fee-source[open]').innerText(),/OpenCTP/);await page.locator('#mainOnly').check();await click(page,'[data-fee-type="all"]');checks.push({feeFiltersAndSourceDetail:true,missingPricesExplicit:true});
 await nav(page,'seat-flow');const flow={};for(const [id,label] of [['all','全部'],['共振多','共振多'],['共振空','共振空'],['分歧','分歧'],['不足','数据不足']]){await click(page,`[data-side="${id}"]`);flow[label]=await page.locator('#seatFlowTable tbody [data-product-code]').count()}
 const legacyGroups=name=>Object.entries(groups).filter(([,names])=>names.some(n=>name===n||name===n+'期货'||name.replace(/期货$/,'')===n.replace(/期货$/,''))).map(([k])=>k);
 const groupedCount=fn=>snap.products.reduce((sum,p)=>sum+p.pairs.filter(pair=>fn(pair.member).length).length,0);
 checks.push({seatFilters:flow,recognizedRowsBefore:groupedCount(legacyGroups),recognizedRowsAfter:snap.products.reduce((sum,p)=>sum+p.pairs.filter(pair=>pair.groups.length).length,0),rawSeatRows:snap.products.reduce((sum,p)=>sum+p.pairs.length,0)});
 await click(page,'[data-side="all"]');await page.locator('#search').fill('AUDIT-NONEXISTENT');await page.waitForFunction(()=>document.querySelector('#content .empty')?.textContent.includes('没有可用数据'));await click(page,'#resetFilters');
 await page.route('**/api/market-panorama/snapshot?**',r=>r.fulfill({status:503,contentType:'application/json',body:'{"error":"验收模拟读取失败"}'}));await page.locator('#date').fill('2026-10-22');await page.locator('#date').dispatchEvent('change');await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('读取失败'));assert.ok(await page.locator('#seatFlowTable').isVisible());await page.unroute('**/api/market-panorama/snapshot?**');checks.push({emptyState:true,failedReadKeepsPriorData:true});
 await page.locator('#date').fill('2026-10-22');await page.locator('#date').dispatchEvent('change');await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('页面更新')&&!document.querySelector('#status')?.textContent.includes('读取失败'));checks.push({historicalDateRead:true});
 await page.locator('#date').fill(snap.selectedDate);await page.locator('#date').dispatchEvent('change');await page.waitForFunction(d=>document.querySelector('#date')?.value===d&&document.querySelector('#status')?.textContent.includes('席位 2026-10-23'),snap.selectedDate);
 await nav(page,'funds');await click(page,'[data-picker-sector="化工"]');await click(page,'[data-pick="MA"]');await page.waitForFunction(()=>document.querySelector('.detail-identity')?.textContent.includes('MA 甲醇'));
 const samples=await page.evaluate(()=>{
 const background=e=>{for(let n=e;n;n=n.parentElement){const bg=getComputedStyle(n).backgroundColor;if(bg!=='rgba(0, 0, 0, 0)'&&bg!=='transparent')return bg}return 'rgb(255, 255, 255)'};
 return ['th','.section-head small','.ranking-sector-tag','td .long','td .short','.detail-identity small'].map(selector=>{const e=document.querySelector(selector);if(!e)return null;const c=getComputedStyle(e);return{selector,color:c.color,background:background(e),font:c.fontSize}}).filter(Boolean);
 });
 for(const s of samples){s.contrast=colorRatio(s.color,s.background);assert.ok(s.contrast>=4.5,s.selector+' '+s.contrast);assert.ok(parseFloat(s.font)>=12)}checks.push({contrast:samples});
 for(const size of [{width:1920,height:1080},{width:1440,height:900},{width:1366,height:768}]){
  await page.setViewportSize(size);for(const view of ['home','overview','strength','rankings','funds','positions','fees','variety','seat-flow']){await nav(page,view);if(view==='fees'){await click(page,'[data-picker-sector="化工"]');await click(page,'[data-fee-product="all"]')}assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,view+size.width);await capture(page,view+'-'+size.width)}
  checks.push({width:size.width,ninePagesNoDocumentOverflow:true});
 }
 await page.setViewportSize({width:1366,height:768});const cdp=await page.context().newCDPSession(page);await cdp.send('Emulation.setDeviceMetricsOverride',{width:1093,height:614,deviceScaleFactor:1.25,mobile:false});await nav(page,'funds');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await capture(page,'funds-125percent');await cdp.send('Emulation.clearDeviceMetricsOverride');checks.push({zoom125Percent:true});
 app=await _electron.launch({executablePath:resolve('.runtime/desktop-panorama-clarity-20261024/小木-win32-x64/小木.exe'),env,timeout:45000});const native=await app.firstWindow();await native.waitForSelector('#accountSelect option',{state:'attached',timeout:45000});await native.goto(base+'/market-panorama.html?product=MA#funds');await native.waitForSelector('#fundChart canvas');await native.locator('[data-fund-view="commodity"]').click();await native.screenshot({path:join(out,'desktop-funds.png')});await nav(native,'positions');await click(native,'[data-position-tab="ranking"]');await native.screenshot({path:join(out,'desktop-positions.png')});await app.close();app=null;checks.push({newDesktopBuiltStartedClicked:true});
 assert.deepEqual(errors,[]);assert.deepEqual(databaseManifest('.runtime/five-workbench.sqlite'),before);
 const result={passed:true,at:new Date().toISOString(),source:'本机真实行情和业务库的一致性副本；无外部刷新',sample:{products:snap.products.length,prices:snap.counts.priced,seats:snap.counts.seated,date:snap.dates[0]},checks,errors,screens:[...new Set(screens)],businessUnchanged:true};await writeFile(join(out,'verification.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}catch(e){await writeFile(join(out,'failure.json'),JSON.stringify({error:e.message,stack:e.stack,errors,checks,log:log.slice(-1500)},null,2));throw e}
finally{await app?.close().catch(()=>{});await browser?.close();service.kill('SIGTERM')}
