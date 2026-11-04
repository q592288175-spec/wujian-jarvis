import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {DatabaseSync,backup} from 'node:sqlite';
import {spawn} from 'node:child_process';
const project=resolve('.'),out=resolve('output/jiaoyixingqiu-fees-2026-11-04'),root=resolve('.runtime/test-fee-source-'+Date.now());await mkdir(root,{recursive:true});
for(const [src,dst] of [['.runtime/five-workbench.sqlite','business.sqlite'],['.runtime/market-panorama/market.sqlite','panorama/market.sqlite']]){await mkdir(join(root,dst,'..'),{recursive:true});const db=new DatabaseSync(src,{readOnly:true});await backup(db,join(root,dst));db.close()}
const port=4376,base='http://127.0.0.1:'+port;
const env={...process.env,PORT:String(port),WUJIAN_WORKBENCH_DB:join(root,'business.sqlite'),WUJIAN_OPERATION_DIR:join(root,'操作记录'),WUJIAN_MONITOR_DB:join(root,'monitor.sqlite'),WUJIAN_MONITOR_HOME:join(root,'monitor'),WUJIAN_PANORAMA_DIR:join(root,'panorama'),WUJIAN_TREND_HOME:root,WUJIAN_SKIP_EOD_SCHEDULE:'1',WUJIAN_PANORAMA_AUTOSYNC:'0'};
for(const k of Object.keys(env))if(/TQ_|FEISHU_|DEEPSEEK_|OPENAI_|VOLC_|ARK_|JIN10/.test(k)||k==='ELECTRON_RUN_AS_NODE')delete env[k];
const child=spawn(process.execPath,[join(project,'server.mjs')],{cwd:project,env,windowsHide:true,stdio:['ignore','pipe','pipe']});let log='';child.stdout.on('data',s=>log+=s);child.stderr.on('data',s=>log+=s);
for(let i=0;i<150;i++){try{if((await fetch(base+'/api/health').then(r=>r.json())).projectRoot===project)break}catch{}if(i===149)throw Error(log);await new Promise(r=>setTimeout(r,200))}
await writeFile(join(out,'preview.json'),JSON.stringify({root,port,base,pid:child.pid},null,2));console.log('手续费独立验收服务 '+base);
process.on('SIGTERM',()=>child.kill());process.on('SIGINT',()=>child.kill());child.on('exit',async()=>{await writeFile(join(out,'preview.log'),log);process.exit(0)});