import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {resolve,join,extname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {createOperationArchive} from '../integrations/operation-archive.mjs';
import {contractSpec} from '../integrations/contract-specs.mjs';
import {checkTradeMarket} from '../integrations/trade-market-check.mjs';

await mkdir(resolve('.runtime/test-trade-ui'),{recursive:true});
const root=await mkdtemp(resolve('.runtime/test-trade-ui/run-'));
process.env.WUJIAN_WORKBENCH_DB=join(root,'business.sqlite');
const w=await import('../integrations/five-workbench.mjs');
const a=w.saveAccount({alias:'隔离验收账户',mode:'real',equity:1100000,tier:'normal'});
const card=w.saveCard({symbol:'SH',name:'烧碱',direction:'short',contract:'SH2611',accountId:a.id});
const other=w.saveCard({symbol:'SH',name:'烧碱',direction:'short',contract:'SH2612',accountId:a.id});
const db=new DatabaseSync(process.env.WUJIAN_WORKBENCH_DB),stamp=new Date().toISOString();
db.prepare('INSERT INTO plan_versions VALUES(?,?,?,?,?,?,?,?,?)').run(randomUUID(),card.id,1,JSON.stringify({direction:'short',entry:1200,stop:1240,mainCycle:'day',riskPercent:1}),JSON.stringify({lots:9}),'已批准','isolated-ui',stamp,stamp);
db.prepare("UPDATE cards SET active_plan_version=1,status='已批准' WHERE id=?").run(card.id);
const archive=createOperationArchive(join(root,'操作记录'),w.operationArchiveData);await archive.sync();
let failReview=false;const mutations=[];
// A loopback-only fixture server uses the actual database services, never the production database.
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost'),path=url.pathname,method=req.method;
 const json=(value,status=200)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value))};
 try{
  if(path.startsWith('/api/')){
   let body={};if(method==='POST'){const chunks=[];for await(const x of req)chunks.push(x);body=JSON.parse(Buffer.concat(chunks).toString()||'{}');mutations.push(path)}
   if(path==='/api/knowledge/status')return json({status:'ready',sources:0,chunks:0});
   if(path==='/api/workbench/rules')return json(await w.ruleRegistry());
   if(path==='/api/workbench/governance')return json(w.systemGovernance());
   if(path==='/api/workbench/governance/start')return json(await w.beginSystemRun());
   if(path==='/api/workbench/governance/finish')return json(w.endSystemRun(body.result));
   if(path==='/api/workbench/governance/issues')return json(w.recordIssue(body));
   if(path==='/api/workbench/summary')return json({account:w.listAccounts().find(x=>x.id===a.id),accounts:w.listAccounts(),cards:w.listCards({accountId:a.id}),ruleVersion:'隔离验收',marketDate:'2026-09-30'});
   if(path==='/api/workbench/operation-files')return json(archive.status());
   if(path==='/api/workbench/contract-spec')return json(contractSpec(url.searchParams.get('symbol')));
   const match=path.match(/^\/api\/workbench\/cards\/([^/]+)(?:\/([^/]+))?$/);
   if(match){const [,id,action]=match;
    if(method==='GET'&&!action)return json(w.fullCard(id));
    if(action==='environment')return json({hash:'ui',cycle:'day',dataDate:'2026-09-30',layers:{}});
    if(action==='market-check')return json(checkTradeMarket(w.fullCard(id).trade,[],contractSpec('SH')));
    if(method==='POST'){
     if(action==='reviews'&&failReview)return json({error:'隔离测试：暂时离线'},503);
     let result;
     if(action==='draft')result=w.saveExecutionDraft(id,body);
     else if(action==='trade')result=w.recordTrade(id,body);
     else if(action==='reviews')result=w.saveReview(id,body);
     else throw Error('Unexpected mutation '+path);
     await archive.sync();return json(result);
    }
   }
   throw Error('Unexpected API '+path);
  }
  const file=resolve('dist','.'+(path==='/'?'/index.html':path));
  if(!file.startsWith(resolve('dist')))throw Error('Invalid path');
  const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'};
  const content=await readFile(file);res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream'});res.end(content);
 }catch(error){json({error:error.message},400)}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;
