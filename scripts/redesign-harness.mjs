import {mkdir,readFile,writeFile,copyFile,readdir,cp} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {DatabaseSync,backup} from 'node:sqlite';
import {spawn} from 'node:child_process';
import net from 'node:net';
import {planFixture} from '../tests/helpers/plan-fixture.mjs';
import {databaseManifest} from './system-backup.mjs';
import {homedir} from 'node:os';
import {pathToFileURL} from 'node:url';
const playwrightModule=process.env.WUJIAN_PLAYWRIGHT_MODULE||join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const {chromium,_electron}=await import(pathToFileURL(playwrightModule).href);
export {chromium,_electron};
export const project=resolve('.'),redesignOutput=resolve('output/redesign-2026-10-25');
export async function openHarness(stage,{businessName='business.sqlite',envOverrides={}}={}){
 const out=join(redesignOutput,stage);await mkdir(out,{recursive:true});
 const fixtureFile=join(redesignOutput,'fixture.json');let root;
 if(existsSync(fixtureFile)){root=JSON.parse(await readFile(fixtureFile,'utf8')).root}
 else{
  root=planFixture(project);
  for(const [source,target] of [['.runtime/five-workbench.sqlite','business.sqlite'],['.runtime/market-panorama/market.sqlite','panorama/market.sqlite']]){await mkdir(join(root,target,'..'),{recursive:true});const db=new DatabaseSync(source,{readOnly:true});await backup(db,join(root,target));db.close()}
  const scanFolder='.runtime/fire-scan/.wujian-futures-multi-cycle-scan',scanFile=(await readdir(scanFolder)).filter(n=>/^\d{4}-\d{2}-\d{2}\.json$/.test(n)).sort().at(-1);
  await copyFile(join(scanFolder,scanFile),join(root,'.runtime/fire-scan/.wujian-futures-multi-cycle-scan/test.json'));await copyFile('.runtime/market.json',join(root,'.runtime/market.json'));
  for(const folder of ['.runtime/fire-scan/contract-bars','.runtime/environment','.runtime/contract-specs'])if(existsSync(folder))await cp(folder,join(root,folder),{recursive:true});
  await writeFile(fixtureFile,JSON.stringify({root,scanFile,created:new Date().toISOString()},null,2));
  await writeFile(join(redesignOutput,'baseline/business-manifest.json'),JSON.stringify(databaseManifest('.runtime/five-workbench.sqlite'),null,2));
 }
 const listener=net.createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));const port=listener.address().port;await new Promise(r=>listener.close(r));const base='http://127.0.0.1:'+port;
 if(businessName!=='business.sqlite'){const source=new DatabaseSync(join(root,'business.sqlite'),{readOnly:true});await backup(source,join(root,businessName));source.close()}
 const env={...process.env,PORT:String(port),WUJIAN_WORKBENCH_DB:join(root,businessName),WUJIAN_BUNDLE_ROOT:resolve('../资料包'),WUJIAN_OPERATION_DIR:join(root,'操作记录'),WUJIAN_MONITOR_DB:join(root,'monitor.sqlite'),WUJIAN_MONITOR_HOME:join(root,'monitor'),WUJIAN_PANORAMA_DIR:join(root,'panorama'),WUJIAN_SKIP_EOD_SCHEDULE:'1',WUJIAN_PANORAMA_AUTOSYNC:'0',WUJIAN_DESKTOP_PORT:String(port),WUJIAN_DESKTOP_PROFILE:join(root,'profile')};
 for(const k of Object.keys(env))if(/TQ_|FEISHU_|DEEPSEEK_|OPENAI_|VOLC_|ARK_|JIN10/.test(k)||k==='ELECTRON_RUN_AS_NODE')delete env[k];
 Object.assign(env,envOverrides);
 const service=spawn(process.execPath,[join(project,'server.mjs')],{cwd:root,env,windowsHide:true,stdio:['ignore','pipe','pipe']});let log='';service.stdout.on('data',s=>log+=s);service.stderr.on('data',s=>log+=s);
 for(let i=0;i<150;i++){try{const h=await fetch(base+'/api/health').then(r=>r.json());if(h.projectRoot===project)break}catch{}if(i===149){service.kill();throw Error(log)}await new Promise(r=>setTimeout(r,100))}
 const browser=await chromium.launch({headless:true,executablePath:process.env.WUJIAN_CHROMIUM||'E:/AppCache/Playwright/chromium-1228/chrome-win64/chrome.exe',args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 return {root,out,base,env,browser,async close(){await browser.close();service.kill('SIGTERM');await writeFile(join(out,'service-log.txt'),log)}};
}
