import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {DatabaseSync,backup} from 'node:sqlite';
import {spawn} from 'node:child_process';
const project=resolve('.'),out=resolve('output/weixin-rebind-2026-11-03'),root=resolve('.runtime/test-weixin-rebind-'+Date.now());
await mkdir(out,{recursive:true});await mkdir(root,{recursive:true});
for(const [source,target] of [['.runtime/five-workbench.sqlite','business.sqlite'],['.runtime/market-panorama/market.sqlite','panorama/market.sqlite']]){await mkdir(join(root,target,'..'),{recursive:true});const db=new DatabaseSync(source,{readOnly:true});await backup(db,join(root,target));db.close()}
const port=4374,base='http://127.0.0.1:'+port;
const env={...process.env,PORT:String(port),WUJIAN_WORKBENCH_DB:join(root,'business.sqlite'),WUJIAN_OPERATION_DIR:join(root,'操作记录'),WUJIAN_MONITOR_DB:join(root,'monitor.sqlite'),WUJIAN_MONITOR_HOME:join(root,'monitor'),WUJIAN_PANORAMA_DIR:join(root,'panorama'),WUJIAN_TREND_HOME:root,WUJIAN_SKIP_EOD_SCHEDULE:'1',WUJIAN_PANORAMA_AUTOSYNC:'0',WUJIAN_DESKTOP_PORT:String(port),WUJIAN_DESKTOP_PROFILE:join(root,'profile')};
for(const k of Object.keys(env))if(/TQ_|FEISHU_|DEEPSEEK_|OPENAI_|VOLC_|ARK_|JIN10/.test(k)||k==='ELECTRON_RUN_AS_NODE')delete env[k];
const service=spawn(process.execPath,[join(project,'server.mjs')],{cwd:project,env,windowsHide:true,stdio:['ignore','pipe','pipe']});let log='';service.stdout.on('data',s=>log+=s);service.stderr.on('data',s=>log+=s);
for(let i=0;i<150;i++){try{const h=await fetch(base+'/api/health').then(r=>r.json());if(h.projectRoot===project)break}catch{}if(i===149)throw Error(log);await new Promise(r=>setTimeout(r,200))}
await writeFile(join(out,'preview.json'),JSON.stringify({base,port,root,pid:service.pid},null,2));console.log('独立验收服务已就绪 '+base+'/#market/monitor');
const stop=()=>service.kill('SIGTERM');process.on('SIGINT',stop);process.on('SIGTERM',stop);service.on('exit',async()=>{await writeFile(join(out,'preview-server.log'),log);process.exit(0)});