const {chromium}=await import(pathToFileURL('C:/Users/86199/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href);
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const page=await browser.newPage({viewport:{width:1500,height:1100}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
const out=resolve('output/playwright');await mkdir(out,{recursive:true});
const fill=(name,value)=>page.locator('[name="'+name+'"]').fill(String(value));
const view=name=>page.locator('#mainNav [data-view="'+name+'"]').click();
try{
 await page.goto(base+'/?view=earth&card='+card.id);await page.waitForSelector('#executionForm');
 assert.equal(await page.locator('#executionDirection').inputValue(),'开空');
 assert.equal(await page.locator('#executionDirection').getAttribute('readonly'),'');
 await fill('time','2026-10-02T09:00');await fill('priceNumber',1200);await fill('notes','按趋势入场，止损1240');
 await page.waitForFunction(()=>document.querySelector('#executionSaveState')?.textContent.includes('草稿已保存'));
 assert.equal(w.fullCard(card.id).executions.length,0);await page.reload();await page.waitForSelector('#executionForm');
 assert.equal(await page.locator('[name=notes]').inputValue(),'按趋势入场，止损1240');
 await page.locator('#saveExecution').click();
 await page.waitForFunction(()=>document.querySelector('#executionDirection')?.value==='平空');
 assert.equal(w.fullCard(card.id).trade.remainingLots,9);
 await fill('time','2026-10-02T14:00');await fill('priceNumber',1160);await fill('netPnlNumber',10000);
 await page.locator('[name=reason]').selectOption('止盈');await fill('notes','本次止盈，成本已计入');
 await page.locator('#saveExecution').click();
 await page.waitForFunction(()=>document.querySelector('.trade-result')?.textContent.includes('1,110,000'));
 assert.equal(w.listAccounts().find(x=>x.id===a.id).equity,1110000);
 await page.screenshot({path:join(out,'trade-execution-desktop.png'),fullPage:true});
 await view('wood');await page.waitForSelector('#reviewForm');
 assert.equal(await page.locator('#reviewForm textarea').count(),3);
 await fill('good','顺势，严格执行保护');await fill('bad','退出犹豫');await fill('next','先冻结计划，再确认执行');
 await page.waitForFunction(()=>document.querySelector('#reviewSaveState')?.textContent==='已自动保存');
 assert.ok((await readFile(join(root,'操作记录/小木操作记录.md'),'utf8')).includes('先冻结计划，再确认执行'));
 await page.locator('#startSystemRun').click();await page.waitForSelector('#finishSystemRun');
 assert.ok((await page.locator('#governancePanel').textContent()).includes('本轮框架已锁定'));
 await fill('description','隔离验收：研究交接待补');await fill('nextAction','核对来源');await page.locator('#issueForm button').click();
 await page.waitForFunction(()=>document.querySelector('#content')?.textContent.includes('隔离验收：研究交接待补'));
 await page.waitForSelector('[data-resolve-issue]');
 while(await page.locator('[data-resolve-issue]').count()){
  const id=await page.locator('[data-resolve-issue]').first().getAttribute('data-resolve-issue');page.once('dialog',d=>d.accept('隔离验收已核对'));
  await page.locator('[data-resolve-issue]').first().click();await page.waitForFunction(id=>!document.querySelector('[data-resolve-issue="'+id+'"]'),id);
 }
 for(const width of [1500,1100,390]){
  await page.setViewportSize({width,height:1100});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:join(out,'trade-review-'+width+'.png'),fullPage:true});
 }
 await page.setViewportSize({width:1500,height:1100});
 failReview=true;await fill('next','先冻结计划，再确认执行；离线内容保留');
 await page.waitForFunction(()=>document.querySelector('#reviewSaveState')?.textContent.includes('未同步'));
 failReview=false;await page.goto(base+'/?view=wood&card='+card.id);
 await page.waitForFunction(()=>document.querySelector('#reviewSaveState')?.textContent==='已自动保存');
 assert.ok(w.reviewForCard(card.id)[0].payload.next.includes('离线内容保留'));
 await view('metal');await page.locator('[data-card="'+other.id+'"]').click();
 await page.waitForFunction(()=>document.querySelector('#pointValue')?.value==='30');
 assert.equal(await page.locator('[name=accountEquityNumber]').inputValue(),'1110000');
 await fill('entryNumber',1200);await fill('stopNumber',1240);
 assert.equal(await page.locator('#lossBudget').inputValue(),'11,100');assert.equal(await page.locator('#sizingLots').inputValue(),'9');
 await page.goto(base+'/print.html?type=review&id='+card.id);await page.waitForSelector('#paper h1');
 assert.ok((await page.locator('#paper').textContent()).includes('顺势，严格执行保护'));
 assert.deepEqual(errors,[]);
 const result={passed:true,root,mutations,errors,coverage:['自动开平方向','执行草稿重载','实际盈亏入账','下一计划读取新余额','三问自动保存','离线恢复','记录文件同步','打印复盘','1500/1100/390视窗']};
 await writeFile(join(out,'trade-records-ui.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));db.close()}
