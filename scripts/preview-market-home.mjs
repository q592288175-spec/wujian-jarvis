import {mkdir,writeFile,copyFile,readdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {DatabaseSync,backup} from 'node:sqlite';
import {spawn} from 'node:child_process';
import {planFixture} from '../tests/helpers/plan-fixture.mjs';
const project=resolve('.'),out=resolve('output/market-overview-2026-10-30'),root=planFixture(project);
await mkdir(out,{recursive:true});
for(const [source,target] of [['.runtime/five-workbench.sqlite','business.sqlite'],['.runtime/market-panorama/market.sqlite','panorama/market.sqlite']]){
 await mkdir(join(root,target,'..'),{recursive:true});const db=new DatabaseSync(source,{readOnly:true});await backup(db,join(root,target));db.close();
}
const scanFolder='.runtime/fire-scan/.wujian-futures-multi-cycle-scan',scanFile=(await readdir(scanFolder)).filter(s=>/^\d{4}-\d{2}-\d{2}\.json$/.test(s)).sort().at(-1);
await copyFile(join(scanFolder,scanFile),join(root,'.runtime/fire-scan/.wujian-futures-multi-cycle-scan/test.json'));await copyFile('.runtime/market.json',join(root,'.runtime/market.json'));
const port=4368,base='http://127.0.0.1:'+port;
const env={...process.env,PORT:String(port),WUJIAN_WORKBENCH_DB:join(root,'business.sqlite'),WUJIAN_BUNDLE_ROOT:resolve('../资料包'),WUJIAN_OPERATION_DIR:join(root,'操作记录'),WUJIAN_MONITOR_DB:join(root,'monitor.sqlite'),WUJIAN_MONITOR_HOME:join(root,'monitor'),WUJIAN_PANORAMA_DIR:join(root,'panorama'),WUJIAN_SKIP_EOD_SCHEDULE:'1',WUJIAN_PANORAMA_AUTOSYNC:'0',WUJIAN_DESKTOP_PORT:String(port),WUJIAN_DESKTOP_PROFILE:join(root,'profile')};
for(const k of Object.keys(env))if(/TQ_|FEISHU_|DEEPSEEK_|OPENAI_|VOLC_|ARK_|JIN10/.test(k)||k==='ELECTRON_RUN_AS_NODE')delete env[k];
const service=spawn(process.execPath,[join(project,'server.mjs')],{cwd:root,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
let log='';service.stdout.on('data',s=>log+=s);service.stderr.on('data',s=>log+=s);
for(let i=0;i<150;i++){try{const h=await fetch(base+'/api/health').then(r=>r.json());if(h.projectRoot===project)break}catch{}if(i===149)throw Error(log);await new Promise(r=>setTimeout(r,200))}
await writeFile(join(out,'preview.json'),JSON.stringify({base,port,root,pid:service.pid},null,2));
console.log('预览服务已就绪 '+base+'/market-panorama.html#market/home');
const stop=()=>service.kill('SIGTERM');process.on('SIGTERM',stop);process.on('SIGINT',stop);
service.on('exit',async()=>{await writeFile(join(out,'preview-server.log'),log);process.exit(0)});
